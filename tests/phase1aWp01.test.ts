import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONDITION_MATRIX,
  DEFAULT_PROTOCOL_REVISION,
  DecisionRegisterSchema,
  ModelFamilyReferenceSchema,
  ProviderAdapterDescriptorSchema,
  SELECTED_REPORT_NOTICE_TIMING,
  StudyContractSchema,
  TimingDispositionSchema,
  buildRunAgenda,
  buildSyntheticCampaign,
  createDefaultDecisionRegister,
  createFaultBoundaryFixtures,
  createPromptRegistry,
  createStudyContract,
  expectedPlanningCounts,
  renderPrompt,
  validateCampaignManifest,
  validateDeploymentBinding,
  validatePromptRegistry,
  validateStudyContract,
  type ReportNoticeTiming,
} from '../src/phase1a/wp01/index.js';

describe('WP01 study contract', () => {
  it('represents the revised four-cell, three-agent, six-round design', () => {
    const contract = createStudyContract();
    expect(contract.protocol_revision).toBe(DEFAULT_PROTOCOL_REVISION);
    expect(contract.participant_slots).toEqual(['P1', 'P2', 'P3']);
    expect(contract.repetitions_per_condition).toBe(3);
    expect(contract.rounds).toBe(6);
    expect(contract.conditions).toEqual(CONDITION_MATRIX);
    expect(contract.moderator_policy).toEqual({ mode: 'deterministic_host', autonomous_llm: false });
    expect(contract.report_policy.notice_timing).toBe(SELECTED_REPORT_NOTICE_TIMING);
    expect(contract.interaction_policy).toMatchObject({
      tools_enabled: false,
      web_access: false,
      mandatory_breakouts: false,
      early_stopping: false,
      role_personas: false,
    });
    expect(validateStudyContract(contract)).toEqual({ valid: true, issues: [] });
    expect(StudyContractSchema.parse(contract)).toEqual(contract);
    expect(validateStudyContract({ ...contract, lifecycle: 'SCIENTIFIC_FREEZE_PENDING' })).toEqual({ valid: true, issues: [] });
  });

  it('derives the declared planning counts without creating event records', () => {
    const counts = expectedPlanningCounts(createStudyContract());
    expect(counts).toEqual({
      runs: 12,
      public_opportunities: 216,
      private_elicitation_opportunities: 90,
      report_production_invocations: 24,
      expected_model_invocations: 330,
    });
    expect(counts).not.toHaveProperty('events');
  });

  it('rejects a changed participant or round count', () => {
    const invalid = { ...createStudyContract(), participant_slots: ['P1', 'P2'], rounds: 5 } as never;
    const result = validateStudyContract(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toMatch(/participant|round/i);
  });
});

describe('WP01 report timing and scheduling', () => {
  it.each<ReportNoticeTiming>(['BEFORE_T0', 'AFTER_T0_BEFORE_PUBLIC'])('represents the report notice sequence %s', (timing) => {
    const agenda = buildRunAgenda('B', timing);
    expect(agenda.map(stage => stage.id)).toContain('T0');
    expect(agenda.map(stage => stage.id)).toContain('REPORT_NOTICE');
    expect(agenda.filter(stage => stage.model_invocation).length).toBe(31);
    expect(agenda.filter(stage => stage.kind === 'public_opportunity').length).toBe(18);
    expect(agenda.filter(stage => stage.kind === 'private_probe').length).toBe(9);
    if (timing === 'BEFORE_T0') {
      expect(agenda.findIndex(stage => stage.id === 'REPORT_NOTICE')).toBeLessThan(agenda.findIndex(stage => stage.id === 'T0'));
    } else {
      expect(agenda.findIndex(stage => stage.id === 'T0')).toBeLessThan(agenda.findIndex(stage => stage.id === 'REPORT_NOTICE'));
      expect(agenda.findIndex(stage => stage.id === 'REPORT_NOTICE')).toBeLessThan(agenda.findIndex(stage => stage.id === 'PUBLIC_ROUND_1'));
    }
  });

  it('does not include report stages in no-report arms', () => {
    const agenda = buildRunAgenda('A', 'NONE');
    expect(agenda.some(stage => stage.id.startsWith('REPORT_'))).toBe(false);
    expect(agenda.filter(stage => stage.model_invocation).length).toBe(24);
    expect(agenda.filter(stage => stage.kind === 'private_probe').length).toBe(6);
  });

  it('places all t0 checkpoints before the selected report notice and preserves t6/tR order', () => {
    const agenda = buildRunAgenda('B', SELECTED_REPORT_NOTICE_TIMING);
    const noticeIndex = agenda.findIndex(stage => stage.id === 'REPORT_NOTICE');
    const t0Stages = agenda.filter(stage => stage.id === 'T0');
    expect(t0Stages.map(stage => stage.participant_slot)).toEqual(['P1', 'P2', 'P3']);
    expect(t0Stages.every(stage => agenda.indexOf(stage) < noticeIndex)).toBe(true);
    expect(noticeIndex).toBeLessThan(agenda.findIndex(stage => stage.id === 'PUBLIC_ROUND_1'));
    expect(agenda.findIndex(stage => stage.id === 'PUBLIC_ROUND_6')).toBeLessThan(agenda.findIndex(stage => stage.id === 'T6'));
    expect(agenda.findIndex(stage => stage.id === 'REPORT_REVISION')).toBeLessThan(agenda.findIndex(stage => stage.id === 'TR'));
    expect(agenda.find(stage => stage.id === 'REPORT_NOTICE')?.model_invocation).toBe(false);
  });
});

describe('WP01 decision register', () => {
  it('records Simon Option A as confirmed while retaining the scientific freeze boundary', () => {
    const register = createDefaultDecisionRegister();
    expect(DecisionRegisterSchema.parse(register)).toEqual(register);
    expect(register.decisions.map(decision => decision.id)).toEqual([
      'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10', 'D11', 'D12', 'D13', 'D14', 'D15', 'D16',
    ]);
    const d13 = register.decisions.find(decision => decision.id === 'D13')!;
    expect(d13.status).toBe('CONFIRMED');
    expect(d13.approved_wording).toBe('Option A: collect t0 before the report notice; manifest timing is AFTER_T0_BEFORE_PUBLIC.');
    expect(d13.current_evidence).toContain('Here I\'d say option A: the purpose of the baseline is to see what happens with the smallest amount of information possible.');
    expect(d13.source_references.some(reference => reference.includes('Simon Heilles'))).toBe(true);
    expect(d13.alternatives).toEqual([
      'REPORT_NOTICE_BEFORE_T0',
      'T0_BEFORE_REPORT_NOTICE',
    ]);
    expect(register.consolidation_notes).toEqual([{
      retired_id: 'D17',
      canonical_id: 'D13',
      reason: 'D17 duplicated D13; D13 is the canonical report-notice/t0 timing question.',
    }]);
    for (const id of ['D02', 'D06', 'D07', 'D09', 'D10', 'D12', 'D14', 'D15', 'D16']) {
      expect(register.decisions.find(decision => decision.id === id)?.status).toBe('OPEN');
    }
  });

  it('rejects a retired duplicate decision ID', () => {
    const register = createDefaultDecisionRegister();
    const duplicate = {
      ...register.decisions.find(decision => decision.id === 'D13')!,
      id: 'D17',
    };
    const result = DecisionRegisterSchema.safeParse({
      ...register,
      decisions: [...register.decisions, duplicate],
    });
    expect(result.success).toBe(false);
  });
});

describe('WP01 deployment bindings', () => {
  it('separates logical model family from synthetic deployment details', () => {
    expect(ModelFamilyReferenceSchema.parse({ family: 'MODEL_X' })).toEqual({ family: 'MODEL_X' });
    const synthetic = {
      logical_family: 'MODEL_X' as const,
      provider: 'synthetic',
      model_id: 'synthetic-model-x-v1',
      endpoint_ref: 'synthetic://model-x',
      deployment_id: 'fixture-model-x',
      revision: 'fixture-1',
      hosting: 'synthetic' as const,
      source: 'synthetic' as const,
      parameters: { temperature: 0.2 },
      unsupported_parameters: [],
    };
    expect(validateDeploymentBinding(synthetic, 'synthetic')).toEqual({ valid: true, issues: [] });
    expect(validateDeploymentBinding({ ...synthetic, model_id: null, endpoint_ref: null }, 'scientific').valid).toBe(false);
  });
});

describe('WP01 candidate prompt registry', () => {
  it('has versioned, hashed, deterministic provider-neutral candidates', () => {
    const registry = createPromptRegistry();
    expect(validatePromptRegistry(registry)).toEqual({ valid: true, issues: [] });
    expect(registry.namespace).toBe('phase1a-reimagining-humans-candidate');
    expect(registry.version).toBe('candidate-1');
    expect(registry.prompts.length).toBe(19);
    const first = registry.prompts[0]!;
    expect(first.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(renderPrompt(first, { participant_slot: 'P1', round: '1', topic: 'test topic' })).toBe(
      renderPrompt(first, { participant_slot: 'P1', round: '1', topic: 'test topic' }),
    );
    const serialized = JSON.stringify(registry).toLowerCase();
    expect(serialized).not.toMatch(/openai|bedrock|nvidia|qwen|deepseek|grok/);
  });

  it('keeps report treatment and no-report wording as the declared factor', () => {
    const registry = createPromptRegistry();
    const report = registry.prompts.find(prompt => prompt.id === 'report-anticipation');
    const noReport = registry.prompts.find(prompt => prompt.id === 'no-report-condition');
    expect(report?.text).toMatch(/report/i);
    expect(noReport?.text).toMatch(/report/i);
    expect(report?.id).not.toBe(noReport?.id);
    expect(report?.hash).not.toBe(noReport?.hash);
  });

  it('rejects private probe rendering when a public context is requested', () => {
    const registry = createPromptRegistry();
    const privatePrompt = registry.prompts.find(prompt => prompt.id === 'private-t0')!;
    expect(() => renderPrompt(privatePrompt, { participant_slot: 'P1', round: 't0', topic: 'topic', scope: 'public', private_probe_output: 'secret' })).toThrow(/private|scope/i);
  });

  it('keeps the t0 instrument identical across arms and free of report anticipation', () => {
    const registry = createPromptRegistry();
    const t0 = registry.prompts.find(prompt => prompt.id === 'private-t0')!;
    const rendered = renderPrompt(t0, { participant_slot: 'P1', round: 't0', topic: 'topic' });
    expect(t0.intended_constant_across_arms).toBe(true);
    expect(t0.factor_specific).toBe('none');
    expect(rendered).not.toMatch(/report|joint|prepare/i);
    expect(rendered).toBe('Privately state your current position on topic, the reasons supporting it, and what evidence would change it. This answer is not part of the public context.');
    expect(t0.hash).toBe(registry.prompts.find(prompt => prompt.id === 'private-t0')?.hash);
  });

  it('rejects a candidate whose text no longer matches its declared hash', () => {
    const registry = createPromptRegistry();
    const tampered = structuredClone(registry);
    tampered.prompts[0]!.text = `${tampered.prompts[0]!.text} Added wording.`;
    const result = validatePromptRegistry(tampered);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('prompt hash mismatch: common-participant');
    expect(result.issues).toContain('prompt registry hash mismatch');
  });
});

describe('WP01 synthetic manifests and public interface', () => {
  it('generates the selected twelve-run manifest without freezing the overall campaign', () => {
    const campaign = buildSyntheticCampaign({ report_notice_timing: SELECTED_REPORT_NOTICE_TIMING });
    expect(campaign.runs).toHaveLength(12);
    expect(campaign.runs.map(run => run.condition_id)).toEqual(['A', 'A', 'A', 'B', 'B', 'B', 'C', 'C', 'C', 'D', 'D', 'D']);
    expect(new Set(campaign.runs.map(run => run.replicate))).toEqual(new Set([1, 2, 3]));
    expect(campaign.lifecycle).toBe('IMPLEMENTATION_READY');
    expect(campaign.freeze_status).toBe('SCIENTIFIC_FREEZE_PENDING');
    expect(campaign.timing_disposition).toBe('SELECTED_METHOD');
    expect(campaign.study_contract.report_policy.notice_timing).toBe(SELECTED_REPORT_NOTICE_TIMING);
    expect(campaign.decision_register.decisions.find(decision => decision.id === 'D13')?.status).toBe('CONFIRMED');
    expect(validateCampaignManifest(campaign)).toEqual({ valid: true, issues: [] });
    expect(campaign.runs.every(run => run.bindings.every(binding => binding.source === 'synthetic'))).toBe(true);
    expect(campaign.runs.some(run => run.bindings.some(binding => binding.logical_family === 'MODEL_X'))).toBe(true);
    expect(campaign.runs[3]?.report_allocation_policy).toBe('UNRESOLVED');
    expect(campaign.runs[3]?.agenda.filter(stage => stage.kind === 'report_production').every(stage => stage.participant_slot === null)).toBe(true);
    expect(JSON.stringify(campaign)).not.toMatch(/"(message_id|provider_result|events)"\s*:/);
  });

  it('preserves the alternate sequence only as historical noncanonical evidence', () => {
    const before = buildSyntheticCampaign({ report_notice_timing: 'BEFORE_T0' });
    const after = buildSyntheticCampaign({ report_notice_timing: SELECTED_REPORT_NOTICE_TIMING });
    expect(before.decision_register_ref).toBe(after.decision_register_ref);
    expect(before.runs[3]?.report_notice_timing).toBe('BEFORE_T0');
    expect(before.timing_disposition).toBe('HISTORICAL_NONCANONICAL');
    expect(after.runs[3]?.report_notice_timing).toBe(SELECTED_REPORT_NOTICE_TIMING);
    expect(after.timing_disposition).toBe('SELECTED_METHOD');
    expect(before.freeze_status).toBe('SCIENTIFIC_FREEZE_PENDING');
    expect(after.freeze_status).toBe('SCIENTIFIC_FREEZE_PENDING');
    expect(validateCampaignManifest(before)).toEqual({ valid: true, issues: [] });
    expect(validateCampaignManifest(after)).toEqual({ valid: true, issues: [] });
  });

  it('rejects tampered manifests and unresolved real freeze bindings', () => {
    const campaign = buildSyntheticCampaign({ report_notice_timing: SELECTED_REPORT_NOTICE_TIMING });
    const tampered = structuredClone(campaign);
    tampered.runs[0]!.condition_id = 'D';
    expect(validateCampaignManifest(tampered).valid).toBe(false);
    const scientific = structuredClone(campaign);
    scientific.profile = 'scientific';
    expect(validateCampaignManifest(scientific).valid).toBe(false);
  });

  it('does not expose backend report metadata or private t0 responses in the public planning contract', () => {
    const campaign = buildSyntheticCampaign({ report_notice_timing: SELECTED_REPORT_NOTICE_TIMING });
    const reportRun = campaign.runs.find(run => run.condition_id === 'B')!;
    const t0Prompt = createPromptRegistry().prompts.find(prompt => prompt.id === 'private-t0')!;
    expect(reportRun.agenda.filter(stage => stage.id === 'T0')).toHaveLength(3);
    expect(reportRun.agenda.findIndex(stage => stage.id === 'T0')).toBeLessThan(reportRun.agenda.findIndex(stage => stage.id === 'REPORT_NOTICE'));
    expect(JSON.stringify(t0Prompt).toLowerCase()).not.toMatch(/report|joint/);
    expect(JSON.stringify(campaign).toLowerCase()).not.toMatch(/"(provider_result|message_id|events)"\s*:/);
  });

  it('requires timing disposition consistency and retains the selected sequence in each report run', () => {
    const selected = buildSyntheticCampaign({ report_notice_timing: SELECTED_REPORT_NOTICE_TIMING });
    expect(TimingDispositionSchema.parse(selected.timing_disposition)).toBe('SELECTED_METHOD');
    expect(selected.runs.filter(run => run.report_notice_timing !== 'NONE').every(run => run.report_notice_timing === SELECTED_REPORT_NOTICE_TIMING)).toBe(true);
    const historical = buildSyntheticCampaign({ report_notice_timing: 'BEFORE_T0' });
    expect(TimingDispositionSchema.parse(historical.timing_disposition)).toBe('HISTORICAL_NONCANONICAL');
    expect(historical.runs.filter(run => run.report_notice_timing !== 'NONE').every(run => run.report_notice_timing === 'BEFORE_T0')).toBe(true);
  });

  it('publishes the source-to-opportunity-to-context linkage contract', async () => {
    const source = await import('../src/phase1a/wp01/index.js');
    const link = source.SourceMessageLinkSchema.parse({
      source_message_id: 'msg-1',
      recipient_opportunity_id: 'opp-1',
      context_snapshot_id: 'ctx-1',
      visibility_scope: 'public',
    });
    expect(link).toMatchObject({ source_message_id: 'msg-1', recipient_opportunity_id: 'opp-1', context_snapshot_id: 'ctx-1' });
  });

  it('provides provider-adapter and fault-boundary contracts without implementing runtime', () => {
    expect(ProviderAdapterDescriptorSchema.parse({
      adapter_id: 'adapter-under-review',
      provider_name: 'unresolved',
      protocol: 'chat-completions-compatible',
      supports_logical_families: ['GEMMA', 'GEMINI'],
    }).adapter_id).toBe('adapter-under-review');
    const fixtures = createFaultBoundaryFixtures();
    expect(fixtures.map(fixture => fixture.fault_kind)).toEqual(['timeout', 'unavailable', 'invalid_response', 'permission_denied']);
    expect(fixtures.every(fixture => fixture.provider_call_executed === false)).toBe(true);
  });
});

describe('WP01 consumer documentation boundaries', () => {
  it('publishes an honest status for WP02-WP06', () => {
    for (const wp of ['wp02', 'wp03', 'wp04', 'wp05', 'wp06']) {
      const path = `src/phase1a/${wp}/README.md`;
      expect(existsSync(path)).toBe(true);
      const text = readFileSync(path, 'utf8');
      expect(text).toMatch(/implemented|awaiting[_ ]integration|pending/i);
      if (wp === 'wp02') expect(text).toMatch(/orchestration.*model-provider integration|model-provider integration.*orchestration/is);
      if (wp === 'wp03') expect(text).toMatch(/workshop.*report workflow|report workflow.*workshop/is);
    }
  });
});
