import { afterEach, describe, expect, it, vi } from 'vitest';
import { campaign, freezeCampaign, planCampaign, runCampaign, starterInput, usage } from '../src/phase1/campaign.js';
import { campaignAnalysis } from '../src/phase1/analysis.js';
import { campaignBundle } from '../src/phase1/export.js';
import { positionProbeStatus, positionRows, parsePosition } from '../src/phase1/positions.js';
import { behavioralMeasures } from '../src/phase1/behavioralAnalysis.js';
import { annotate, reviewerAnnotations, wasExposed } from '../src/semantic/phase1Annotations.js';
import { getMessages, getInvocations, getRun } from '../src/db/queries.js';
import { MockProvider } from '../src/providers/mock.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { freezeConfig } from '../src/config/load.js';
import { participantSystemPrompt, turnInstruction } from '../src/prompts/registry.js';
import { readEvents } from '../src/events/recorder.js';
import { frozen, tempDb } from './helpers.js';
import type { AgentInvocationRequest } from '../src/providers/types.js';
import { exportRun } from '../src/export/exporter.js';
import { tempDir } from './helpers.js';

const input = () => ({ ...starterInput(frozen({ recovery: { enabled: true, checkpoint_every: 'opportunity' } }).config), blocks: 1 });
afterEach(() => vi.restoreAllMocks());
async function executed() { const db = tempDb(), id = freezeCampaign(db, input()); await runCampaign(db, id); const c = campaign(db, id); return { db, id, c, runId: c.cases[0]!.run_id! }; }

describe('independent positions', () => {
  it('records independent initial positions, exposed final positions, exact prompts, budgets and a valid null effect', async () => {
    const { db, id, c, runId } = await executed();
    const records = positionRows(db, runId), messages = getMessages(db, runId);
    expect(records).toHaveLength(10); expect(records.every(r => r.status === 'valid')).toBe(true);
    for (const row of records) {
      const req = JSON.parse(row.request_json!).request as AgentInvocationRequest;
      expect(req.system).toBe(participantSystemPrompt(c.plan.cases[0]!.config, row.agent_id).text);
      if (row.phase === 'initial') { expect(req.contextMessageIds).toEqual([]); expect(req.messages[0]!.content).toContain('No messages have been sent yet'); }
      else {
        expect(req.contextMessageIds!.length).toBeGreaterThan(0);
        expect(req.messages[0]!.content).toContain(messages[0]!.content);
        expect(req.messages[0]!.content).not.toContain('Deterministic measurement fixture');
      }
    }
    expect(messages.every(m => !m.content.includes('Deterministic measurement fixture'))).toBe(true);
    expect(getInvocations(db, runId).every(i => !i.rendered_messages.includes('Deterministic measurement fixture'))).toBe(true);
    const analysis = campaignAnalysis(db, id);
    expect(analysis.status.runtime_checks_passed).toBe(true);
    expect(analysis.behavioral[0]).toMatchObject({ initial_final_change: { value: 0, valid_agent_pairs: 5 }, reviewers: [] });
    expect(analysis.checks.find(check => check.id === `P1A-POSITIONS:${c.plan.cases[0]!.id}`)).toMatchObject({ status: 'PASS', probe_status: 'VALID' });
    expect(usage(db, id).attempts).toBe(2 * (getInvocations(db, runId).filter(i => i.provider !== 'scripted').length + 10));
    expect(campaignBundle(db, id).artifacts.runs[0]!.records.phase1_positions).toHaveLength(10);
    expect(exportRun({ db, runId, outDir: tempDir() }).files.some(f => f.name === 'phase1_positions.json')).toBe(true);
    const events = readEvents(db, runId);
    expect(events.filter(e => e.event_type === 'phase1_position_recorded' && e.payload.phase === 'initial').at(-1)!.sequence).toBeLessThan(events.find(e => e.event_type === 'response_opportunity_created')!.sequence);
    db.close();
  });
  it('uses identical questions, validates exact options and rejects missing, repeated and malformed answers', () => {
    const config = planCampaign(input()).cases[0]!.config, qs = config.phase1!.evaluation!.questionnaire.questions;
    const answers = qs.map(q => ({ question_id: q.id, choice: q.options[0], confidence: 60, rationale: 'Reason.' }));
    expect(parsePosition(JSON.stringify({ answers }), config).answers).toHaveLength(2);
    for (const bad of [{ answers: [answers[0]] }, { answers: [answers[0], answers[0]] }, { answers: answers.map(a => ({ ...a, choice: 'invented' })) }, { answers: answers.map(a => ({ ...a, confidence: 101 })) }]) expect(() => parsePosition(JSON.stringify(bad), config)).toThrow();
    expect(() => parsePosition('not json', config)).toThrow();
  });
  it('derives nonzero categorical and confidence changes from valid recorded answers', async () => {
    const invoke = MockProvider.prototype.invoke;
    vi.spyOn(MockProvider.prototype, 'invoke').mockImplementation(async function(req) {
      const result = await invoke.call(this, req);
      if (req.positionProbe && req.contextMessageIds?.length) {
        const value = JSON.parse(result.content!);
        for (const answer of value.answers) { answer.choice = req.positionProbe.questions.find(q => q.id === answer.question_id)!.options[1]; answer.confidence = 70; }
        result.content = JSON.stringify(value);
      }
      return result;
    });
    const { db, id } = await executed();
    const result = campaignAnalysis(db, id).behavioral[0]!;
    if (result.availability !== 'configured') throw new Error('missing protocol');
    expect(result.initial_final_change.value).toBe(1);
    expect(result.positions[0]!.questions[0]!.confidence_shift).toBe(20);
    expect(campaignAnalysis(db, id).status.scientific_analysis_completed).toBe(false);
    db.close();
  });
  it('retains malformed responses without repair or a fabricated zero change', async () => {
    const invoke = MockProvider.prototype.invoke;
    vi.spyOn(MockProvider.prototype, 'invoke').mockImplementation(async function(req) { const r = await invoke.call(this, req); return req.positionProbe ? { ...r, content: 'malformed' } : r; });
    const { db, id, runId } = await executed();
    expect(positionRows(db, runId).every(r => r.status === 'invalid')).toBe(true);
    expect(campaignAnalysis(db, id).behavioral[0]).toMatchObject({ initial_final_change: { value: null, valid_agent_pairs: 0 } });
    expect(campaignAnalysis(db, id).checks.find(check => check.id === `P1A-POSITIONS:${campaign(db, id).plan.cases[0]!.id}`)).toMatchObject({ status: 'FAIL', probe_status: 'EXECUTED_BUT_INVALID' });
    expect(campaignAnalysis(db, id).status.runtime_checks_passed).toBe(false);
    db.close();
  });
  it('keeps explicit abstention and no-op as valid behavioral delivery outcomes', async () => {
    const invoke = MockProvider.prototype.invoke;
    vi.spyOn(MockProvider.prototype, 'invoke').mockImplementation(async function(req) {
      const result = await invoke.call(this, req);
      return req.positionProbe ? result : { ...result, content: req.agentId === 'agent_1' ? '[ABSTAIN]' : '[PASS]' };
    });
    const { db, id, c, runId } = await executed();
    const calls = getInvocations(db, runId).filter(i => i.agent_id !== c.plan.input.base_config.moderator.id);
    expect(new Set(calls.map(i => i.outcome))).toEqual(new Set(['explicit_abstention', 'no_op']));
    expect(campaignAnalysis(db, id).checks.find(check => check.id === `P1A-DELIVERY:${c.plan.cases[0]!.id}`)).toMatchObject({ status: 'PASS' });
    db.close();
  });
  it('still fails delivery for a genuine provider failure', async () => {
    const invoke = MockProvider.prototype.invoke;
    vi.spyOn(MockProvider.prototype, 'invoke').mockImplementation(async function(req) {
      const result = await invoke.call(this, req);
      return req.positionProbe ? result : { ...result, ok: false, content: null, failure: { category: 'provider_error', message: 'provider unavailable' } };
    });
    const { db, id, c, runId } = await executed();
    const calls = getInvocations(db, runId).filter(i => i.agent_id !== c.plan.input.base_config.moderator.id);
    expect(calls.every(i => i.outcome === 'infra_failure')).toBe(true);
    expect(campaignAnalysis(db, id).checks.find(check => check.id === `P1A-DELIVERY:${c.plan.cases[0]!.id}`)).toMatchObject({ status: 'FAIL' });
    db.close();
  });
  it('distinguishes executed provider failures from probes that were never exercised', async () => {
    expect(positionProbeStatus([])).toBe('NOT_EXERCISED');
    const invoke = MockProvider.prototype.invoke;
    vi.spyOn(MockProvider.prototype, 'invoke').mockImplementation(async function(req) {
      const result = await invoke.call(this, req);
      return req.positionProbe
        ? { ...result, ok: false, content: null, failure: { category: 'provider_error', message: 'position probe unavailable' } }
        : result;
    });
    const { db, id, c, runId } = await executed();
    expect(positionRows(db, runId).every(r => r.status === 'missing')).toBe(true);
    expect(campaignAnalysis(db, id).checks.find(check => check.id === `P1A-POSITIONS:${c.plan.cases[0]!.id}`)).toMatchObject({ status: 'FAIL', probe_status: 'EXECUTED_BUT_MISSING' });
    db.close();
  });
  it('charges probes against campaign ceilings and retains all planned cases', async () => {
    const db = tempDb(), raw = input(); raw.limits.max_provider_calls = 1;
    const id = freezeCampaign(db, raw); await runCampaign(db, id);
    expect(usage(db, id).attempts).toBe(1);
    expect(campaign(db, id).cases).toHaveLength(2);
    expect(campaign(db, id).cases[1]!.state).toBe('budget_skipped');
    expect(campaignAnalysis(db, id).behavioral[0]).toMatchObject({ initial_final_change: { value: null } });
    db.close();
  });
  it('does not repeat already persisted probes or double charge them during recovery', async () => {
    const { db, id, c, runId } = await executed();
    const records = positionRows(db, runId), before = usage(db, id);
    db.prepare("DELETE FROM events WHERE run_id = ? AND event_type IN ('run_completed','state_transition_started','state_transition_completed') AND sequence > (SELECT MAX(sequence) FROM events WHERE run_id = ? AND event_type = 'phase1_position_recorded')").run(runId, runId);
    db.prepare("UPDATE runs SET status = 'RUNNING', ended_at = NULL WHERE run_id = ?").run(runId);
    db.prepare("UPDATE phase1_cases SET state = 'running' WHERE run_id = ?").run(runId);
    await runCampaign(db, id, { resumeInterrupted: true });
    expect(getRun(db, runId)!.status).toBe('COMPLETED');
    expect(positionRows(db, runId)).toEqual(records);
    expect(usage(db, id)).toEqual(before);
    expect(campaign(db, id).cases.map(r => r.run_id)).toEqual(c.cases.map(r => r.run_id));
    db.close();
  });
  it('refuses to reissue an interrupted in-flight probe', async () => {
    const db = tempDb(), config = freezeConfig(planCampaign(input()).cases[0]!.config);
    const runner = new WorkshopRunner({ db, frozen: config, provider: { name: 'mock', invoke: async () => { throw new Error('process interrupted'); } } });
    await runner.execute();
    const record = positionRows(db, runner.id)[0]!;
    expect(record.status).toBe('pending');
    db.prepare("DELETE FROM events WHERE run_id = ? AND event_type IN ('run_failed','state_transition_started','state_transition_completed')").run(runner.id);
    db.prepare("UPDATE runs SET status = 'INTERRUPTED' WHERE run_id = ?").run(runner.id);
    const invoke = vi.fn();
    const resumed = new WorkshopRunner({ db, frozen: config, resumeRunId: runner.id, provider: { name: 'mock', invoke } });
    await resumed.execute();
    expect(invoke).not.toHaveBeenCalled(); expect(positionRows(db, runner.id)).toHaveLength(1);
    db.close();
  });
});

describe('prespecified behavioral readings', () => {
  it('changes the private instruction only for opted-in evaluation protocols', () => {
    const config = planCampaign(input()).cases[0]!.config;
    const text = turnInstruction({ config, state: 'PRIVATE_OR_BREAKOUT', agentId: 'agent_1', isModerator: false, channel: 'private', roundIndex: 0, totalRounds: 1, breakoutGroupId: 'breakout_a', breakoutMembers: ['agent_1','agent_2'] });
    expect(text).toContain('not asked to conceal'); expect(text).not.toContain('Say what you would not say');
  });
  it('rejects changed questionnaires or mismatched role criteria before freezing', () => {
    const raw = input(); raw.evaluation!.role_criteria.extra = raw.evaluation!.role_criteria.critic!;
    expect(() => planCampaign(raw)).toThrow(/exactly/);
    const raw2 = input(); raw2.evaluation!.questionnaire.questions.push(raw2.evaluation!.questionnaire.questions[0]!);
    expect(() => planCampaign(raw2)).toThrow(/unique/);
  });
  it('scores criteria per reviewer and never treats incomplete review as a full score', async () => {
    const { db, id, c, runId } = await executed();
    const source = getMessages(db, runId).filter(m => m.sender_agent_id === 'agent_1');
    const role = c.plan.cases[0]!.targets.agent_1!, criteria = c.plan.input.evaluation!.role_criteria[role]!;
    const base = { run_id: runId, author: 'alice', annotator_type: 'human', rubric_version: c.plan.input.role_pack.rubric.version, category: 'role_criterion', label: 'scored', score: 2, reason: 'Known fixture: criterion clearly expressed.' };
    const first = { ...base, message_id: source[0]!.message_id, quote: source[0]!.content, criterion_id: criteria[0]!.id };
    annotate(db, id, first);
    let result = behavioralMeasures(db, id, c.plan.cases[0]!, runId);
    expect(result.availability).toBe('configured');
    if (result.availability !== 'configured') throw new Error('missing protocol');
    expect(result.reviewers[0]!.role_fidelity[0]!.value).toBe(null);
    expect(reviewerAnnotations(db, id, 'bob')).toEqual([]);
    annotate(db, id, { ...first, author: 'bob', criterion_id: criteria[1]!.id });
    expect(reviewerAnnotations(db, id, 'bob').some(r => r.data.author === 'alice')).toBe(false);
    for (const m of source) for (const criterion of criteria) if (m.message_id !== source[0]!.message_id || criterion.id !== criteria[0]!.id) annotate(db, id, { ...base, message_id: m.message_id, quote: m.content, criterion_id: criterion.id });
    result = behavioralMeasures(db, id, c.plan.cases[0]!, runId);
    if (result.availability !== 'configured') throw new Error('missing protocol');
    expect(result.reviewers.find(r => r.author === 'alice')!.role_fidelity[0]!.value).toBe(1);
    expect(result.reviewers.find(r => r.author === 'bob')!.role_fidelity[0]!.value).toBe(null);
    expect(() => annotate(db, id, { ...first, criterion_id: 'invented' })).toThrow(/criterion/);
    db.close();
  });
  it('separates actual reply/contingency edges from delivery and preserves annotation conflicts', async () => {
    const { db, id, c, runId } = await executed();
    const messages = getMessages(db, runId).filter(m => m.sender_agent_id !== 'moderator');
    const source = messages.find(m => m.workshop_state === 'PUBLIC_DISCUSSION')!;
    const target = messages.find(m => m.sender_agent_id !== source.sender_agent_id && wasExposed(db, source, m))!;
    const a = { run_id: runId, message_id: source.message_id, author: 'alice', annotator_type: 'human', rubric_version: c.plan.input.role_pack.rubric.version, category: 'interaction_contingency', label: 'present', relation: 'challenges', quote: source.content, target_message_id: target.message_id, target_quote: target.content, reason: 'Fixture for a substantive challenge.' };
    const annotationId = annotate(db, id, a);
    let result = behavioralMeasures(db, id, c.plan.cases[0]!, runId);
    if (result.availability !== 'configured') throw new Error('missing protocol');
    expect(result.reviewers[0]!.interaction_contingency).toMatchObject({ numerator: 1, assessed: 1, value: null, assessed_only_value: 1 });
    expect(result.reviewers[0]!.response_network[0]).toMatchObject({ annotation_id: annotationId, from_message_id: source.message_id, to_message_id: target.message_id });
    annotate(db, id, a); // ambiguous duplicate, never silently select the latest
    result = behavioralMeasures(db, id, c.plan.cases[0]!, runId);
    if (result.availability !== 'configured') throw new Error('missing protocol');
    expect(result.annotation_conflicts).toHaveLength(2);
    expect(result.reviewers[0]!.response_network).toEqual([]);
    const privateSource = messages.find(m => m.channel === 'private' && m.sender_agent_id === 'agent_3')!;
    const inaccessible = messages.find(m => m.channel === 'private' && m.sender_agent_id === 'agent_1')!;
    expect(() => annotate(db, id, { ...a, message_id: privateSource.message_id, quote: privateSource.content, target_message_id: inaccessible.message_id, target_quote: inaccessible.content })).toThrow(/exposed/);
    db.close();
  });
  it('does not count moderator-only prior context in the peer interaction denominator', async () => {
    const { db, id, c, runId } = await executed();
    const allMessages = getMessages(db, runId);
    const participants = allMessages.filter(m => m.sender_agent_id !== c.plan.input.base_config.moderator.id);
    const moderator = allMessages.find(m => m.sender_agent_id === c.plan.input.base_config.moderator.id && m.workshop_state === 'PUBLIC_DISCUSSION')!;
    const moderatorOnly = participants.find(m => m.workshop_state !== 'INTRODUCTION' && m.sequence > moderator.sequence && m.source_invocation_id)!;
    db.prepare('UPDATE invocations SET context_message_ids = ? WHERE invocation_id = ?').run(JSON.stringify([moderator.message_id]), moderatorOnly.source_invocation_id);
    const peerEligible = participants.filter(m => m.workshop_state !== 'INTRODUCTION' && participants.some(prior => prior.sender_agent_id !== m.sender_agent_id && wasExposed(db, m, prior)));
    expect(peerEligible).not.toContainEqual(expect.objectContaining({ message_id: moderatorOnly.message_id }));
    const source = peerEligible[0]!;
    annotate(db, id, { run_id: runId, message_id: source.message_id, author: 'alice', annotator_type: 'human', rubric_version: c.plan.input.role_pack.rubric.version, category: 'interaction_contingency', label: 'absent', quote: source.content, reason: 'Only peer-exposed messages belong in the interaction denominator.' });
    const result = behavioralMeasures(db, id, c.plan.cases[0]!, runId);
    if (result.availability !== 'configured') throw new Error('missing protocol');
    expect(result.reviewers[0]!.interaction_contingency.denominator).toBe(peerEligible.length);
    db.close();
  });
  it('counts introduced-idea uptake only after a separate source-linked fate assessment', async () => {
    const { db, id, c, runId } = await executed();
    const messages = getMessages(db, runId).filter(m => m.sender_agent_id !== 'moderator');
    const source = messages[0]!, target = messages.find(m => m.sender_agent_id !== source.sender_agent_id && wasExposed(db, m, source))!;
    const a = { run_id: runId, message_id: source.message_id, author: 'alice', annotator_type: 'human', rubric_version: c.plan.input.role_pack.rubric.version, category: 'introduced_idea', label: 'present', quote: source.content, reason: 'Explicit proposal unit.' };
    const ideaId = annotate(db, id, a);
    let result = behavioralMeasures(db, id, c.plan.cases[0]!, runId);
    if (result.availability !== 'configured') throw new Error('missing protocol');
    expect(result.reviewers[0]!.argument_uptake).toMatchObject({ denominator: 1, assessed: 0, value: null });
    annotate(db, id, { ...a, category: 'argument_uptake', idea_annotation_id: ideaId, target_message_id: target.message_id, target_quote: target.content });
    result = behavioralMeasures(db, id, c.plan.cases[0]!, runId);
    if (result.availability !== 'configured') throw new Error('missing protocol');
    expect(result.reviewers[0]!.argument_uptake).toMatchObject({ numerator: 1, denominator: 1, value: 1 });
    db.close();
  });
  it('distinguishes a fully reviewed zero-contingency outcome from missing review', async () => {
    const { db, id, c, runId } = await executed();
    const messages = getMessages(db, runId).filter(m => m.sender_agent_id !== 'moderator');
    const eligible = messages.filter(m => m.workshop_state !== 'INTRODUCTION' && messages.some(p => p.sender_agent_id !== m.sender_agent_id && wasExposed(db, m, p)));
    for (const source of eligible) annotate(db, id, { run_id: runId, message_id: source.message_id, author: 'alice', annotator_type: 'human', rubric_version: c.plan.input.role_pack.rubric.version, category: 'interaction_contingency', label: 'absent', quote: source.content, reason: 'Reviewed the exposed earlier statements; no substantive dependence is identified.' });
    const result = behavioralMeasures(db, id, c.plan.cases[0]!, runId);
    if (result.availability !== 'configured') throw new Error('missing protocol');
    expect(result.reviewers[0]!.interaction_contingency).toMatchObject({ value: 0, numerator: 0, denominator: eligible.length, availability: 'complete' });
    expect(campaignAnalysis(db, id).status.runtime_checks_passed).toBe(true);
    db.close();
  });
});
