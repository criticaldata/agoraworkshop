import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Db } from '../db/index.js';
import { freezeConfig, loadConfigFile } from '../config/load.js';
import { executeRun } from '../orchestrator/runner.js';
import { exportRun } from '../export/exporter.js';
import { getOpportunities, getRun } from '../db/queries.js';
import { codeProvenance } from '../core/provenance.js';
import { buildValidationSet, type ValidationSet } from '../acceptance/validationSet.js';
import { readEvents } from '../events/recorder.js';
import { backupDatabase, recordBackupVerification } from '../db/backup.js';

export interface ValidationOptions {
  db: Db;
  configPath: string;
  /** Optional separate fault-injection config supplying gate 2 evidence. */
  faultConfigPath?: string | null;
  outDir?: string | null;
}

export interface ValidationResult {
  ready: boolean;
  directory: string;
  baselineRunId: string;
  rerunRunId: string;
  faultRunId: string;
  configHash: string;
  rerunConfigHash: string;
  gates: Record<string, string>;
  validationSet: ValidationSet;
}

/**
 * Produces the Phase 0 validation package: a baseline run, a rerun of the same frozen
 * config, a run that actually exercises infrastructure failure, and the exported
 * bundle with gate evidence drawn from all three.
 */
export async function runValidationPackage(
  options: ValidationOptions,
): Promise<ValidationResult> {
  const { db } = options;
  const directory = resolve(options.outDir ?? './phase0_validation');
  mkdirSync(directory, { recursive: true });

  const frozen = loadConfigFile(options.configPath);
  const provenance = codeProvenance();

  const baseline = await executeRun({ db, frozen, provenance });
  if (baseline.status !== 'COMPLETED') {
    throw new Error(`baseline run did not complete: ${baseline.status}`);
  }

  // The baseline configuration is also the deterministic recovery fixture. Rewind
  // only its final closing opportunity to the last durable delivery, then resume it
  // through the same public runner used by the CLI. This turns M27 into evidence of
  // an actual resume rather than evidence that checkpoint rows happen to exist.
  if (frozen.config.recovery?.enabled) {
    const resumed = await resumeValidationFixture(db, baseline.runId, frozen);
    if (resumed.status !== 'COMPLETED') {
      throw new Error(`recovery evidence run did not complete: ${resumed.status}`);
    }
  }

  if (frozen.config.recovery?.enabled) {
    const backupPath = join(directory, 'baseline-recovery.sqlite');
    await backupDatabase(db, backupPath);
    recordBackupVerification(db, baseline.runId, backupPath);
  }

  // The rerun is rehydrated from what the baseline actually stored, so an identical
  // hash proves the snapshot round-trips, not merely that the file is unchanged.
  const baselineRow = getRun(db, baseline.runId)!;
  const rehydrated = freezeConfig(
    JSON.parse(baselineRow.config_json),
    baselineRow.config_source_path,
  );
  const rerun = await executeRun({
    db,
    frozen: rehydrated,
    sourceRunId: baseline.runId,
    provenance,
  });

  let faultRunId = baseline.runId;
  if (options.faultConfigPath) {
    const faultFrozen = loadConfigFile(options.faultConfigPath);
    const faultRun = await executeRun({ db, frozen: faultFrozen, provenance });
    faultRunId = faultRun.runId;
    exportRun({
      db,
      runId: faultRun.runId,
      outDir: join(directory, 'fault_run'),
      failureEvidenceRunId: faultRun.runId,
    });
  }

  const bundle = exportRun({
    db,
    runId: baseline.runId,
    outDir: directory,
    failureEvidenceRunId: faultRunId,
    reproducibilityRunId: rerun.runId,
  });

  // The validation set is the package-level view: which run stands behind which gate.
  // It is written alongside the bundle rather than inside it, because it describes a
  // set of runs while the bundle describes one.
  const validationSet = buildValidationSet({
    db,
    runId: baseline.runId,
    failureEvidenceRunId: faultRunId,
    reproducibilityRunId: rerun.runId,
  });
  writeFileSync(
    join(directory, 'validation_set.json'),
    `${JSON.stringify(validationSet, null, 2)}\n`,
    'utf8',
  );

  writeFileSync(join(directory, 'known_issues.md'), KNOWN_ISSUES, 'utf8');
  writeFileSync(
    join(directory, 'VALIDATION.md'),
    validationReadme({
      baselineRunId: baseline.runId,
      rerunRunId: rerun.runId,
      faultRunId,
      configHash: frozen.hash,
      rerunConfigHash: rerun.configHash,
      configPath: options.configPath,
      faultConfigPath: options.faultConfigPath ?? null,
      ready: bundle.acceptance.ready_for_controlled_behavioral_experiment,
      gates: validationSet.gates.map((g) => `${g.title}: ${g.status}`),
    }),
    'utf8',
  );

  const gates = Object.fromEntries(
    Object.entries(bundle.acceptance.gates).map(([name, gate]) => [name, gate.status]),
  ) as Record<string, string>;
  if (bundle.acceptance.phase01) gates.phase01 = bundle.acceptance.phase01.status;

  return {
    validationSet,
    ready: bundle.acceptance.ready_for_controlled_behavioral_experiment,
    directory,
    baselineRunId: baseline.runId,
    rerunRunId: rerun.runId,
    faultRunId,
    configHash: frozen.hash,
    rerunConfigHash: rerun.configHash,
    gates,
  };
}

/**
 * Creates a deterministic process-stop boundary for the validation fixture. The
 * production recovery path is still exercised by `executeRun(...resumeRunId)`: this
 * helper only chooses the durable cut point and never edits the implementation's
 * recovery decisions.
 */
async function resumeValidationFixture(
  db: Db,
  runId: string,
  frozen: ReturnType<typeof freezeConfig>,
) {
  const opportunities = getOpportunities(db, runId);
  const target = opportunities.at(-1);
  if (!target?.message_id) throw new Error('recovery fixture requires a final persisted message');
  const deliveries = readEvents(db, runId).filter(
    (event) =>
      (event.event_type === 'message_delivered' || event.event_type === 'private_message_delivered') &&
      event.payload['message_id'] === target.message_id,
  );
  const lastDelivery = deliveries.at(-1);
  if (!lastDelivery) throw new Error('recovery fixture requires a final delivery event');

  db.prepare(`DELETE FROM events WHERE run_id = ? AND sequence > ?`).run(runId, lastDelivery.sequence);
  db.prepare(`DELETE FROM state_transitions WHERE run_id = ? AND sequence > ?`).run(runId, lastDelivery.sequence);
  db.prepare(`DELETE FROM run_checkpoints WHERE run_id = ? AND opportunity_id = ?`).run(runId, target.opportunity_id);
  db.prepare(
    `UPDATE opportunities SET resolved_at = NULL, resolution = NULL, failure_category = NULL,
       behaviourally_available = 0, attempts = 0 WHERE opportunity_id = ?`,
  ).run(target.opportunity_id);
  db.prepare(
    `UPDATE runs SET status = 'INTERRUPTED', termination_reason = 'interrupted',
       ended_at = NULL, failure_reason = 'deterministic validation interruption' WHERE run_id = ?`,
  ).run(runId);

  return executeRun({ db, frozen, resumeRunId: runId, provenance: codeProvenance() });
}

function validationReadme(input: {
  baselineRunId: string;
  rerunRunId: string;
  faultRunId: string;
  configHash: string;
  rerunConfigHash: string;
  configPath: string;
  faultConfigPath: string | null;
  ready: boolean;
  gates: string[];
}): string {
  return `# AGORA WORKSHOP Phase 0 validation package

| Item | Value |
| --- | --- |
| Baseline run | \`${input.baselineRunId}\` |
| Rerun of the same frozen config | \`${input.rerunRunId}\` |
| Failure-evidence run | \`${input.faultRunId}\` |
| Baseline config | \`${input.configPath}\` |
| Fault config | ${input.faultConfigPath ? `\`${input.faultConfigPath}\`` : 'same as baseline'} |
| Baseline config hash | \`${input.configHash}\` |
| Rerun config hash | \`${input.rerunConfigHash}\` |
| Hashes identical | ${input.configHash === input.rerunConfigHash ? 'yes' : 'NO, investigate'} |
| ready_for_controlled_behavioral_experiment | **${input.ready}** |
${input.gates.map((g) => `| ${g.split(': ')[0]} | ${g.split(': ')[1]} |`).join('\n')}

The artifacts in this directory describe the **baseline** run. \`acceptance_report.json\`
draws gate 2 evidence from the failure-evidence run and gate 3 evidence from the rerun;
both are named in its \`evaluated_runs\` block.

Open \`replay.html\` in a browser for the chronological view. \`events.jsonl\` is the
authoritative record; everything else in this bundle is derived from it and from the
run's stored config snapshot.
`;
}

const KNOWN_ISSUES = `# Known limitations — AGORA WORKSHOP Phase 0

These are stated explicitly so that nobody reads more into a Phase 0 run than it supports.

## Scientific scope

- Phase 0 validates an **apparatus**. It does not establish anything about AI social
  behaviour. No claim about coalitions, persuasion, convergence, or emergence is
  supported by anything in this repository.
- The workshop topic was chosen to exercise the interaction system, not because the
  topic itself is scientifically informative.
- Repeated runs are **not** expected to produce identical text. Only the experimental
  conditions are reproducible; model output is stochastic by design.
- Moderator output is a model output like any other. It is not ground truth, and its
  summaries are not evidence of what participants meant.

## Instrument limitations

- **Sequential turn-taking.** Agents speak in a deterministic rotation. Real
  simultaneity, interruption, and self-selected turn-taking are not modelled.
- **Breakout groups are static.** Group membership comes from the config and does not
  change during a run.
- **Summarisation is opt-in and extractive.** The default keeps raw messages
  authoritative. Phase 0.1 can add channel-scoped rolling summaries with source ids,
  hashes and fidelity audits, but this is not a behavioural or semantic summariser.
- **Failed attempts consume call budget.** A repeatedly timing-out agent burns its call
  budget on attempts that produced nothing. This is deliberate (it bounds spend) but it
  means budget exhaustion and provider instability are correlated.
- **No mid-run configuration changes.** The config is frozen at run start, by design.
- **Single-process runtime.** Runs are executed in the web process. There is no queue,
  so a process restart mid-run stops the run in place. Startup reconciliation marks such
  a run \`INTERRUPTED\`, records unresolved turns provisionally as the infrastructure
  category \`interrupted\`, appends a \`run_interrupted\` event, and preserves every event,
  message and invocation already written. Recovery-enabled runs can resume the stored
  schedule; historical runs without recovery remain interrupted.
- **The scripted moderator is only validated in the deterministic mock package.** Its
  privacy and state-boundary checks are exercised there, but no live-provider comparison
  against an LLM moderator has been run.
- **Failure-evidence runs are found by searching.** When no run is named explicitly, the
  validation set picks the most recent run that recorded infrastructure failures, which
  may be under a different configuration than the run being validated. The package
  always names the run it used, so the choice is visible, but it is a search result
  rather than a stated pairing.

## Provider-specific notes

- Sampling parameters (\`temperature\`, \`top_p\`, \`top_k\`) are recorded but must be
  \`null\`: current Claude models reject them. The adapter refuses to start rather than
  silently dropping a recorded experimental parameter.
- Thinking output is requested with \`display: omitted\`. No reasoning content is
  captured or stored. Phase 0 deliberately does not depend on private reasoning traces.
- Server-side refusal fallbacks are **not** enabled, because the spec forbids silently
  falling back to another model. A policy refusal is therefore recorded as the
  infrastructure category \`provider_refusal\` and the turn is retried on the same model.
- SDK-level retries are disabled so that every attempt appears in the event log.

## Analytics limitations

- \`infrastructure_adjusted_participation\` is \`null\` when an agent had zero
  behaviourally available opportunities. Reporting \`0\` there would be a behavioural
  claim the data does not support.
- Token counts come from the provider's usage block. When a provider does not report
  usage, the corresponding totals are zero rather than estimated.

## What a Phase 0 validation package does and does not say

- A package with all three gates \`PASS\` says the apparatus executed, recorded, and
  reproduced a bounded workshop. It says nothing about what the agents did or meant.
- \`NOT_EXERCISED\` on gate 2 means no infrastructure failure occurred in any run supplied.
  It is missing evidence, not a pass, and it never counts towards validation.
- A fault-injection run completing successfully is the intended outcome. Its recorded
  failures are declared experimental conditions, not defects.
- An interrupted run is never accepted as gate 2 evidence. Being stopped by a restart
  shows the apparatus noticed it was stopped, not that a provider timeout is told apart
  from an agent choosing to stay silent.
- Code provenance is recorded, never invented. A commit sha, deployment id, app version
  or environment that is genuinely unavailable is stored as null and displayed as
  \`unavailable\`.
`;
