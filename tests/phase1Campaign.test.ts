import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { freezeConfig, loadConfigFile } from '../src/config/load.js';
import { configHash } from '../src/config/hash.js';
import { participantSystemPrompt } from '../src/prompts/registry.js';
import { campaign, compareConditions, freezeCampaign, planCampaign, previewPrompts, runCampaign, starterInput, usage, linkEvidence } from '../src/phase1/campaign.js';
import { campaignAnalysis } from '../src/phase1/analysis.js';
import { campaignBundle, exportCampaign } from '../src/phase1/export.js';
import { annotate, reviewerAnnotations } from '../src/semantic/phase1Annotations.js';
import { getInvocations, getMessages, getRun } from '../src/db/queries.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { MockProvider } from '../src/providers/mock.js';
import { readEvents } from '../src/events/recorder.js';
import { frozen, tempDb, tempDir } from './helpers.js';

const input = (blocks = 1) => ({ ...starterInput(frozen({ recovery: { enabled: true, checkpoint_every: 'opportunity' } }).config), blocks });
afterEach(() => vi.restoreAllMocks());

describe('Phase 1A frozen protocol', () => {
  it('preserves the actual baseline schema hash and v1 prompt bytes', () => {
    // Computed with schema.ts + registry.ts from historical commit
    // 5fd5f6c53372d974836dc34e4852d8eb799ad06b, not from the Phase 1 resolver.
    const base = loadConfigFile('configs/agora_phase0_1_context_contract.yaml');
    expect(base.hash).toBe('sha256:af29fec3efd2453e235e21c80d2b2c10aaf3fff2539b4db71fb82fc4cdad6a12');
    expect('phase1' in base.config).toBe(false);
    expect(base.config.participants.map(p => configHash(participantSystemPrompt(base.config, p.id)))).toEqual([
      'sha256:1acd8f12b2c5d4bf7ab768101f60ff108e930ee038039b65909b5a4dcbfe73a9',
      'sha256:de027aa06c41ea1fa0acff82f2ed1be830e3c721d5e5fd55dc02c031002d4f31',
      'sha256:7d082725a26570d426b9df1de061d7983614635cd6cf3428055ee5c87113d96c',
      'sha256:9d66a5862bf73f70958ba757f6025190bfc54fa9c684414498f30f4e7fd76841',
      'sha256:9478aea6382aac090c658e9a2780e729812697e340d6d5a7fc604a4ce55aa69a',
    ]);
  });
  it('freezes permutations and AB/BA order with exact prompts and isolated role blocks', () => {
    const plan = planCampaign(input(10));
    expect(plan.cases).toHaveLength(20);
    expect(plan.cases.filter(c => c.order % 2 === 0 && c.condition === 'control')).toHaveLength(5);
    expect(new Set(plan.cases.filter(c => c.condition === 'treatment').map(c => c.targets.agent_1)).size).toBe(5);
    expect(plan.comparisons.every(c => c.valid && c.control_hash !== c.treatment_hash)).toBe(true);
    const treatment = plan.cases[1]!, control = plan.cases[0]!;
    const text = participantSystemPrompt(treatment.config, 'agent_1').text;
    expect(text).toContain(plan.input.role_pack.roles[0]!.instruction);
    expect(text).not.toContain(plan.input.role_pack.roles[1]!.instruction);
    expect(participantSystemPrompt(control.config, 'agent_1').text).not.toContain(plan.input.role_pack.roles[0]!.instruction);
    expect(previewPrompts(plan)[0]!.turn_instructions.some(i => i.channel === 'private')).toBe(true);
  });
  it.each(['model', 'budget', 'common', 'moderator', 'schedule', 'topic', 'tools', 'context'])('rejects non-role difference: %s', key => {
    const plan = planCampaign(input()), control = plan.cases[0]!.config, treatment = structuredClone(plan.cases[1]!.config);
    if (key === 'model') treatment.model.model += '-other';
    if (key === 'budget') treatment.budgets.max_calls_per_agent++;
    if (key === 'common') treatment.phase1!.common_instruction += ' new';
    if (key === 'moderator') treatment.moderator.mode = 'llm';
    if (key === 'schedule') treatment.scheduling.order = 'config_order';
    if (key === 'topic') treatment.workshop.topic += ' new';
    if (key === 'tools') treatment.capabilities.tools_enabled = true;
    if (key === 'context') treatment.context_policy.max_messages = 2;
    expect(compareConditions(control, treatment).valid).toBe(false);
  });
  it('requires a new pack version for edited frozen text and detects manifest tampering', () => {
    const db = tempDb(), raw = input(), id = freezeCampaign(db, raw), original = campaign(db, id).row.manifest_hash;
    raw.role_pack.roles[0]!.instruction += ' Changed';
    expect(() => freezeCampaign(db, raw)).toThrow(/version/);
    raw.role_pack.version = 'draft-2';
    expect(freezeCampaign(db, raw)).not.toBe(id);
    expect(campaign(db, id).row.manifest_hash).toBe(original);
    db.prepare("UPDATE phase1_campaigns SET manifest_hash = 'tampered' WHERE id = ?").run(id);
    expect(() => campaign(db, id)).toThrow(/integrity/);
    db.close();
  });
});

describe('Phase 1A execution and review', () => {
  it('runs all mock cases once, preserves private routing and exports complete provenance', async () => {
    const db = tempDb(), id = freezeCampaign(db, input(5));
    await runCampaign(db, id);
    const first = campaign(db, id), runIds = first.cases.map(c => c.run_id);
    expect(first.row.state).toBe('completed');
    const counts = usage(db, id);
    await runCampaign(db, id);
    expect(campaign(db, id).cases.map(c => c.run_id)).toEqual(runIds);
    expect(usage(db, id)).toEqual(counts);
    const analysis = campaignAnalysis(db, id);
    expect(analysis.denominators).toMatchObject({ planned: 10, completed: 10, annotated_runs: 0 });
    expect(analysis.status).toMatchObject({ runtime_checks_passed: true, live_executed: false, human_annotated: false, scientific_analysis_completed: false });
    const bundle = campaignBundle(db, id);
    expect(bundle.artifacts.runs).toHaveLength(10);
    expect(bundle.hashes.prompts).toBe(configHash(bundle.artifacts.prompts));
    const out = tempDir(), file = exportCampaign(db, id, out);
    expect(JSON.parse(readFileSync(file, 'utf8')).hashes).toEqual(bundle.hashes);
    expect(() => exportCampaign(db, id, out)).toThrow();
    db.close();
  });
  it('retains budget-skipped cases, partial outcomes and null zero-denominator metrics', async () => {
    const db = tempDb(), raw = input(2); raw.limits.max_provider_calls = 1;
    const id = freezeCampaign(db, raw); await runCampaign(db, id);
    expect(usage(db, id).attempts).toBe(1);
    expect(campaign(db, id).cases.filter(c => c.state === 'budget_skipped')).toHaveLength(3);
    const analysis = campaignAnalysis(db, id);
    expect(analysis.cases[1]!.by_agent[0]!.contribution_share.value).toBe(null);
    expect(analysis.checks.some(c => c.id.startsWith('P1A-DELIVERY') && c.status === 'FAIL')).toBe(true);
    expect(campaignBundle(db, id).artifacts.manifest.cases).toHaveLength(4);
    db.close();
  });
  it('stops at unknown usage rather than claiming zero cost or unlimited remaining budget', async () => {
    const invoke = MockProvider.prototype.invoke;
    vi.spyOn(MockProvider.prototype, 'invoke').mockImplementation(async function(request) { const result = await invoke.call(this, request); return { ...result, usage: { inputTokens: null, outputTokens: null } }; });
    const db = tempDb(), id = freezeCampaign(db, input()); await runCampaign(db, id);
    expect(usage(db, id)).toMatchObject({ attempts: 1, unknown_usage: 1, estimated_cost: null });
    db.close();
  });
  it('requires explicit live authorization before creating any run', async () => {
    const db = tempDb(), raw = input(); raw.base_config.model.provider = 'openai';
    const id = freezeCampaign(db, raw);
    await expect(runCampaign(db, id)).rejects.toThrow(/Live execution/);
    expect(campaign(db, id).cases.every(c => c.run_id === null)).toBe(true);
    db.close();
  });
  it('resumes an interrupted linked case using its original run without duplicate effects', async () => {
    const db = tempDb(), id = freezeCampaign(db, input()); await runCampaign(db, id);
    const r = campaign(db, id).cases[0]!, runId = r.run_id!;
    const target = db.prepare('SELECT opportunity_id, trace_id FROM opportunities WHERE run_id = ? ORDER BY sequence DESC LIMIT 1').get(runId) as { opportunity_id: string; trace_id: string };
    const cut = readEvents(db, runId).find(e => e.trace_id === target.trace_id && e.event_type === 'message_routed')!;
    db.prepare('DELETE FROM events WHERE run_id = ? AND sequence > ?').run(runId, cut.sequence);
    db.prepare('DELETE FROM state_transitions WHERE run_id = ? AND sequence > ?').run(runId, cut.sequence);
    db.prepare('DELETE FROM run_checkpoints WHERE run_id = ? AND opportunity_id = ?').run(runId, target.opportunity_id);
    db.prepare('UPDATE opportunities SET resolution = NULL, resolved_at = NULL WHERE opportunity_id = ?').run(target.opportunity_id);
    db.prepare("UPDATE runs SET status = 'RUNNING', ended_at = NULL WHERE run_id = ?").run(runId);
    db.prepare("UPDATE phase1_cases SET state = 'running' WHERE run_id = ?").run(runId);
    const messageIds = getMessages(db, runId).map(m => m.message_id);
    await runCampaign(db, id, { resumeInterrupted: true });
    expect(campaign(db, id).cases[0]!.run_id).toBe(runId);
    expect(getRun(db, runId)!.status).toBe('COMPLETED');
    expect(getMessages(db, runId).map(m => m.message_id)).toEqual(messageIds);
    db.close();
  });
  it('keeps exact reruns separate and validates explicit evidence membership', async () => {
    const db = tempDb(), id = freezeCampaign(db, input()); await runCampaign(db, id);
    const c = campaign(db, id);
    expect(() => linkEvidence(db, id, c.cases[0]!.run_id!, 'exact_rerun')).toThrow(/additional/);
    const rerun = new WorkshopRunner({ db, frozen: freezeConfig(c.plan.cases[0]!.config) }); await rerun.execute();
    linkEvidence(db, id, rerun.id, 'exact_rerun');
    expect(campaignBundle(db, id).artifacts.evidence_links).toHaveLength(1);
    db.close();
  });
  it('validates quotes, protects independent labels and appends revision/adjudication history', async () => {
    const db = tempDb(), id = freezeCampaign(db, input()); await runCampaign(db, id);
    const c = campaign(db, id), runId = c.cases[0]!.run_id!;
    const source = getMessages(db, runId).find(m => m.sender_agent_id === 'agent_1')!;
    const a = { run_id: runId, message_id: source.message_id, author: 'alice', annotator_type: 'human', rubric_version: 'draft-1', category: 'role_consistency', label: 'not_assessable', quote: source.content, reason: 'Mock output does not validate the role.' };
    const original = annotate(db, id, a);
    expect(reviewerAnnotations(db, id, 'bob')).toEqual([]);
    annotate(db, id, { ...a, author: 'bob' });
    expect(reviewerAnnotations(db, id, 'bob')).toHaveLength(2);
    annotate(db, id, { ...a, supersedes: original, reason: 'Revised rationale.' });
    annotate(db, id, { ...a, author: 'chair', adjudicates: [original] });
    expect(campaignBundle(db, id).artifacts.annotations).toHaveLength(4);
    expect(() => annotate(db, id, { ...a, quote: 'not present' })).toThrow(/quote/);
    expect(() => annotate(db, id, { ...a, run_id: c.cases[1]!.run_id })).toThrow(/quote/);
    expect(() => annotate(db, id, { ...a, rubric_version: 'new' })).toThrow(/rubric/);
    expect(() => annotate(db, id, { ...a, category: 'agreement', label: 'present' })).toThrow(/target/);
    db.close();
  });
});
