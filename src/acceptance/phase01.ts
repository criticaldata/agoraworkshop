import { existsSync } from 'node:fs';
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
import { isVisibleTo, type StoredMessage } from '../orchestrator/visibility.js';
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
    evaluateTraceCompleteness(db, runId, invocations, opportunities, summaries, tools),
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
    if (resolved.some((message) => !isVisibleTo(config, message, summary.agent_id))) problems.push(`${summary.summary_id}: source is outside recipient visibility`);
    if (summary.scope.split(':', 1)[0] === 'public' && resolved.some((message) => message.channel !== 'public')) problems.push(`${summary.summary_id}: private material entered a public summary`);
    if (sourceIds.some((id, index) => index > 0 && (messageById.get(id)?.sequence ?? 0) < (messageById.get(sourceIds[index - 1]!)?.sequence ?? 0))) problems.push(`${summary.summary_id}: source order is not chronological`);
  }
  return {
    id: 'M24',
    status: problems.length ? 'FAIL' : 'PASS',
    evidence: problems.length ? problems.slice(0, 3).join('; ') : `${summaries.length} summaries pass provenance, scope and fidelity audits`,
  };
}

function evaluateTraceCompleteness(
  db: Db,
  runId: string,
  invocations: ReturnType<typeof getInvocations>,
  opportunities: ReturnType<typeof getOpportunities>,
  summaries: ReturnType<typeof getContextSummaries>,
  tools: ReturnType<typeof getToolCalls>,
): Phase01Metric {
  if (opportunities.length === 0 && invocations.length === 0 && summaries.length === 0 && tools.length === 0) return { id: 'M25', status: 'NOT_EXERCISED', evidence: 'no trace-bearing records were recorded' };
  const opportunityById = new Map(opportunities.map((row) => [row.opportunity_id, row]));
  const problems: string[] = [];
  const messages = db.prepare(
    `SELECT message_id, trace_id, source_invocation_id FROM messages WHERE run_id = ?`,
  ).all(runId) as Array<{ message_id: string; trace_id: string | null; source_invocation_id: string | null }>;
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
  if (configured.length === 0) return { id: 'M26', status: 'NOT_EXERCISED', evidence: 'no tool fault was configured, so tool-fault attribution was not exercised' };
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
  for (const fault of new Set(configured.map((item) => item.kind))) if (!observed.has(fault)) problems.push(`${fault}: configured tool fault has no matching tool-call failure`);
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
  const linkedRuns = [baseline, rerun, fault];
  const problems: string[] = [];
  if (link.baselineRunId !== run.run_id) problems.push('live-canary link baseline does not match the evaluated run');
  if (new Set(linkedIds).size !== linkedIds.length) problems.push('baseline, rerun and fault run ids must be distinct');
  if (linkedRuns.some((candidate) => !candidate)) problems.push('one or more linked live-canary runs do not exist');

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
      : `linked live canary complete: baseline=${link.baselineRunId}, rerun=${link.rerunRunId}, fault=${link.faultRunId}, provider=${run.provider}, model=${run.model}`,
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
