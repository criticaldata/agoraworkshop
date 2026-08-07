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
} from '../db/queries.js';
import { readEvents } from '../events/recorder.js';
import { isVisibleTo } from '../orchestrator/visibility.js';
import { computeAnalytics } from '../analytics/summary.js';
import { REQUIRED_BUNDLE_FILES } from '../export/bundleContract.js';

/**
 * `NOT_EXERCISED` is deliberately distinct from both PASS and FAIL. It means the
 * conditions the gate is meant to judge never occurred in the runs supplied, so there
 * is nothing to judge. Reporting PASS there would claim evidence that does not exist;
 * reporting FAIL would claim a defect that has not been shown.
 */
export type GateStatus = 'PASS' | 'FAIL' | 'NOT_EXERCISED';

/**
 * What the operator can do about a failing check.
 *
 * Some gate failures are defects in the run and nothing can be clicked to fix them.
 * Others just mean a step has not been taken yet, and for those the report should say
 * which step, in the words of the interface rather than of the command line.
 */
export type RemedyAction = 'export' | 'rerun' | 'fault_run';

export interface NextStep {
  text: string;
  action: RemedyAction | null;
}

export interface GateResult {
  status: GateStatus;
  evidence: string[];
  failures: string[];
  /** Checks that could not run because the situation never arose. Never a defect. */
  not_exercised: string[];
  /** Ordered actions that would resolve what is outstanding. Empty when nothing helps. */
  next_steps: NextStep[];
}

/** Only an all-PASS report is evidence. NOT_EXERCISED is missing evidence, not a pass. */
function gateStatus(failures: string[], notExercised: string[]): GateStatus {
  if (failures.length > 0) return 'FAIL';
  if (notExercised.length > 0) return 'NOT_EXERCISED';
  return 'PASS';
}

export const GATE_STATUS_MEANING: Record<GateStatus, string> = {
  PASS: 'The gate was exercised and every check passed.',
  FAIL: 'The gate was exercised and at least one check failed.',
  NOT_EXERCISED:
    'The conditions this gate judges did not occur in the runs supplied, so the gate is unproven. This is not a pass.',
};

export interface AcceptanceReport {
  run_id: string;
  phase: '0';
  experiment_id: string;
  config_hash: string;
  generated_at: string;
  evaluated_runs: {
    primary_run_id: string;
    failure_evidence_run_id: string | null;
    reproducibility_run_id: string | null;
  };
  gates: {
    infrastructure_validated: GateResult;
    failure_attribution_validated: GateResult;
    baseline_reproducible: GateResult;
  };
  ready_for_controlled_behavioral_experiment: boolean;
}

export interface LeakAudit {
  invocationsChecked: number;
  contextReferencesChecked: number;
  violations: Array<{
    invocation_id: string;
    agent_id: string;
    message_id: string;
    reason: string;
  }>;
}

/**
 * Recomputes, from stored data alone, whether any agent was ever exposed to a message
 * it was not authorised to see. This is the strongest available evidence that
 * public/private separation held, because it re-derives visibility rather than
 * trusting the routing decision that was made at the time.
 */
export function auditPrivacyLeaks(db: Db, runId: string): LeakAudit {
  const run = getRun(db, runId);
  if (!run) throw new Error(`unknown run: ${runId}`);
  const config = runConfig(run);

  const messages = new Map(getMessages(db, runId).map((m) => [m.message_id, m]));
  const invocations = getInvocations(db, runId);

  const violations: LeakAudit['violations'] = [];
  let references = 0;

  for (const invocation of invocations) {
    const ids = JSON.parse(invocation.context_message_ids) as string[];
    for (const id of ids) {
      references += 1;
      const message = messages.get(id);
      if (!message) {
        violations.push({
          invocation_id: invocation.invocation_id,
          agent_id: invocation.agent_id,
          message_id: id,
          reason: 'context referenced a message that is not in the message store',
        });
        continue;
      }
      if (!isVisibleTo(config, message, invocation.agent_id)) {
        violations.push({
          invocation_id: invocation.invocation_id,
          agent_id: invocation.agent_id,
          message_id: id,
          reason: `agent was exposed to a ${message.channel} message it is not authorised to see`,
        });
      }
    }
  }

  return { invocationsChecked: invocations.length, contextReferencesChecked: references, violations };
}

export interface EvaluateGatesOptions {
  db: Db;
  runId: string;
  /** A run (typically fault-injected) that supplies evidence for gate 2. */
  failureEvidenceRunId?: string | null;
  /** A second run of the same frozen config, supplying evidence for gate 3. */
  reproducibilityRunId?: string | null;
  /**
   * Artifact names the caller is in the middle of writing.
   *
   * The acceptance report is itself part of the bundle, so it is written before the
   * files that come after it. Without this, gate 1 would read a half-written bundle and
   * report it incomplete. The exporter passes the names it is contractually committed
   * to writing in the same call; a write failure throws and no bundle is produced.
   */
  pendingArtifactNames?: string[];
}

export function evaluateGates(options: EvaluateGatesOptions): AcceptanceReport {
  const { db, runId } = options;
  const run = getRun(db, runId);
  if (!run) throw new Error(`unknown run: ${runId}`);

  return {
    run_id: runId,
    phase: '0',
    experiment_id: run.experiment_id,
    config_hash: run.config_hash,
    generated_at: new Date().toISOString(),
    evaluated_runs: {
      primary_run_id: runId,
      failure_evidence_run_id: options.failureEvidenceRunId ?? null,
      reproducibility_run_id: options.reproducibilityRunId ?? null,
    },
    gates: {
      infrastructure_validated: gateInfrastructure(db, runId, options.pendingArtifactNames ?? []),
      failure_attribution_validated: gateFailureAttribution(
        db,
        runId,
        options.failureEvidenceRunId ?? null,
      ),
      baseline_reproducible: gateReproducible(db, runId, options.reproducibilityRunId ?? null),
    },
    ready_for_controlled_behavioral_experiment: false,
  };
}

/** Sets the top-level readiness flag only when every gate actually passed. */
export function finalizeReport(report: AcceptanceReport): AcceptanceReport {
  const statuses = Object.values(report.gates).map((g) => g.status);
  return {
    ...report,
    ready_for_controlled_behavioral_experiment: statuses.every((s) => s === 'PASS'),
  };
}

function gateInfrastructure(db: Db, runId: string, pendingArtifacts: string[]): GateResult {
  const evidence: string[] = [];
  const failures: string[] = [];
  const nextSteps: NextStep[] = [];

  const run = getRun(db, runId)!;
  const events = readEvents(db, runId);
  const messages = getMessages(db, runId);
  const transitions = getTransitions(db, runId);
  const artifacts = getArtifacts(db, runId);
  const leaks = auditPrivacyLeaks(db, runId);

  if (run.status === 'COMPLETED') {
    evidence.push(`run reached a clean terminal state (${run.termination_reason})`);
  } else {
    failures.push(`run status is ${run.status}, expected COMPLETED`);
  }

  // Event ordering must be a contiguous 1..N sequence for replay to be trustworthy.
  const sequences = events.map((e) => e.sequence);
  const contiguous = sequences.every((value, index) => value === index + 1);
  if (events.length > 0 && contiguous) {
    evidence.push(`${events.length} structured events with contiguous sequence 1..${events.length}`);
  } else {
    failures.push('event sequence is empty or not contiguous');
  }

  const publicMessages = messages.filter((m) => m.channel === 'public');
  const privateMessages = messages.filter((m) => m.channel === 'private');
  const delivered = events.filter(
    (e) => e.event_type === 'message_delivered' || e.event_type === 'private_message_delivered',
  );
  if (publicMessages.length > 0 && delivered.length > 0) {
    evidence.push(
      `${publicMessages.length} public and ${privateMessages.length} private messages routed, ` +
        `${delivered.length} recorded deliveries`,
    );
  } else {
    failures.push('no routed messages or no delivery events recorded');
  }

  const misrouted = messages.filter((m) => m.actual_recipients.length === 0);
  if (misrouted.length === 0) {
    evidence.push('every message resolved to at least one recipient');
  } else {
    failures.push(`${misrouted.length} messages resolved to zero recipients`);
  }

  if (privateMessages.length > 0) {
    evidence.push(`private channel exercised (${privateMessages.length} breakout messages)`);
  } else {
    failures.push('private channel was never exercised, so separation is untested');
  }

  if (leaks.violations.length === 0) {
    evidence.push(
      `re-derived visibility for ${leaks.contextReferencesChecked} context references across ` +
        `${leaks.invocationsChecked} invocations: 0 cross-channel leaks`,
    );
  } else {
    failures.push(`${leaks.violations.length} cross-channel visibility violations detected`);
  }

  const rejected = transitions.filter((t) => t.status !== 'completed');
  if (transitions.length > 0 && rejected.length === 0) {
    evidence.push(
      `${transitions.length} state transitions completed: ` +
        transitions.map((t) => `${t.from_state}->${t.to_state}`).join(', '),
    );
  } else {
    failures.push(`${rejected.length} state transitions did not complete`);
  }

  if (artifacts.length > 0) {
    evidence.push(`${artifacts.length} artifacts exported and hashed`);
    // Exporting *something* is not the same as exporting a complete package.
    const names = new Set([...artifacts.map((a) => a.name), ...pendingArtifacts]);
    const missing = REQUIRED_BUNDLE_FILES.filter((name) => !names.has(name));
    if (missing.length === 0) {
      evidence.push(
        `bundle contains every required Phase 0 artifact (${REQUIRED_BUNDLE_FILES.length} files)`,
      );
    } else {
      failures.push(`exported bundle is missing required artifacts: ${missing.join(', ')}`);
      nextSteps.push({
        text: 'Export the artifact bundle again. The last export did not write every required file.',
        action: 'export',
      });
    }
  } else {
    failures.push('no artifacts have been exported for this run');
    nextSteps.push({
      text: 'Export the artifact bundle. Nothing is wrong with the run; this step has not been taken yet.',
      action: 'export',
    });
  }

  const unclassified = getInvocations(db, runId).filter(
    (i) => i.outcome === 'infra_failure' && (!i.failure_category || i.failure_category === 'unknown'),
  );
  if (unclassified.length === 0) {
    evidence.push('no unclassified execution errors remain');
  } else {
    failures.push(`${unclassified.length} invocations failed with an unclassified category`);
  }

  return {
    status: gateStatus(failures, []),
    evidence,
    failures,
    not_exercised: [],
    next_steps: nextSteps,
  };
}

function gateFailureAttribution(
  db: Db,
  runId: string,
  evidenceRunId: string | null,
): GateResult {
  const evidence: string[] = [];
  const failures: string[] = [];
  const notExercised: string[] = [];
  const nextSteps: NextStep[] = [];

  // The correctness rule is checked on every run; the demonstration of each failure
  // mode is checked on whichever run actually produced failures.
  const primaryOpportunities = getOpportunities(db, runId);
  const mislabelled = primaryOpportunities.filter(
    (o) =>
      o.resolution === 'explicit_abstention' &&
      o.failure_category !== null &&
      o.failure_category !== undefined,
  );
  if (mislabelled.length === 0) {
    evidence.push('no opportunity is labelled explicit_abstention while carrying a failure category');
  } else {
    failures.push(`${mislabelled.length} opportunities conflate infrastructure failure with abstention`);
  }

  const badlyAvailable = primaryOpportunities.filter(
    (o) => o.resolution === 'infrastructure_failure' && o.behaviourally_available === 1,
  );
  if (badlyAvailable.length === 0) {
    evidence.push('every infrastructure failure is excluded from behavioural availability');
  } else {
    failures.push(
      `${badlyAvailable.length} infrastructure failures were counted as behaviourally available`,
    );
  }

  const target = evidenceRunId ?? runId;
  const targetRun = getRun(db, target);
  if (!targetRun) {
    failures.push(`failure-evidence run ${target} does not exist`);
    return { status: 'FAIL', evidence, failures, not_exercised: notExercised, next_steps: nextSteps };
  }

  const events = readEvents(db, target);
  const invocations = getInvocations(db, target);
  const opportunities = getOpportunities(db, target);

  const failureEvents = events.filter((e) =>
    ['timeout', 'rate_limit', 'provider_error', 'provider_refusal', 'network_error', 'malformed_response', 'routing_error', 'permission_denied'].includes(
      e.event_type,
    ),
  );
  const retryScheduled = events.filter((e) => e.event_type === 'retry_scheduled');
  const retryExhausted = events.filter((e) => e.event_type === 'retry_exhausted');
  const recoveredAfterRetry = opportunities.filter((o) => o.resolution === 'success' && o.attempts > 1);
  const behaviouralEvents = events.filter(
    (e) => e.event_type === 'explicit_abstention' || e.event_type === 'no_op',
  );

  if (failureEvents.length > 0) {
    const categories = [...new Set(failureEvents.map((e) => e.event_type))];
    evidence.push(
      `run ${target}: ${failureEvents.length} infrastructure events recorded as distinct types ` +
        `(${categories.join(', ')})`,
    );
  } else {
    // No infrastructure failure occurred. That is not a defect and not a pass: the
    // separation between failure and behaviour was simply never put under load.
    notExercised.push(
      `run ${target} recorded no infrastructure failure events, so failure attribution was ` +
        `never exercised. Nothing failed, so there was nothing to attribute.`,
    );
    nextSteps.push({
      text:
        'Start a run from a fault-injection configuration. It injects failures on purpose, ' +
        'which is what this check needs in order to have anything to judge.',
      action: 'fault_run',
    });
  }

  if (retryScheduled.length > 0) {
    evidence.push(`run ${target}: retry behaviour visible (${retryScheduled.length} retries scheduled)`);
  } else if (failureEvents.length > 0) {
    failures.push(
      `run ${target}: infrastructure failures occurred but no retry was scheduled for any of them`,
    );
  } else {
    notExercised.push(`run ${target}: no retry events, because nothing failed`);
  }

  if (recoveredAfterRetry.length > 0) {
    evidence.push(
      `run ${target}: ${recoveredAfterRetry.length} opportunities succeeded on a later attempt`,
    );
  }
  if (retryExhausted.length > 0) {
    evidence.push(`run ${target}: ${retryExhausted.length} opportunities exhausted their retries`);
  }

  const failedInvocations = invocations.filter((i) => i.outcome === 'infra_failure');
  const abstainedInvocations = invocations.filter((i) => i.outcome === 'explicit_abstention');
  evidence.push(
    `run ${target}: ${failedInvocations.length} invocations classified as infrastructure failure, ` +
      `${abstainedInvocations.length} as explicit behavioural abstention, ` +
      `${behaviouralEvents.length} behavioural silence events; the two are stored in separate fields`,
  );

  return {
    status: gateStatus(failures, notExercised),
    evidence,
    failures,
    not_exercised: notExercised,
    next_steps: nextSteps,
  };
}

function gateReproducible(db: Db, runId: string, rerunId: string | null): GateResult {
  const evidence: string[] = [];
  const failures: string[] = [];
  const nextSteps: NextStep[] = [];

  const run = getRun(db, runId)!;
  const config = runConfig(run);

  if (run.config_hash) {
    evidence.push(`config hash recorded: ${run.config_hash}`);
  } else {
    failures.push('no config hash recorded');
  }

  if (run.config_canonical && run.config_json) {
    evidence.push('immutable config snapshot stored with the run');
  } else {
    failures.push('config snapshot missing');
  }

  evidence.push(
    `model settings documented: provider=${config.model.provider}, model=${config.model.model}, ` +
      `max_output_tokens=${config.model.max_output_tokens}, thinking=${config.model.thinking}, ` +
      `effort=${config.model.effort}, temperature=${String(config.model.temperature)}, ` +
      `top_p=${String(config.model.top_p)}, seed=${String(config.model.seed)}`,
  );
  evidence.push(
    `prompt versions documented: participant=${config.prompts.participant_prompt_version}, ` +
      `moderator=${config.prompts.moderator_prompt_version}; context policy=${config.context_policy.version}`,
  );
  evidence.push(
    `retry policy=${config.runtime.max_retries} retries / ${config.runtime.timeout_seconds}s timeout; ` +
      `budgets=${config.budgets.max_calls_per_agent} calls / ${config.budgets.max_tokens_per_agent} tokens per agent; ` +
      `tools_enabled=${config.capabilities.tools_enabled}`,
  );

  if (run.code_commit_sha) {
    evidence.push(`code commit sha recorded: ${run.code_commit_sha}`);
  } else {
    evidence.push('code commit sha unavailable (not a git checkout)');
  }

  const siblings = runsWithConfigHash(db, run.config_hash).filter((r) => r.status === 'COMPLETED');
  const distinct = new Set(siblings.map((r) => r.run_id));
  if (rerunId) {
    const rerun = getRun(db, rerunId);
    if (!rerun) failures.push(`rerun ${rerunId} does not exist`);
    else if (rerun.config_hash !== run.config_hash) {
      failures.push(
        `rerun ${rerunId} has config hash ${rerun.config_hash}, which differs from ${run.config_hash}`,
      );
    } else if (rerun.run_id === run.run_id) {
      failures.push('rerun id is identical to the primary run id');
    } else {
      evidence.push(
        `rerun ${rerunId} launched from the same frozen config: distinct run id, identical config hash`,
      );
    }
  } else if (distinct.size >= 2) {
    evidence.push(
      `${distinct.size} completed runs share config hash ${run.config_hash} with distinct run ids`,
    );
  } else {
    failures.push(
      'only one completed run exists for these settings, so repeatability is unproven',
    );
    nextSteps.push({
      text:
        'Run this experiment again with the same settings. Two runs are needed because ' +
        'repeatability is a property of a pair of runs, not of one.',
      action: 'rerun',
    });
  }

  const analytics = computeAnalytics(db, runId);
  evidence.push(
    `outputs comparable under held-constant conditions: ${analytics.total_public_messages} public / ` +
      `${analytics.total_private_messages} private messages, ${analytics.total_provider_calls} provider calls`,
  );

  return {
    status: gateStatus(failures, []),
    evidence,
    failures,
    not_exercised: [],
    next_steps: nextSteps,
  };
}
