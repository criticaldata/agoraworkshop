import { describe, expect, it } from 'vitest';
import { WorkshopRunner, classifyContent } from '../src/orchestrator/runner.js';
import { readEvents } from '../src/events/recorder.js';
import { getInvocations, getOpportunities } from '../src/db/queries.js';
import { computeAnalytics } from '../src/analytics/summary.js';
import { frozen, tempDb } from './helpers.js';
import type { AgentInvocationRequest, AgentProvider } from '../src/providers/types.js';
import type { InfrastructureFailure } from '../src/events/types.js';
import { ABSTAIN_TOKEN, PASS_TOKEN } from '../src/prompts/registry.js';

type Script = Array<
  | { kind: 'ok'; text: string }
  | { kind: 'fail'; category: InfrastructureFailure; message: string }
>;

/** Replays a fixed script of provider outcomes so failure handling is deterministic. */
function scriptedProvider(script: Script): AgentProvider {
  let index = 0;
  return {
    name: 'scripted',
    invoke: async (request: AgentInvocationRequest) => {
      const step = script[Math.min(index, script.length - 1)]!;
      index += 1;
      const ts = new Date().toISOString();
      const base = {
        provider: 'scripted',
        requestedModel: request.model.model,
        requestTs: ts,
        responseTs: ts,
        latencyMs: 1,
        raw: {},
      };
      if (step.kind === 'ok') {
        return {
          ...base,
          ok: true as const,
          respondedModel: request.model.model,
          finishReason: 'end_turn',
          content: step.text,
          usage: { inputTokens: 10, outputTokens: 10 },
          failure: null,
        };
      }
      return {
        ...base,
        ok: false as const,
        respondedModel: null,
        finishReason: null,
        content: null,
        usage: { inputTokens: null, outputTokens: null },
        failure: { category: step.category, message: step.message },
      };
    },
  };
}

const singlePhase = {
  topic: 'failure attribution',
  max_duration_seconds: 60,
  rounds: {
    introduction: 1,
    public_discussion: 0,
    private_or_breakout: 0,
    final_discussion: 0,
  },
};

async function runWith(script: Script) {
  const db = tempDb();
  const runner = new WorkshopRunner({
    db,
    frozen: frozen({
      workshop: singlePhase,
      runtime: { timeout_seconds: 5, max_retries: 2, retry_backoff_ms: 0 },
    }),
    provider: scriptedProvider(script),
  });
  await runner.execute();
  return { db, runId: runner.id };
}

describe('output classification', () => {
  it('treats the abstain token as behaviour', () => {
    expect(classifyContent(ABSTAIN_TOKEN)).toEqual({ kind: 'abstain' });
  });

  it('treats the pass token as a deliberate no-op', () => {
    expect(classifyContent(PASS_TOKEN)).toEqual({ kind: 'no_op' });
  });

  it('treats an empty response as malformed infrastructure output, never as abstention', () => {
    expect(classifyContent('')).toEqual({ kind: 'malformed' });
    expect(classifyContent('   \n ')).toEqual({ kind: 'malformed' });
  });

  it('treats ordinary text as a message', () => {
    expect(classifyContent(' hello ')).toEqual({ kind: 'message', text: 'hello' });
  });
});

describe('infrastructure failures are never labelled as abstention', () => {
  const cases: Array<{ name: string; category: InfrastructureFailure }> = [
    { name: 'provider timeout', category: 'timeout' },
    { name: 'rate limit', category: 'rate_limit' },
    { name: 'provider 5xx', category: 'provider_error' },
    { name: 'network failure', category: 'network_error' },
    { name: 'policy refusal', category: 'provider_refusal' },
  ];

  for (const testCase of cases) {
    it(`classifies ${testCase.name} as infrastructure`, async () => {
      const { db, runId } = await runWith([
        { kind: 'fail', category: testCase.category, message: `simulated ${testCase.category}` },
      ]);

      const opportunities = getOpportunities(db, runId);
      expect(opportunities.length).toBeGreaterThan(0);
      for (const opportunity of opportunities) {
        expect(opportunity.resolution).toBe('infrastructure_failure');
        expect(opportunity.failure_category).toBe(testCase.category);
        expect(opportunity.behaviourally_available).toBe(0);
      }

      const events = readEvents(db, runId);
      expect(events.some((e) => e.event_type === testCase.category)).toBe(true);
      expect(events.some((e) => e.event_type === 'explicit_abstention')).toBe(false);
      expect(events.some((e) => e.event_type === 'no_op')).toBe(false);
    });
  }

  it('classifies a malformed (empty) response as infrastructure, not silence', async () => {
    const { db, runId } = await runWith([{ kind: 'ok', text: '' }]);

    for (const opportunity of getOpportunities(db, runId)) {
      expect(opportunity.resolution).toBe('infrastructure_failure');
      expect(opportunity.failure_category).toBe('malformed_response');
    }
    const events = readEvents(db, runId);
    expect(events.some((e) => e.event_type === 'malformed_response')).toBe(true);
    expect(events.some((e) => e.event_type === 'explicit_abstention')).toBe(false);
  });
});

describe('retries', () => {
  it('[ORCH-07] records the failed attempt even when a retry succeeds', async () => {
    const { db, runId } = await runWith([
      { kind: 'fail', category: 'timeout', message: 'simulated timeout' },
      { kind: 'ok', text: 'recovered on the second attempt' },
    ]);

    const events = readEvents(db, runId);
    expect(events.some((e) => e.event_type === 'timeout')).toBe(true);
    expect(events.some((e) => e.event_type === 'retry_scheduled')).toBe(true);
    expect(events.some((e) => e.event_type === 'retry_started')).toBe(true);

    const first = getOpportunities(db, runId)[0]!;
    expect(first.resolution).toBe('success');
    expect(first.attempts).toBe(2);

    const invocations = getInvocations(db, runId).filter(
      (i) => i.opportunity_id === first.opportunity_id,
    );
    expect(invocations.map((i) => i.outcome)).toEqual(['infra_failure', 'success']);
  });

  it('records retry exhaustion with the underlying category preserved', async () => {
    const { db, runId } = await runWith([
      { kind: 'fail', category: 'provider_error', message: 'permanent' },
    ]);

    const events = readEvents(db, runId);
    const exhausted = events.filter((e) => e.event_type === 'retry_exhausted');
    expect(exhausted.length).toBeGreaterThan(0);
    expect(exhausted[0]?.payload['final_failure_category']).toBe('provider_error');

    const opportunity = getOpportunities(db, runId)[0]!;
    expect(opportunity.attempts).toBe(3);
    expect(opportunity.failure_category).toBe('provider_error');
  });
});

describe('analytics never convert infrastructure failure into behaviour', () => {
  it('excludes failed turns from behavioural availability', async () => {
    const db = tempDb();
    // Agent turn 1 succeeds, turn 2 fails permanently, turn 3 explicitly abstains.
    const script: Script = [
      { kind: 'ok', text: 'moderator opens' },
      { kind: 'fail', category: 'timeout', message: 'simulated' },
      { kind: 'fail', category: 'timeout', message: 'simulated' },
      { kind: 'fail', category: 'timeout', message: 'simulated' },
      { kind: 'ok', text: ABSTAIN_TOKEN },
      { kind: 'ok', text: 'a real contribution' },
    ];

    const runner = new WorkshopRunner({
      db,
      frozen: frozen({
        workshop: {
          topic: 'metrics',
          max_duration_seconds: 60,
          rounds: {
            introduction: 1,
            public_discussion: 0,
            private_or_breakout: 0,
            final_discussion: 0,
          },
        },
        participants: [
          { id: 'agent_1', display_name: 'Agent 1' },
          { id: 'agent_2', display_name: 'Agent 2' },
        ],
        channels: {
          public: { enabled: true },
          private: {
            enabled: true,
            moderator_observes_private: false,
            breakout_groups: [{ id: 'g', members: ['agent_1', 'agent_2'] }],
          },
        },
        runtime: { timeout_seconds: 5, max_retries: 2, retry_backoff_ms: 0 },
      }),
      provider: scriptedProvider(script),
    });
    await runner.execute();

    const analytics = computeAnalytics(db, runner.id);
    const agent1 = analytics.per_agent.find((a) => a.agent_id === 'agent_1')!;
    const agent2 = analytics.per_agent.find((a) => a.agent_id === 'agent_2')!;

    expect(agent1.infrastructure_failures).toBe(1);
    expect(agent1.explicit_abstentions).toBe(0);
    expect(agent1.behaviourally_available_opportunities).toBe(0);
    expect(agent1.infrastructure_adjusted_participation).toBeNull();

    expect(agent2.explicit_abstentions).toBe(1);
    expect(agent2.infrastructure_failures).toBe(0);
    expect(agent2.behaviourally_available_opportunities).toBe(1);
    expect(agent2.infrastructure_adjusted_participation).toBe(0);
  });
});
