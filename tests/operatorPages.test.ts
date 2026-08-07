import { describe, expect, it } from 'vitest';
import { runsPage, runDetailPage, provenancePage, type RunGroup } from '../src/server/pages.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { readEvents } from '../src/events/recorder.js';
import {
  getInvocations,
  getMessages,
  getRun,
  runConfig,
  runSummaries,
} from '../src/db/queries.js';
import { computeAnalytics } from '../src/analytics/summary.js';
import { evaluateGates, finalizeReport } from '../src/acceptance/gates.js';
import { frozen, tempDb } from './helpers.js';

async function completedRun() {
  const db = tempDb();
  const config = frozen({
    fault_injection: {
      enabled: true,
      faults: [
        {
          agent_id: 'agent_2',
          state: 'PUBLIC_DISCUSSION',
          occurrence: 1,
          kind: 'timeout',
          recover_after_attempts: 1,
        },
      ],
    },
  });
  const runner = new WorkshopRunner({ db, frozen: config });
  await runner.execute();
  return { db, runId: runner.id };
}

describe('runs list', () => {
  it('groups runs by settings fingerprint rather than listing them flat', async () => {
    const { db, runId } = await completedRun();
    const run = getRun(db, runId)!;
    const groups: RunGroup[] = [
      {
        configHash: run.config_hash,
        experimentId: run.experiment_id,
        model: run.model,
        topic: runConfig(run).workshop.topic,
        runs: [run],
      },
    ];

    const html = runsPage(groups, runSummaries(db, [runId]), ['a.yaml'], null, 1);
    expect(html).toContain('grouped by the fingerprint');
    expect(html).toContain(run.experiment_id);
    expect(html).toContain(runConfig(run).workshop.topic);
    // The identifier is shortened for scanning but still links to the full run.
    expect(html).toContain(`/runs/${runId}`);
  });

  it('shows counts per run so the list can be scanned without opening each one', async () => {
    const { db, runId } = await completedRun();
    const run = getRun(db, runId)!;
    const summaries = runSummaries(db, [runId]);
    const summary = summaries.get(runId)!;

    expect(summary.public_messages).toBeGreaterThan(0);
    expect(summary.private_messages).toBeGreaterThan(0);

    const html = runsPage(
      [
        {
          configHash: run.config_hash,
          experimentId: run.experiment_id,
          model: run.model,
          topic: 'topic',
          runs: [run],
        },
      ],
      summaries,
      [],
      null,
      1,
    );
    expect(html).toContain(`<b>${summary.public_messages}</b> public`);
    expect(html).toContain(`<b>${summary.private_messages}</b> private`);
  });

  it('gives a direction rather than a blank space when there are no runs', () => {
    const html = runsPage([], new Map(), ['a.yaml'], null, 0);
    expect(html).toContain('No runs recorded yet');
    expect(html).toContain('Start run');
  });
});

describe('run page', () => {
  it('leads with the checks, then statistics, timeline and turns', async () => {
    const { db, runId } = await completedRun();
    const run = getRun(db, runId)!;
    const html = runDetailPage({
      run,
      config: runConfig(run),
      events: readEvents(db, runId),
      messages: getMessages(db, runId),
      invocations: getInvocations(db, runId),
      analytics: computeAnalytics(db, runId),
      acceptance: finalizeReport(evaluateGates({ db, runId })),
      isRunning: false,
    });

    expect(html.indexOf('id="checks"')).toBeLessThan(html.indexOf('id="statistics"'));
    expect(html.indexOf('id="statistics"')).toBeLessThan(html.indexOf('id="timeline"'));
    expect(html.indexOf('id="timeline"')).toBeLessThan(html.indexOf('id="turns"'));
  });

  it('lists every turn including failed attempts, each linking to its context', async () => {
    const { db, runId } = await completedRun();
    const run = getRun(db, runId)!;
    const invocations = getInvocations(db, runId);
    const html = runDetailPage({
      run,
      config: runConfig(run),
      events: readEvents(db, runId),
      messages: getMessages(db, runId),
      invocations,
      analytics: computeAnalytics(db, runId),
      acceptance: finalizeReport(evaluateGates({ db, runId })),
      isRunning: false,
    });

    // Every attempt is present, not a truncated sample.
    for (const invocation of invocations) {
      expect(html).toContain(`/runs/${runId}/invocations/${invocation.invocation_id}`);
    }
    const failed = invocations.filter((i) => i.outcome === 'infra_failure');
    expect(failed.length).toBeGreaterThan(0);
    expect(html).toContain('class="failed"');
    expect(html).toContain('timeout');
  });

  it('shows phases in readable form rather than as log constants', async () => {
    const { db, runId } = await completedRun();
    const run = getRun(db, runId)!;
    const html = runDetailPage({
      run,
      config: runConfig(run),
      events: readEvents(db, runId),
      messages: getMessages(db, runId),
      invocations: getInvocations(db, runId),
      analytics: computeAnalytics(db, runId),
      acceptance: finalizeReport(evaluateGates({ db, runId })),
      isRunning: false,
    });
    expect(html).toContain('Open discussion');
    expect(html).toContain('Breakouts');
  });
});

describe('provenance page', () => {
  it('separates the recorded metadata from the material the agent received', async () => {
    const { db, runId } = await completedRun();
    const run = getRun(db, runId)!;
    const invocation = getInvocations(db, runId).find((i) => i.outcome === 'success')!;
    const html = provenancePage(run, invocation);

    expect(html).toContain('prov-side');
    expect(html).toContain('System prompt');
    expect(html).toContain('Generation parameters');
    expect(html).toContain('Source messages');
    expect(html).toContain(`/runs/${runId}#turns`);
  });

  it('reports how many messages were included and how they split by channel', async () => {
    const { db, runId } = await completedRun();
    const run = getRun(db, runId)!;
    const invocation = getInvocations(db, runId).filter((i) => i.outcome === 'success').at(-1)!;
    const ids = JSON.parse(invocation.context_message_ids) as string[];
    const html = provenancePage(run, invocation);
    expect(html).toContain(`${ids.length} in total`);
  });
});
