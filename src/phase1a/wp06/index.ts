import { configHash } from '../../config/hash.js';
import {
  createManifest, inferState, verifyEvidenceBundle,
  type EvidenceBundle, type Outcome,
} from '../index.js';
import { buildWorkshopPlan } from '../wp03/workflow.js';

export const WP06_ANALYSIS_VERSION = 'wp06-descriptive-v1';
const outcomes: readonly Outcome[] = ['success', 'abstained', 'refused', 'timeout', 'provider_error', 'invalid_response', 'rate_limit'];
const behavioral = new Set<Outcome>(['success', 'abstained', 'refused']);

/** Operator-facing metadata only. Never includes checkpoint text or raw prompts. */
export function analyzeRun(bundle: EvidenceBundle) {
  const check = verifyEvidenceBundle(bundle);
  if (!check.valid) throw new Error(`WP06 invalid evidence: ${check.errors.join(', ')}`);
  const manifest = createManifest(bundle.manifest);
  const runId = bundle.events[0]?.run_id;
  if (!runId || bundle.events[0]?.event_type !== 'run.created') throw new Error('WP06 requires run.created evidence');
  const plan = buildWorkshopPlan(manifest);
  const keys = new Set(plan.operations.map(operation => operation.key));
  const commits = bundle.events.filter(event => event.event_type === 'operation.committed');
  if (new Set(commits.map(event => event.payload.operation_key)).size !== commits.length) throw new Error('WP06 duplicate committed opportunity');
  for (const event of commits) {
    if (!keys.has(String(event.payload.operation_key))) throw new Error('WP06 unknown committed opportunity');
  }
  for (const call of bundle.provider_calls) {
    const operation = plan.operations.find(item => item.key === call.operation_key);
    if (call.run_id !== runId || !operation || call.participant_id !== operation.participantId || !outcomes.includes(call.terminal_status)) {
      throw new Error('WP06 invalid call run, participant, operation or outcome');
    }
  }
  if (bundle.artifacts.some(artifact => artifact.run_id !== runId)) throw new Error('WP06 mixed-run artifacts');
  // The sealed event sequence is authoritative; export array order is not.
  const terminalSequences = new Map(bundle.events
    .filter(event => event.event_type === 'provider_call.completed' || event.event_type === 'provider_call.failed')
    .map(event => [event.payload.call_id, event.sequence]));

  const rows = plan.operations.map(operation => {
    const calls = bundle.provider_calls.filter(call => call.operation_key === operation.key)
      .sort((a, b) => terminalSequences.get(a.call_id)! - terminalSequences.get(b.call_id)!);
    const events = bundle.events.filter(event => event.payload.operation_key === operation.key);
    const starts = events.filter(event => event.event_type === 'provider_call.started');
    const pendingAttempts = starts.filter(event => !calls.some(call => call.request_artifact_ref === event.payload.request_artifact_ref)).length;
    const commit = commits.find(event => event.payload.operation_key === operation.key);
    const completion = events.filter(event => event.event_type === `${operation.kind}.completed`);
    const lastCall = calls.at(-1);
    let artifactId: string | null = null;
    if (commit) {
      const output = completion[0];
      const artifact = bundle.artifacts.find(item => item.artifact_id === commit.artifact_refs[0]);
      const terminal = events.find(event => event.payload.call_id === lastCall?.call_id && event.event_type === 'provider_call.completed');
      if (completion.length !== 1 || !output || !artifact || !lastCall || !terminal || !behavioral.has(lastCall.terminal_status)
        || commit.artifact_refs.length !== 1 || output.artifact_refs.length !== 1 || output.artifact_refs[0] !== artifact.artifact_id
        || artifact.kind !== operation.kind || artifact.visibility !== operation.visibility || artifact.owner_id !== operation.ownerId
        || output.actor_id !== operation.participantId || output.payload.outcome !== lastCall.terminal_status
        || terminal.sequence >= output.sequence || output.sequence >= commit.sequence
        || events.some(event => event.event_type === 'provider_call.started' && event.sequence > commit.sequence)) {
        throw new Error(`WP06 inconsistent committed evidence: ${operation.key}`);
      }
      artifactId = artifact.artifact_id;
    }
    const stage = operation.key.startsWith('round:') ? 'PUBLIC'
      : operation.key.startsWith('t0:') ? 'T0'
      : operation.key.startsWith('t1:') ? 'T6'
      : operation.key.startsWith('t2:') ? 'TR' : 'REPORT';
    return {
      opportunity_id: operation.key, participant_id: operation.participantId, stage,
      visibility: operation.visibility,
      status: commit ? 'committed' : pendingAttempts ? 'pending' : lastCall ? (behavioral.has(lastCall.terminal_status) ? 'uncommitted_response' : 'technical_failure') : 'not_attempted',
      outcome: lastCall?.terminal_status ?? null,
      attempts: calls.length,
      started_attempts: starts.length,
      pending_attempts: pendingAttempts,
      technical_attempts: calls.filter(call => !behavioral.has(call.terminal_status)).length,
      source_call_ids: calls.map(call => call.call_id),
      source_event_ids: events.map(event => event.event_id),
      output_artifact_id: artifactId,
    };
  });
  const state = inferState(bundle.events);
  if (state === 'COMPLETE' && rows.some(row => row.status !== 'committed')) throw new Error('WP06 completed run has missing committed opportunities');

  function summarize(selected: typeof rows) {
    const committed = selected.filter(row => row.status === 'committed');
    const successful = committed.filter(row => row.outcome === 'success');
    const sourceEventIds = selected.flatMap(row => row.source_event_ids);
    return {
      planned: selected.length,
      attempted: selected.filter(row => row.attempts > 0 || row.status === 'pending').length,
      committed: committed.length,
      not_attempted: selected.filter(row => row.status === 'not_attempted').length,
      pending: selected.filter(row => row.status === 'pending').length,
      uncommitted_responses: selected.filter(row => row.status === 'uncommitted_response').length,
      technical_failures: selected.filter(row => row.status === 'technical_failure').length,
      attempts: selected.reduce((sum, row) => sum + row.attempts, 0),
      started_attempts: selected.reduce((sum, row) => sum + row.started_attempts, 0),
      pending_attempts: selected.reduce((sum, row) => sum + row.pending_attempts, 0),
      technical_attempts: selected.reduce((sum, row) => sum + row.technical_attempts, 0),
      // Counts are opportunity outcomes, never retry counts.
      outcomes: Object.fromEntries(outcomes.map(outcome => [outcome, selected.filter(row => row.outcome === outcome).length])),
      response_rate: {
        algorithm_version: WP06_ANALYSIS_VERSION,
        numerator: successful.length, denominator: committed.length,
        value: committed.length ? successful.length / committed.length : null,
        definition: 'Committed success / committed behavioral outcomes (success, abstained, refused). Technical and uncommitted opportunities excluded; all planned counts retained separately.',
        source_event_ids: sourceEventIds,
      },
    };
  }
  const usage = (field: 'inputTokens' | 'outputTokens') => {
    const values = bundle.provider_calls.map(call => call.usage?.[field] ?? null);
    const known = values.filter((value): value is number => value !== null);
    if (known.some(value => !Number.isFinite(value) || value < 0)) throw new Error('WP06 invalid usage value');
    const missing = values.length - known.length;
    const sum = known.reduce((total, value) => total + value, 0);
    return { total: values.length && !missing ? sum : null, known_total: sum, missing_calls: missing, recorded_calls: values.length, source_call_ids: bundle.provider_calls.map(call => call.call_id) };
  };
  return {
    algorithm_version: WP06_ANALYSIS_VERSION,
    analysis_unit: 'run' as const, nested_units: ['participant', 'opportunity', 'attempt'],
    visibility: 'operator' as const,
    run_id: runId, manifest_hash: bundle.manifest_hash,
    evidence_hash: configHash({ ...bundle, integrity: { valid: check.valid, errors: check.errors } }),
    source: { ...manifest.source }, condition: manifest.cell, replication: manifest.replication,
    state, protocol_deviations: [...manifest.variations],
    integrity: check,
    evidence_completeness: rows.every(row => row.status === 'committed') ? 'complete' : 'partial',
    totals: summarize(rows),
    by_stage: Object.fromEntries(['T0', 'PUBLIC', 'T6', 'REPORT', 'TR'].map(stage => [stage, summarize(rows.filter(row => row.stage === stage))])),
    by_participant: manifest.participants.map(participant => ({ participant_id: participant.id, ...summarize(rows.filter(row => row.participant_id === participant.id)) })),
    usage: { input_tokens: usage('inputTokens'), output_tokens: usage('outputTokens') },
    opportunities: rows,
    scientific_status: 'PENDING_SCIENTIFIC_APPROVAL' as const,
    behavioral_metrics: { availability: 'unavailable', reason: 'Requires a versioned approved codebook, independent annotation, calibration and a registered analysis plan.' },
    limitations: [
      'Descriptive engineering output; completion and integrity do not establish scientific readiness.',
      'Fixture and engineering admission classes are not scientific observations.',
      'No inference about agreement, influence, dissent, or internal mental states from delivery counts.',
      'Partial traces remain partial; missing observations are never coded as absent behavior.',
      'Only supplied runs are represented; this is not a campaign denominator or an exclusion decision.',
      'No transcript, private checkpoint body, or raw provider response is emitted. Metadata remains operator-scoped.',
    ],
  };
}
