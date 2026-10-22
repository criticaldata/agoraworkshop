import { randomUUID } from 'node:crypto';
import { canonicalize, configHash, deepFreeze } from '../config/hash.js';

export const PHASE1A_SCHEMA_VERSION = 'phase1a-0.1';
export type Visibility = 'public' | 'private-agent' | 'reviewer-isolated' | 'operator';
export type Cell = 'A' | 'B' | 'C' | 'D';
export type Outcome = 'success' | 'abstained' | 'refused' | 'timeout' | 'provider_error' | 'invalid_response' | 'rate_limit';
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
  integrity: { valid: boolean; errors: string[]; verified_at: string };
}

const secretPattern = /(authorization\s*:\s*bearer|api[_-]?key|secret[_-]?key|sk-[a-z0-9_-]{8,})/i;

function clone<T>(value: T): T { return structuredClone(value); }
function id(prefix: string): string { return `${prefix}_${randomUUID()}`; }
function hash(value: unknown): string { return configHash(value); }
function isTechnical(outcome: Outcome): boolean { return ['timeout', 'provider_error', 'invalid_response', 'rate_limit'].includes(outcome); }

export function createManifest(input: Phase1aManifest): Phase1aManifest {
  const copy = clone(input);
  if (copy.participants.length !== 3 || new Set(copy.participants.map((p) => p.id)).size !== 3) throw new Error('Phase 1A requires exactly three unique participants');
  if (copy.rounds.length !== 6 || copy.rounds.some((round, index) => round.number !== index + 1)) throw new Error('Phase 1A requires exactly six ordered rounds');
  const expectedTopics = ['human-problem', 'human-problem', 'redesign', 'redesign', 'agent-role', 'agent-role'];
  if (copy.rounds.some((round, index) => round.topic !== expectedTopics[index])) throw new Error('Round topic families must follow the approved 2/2/2 sequence');
  if ((copy.cell === 'B' || copy.cell === 'D') !== copy.reportEnabled) throw new Error('Report condition must match the 2×2 cell');
  const uniqueModels = new Set(copy.participants.map((participant) => participant.model)).size;
  if ((copy.cell === 'A' || copy.cell === 'B') && uniqueModels !== 1) throw new Error('Cells A and B require a homogeneous three-model composition');
  if ((copy.cell === 'C' || copy.cell === 'D') && uniqueModels < 2) throw new Error('Cells C and D require a heterogeneous model composition');
  if (copy.speakingOrder.length !== 6) throw new Error('An approved speaking order is required for every round');
  const ids = copy.participants.map((p) => p.id).sort().join('|');
  for (const order of copy.speakingOrder) if (order.length !== 3 || [...order].sort().join('|') !== ids) throw new Error('Each speaking order must contain every participant exactly once');
  if (!copy.speakingOrderDecision || !copy.replayPolicy.decisionId) throw new Error('Open protocol choices must be supplied explicitly');
  if (Object.values(copy.reportPrompts).some((prompt) => !prompt.trim())) throw new Error('Report disclosure and workflow prompts must be supplied explicitly');
  if (copy.limits.maxCalls < 1 || copy.limits.maxRetries < 0 || copy.limits.maxTokens < 1) throw new Error('Explicit positive limits are required');
  if (secretPattern.test(canonicalize(copy))) throw new Error('Secrets are forbidden in manifests and prompts');
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
    manifestId: 'manifest_phase1a_fixture', experimentId: 'agora_phase1a', contractVersion: '1A-0.1', cell: 'D', replication: 1,
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
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, /secret|token|authorization|api.?key/i.test(key) ? '[REDACTED]' : redactSecrets(entry)]));
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
      provider: response.provider, model: response.model,
      configuration: clone(this.manifest.participants.find((participant) => participant.id === spec.participantId)?.configuration ?? {}), attempt: spec.attempt,
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
      integrity: { ...integrity, verified_at: this.clock() },
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
  if (hash(bundle.manifest) !== bundle.manifest_hash) errors.push('manifest_hash');
  if (bundle.artifacts_index.length !== bundle.artifacts.length) errors.push('artifacts_index');
  return { valid: errors.length === 0, errors };
}

interface Operation { key: string; state: RunState; kind: string; participantId: string; visibility: Visibility; ownerId: string | null; system: string; prompt: string }
interface RunRecord { manifest: Phase1aManifest; ledger: EvidenceLedger; state: RunState; callsUsed: number; tokensUsed: number }

function contextFor(record: RunRecord, operation: Operation): Array<{ role: 'user' | 'assistant'; content: string; sourceArtifactId?: string }> {
  const publicContext = record.ledger.publicHistory().map((artifact) => ({ role: 'assistant' as const, content: artifact.content, sourceArtifactId: artifact.artifact_id }));
  if (operation.kind.startsWith('checkpoint.')) {
    return [...publicContext, ...record.ledger.ownedPrivate(operation.participantId).map((artifact) => ({ role: 'assistant' as const, content: artifact.content, sourceArtifactId: artifact.artifact_id }))];
  }
  if (operation.kind === 'report.draft') return publicContext;
  if (operation.kind === 'report.review1' || operation.kind === 'report.review2') {
    const draft = record.ledger.byKind('report.draft')[0];
    return draft ? [{ role: 'assistant', content: draft.content, sourceArtifactId: draft.artifact_id }] : [];
  }
  if (operation.kind === 'report.revised') {
    const artifacts = ['report.draft', 'report.review1', 'report.review2'].flatMap((kind) => record.ledger.byKind(kind));
    if (artifacts.length !== 3) throw new Error('Revision requires a committed draft and two terminal reviews');
    return artifacts.map((artifact) => ({ role: 'assistant' as const, content: artifact.content, sourceArtifactId: artifact.artifact_id }));
  }
  return publicContext;
}

function operationPlan(manifest: Phase1aManifest): Operation[] {
  const plan: Operation[] = [];
  for (const participant of manifest.participants) plan.push({ key: `t0:${participant.id}`, state: 'T0', kind: 'checkpoint.t0', participantId: participant.id, visibility: 'private-agent', ownerId: participant.id, system: 'Deterministic Phase 1A private checkpoint', prompt: manifest.checkpoints.t0 });
  for (const round of manifest.rounds) for (const participantId of manifest.speakingOrder[round.number - 1]!) plan.push({ key: `round:${round.number}:${participantId}`, state: `ROUND_${round.number}` as RunState, kind: `round.${round.number}`, participantId, visibility: 'public', ownerId: null, system: 'Deterministic Phase 1A workshop host', prompt: round.prompt });
  for (const participant of manifest.participants) plan.push({ key: `t1:${participant.id}`, state: 'T1', kind: 'checkpoint.t1', participantId: participant.id, visibility: 'private-agent', ownerId: participant.id, system: 'Deterministic Phase 1A private checkpoint', prompt: manifest.checkpoints.t1 });
  if (manifest.reportEnabled) {
    plan.push({ key: 'report:draft', state: 'REPORT_DRAFT', kind: 'report.draft', participantId: 'agent_1', visibility: 'reviewer-isolated', ownerId: 'report', system: 'Deterministic Phase 1A report pipeline', prompt: manifest.reportPrompts.draft });
    plan.push({ key: 'report:review1', state: 'REVIEW_1', kind: 'report.review1', participantId: 'agent_2', visibility: 'reviewer-isolated', ownerId: 'reviewer_1', system: 'Isolated reviewer 1', prompt: manifest.reportPrompts.review1 });
    plan.push({ key: 'report:review2', state: 'REVIEW_2', kind: 'report.review2', participantId: 'agent_3', visibility: 'reviewer-isolated', ownerId: 'reviewer_2', system: 'Isolated reviewer 2', prompt: manifest.reportPrompts.review2 });
    plan.push({ key: 'report:revised', state: 'REPORT_REVISED', kind: 'report.revised', participantId: 'agent_1', visibility: 'public', ownerId: null, system: 'Deterministic Phase 1A report revision', prompt: manifest.reportPrompts.revision });
    for (const participant of manifest.participants) plan.push({ key: `t2:${participant.id}`, state: 'T2', kind: 'checkpoint.t2', participantId: participant.id, visibility: 'private-agent', ownerId: participant.id, system: 'Deterministic Phase 1A private checkpoint', prompt: manifest.checkpoints.t2 });
  }
  return plan;
}

export class Phase1aRuntime {
  private readonly runs = new Map<string, RunRecord>();
  constructor(private readonly clock: () => string = () => new Date().toISOString()) {}

  createRun(manifestInput: Phase1aManifest, rejectEvent?: (eventType: string) => boolean): string {
    const manifest = createManifest(manifestInput);
    const runId = id('run');
    const ledger = new EvidenceLedger(runId, manifest, this.clock, rejectEvent);
    ledger.append('run.created', 'public', 'host', { manifest_hash: hash(manifest), report_enabled: manifest.reportEnabled });
    for (const variation of manifest.variations) ledger.append('protocol_deviation.recorded', 'public', 'host', { variation, preserved: true });
    this.runs.set(runId, { manifest, ledger, state: 'CREATED', callsUsed: 0, tokensUsed: 0 });
    return runId;
  }

  repeatCompletedRun(source: EvidenceBundle): string {
    const verification = verifyEvidenceBundle(source);
    if (!verification.valid || inferState(source.events) !== 'COMPLETE') throw new Error('Repeat requires a valid completed source run');
    const sourceRunId = source.events[0]?.run_id;
    if (!sourceRunId) throw new Error('Repeat source has no run id');
    const runId = this.createRun(source.manifest);
    this.required(runId).ledger.append('run.repeated', 'public', 'host', {
      source_run_id: sourceRunId,
      source_manifest_hash: source.manifest_hash,
    });
    return runId;
  }

  restore(bundle: EvidenceBundle): string {
    const ledger = EvidenceLedger.restore(bundle);
    const state = inferState(bundle.events);
    this.runs.set(ledger.runId, { manifest: ledger.manifest, ledger, state, callsUsed: ledger.calls.length, tokensUsed: ledger.calls.reduce((sum, call) => sum + (call.usage?.inputTokens ?? 0) + (call.usage?.outputTokens ?? 0), 0) });
    return ledger.runId;
  }

  state(runId: string): RunState { return this.required(runId).state; }
  evidence(runId: string): EvidenceBundle { return this.required(runId).ledger.bundle(); }
  exportEvidence(runId: string): EvidenceBundle { return this.evidence(runId); }
  async dispatch(provider: Phase1aProvider, spec: ProviderCallSpec): Promise<ProviderResponse> { return provider.invoke(spec); }
  async advance(runId: string, provider: Phase1aProvider): Promise<RunState> { return this.run(runId, provider, { stopAfterOperations: 1, markInterrupted: false }); }
  resume(bundle: EvidenceBundle): { runId: string; state: RunState } { const runId = this.restore(bundle); return { runId, state: this.state(runId) }; }

  async run(runId: string, provider: Phase1aProvider, options: { stopAfterOperations?: number; markInterrupted?: boolean } = {}): Promise<RunState> {
    const record = this.required(runId);
    let committedThisInvocation = 0;
    for (const operation of operationPlan(record.manifest)) {
      if (record.ledger.hasCommitted(operation.key)) continue;
      if (options.stopAfterOperations !== undefined && committedThisInvocation >= options.stopAfterOperations) {
        if (options.markInterrupted !== false) record.ledger.append('run.interrupted', 'operator', 'host', { after_operations: committedThisInvocation });
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
    }
    return record.state;
  }

  private discloseReportRequirement(record: RunRecord): void {
    if (!record.manifest.reportEnabled || record.ledger.events.some((event) => event.event_type === 'report_requirement.disclosed')) return;
    const t0Commits = record.manifest.participants.map((participant) =>
      record.ledger.events.find((event) => event.event_type === 'operation.committed' && event.payload.operation_key === `t0:${participant.id}`),
    );
    if (t0Commits.some((event) => !event)) throw new Error('Report requirement cannot be disclosed before every t0 checkpoint is committed');
    const artifact = record.ledger.artifact('condition.report-disclosure', 'public', null, record.manifest.reportPrompts.disclosure);
    record.ledger.append('report_requirement.disclosed', 'public', 'host', {
      condition: record.manifest.cell,
      after_t0_event_ids: t0Commits.map((event) => event!.event_id),
      disclosure_hash: artifact.content_hash,
    }, [artifact.artifact_id]);
  }

  private async perform(record: RunRecord, operation: Operation, provider: Phase1aProvider): Promise<boolean> {
    const context = contextFor(record, operation);
    if (context.some((message) => secretPattern.test(message.content))) throw new Error('Secret leakage detected while assembling context');
    record.ledger.append('state_transition.started', 'operator', 'host', { operation_key: operation.key, to_state: operation.state });
    const previousAttemptIds: string[] = [];
    for (let attempt = 1; attempt <= record.manifest.limits.maxRetries + 1; attempt += 1) {
      if (record.callsUsed >= record.manifest.limits.maxCalls || record.tokensUsed >= record.manifest.limits.maxTokens) {
        record.ledger.append('budget.exhausted', 'operator', 'host', { calls_used: record.callsUsed, tokens_used: record.tokensUsed, context_hash: hash(context) });
        record.ledger.append('run.failed', 'public', 'host', { reason: 'budget_exhausted' }); record.state = 'FAILED'; return false;
      }
      const participant = record.manifest.participants.find((entry) => entry.id === operation.participantId) ?? record.manifest.participants[0];
      const spec: ProviderCallSpec = { operationKey: operation.key, participantId: operation.participantId, provider: participant.provider, model: participant.model, systemPrompt: operation.system, userPrompt: operation.prompt, context, attempt };
      const startedAt = this.clock();
      const request = record.ledger.artifact('provider.request', 'operator', operation.participantId, canonicalize(redactSecrets(spec)));
      record.ledger.append('provider_call.started', 'operator', operation.participantId, { operation_key: operation.key, attempt, context_hash: hash(context), request_artifact_ref: request.artifact_id }, [request.artifact_id]);
      let response: ProviderResponse;
      try { response = await provider.invoke(spec); }
      catch (error) { response = { outcome: 'provider_error', provider: spec.provider, model: spec.model, content: null, usage: null, finishReason: null, raw: { error: error instanceof Error ? error.message : String(error) } }; }
      const endedAt = this.clock(); record.callsUsed += 1;
      record.tokensUsed += (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0);
      const raw = record.ledger.artifact('provider.raw', 'operator', operation.participantId, canonicalize(redactSecrets(response.raw)));
      const call = record.ledger.providerCall(spec, response, startedAt, endedAt, request.artifact_id, raw.artifact_id, previousAttemptIds);
      previousAttemptIds.push(call.call_id);
      record.ledger.append(`provider_call.${isTechnical(response.outcome) ? 'failed' : 'completed'}`, 'operator', operation.participantId, { operation_key: operation.key, attempt, outcome: response.outcome, call_id: call.call_id }, [raw.artifact_id]);
      if (isTechnical(response.outcome)) {
        if (attempt <= record.manifest.limits.maxRetries) { record.ledger.append('retry.scheduled', 'operator', 'host', { operation_key: operation.key, failed_call_id: call.call_id, next_attempt: attempt + 1 }); continue; }
        record.ledger.append('run.failed', 'public', 'host', { reason: response.outcome, operation_key: operation.key }); record.state = 'FAILED'; return false;
      }
      const content = response.content ?? `[${response.outcome}]`;
      const artifact = record.ledger.artifact(operation.kind, operation.visibility, operation.ownerId, content);
      record.ledger.append(`${operation.kind}.completed`, operation.visibility, operation.participantId, { operation_key: operation.key, outcome: response.outcome }, [artifact.artifact_id]);
      record.ledger.append('operation.committed', 'operator', 'host', { operation_key: operation.key, state: operation.state }, [artifact.artifact_id]);
      record.state = operation.state;
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
