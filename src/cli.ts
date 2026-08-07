#!/usr/bin/env node
import { getDatabase } from './db/index.js';
import { freezeConfig, loadConfigFile } from './config/load.js';
import { executeRun } from './orchestrator/runner.js';
import { computeAnalytics } from './analytics/summary.js';
import { evaluateGates, finalizeReport } from './acceptance/gates.js';
import { exportRun } from './export/exporter.js';
import { getMessages, getRun, listRuns, runConfig } from './db/queries.js';
import { readEvents } from './events/recorder.js';
import { displayName } from './config/schema.js';
import { codeProvenance } from './core/provenance.js';
import { runValidationPackage } from './scripts/validate.js';

const USAGE = `agora — AGORA Phase 0 research instrument

Usage:
  agora run --config <path>                      Launch a workshop from a frozen config
  agora rerun <run_id>                           Re-launch the same frozen config as a new run
  agora replay <run_id>                          Print the chronological event timeline
  agora export <run_id> [options]                Write the full artifact bundle to disk
  agora accept <run_id> [options]                Evaluate the three Phase 0 gates
  agora analytics <run_id>                       Print the analytics summary as JSON
  agora hash --config <path>                     Print the config hash without running
  agora list                                     List recorded runs
  agora validate [--config <path>]               Run the full Phase 0 validation package
                 [--fault-config <path>]         (defaults to the mock configs: no spend)
  agora serve                                    Start the web UI (same as npm start)

Options:
  --fault-run <run_id>   Run supplying gate 2 (failure attribution) evidence
  --rerun <run_id>       Run supplying gate 3 (reproducibility) evidence
  --out <dir>            Export directory override
`;

interface Args {
  command: string | undefined;
  positional: string[];
  flags: Record<string, string>;
}

function parseArgs(argv: string[]): Args {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]!;
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = 'true';
      }
    } else {
      positional.push(token);
    }
  }
  return { command, positional, flags };
}

async function main(): Promise<number> {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  const db = getDatabase();

  switch (command) {
    case 'run': {
      const path = flags['config'];
      if (!path) {
        console.error('run requires --config <path>');
        return 2;
      }
      const frozen = loadConfigFile(path);
      console.error(`config hash: ${frozen.hash}`);
      const result = await executeRun({ db, frozen, provenance: codeProvenance() });
      console.log(JSON.stringify(result, null, 2));
      return result.status === 'COMPLETED' ? 0 : 1;
    }

    case 'rerun': {
      const sourceRunId = positional[0];
      if (!sourceRunId) {
        console.error('rerun requires a run id');
        return 2;
      }
      const source = getRun(db, sourceRunId);
      if (!source) {
        console.error(`unknown run: ${sourceRunId}`);
        return 2;
      }
      // Rehydrating from the stored snapshot, not from disk: a rerun reproduces the
      // conditions the source run actually used, even if the file has since changed.
      const frozen = freezeConfig(JSON.parse(source.config_json), source.config_source_path);
      if (frozen.hash !== source.config_hash) {
        console.error(
          `refusing to rerun: rehydrated config hash ${frozen.hash} != recorded ${source.config_hash}`,
        );
        return 1;
      }
      const result = await executeRun({
        db,
        frozen,
        sourceRunId,
        provenance: codeProvenance(),
      });
      console.log(JSON.stringify({ ...result, sourceRunId }, null, 2));
      return result.status === 'COMPLETED' ? 0 : 1;
    }

    case 'replay': {
      const runId = positional[0];
      if (!runId) {
        console.error('replay requires a run id');
        return 2;
      }
      const run = getRun(db, runId);
      if (!run) {
        console.error(`unknown run: ${runId}`);
        return 2;
      }
      const config = runConfig(run);
      const messages = new Map(getMessages(db, runId).map((m) => [m.message_id, m]));
      console.log(`RUN ${runId}  config ${run.config_hash}  model ${run.model}`);
      for (const event of readEvents(db, runId)) {
        if (event.event_type === 'message_delivered' || event.event_type === 'private_message_delivered') {
          continue;
        }
        const t = clock(event.elapsed_ms);
        const who = event.agent_id ? displayName(config, event.agent_id) : '';
        let detail = '';
        const messageId = event.payload['message_id'];
        if (typeof messageId === 'string' && messages.has(messageId)) {
          const message = messages.get(messageId)!;
          const to =
            message.channel === 'private' ? ` -> ${message.actual_recipients.join(', ')}` : '';
          detail = ` ${message.channel.toUpperCase()}${to}: ${truncate(message.content, 140)}`;
        } else if (event.payload['error']) {
          detail = ` ${String(event.payload['error'])}`;
        } else if (event.event_type.startsWith('state_transition')) {
          detail = ` ${String(event.payload['from_state'])} -> ${String(event.payload['to_state'])}`;
        }
        console.log(`${t} #${String(event.sequence).padStart(4)} ${event.event_type.padEnd(30)} ${who.padEnd(12)}${detail}`);
      }
      return 0;
    }

    case 'export': {
      const runId = positional[0];
      if (!runId) {
        console.error('export requires a run id');
        return 2;
      }
      const result = exportRun({
        db,
        runId,
        outDir: flags['out'],
        failureEvidenceRunId: flags['fault-run'] ?? null,
        reproducibilityRunId: flags['rerun'] ?? null,
      });
      console.log(
        JSON.stringify(
          {
            runId: result.runId,
            directory: result.directory,
            files: result.files.map((f) => f.name),
            ready_for_controlled_behavioral_experiment:
              result.acceptance.ready_for_controlled_behavioral_experiment,
          },
          null,
          2,
        ),
      );
      return 0;
    }

    case 'accept': {
      const runId = positional[0];
      if (!runId) {
        console.error('accept requires a run id');
        return 2;
      }
      const report = finalizeReport(
        evaluateGates({
          db,
          runId,
          failureEvidenceRunId: flags['fault-run'] ?? null,
          reproducibilityRunId: flags['rerun'] ?? null,
        }),
      );
      console.log(JSON.stringify(report, null, 2));
      return report.ready_for_controlled_behavioral_experiment ? 0 : 1;
    }

    case 'analytics': {
      const runId = positional[0];
      if (!runId) {
        console.error('analytics requires a run id');
        return 2;
      }
      console.log(JSON.stringify(computeAnalytics(db, runId), null, 2));
      return 0;
    }

    case 'hash': {
      const path = flags['config'];
      if (!path) {
        console.error('hash requires --config <path>');
        return 2;
      }
      const frozen = loadConfigFile(path);
      console.log(frozen.hash);
      return 0;
    }

    case 'list': {
      for (const run of listRuns(db)) {
        console.log(
          [
            run.run_id,
            run.status.padEnd(9),
            (run.termination_reason ?? '').padEnd(16),
            run.experiment_id.padEnd(28),
            run.config_hash,
            run.created_at,
          ].join('  '),
        );
      }
      return 0;
    }

    case 'validate': {
      const result = await runValidationPackage({
        db,
        configPath: flags['config'] ?? 'configs/agora_phase0_mock_baseline.yaml',
        faultConfigPath: flags['fault-config'] ?? 'configs/agora_phase0_faultdemo_mock.yaml',
        outDir: flags['out'] ?? null,
      });
      console.log(JSON.stringify(result, null, 2));
      return result.ready ? 0 : 1;
    }

    case 'serve': {
      await import('./server/index.js');
      return 0;
    }

    default:
      console.log(USAGE);
      return command === undefined || command === 'help' ? 0 : 2;
  }
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

main()
  .then((code) => {
    if (code !== 0) process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
