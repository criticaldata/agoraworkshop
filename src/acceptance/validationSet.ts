import type { Db } from '../db/index.js';
import { getRun, listRuns, runsWithConfigHash, type RunRow } from '../db/queries.js';
import { readEvents } from '../events/recorder.js';
import { INFRASTRUCTURE_FAILURES, FAILURE_EVENT_TYPE } from '../events/types.js';
import {
  evaluateGates,
  finalizeReport,
  GATE_STATUS_MEANING,
  type AcceptanceReport,
  type GateResult,
  type GateStatus,
  type NextStep,
} from './gates.js';
import { runProvenance } from '../db/queries.js';
import type { MetricResult } from './metrics.js';
import type { CodeProvenance } from '../core/provenance.js';

/**
 * Which event types count as "this run exercised failure attribution".
 *
 * `interrupted` is excluded on purpose. A run killed by a restart proves that the
 * apparatus noticed it was killed; it proves nothing about whether a provider timeout
 * is told apart from an agent choosing to stay silent, which is what gate 2 asks.
 */
const FAILURE_EVENT_TYPES = new Set<string>(
  INFRASTRUCTURE_FAILURES.filter((category) => category !== 'interrupted').map(
    (category) => FAILURE_EVENT_TYPE[category],
  ),
);

export type EvidenceRole = 'infrastructure' | 'reproducibility' | 'failure_attribution';

export interface EvidenceRun {
  run_id: string;
  role: EvidenceRole;
  /**
   * The run's own outcome, kept separate from what it proves. A run can complete
   * perfectly and still supply no evidence for a gate, and a run full of injected
   * failures is doing its job rather than going wrong.
   */
  run_level_result: {
    status: string;
    termination_reason: string | null;
    config_hash: string;
    experiment_id: string;
  };
  /** Why this run was chosen, in plain terms. */
  note: string;
}

export interface ValidationSetGate {
  key: 'infrastructure_validated' | 'failure_attribution_validated' | 'baseline_reproducible';
  title: string;
  question: string;
  status: GateStatus;
  meaning: string;
  evidence_run_ids: string[];
  evidence: string[];
  failures: string[];
  not_exercised: string[];
  next_steps: NextStep[];
  /** The numbered acceptance metrics this gate was composed from. */
  metrics: MetricResult[];
}

export interface ValidationSet {
  generated_at: string;
  primary_run_id: string;
  experiment_id: string;
  config_hash: string;
  code_provenance: CodeProvenance;
  runs: EvidenceRun[];
  gates: ValidationSetGate[];
  /** Phase 0.1 checks, present only for an opted-in robustness configuration. */
  phase01?: AcceptanceReport['phase01'];
  /** True only when all three gates PASS on the evidence actually supplied. */
  phase0_validated: boolean;
  /** What was missing, when it was not validated. Empty when it was. */
  outstanding: string[];
}

export interface ValidationSetOptions {
  db: Db;
  runId: string;
  /** Override auto-discovery. Null means "do not use any run for this gate". */
  failureEvidenceRunId?: string | null;
  reproducibilityRunId?: string | null;
}

/** A run that actually recorded at least one infrastructure failure event. */
export function runExercisedFailure(db: Db, runId: string): boolean {
  return readEvents(db, runId).some((event) => FAILURE_EVENT_TYPES.has(event.event_type));
}

/**
 * Finds a second completed run sharing this run's config hash. Reproducibility is a
 * property of a pair of runs, so it cannot be evidenced by one run alone.
 */
export function findReproducibilityRun(db: Db, run: RunRow): RunRow | null {
  const siblings = runsWithConfigHash(db, run.config_hash).filter(
    (candidate) => candidate.run_id !== run.run_id && candidate.status === 'COMPLETED',
  );
  // Prefer a run that explicitly declares this one as its source: that is a rerun,
  // not merely a run that happens to share a hash.
  return siblings.find((s) => s.source_run_id === run.run_id) ?? siblings[0] ?? null;
}

/** Finds any run that genuinely exercised infrastructure failure, most recent first. */
export function findFailureEvidenceRun(db: Db, run: RunRow): RunRow | null {
  if (runExercisedFailure(db, run.run_id)) return run;
  return listRuns(db, 200).find((candidate) => runExercisedFailure(db, candidate.run_id)) ?? null;
}

/**
 * Assembles the Phase 0 Validation Set.
 *
 * A single run is not expected to demonstrate everything. A normal run shows the
 * instrument executing end to end; a rerun of the same frozen config shows the
 * conditions are reproducible; a fault-injection run shows failures are attributed
 * correctly. This function names which run is standing behind which gate, so a reader
 * can check the claim against the run rather than take the verdict on trust.
 */
export function buildValidationSet(options: ValidationSetOptions): ValidationSet {
  const { db, runId } = options;
  const run = getRun(db, runId);
  if (!run) throw new Error(`unknown run: ${runId}`);

  const reproRun =
    options.reproducibilityRunId === undefined
      ? findReproducibilityRun(db, run)
      : options.reproducibilityRunId === null
        ? null
        : getRun(db, options.reproducibilityRunId);

  const faultRun =
    options.failureEvidenceRunId === undefined
      ? findFailureEvidenceRun(db, run)
      : options.failureEvidenceRunId === null
        ? null
        : getRun(db, options.failureEvidenceRunId);

  const report = finalizeReport(
    evaluateGates({
      db,
      runId,
      failureEvidenceRunId: faultRun?.run_id ?? null,
      reproducibilityRunId: reproRun?.run_id ?? null,
    }),
  );

  const runs: EvidenceRun[] = [describe(run, 'infrastructure', 'The run under evaluation.')];

  if (reproRun) {
    runs.push(
      describe(
        reproRun,
        'reproducibility',
        reproRun.source_run_id === run.run_id
          ? 'A rerun launched from the stored config snapshot of this run.'
          : 'A separate completed run sharing the same config hash.',
      ),
    );
  }

  if (faultRun && faultRun.run_id !== run.run_id) {
    runs.push(
      describe(
        faultRun,
        'failure_attribution',
        faultRun.config_hash === run.config_hash
          ? 'A run under the same config that recorded infrastructure failures.'
          : 'A fault-injection run under a different config, used only as evidence that ' +
              'failures are recorded and attributed correctly.',
      ),
    );
  } else if (faultRun) {
    runs.push(
      describe(
        faultRun,
        'failure_attribution',
        'This run itself recorded infrastructure failures.',
      ),
    );
  }

  const gates: ValidationSetGate[] = [
    gate(
      'infrastructure_validated',
      'Infrastructure integrity',
      'Did the workshop infrastructure work?',
      report.gates.infrastructure_validated,
      [run.run_id],
    ),
    gate(
      'failure_attribution_validated',
      'Failure attribution',
      'Can infrastructure failure be distinguished from agent behaviour?',
      report.gates.failure_attribution_validated,
      faultRun ? [...new Set([run.run_id, faultRun.run_id])] : [run.run_id],
    ),
    gate(
      'baseline_reproducible',
      'Reproducibility',
      'Can the experiment be rerun under the exact same configuration?',
      report.gates.baseline_reproducible,
      reproRun ? [run.run_id, reproRun.run_id] : [run.run_id],
    ),
  ];

  const outstanding: string[] = [];
  for (const g of gates) {
    if (g.status === 'FAIL') outstanding.push(`${g.title}: ${g.failures.join('; ')}`);
    if (g.status === 'NOT_EXERCISED') {
      outstanding.push(`${g.title}: ${g.not_exercised.join('; ')}`);
    }
  }
  if (report.phase01) {
    if (report.phase01.status === 'FAIL') {
      outstanding.push(`Phase 0.1 robustness: ${report.phase01.failures.join('; ')}`);
    }
    if (report.phase01.status === 'NOT_EXERCISED') {
      outstanding.push(`Phase 0.1 robustness: ${report.phase01.not_exercised.join('; ')}`);
    }
  }

  return {
    generated_at: report.generated_at,
    primary_run_id: run.run_id,
    experiment_id: run.experiment_id,
    config_hash: run.config_hash,
    code_provenance: runProvenance(run),
    runs,
    gates,
    phase01: report.phase01,
    phase0_validated: report.ready_for_controlled_behavioral_experiment,
    outstanding,
  };
}

function describe(run: RunRow, role: EvidenceRole, note: string): EvidenceRun {
  return {
    run_id: run.run_id,
    role,
    run_level_result: {
      status: run.status,
      termination_reason: run.termination_reason,
      config_hash: run.config_hash,
      experiment_id: run.experiment_id,
    },
    note,
  };
}

function gate(
  key: ValidationSetGate['key'],
  title: string,
  question: string,
  result: GateResult,
  evidenceRunIds: string[],
): ValidationSetGate {
  return {
    key,
    title,
    question,
    status: result.status,
    meaning: GATE_STATUS_MEANING[result.status],
    evidence_run_ids: evidenceRunIds,
    evidence: result.evidence,
    failures: result.failures,
    not_exercised: result.not_exercised ?? [],
    next_steps: result.next_steps ?? [],
    metrics: result.metrics ?? [],
  };
}
