import { afterEach, describe, expect, it, vi } from 'vitest';
import { frozen, tempDb } from './helpers.js';
import { campaign, freezeCampaign, planCampaign, runCampaign, starterInput, usage } from '../src/phase1/campaign.js';
import { aggregateBallots, auditCollective, ballotRows, collectiveRecords, parseBallot, saveCollectiveOutput, type BallotRow } from '../src/phase1/collective.js';
import { campaignAnalysis } from '../src/phase1/analysis.js';
import { closureEvidence, recordClosureEvidence } from '../src/phase1/closure.js';
import { campaignBundle } from '../src/phase1/export.js';
import { getMessages, getInvocations, getRun } from '../src/db/queries.js';
import { readEvents } from '../src/events/recorder.js';
import { MockProvider } from '../src/providers/mock.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { freezeConfig } from '../src/config/load.js';
import { positionRows } from '../src/phase1/positions.js';

const input = () => ({ ...starterInput(frozen().config, true), blocks: 1 });
afterEach(() => vi.restoreAllMocks());
async function executed() {
  const db = tempDb(), id = freezeCampaign(db, input());
  await runCampaign(db, id);
  const c = campaign(db, id), runId = c.cases[0]!.run_id!;
  return { db, id, c, runId, config: c.plan.cases[0]!.config };
}

describe('canonical eight-stage protocol', () => {
  it('opts in without modifying legacy frozen inputs', () => {
    const old = planCampaign({ ...starterInput(frozen().config), blocks: 1 });
    expect(old.input.canonical).toBeUndefined();
    expect(old.cases[0]!.config.phase1!.canonical).toBeUndefined();
    expect(old.workload.ballot_attempts).toBeUndefined();
    const next = planCampaign(input());
    expect(next.comparisons[0]!.valid).toBe(true);
    expect(next.workload.ballot_attempts).toBe(10);
    expect(() => planCampaign({ ...input(), evaluation: undefined })).toThrow(/Canonical/);
    const invalid = input(); invalid.base_config.workshop.rounds.introduction = 1;
    expect(() => planCampaign(invalid)).toThrow(/Canonical/);
  });

  it('executes S1–S8 in order, seals ballots, preserves minority structure and excludes S8 from behavior', async () => {
    const { db, id, runId, config, c } = await executed();
    expect(c.row.state).toBe('completed');
    const records = collectiveRecords(db, runId);
    expect(records.stages.map(s => s.record?.stage)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']);
    expect(records.stages.every(s => s.record?.status === 'complete')).toBe(true);
    expect(records.ballots).toHaveLength(5);
    expect(auditCollective(db, config, runId)).toEqual({ complete: true, verified: true, issues: [] });
    expect(records.output!.artifact.decisions.every(d => d.outcome === 'decided' && d.majority_position?.votes === 5)).toBe(true);
    expect(records.output!.artifact.participant_behavior).toBe(false);
    const events = readEvents(db, runId);
    const finalSequence = Math.max(...events.filter(e => e.event_type === 'phase1_position_recorded' && e.payload.phase === 'final').map(e => e.sequence));
    expect(events.filter(e => e.event_type === 'phase1_ballot_recorded').every(e => e.sequence > finalSequence)).toBe(true);
    for (const b of records.ballots) {
      const req = JSON.parse(b.request_json!).request;
      expect(req.messages[0].content).not.toContain('Deterministic measurement fixture');
      expect(req.messages[0].content).not.toContain('"ballots":[' + '{"question_id":"priority');
      expect(req.contextMessageIds).not.toContain(records.ballots[0]!.record_id);
    }
    const messages = getMessages(db, runId);
    expect(messages.filter(m => m.workshop_state === 'PUBLIC_RECONVENING' && m.sender_agent_id !== 'moderator')).toHaveLength(5);
    expect(messages.filter(m => m.workshop_state === 'FINAL_DISCUSSION' && m.sender_agent_id !== 'moderator')).toHaveLength(5);
    expect(getInvocations(db, runId).every(i => !i.rendered_messages.includes('AGORA_SEALED_BALLOT'))).toBe(true);
    expect(usage(db, id).attempts).toBe(70); // 2 × (20 dialogue + 10 positions + 5 ballots)
    const report = campaignAnalysis(db, id);
    expect(report.closure.gates.find(g => g.id === 'P1-A')!.status).toBe('PASS');
    expect(report.closure.gates.find(g => g.id === 'P1-D')!.status).toBe('BLOCKED');
    expect(report.closure.scientific_pass).toBe(false);
    expect(campaignBundle(db, id).artifacts.runs[0]!.records.phase1_ballots).toHaveLength(5);
    expect(saveCollectiveOutput(db, config, runId).inserted).toBe(false);
    db.close();
  });

  it('blocks all S7 calls when any S6 answer is invalid', async () => {
    const original = MockProvider.prototype.invoke;
    const spy = vi.spyOn(MockProvider.prototype, 'invoke').mockImplementation(async function(req) {
      const result = await original.call(this, req);
      if (req.positionProbe && req.contextMessageIds!.length > 0 && req.agentId === 'agent_2') result.content = '{}';
      return result;
    });
    const { db, runId } = await executed();
    expect(spy.mock.calls.some(([r]) => r.ballotProbe)).toBe(false);
    const records = collectiveRecords(db, runId);
    expect(records.ballots).toHaveLength(0);
    expect(records.stages.find(s => s.id === 'S6')!.record!.status).toBe('incomplete');
    expect(records.stages.find(s => s.id === 'S7')!.record!.status).toBe('incomplete');
    expect(records.output!.artifact.decisions.every(d => d.outcome === 'incomplete' && d.decision === null)).toBe(true);
    db.close();
  });

  it('records invalid ballots once, makes no repair and never fabricates a majority from missing voters', async () => {
    const original = MockProvider.prototype.invoke;
    const spy = vi.spyOn(MockProvider.prototype, 'invoke').mockImplementation(async function(req) {
      const result = await original.call(this, req);
      if (req.ballotProbe && req.agentId === 'agent_1') result.content = 'not JSON';
      return result;
    });
    const { db, id, runId } = await executed();
    expect(spy.mock.calls.filter(([r]) => r.ballotProbe && r.agentId === 'agent_1')).toHaveLength(2);
    expect(ballotRows(db, runId).filter(r => r.status === 'invalid')).toHaveLength(1);
    expect(collectiveRecords(db, runId).output!.artifact.decisions.every(d => d.outcome === 'incomplete')).toBe(true);
    expect(campaignAnalysis(db, id).closure.gates[0]!.status).toBe('BLOCKED');
    db.close();
  });

  it('stops all further calls when a ballot response has unknown usage', async () => {
    const config = planCampaign(input()).cases[0]!.config, db = tempDb();
    const provider = new MockProvider(), original = provider.invoke.bind(provider);
    const spy = vi.spyOn(provider, 'invoke').mockImplementation(async req => {
      const result = await original(req);
      if (req.ballotProbe) result.usage.inputTokens = null;
      return result;
    });
    const runner = new WorkshopRunner({ db, frozen: freezeConfig(config), provider });
    expect((await runner.execute()).status).toBe('FAILED');
    expect(spy.mock.calls.filter(([r]) => r.ballotProbe)).toHaveLength(1);
    expect(collectiveRecords(db, runner.id).output).toBeNull();
    db.close();
  });

  it('detects ballot-context and artifact tampering', async () => {
    const { db, config, runId } = await executed();
    const b = ballotRows(db, runId)[0]!, request = JSON.parse(b.request_json!);
    request.request.messages[0].content += '\nOTHER BALLOT: leaked';
    db.prepare('UPDATE phase1_ballots SET request_json = ? WHERE record_id = ?').run(JSON.stringify(request), b.record_id);
    expect(auditCollective(db, config, runId).verified).toBe(false);
    db.prepare("UPDATE phase1_collective_outputs SET artifact_hash = 'wrong' WHERE run_id = ?").run(runId);
    expect(() => saveCollectiveOutput(db, config, runId)).toThrow(/changed after sealing/);
    db.close();
  });

  it('resumes after S8 without repeating ballots, artifacts or provider charges', async () => {
    const raw = input(); raw.base_config.recovery = { enabled: true, checkpoint_every: 'opportunity' };
    const db = tempDb(), id = freezeCampaign(db, raw); await runCampaign(db, id);
    const runId = campaign(db, id).cases[0]!.run_id!;
    const before = ballotRows(db, runId), positions = positionRows(db, runId), ledger = usage(db, id);
    db.prepare("DELETE FROM events WHERE run_id = ? AND event_type IN ('run_completed','state_transition_started','state_transition_completed') AND sequence > (SELECT MAX(sequence) FROM events WHERE run_id = ? AND event_type = 'phase1_collective_output')").run(runId, runId);
    db.prepare("UPDATE runs SET status = 'RUNNING', ended_at = NULL WHERE run_id = ?").run(runId);
    db.prepare("UPDATE phase1_cases SET state = 'running' WHERE run_id = ?").run(runId);
    await runCampaign(db, id, { resumeInterrupted: true });
    expect(getRun(db, runId)!.status).toBe('COMPLETED');
    expect(ballotRows(db, runId)).toEqual(before);
    expect(positionRows(db, runId)).toEqual(positions);
    expect(usage(db, id)).toEqual(ledger);
    expect(readEvents(db, runId).filter(e => e.event_type === 'phase1_collective_output')).toHaveLength(1);
    db.close();
  });

  it('never reissues an in-flight ballot after interruption', async () => {
    const raw = input(); raw.base_config.recovery = { enabled: true, checkpoint_every: 'opportunity' };
    const config = freezeConfig(planCampaign(raw).cases[0]!.config), db = tempDb();
    const mock = new MockProvider();
    const runner = new WorkshopRunner({ db, frozen: config, provider: { name: 'mock', invoke: async req => {
      if (req.ballotProbe) throw new Error('interrupted');
      return mock.invoke(req);
    } } });
    await runner.execute();
    expect(ballotRows(db, runner.id)).toHaveLength(1);
    expect(ballotRows(db, runner.id)[0]!.status).toBe('pending');
    db.prepare("DELETE FROM events WHERE run_id = ? AND (event_type = 'run_failed' OR (event_type IN ('state_transition_started','state_transition_completed') AND workshop_state = 'FAILED'))").run(runner.id);
    db.prepare("UPDATE runs SET status = 'INTERRUPTED' WHERE run_id = ?").run(runner.id);
    const invoke = vi.fn();
    const resumed = new WorkshopRunner({ db, frozen: config, resumeRunId: runner.id, provider: { name: 'mock', invoke } });
    expect((await resumed.execute()).status).toBe('FAILED');
    expect(invoke).not.toHaveBeenCalled();
    expect(ballotRows(db, runner.id)).toHaveLength(1);
    db.close();
  });

  it('reports complete role/order balance only for a full ten-block design', () => {
    const db = tempDb();
    const partial = freezeCampaign(db, input());
    expect(campaignAnalysis(db, partial).closure.gates.find(g => g.id === 'P1-C')!.status).toBe('BLOCKED');
    const balanced = freezeCampaign(db, { ...input(), blocks: 10 });
    expect(campaignAnalysis(db, balanced).closure.gates.find(g => g.id === 'P1-C')!.status).toBe('PASS');
    expect(campaignAnalysis(db, balanced).closure.scientific_pass).toBe(false);
    db.close();
  });
});

describe('voting rules', () => {
  const config = planCampaign(input()).cases[0]!.config;
  const question = config.phase1!.evaluation!.questionnaire.questions[0]!;
  const make = (choices: (string | null)[]) => choices.map((choice, i) => ({
    record_id: `r${i}`, run_id: 'run', agent_id: `agent_${i + 1}`, status: 'valid',
    value_json: JSON.stringify({ ballots: config.phase1!.evaluation!.questionnaire.questions.map((q, index) => ({ question_id: q.id, choice: index === 0 ? choice : q.options[0] })) }),
  })) as BallotRow[];
  it('retains a 3–2 majority and its minority, without input-order tie breaking', () => {
    const [a, b] = question.options as [string, string];
    const rows = make([a, a, a, b, b]);
    const d = aggregateBallots(config, 'run', rows).decisions[0]!;
    expect(d.decision).toBe(a); expect(d.minority_positions).toEqual([{ option: b, votes: 2 }]);
    expect(aggregateBallots(config, 'run', [...rows].reverse()).decisions).toEqual(aggregateBallots(config, 'run', rows).decisions);
    expect(aggregateBallots(config, 'run', make([a, a, b, b, null])).decisions[0]!.outcome).toBe('no_majority');
    expect(aggregateBallots(config, 'run', make([null, null, null, null, null])).decisions[0]!.outcome).toBe('no_majority');
    expect(aggregateBallots(config, 'run', make([a, a, a, b])).decisions[0]!.decision).toBeNull();
  });
  it('rejects duplicates, invalid options and unknown voters', () => {
    expect(() => parseBallot('{"ballots":[]}', config)).toThrow();
    expect(() => aggregateBallots(config, 'run', make(['invented']))).toThrow();
    const rows = make([question.options[0]!]);
    expect(() => aggregateBallots(config, 'run', [...rows, ...rows])).toThrow(/duplicate/);
    expect(() => aggregateBallots(config, 'other', rows)).toThrow(/provenance/);
  });
});

describe('scientific closure evidence', () => {
  it('binds append-only documents to the manifest, rejects late preregistration and never promotes uploaded reports to PASS', async () => {
    const db = tempDb(), id = freezeCampaign(db, input());
    const record = { version: 'phase1-closure-evidence-v1', manifest_hash: campaign(db, id).row.manifest_hash,
      kind: 'analysis_plan', author: 'Researcher', title: 'Draft analysis plan', body: 'Run/block unit; define uncertainty, missing-data handling and multiplicity before execution.', related_evidence_hashes: [] };
    const receipt = recordClosureEvidence(db, id, record);
    expect(recordClosureEvidence(db, id, record)).toEqual(receipt);
    expect(closureEvidence(db, id)).toHaveLength(1);
    expect(() => recordClosureEvidence(db, id, { ...record, manifest_hash: 'sha256:' + '0'.repeat(64) })).toThrow(/exact frozen/);
    expect(() => recordClosureEvidence(db, id, { ...record, related_evidence_hashes: ['sha256:' + '0'.repeat(64)] })).toThrow(/absent/);
    await runCampaign(db, id);
    expect(() => recordClosureEvidence(db, id, { ...record, title: 'Late change' })).toThrow(/before execution/);
    expect(campaignAnalysis(db, id).closure.scientific_pass).toBe(false);
    expect(campaignBundle(db, id).artifacts.closure_evidence).toHaveLength(1);
    db.close();
  });
});
