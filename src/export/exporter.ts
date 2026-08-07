import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stringify as toYaml } from 'yaml';
import type { Db } from '../db/index.js';
import {
  getInvocations,
  getMessages,
  getOpportunities,
  getRun,
  getTransitions,
  recordArtifact,
  runConfig,
} from '../db/queries.js';
import { readEvents } from '../events/recorder.js';
import { computeAnalytics } from '../analytics/summary.js';
import { auditPrivacyLeaks, evaluateGates, finalizeReport, type AcceptanceReport } from '../acceptance/gates.js';
import { renderReplayHtml } from './replayHtml.js';
import { displayName } from '../config/schema.js';
import { nowIso } from '../core/ids.js';

export interface ExportOptions {
  db: Db;
  runId: string;
  outDir?: string;
  failureEvidenceRunId?: string | null;
  reproducibilityRunId?: string | null;
}

export interface ExportResult {
  runId: string;
  directory: string;
  files: Array<{ name: string; bytes: number; sha256: string }>;
  acceptance: AcceptanceReport;
}

export function exportRootDir(): string {
  return resolve(process.env.AGORA_EXPORT_DIR ?? './exports');
}

/**
 * Writes the full artifact bundle for a run. Everything a reader needs to reconstruct
 * the experiment is in this directory: the frozen config, its hash, the raw event log,
 * both transcripts, per-invocation context provenance, analytics, and the gate report.
 */
export function exportRun(options: ExportOptions): ExportResult {
  const { db, runId } = options;
  const run = getRun(db, runId);
  if (!run) throw new Error(`unknown run: ${runId}`);
  const config = runConfig(run);

  const directory = options.outDir ?? join(exportRootDir(), runId);
  mkdirSync(directory, { recursive: true });

  const events = readEvents(db, runId);
  const messages = getMessages(db, runId);
  const invocations = getInvocations(db, runId);
  const opportunities = getOpportunities(db, runId);
  const transitions = getTransitions(db, runId);
  const analytics = computeAnalytics(db, runId);
  const leaks = auditPrivacyLeaks(db, runId);

  const files: ExportResult['files'] = [];
  const write = (name: string, kind: string, content: string) => {
    const path = join(directory, name);
    writeFileSync(path, content, 'utf8');
    const bytes = Buffer.byteLength(content, 'utf8');
    const sha256 = createHash('sha256').update(content, 'utf8').digest('hex');
    recordArtifact(db, runId, name, kind, path, sha256, bytes, nowIso());
    files.push({ name, bytes, sha256 });
  };

  write('canonical_config.yaml', 'config', toYaml(config));
  write('canonical_config.json', 'config', `${run.config_canonical}\n`);

  write(
    'run_metadata.json',
    'metadata',
    json({
      run_id: run.run_id,
      experiment_id: run.experiment_id,
      config_hash: run.config_hash,
      config_source_path: run.config_source_path,
      source_run_id: run.source_run_id,
      status: run.status,
      termination_reason: run.termination_reason,
      failure_reason: run.failure_reason,
      provider: run.provider,
      requested_model: run.model,
      responded_models: analytics.responded_models,
      code_commit_sha: run.code_commit_sha,
      created_at: run.created_at,
      started_at: run.started_at,
      ended_at: run.ended_at,
      duration_ms: run.duration_ms,
      generation_parameters: config.model,
      prompt_versions: config.prompts,
      context_policy: config.context_policy,
      retry_policy: config.runtime,
      budgets: config.budgets,
      capability_manifest: config.capabilities,
      scheduling: config.scheduling,
      fault_injection: config.fault_injection,
      state_transitions: transitions.map((t) => ({
        from: t.from_state,
        to: t.to_state,
        status: t.status,
        reason: t.reason,
        started_at: t.started_at,
        completed_at: t.completed_at,
      })),
      privacy_leak_audit: {
        invocations_checked: leaks.invocationsChecked,
        context_references_checked: leaks.contextReferencesChecked,
        violations: leaks.violations,
      },
      exported_at: nowIso(),
    }),
  );

  write('events.jsonl', 'events', `${events.map((e) => JSON.stringify(e)).join('\n')}\n`);

  write(
    'transcript_public.txt',
    'transcript',
    messages
      .filter((m) => m.channel === 'public')
      .map(
        (m) =>
          `[#${m.sequence}] ${m.created_at} ${m.workshop_state} ${displayName(config, m.sender_agent_id)} (${m.sender_agent_id}):\n${m.content}\n`,
      )
      .join('\n'),
  );

  write(
    'messages_private.jsonl',
    'transcript',
    `${messages
      .filter((m) => m.channel === 'private')
      .map((m) => JSON.stringify(m))
      .join('\n')}\n`,
  );

  write(
    'invocations.jsonl',
    'provenance',
    `${invocations
      .map((i) =>
        JSON.stringify({
          ...i,
          generation_params: JSON.parse(i.generation_params),
          rendered_messages: JSON.parse(i.rendered_messages),
          context_message_ids: JSON.parse(i.context_message_ids),
          context_public_ids: JSON.parse(i.context_public_ids),
          context_private_ids: JSON.parse(i.context_private_ids),
          capability_manifest: JSON.parse(i.capability_manifest),
          raw_metadata: JSON.parse(i.raw_metadata),
        }),
      )
      .join('\n')}\n`,
  );

  write(
    'opportunities.jsonl',
    'provenance',
    `${opportunities.map((o) => JSON.stringify(o)).join('\n')}\n`,
  );

  write('analytics.json', 'analytics', json(analytics));

  const acceptance = finalizeReport(
    evaluateGates({
      db,
      runId,
      failureEvidenceRunId: options.failureEvidenceRunId ?? null,
      reproducibilityRunId: options.reproducibilityRunId ?? null,
    }),
  );
  write('acceptance_report.json', 'acceptance', json(acceptance));

  write(
    'replay.html',
    'replay',
    renderReplayHtml({ run, config, events, messages, invocations, analytics, acceptance }),
  );

  write('README.md', 'readme', bundleReadme(runId, run.config_hash, files));

  return { runId, directory, files, acceptance };
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function bundleReadme(
  runId: string,
  configHash: string,
  files: ExportResult['files'],
): string {
  return [
    `# AGORA Phase 0 — validation bundle for ${runId}`,
    ``,
    `Config hash: \`${configHash}\``,
    ``,
    `| File | Purpose |`,
    `| --- | --- |`,
    `| \`canonical_config.yaml\` | The frozen experiment configuration, human readable. |`,
    `| \`canonical_config.json\` | The exact canonical bytes the config hash was computed over. |`,
    `| \`run_metadata.json\` | Run identity, model/prompt/policy provenance, state transitions, leak audit. |`,
    `| \`events.jsonl\` | The complete structured event log, in sequence order. |`,
    `| \`transcript_public.txt\` | Public channel transcript. |`,
    `| \`messages_private.jsonl\` | Breakout messages, kept separate from the public transcript. |`,
    `| \`invocations.jsonl\` | Per-invocation context provenance: exact system prompt, rendered context, included message ids. |`,
    `| \`opportunities.jsonl\` | Every response opportunity and how it resolved. |`,
    `| \`analytics.json\` | Operational metrics, including infrastructure-adjusted participation. |`,
    `| \`acceptance_report.json\` | PASS/FAIL for the three Phase 0 gates, with evidence. |`,
    `| \`replay.html\` | Self-contained chronological replay of the run. |`,
    ``,
    `## Integrity`,
    ``,
    `| File | Bytes | SHA-256 |`,
    `| --- | ---: | --- |`,
    ...files.map((f) => `| \`${f.name}\` | ${f.bytes} | \`${f.sha256}\` |`),
    ``,
    `_Note: this table is written before \`README.md\` itself is hashed, so it lists every`,
    `artifact except this file._`,
    ``,
  ].join('\n');
}
