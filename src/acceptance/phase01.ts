import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { Db } from '../db/index.js';
import {
  getArtifacts,
  getBackupVerifications,
  getCheckpoints,
  getContextSummaries,
  getInvocations,
  getMessages,
  getOpportunities,
  getRun,
  getToolCalls,
  runConfig,
} from '../db/queries.js';
import { readEvents } from '../events/recorder.js';
import { auditSummaryFidelity } from '../orchestrator/summaries.js';
import type { StoredMessage } from '../orchestrator/visibility.js';
import { SCRIPTED_MODERATOR_VERSION } from '../providers/scriptedModerator.js';
import { REQUIRED_BUNDLE_FILES } from '../export/bundleContract.js';

export type Phase01Status = 'PASS' | 'FAIL' | 'NOT_EXERCISED';
export interface Phase01Metric { id: string; status: Phase01Status; evidence: string; }

export interface LiveCanaryLink {
  baselineRunId: string;
  rerunRunId: string;
  faultRunId: string;
  /** A separate run exercising the fixed moderator boundary, when supplied. */
  scriptedModeratorRunId?: string | null;
}

export interface CoreGateStatuses {
  infrastructure_validated: Phase01Status;
  failure_attribution_validated: Phase01Status;
  baseline_reproducible: Phase01Status;
}

export interface Phase01EvaluationOptions {
  /** Files promised by an in-progress export, used for the live-canary contract. */
  pendingArtifactNames?: string[];
  /** Linked runs that make a live canary a package rather than a single-run claim. */
  liveCanaryLink?: LiveCanaryLink | null;
  /** Supplied by the gate layer to prevent M30 from recursively evaluating itself. */
  coreGateStatuses?: CoreGateStatuses | null;
}

const TOOL_FAULTS = new Set(['tool_timeout', 'tool_unavailable', 'tool_invalid_response']);

export function evaluatePhase01(
  db: Db,
  runId: string,
  options: Phase01EvaluationOptions = {},
): Phase01Metric[] {
  const run = getRun(db, runId);
  const config = run ? safeRunConfig(run) : null;
  const invocations = getInvocations(db, runId);
  const opportunities = getOpportunities(db, runId);
  const summaries = getContextSummaries(db, runId);
  const tools = getToolCalls(db, runId);
  const checkpoints = getCheckpoints(db, runId);
  const backups = getBackupVerifications(db, runId);
  const events = readEvents(db, runId);
  const messages = getMessages(db, runId);

  return [
    evaluateContextMaterial(config, invocations, opportunities, summaries, messages),
    evaluateSummaryProvenance(config, summaries, messages),
    evaluateTraceCompleteness(
      db,
      runId,
      invocations,
      opportunities,
      summaries,
      tools,
      messages,
      options.pendingArtifactNames ?? [],
    ),
    evaluateToolAttribution(config, tools, events, invocations),
    evaluateRecoveryIdempotency(runId, checkpoints, opportunities, events),
    evaluateBackupRestore(run, backups),
    evaluateModeratorBoundary(config, run, invocations, messages, events),
    evaluateLiveCanary(
      db,
      run,
      config,
      options.pendingArtifactNames ?? [],
      options.liveCanaryLink ?? null,
      options.coreGateStatuses ?? null,
    ),
  ];
}

function evaluateContextMaterial(
  config: ReturnType<typeof safeRunConfig>,
  invocations: ReturnType<typeof getInvocations>,
  opportunities: ReturnType<typeof getOpportunities>,
  summaries: ReturnType<typeof getContextSummaries>,
  messages: StoredMessage[],
): Phase01Metric {
  if (invocations.length === 0) return { id: 'M23', status: 'NOT_EXERCISED', evidence: 'no provider invocation was recorded' };
  const opportunityById = new Map(opportunities.map((row) => [row.opportunity_id, row]));
  const messageIds = new Set(messages.map((message) => message.message_id));
  const problems: string[] = [];
  for (const invocation of invocations) {
    const opportunity = opportunityById.get(invocation.opportunity_id);
    if (!opportunity || !invocation.trace_id || opportunity.trace_id !== invocation.trace_id) {
      problems.push(`${invocation.invocation_id}: missing opportunity/trace join`);
      continue;
    }
    const ids = parseArray(invocation.context_message_ids);
    const publicIds = parseArray(invocation.context_public_ids);
    const privateIds = parseArray(invocation.context_private_ids);
    if (!ids || !publicIds || !privateIds) {
      problems.push(`${invocation.invocation_id}: context id fields are not valid arrays`);
      continue;
    }
    for (const id of ids) if (!messageIds.has(id)) problems.push(`${invocation.invocation_id}: unknown context message ${id}`);
    for (const summary of summaries.filter((row) => row.opportunity_id === invocation.opportunity_id)) {
      const sourceIds = parseArray(summary.source_message_ids);
      if (!sourceIds || !sourceIds.every((id) => ids.includes(id))) problems.push(`${invocation.invocation_id}: summary sources are absent from context_message_ids`);
      if (summary.trace_id !== invocation.trace_id) problems.push(`${summary.summary_id}: summary trace does not match invocation trace`);
    }
    if (invocation.provider === 'mock_context_contract') {
      const raw = safeJson<Record<string, unknown>>(invocation.raw_metadata);
      const receipt = raw?.context_contract as Record<string, unknown> | undefined;
      const receiptIds = receipt ? parseArrayValue(receipt.context_message_ids) : null;
      const receiptHashes = receipt ? parseArrayValue(receipt.summary_hashes) : null;
      const expectedSummaries = summaries.filter((row) => row.opportunity_id === invocation.opportunity_id);
      const expectedIds = expectedSummaries.map((summary) => summary.summary_id);
      const expectedHashes = expectedSummaries.map((summary) => summary.content_hash);
      if (!receipt || !receiptIds || !sameMembers(receiptIds, ids)) {
        problems.push(`${invocation.invocation_id}: context-contract receipt disagrees with stored ids`);
      }
      if (!receiptHashes || !sameMembers(receiptHashes, expectedHashes) || !sameMembers(receipt ? parseArrayValue(receipt.summary_ids) ?? [] : [], expectedIds)) {
        problems.push(`${invocation.invocation_id}: context-contract receipt disagrees with stored summary ids or hashes`);
      }
    }
  }
  return {
    id: 'M23',
    status: problems.length ? 'FAIL' : 'PASS',
    evidence: problems.length ? problems.slice(0, 3).join('; ') : `${invocations.length} invocations have complete context-contract joins`,
  };
}

function evaluateSummaryProvenance(
  config: ReturnType<typeof safeRunConfig>,
  summaries: ReturnType<typeof getContextSummaries>,
  messages: StoredMessage[],
): Phase01Metric {
  if (summaries.length === 0) return { id: 'M24', status: 'NOT_EXERCISED', evidence: 'no context summary was recorded' };
  if (!config) return { id: 'M24', status: 'FAIL', evidence: 'run configuration could not be parsed' };
  const messageById = new Map(messages.map((message) => [message.message_id, message]));
  const problems: string[] = [];
  for (const summary of summaries) {
    const sourceIds = parseArray(summary.source_message_ids);
    if (!sourceIds) {
      problems.push(`${summary.summary_id}: source_message_ids is not valid JSON`);
      continue;
    }
    if (!auditSummaryFidelity({ ...summary, source_message_ids: sourceIds })) problems.push(`${summary.summary_id}: fidelity hashes do not verify`);
    const sourceMessages = sourceIds.map((id) => messageById.get(id));
    if (sourceMessages.some((message) => !message)) {
      problems.push(`${summary.summary_id}: a source message is missing`);
      continue;
    }
    const resolved = sourceMessages as StoredMessage[];
    if (resolved.some((message) => !independentlyAuthorized(config, message, summary.agent_id))) problems.push(`${summary.summary_id}: source is outside independently derived recipient visibility`);
    if (summary.scope.split(':', 1)[0] === 'public' && resolved.some((message) => message.channel !== 'public')) problems.push(`${summary.summary_id}: private material entered a public summary`);
    if (sourceIds.some((id, index) => index > 0 && (messageById.get(id)?.sequence ?? 0) < (messageById.get(sourceIds[index - 1]!)?.sequence ?? 0))) problems.push(`${summary.summary_id}: source order is not chronological`);
  }
  return {
    id: 'M24',
    status: problems.length ? 'FAIL' : 'PASS',
    evidence: problems.length ? problems.slice(0, 3).join('; ') : `${summaries.length} summaries pass provenance, scope and extractive-integrity audits; semantic fidelity remains a human-review question`,
  };
}

function evaluateTraceCompleteness(
  db: Db,
  runId: string,
  invocations: ReturnType<typeof getInvocations>,
  opportunities: ReturnType<typeof getOpportunities>,
  summaries: ReturnType<typeof getContextSummaries>,
  tools: ReturnType<typeof getToolCalls>,
  messages: StoredMessage[],
  pendingArtifactNames: string[],
): Phase01Metric {
  if (opportunities.length === 0 && invocations.length === 0 && summaries.length === 0 && tools.length === 0) return { id: 'M25', status: 'NOT_EXERCISED', evidence: 'no trace-bearing records were recorded' };
  const opportunityById = new Map(opportunities.map((row) => [row.opportunity_id, row]));
  const problems: string[] = [];
  const messageById = new Map(messages.map((message) => [message.message_id, message]));
  const invocationsByOpportunity = new Map<string, number>();
  for (const invocation of invocations) {
    invocationsByOpportunity.set(
      invocation.opportunity_id,
      (invocationsByOpportunity.get(invocation.opportunity_id) ?? 0) + 1,
    );
  }
  for (const opportunity of opportunities) {
    const hasInvocation = (invocationsByOpportunity.get(opportunity.opportunity_id) ?? 0) > 0;
    if (!hasInvocation && opportunity.resolution !== 'infrastructure_failure') {
      problems.push(`${opportunity.opportunity_id}: resolved behavioural opportunity has no invocation`);
    }
    if (opportunity.message_id && !messageById.has(opportunity.message_id)) {
      problems.push(`${opportunity.opportunity_id}: output message is missing`);
    }
  }
  for (const opportunity of opportunities) if (!opportunity.trace_id) problems.push(`${opportunity.opportunity_id}: missing trace_id`);
  for (const invocation of invocations) {
    const opportunity = opportunityById.get(invocation.opportunity_id);
    if (!opportunity || !invocation.trace_id || invocation.trace_id !== opportunity.trace_id) problems.push(`${invocation.invocation_id}: orphan invocation trace`);
  }
  for (const summary of summaries) if (!summary.trace_id || !opportunityById.has(summary.opportunity_id)) problems.push(`${summary.summary_id}: orphan summary trace`);
  for (const tool of tools) if (!tool.trace_id || !opportunityById.has(tool.opportunity_id)) problems.push(`${tool.tool_call_id}: orphan tool trace`);
  const invocationIds = new Set(invocations.map((invocation) => invocation.invocation_id));
  for (const message of messages) if (!message.trace_id || (message.source_invocation_id && !invocationIds.has(message.source_invocation_id))) problems.push(`${message.message_id}: orphan message trace`);

  const deliveryEvents = readEvents(db, runId).filter(
    (event) => event.event_type === 'message_delivered' || event.event_type === 'private_message_delivered',
  );
  for (const delivery of deliveryEvents) {
    const messageId = delivery.payload['message_id'];
    const message = typeof messageId === 'string' ? messageById.get(messageId) : undefined;
    if (!delivery.trace_id) problems.push(`${delivery.event_id}: delivery is missing trace_id`);
    if (!message) {
      problems.push(`${delivery.event_id}: delivery references an unknown message`);
      continue;
    }
    if (message.trace_id !== delivery.trace_id) problems.push(`${delivery.event_id}: delivery trace does not match message trace`);
    if (!delivery.agent_id || !message.actual_recipients.includes(delivery.agent_id)) problems.push(`${delivery.event_id}: delivery recipient is not in message recipients`);
    if (delivery.payload['trace_id'] !== undefined && delivery.payload['trace_id'] !== delivery.trace_id) problems.push(`${delivery.event_id}: delivery payload trace does not match event trace`);
  }

  const retryEvents = readEvents(db, runId).filter(
    (event) => event.event_type === 'retry_scheduled' || event.event_type === 'retry_started' ||
      event.event_type === 'retry_exhausted' || event.event_type === 'tool_retry_scheduled',
  );
  for (const retry of retryEvents) {
    const opportunityId = retry.payload['opportunity_id'];
    const opportunity = typeof opportunityId === 'string' ? opportunityById.get(opportunityId) : undefined;
    if (!retry.trace_id || !opportunity || opportunity.trace_id !== retry.trace_id) problems.push(`${retry.event_id}: retry is not joined to its opportunity trace`);
  }

  const extractionRows = db.prepare(
    `SELECT extraction_id, status, source_trace_ids_json FROM semantic_extractions WHERE run_id = ?`,
  ).all(runId) as Array<{ extraction_id: string; status: string; source_trace_ids_json: string }>;
  for (const extraction of extractionRows) {
    const declaredSourceTraces = parseArray(extraction.source_trace_ids_json);
    const expectedSourceTraces = [...new Set(messages.map((message) => message.trace_id).filter((trace): trace is string => Boolean(trace)))];
    if (!declaredSourceTraces || !sameMembers(declaredSourceTraces, expectedSourceTraces)) {
      problems.push(`${extraction.extraction_id}: semantic extraction source trace manifest disagrees with considered messages`);
    }
    const evidenceRows = db.prepare(
      `SELECT message_id, invocation_id FROM semantic_evidence WHERE extraction_id = ?`,
    ).all(extraction.extraction_id) as Array<{ message_id: string; invocation_id: string | null }>;
    for (const evidence of evidenceRows) {
      const message = messageById.get(evidence.message_id);
      const invocation = evidence.invocation_id ? invocations.find((row) => row.invocation_id === evidence.invocation_id) : null;
      if (!message?.trace_id) problems.push(`${extraction.extraction_id}: semantic evidence references an untraceable message`);
      if (evidence.invocation_id && !invocation) problems.push(`${extraction.extraction_id}: semantic evidence references an unknown invocation`);
      if (invocation && message && invocation.trace_id !== message.trace_id) problems.push(`${extraction.extraction_id}: semantic evidence invocation/message traces disagree`);
    }
    if (extraction.status === 'completed' && evidenceRows.length === 0 && messages.length > 0) problems.push(`${extraction.extraction_id}: completed analysis has no message evidence`);
  }

  const manifestArtifact = getArtifacts(db, runId).find((artifact) => artifact.name === 'manifest.json');
  if (manifestArtifact && existsSync(manifestArtifact.path)) {
    const manifest = safeJson<{ trace_ids?: unknown }>(readFileSync(manifestArtifact.path, 'utf8'));
    const manifestTraceIds = Array.isArray(manifest?.trace_ids) && manifest.trace_ids.every((value) => typeof value === 'string')
      ? manifest.trace_ids as string[]
      : null;
    const requiredTraceIds = opportunities.map((opportunity) => opportunity.trace_id).filter((trace): trace is string => Boolean(trace));
    if (!manifestTraceIds || requiredTraceIds.some((trace) => !manifestTraceIds.includes(trace))) problems.push('manifest.json does not carry every opportunity trace_id');
  } else if (!pendingArtifactNames.includes('manifest.json') && opportunities.length > 0) {
    // An unexported run is still useful for direct unit-level checks; the bundle gate
    // separately enforces that an evidence package eventually contains a manifest.
  }
  return {
    id: 'M25',
    status: problems.length ? 'FAIL' : 'PASS',
    evidence: problems.length ? problems.slice(0, 3).join('; ') : `${opportunities.length} opportunities and all dependent records join to one trace`,
  };
}

function evaluateToolAttribution(
  config: ReturnType<typeof safeRunConfig>,
  tools: ReturnType<typeof getToolCalls>,
  events: ReturnType<typeof readEvents>,
  invocations: ReturnType<typeof getInvocations>,
): Phase01Metric {
  const configured = config?.fault_injection?.faults.filter((fault) => TOOL_FAULTS.has(fault.kind)) ?? [];
  const expectedAuthorizationDenials = config?.tool_probe?.probes.filter(
    (probe) => probe.expected_failure === 'permission_denied',
  ) ?? [];
  if (configured.length === 0 && expectedAuthorizationDenials.length === 0) {
    return { id: 'M26', status: 'NOT_EXERCISED', evidence: 'no tool fault or expected authorization denial was configured, so tool-fault attribution was not exercised' };
  }
  const problems: string[] = [];
  for (const tool of tools) if (!tool.trace_id || !tool.outcome) problems.push(`${tool.tool_call_id}: missing trace or outcome`);
  for (const tool of tools.filter((call) => call.outcome === 'success' && call.result_scope === 'private' && call.result_json)) {
    const result = tool.result_json ?? '';
    for (const invocation of invocations) {
      const rendered = safeJson<Array<{ content?: string }>>(invocation.rendered_messages);
      if (rendered?.some((message) => message.content?.includes(result))) {
        problems.push(`${tool.tool_call_id}: private tool result appeared in an invocation context`);
      }
    }
  }
  const observed = new Set(tools.filter((tool) => tool.outcome === 'infra_failure').map((tool) => tool.failure_category));
  const expected = new Set<string>([
    ...configured.map((item) => item.kind),
    ...expectedAuthorizationDenials.map(() => 'permission_denied'),
  ]);
  for (const fault of expected) if (!observed.has(fault)) problems.push(`${fault}: configured tool fault has no matching tool-call failure`);
  if (configured.some((fault) => fault.recover_after_attempts !== null && (fault.recover_after_attempts ?? 0) > 0) && !events.some((event) => event.event_type === 'tool_retry_scheduled')) problems.push('configured recoverable tool fault produced no tool retry event');
  return {
    id: 'M26',
    status: problems.length ? 'FAIL' : 'PASS',
    evidence: problems.length ? problems.slice(0, 3).join('; ') : `${tools.length} tool calls are attributed and scoped`,
  };
}

function evaluateRecoveryIdempotency(
  runId: string,
  checkpoints: ReturnType<typeof getCheckpoints>,
  opportunities: ReturnType<typeof getOpportunities>,
  events: ReturnType<typeof readEvents>,
): Phase01Metric {
  const resumed = events.some((event) => event.event_type === 'run_resumed');
  const reopened = events.filter((event) => event.event_type === 'recovery_opportunity_reopened');
  if (checkpoints.length === 0 || !resumed || reopened.length === 0) return { id: 'M27', status: 'NOT_EXERCISED', evidence: 'checkpoint records exist, but no completed resume of a previously opened opportunity was recorded' };
  const problems: string[] = [];
  if (opportunities.some((opportunity) => opportunity.resolution === null)) problems.push('resumed run contains unresolved opportunities');
  const deliveryKeys = events.filter((event) => event.event_type === 'message_delivered' || event.event_type === 'private_message_delivered').map((event) => `${event.payload['message_id']}::${event.agent_id}`);
  if (deliveryKeys.some((key, index) => deliveryKeys.indexOf(key) !== index)) problems.push('duplicate message delivery after resume');
  const transitionKeys = events.filter((event) => event.event_type === 'state_transition_completed').map((event) => `${event.payload['from_state']}->${event.payload['to_state']}`);
  if (transitionKeys.some((key, index) => transitionKeys.indexOf(key) !== index)) problems.push('duplicate state transition after resume');
  const outputMessageIds = opportunities
    .filter((opportunity) => opportunity.resolution === 'success' && opportunity.message_id !== null)
    .map((opportunity) => opportunity.message_id as string);
  if (outputMessageIds.some((messageId, index) => outputMessageIds.indexOf(messageId) !== index)) problems.push('duplicate final message assigned to more than one opportunity after resume');
  return { id: 'M27', status: problems.length ? 'FAIL' : 'PASS', evidence: problems.length ? problems.slice(0, 3).join('; ') : `resume evidence for ${runId} has no duplicate actions` };
}

function evaluateBackupRestore(
  run: ReturnType<typeof getRun>,
  backups: ReturnType<typeof getBackupVerifications>,
): Phase01Metric {
  if (backups.length === 0) return { id: 'M28', status: 'NOT_EXERCISED', evidence: 'no linked backup/restore verification record' };
  const problems = backups.flatMap((backup) => {
    const rowProblems: string[] = [];
    if (!run || backup.config_hash !== run.config_hash) rowProblems.push(`${backup.backup_verification_id}: config hash mismatch`);
    if (backup.event_count <= 0) rowProblems.push(`${backup.backup_verification_id}: restored event log is empty`);
    if (!existsSync(backup.backup_path)) rowProblems.push(`${backup.backup_verification_id}: backup file is not available`);
    if (!backup.restore_export_path || !existsSync(backup.restore_export_path)) rowProblems.push(`${backup.backup_verification_id}: restore-generated export is not available`);
    if (backup.restore_replay_available !== 1 || !existsSync(backup.restore_export_path ? `${backup.restore_export_path}/replay.html` : '')) rowProblems.push(`${backup.backup_verification_id}: replay is not available from the restored database`);
    if (backup.restore_event_sequence_contiguous !== 1) rowProblems.push(`${backup.backup_verification_id}: restored event sequence is not contiguous`);
    const tables = safeJson<string[]>(backup.restore_tables_json);
    const requiredTables = ['runs', 'events', 'state_transitions', 'opportunities', 'invocations', 'messages', 'context_summaries', 'tool_calls', 'run_checkpoints', 'artifacts'];
    if (!tables || requiredTables.some((table) => !tables.includes(table))) rowProblems.push(`${backup.backup_verification_id}: restored database is missing required tables`);
    const restoreHashes = safeJson<Record<string, string>>(backup.restore_artifact_hashes_json);
    if (!restoreHashes || Object.keys(restoreHashes).length === 0) {
      rowProblems.push(`${backup.backup_verification_id}: restored export has no recorded artifact hashes`);
    } else if (backup.restore_export_path) {
      for (const [name, expectedHash] of Object.entries(restoreHashes)) {
        const path = `${backup.restore_export_path}/${name}`;
        if (!existsSync(path)) rowProblems.push(`${backup.backup_verification_id}: restored export is missing ${name}`);
        else {
          const actualHash = createHash('sha256').update(readFileSync(path)).digest('hex');
          if (actualHash !== expectedHash) rowProblems.push(`${backup.backup_verification_id}: restored artifact hash mismatch for ${name}`);
        }
      }
    }
    return rowProblems;
  });
  return { id: 'M28', status: problems.length ? 'FAIL' : 'PASS', evidence: problems.length ? problems.slice(0, 3).join('; ') : `${backups.length} linked SQLite backup/restore verification record(s) are valid` };
}

function evaluateModeratorBoundary(
  config: ReturnType<typeof safeRunConfig>,
  run: ReturnType<typeof getRun>,
  invocations: ReturnType<typeof getInvocations>,
  messages: StoredMessage[],
  events: ReturnType<typeof readEvents>,
): Phase01Metric {
  if (!config || !run || config.moderator.mode !== 'scripted') return { id: 'M29', status: 'NOT_EXERCISED', evidence: 'scripted moderator condition was not configured' };
  const moderatorInvocations = invocations.filter((row) => row.agent_id === config.moderator.id);
  if (moderatorInvocations.length === 0) return { id: 'M29', status: 'NOT_EXERCISED', evidence: 'scripted moderator was configured but no moderator turn was recorded' };
  const problems: string[] = [];
  for (const invocation of moderatorInvocations) {
    if (invocation.provider !== 'scripted' || invocation.responded_model !== SCRIPTED_MODERATOR_VERSION) {
      problems.push(`${invocation.invocation_id}: scripted moderator turn was not produced by the fixed script provider`);
    }
    const raw = safeJson<Record<string, unknown>>(invocation.raw_metadata);
    if (raw?.scripted !== true || raw.script_version !== SCRIPTED_MODERATOR_VERSION) {
      problems.push(`${invocation.invocation_id}: scripted moderator receipt is missing or has the wrong version`);
    }
    const privateIds = parseArray(invocation.context_private_ids);
    if (!privateIds) problems.push(`${invocation.invocation_id}: private context field is invalid`);
    else if (privateIds.length > 0 && !config.channels.private.moderator_observes_private) problems.push(`${invocation.invocation_id}: scripted moderator received unauthorized private context`);
    if (invocation.output_message_id && !messages.some((message) => message.source_invocation_id === invocation.invocation_id)) {
      problems.push(`${invocation.invocation_id}: scripted moderator output was not registered as a message`);
    }
  }
  const externalStateChanges = events.filter(
    (event) => ['state_transition_started', 'state_transition_completed', 'state_transition_rejected'].includes(event.event_type) && event.agent_id !== null,
  );
  if (externalStateChanges.length > 0) problems.push('moderator agent emitted a state-transition event outside the runtime');
  return { id: 'M29', status: problems.length ? 'FAIL' : 'PASS', evidence: problems.length ? problems.join('; ') : 'scripted moderator boundary checks passed' };
}

function evaluateLiveCanary(
  db: Db,
  run: ReturnType<typeof getRun>,
  config: ReturnType<typeof safeRunConfig>,
  pendingArtifactNames: string[],
  link: LiveCanaryLink | null,
  coreGateStatuses: CoreGateStatuses | null,
): Phase01Metric {
  if (!run || !config || config.validation?.profile !== 'live_canary' || ['mock', 'mock_context_contract'].includes(run.provider)) return { id: 'M30', status: 'NOT_EXERCISED', evidence: 'live canary requires a declared non-mock provider profile' };
  if (!link) {
    return {
      id: 'M30',
      status: 'FAIL',
      evidence: 'live canary is declared but no linked baseline/rerun/fault evidence package was supplied',
    };
  }
  const linkedIds = [link.baselineRunId, link.rerunRunId, link.faultRunId];
  const baseline = getRun(db, link.baselineRunId);
  const rerun = getRun(db, link.rerunRunId);
  const fault = getRun(db, link.faultRunId);
  const scriptedModerator = link.scriptedModeratorRunId ? getRun(db, link.scriptedModeratorRunId) : null;
  const linkedRuns = [baseline, rerun, fault, scriptedModerator];
  const problems: string[] = [];
  if (link.baselineRunId !== run.run_id) problems.push('live-canary link baseline does not match the evaluated run');
  if (!link.scriptedModeratorRunId) problems.push('live-canary link must include a paired scripted moderator run');
  const allLinkedIds = [...linkedIds, ...(link.scriptedModeratorRunId ? [link.scriptedModeratorRunId] : [])];
  if (new Set(allLinkedIds).size !== allLinkedIds.length) problems.push('baseline, rerun, fault and scripted moderator run ids must be distinct');
  if ([baseline, rerun, fault].some((candidate) => !candidate)) problems.push('one or more baseline/rerun/fault live-canary runs do not exist');
  if (link.scriptedModeratorRunId && !scriptedModerator) problems.push('paired scripted moderator run does not exist');
  if (config.moderator.mode !== 'llm') problems.push('live baseline must explicitly use the LLM moderator condition');

  const availableRuns = linkedRuns.filter((candidate): candidate is NonNullable<typeof run> => candidate !== null);
  for (const candidate of availableRuns) {
    if (candidate.status !== 'COMPLETED') problems.push(`${candidate.run_id}: linked run is ${candidate.status}, expected COMPLETED`);
    if (candidate.provider !== run.provider) problems.push(`${candidate.run_id}: provider ${candidate.provider} differs from ${run.provider}`);
    if (candidate.model !== run.model) problems.push(`${candidate.run_id}: model ${candidate.model} differs from ${run.model}`);
    const artifacts = new Set(getArtifacts(db, candidate.run_id).map((artifact) => artifact.name));
    if (candidate.run_id === run.run_id) pendingArtifactNames.forEach((name) => artifacts.add(name));
    const missing = REQUIRED_BUNDLE_FILES.filter((name) => !artifacts.has(name));
    if (missing.length > 0) problems.push(`${candidate.run_id}: linked export is missing ${missing.join(', ')}`);
  }

  if (baseline && rerun && baseline.config_hash !== rerun.config_hash) {
    problems.push(`baseline/rerun config hash mismatch (${baseline.config_hash} != ${rerun.config_hash})`);
  }
  if (baseline && fault && baseline.config_hash === fault.config_hash) {
    problems.push('fault run must have a distinct fault-enabled config hash');
  }
  if (fault) {
    const faultConfig = safeRunConfig(fault);
    const faultEvents = readEvents(db, fault.run_id);
    const hasFailure = faultEvents.some((event) =>
      ['timeout', 'rate_limit', 'provider_error', 'provider_refusal', 'network_error', 'malformed_response', 'permission_denied', 'tool_call_failed'].includes(event.event_type),
    );
    if (!faultConfig?.fault_injection?.enabled || faultConfig.fault_injection.faults.length === 0) {
      problems.push('fault run does not declare enabled fault injection');
    }
    if (!hasFailure) problems.push('fault run contains no recorded infrastructure failure event');
  }
  if (scriptedModerator) {
    const scriptedConfig = safeRunConfig(scriptedModerator);
    if (scriptedConfig?.moderator.mode !== 'scripted') problems.push('paired moderator run is not explicitly configured as scripted');
    const scriptedBoundary = evaluateModeratorBoundary(
      scriptedConfig,
      scriptedModerator,
      getInvocations(db, scriptedModerator.run_id),
      getMessages(db, scriptedModerator.run_id),
      readEvents(db, scriptedModerator.run_id),
    );
    if (scriptedBoundary.status !== 'PASS') problems.push(`paired scripted moderator boundary is ${scriptedBoundary.status}`);
  }
  if (!coreGateStatuses) {
    problems.push('core gate statuses were not supplied by the package evaluator');
  } else {
    for (const [name, status] of Object.entries(coreGateStatuses)) {
      if (status !== 'PASS') problems.push(`core gate ${name} is ${status}, expected PASS`);
    }
  }
  return {
    id: 'M30',
    status: problems.length ? 'FAIL' : 'PASS',
    evidence: problems.length
      ? problems.slice(0, 5).join('; ')
      : `linked live canary complete: baseline=${link.baselineRunId}, rerun=${link.rerunRunId}, fault=${link.faultRunId}, scripted_moderator=${link.scriptedModeratorRunId}, provider=${run.provider}, model=${run.model}`,
  };
}

function safeRunConfig(run: NonNullable<ReturnType<typeof getRun>>) {
  try { return runConfig(run); } catch { return null; }
}

function safeJson<T>(value: string): T | null {
  try { return JSON.parse(value) as T; } catch { return null; }
}

function parseArray(value: string): string[] | null {
  const parsed = safeJson<unknown>(value);
  return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : null;
}

function parseArrayValue(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
}

function sameMembers(left: string[], right: string[]): boolean {
  return left.length === right.length && new Set(left).size === new Set(right).size && left.every((item) => right.includes(item));
}

/**
 * Independent re-derivation used by M24. This deliberately does not call the runtime
 * visibility helper or read a router-produced recipient set as its verdict source.
 */
function independentlyAuthorized(
  config: ReturnType<typeof safeRunConfig>,
  message: StoredMessage,
  agentId: string,
): boolean {
  if (!config) return false;
  if (message.channel === 'public') return true;
  if (message.sender_agent_id === agentId) return true;
  const group = config.channels.private.breakout_groups.find(
    (candidate) => candidate.id === message.breakout_group_id,
  );
  if (group?.members.includes(agentId)) return true;
  return agentId === config.moderator.id && config.channels.private.moderator_observes_private;
}
