import { randomUUID } from 'node:crypto';
import { canonicalize, configHash, deepFreeze } from '../config/hash.js';
import {
  inferState,
  verifyEvidenceBundle,
  type EvidenceBundle,
  type Outcome,
  type ProviderCallSpec,
} from './index.js';

export const REPLAY_SCHEMA_VERSION = 'wp05-0.1' as const;

export type ReplayCellId = 'R1' | 'R2' | 'R3' | 'R4';
export type ReplayOutcome =
  | 'success'
  | 'delivered_refusal'
  | 'provider_refusal'
  | 'timeout'
  | 'malformed_response'
  | 'rate_limit'
  | 'provider_error';
export type CheckStatus = 'PASS' | 'FAIL' | 'NOT_EXERCISED';
export type CueProvenance = 'observed' | 'synthetic';

export interface ReplayMessage {
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  sourceArtifactId: string;
}

export interface ReplaySnapshot {
  snapshotId: string;
  snapshotHash: string;
  parentRunId: string;
  parentOpportunityId: string;
  parentCallId: string;
  parentAttempt: number;
  receiverId: string;
  provider: string;
  model: string;
  configuration: Readonly<Record<string, unknown>>;
  systemPrompt: string;
  userPrompt: string;
  systemPromptHash: string;
  userPromptHash: string;
  contextHash: string;
  messages: readonly ReplayMessage[];
  targetMessageId: string;
  targetArgument: string;
  targetSpeaker: Readonly<{ participantId: string; displayName: string; visibleLabel: string; hiddenLabel: string }>;
  endorsement: Readonly<{ text: string; provenance: CueProvenance }>;
  parentCues: Readonly<{ identityShown: boolean; endorsementShown: boolean }>;
}

export interface CueDiff {
  kind: 'speaker_label' | 'endorsement';
  parent: { start: number; end: number; text: string };
  replay: { start: number; end: number; text: string };
}

export interface ReplayCell {
  cell: ReplayCellId;
  identityShown: boolean;
  endorsementShown: boolean;
  targetArgument: string;
  renderedTarget: string;
  context: readonly ReplayMessage[];
  diffs: readonly CueDiff[];
}

export interface ReplayPlan {
  schemaVersion: typeof REPLAY_SCHEMA_VERSION;
  planId: string;
  status: 'DRAFT' | 'CONFIRMED';
  createdAt: string;
  confirmedAt: string | null;
  snapshot: ReplaySnapshot;
  cells: readonly ReplayCell[];
  trialCount: number;
  orderSeed: string;
  retryPolicy: Readonly<{
    maxAttempts: number;
    delayMs: number;
    retryableOutcomes: readonly ReplayOutcome[];
  }>;
  review: Readonly<{
    status: 'PENDING' | 'APPROVED';
    reviewerId: string | null;
    meaningPreserved: boolean;
    residualIdentityTerms: readonly string[];
    notes: string | null;
  }>;
  parentFingerprint: string;
}

export interface ReplayInvocation {
  replaySetId: string;
  planId: string;
  snapshotId: string;
  parentRunId: string;
  parentOpportunityId: string;
  cell: ReplayCellId;
  trial: number;
  attempt: number;
  provider: string;
  model: string;
  configuration: Readonly<Record<string, unknown>>;
  systemPrompt: string;
  userPrompt: string;
  context: readonly ReplayMessage[];
}

export interface ReplayProviderResponse {
  outcome: ReplayOutcome;
  content: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
  raw: Record<string, unknown>;
}

export interface ReplayProvider {
  invoke(invocation: ReplayInvocation): Promise<ReplayProviderResponse>;
}

export interface ReplayAttemptRecord {
  attemptId: string;
  trialId: string;
  attempt: number;
  retryParentAttemptId: string | null;
  provider: string;
  model: string;
  outcome: ReplayOutcome;
  content: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
  contextHash: string;
  rawHash: string;
}

export interface ReplayTrialRecord {
  trialId: string;
  replaySetId: string;
  parentRun: string;
  parentOpportunity: string;
  parentSnapshotId: string;
  cell: ReplayCellId;
  trial: number;
  outcome: ReplayOutcome;
  output: string | null;
  outputId: string | null;
  context: readonly ReplayMessage[];
  contextHash: string;
  diff: readonly CueDiff[];
  attemptIds: readonly string[];
}

export interface ReplayCheck {
  id: string;
  status: CheckStatus;
  evidenceIds: string[];
  detail: string;
}

export interface ReplaySet {
  schemaVersion: typeof REPLAY_SCHEMA_VERSION;
  replaySetId: string;
  planId: string;
  parentRun: string;
  parentOpportunity: string;
  parentSnapshotId: string;
  parentFingerprintBefore: string;
  parentFingerprintAfter: string;
  orderSeed: string;
  realizedOrder: readonly string[];
  trials: readonly ReplayTrialRecord[];
  attempts: readonly ReplayAttemptRecord[];
  checks: readonly ReplayCheck[];
  completedAt: string;
}

export interface ReplayPlanInput {
  parentCallId: string;
  targetMessageId: string;
  targetSpeaker: { participantId: string; displayName: string; visibleLabel: string; hiddenLabel: string };
  endorsement: { text: string; provenance: CueProvenance };
  parentCues: { identityShown: boolean; endorsementShown: boolean };
  trialCount: number;
  orderSeed: string;
  retryPolicy: { maxAttempts: number; delayMs: number; retryableOutcomes: ReplayOutcome[] };
}

export interface ReplayApproval {
  reviewerId: string;
  meaningPreserved: boolean;
  notes?: string;
}

interface StoredRequest extends ProviderCallSpec {}

function clone<T>(value: T): T { return structuredClone(value); }
function hash(value: unknown): string { return configHash(value); }
function identifier(prefix: string): string { return `${prefix}_${randomUUID()}`; }
export function evidenceFingerprint(bundle: EvidenceBundle): string {
  const stable = clone(bundle);
  stable.integrity.verified_at = '';
  return hash(stable);
}
function sourceRunId(bundle: EvidenceBundle): string {
  const value = bundle.events[0]?.run_id;
  if (!value) throw new Error('Parent run id is missing');
  return value;
}

function withoutHash(snapshot: Omit<ReplaySnapshot, 'snapshotHash'>): Omit<ReplaySnapshot, 'snapshotHash'> {
  return snapshot;
}

function readStoredRequest(bundle: EvidenceBundle, callId: string): { call: EvidenceBundle['provider_calls'][number]; request: StoredRequest } {
  const call = bundle.provider_calls.find((candidate) => candidate.call_id === callId);
  if (!call) throw new Error(`Unknown parent call ${callId}`);
  if (!call.request_artifact_ref) throw new Error(`Parent call ${callId} has no locked request artifact`);
  const artifact = bundle.artifacts.find((candidate) => candidate.artifact_id === call.request_artifact_ref);
  if (!artifact || artifact.kind !== 'provider.request') throw new Error(`Parent request artifact ${call.request_artifact_ref} is missing`);
  let request: StoredRequest;
  try { request = JSON.parse(artifact.content) as StoredRequest; }
  catch { throw new Error(`Parent request artifact ${artifact.artifact_id} is malformed`); }
  if (hash(request.systemPrompt) !== call.system_prompt_hash) throw new Error('Parent system prompt hash does not match');
  if (hash(request.userPrompt) !== call.user_prompt_hash) throw new Error('Parent user prompt hash does not match');
  if (hash(request.context) !== call.context_hash) throw new Error('Parent context hash does not match');
  return { call, request };
}

export function replayEligibility(bundle: EvidenceBundle): { enabled: boolean; reason: string | null } {
  const integrity = verifyEvidenceBundle(bundle);
  if (!integrity.valid) return { enabled: false, reason: `Replay disabled: invalid evidence (${integrity.errors.join(', ')})` };
  const state = inferState(bundle.events);
  if (state !== 'COMPLETE') return { enabled: false, reason: `Replay disabled: parent run is ${state}` };
  return { enabled: true, reason: null };
}

export function createReplayPlan(bundle: EvidenceBundle, input: ReplayPlanInput, now = new Date().toISOString()): ReplayPlan {
  const eligibility = replayEligibility(bundle);
  if (!eligibility.enabled) throw new Error(eligibility.reason ?? 'Replay disabled');
  if (!Number.isInteger(input.trialCount) || input.trialCount < 1) throw new Error('trialCount must be a positive integer');
  if (!input.orderSeed.trim()) throw new Error('orderSeed must be registered before replay');
  if (!Number.isInteger(input.retryPolicy.maxAttempts) || input.retryPolicy.maxAttempts < 1) throw new Error('maxAttempts must be a positive integer');
  if (!Number.isInteger(input.retryPolicy.delayMs) || input.retryPolicy.delayMs < 0) throw new Error('delayMs must be a non-negative integer');
  const { call, request } = readStoredRequest(bundle, input.parentCallId);
  if (!call.operation_key.startsWith('round:')) throw new Error('Only completed public round opportunities are eligible replay parents');
  const messages: ReplayMessage[] = request.context.map((message) => {
    if (!message.sourceArtifactId) throw new Error('Every parent context message must have a source message id');
    const source = bundle.artifacts.find((artifact) => artifact.artifact_id === message.sourceArtifactId);
    if (!source) throw new Error(`Parent source message ${message.sourceArtifactId} is missing`);
    if (source.visibility !== 'public') throw new Error(`Private source message ${source.artifact_id} is not allowed in replay context`);
    if (source.content !== message.content) throw new Error(`Parent source message ${source.artifact_id} content does not match`);
    return { messageId: source.artifact_id, role: message.role, content: message.content, sourceArtifactId: source.artifact_id };
  });
  const target = messages.find((message) => message.messageId === input.targetMessageId);
  if (!target) throw new Error(`Target message ${input.targetMessageId} is not in the selected parent context`);
  const receiver = bundle.manifest.participants.find((participant) => participant.id === call.participant_id);
  if (!receiver) throw new Error(`Receiving participant ${call.participant_id} is missing`);
  const snapshotBase: Omit<ReplaySnapshot, 'snapshotHash'> = {
    snapshotId: identifier('snapshot'), parentRunId: sourceRunId(bundle), parentOpportunityId: call.operation_key,
    parentCallId: call.call_id, parentAttempt: call.attempt, receiverId: call.participant_id,
    provider: call.provider, model: call.model, configuration: clone(call.configuration),
    systemPrompt: request.systemPrompt, userPrompt: request.userPrompt,
    systemPromptHash: call.system_prompt_hash, userPromptHash: call.user_prompt_hash, contextHash: call.context_hash,
    messages, targetMessageId: target.messageId, targetArgument: target.content,
    targetSpeaker: clone(input.targetSpeaker), endorsement: clone(input.endorsement), parentCues: clone(input.parentCues),
  };
  const snapshot = deepFreeze({ ...snapshotBase, snapshotHash: hash(withoutHash(snapshotBase)) }) as ReplaySnapshot;
  const identityTerms = [input.targetSpeaker.participantId, input.targetSpeaker.displayName, input.targetSpeaker.visibleLabel]
    .filter((term, index, all) => term.trim().length > 0 && all.indexOf(term) === index)
    .filter((term) => target.content.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
  const cells = (['R1', 'R2', 'R3', 'R4'] as const).map((cell) => buildReplayCell(snapshot, cell));
  for (const cell of cells) {
    const verification = verifyReplayCell(snapshot, cell);
    if (!verification.valid) throw new Error(`Invalid ${cell.cell}: ${verification.errors.join(', ')}`);
  }
  return deepFreeze({
    schemaVersion: REPLAY_SCHEMA_VERSION, planId: identifier('replay_plan'), status: 'DRAFT', createdAt: now, confirmedAt: null,
    snapshot, cells, trialCount: input.trialCount, orderSeed: input.orderSeed,
    retryPolicy: clone(input.retryPolicy),
    review: { status: 'PENDING', reviewerId: null, meaningPreserved: false, residualIdentityTerms: identityTerms, notes: null },
    parentFingerprint: evidenceFingerprint(bundle),
  }) as ReplayPlan;
}

export function approveReplayPlan(plan: ReplayPlan, approval: ReplayApproval, now = new Date().toISOString()): ReplayPlan {
  if (plan.status !== 'DRAFT') throw new Error('Only a draft replay plan can be approved');
  if (!approval.reviewerId.trim()) throw new Error('A reviewer id is required');
  if (!approval.meaningPreserved) throw new Error('Human review must confirm that cue edits preserve the argument meaning');
  return deepFreeze({
    ...clone(plan), status: 'CONFIRMED', confirmedAt: now,
    review: { ...clone(plan.review), status: 'APPROVED', reviewerId: approval.reviewerId, meaningPreserved: true, notes: approval.notes ?? null },
  }) as ReplayPlan;
}

function cueValues(snapshot: ReplaySnapshot, identityShown: boolean, endorsementShown: boolean) {
  return {
    speaker: identityShown ? snapshot.targetSpeaker.visibleLabel : snapshot.targetSpeaker.hiddenLabel,
    endorsement: endorsementShown ? snapshot.endorsement.text : '',
  };
}

function renderTarget(argument: string, speaker: string, endorsement: string): { text: string; speaker: CueDiff['replay']; endorsement: CueDiff['replay'] } {
  const speakerPrefix = '[speaker: ';
  const endorsementPrefix = '\n[endorsement: ';
  const speakerStart = speakerPrefix.length;
  const speakerEnd = speakerStart + speaker.length;
  const endorsementStart = speakerEnd + endorsementPrefix.length;
  const endorsementEnd = endorsementStart + endorsement.length;
  const text = `${speakerPrefix}${speaker}${endorsementPrefix}${endorsement}]\n${argument}`;
  return {
    text,
    speaker: { start: speakerStart, end: speakerEnd, text: speaker },
    endorsement: { start: endorsementStart, end: endorsementEnd, text: endorsement },
  };
}

export function buildReplayCell(snapshot: ReplaySnapshot, cell: ReplayCellId): ReplayCell {
  const identityShown = cell === 'R1' || cell === 'R3';
  const endorsementShown = cell === 'R1' || cell === 'R2';
  const parentCue = cueValues(snapshot, snapshot.parentCues.identityShown, snapshot.parentCues.endorsementShown);
  const replayCue = cueValues(snapshot, identityShown, endorsementShown);
  const parent = renderTarget(snapshot.targetArgument, parentCue.speaker, parentCue.endorsement);
  const replay = renderTarget(snapshot.targetArgument, replayCue.speaker, replayCue.endorsement);
  const diffs: CueDiff[] = [];
  if (parentCue.speaker !== replayCue.speaker) diffs.push({ kind: 'speaker_label', parent: parent.speaker, replay: replay.speaker });
  if (parentCue.endorsement !== replayCue.endorsement) diffs.push({ kind: 'endorsement', parent: parent.endorsement, replay: replay.endorsement });
  const context = snapshot.messages.map((message) => message.messageId === snapshot.targetMessageId ? { ...clone(message), content: replay.text } : clone(message));
  return deepFreeze({ cell, identityShown, endorsementShown, targetArgument: snapshot.targetArgument, renderedTarget: replay.text, context, diffs }) as ReplayCell;
}

export function verifyReplayCell(snapshot: ReplaySnapshot, cell: ReplayCell): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const expected = buildReplayCellUnchecked(snapshot, cell.cell);
  if (cell.targetArgument !== snapshot.targetArgument) errors.push('target_argument_changed');
  if (cell.context.length !== snapshot.messages.length) errors.push('message_count_changed');
  for (let index = 0; index < snapshot.messages.length; index += 1) {
    const original = snapshot.messages[index]; const actual = cell.context[index];
    if (!original || !actual || original.messageId !== actual.messageId || original.role !== actual.role) errors.push(`message_order:${index}`);
    if (original?.messageId !== snapshot.targetMessageId && original?.content !== actual?.content) errors.push(`unregistered_change:${original?.messageId ?? index}`);
    if (original?.messageId === snapshot.targetMessageId && actual?.content !== cell.renderedTarget) errors.push(`unregistered_change:${original.messageId}`);
  }
  if (cell.renderedTarget !== expected.renderedTarget) errors.push('unregistered_target_change');
  if (canonicalize(cell.diffs) !== canonicalize(expected.diffs)) errors.push('diff_log_mismatch');
  if (cell.diffs.some((diff) => diff.kind !== 'speaker_label' && diff.kind !== 'endorsement')) errors.push('unregistered_diff_kind');
  return { valid: errors.length === 0, errors };
}

function buildReplayCellUnchecked(snapshot: ReplaySnapshot, cell: ReplayCellId): ReplayCell {
  const identityShown = cell === 'R1' || cell === 'R3';
  const endorsementShown = cell === 'R1' || cell === 'R2';
  const parentCue = cueValues(snapshot, snapshot.parentCues.identityShown, snapshot.parentCues.endorsementShown);
  const replayCue = cueValues(snapshot, identityShown, endorsementShown);
  const parent = renderTarget(snapshot.targetArgument, parentCue.speaker, parentCue.endorsement);
  const replay = renderTarget(snapshot.targetArgument, replayCue.speaker, replayCue.endorsement);
  const diffs: CueDiff[] = [];
  if (parentCue.speaker !== replayCue.speaker) diffs.push({ kind: 'speaker_label', parent: parent.speaker, replay: replay.speaker });
  if (parentCue.endorsement !== replayCue.endorsement) diffs.push({ kind: 'endorsement', parent: parent.endorsement, replay: replay.endorsement });
  const context = snapshot.messages.map((message) => message.messageId === snapshot.targetMessageId ? { ...clone(message), content: replay.text } : clone(message));
  return { cell, identityShown, endorsementShown, targetArgument: snapshot.targetArgument, renderedTarget: replay.text, context, diffs };
}

function seedValue(seed: string): number {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function orderedTrials(plan: ReplayPlan): Array<{ cell: ReplayCell; trial: number }> {
  const items = plan.cells.flatMap((cell) => Array.from({ length: plan.trialCount }, (_, index) => ({ cell, trial: index + 1 })));
  let state = seedValue(plan.orderSeed) || 1;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  for (let index = items.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [items[index], items[selected]] = [items[selected]!, items[index]!];
  }
  return items;
}

function technical(outcome: ReplayOutcome): boolean {
  return ['provider_refusal', 'timeout', 'malformed_response', 'rate_limit', 'provider_error'].includes(outcome);
}

function validResponse(response: ReplayProviderResponse): void {
  if ((response.outcome === 'success' || response.outcome === 'delivered_refusal') && response.content === null) throw new Error(`${response.outcome} requires archived text`);
  if (technical(response.outcome) && response.content !== null) throw new Error(`${response.outcome} cannot carry a delivered message`);
}

export async function executeReplayPlan(
  plan: ReplayPlan,
  parent: EvidenceBundle,
  provider: ReplayProvider,
  options: { now?: () => string; onRetryDelay?: (delayMs: number) => Promise<void> } = {},
): Promise<ReplaySet> {
  if (plan.status !== 'CONFIRMED' || plan.review.status !== 'APPROVED') throw new Error('Replay plan must be confirmed after human review before provider calls');
  if (evidenceFingerprint(parent) !== plan.parentFingerprint) throw new Error('Parent run changed after replay planning');
  if (!verifyEvidenceBundle(parent).valid) throw new Error('Parent evidence is invalid');
  const replaySetId = identifier('replay_set');
  const attempts: ReplayAttemptRecord[] = [];
  const trials: ReplayTrialRecord[] = [];
  const order = orderedTrials(plan);
  for (const item of order) {
    const trialId = identifier('replay_trial');
    const trialAttempts: ReplayAttemptRecord[] = [];
    let final: ReplayProviderResponse | null = null;
    for (let attempt = 1; attempt <= plan.retryPolicy.maxAttempts; attempt += 1) {
      const invocation: ReplayInvocation = {
        replaySetId, planId: plan.planId, snapshotId: plan.snapshot.snapshotId,
        parentRunId: plan.snapshot.parentRunId, parentOpportunityId: plan.snapshot.parentOpportunityId,
        cell: item.cell.cell, trial: item.trial, attempt,
        provider: plan.snapshot.provider, model: plan.snapshot.model, configuration: clone(plan.snapshot.configuration),
        systemPrompt: plan.snapshot.systemPrompt, userPrompt: plan.snapshot.userPrompt, context: clone(item.cell.context),
      };
      let response: ReplayProviderResponse;
      try { response = await provider.invoke(invocation); }
      catch (error) { response = { outcome: 'provider_error', content: null, usage: null, raw: { error: error instanceof Error ? error.message : String(error) } }; }
      validResponse(response);
      const record: ReplayAttemptRecord = deepFreeze({
        attemptId: identifier('replay_attempt'), trialId, attempt,
        retryParentAttemptId: trialAttempts.at(-1)?.attemptId ?? null,
        provider: plan.snapshot.provider, model: plan.snapshot.model, outcome: response.outcome,
        content: response.content, usage: response.usage, contextHash: hash(invocation.context), rawHash: hash(response.raw),
      });
      trialAttempts.push(record); attempts.push(record); final = response;
      const shouldRetry = plan.retryPolicy.retryableOutcomes.includes(response.outcome) && attempt < plan.retryPolicy.maxAttempts;
      if (!shouldRetry) break;
      if (options.onRetryDelay) await options.onRetryDelay(plan.retryPolicy.delayMs);
    }
    if (!final) throw new Error('Replay trial produced no attempt');
    const outputId = final.content === null ? null : identifier('replay_output');
    trials.push(deepFreeze({
      trialId, replaySetId, parentRun: plan.snapshot.parentRunId, parentOpportunity: plan.snapshot.parentOpportunityId,
      parentSnapshotId: plan.snapshot.snapshotId, cell: item.cell.cell, trial: item.trial, outcome: final.outcome,
      output: final.content, outputId, context: clone(item.cell.context), contextHash: hash(item.cell.context),
      diff: clone(item.cell.diffs), attemptIds: trialAttempts.map((attempt) => attempt.attemptId),
    }));
  }
  const partial: Omit<ReplaySet, 'checks'> = {
    schemaVersion: REPLAY_SCHEMA_VERSION, replaySetId, planId: plan.planId, parentRun: plan.snapshot.parentRunId,
    parentOpportunity: plan.snapshot.parentOpportunityId, parentSnapshotId: plan.snapshot.snapshotId,
    parentFingerprintBefore: plan.parentFingerprint, parentFingerprintAfter: evidenceFingerprint(parent), orderSeed: plan.orderSeed,
    realizedOrder: order.map(({ cell, trial }) => `${cell.cell}:${trial}`), trials, attempts,
    completedAt: options.now?.() ?? new Date().toISOString(),
  };
  const set = { ...partial, checks: [] } as ReplaySet;
  return deepFreeze({ ...partial, checks: auditReplaySet(set, plan, parent) }) as ReplaySet;
}

export function auditReplaySet(set: ReplaySet, plan: ReplayPlan, parent: EvidenceBundle, privateMarkers: string[] = []): ReplayCheck[] {
  const checks: ReplayCheck[] = [];
  const add = (id: string, pass: boolean, evidenceIds: string[], detail: string) => checks.push({ id, status: pass ? 'PASS' : 'FAIL', evidenceIds, detail });
  add('parent_immutable', set.parentFingerprintBefore === set.parentFingerprintAfter && set.parentFingerprintAfter === evidenceFingerprint(parent), [set.parentRun, set.parentSnapshotId], 'Parent fingerprint is unchanged.');
  const cellErrors = plan.cells.flatMap((cell) => verifyReplayCell(plan.snapshot, cell).errors.map((error) => `${cell.cell}:${error}`));
  add('registered_cues_only', cellErrors.length === 0, plan.cells.map((cell) => cell.cell), cellErrors.join(', ') || 'Only registered cue spans changed.');
  const outputTexts = set.trials.map((trial) => trial.output).filter((value): value is string => value !== null);
  const contaminated = set.trials.filter((trial) => outputTexts.some((output) => trial.context.some((message) => message.content.includes(output))));
  add('trial_independence', contaminated.length === 0, contaminated.map((trial) => trial.trialId), contaminated.length ? 'A trial context contains replay output.' : 'Every trial starts from the frozen snapshot.');
  const leaks = set.trials.flatMap((trial) => privateMarkers.filter((marker) => trial.context.some((message) => message.content.includes(marker))).map((marker) => `${trial.trialId}:${marker}`));
  add('private_text', leaks.length === 0, leaks, leaks.length ? 'Private marker exposed.' : 'No supplied private marker appears in replay context.');
  const hidden = set.trials.filter((trial) => trial.cell === 'R2' || trial.cell === 'R4');
  const identityTerms = [plan.snapshot.targetSpeaker.participantId, plan.snapshot.targetSpeaker.displayName, plan.snapshot.targetSpeaker.visibleLabel].filter(Boolean);
  const identityLeaks = hidden.flatMap((trial) => identityTerms.filter((term) => trial.context.some((message) => message.content.toLocaleLowerCase().includes(term.toLocaleLowerCase()))).map((term) => `${trial.trialId}:${term}`));
  add('hidden_identity', identityLeaks.length === 0, identityLeaks, identityLeaks.length ? 'Residual speaker identity found.' : 'Hidden cells contain no registered speaker identifier.');
  const traceGaps: string[] = [];
  for (const trial of set.trials) {
    const linked = trial.attemptIds.map((attemptId) => set.attempts.find((attempt) => attempt.attemptId === attemptId));
    if (linked.some((attempt) => !attempt)) traceGaps.push(`${trial.trialId}->attempt`);
    if ((trial.outcome === 'success' || trial.outcome === 'delivered_refusal') && (!trial.outputId || trial.output === null)) traceGaps.push(`${trial.trialId}->output`);
    if (technical(trial.outcome) && (trial.outputId || trial.output !== null)) traceGaps.push(`${trial.trialId}->unexpected_output`);
    if (trial.parentRun !== set.parentRun || trial.parentOpportunity !== set.parentOpportunity || trial.parentSnapshotId !== set.parentSnapshotId) traceGaps.push(`${trial.trialId}->parent`);
  }
  add('trace_complete', traceGaps.length === 0, traceGaps, traceGaps.length ? `Trace gaps: ${traceGaps.join(', ')}` : 'Outcome-specific trace chains are complete.');
  const retryGaps: string[] = [];
  for (const trial of set.trials) {
    const linked = trial.attemptIds.map((attemptId) => set.attempts.find((attempt) => attempt.attemptId === attemptId)).filter((attempt): attempt is ReplayAttemptRecord => Boolean(attempt));
    linked.forEach((attempt, index) => {
      const expectedParent = index === 0 ? null : linked[index - 1]!.attemptId;
      if (attempt.attempt !== index + 1 || attempt.retryParentAttemptId !== expectedParent) retryGaps.push(`${trial.trialId}:${attempt.attemptId}`);
    });
  }
  add('retry_links', retryGaps.length === 0, retryGaps, retryGaps.length ? 'Retry linkage is inconsistent.' : 'Retry attempts form an ordered parent chain.');
  const modelDrift = set.attempts.filter((attempt) => attempt.provider !== plan.snapshot.provider || attempt.model !== plan.snapshot.model).map((attempt) => attempt.attemptId);
  add('locked_provider_model', modelDrift.length === 0, modelDrift, modelDrift.length ? 'A replay attempt changed provider or model.' : 'All attempts retain the frozen provider and model.');
  add('one_outcome', set.trials.every((trial) => Boolean(trial.outcome)), set.trials.map((trial) => trial.trialId), 'Every trial has exactly one final outcome.');
  return checks;
}

export function buildPhase1aResults(bundle: EvidenceBundle) {
  const runId = sourceRunId(bundle);
  const rounds = Array.from({ length: 6 }, (_, index) => {
    const number = index + 1;
    const calls = bundle.provider_calls.filter((call) => call.operation_key.startsWith(`round:${number}:`));
    return {
      round: number,
      outcomes: calls.map((call) => ({ agentId: call.participant_id, outcome: call.terminal_status })),
      tokenUsage: calls.map((call) => ({
        agentId: call.participant_id,
        inputTokens: call.usage?.inputTokens ?? 'unavailable',
        outputTokens: call.usage?.outputTokens ?? 'unavailable',
      })),
      checks: [{ id: `round_${number}_complete`, status: (calls.length === 3 ? 'PASS' : 'FAIL') as CheckStatus }],
      evidence: {
        eventIds: bundle.events.filter((event) => event.event_type === `round.${number}.completed`).map((event) => event.event_id),
        messageIds: calls.flatMap((call) => call.context_message_ids),
        contextHashes: calls.map((call) => call.context_hash),
        callIds: calls.map((call) => call.call_id),
      },
    };
  });
  return deepFreeze({
    schemaVersion: REPLAY_SCHEMA_VERSION,
    runId,
    settings: { manifestHash: bundle.manifest_hash, contractVersion: bundle.manifest.contractVersion },
    rounds,
    workshopChecks: [
      { id: 'integrity', status: (verifyEvidenceBundle(bundle).valid ? 'PASS' : 'FAIL') as CheckStatus, evidenceIds: bundle.events.map((event) => event.event_id) },
      { id: 'terminal_state', status: (inferState(bundle.events) === 'COMPLETE' ? 'PASS' : 'FAIL') as CheckStatus, evidenceIds: [runId] },
    ],
  });
}

export class ScriptedReplayProvider implements ReplayProvider {
  readonly calls: ReplayInvocation[] = [];
  private readonly counts = new Map<string, number>();
  constructor(private readonly script: Record<string, ReplayOutcome[]> = {}) {}
  async invoke(invocation: ReplayInvocation): Promise<ReplayProviderResponse> {
    this.calls.push(clone(invocation));
    const key = `${invocation.cell}:${invocation.trial}`;
    const count = this.counts.get(key) ?? 0; this.counts.set(key, count + 1);
    const outcomes = this.script[key] ?? ['success'];
    const outcome = outcomes[Math.min(count, outcomes.length - 1)] ?? 'success';
    const delivered = outcome === 'success' || outcome === 'delivered_refusal';
    return {
      outcome,
      content: delivered ? `${key}:${outcome}` : null,
      usage: { inputTokens: 12, outputTokens: delivered ? 4 : 0 },
      raw: { fixture: true, outcome },
    };
  }
}

export function mapPhase1aOutcome(outcome: Outcome): ReplayOutcome {
  if (outcome === 'invalid_response') return 'malformed_response';
  if (outcome === 'refused') return 'delivered_refusal';
  if (outcome === 'abstained') return 'delivered_refusal';
  return outcome;
}
