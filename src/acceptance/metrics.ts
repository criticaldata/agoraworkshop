/**
 * The eighteen Phase 0 acceptance metrics.
 *
 * The gate report has always carried prose evidence, which reads well and proves
 * little on its own: a reader cannot tell which sentence corresponds to which agreed
 * threshold, and a threshold that is quietly dropped leaves no gap behind. This module
 * is the addressable layer underneath it. Each metric has a fixed identifier, the
 * threshold written the way the specification writes it, and a status derived only from
 * stored records.
 *
 * Three rules hold throughout:
 *
 *  - A metric never reports PASS for a condition that did not arise. That is
 *    `NOT_EXERCISED`, which is missing evidence and is treated as such.
 *  - A metric re-derives its answer wherever the run's own bookkeeping could be
 *    self-confirming. Counting the field that the router wrote proves the router agrees
 *    with itself; recomputing the recipient set from the frozen config does not.
 *  - Metrics are additive to the existing gates. They can make a gate stricter and
 *    never weaker, so adding one cannot turn a failing run into a passing one.
 */

import type { Db } from '../db/index.js';
import {
  getArtifacts,
  getInvocations,
  getMessages,
  getOpportunities,
  getRun,
  getTransitions,
  runConfig,
  runsWithConfigHash,
  type InvocationRow,
  type RunRow,
} from '../db/queries.js';
import { readEvents } from '../events/recorder.js';
import { canonicalize, configHash } from '../config/hash.js';
import { WORKSHOP_STATES, type ExperimentConfig } from '../config/schema.js';
import { breakoutRecipients, publicRecipients } from '../orchestrator/visibility.js';
import { REQUIRED_BUNDLE_FILES } from '../export/bundleContract.js';
import { auditPrivacyLeaks } from './privacy.js';
import type { GateStatus } from './gates.js';

export type MetricId =
  | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'M8'
  | 'M9' | 'M10' | 'M11' | 'M12'
  | 'M13' | 'M14' | 'M15' | 'M16' | 'M17' | 'M18';

export type MetricGate = 1 | 2 | 3;

export interface MetricResult {
  id: MetricId;
  gate: MetricGate;
  /** What the metric is called in the specification. */
  name: string;
  /** The threshold, in the specification's own notation. */
  threshold: string;
  status: GateStatus;
  /** What was actually observed. One factual clause, never a reassurance. */
  observed: string;
  /** Identifiers of the records the finding stands on, for anyone checking by hand. */
  evidence_refs: string[];
}

export interface MetricInput {
  db: Db;
  runId: string;
  /** A run (typically fault-injected) supplying gate 2 evidence. */
  failureEvidenceRunId?: string | null;
  /** A second run of the same frozen config, supplying gate 3 evidence. */
  reproducibilityRunId?: string | null;
  /** Artifact names the caller is in the middle of writing. See EvaluateGatesOptions. */
  pendingArtifactNames?: string[];
}

/**
 * A delivery reconstructed from the event log.
 *
 * The specification treats message and delivery as separate scientific events, and so
 * does the runtime: one `message_delivered` event is emitted per recipient. There is no
 * deliveries table because there does not need to be one — the events already carry
 * every field of the contract, and deriving them keeps a single source of truth rather
 * than adding a second one that could drift from it.
 */
export interface DerivedDelivery {
  delivery_id: string;
  run_id: string;
  message_id: string;
  sender_agent_id: string;
  recipient_agent_id: string;
  channel: 'public' | 'private';
  delivered_at: string;
}

export function deriveDeliveries(db: Db, runId: string): DerivedDelivery[] {
  const out: DerivedDelivery[] = [];
  for (const event of readEvents(db, runId)) {
    if (event.event_type !== 'message_delivered' && event.event_type !== 'private_message_delivered') {
      continue;
    }
    const payload = event.payload as { message_id?: unknown; sender_agent_id?: unknown };
    if (typeof payload.message_id !== 'string' || event.agent_id === null) continue;
    out.push({
      delivery_id: event.event_id,
      run_id: event.run_id,
      message_id: payload.message_id,
      sender_agent_id: typeof payload.sender_agent_id === 'string' ? payload.sender_agent_id : '',
      recipient_agent_id: event.agent_id,
      channel: event.event_type === 'private_message_delivered' ? 'private' : 'public',
      delivered_at: event.timestamp,
    });
  }
  return out;
}

// --------------------------------------------------------------------------- helpers

function metric(
  id: MetricId,
  gate: MetricGate,
  name: string,
  threshold: string,
  status: GateStatus,
  observed: string,
  evidence_refs: string[] = [],
): MetricResult {
  return { id, gate, name, threshold, status, observed, evidence_refs };
}

/** PASS when the count is zero, FAIL otherwise. The commonest shape in the spec. */
function zeroIsPass(count: number, pass: string, fail: (n: number) => string): [GateStatus, string] {
  return count === 0 ? ['PASS', pass] : ['FAIL', fail(count)];
}

const BEHAVIOURAL_RESOLUTIONS = new Set(['success', 'explicit_abstention', 'no_op']);

/** Sets are compared by content; recipient order is not part of the contract. */
function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  for (const value of b) if (!left.has(value)) return false;
  return left.size === new Set(b).size;
}

// ------------------------------------------------------------ gate 1: infrastructure

function m1(db: Db, runId: string): MetricResult {
  const opportunities = getOpportunities(db, runId);
  if (opportunities.length === 0) {
    return metric('M1', 1, 'Response opportunity coverage',
      'terminal_outcomes / response_opportunities = 100%', 'NOT_EXERCISED',
      'this run created no response opportunities, so there was no outcome to record');
  }
  // An opportunity terminates either behaviourally or with a named infrastructure
  // category. A resolution of `infrastructure_failure` with no category is not a
  // terminal outcome; it is an unfinished one.
  const open = opportunities.filter(
    (o) =>
      o.resolution === null ||
      o.resolved_at === null ||
      (!BEHAVIOURAL_RESOLUTIONS.has(o.resolution) && !o.failure_category),
  );
  const [status, observed] = zeroIsPass(
    open.length,
    `all ${opportunities.length} response opportunities reached an explicit terminal outcome`,
    (n) => `${n} of ${opportunities.length} response opportunities have no terminal outcome`,
  );
  return metric('M1', 1, 'Response opportunity coverage',
    'terminal_outcomes / response_opportunities = 100%', status, observed,
    open.slice(0, 10).map((o) => o.opportunity_id));
}

function m2(db: Db, runId: string): MetricResult {
  const events = readEvents(db, runId);
  const problems: string[] = [];
  const refs: string[] = [];

  if (events.length === 0) {
    return metric('M2', 1, 'Event sequence integrity', 'sequence_errors = 0', 'NOT_EXERCISED',
      'no events were recorded for this run');
  }

  const seen = new Set<number>();
  for (const event of events) {
    if (seen.has(event.sequence)) {
      problems.push(`duplicate sequence ${event.sequence}`);
      refs.push(event.event_id);
    }
    seen.add(event.sequence);
    if (event.run_id !== runId) {
      problems.push(`event ${event.event_id} references run ${event.run_id}`);
      refs.push(event.event_id);
    }
  }
  const missing = events.filter((e, index) => e.sequence !== index + 1);
  if (missing.length > 0) {
    problems.push(`sequence is not contiguous 1..${events.length}`);
    refs.push(...missing.slice(0, 5).map((e) => e.event_id));
  }

  // Every message must join back to the event and invocation that produced it.
  const eventIds = new Set(events.map((e) => e.event_id));
  const invocationIds = new Set(getInvocations(db, runId).map((i) => i.invocation_id));
  for (const message of getMessages(db, runId)) {
    if (!message.source_event_id || !eventIds.has(message.source_event_id)) {
      problems.push(`message ${message.message_id} does not join to a source event`);
      refs.push(message.message_id);
    }
    if (message.source_invocation_id && !invocationIds.has(message.source_invocation_id)) {
      problems.push(`message ${message.message_id} references an unknown invocation`);
      refs.push(message.message_id);
    }
  }

  const [status, observed] = zeroIsPass(
    problems.length,
    `${events.length} events in contiguous sequence 1..${events.length}; every message joins to its source event`,
    () => problems.slice(0, 3).join('; '),
  );
  return metric('M2', 1, 'Event sequence integrity', 'sequence_errors = 0', status, observed, refs.slice(0, 10));
}

function m3(db: Db, runId: string, run: RunRow, config: ExperimentConfig): MetricResult {
  const messages = getMessages(db, runId).filter((m) => m.channel === 'public');
  if (messages.length === 0) {
    return metric('M3', 1, 'Public routing integrity',
      'expected_public_deliveries == actual_public_deliveries', 'NOT_EXERCISED',
      'no public message was sent, so public routing was never exercised');
  }

  // Re-derived from the frozen config, not read back from the router's own record of
  // what it decided. `actual_recipients` is written by the same code path that chose
  // the recipients, so comparing the two would only prove that code agrees with itself.
  const byMessage = new Map<string, string[]>();
  for (const delivery of deriveDeliveries(db, runId)) {
    if (delivery.channel !== 'public') continue;
    const list = byMessage.get(delivery.message_id) ?? [];
    list.push(delivery.recipient_agent_id);
    byMessage.set(delivery.message_id, list);
  }

  let expectedTotal = 0;
  let actualTotal = 0;
  const mismatched: string[] = [];
  for (const message of messages) {
    const expected = publicRecipients(config, message.sender_agent_id);
    const actual = byMessage.get(message.message_id) ?? [];
    expectedTotal += expected.length;
    actualTotal += actual.length;
    if (!sameMembers(expected, actual)) mismatched.push(message.message_id);
  }

  const [status, observed] = zeroIsPass(
    mismatched.length,
    `${actualTotal} of ${expectedTotal} expected public deliveries recorded, recipient sets re-derived ` +
      `from the frozen config for all ${messages.length} public messages`,
    (n) => `${n} public messages were delivered to a recipient set that differs from the one the ` +
      `config requires (${actualTotal} deliveries recorded, ${expectedTotal} expected)`,
  );
  return metric('M3', 1, 'Public routing integrity',
    'expected_public_deliveries == actual_public_deliveries', status, observed, mismatched.slice(0, 10));
}

function m4(db: Db, runId: string, config: ExperimentConfig): MetricResult {
  const messages = getMessages(db, runId).filter((m) => m.channel === 'private');
  if (messages.length === 0) {
    return metric('M4', 1, 'Private-channel isolation', 'unauthorized_private_exposures = 0',
      'NOT_EXERCISED', 'no private message was sent, so isolation was never put under load');
  }

  const exposures: string[] = [];

  // Exposure one: a private message delivered to somebody the config does not permit.
  const byMessage = new Map<string, string[]>();
  for (const delivery of deriveDeliveries(db, runId)) {
    if (delivery.channel !== 'private') continue;
    const list = byMessage.get(delivery.message_id) ?? [];
    list.push(delivery.recipient_agent_id);
    byMessage.set(delivery.message_id, list);
  }
  for (const message of messages) {
    const permitted = new Set(
      breakoutRecipients(config, message.breakout_group_id ?? '', message.sender_agent_id),
    );
    for (const recipient of byMessage.get(message.message_id) ?? []) {
      if (!permitted.has(recipient)) exposures.push(`${message.message_id}->${recipient}`);
    }
  }

  // Exposure two: a private message that reached an unauthorised agent's context, which
  // is the leak that matters even when no delivery was recorded.
  const leaks = auditPrivacyLeaks(db, runId);
  for (const violation of leaks.violations) {
    exposures.push(`${violation.message_id}->${violation.agent_id}`);
  }

  const [status, observed] = zeroIsPass(
    exposures.length,
    `${messages.length} private messages: every delivery went to a permitted member, and ` +
      `re-derived visibility over ${leaks.contextReferencesChecked} context references found no exposure`,
    (n) => `${n} unauthorised exposures of private content`,
  );
  return metric('M4', 1, 'Private-channel isolation', 'unauthorized_private_exposures = 0',
    status, observed, exposures.slice(0, 10));
}

function m5(db: Db, runId: string, run: RunRow): MetricResult {
  const transitions = getTransitions(db, runId);
  if (transitions.length === 0) {
    return metric('M5', 1, 'State-machine integrity', 'illegal_state_transitions = 0',
      'NOT_EXERCISED', 'no state transition was recorded for this run');
  }

  const problems: string[] = [];
  const refs: string[] = [];
  const known = new Set<string>(WORKSHOP_STATES);

  for (const transition of transitions) {
    if (transition.status !== 'completed') {
      problems.push(`${transition.from_state}->${transition.to_state} ended as ${transition.status}`);
      refs.push(String(transition.id));
    }
    if (!known.has(transition.from_state) || !known.has(transition.to_state)) {
      problems.push(`${transition.from_state}->${transition.to_state} names a state outside the protocol`);
      refs.push(String(transition.id));
    }
  }

  // The chain must be unbroken: each transition starts where the previous one ended.
  for (let i = 1; i < transitions.length; i += 1) {
    const previous = transitions[i - 1]!;
    const current = transitions[i]!;
    if (previous.to_state !== current.from_state) {
      problems.push(
        `state ${previous.to_state} was left without a transition: the next transition starts at ${current.from_state}`,
      );
      refs.push(String(current.id));
    }
  }

  const rejected = readEvents(db, runId).filter((e) => e.event_type === 'state_transition_rejected');
  if (rejected.length > 0) {
    problems.push(`${rejected.length} transitions were rejected as illegal`);
    refs.push(...rejected.slice(0, 5).map((e) => e.event_id));
  }

  const terminal = transitions[transitions.length - 1]!.to_state;
  if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(terminal)) {
    problems.push(`the last recorded state is ${terminal}, which is not terminal`);
  }

  const [status, observed] = zeroIsPass(
    problems.length,
    `${transitions.length} transitions form an unbroken chain to ${terminal} with no rejected transition`,
    () => problems.slice(0, 3).join('; '),
  );
  return metric('M5', 1, 'State-machine integrity', 'illegal_state_transitions = 0', status, observed, refs.slice(0, 10));
}

function m6(run: RunRow, config: ExperimentConfig): MetricResult {
  const problems: string[] = [];

  if (!(config.workshop.max_duration_seconds > 0)) problems.push('no maximum duration is configured');
  if (!(config.budgets.max_calls_per_agent > 0)) problems.push('no per-agent call budget is configured');
  if (!(config.budgets.max_tokens_per_agent > 0)) problems.push('no per-agent token budget is configured');
  if (!(config.runtime.timeout_seconds > 0)) problems.push('no invocation timeout is configured');
  if (!Number.isFinite(config.runtime.max_retries)) problems.push('the retry policy is unbounded');

  // A run still marked RUNNING is exactly the unbounded case this metric exists to
  // catch: nothing recorded that it stopped, so nothing can say whether it did.
  if (!['COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(run.status)) {
    problems.push(`run status is ${run.status}, so no terminal state was recorded`);
  }
  if (run.status !== 'COMPLETED' && !run.termination_reason && !run.failure_reason) {
    problems.push('the run left a non-completed state with no reason recorded');
  }

  const [status, observed] = zeroIsPass(
    problems.length,
    `duration, call, token, timeout and retry limits all configured; run reached ${run.status}` +
      (run.termination_reason ? ` (${run.termination_reason})` : ''),
    () => problems.slice(0, 3).join('; '),
  );
  return metric('M6', 1, 'Bounded execution', 'unbounded_runs = 0', status, observed, [run.run_id]);
}

function m7(db: Db, runId: string, run: RunRow): MetricResult {
  const events = readEvents(db, runId);
  const invocations = getInvocations(db, runId);
  const missing: string[] = [];

  if (!run.config_json || !run.config_canonical) missing.push('immutable config snapshot');
  if (!run.config_hash) missing.push('config hash');
  if (events.length === 0) missing.push('events');
  if (getOpportunities(db, runId).length === 0) missing.push('response opportunities');
  if (invocations.length === 0) missing.push('invocations');
  if (getMessages(db, runId).length === 0) missing.push('messages');
  if (deriveDeliveries(db, runId).length === 0) missing.push('deliveries');
  if (getTransitions(db, runId).length === 0) missing.push('state transitions');
  // Provenance is required to be *represented*, which a null correctly does: it records
  // that the value was unavailable here. What would be missing is an incoherent record —
  // a revision with no account of where it came from.
  if (run.code_commit_sha && !run.commit_source) missing.push('provenance metadata');

  // Failure and retry records are only required where something actually failed.
  const failed = invocations.filter((i) => i.outcome === 'infra_failure');
  if (failed.length > 0 && failed.every((i) => !i.failure_category)) {
    missing.push('failure records');
  }

  const [status, observed] = zeroIsPass(
    missing.length,
    'every required object is persisted: run, config snapshot, events, opportunities, ' +
      'invocations, messages, deliveries, state transitions and provenance',
    () => `missing: ${missing.join(', ')}`,
  );
  return metric('M7', 1, 'Persistence integrity', 'missing_required_persisted_objects = 0',
    status, observed, missing);
}

function m8(db: Db, runId: string, pending: string[]): MetricResult {
  const artifacts = getArtifacts(db, runId);
  const names = new Set([...artifacts.map((a) => a.name), ...pending]);
  const missing = REQUIRED_BUNDLE_FILES.filter((name) => !names.has(name));

  if (artifacts.length === 0 && pending.length === 0) {
    return metric('M8', 1, 'Export integrity', '100% of required export artifacts present',
      'FAIL', 'no artifact bundle has been exported for this run', []);
  }
  const [status, observed] = zeroIsPass(
    missing.length,
    `all ${REQUIRED_BUNDLE_FILES.length} required bundle artifacts present and hashed`,
    (n) => `${n} required bundle artifacts missing: ${missing.join(', ')}`,
  );
  return metric('M8', 1, 'Export integrity', '100% of required export artifacts present',
    status, observed, missing);
}

// -------------------------------------------------------- gate 2: failure attribution

function m9(db: Db, runId: string): MetricResult {
  const invocations = getInvocations(db, runId);
  const unsuccessful = invocations.filter((i) => i.outcome === 'infra_failure');
  if (unsuccessful.length === 0) {
    return metric('M9', 2, 'Failure classification coverage',
      'classified_failures / unsuccessful_invocations = 100%', 'NOT_EXERCISED',
      'no invocation failed, so there was nothing to classify');
  }
  const unclassified = unsuccessful.filter((i) => !i.failure_category || i.failure_category === 'unknown');
  const [status, observed] = zeroIsPass(
    unclassified.length,
    `all ${unsuccessful.length} unsuccessful invocations carry an explicit failure class`,
    (n) => `${n} of ${unsuccessful.length} unsuccessful invocations have no explicit failure class`,
  );
  return metric('M9', 2, 'Failure classification coverage',
    'classified_failures / unsuccessful_invocations = 100%', status, observed,
    unclassified.slice(0, 10).map((i) => i.invocation_id));
}

function m10(db: Db, runId: string): MetricResult {
  const opportunities = getOpportunities(db, runId);
  if (opportunities.length === 0) {
    return metric('M10', 2, 'Behavioural/infrastructure separation',
      'infrastructure_failures_counted_as_behavior = 0', 'NOT_EXERCISED',
      'this run created no response opportunities');
  }
  const conflated = opportunities.filter(
    (o) =>
      (o.resolution !== null && BEHAVIOURAL_RESOLUTIONS.has(o.resolution) && o.failure_category) ||
      (o.resolution === 'infrastructure_failure' && o.behaviourally_available === 1),
  );
  const [status, observed] = zeroIsPass(
    conflated.length,
    `across ${opportunities.length} opportunities, no infrastructure failure is recorded as ` +
      'behaviour and none is counted as behaviourally available',
    (n) => `${n} opportunities count an infrastructure failure as agent behaviour`,
  );
  return metric('M10', 2, 'Behavioural/infrastructure separation',
    'infrastructure_failures_counted_as_behavior = 0', status, observed,
    conflated.slice(0, 10).map((o) => o.opportunity_id));
}

function m11(db: Db, runId: string): MetricResult {
  const invocations = getInvocations(db, runId);
  const retries = invocations.filter((i) => i.attempt > 1);
  if (retries.length === 0) {
    return metric('M11', 2, 'Retry traceability', 'orphan_retries = 0', 'NOT_EXERCISED',
      'no invocation was retried, so there was no retry to trace');
  }

  const byOpportunity = new Map<string, InvocationRow[]>();
  for (const invocation of invocations) {
    const list = byOpportunity.get(invocation.opportunity_id) ?? [];
    list.push(invocation);
    byOpportunity.set(invocation.opportunity_id, list);
  }

  const orphans: string[] = [];
  for (const retry of retries) {
    const siblings = byOpportunity.get(retry.opportunity_id) ?? [];
    const parent = siblings.find((i) => i.attempt === retry.attempt - 1);
    if (!parent) {
      orphans.push(`${retry.invocation_id} (no attempt ${retry.attempt - 1} for its opportunity)`);
      continue;
    }
    // A retry that cannot say what it was retrying is not traceable.
    if (parent.outcome !== 'infra_failure' || !parent.failure_category) {
      orphans.push(`${retry.invocation_id} (previous attempt records no failure type)`);
    }
    if (!retry.request_ts) orphans.push(`${retry.invocation_id} (no timestamp)`);
  }

  const [status, observed] = zeroIsPass(
    orphans.length,
    `all ${retries.length} retries trace to a parent attempt carrying its failure type and timestamp`,
    (n) => `${n} of ${retries.length} retries cannot be traced to a classified parent attempt`,
  );
  return metric('M11', 2, 'Retry traceability', 'orphan_retries = 0', status, observed, orphans.slice(0, 10));
}

/** The three failure modes the specification requires a Phase 0 run to demonstrate. */
export const REQUIRED_INJECTED_FAULTS = ['timeout', 'provider_error', 'malformed_response'] as const;

function m12(db: Db, runId: string, evidenceRunId: string | null): MetricResult {
  const target = evidenceRunId ?? runId;
  const run = getRun(db, target);
  if (!run) {
    return metric('M12', 2, 'Controlled failure validation',
      '100% classification accuracy on injected cases', 'FAIL',
      `the nominated failure-evidence run ${target} does not exist`, [target]);
  }

  const config = runConfig(run);
  const injected = config.fault_injection?.enabled ? config.fault_injection.faults : [];
  if (injected.length === 0) {
    return metric('M12', 2, 'Controlled failure validation',
      '100% classification accuracy on injected cases', 'NOT_EXERCISED',
      `run ${target} injected no faults, so classification accuracy could not be measured. ` +
        'A fault-injection run is required evidence for this metric.', [target]);
  }

  const invocations = getInvocations(db, target);
  const problems: string[] = [];
  const refs: string[] = [];

  // Accuracy and coverage are different findings and are kept apart. Getting an injected
  // fault wrong is a defect: the instrument gave a confident wrong answer. Never injecting
  // a required fault mode is missing evidence, which is NOT_EXERCISED — it says nothing
  // was measured, not that something was measured and failed.
  const observedCategories = new Set(
    invocations.filter((i) => i.outcome === 'infra_failure').map((i) => i.failure_category ?? 'unknown'),
  );
  for (const kind of new Set(injected.map((f) => f.kind))) {
    if (!observedCategories.has(kind)) {
      problems.push(`${kind} was injected but never recorded as a ${kind} failure`);
    }
  }
  const uncovered = REQUIRED_INJECTED_FAULTS.filter((kind) => !observedCategories.has(kind));

  // No injected fault may end up counted as a decision the agent made.
  const conflated = getOpportunities(db, target).filter(
    (o) => o.resolution !== null && BEHAVIOURAL_RESOLUTIONS.has(o.resolution) && o.failure_category,
  );
  if (conflated.length > 0) {
    problems.push(`${conflated.length} injected failures were recorded as agent behaviour`);
    refs.push(...conflated.slice(0, 5).map((o) => o.opportunity_id));
  }

  const retriesRecorded = readEvents(db, target).filter((e) => e.event_type === 'retry_scheduled').length;
  if (retriesRecorded === 0 && config.runtime.max_retries > 0) {
    problems.push('faults were injected under a retrying policy but no retry was recorded');
  }

  const accurate = `run ${target}: ${injected.length} injected faults, each detected and classified ` +
    `as the condition injected (${[...observedCategories].sort().join(', ')}); ${retriesRecorded} retries recorded`;

  const status: GateStatus =
    problems.length > 0 ? 'FAIL' : uncovered.length > 0 ? 'NOT_EXERCISED' : 'PASS';
  const observed =
    problems.length > 0
      ? problems.slice(0, 3).join('; ')
      : uncovered.length > 0
        ? `${accurate}. The Phase 0 minimum also requires ${uncovered.join(' and ')}, which this ` +
          'run never injected, so that failure mode is undemonstrated.'
        : accurate;

  return metric('M12', 2, 'Controlled failure validation',
    '100% classification accuracy on injected cases; timeout, provider_error and malformed_response all demonstrated',
    status, observed, [target, ...refs].slice(0, 10));
}

// ------------------------------------------------------- gate 3: reproducibility

/** Every field the specification requires the frozen snapshot to carry. */
const REQUIRED_CONFIG_FIELDS: Array<[string, (c: ExperimentConfig) => unknown]> = [
  ['workshop protocol version', (c) => c.config_version],
  ['participant count', (c) => c.participants.length],
  ['moderator config', (c) => c.moderator?.id],
  ['model provider', (c) => c.model.provider],
  ['model', (c) => c.model.model],
  ['generation parameters', (c) => c.model.max_output_tokens],
  ['prompt versions', (c) => c.prompts?.participant_prompt_version],
  ['capability manifest', (c) => c.capabilities?.manifest],
  ['token budget', (c) => c.budgets.max_tokens_per_agent],
  ['call budget', (c) => c.budgets.max_calls_per_agent],
  ['timeout policy', (c) => c.runtime.timeout_seconds],
  ['retry policy', (c) => c.runtime.max_retries],
  ['context policy', (c) => c.context_policy?.version],
  ['channel permissions', (c) => c.channels?.private?.moderator_observes_private],
  ['termination rule', (c) => c.workshop.max_duration_seconds],
];

function m13(run: RunRow, config: ExperimentConfig): MetricResult {
  const missing = REQUIRED_CONFIG_FIELDS.filter(([, read]) => {
    const value = read(config);
    return value === undefined || value === null || value === '';
  }).map(([name]) => name);

  const [status, observed] = zeroIsPass(
    missing.length,
    `all ${REQUIRED_CONFIG_FIELDS.length} required snapshot fields present in the frozen config`,
    (n) => `${n} required snapshot fields absent: ${missing.join(', ')}`,
  );
  return metric('M13', 3, 'Immutable configuration snapshot', '100% of required fields present',
    status, observed, missing);
}

function m14(run: RunRow, config: ExperimentConfig): MetricResult {
  const problems: string[] = [];

  // Recomputing the hash from the stored snapshot is the check that matters: it proves
  // the recorded fingerprint still describes the recorded conditions.
  const recomputed = configHash(config);
  if (recomputed !== run.config_hash) {
    problems.push(`stored hash ${run.config_hash} does not match the stored config (${recomputed})`);
  }
  if (canonicalize(config) !== run.config_canonical) {
    problems.push('the canonical serialisation does not match the stored config');
  }

  // A changed experimental condition must change the fingerprint, or the fingerprint
  // proves nothing about what was held constant.
  const mutated = { ...config, model: { ...config.model, max_output_tokens: config.model.max_output_tokens + 1 } };
  if (configHash(mutated) === run.config_hash) {
    problems.push('changing an experimental parameter did not change the fingerprint');
  }

  const [status, observed] = zeroIsPass(
    problems.length,
    `fingerprint recomputes to ${run.config_hash.slice(0, 12)}… from the stored snapshot, and a ` +
      'changed parameter produces a different fingerprint',
    () => problems.slice(0, 3).join('; '),
  );
  return metric('M14', 3, 'Deterministic configuration fingerprint',
    'same_config -> same_hash; changed_config -> different_hash', status, observed, [run.config_hash]);
}

function m15(run: RunRow): MetricResult {
  // Absence is a legitimate value here; invention is not. A run outside a git checkout
  // must say so rather than carry a plausible-looking sha.
  const recorded: string[] = [];
  if (run.code_commit_sha) recorded.push(`commit ${run.code_commit_sha.slice(0, 12)}`);
  if (run.deployment_id) recorded.push(`deployment ${run.deployment_id}`);
  if (run.app_version) recorded.push(`version ${run.app_version}`);

  // A null is a legitimate, informative answer: this environment could not supply the
  // value. The failure mode this metric exists to catch is a value that looks authoritative
  // without being accountable — a revision with no record of where it was read from.
  const problems: string[] = [];
  if (run.code_commit_sha && !run.commit_source) {
    problems.push('a commit sha is recorded with no source, so its origin cannot be checked');
  }

  const [status, observed] = zeroIsPass(
    problems.length,
    recorded.length > 0
      ? `${recorded.join(', ')}; anything unavailable is recorded as unavailable rather than fabricated`
      : 'no code provenance was available and each field is explicitly recorded as unavailable',
    () => problems.join('; '),
  );
  return metric('M15', 3, 'Code/deployment provenance', 'provenance recorded or explicitly unavailable',
    status, observed, [run.run_id]);
}

/** The fields an invocation must carry for its output to be fully traceable. */
const TRACE_FIELDS: Array<[string, (i: InvocationRow) => unknown]> = [
  ['agent id', (i) => i.agent_id],
  ['opportunity id', (i) => i.opportunity_id],
  ['timestamp', (i) => i.request_ts],
  ['provider', (i) => i.provider],
  ['requested model', (i) => i.requested_model],
  ['generation parameters', (i) => i.generation_params],
  ['system prompt', (i) => i.system_prompt],
  ['prompt version', (i) => i.prompt_version],
  ['rendered context', (i) => i.rendered_messages],
  ['context policy version', (i) => i.context_policy_version],
  ['source message ids', (i) => i.context_message_ids],
  ['public/private provenance', (i) => i.context_public_ids],
  ['capability manifest', (i) => i.capability_manifest],
  ['attempt', (i) => i.attempt],
  ['outcome', (i) => i.outcome],
];

function m16(db: Db, runId: string): MetricResult {
  const invocations = getInvocations(db, runId);
  if (invocations.length === 0) {
    return metric('M16', 3, 'Invocation provenance completeness',
      'fully_traceable_invocations / invocations = 100%', 'NOT_EXERCISED',
      'this run made no invocations');
  }

  const incomplete: string[] = [];
  for (const invocation of invocations) {
    const absent = TRACE_FIELDS.filter(([, read]) => {
      const value = read(invocation);
      return value === undefined || value === null || value === '';
    });
    // Latency and token usage are only meaningful once a response came back, so their
    // absence on a failed attempt is correct rather than a gap.
    if (invocation.outcome === 'success' && (invocation.latency_ms === null || invocation.input_tokens === null)) {
      absent.push(['latency and token usage', () => null]);
    }
    if (absent.length > 0) {
      incomplete.push(`${invocation.invocation_id} (${absent.map(([n]) => n).join(', ')})`);
    }
  }

  const traceable = invocations.length - incomplete.length;
  const [status, observed] = zeroIsPass(
    incomplete.length,
    `${traceable}/${invocations.length} invocations carry every provenance field, including the ` +
      'exact rendered context and its source message ids',
    () => `${traceable}/${invocations.length} invocations fully traceable; first gap: ${incomplete[0]}`,
  );
  return metric('M16', 3, 'Invocation provenance completeness',
    'fully_traceable_invocations / invocations = 100%', status, observed, incomplete.slice(0, 10));
}

function m17(db: Db, runId: string): MetricResult {
  const invocations = getInvocations(db, runId);
  if (invocations.length === 0) {
    return metric('M17', 3, 'Context integrity', 'context_provenance_errors = 0', 'NOT_EXERCISED',
      'this run made no invocations, so no context was assembled');
  }

  const messages = new Map(getMessages(db, runId).map((m) => [m.message_id, m]));
  const problems: string[] = [];

  for (const invocation of invocations) {
    const all = JSON.parse(invocation.context_message_ids) as string[];
    const publicIds = JSON.parse(invocation.context_public_ids) as string[];
    const privateIds = JSON.parse(invocation.context_private_ids) as string[];

    // The public and private lists must partition the context exactly. An id in neither
    // has lost its channel provenance; an id in both has two contradictory answers.
    const union = new Set([...publicIds, ...privateIds]);
    if (union.size !== all.length || !all.every((id) => union.has(id))) {
      problems.push(`${invocation.invocation_id}: context ids are not partitioned by channel`);
    }
    for (const id of publicIds) {
      if (privateIds.includes(id)) {
        problems.push(`${invocation.invocation_id}: message ${id} is recorded as both public and private`);
      }
    }
    // Raw messages stay authoritative: every referenced id must still resolve to one,
    // and the channel recorded in the context must be the channel it was sent on.
    for (const id of all) {
      const message = messages.get(id);
      if (!message) {
        problems.push(`${invocation.invocation_id}: context references unknown message ${id}`);
        continue;
      }
      const claimedPublic = publicIds.includes(id);
      if (claimedPublic !== (message.channel === 'public')) {
        problems.push(`${invocation.invocation_id}: message ${id} is filed under the wrong channel`);
      }
    }
  }

  const [status, observed] = zeroIsPass(
    problems.length,
    `context of ${invocations.length} invocations resolves entirely to stored raw messages, with ` +
      'public and private histories held apart',
    () => problems.slice(0, 3).join('; '),
  );
  return metric('M17', 3, 'Context integrity', 'context_provenance_errors = 0', status, observed, problems.slice(0, 10));
}

function m18(db: Db, run: RunRow, rerunId: string | null): MetricResult {
  if (rerunId) {
    const rerun = getRun(db, rerunId);
    if (!rerun) {
      return metric('M18', 3, 'Repeated-run evidence', 'completed_runs_with_same_config_hash >= 2',
        'FAIL', `the nominated rerun ${rerunId} does not exist`, [rerunId]);
    }
    if (rerun.config_hash !== run.config_hash) {
      return metric('M18', 3, 'Repeated-run evidence', 'completed_runs_with_same_config_hash >= 2',
        'FAIL', `rerun ${rerunId} has a different config fingerprint, so it is not the same conditions`,
        [run.run_id, rerunId]);
    }
    if (rerun.run_id === run.run_id) {
      return metric('M18', 3, 'Repeated-run evidence', 'completed_runs_with_same_config_hash >= 2',
        'FAIL', 'the nominated rerun is the primary run itself', [run.run_id]);
    }
  }

  const completed = runsWithConfigHash(db, run.config_hash).filter((r) => r.status === 'COMPLETED');
  const distinct = new Set(completed.map((r) => r.run_id));
  const status: GateStatus = distinct.size >= 2 ? 'PASS' : 'FAIL';
  const observed =
    distinct.size >= 2
      ? `${distinct.size} completed runs share fingerprint ${run.config_hash.slice(0, 12)}… under distinct run ids`
      : `only ${distinct.size} completed run exists for this fingerprint, so repeatability is unproven`;
  return metric('M18', 3, 'Repeated-run evidence', 'completed_runs_with_same_config_hash >= 2',
    status, observed, [...distinct].slice(0, 10));
}

// --------------------------------------------------------------------------- assembly

/** Keeps whichever of two readings of the same rule is less favourable. */
function worse(primary: MetricResult, other: MetricResult | null): MetricResult {
  if (!other) return primary;
  const rank: Record<GateStatus, number> = { FAIL: 0, NOT_EXERCISED: 1, PASS: 2 };
  return rank[other.status] < rank[primary.status] ? other : primary;
}

export function computeMetrics(input: MetricInput): MetricResult[] {
  const { db, runId } = input;
  const run = getRun(db, runId);
  if (!run) throw new Error(`unknown run: ${runId}`);
  const config = runConfig(run);

  // The run that stands behind gate 2. Falls back to the primary run, which is correct
  // when the run under evaluation is itself the one that recorded failures.
  const evidenceRunId =
    input.failureEvidenceRunId && getRun(db, input.failureEvidenceRunId)
      ? input.failureEvidenceRunId
      : runId;

  return [
    m1(db, runId),
    m2(db, runId),
    m3(db, runId, run, config),
    m4(db, runId, config),
    m5(db, runId, run),
    m6(run, config),
    m7(db, runId, run),
    m8(db, runId, input.pendingArtifactNames ?? []),
    // Gate 2 splits the same way the gate report splits it. The rule that behaviour and
    // infrastructure are never conflated must hold on every run, so M10 is checked on
    // both and reports the worse of the two. Whether each failure mode was demonstrated
    // can only be judged where failures actually occurred, so M9 and M11 read the
    // nominated evidence run: asking a clean baseline to demonstrate retry tracing would
    // report "unexercised" about the wrong run.
    m9(db, evidenceRunId),
    worse(m10(db, runId), evidenceRunId === runId ? null : m10(db, evidenceRunId)),
    m11(db, evidenceRunId),
    m12(db, runId, input.failureEvidenceRunId ?? null),
    m13(run, config),
    m14(run, config),
    m15(run),
    m16(db, runId),
    m17(db, runId),
    m18(db, run, input.reproducibilityRunId ?? null),
  ];
}

export function metricsForGate(metrics: MetricResult[], gate: MetricGate): MetricResult[] {
  return metrics.filter((m) => m.gate === gate);
}

/**
 * A gate's verdict from its metrics alone. Any FAIL fails the gate; otherwise any
 * unexercised metric leaves it unproven. This is the same rule the gate report uses for
 * its prose checks, applied to the numbered thresholds.
 */
export function statusFromMetrics(metrics: MetricResult[]): GateStatus {
  if (metrics.some((m) => m.status === 'FAIL')) return 'FAIL';
  if (metrics.some((m) => m.status === 'NOT_EXERCISED')) return 'NOT_EXERCISED';
  return 'PASS';
}
