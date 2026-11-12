import { randomUUID } from 'node:crypto';
import { canonicalize, configHash, deepFreeze } from '../config/hash.js';
import {
  buildWorkshopPlan,
  contextForOperation,
  reportRoleEvidence,
  reportDisclosureBoundary,
  type Wp03Operation,
} from './wp03/workflow.js';
import { isRetriableProviderOutcome, validateProviderResponseAtBoundary } from './wp02/responseBoundary.js';
import { hasCanonicalWp01Admission, markCanonicalWp01Admission } from './wp02/admission.js';

export const PHASE1A_SCHEMA_VERSION = 'phase1a-0.2';
export type Visibility = 'public' | 'private-agent' | 'reviewer-isolated' | 'operator';
export type Cell = 'A' | 'B' | 'C' | 'D';
export type Outcome = 'success' | 'abstained' | 'refused' | 'timeout' | 'provider_error' | 'invalid_response' | 'rate_limit' | 'permission_denied';
export type RunState = 'CREATED' | 'T0' | 'ROUND_1' | 'ROUND_2' | 'ROUND_3' | 'ROUND_4' | 'ROUND_5' | 'ROUND_6' | 'T1' | 'REPORT_DRAFT' | 'REVIEW_1' | 'REVIEW_2' | 'REPORT_REVISED' | 'T2' | 'COMPLETE' | 'FAILED' | 'CANCELLED';

export interface Participant {
  id: string;
  provider: string;
  model: string;
  configuration: Readonly<Record<string, unknown>>;
}

export interface Phase1aManifest {
  manifestId: string;
  experimentId: string;
  contractVersion: string;
  source: Readonly<{
    adapterVersion: string;
    admissionClass: 'fixture' | 'engineering' | 'scientific';
    campaignHash: string;
    runManifestHash: string;
    adapterInputHash: string;
  }>;
  cell: Cell;
  replication: number;
  reportEnabled: boolean;
  participants: readonly [Participant, Participant, Participant];
  rounds: readonly [RoundDefinition, RoundDefinition, RoundDefinition, RoundDefinition, RoundDefinition, RoundDefinition];
  checkpoints: Readonly<{ t0: string; t1: string; t2: string }>;
  reportPrompts: Readonly<{ disclosure: string; draft: string; review1: string; review2: string; revision: string }>;
  speakingOrder: readonly (readonly [string, string, string])[];
  speakingOrderDecision: string;
  replayPolicy: Readonly<{ decisionId: string; mode: 'exact' | 'semantic'; tolerance: number }>;
  limits: Readonly<{ maxCalls: number; maxTokens: number; maxRetries: number }>;
  variations: readonly string[];
  approvedAt: string;
}

export interface RoundDefinition { number: 1 | 2 | 3 | 4 | 5 | 6; topic: 'human-problem' | 'redesign' | 'agent-role'; prompt: string }

export interface Phase1aEvent {
  schema_version: typeof PHASE1A_SCHEMA_VERSION;
  event_id: string;
  run_id: string;
  sequence: number;
  event_type: string;
  visibility: Visibility;
  actor_id: string;
  created_at: string;
  payload: Record<string, unknown>;
  artifact_refs: string[];
  previous_event_hash: string | null;
  event_hash: string;
}

export interface Phase1aArtifact {
  artifact_id: string;
  run_id: string;
  kind: string;
  visibility: Visibility;
  owner_id: string | null;
  content: string;
  content_hash: string;
  created_at: string;
}

export interface ProviderResponse {
  outcome: Outcome;
  provider: string;
  model: string;
  content: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
  finishReason: string | null;
  raw: Record<string, unknown>;
}

export interface ProviderCallSpec {
  operationKey: string;
  participantId: string;
  provider: string;
  model: string;
  configuration: Readonly<Record<string, unknown>>;
  systemPrompt: string;
  userPrompt: string;
  context: readonly { role: 'user' | 'assistant'; content: string; sourceArtifactId?: string }[];
  attempt: number;
}

export interface Phase1aProvider { invoke(spec: ProviderCallSpec): Promise<ProviderResponse> }

export interface ProviderCallRecord {
  call_id: string;
  run_id: string;
  operation_key: string;
  participant_id: string;
  provider: string;
  model: string;
  configuration: Record<string, unknown>;
  attempt: number;
  request_started_at: string;
  request_ended_at: string;
  terminal_status: Outcome;
  system_prompt_hash: string;
  user_prompt_hash: string;
  context_hash: string;
  raw_response_hash: string;
  raw_artifact_ref: string;
  request_artifact_ref: string;
  context_message_ids: string[];
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
  previous_attempt_ids: string[];
}

export interface DerivedMetric { name: string; value: number; source_event_ids: string[]; algorithm_version: string }

export interface EvidenceBundle {
  schema_version: typeof PHASE1A_SCHEMA_VERSION;
  manifest: Phase1aManifest;
  manifest_hash: string;
  events: Phase1aEvent[];
  artifacts: Phase1aArtifact[];
  provider_calls: ProviderCallRecord[];
  metrics: DerivedMetric[];
  artifacts_index: Array<{ artifact_id: string; kind: string; visibility: Visibility; content_hash: string }>;
  integrity: {
    valid: boolean;
    errors: string[];
    verified_at: string;
    event_count: number;
    event_head_hash: string | null;
    artifact_count: number;
    provider_call_count: number;
  };
}

export interface Phase1aPersistedSnapshot {
  runId: string;
  state: RunState;
  callsUsed: number;
  tokensUsed: number;
  bundle: EvidenceBundle;
}

export interface Phase1aStore {
  appendSnapshot(snapshot: Phase1aPersistedSnapshot): void;
  latestSnapshot(runId: string): Phase1aPersistedSnapshot | null;
}

const secretPattern = /(authorization\s*:\s*bearer|api[_-]?key|secret[_-]?key|password\s*[:=]|passwd\s*[:=]|sk-[a-z0-9_-]{8,})/i;

function clone<T>(value: T): T { return structuredClone(value); }
function id(prefix: string): string { return `${prefix}_${randomUUID()}`; }
function hash(value: unknown): string { return configHash(value); }
function isTechnical(outcome: Outcome): boolean { return ['timeout', 'provider_error', 'invalid_response', 'rate_limit', 'permission_denied'].includes(outcome); }

export function providerCallTokenCharge(usage: ProviderResponse['usage']): number {
  if (usage === null) return 1;
  return Math.max(1, (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0));
}

function assertSafeFixtureManifest(manifest: Phase1aManifest): void {
  if (manifest.source.adapterVersion !== 'fixture-v1') throw new Error('Fixture runs require the explicit fixture adapter identity');
  if (manifest.contractVersion !== '1A-0.1' || !manifest.approvedAt.trim()) throw new Error('Fixture runs require the approved fixture contract marker');
  const models = manifest.participants.map((participant) => participant.model);
  const expected = manifest.cell === 'A' || manifest.cell === 'B'
    ? ['gemma-fixture', 'gemma-fixture', 'gemma-fixture']
    : ['gemma-fixture', 'gemini-fixture', 'model-x-fixture'];
  if (canonicalize(models) !== canonicalize(expected)) throw new Error(`Fixture cell ${manifest.cell} does not match its declared model composition`);
}

export function createManifest(input: Phase1aManifest): Phase1aManifest {
  const copy = clone(input);
  if (!['A', 'B', 'C', 'D'].includes(copy.cell)) throw new Error('Phase 1A cell must be A, B, C, or D');
  if (!Number.isInteger(copy.replication) || copy.replication < 1 || copy.replication > 3) throw new Error('Phase 1A replication must be 1, 2, or 3');
  if (copy.participants.length !== 3 || new Set(copy.participants.map((p) => p.id)).size !== 3) throw new Error('Phase 1A requires exactly three unique participants');
  if (copy.rounds.length !== 6 || copy.rounds.some((round, index) => round.number !== index + 1)) throw new Error('Phase 1A requires exactly six ordered rounds');
  const expectedTopics = ['human-problem', 'human-problem', 'redesign', 'redesign', 'agent-role', 'agent-role'];
  if (copy.rounds.some((round, index) => round.topic !== expectedTopics[index])) throw new Error('Round topic families must follow the approved 2/2/2 sequence');
  if ((copy.cell === 'B' || copy.cell === 'D') !== copy.reportEnabled) throw new Error('Report condition must match the 2×2 cell');
  const uniqueModels = new Set(copy.participants.map((participant) => participant.model)).size;
  if ((copy.cell === 'A' || copy.cell === 'B') && uniqueModels !== 1) throw new Error('Cells A and B require a homogeneous three-model composition');
  if ((copy.cell === 'C' || copy.cell === 'D') && uniqueModels !== 3) throw new Error('Cells C and D require three heterogeneous model assignments');
  if (copy.speakingOrder.length !== 6) throw new Error('An approved speaking order is required for every round');
  const ids = copy.participants.map((p) => p.id).sort().join('|');
  for (const order of copy.speakingOrder) if (order.length !== 3 || [...order].sort().join('|') !== ids) throw new Error('Each speaking order must contain every participant exactly once');
  if (!copy.speakingOrderDecision || !copy.replayPolicy.decisionId) throw new Error('Open protocol choices must be supplied explicitly');
  if (Object.values(copy.reportPrompts).some((prompt) => !prompt.trim())) throw new Error('Report disclosure and workflow prompts must be supplied explicitly');
  if (!Number.isInteger(copy.limits.maxCalls) || copy.limits.maxCalls < 1
    || !Number.isInteger(copy.limits.maxRetries) || copy.limits.maxRetries < 0
    || !Number.isInteger(copy.limits.maxTokens) || copy.limits.maxTokens < 1) {
    throw new Error('Explicit finite integer limits are required');
  }
  if (!copy.approvedAt.trim()) throw new Error('An explicit approval marker is required');
  if (/\breport\b|\bjoint\b/i.test(copy.checkpoints.t0)) throw new Error('The t0 prompt must not anticipate the report condition');
  if (secretPattern.test(canonicalize(copy))) throw new Error('Secrets are forbidden in manifests and prompts');
  if (copy.source.admissionClass === 'fixture') assertSafeFixtureManifest(copy);
  return deepFreeze(copy);
}

export function createFixtureManifest(overrides: Partial<Phase1aManifest> = {}): Phase1aManifest {
  const participants: [Participant, Participant, Participant] = [
    { id: 'agent_1', provider: 'mock', model: 'gemma-fixture', configuration: { temperature: 0 } },
    { id: 'agent_2', provider: 'mock', model: 'gemini-fixture', configuration: { temperature: 0 } },
    { id: 'agent_3', provider: 'mock', model: 'model-x-fixture', configuration: { temperature: 0 } },
  ];
  const order: [string, string, string] = ['agent_1', 'agent_2', 'agent_3'];
  return createManifest({
    manifestId: 'manifest_phase1a_fixture', experimentId: 'agora_phase1a', contractVersion: '1A-0.1',
    source: { adapterVersion: 'fixture-v1', admissionClass: 'fixture', campaignHash: hash('fixture-campaign'), runManifestHash: hash('fixture-run'), adapterInputHash: hash('fixture-input') },
    cell: 'D', replication: 1,
    reportEnabled: true, participants,
    rounds: [
      { number: 1, topic: 'human-problem', prompt: 'Frame the human problem, round 1.' },
      { number: 2, topic: 'human-problem', prompt: 'Frame the human problem, round 2.' },
      { number: 3, topic: 'redesign', prompt: 'Propose a redesign, round 3.' },
      { number: 4, topic: 'redesign', prompt: 'Challenge the redesign, round 4.' },
      { number: 5, topic: 'agent-role', prompt: 'Define the role of agents, round 5.' },
      { number: 6, topic: 'agent-role', prompt: 'Conclude the role of agents, round 6.' },
    ],
    checkpoints: { t0: 'Private position before deliberation.', t1: 'Private position after round six.', t2: 'Private position after the revised report.' },
    reportPrompts: {
      disclosure: 'After the public discussion, your panel will produce and review a joint report.',
      draft: 'Draft a joint report.', review1: 'Review the draft independently.', review2: 'Review the draft independently.', revision: 'Revise using both reviews.',
    },
    speakingOrder: [order, order, order, order, order, order], speakingOrderDecision: 'DEC-03:test-fixture-explicit-order',
    replayPolicy: { decisionId: 'DEC-06:test-fixture-exact', mode: 'exact', tolerance: 0 },
    limits: { maxCalls: 40, maxTokens: 100_000, maxRetries: 1 }, variations: [], approvedAt: '2026-10-20T00:00:00.000Z',
    ...overrides,
  });
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return typeof value === 'string' && secretPattern.test(value) ? '[REDACTED]' : value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, /^(authorization|api[_-]?key|secret[_-]?key|access[_-]?token|refresh[_-]?token|bearer[_-]?token|session[_-]?token|token|password|passwd|pwd)$/i.test(key) ? '[REDACTED]' : redactSecrets(entry)]));
}

export class EvidenceLedger {
  readonly events: Phase1aEvent[] = [];
  readonly artifacts: Phase1aArtifact[] = [];
  readonly calls: ProviderCallRecord[] = [];
  readonly metrics: DerivedMetric[] = [];
  constructor(readonly runId: string, readonly manifest: Phase1aManifest, private readonly clock: () => string = () => new Date().toISOString(), private readonly rejectEvent?: (eventType: string) => boolean) {}

  append(eventType: string, visibility: Visibility, actorId: string, payload: Record<string, unknown> = {}, artifactRefs: string[] = []): Phase1aEvent {
    if (this.rejectEvent?.(eventType)) throw new Error(`Evidence persistence rejected ${eventType}`);
    const safePayload = redactSecrets(payload) as Record<string, unknown>;
    const base = {
      schema_version: PHASE1A_SCHEMA_VERSION, event_id: id('evt'), run_id: this.runId, sequence: this.events.length + 1,
      event_type: eventType, visibility, actor_id: actorId, created_at: this.clock(), payload: safePayload,
      artifact_refs: [...artifactRefs], previous_event_hash: this.events.at(-1)?.event_hash ?? null,
    };
    const event = deepFreeze({ ...base, event_hash: hash(base) }) as Phase1aEvent;
    this.events.push(event);
    return clone(event);
  }

  artifact(kind: string, visibility: Visibility, ownerId: string | null, content: string): Phase1aArtifact {
    if (visibility !== 'operator' && secretPattern.test(content)) throw new Error('Secrets are forbidden outside operator artifacts');
    const artifact = deepFreeze({ artifact_id: id('art'), run_id: this.runId, kind, visibility, owner_id: ownerId, content, content_hash: hash(content), created_at: this.clock() });
    this.artifacts.push(artifact);
    return clone(artifact);
  }

  providerCall(spec: ProviderCallSpec, response: ProviderResponse, startedAt: string, endedAt: string, requestRef: string, rawRef: string, previousAttemptIds: string[]): ProviderCallRecord {
    const call = deepFreeze({
      call_id: id('call'), run_id: this.runId, operation_key: spec.operationKey, participant_id: spec.participantId,
      provider: spec.provider, model: spec.model,
      configuration: clone(spec.configuration), attempt: spec.attempt,
      request_started_at: startedAt, request_ended_at: endedAt, terminal_status: response.outcome,
      system_prompt_hash: hash(spec.systemPrompt), user_prompt_hash: hash(spec.userPrompt), context_hash: hash(spec.context),
      raw_response_hash: hash(redactSecrets(response.raw)), raw_artifact_ref: rawRef, request_artifact_ref: requestRef,
      context_message_ids: spec.context.map((message) => message.sourceArtifactId).filter((value): value is string => typeof value === 'string'),
      usage: response.usage ?? null,
      previous_attempt_ids: [...previousAttemptIds],
    });
    this.calls.push(call);
    return clone(call);
  }

  metric(name: string, value: number, sourceEventIds: string[], algorithmVersion: string): DerivedMetric {
    if (!sourceEventIds.length || sourceEventIds.some((eventId) => !this.events.some((event) => event.event_id === eventId))) throw new Error('Metrics require valid source event ids');
    const metric = deepFreeze({ name, value, source_event_ids: [...sourceEventIds], algorithm_version: algorithmVersion });
    this.metrics.push(metric);
    return clone(metric);
  }

  publicHistory(): Phase1aArtifact[] { return this.artifacts.filter((artifact) => artifact.visibility === 'public').map(clone); }
  ownedPrivate(agentId: string): Phase1aArtifact[] { return this.artifacts.filter((artifact) => artifact.visibility === 'private-agent' && artifact.owner_id === agentId).map(clone); }
  byKind(kind: string): Phase1aArtifact[] { return this.artifacts.filter((artifact) => artifact.kind === kind).map(clone); }
  hasCommitted(key: string): boolean { return this.events.some((event) => event.event_type === 'operation.committed' && event.payload.operation_key === key); }

  bundle(): EvidenceBundle {
    const integrity = verifyIntegrity(this.events, this.artifacts);
    return clone({
      schema_version: PHASE1A_SCHEMA_VERSION, manifest: this.manifest, manifest_hash: hash(this.manifest), events: this.events,
      artifacts: this.artifacts, provider_calls: this.calls, metrics: this.metrics,
      artifacts_index: this.artifacts.map(({ artifact_id, kind, visibility, content_hash }) => ({ artifact_id, kind, visibility, content_hash })),
      integrity: {
        ...integrity,
        verified_at: this.clock(),
        event_count: this.events.length,
        event_head_hash: this.events.at(-1)?.event_hash ?? null,
        artifact_count: this.artifacts.length,
        provider_call_count: this.calls.length,
      },
    });
  }

  static restore(bundle: EvidenceBundle, rejectEvent?: (eventType: string) => boolean): EvidenceLedger {
    const check = verifyEvidenceBundle(bundle);
    if (!check.valid) throw new Error(`Cannot restore invalid evidence: ${check.errors.join(', ')}`);
    const ledger = new EvidenceLedger(bundle.events[0]?.run_id ?? id('run'), createManifest(bundle.manifest), () => new Date().toISOString(), rejectEvent);
    ledger.events.push(...clone(bundle.events)); ledger.artifacts.push(...clone(bundle.artifacts)); ledger.calls.push(...clone(bundle.provider_calls)); ledger.metrics.push(...clone(bundle.metrics));
    return ledger;
  }
}

export function verifyIntegrity(events: Phase1aEvent[], artifacts: Phase1aArtifact[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let previous: string | null = null;
  events.forEach((event, index) => {
    if (event.sequence !== index + 1) errors.push(`sequence:${index + 1}`);
    if (event.previous_event_hash !== previous) errors.push(`previous_hash:${event.event_id}`);
    const { event_hash: _ignored, ...base } = event;
    if (hash(base) !== event.event_hash) errors.push(`event_hash:${event.event_id}`);
    previous = event.event_hash;
  });
  for (const artifact of artifacts) if (hash(artifact.content) !== artifact.content_hash) errors.push(`artifact_hash:${artifact.artifact_id}`);
  return { valid: errors.length === 0, errors };
}

export function verifyEvidenceBundle(bundle: EvidenceBundle): { valid: boolean; errors: string[] } {
  const result = verifyIntegrity(bundle.events, bundle.artifacts);
  const errors = [...result.errors];
  if (bundle.schema_version !== PHASE1A_SCHEMA_VERSION) errors.push('schema_version');
  try { createManifest(bundle.manifest); }
  catch { errors.push('manifest_contract'); }
  if (hash(bundle.manifest) !== bundle.manifest_hash) errors.push('manifest_hash');
  const eventIds = new Set(bundle.events.map((event) => event.event_id));
  const artifactIds = new Set(bundle.artifacts.map((artifact) => artifact.artifact_id));
  const callIds = new Set(bundle.provider_calls.map((call) => call.call_id));
  const runIds = new Set(bundle.events.map((event) => event.run_id));
  const runId = bundle.events[0]?.run_id;
  if (!runId || runIds.size !== 1) errors.push('run_id');
  if (eventIds.size !== bundle.events.length) errors.push('duplicate_event_id');
  if (artifactIds.size !== bundle.artifacts.length) errors.push('duplicate_artifact_id');
  if (callIds.size !== bundle.provider_calls.length) errors.push('duplicate_call_id');
  const expectedIndex = bundle.artifacts.map(({ artifact_id, kind, visibility, content_hash }) => ({ artifact_id, kind, visibility, content_hash }));
  if (canonicalize(bundle.artifacts_index) !== canonicalize(expectedIndex)) errors.push('artifacts_index');
  for (const event of bundle.events) {
    if (event.schema_version !== PHASE1A_SCHEMA_VERSION) errors.push(`event_schema_version:${event.event_id}`);
    if (event.run_id !== runId) errors.push(`event_run_id:${event.event_id}`);
    for (const ref of event.artifact_refs) if (!artifactIds.has(ref)) errors.push(`event_artifact_ref:${event.event_id}:${ref}`);
  }
  for (const artifact of bundle.artifacts) if (artifact.run_id !== runId) errors.push(`artifact_run_id:${artifact.artifact_id}`);
  for (const metric of bundle.metrics) {
    for (const ref of metric.source_event_ids) if (!eventIds.has(ref)) errors.push(`metric_event_ref:${metric.name}:${ref}`);
  }
  for (const call of bundle.provider_calls) {
    if (call.run_id !== runId) errors.push(`call_run_id:${call.call_id}`);
    const requestArtifact = bundle.artifacts.find((artifact) => artifact.artifact_id === call.request_artifact_ref);
    const rawArtifact = bundle.artifacts.find((artifact) => artifact.artifact_id === call.raw_artifact_ref);
    if (!requestArtifact || requestArtifact.kind !== 'provider.request' || requestArtifact.visibility !== 'operator') {
      errors.push(`call_request_ref:${call.call_id}`);
      continue;
    }
    if (!rawArtifact || rawArtifact.kind !== 'provider.raw' || rawArtifact.visibility !== 'operator') {
      errors.push(`call_raw_ref:${call.call_id}`);
      continue;
    }
    let request: ProviderCallSpec | null = null;
    try { request = JSON.parse(requestArtifact.content) as ProviderCallSpec; }
    catch { errors.push(`call_request_json:${call.call_id}`); }
    if (request) {
      const checks: Array<[string, unknown, unknown]> = [
        ['operation_key', request.operationKey, call.operation_key],
        ['participant_id', request.participantId, call.participant_id],
        ['provider', request.provider, call.provider],
        ['model', request.model, call.model],
        ['configuration', request.configuration, call.configuration],
        ['attempt', request.attempt, call.attempt],
        ['system_prompt_hash', hash(request.systemPrompt), call.system_prompt_hash],
        ['user_prompt_hash', hash(request.userPrompt), call.user_prompt_hash],
        ['context_hash', hash(request.context), call.context_hash],
        ['context_message_ids', request.context.map((message) => message.sourceArtifactId).filter((value): value is string => typeof value === 'string'), call.context_message_ids],
      ];
      for (const [name, expected, actual] of checks) if (canonicalize(expected) !== canonicalize(actual)) errors.push(`call_${name}:${call.call_id}`);
    }
    try {
      if (hash(JSON.parse(rawArtifact.content)) !== call.raw_response_hash) errors.push(`call_raw_hash:${call.call_id}`);
    } catch { errors.push(`call_raw_json:${call.call_id}`); }
    for (const previousId of call.previous_attempt_ids) {
      const previous = bundle.provider_calls.find((candidate) => candidate.call_id === previousId);
      if (!previous || previous.operation_key !== call.operation_key || previous.attempt >= call.attempt) errors.push(`call_retry_ref:${call.call_id}:${previousId}`);
    }
    const terminalEvent = bundle.events.find((event) =>
      (event.event_type === 'provider_call.completed' || event.event_type === 'provider_call.failed')
      && event.payload.call_id === call.call_id
      && event.payload.operation_key === call.operation_key
      && event.payload.attempt === call.attempt
      && event.payload.outcome === call.terminal_status,
    );
    if (!terminalEvent) errors.push(`call_terminal_event:${call.call_id}`);
    else {
      if (terminalEvent.actor_id !== call.participant_id) errors.push(`call_terminal_actor:${call.call_id}`);
      if (canonicalize(terminalEvent.artifact_refs) !== canonicalize([call.raw_artifact_ref])) errors.push(`call_terminal_artifact:${call.call_id}`);
    }
  }
  const createdEvents = bundle.events.filter((event) => event.event_type === 'run.created');
  if (createdEvents.length !== 1) errors.push('run_created_count');
  const created = createdEvents[0];
  if (created && created.payload.manifest_hash !== bundle.manifest_hash) errors.push('run_created_manifest_hash');

  let plan: ReturnType<typeof buildWorkshopPlan> | null = null;
  try { plan = buildWorkshopPlan(bundle.manifest); }
  catch { /* manifest_contract already records the invalid contract */ }
  if (plan) {
    const expectedByKey = new Map(plan.operations.map((operation) => [operation.key, operation]));
    const allocations = bundle.events.filter((event) => event.event_type === 'report.roles_allocated');
    if (plan.reportAllocation) {
      if (allocations.length !== 1) errors.push('report_role_allocation_count');
      else if (canonicalize(allocations[0]!.payload) !== canonicalize(reportRoleEvidence(plan.reportAllocation))) errors.push('report_role_allocation');
    } else if (allocations.length !== 0) errors.push('report_role_allocation_unexpected');

    for (const call of bundle.provider_calls) {
      const operation = expectedByKey.get(call.operation_key);
      if (!operation) {
        errors.push(`call_operation_key:${call.call_id}`);
        continue;
      }
      const participant = bundle.manifest.participants.find((candidate) => candidate.id === operation.participantId);
      if (call.participant_id !== operation.participantId) errors.push(`call_operation_participant:${call.call_id}`);
      if (!participant || call.provider !== participant.provider) errors.push(`call_operation_provider:${call.call_id}`);
      if (!participant || call.model !== participant.model) errors.push(`call_operation_model:${call.call_id}`);
      if (!participant || canonicalize(call.configuration) !== canonicalize(participant.configuration)) errors.push(`call_operation_configuration:${call.call_id}`);

      const requestArtifact = bundle.artifacts.find((artifact) => artifact.artifact_id === call.request_artifact_ref);
      const rawArtifact = bundle.artifacts.find((artifact) => artifact.artifact_id === call.raw_artifact_ref);
      if (requestArtifact?.owner_id !== operation.participantId) errors.push(`call_request_owner:${call.call_id}`);
      if (rawArtifact?.owner_id !== operation.participantId) errors.push(`call_raw_owner:${call.call_id}`);
      const started = bundle.events.filter((event) =>
        event.event_type === 'provider_call.started'
        && event.payload.operation_key === call.operation_key
        && event.payload.attempt === call.attempt
        && event.payload.request_artifact_ref === call.request_artifact_ref,
      );
      if (started.length !== 1 || started[0]!.actor_id !== operation.participantId || canonicalize(started[0]!.artifact_refs) !== canonicalize([call.request_artifact_ref])) {
        errors.push(`call_started_event:${call.call_id}`);
      }
      if (requestArtifact && started.length === 1) {
        try {
          const request = JSON.parse(requestArtifact.content) as ProviderCallSpec;
          const availableArtifactIds = new Set(bundle.events
            .filter((event) => event.sequence < started[0]!.sequence)
            .flatMap((event) => event.artifact_refs));
          const availableArtifacts = bundle.artifacts.filter((artifact) => availableArtifactIds.has(artifact.artifact_id));
          const expectedContext = contextForOperation(availableArtifacts, operation);
          if (request.systemPrompt !== operation.system) errors.push(`call_operation_system_prompt:${call.call_id}`);
          if (request.userPrompt !== operation.prompt) errors.push(`call_operation_user_prompt:${call.call_id}`);
          if (canonicalize(request.context) !== canonicalize(expectedContext)) errors.push(`call_operation_context:${call.call_id}`);
        } catch {
          errors.push(`call_operation_request:${call.call_id}`);
        }
      }
    }

    const callsByOperation = new Map<string, ProviderCallRecord[]>();
    for (const call of bundle.provider_calls) {
      const calls = callsByOperation.get(call.operation_key) ?? [];
      calls.push(call);
      callsByOperation.set(call.operation_key, calls);
    }
    for (const [operationKey, calls] of callsByOperation) {
      const ordered = [...calls].sort((left, right) => left.attempt - right.attempt);
      ordered.forEach((call, index) => {
        if (call.attempt !== index + 1) errors.push(`call_attempt_sequence:${call.call_id}`);
        const expectedPrevious = ordered.slice(0, index).map((previous) => previous.call_id);
        if (canonicalize(call.previous_attempt_ids) !== canonicalize(expectedPrevious)) errors.push(`call_retry_chain:${call.call_id}`);
      });
      if (!expectedByKey.has(operationKey)) continue;
      const terminalCalls = ordered.filter((call) => !isTechnical(call.terminal_status));
      if (terminalCalls.length > 1) errors.push(`operation_terminal_call_count:${operationKey}`);
      if (terminalCalls.length === 1 && terminalCalls[0] !== ordered.at(-1)) errors.push(`operation_terminal_call_order:${operationKey}`);
    }

    const committed = bundle.events.filter((event) => event.event_type === 'operation.committed');
    for (let index = 0; index < committed.length; index += 1) {
      const event = committed[index]!;
      const expected = plan.operations[index];
      if (!expected || event.payload.operation_key !== expected.key || event.payload.state !== expected.state) {
        errors.push(`operation_commit_order:${event.event_id}`);
        continue;
      }
      if (event.artifact_refs.length !== 1) errors.push(`operation_commit_artifact_count:${event.event_id}`);
      const artifact = bundle.artifacts.find((candidate) => candidate.artifact_id === event.artifact_refs[0]);
      if (!artifact || artifact.kind !== expected.kind || artifact.visibility !== expected.visibility || artifact.owner_id !== expected.ownerId) {
        errors.push(`operation_commit_artifact:${event.event_id}`);
      }
      const completed = bundle.events.filter((candidate) => candidate.event_type === `${expected.kind}.completed` && candidate.payload.operation_key === expected.key);
      if (completed.length !== 1
        || completed[0]!.actor_id !== expected.participantId
        || completed[0]!.visibility !== expected.visibility
        || canonicalize(completed[0]?.artifact_refs ?? []) !== canonicalize(event.artifact_refs)) {
        errors.push(`operation_completion_link:${event.event_id}`);
      }
      const calls = callsByOperation.get(expected.key) ?? [];
      const terminal = calls.at(-1);
      if (!terminal || isTechnical(terminal.terminal_status) || completed[0]?.payload.outcome !== terminal.terminal_status) {
        errors.push(`operation_terminal_evidence:${event.event_id}`);
      }
    }
    if (bundle.events.some((event) => event.event_type === 'run.completed') && committed.length !== plan.operations.length) errors.push('completed_operation_count');
  }

  if (bundle.integrity.valid !== true || bundle.integrity.errors.length !== 0) errors.push('declared_integrity');
  if (!Number.isFinite(Date.parse(bundle.integrity.verified_at))) errors.push('integrity_verified_at');
  if (bundle.integrity.event_count !== bundle.events.length) errors.push('integrity_event_count');
  if (bundle.integrity.event_head_hash !== (bundle.events.at(-1)?.event_hash ?? null)) errors.push('integrity_event_head_hash');
  if (bundle.integrity.artifact_count !== bundle.artifacts.length) errors.push('integrity_artifact_count');
  if (bundle.integrity.provider_call_count !== bundle.provider_calls.length) errors.push('integrity_provider_call_count');
  return { valid: errors.length === 0, errors };
}

type Operation = Wp03Operation;
interface RunRecord { manifest: Phase1aManifest; ledger: EvidenceLedger; state: RunState; callsUsed: number; tokensUsed: number }

function contextFor(record: RunRecord, operation: Operation): Array<{ role: 'user' | 'assistant'; content: string; sourceArtifactId?: string }> {
  return contextForOperation(record.ledger.artifacts, operation);
}

function operationPlan(manifest: Phase1aManifest): Operation[] {
  return buildWorkshopPlan(manifest).operations;
}

export class Phase1aRuntime {
  private readonly runs = new Map<string, RunRecord>();
  constructor(private readonly clock: () => string = () => new Date().toISOString(), private readonly store?: Phase1aStore) {}

  private persist(record: RunRecord): void {
    this.store?.appendSnapshot({
      runId: record.ledger.runId,
      state: record.state,
      callsUsed: record.callsUsed,
      tokensUsed: record.tokensUsed,
      bundle: record.ledger.bundle(),
    });
  }

  createRun(manifestInput: Phase1aManifest, rejectEvent?: (eventType: string) => boolean): string {
    const canonicallyAdmitted = hasCanonicalWp01Admission(manifestInput);
    const manifest = createManifest(manifestInput);
    if (manifest.source.admissionClass !== 'fixture' && !canonicallyAdmitted) {
      throw new Error('Non-fixture Phase 1A execution requires canonical WP01 adapter admission');
    }
    const runId = id('run');
    const ledger = new EvidenceLedger(runId, manifest, this.clock, rejectEvent);
    const workshopPlan = buildWorkshopPlan(manifest);
    ledger.append('run.created', 'public', 'host', {
      manifest_hash: hash(manifest), report_enabled: manifest.reportEnabled,
      wp03_workflow_version: workshopPlan.workflowVersion,
      source_campaign_hash: manifest.source.campaignHash,
      source_run_manifest_hash: manifest.source.runManifestHash,
      adapter_input_hash: manifest.source.adapterInputHash,
    });
    if (workshopPlan.reportAllocation) {
      ledger.append('report.roles_allocated', 'operator', 'host', { ...reportRoleEvidence(workshopPlan.reportAllocation) });
    }
    for (const variation of manifest.variations) ledger.append('protocol_deviation.recorded', 'public', 'host', { variation, preserved: true });
    const record = { manifest, ledger, state: 'CREATED' as RunState, callsUsed: 0, tokensUsed: 0 };
    this.runs.set(runId, record);
    this.persist(record);
    return runId;
  }

  repeatCompletedRun(source: EvidenceBundle): string {
    const verification = verifyEvidenceBundle(source);
    if (!verification.valid || inferState(source.events) !== 'COMPLETE') throw new Error('Repeat requires a valid completed source run');
    const sourceRunId = source.events[0]?.run_id;
    if (!sourceRunId) throw new Error('Repeat source has no run id');
    const runId = this.createRun(source.manifest.source.admissionClass === 'fixture' ? source.manifest : markCanonicalWp01Admission(source.manifest));
    const record = this.required(runId);
    record.ledger.append('run.repeated', 'public', 'host', {
      source_run_id: sourceRunId,
      source_manifest_hash: source.manifest_hash,
    });
    this.persist(record);
    return runId;
  }

  restore(bundle: EvidenceBundle): string {
    const ledger = EvidenceLedger.restore(bundle);
    const state = inferState(bundle.events);
    const record = { manifest: ledger.manifest, ledger, state, callsUsed: ledger.calls.length, tokensUsed: ledger.calls.reduce((sum, call) => sum + providerCallTokenCharge(call.usage), 0) };
    this.runs.set(ledger.runId, record);
    this.persist(record);
    return ledger.runId;
  }

  restoreFromStore(runId: string): string {
    const snapshot = this.store?.latestSnapshot(runId);
    if (!snapshot) throw new Error(`No durable Phase 1A snapshot for ${runId}`);
    const restoredId = this.restore(snapshot.bundle);
    const record = this.required(restoredId);
    record.state = snapshot.state;
    record.callsUsed = snapshot.callsUsed;
    record.tokensUsed = snapshot.tokensUsed;
    return restoredId;
  }

  state(runId: string): RunState { return this.required(runId).state; }
  evidence(runId: string): EvidenceBundle { return this.required(runId).ledger.bundle(); }
  exportEvidence(runId: string): EvidenceBundle { return this.evidence(runId); }
  async dispatch(provider: Phase1aProvider, spec: ProviderCallSpec): Promise<ProviderResponse> { return provider.invoke(spec); }
  async advance(runId: string, provider: Phase1aProvider): Promise<RunState> { return this.run(runId, provider, { stopAfterOperations: 1, markInterrupted: false }); }
  resume(bundle: EvidenceBundle): { runId: string; state: RunState } { const runId = this.restore(bundle); return { runId, state: this.state(runId) }; }

  async run(runId: string, provider: Phase1aProvider, options: { stopAfterOperations?: number; markInterrupted?: boolean } = {}): Promise<RunState> {
    const record = this.required(runId);
    if (record.state === 'FAILED' || record.state === 'CANCELLED' || record.state === 'COMPLETE') return record.state;
    let committedThisInvocation = 0;
    for (const operation of operationPlan(record.manifest)) {
      if (record.ledger.hasCommitted(operation.key)) continue;
      if (options.stopAfterOperations !== undefined && committedThisInvocation >= options.stopAfterOperations) {
        if (options.markInterrupted !== false) {
          record.ledger.append('run.interrupted', 'operator', 'host', { after_operations: committedThisInvocation });
          this.persist(record);
        }
        return record.state;
      }
      if (operation.key.startsWith('round:1:')) this.discloseReportRequirement(record);
      const completed = await this.perform(record, operation, provider);
      if (!completed) return record.state;
      committedThisInvocation += 1;
    }
    if (!record.ledger.events.some((event) => event.event_type === 'run.completed')) {
      const integrity = verifyIntegrity(record.ledger.events, record.ledger.artifacts);
      record.ledger.append('validation.integrity_passed', 'operator', 'host', { valid: integrity.valid, errors: integrity.errors });
      record.ledger.append('run.completed', 'public', 'host', { operations: operationPlan(record.manifest).length });
      record.state = 'COMPLETE';
      this.persist(record);
    }
    return record.state;
  }

  private discloseReportRequirement(record: RunRecord): void {
    const alreadyDisclosed = record.ledger.events.some((event) => event.event_type === 'report_requirement.disclosed');
    const committedKeys = record.ledger.events
      .filter((event) => event.event_type === 'operation.committed')
      .map((event) => String(event.payload.operation_key));
    if (reportDisclosureBoundary(record.manifest, committedKeys, alreadyDisclosed) === 'skip') return;
    const t0Commits = record.manifest.participants.map((participant) =>
      record.ledger.events.find((event) => event.event_type === 'operation.committed' && event.payload.operation_key === `t0:${participant.id}`),
    );
    const artifact = record.ledger.artifact('condition.report-disclosure', 'public', null, record.manifest.reportPrompts.disclosure);
    record.ledger.append('report_requirement.disclosed', 'public', 'host', {
      condition: record.manifest.cell,
      after_t0_event_ids: t0Commits.map((event) => event!.event_id),
      disclosure_hash: artifact.content_hash,
    }, [artifact.artifact_id]);
    this.persist(record);
  }

  private async perform(record: RunRecord, operation: Operation, provider: Phase1aProvider): Promise<boolean> {
    const context = contextFor(record, operation);
    if (context.some((message) => secretPattern.test(message.content))) throw new Error('Secret leakage detected while assembling context');
    record.ledger.append('state_transition.started', 'operator', 'host', { operation_key: operation.key, to_state: operation.state });
    this.persist(record);
    const previousAttemptIds: string[] = [];
    for (let attempt = 1; attempt <= record.manifest.limits.maxRetries + 1; attempt += 1) {
      if (record.callsUsed >= record.manifest.limits.maxCalls || record.tokensUsed >= record.manifest.limits.maxTokens) {
        record.ledger.append('budget.exhausted', 'operator', 'host', { calls_used: record.callsUsed, tokens_used: record.tokensUsed, context_hash: hash(context) });
        record.ledger.append('run.failed', 'public', 'host', { reason: 'budget_exhausted' }); record.state = 'FAILED'; this.persist(record); return false;
      }
      const participant = record.manifest.participants.find((entry) => entry.id === operation.participantId);
      if (!participant) throw new Error(`Unknown Phase 1A participant ${operation.participantId}`);
      const spec: ProviderCallSpec = { operationKey: operation.key, participantId: operation.participantId, provider: participant.provider, model: participant.model, configuration: clone(participant.configuration), systemPrompt: operation.system, userPrompt: operation.prompt, context, attempt };
      const startedAt = this.clock();
      const request = record.ledger.artifact('provider.request', 'operator', operation.participantId, canonicalize(redactSecrets(spec)));
      record.ledger.append('provider_call.started', 'operator', operation.participantId, { operation_key: operation.key, attempt, context_hash: hash(context), request_artifact_ref: request.artifact_id }, [request.artifact_id]);
      this.persist(record);
      let response: ProviderResponse;
      try { response = await provider.invoke(spec); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
        const outcome: Outcome = /permission[_ -]?denied/i.test(`${code} ${message}`) ? 'permission_denied' : 'provider_error';
        response = { outcome, provider: spec.provider, model: spec.model, content: null, usage: null, finishReason: null, raw: { error: message, error_code: code || null } };
      }
      response = validateProviderResponseAtBoundary(spec, response);
      const endedAt = this.clock(); record.callsUsed += 1;
      record.tokensUsed += providerCallTokenCharge(response.usage);
      const raw = record.ledger.artifact('provider.raw', 'operator', operation.participantId, canonicalize(redactSecrets(response.raw)));
      const call = record.ledger.providerCall(spec, response, startedAt, endedAt, request.artifact_id, raw.artifact_id, previousAttemptIds);
      previousAttemptIds.push(call.call_id);
      record.ledger.append(`provider_call.${isTechnical(response.outcome) ? 'failed' : 'completed'}`, 'operator', operation.participantId, { operation_key: operation.key, attempt, outcome: response.outcome, call_id: call.call_id }, [raw.artifact_id]);
      if (isTechnical(response.outcome)) {
        if (isRetriableProviderOutcome(response.outcome) && attempt <= record.manifest.limits.maxRetries) { record.ledger.append('retry.scheduled', 'operator', 'host', { operation_key: operation.key, failed_call_id: call.call_id, next_attempt: attempt + 1 }); this.persist(record); continue; }
        record.ledger.append('run.failed', 'public', 'host', { reason: response.outcome, operation_key: operation.key }); record.state = 'FAILED'; this.persist(record); return false;
      }
      const content = response.content ?? `[${response.outcome}]`;
      const artifact = record.ledger.artifact(operation.kind, operation.visibility, operation.ownerId, content);
      record.ledger.append(`${operation.kind}.completed`, operation.visibility, operation.participantId, { operation_key: operation.key, outcome: response.outcome }, [artifact.artifact_id]);
      record.ledger.append('operation.committed', 'operator', 'host', { operation_key: operation.key, state: operation.state }, [artifact.artifact_id]);
      record.state = operation.state;
      this.persist(record);
      return true;
    }
    return false;
  }

  private required(runId: string): RunRecord { const record = this.runs.get(runId); if (!record) throw new Error(`Unknown run ${runId}`); return record; }
}

export function inferState(events: Phase1aEvent[]): RunState {
  if (events.some((event) => event.event_type === 'run.completed')) return 'COMPLETE';
  if (events.some((event) => event.event_type === 'run.failed')) return 'FAILED';
  const state = [...events].reverse().find((event) => event.event_type === 'operation.committed')?.payload.state;
  return typeof state === 'string' ? state as RunState : 'CREATED';
}

export function replayEvidence(bundle: EvidenceBundle): { valid: boolean; state: RunState; transitions: Array<{ operation: string; state: RunState; eventId: string }> } {
  const integrity = verifyEvidenceBundle(bundle);
  return {
    valid: integrity.valid,
    state: integrity.valid ? inferState(bundle.events) : 'FAILED',
    transitions: bundle.events.filter((event) => event.event_type === 'operation.committed').map((event) => ({ operation: String(event.payload.operation_key), state: event.payload.state as RunState, eventId: event.event_id })),
  };
}

export class DeterministicMockProvider implements Phase1aProvider {
  readonly calls: ProviderCallSpec[] = [];
  constructor(private readonly scripted: Record<string, Outcome[]> = {}) {}
  async invoke(spec: ProviderCallSpec): Promise<ProviderResponse> {
    this.calls.push(clone(spec));
    const outcomes = this.scripted[spec.operationKey] ?? ['success'];
    const outcome = outcomes[Math.min(spec.attempt - 1, outcomes.length - 1)] ?? 'success';
    return { outcome, provider: spec.provider, model: spec.model, content: isTechnical(outcome) ? null : `${spec.operationKey}:${outcome}`, usage: { inputTokens: 10, outputTokens: 5 }, finishReason: outcome, raw: { fixture: true, operation: spec.operationKey, outcome } };
  }
}

export { Phase1aSqliteStore } from './sqliteStore.js';
