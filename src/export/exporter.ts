import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stringify as toYaml } from 'yaml';
import type { Db } from '../db/index.js';
import {
  getInvocations,
  getContextSummaries,
  getToolCalls,
  getCheckpoints,
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
import { runProvenance } from '../db/queries.js';
import { REQUIRED_BUNDLE_ITEMS } from './bundleContract.js';


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
  const summaries = getContextSummaries(db, runId);
  const toolCalls = getToolCalls(db, runId);
  const checkpoints = getCheckpoints(db, runId);
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
      code_provenance: runProvenance(run),
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
  write('summaries.jsonl', 'provenance', `${summaries.map((row) => JSON.stringify({ ...row, source_message_ids: JSON.parse(row.source_message_ids) })).join('\n')}\n`);
  write('tool_calls.jsonl', 'provenance', `${toolCalls.map((row) => JSON.stringify({ ...row, input: JSON.parse(row.input_json), result: row.result_json ? JSON.parse(row.result_json) : null })).join('\n')}\n`);
  write('checkpoints.jsonl', 'provenance', `${checkpoints.map((row) => JSON.stringify({ ...row, state: JSON.parse(row.state_json) })).join('\n')}\n`);
  const traceIndex = opportunities.map((opportunity) => ({
    trace_id: opportunity.trace_id,
    opportunity_id: opportunity.opportunity_id,
    invocation_ids: invocations.filter((row) => row.opportunity_id === opportunity.opportunity_id).map((row) => row.invocation_id),
    message_id: opportunity.message_id,
    tool_call_ids: toolCalls.filter((row) => row.opportunity_id === opportunity.opportunity_id).map((row) => row.tool_call_id),
  }));
  write('trace_index.jsonl', 'provenance', `${traceIndex.map((row) => JSON.stringify(row)).join('\n')}\n`);

  write(
    'opportunities.jsonl',
    'provenance',
    `${opportunities.map((o) => JSON.stringify(o)).join('\n')}\n`,
  );

  write(
    'agents.json',
    'metadata',
    json({
      moderator: {
        ...config.moderator,
        // Recorded explicitly rather than inferred: absent `mode` means the historical
        // model-backed moderator, and that is a fact about the run, not a default.
        mode: config.moderator.mode ?? 'llm',
        role: 'moderator',
      },
      participants: config.participants.map((p) => ({ ...p, role: 'participant' })),
      breakout_groups: config.channels.private.breakout_groups,
      capabilities: config.capabilities,
      budgets: config.budgets,
    }),
  );

  // Every message in one file, each carrying who it was addressed to and who actually
  // received it, so visibility can be re-derived without reading two files.
  write(
    'messages.jsonl',
    'transcript',
    `${messages
      .map((m) =>
        JSON.stringify({
          ...m,
          sender_display_name: displayName(config, m.sender_agent_id),
          visibility: {
            channel: m.channel,
            breakout_group_id: m.breakout_group_id,
            intended_recipients: m.intended_recipients,
            actual_recipients: m.actual_recipients,
          },
        }),
      )
      .join('\n')}\n`,
  );

  // Failures and retries pulled out of the invocation log so attribution can be read
  // directly. Each row is one attempt, with the outcome of the opportunity it belonged to.
  const opportunityById = new Map(opportunities.map((o) => [o.opportunity_id, o]));
  write(
    'failures.jsonl',
    'provenance',
    `${invocations
      .filter((i) => i.outcome === 'infra_failure' || i.attempt > 1)
      .map((i) =>
        JSON.stringify({
          invocation_id: i.invocation_id,
          opportunity_id: i.opportunity_id,
          agent_id: i.agent_id,
          workshop_state: i.workshop_state,
          attempt: i.attempt,
          outcome: i.outcome,
          failure_category: i.failure_category,
          error_message: i.error_message,
          latency_ms: i.latency_ms,
          opportunity_resolution: opportunityById.get(i.opportunity_id)?.resolution ?? null,
          opportunity_attempts: opportunityById.get(i.opportunity_id)?.attempts ?? null,
          behaviourally_available:
            opportunityById.get(i.opportunity_id)?.behaviourally_available === 1,
        }),
      )
      .join('\n')}\n`,
  );

  write('analytics.json', 'analytics', json(analytics));

  const acceptance = finalizeReport(
    evaluateGates({
      db,
      runId,
      failureEvidenceRunId: options.failureEvidenceRunId ?? null,
      reproducibilityRunId: options.reproducibilityRunId ?? null,
      // Written after this report: they exist by the time the bundle is returned.
      pendingArtifactNames: ['acceptance_report.json', 'replay.html', 'README.md', 'manifest.json'],
    }),
  );
  write('acceptance_report.json', 'acceptance', json(acceptance));

  write(
    'replay.html',
    'replay',
    renderReplayHtml({ run, config, events, messages, invocations, analytics, acceptance }),
  );

  write('README.md', 'readme', bundleReadme(runId, run.config_hash, files));

  // Written last so it can list every other file's hash. Its own hash is therefore not
  // in the list, which is stated in the file rather than left for a reader to discover.
  const provenance = runProvenance(run);
  const written = new Set(files.map((f) => f.name));
  write(
    'manifest.json',
    'manifest',
    json({
      bundle: 'agora_phase0_validation_bundle',
      bundle_version: '1',
      run_id: run.run_id,
      experiment_id: run.experiment_id,
      config_hash: run.config_hash,
      code_provenance: provenance,
      exported_at: nowIso(),
      contents: REQUIRED_BUNDLE_ITEMS.map((entry) => ({
        item: entry.item,
        files: entry.files,
        present: entry.files.every((name) => written.has(name) || name === 'manifest.json'),
      })),
      files: files.map((f) => ({ name: f.name, bytes: f.bytes, sha256: f.sha256 })),
      note:
        'manifest.json is written after every other file, so its own hash does not appear ' +
        'in the file list above.',
    }),
  );

  return { runId, directory, files, acceptance };
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function bundleReadme(
  runId: string,
  configHash: string,
  files: ExportResult['files'],
): string {
  return [
    `# AGORA WORKSHOP Phase 0 validation bundle for ${runId}`,
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
    `| \`acceptance_report.json\` | PASS / FAIL / NOT_EXERCISED for the three Phase 0 gates, with evidence. |`,
    `| \`agents.json\` | Participant and moderator definitions, including moderator mode. |`,
    `| \`messages.jsonl\` | Every message with its visibility metadata (intended and actual recipients). |`,
    `| \`failures.jsonl\` | Every failed or retried attempt, with its classification. |`,
    `| \`manifest.json\` | File inventory with hashes, code provenance, and required-item coverage. |`,
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
