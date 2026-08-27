import type { Db } from '../db/index.js';
import type { FrozenConfig } from '../config/load.js';
import type { ExperimentConfig, FaultKind, WorkshopState } from '../config/schema.js';
import { EventRecorder, readEvents } from '../events/recorder.js';
import {
  FAILURE_EVENT_TYPE,
  type AgoraEvent,
  type InfrastructureFailure,
  type OpportunityResolution,
} from '../events/types.js';
import { newCheckpointId, newInvocationId, newMessageId, newOpportunityId, newRunId, newToolCallId, newTraceId, nowIso } from '../core/ids.js';
import { codeProvenance, type CodeProvenance } from '../core/provenance.js';
import { ABSTAIN_TOKEN, PASS_TOKEN } from '../prompts/registry.js';
import { assembleContext } from './context.js';
import { BudgetLedger } from './budgets.js';
import {
  breakoutRecipients,
  publicRecipients,
  type StoredMessage,
} from './visibility.js';
import {
  canTransition,
  InvalidTransitionError,
  plannedStates,
  TERMINAL_STATES,
} from './stateMachine.js';
import { buildProvider } from '../providers/registry.js';
import type { AgentProvider } from '../providers/types.js';
import type { FaultInjectingProvider } from '../providers/faultInjection.js';
import { ScriptedModeratorProvider } from '../providers/scriptedModerator.js';
import { ToolGateway } from '../tools/gateway.js';
import { getMessages, getOpportunities, getRun, getTransitions, type OpportunityRow } from '../db/queries.js';

export type TerminationReason =
  | 'completed'
  | 'deadline_reached'
  | 'cancelled'
  | 'failed';

export interface RunResult {
  runId: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  terminationReason: TerminationReason;
  configHash: string;
  durationMs: number;
  messageCount: number;
  eventCount: number;
}

export interface ExecuteRunOptions {
  db: Db;
  frozen: FrozenConfig;
  runId?: string;
  resumeRunId?: string;
  sourceRunId?: string | null;
  /** Which code produced this run. Defaults to reading the environment. */
  provenance?: CodeProvenance;
  provider?: AgentProvider;
  faults?: FaultInjectingProvider | null;
  onEvent?: (event: AgoraEvent) => void;
}

interface TurnSpec {
  agentId: string;
  state: WorkshopState;
  channel: 'public' | 'private';
  roundIndex: number;
  totalRounds: number;
  breakoutGroupId?: string;
  breakoutMembers?: string[];
}

export async function executeRun(options: ExecuteRunOptions): Promise<RunResult> {
  const runner = new WorkshopRunner(options);
  return runner.execute();
}

export class WorkshopRunner {
  private readonly db: Db;
  private readonly config: ExperimentConfig;
  private readonly frozen: FrozenConfig;
  private readonly runId: string;
  private readonly recorder: EventRecorder;
  private readonly budgets: BudgetLedger;
  private readonly provider: AgentProvider;
  private readonly scriptedModerator: ScriptedModeratorProvider | null;
  private readonly faults: FaultInjectingProvider | null;
  private readonly onEvent: ((event: AgoraEvent) => void) | undefined;
  private readonly startedAtMs: number;
  private readonly deadlineMs: number;
  private readonly provenance: CodeProvenance;

  private state: WorkshopState = 'CREATED';
  private history: StoredMessage[] = [];
  private messageSequence = 0;
  private opportunitySequence = 0;
  private invocationSequence = 0;
  private globalRound = 0;
  private deadlineHit = false;
  private cancelRequested = false;
  private readonly occurrences = new Map<string, number>();
  private readonly toolGateway = new ToolGateway();
  private toolCallSequence = 0;
  /** Scoped to one response opportunity and automatically attached to its events. */
  private activeTraceId: string | null = null;
  private readonly resumeOpportunities: OpportunityRow[];
  /** Completed state transitions are durable across a resume and must not be appended twice. */
  private readonly resumeTransitionKeys: Map<string, number>;
  private resumeOpportunityIndex = 0;
  private readonly resumeState: WorkshopState | null;
  private readonly resuming: boolean;

  constructor(options: ExecuteRunOptions) {
    this.db = options.db;
    this.frozen = options.frozen;
    this.config = options.frozen.config;
    this.runId = options.resumeRunId ?? options.runId ?? newRunId();
    this.resuming = options.resumeRunId !== undefined;
    this.onEvent = options.onEvent;
    this.budgets = new BudgetLedger(this.config);
    let existingStartMs = Date.now();
    this.resumeOpportunities = [];
    this.resumeTransitionKeys = new Map<string, number>();
    this.resumeState = null;
    if (this.resuming) {
      const existing = getRun(this.db, this.runId);
      if (!existing || existing.status !== 'INTERRUPTED' || !this.config.recovery?.enabled) {
        throw new Error('resume requires an INTERRUPTED run with recovery.enabled=true');
      }
      if (existing.config_hash !== this.frozen.hash) {
        throw new Error(
          `resume config hash mismatch: stored=${existing.config_hash} supplied=${this.frozen.hash}`,
        );
      }
      const terminalEvent = this.db.prepare(
        `SELECT event_type FROM events WHERE run_id = ? ORDER BY sequence DESC LIMIT 1`,
      ).get(this.runId) as { event_type: string } | undefined;
      if (terminalEvent && ['run_completed', 'run_failed', 'run_cancelled'].includes(terminalEvent.event_type)) {
        throw new Error('resume cannot reopen a run that already recorded a terminal event');
      }
      const parsedStart = existing.started_at ? Date.parse(existing.started_at) : Number.NaN;
      if (Number.isFinite(parsedStart)) existingStartMs = parsedStart;
      this.history = getMessages(this.db, this.runId);
      this.messageSequence = this.history.at(-1)?.sequence ?? 0;
      const opportunities = getOpportunities(this.db, this.runId);
      this.resumeOpportunities.push(...opportunities);
      for (const transition of getTransitions(this.db, this.runId)) {
        if (transition.status === 'completed') {
          const key = `${transition.from_state}->${transition.to_state}`;
          this.resumeTransitionKeys.set(key, (this.resumeTransitionKeys.get(key) ?? 0) + 1);
        }
      }
      this.opportunitySequence = Math.max(0, ...opportunities.map((row) => row.sequence));
      this.invocationSequence = (this.db.prepare('SELECT MAX(sequence) AS n FROM invocations WHERE run_id = ?').get(this.runId) as { n: number | null }).n ?? 0;
      this.toolCallSequence = (this.db.prepare('SELECT MAX(sequence) AS n FROM tool_calls WHERE run_id = ?').get(this.runId) as { n: number | null }).n ?? 0;
      const checkpoint = this.db.prepare(
        `SELECT state_json FROM run_checkpoints WHERE run_id = ? ORDER BY sequence DESC LIMIT 1`,
      ).get(this.runId) as { state_json: string } | undefined;
      if (checkpoint) {
        const state = JSON.parse(checkpoint.state_json) as { budgets?: Record<string, { calls: number; tokens: number }> };
        if (state.budgets) this.budgets.restore(state.budgets);
      }
      const lastEvent = this.db.prepare(
        `SELECT workshop_state FROM events WHERE run_id = ? ORDER BY sequence DESC LIMIT 1`,
      ).get(this.runId) as { workshop_state: string } | undefined;
      this.resumeState = lastEvent && isWorkshopState(lastEvent.workshop_state)
        ? lastEvent.workshop_state
        : 'CREATED';
      this.state = this.resumeState;
    }
    this.startedAtMs = existingStartMs;
    this.deadlineMs = this.startedAtMs + this.config.workshop.max_duration_seconds * 1000;

    if (options.provider) {
      this.provider = options.provider;
      this.faults = options.faults ?? null;
    } else {
      const built = buildProvider(this.config);
      this.provider = built.provider;
      this.faults = built.faults;
    }

    this.scriptedModerator =
      this.config.moderator.mode === 'scripted' ? new ScriptedModeratorProvider() : null;

    this.provenance = options.provenance ?? codeProvenance();
    const provenance = this.provenance;

    if (!this.resuming) this.db
      .prepare(
        `INSERT INTO runs (run_id, experiment_id, config_hash, config_json, config_canonical,
           config_source_path, source_run_id, status, provider, model, code_commit_sha,
           commit_source, deployment_id, app_version, environment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATED', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        this.runId,
        this.config.experiment_id,
        this.frozen.hash,
        JSON.stringify(this.config),
        this.frozen.canonical,
        this.frozen.sourcePath,
        options.sourceRunId ?? null,
        this.config.model.provider,
        this.config.model.model,
        provenance.git_commit_sha,
        provenance.commit_source,
        provenance.deployment_id,
        provenance.app_version,
        provenance.environment,
        nowIso(),
      );

    const previousEventSequence = this.resuming
      ? (this.db.prepare('SELECT MAX(sequence) AS n FROM events WHERE run_id = ?').get(this.runId) as { n: number | null }).n ?? 0
      : 0;
    this.recorder = new EventRecorder(
      this.db,
      this.runId,
      this.config.experiment_id,
      this.frozen.hash,
      this.startedAtMs,
      previousEventSequence,
    );
  }

  get id(): string {
    return this.runId;
  }

  /**
   * Chosen per turn rather than once per run, because a scripted moderator and
   * model-backed participants coexist in the same workshop.
   */
  private providerFor(agentId: string): AgentProvider {
    if (this.scriptedModerator && agentId === this.config.moderator.id) {
      return this.scriptedModerator;
    }
    return this.provider;
  }

  cancel(): void {
    this.cancelRequested = true;
  }

  async execute(): Promise<RunResult> {
    if (this.resuming) {
      this.db.prepare(`UPDATE runs SET status = 'RUNNING', termination_reason = NULL, failure_reason = NULL, ended_at = NULL WHERE run_id = ?`).run(this.runId);
      this.emit('run_resumed', { payload: { existing_opportunities: this.resumeOpportunities.length } });
    } else {
      this.emit('run_created', {
        payload: {
          config_hash: this.frozen.hash,
          provider: this.config.model.provider,
          model: this.config.model.model,
          participants: this.config.participants.map((p) => p.id),
          moderator: this.config.moderator.id,
          moderator_mode: this.config.moderator.mode ?? 'llm',
          code_provenance: this.provenance,
        },
      });

      this.db
        .prepare(`UPDATE runs SET status = 'RUNNING', started_at = ? WHERE run_id = ?`)
        .run(nowIso(), this.runId);
      this.emit('run_started', {
        payload: { max_duration_seconds: this.config.workshop.max_duration_seconds },
      });
    }

    let termination: TerminationReason = 'completed';

    try {
      const phases = plannedStates(this.config.workshop.rounds);
      for (const phase of phases) {
        if (this.deadlineHit || this.cancelRequested) break;
        if (phase === 'CLOSING') break; // closing is always run below
        const resumingEarlierState = this.resuming && phaseRank(phase) < phaseRank(this.resumeState ?? 'CREATED');
        if (!resumingEarlierState && !(this.resuming && phase === this.resumeState)) this.transition(phase);
        await this.runPhase(phase);
      }

      if (this.cancelRequested) {
        this.transition('CANCELLED', 'cancelled by operator');
        this.finishRun('CANCELLED', 'cancelled');
        this.emit('run_cancelled', { payload: {} });
        return this.result('CANCELLED', 'cancelled');
      }

      // The workshop always closes explicitly, even when the deadline cut it short.
      if (this.state !== 'CLOSING') this.transition('CLOSING', this.deadlineHit ? 'deadline reached' : undefined);
      await this.runClosing();

      const unresolved = getOpportunities(this.db, this.runId).filter(
        (opportunity) => opportunity.resolution === null,
      );
      if (unresolved.length > 0) {
        throw new Error(
          `cannot complete run with unresolved opportunities: ${unresolved
            .map((opportunity) => opportunity.opportunity_id)
            .join(', ')}`,
        );
      }

      this.transition('COMPLETED');
      termination = this.deadlineHit ? 'deadline_reached' : 'completed';
      this.finishRun('COMPLETED', termination);
      this.emit('run_completed', {
        payload: {
          termination_reason: termination,
          messages: this.messageSequence,
          budgets: this.budgets.all(),
        },
      });
      return this.result('COMPLETED', termination);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.resuming) this.classifyUnresolvedResumeOpportunities();
      if (!TERMINAL_STATES.includes(this.state)) {
        this.transition('FAILED', message);
      }
      this.finishRun('FAILED', 'failed', message);
      this.emit('run_failed', { payload: { reason: message } });
      return this.result('FAILED', 'failed');
    }
  }

  // ---------------------------------------------------------------- phases

  private async runPhase(phase: WorkshopState): Promise<void> {
    const rounds = this.roundsFor(phase);
    for (let round = 0; round < rounds; round += 1) {
      if (this.stopRequested()) return;

      if (phase === 'PRIVATE_OR_BREAKOUT') {
        if (round === 0) {
          await this.takeTurn({
            agentId: this.config.moderator.id,
            state: phase,
            channel: 'public',
            roundIndex: round,
            totalRounds: rounds,
          });
        }
        for (const group of this.config.channels.private.breakout_groups) {
          const members = group.members.filter((id) => id !== this.config.moderator.id);
          for (const agentId of members) {
            if (this.stopRequested()) return;
            await this.takeTurn({
              agentId,
              state: phase,
              channel: 'private',
              roundIndex: round,
              totalRounds: rounds,
              breakoutGroupId: group.id,
              breakoutMembers: group.members,
            });
          }
        }
        this.globalRound += 1;
        continue;
      }

      const moderatorSpeaks = phase === 'PUBLIC_DISCUSSION' || round === 0;
      if (moderatorSpeaks) {
        await this.takeTurn({
          agentId: this.config.moderator.id,
          state: phase,
          channel: 'public',
          roundIndex: round,
          totalRounds: rounds,
        });
      }

      for (const agentId of this.speakingOrder()) {
        if (this.stopRequested()) return;
        await this.takeTurn({
          agentId,
          state: phase,
          channel: 'public',
          roundIndex: round,
          totalRounds: rounds,
        });
      }
      this.globalRound += 1;
    }
  }

  private async runClosing(): Promise<void> {
    // The closing statement is still attempted after a deadline cut, so every run ends
    // with an explicit, recorded close rather than simply stopping.
    await this.takeTurn({
      agentId: this.config.moderator.id,
      state: 'CLOSING',
      channel: 'public',
      roundIndex: 0,
      totalRounds: 1,
    });
  }

  private roundsFor(phase: WorkshopState): number {
    const rounds = this.config.workshop.rounds;
    switch (phase) {
      case 'INTRODUCTION':
        return rounds.introduction;
      case 'PUBLIC_DISCUSSION':
        return rounds.public_discussion;
      case 'PRIVATE_OR_BREAKOUT':
        return rounds.private_or_breakout;
      case 'FINAL_DISCUSSION':
        return rounds.final_discussion;
      default:
        return 0;
    }
  }

  /**
   * Deterministic speaking order. Rotation by round removes the systematic
   * first-speaker advantage without introducing any randomness.
   */
  private speakingOrder(): string[] {
    const ids = this.config.participants.map((p) => p.id);
    if (this.config.scheduling.order === 'config_order') return ids;
    const offset = this.globalRound % ids.length;
    return [...ids.slice(offset), ...ids.slice(0, offset)];
  }

  private stopRequested(): boolean {
    if (this.cancelRequested) return true;
    if (this.deadlineHit) return true;
    if (Date.now() >= this.deadlineMs) {
      this.deadlineHit = true;
      this.emit('deadline_reached', {
        payload: {
          max_duration_seconds: this.config.workshop.max_duration_seconds,
          elapsed_ms: Date.now() - this.startedAtMs,
        },
      });
      return true;
    }
    return false;
  }

  // ----------------------------------------------------------------- turns

  private async takeTurn(spec: TurnSpec): Promise<void> {
    const existing = this.resuming ? this.resumeOpportunities[this.resumeOpportunityIndex++] : undefined;
    if (existing && !opportunityMatches(existing, spec)) {
      throw new Error(`resume schedule mismatch at opportunity ${existing.opportunity_id}: stored=${JSON.stringify({ agent: existing.agent_id, state: existing.workshop_state, channel: existing.channel, round: existing.round_index, group: existing.breakout_group_id })} expected=${JSON.stringify({ agent: spec.agentId, state: spec.state, channel: spec.channel, round: spec.roundIndex, group: spec.breakoutGroupId ?? null })}`);
    }
    const occurrenceKey = `${spec.agentId}::${spec.state}`;
    const occurrence = (this.occurrences.get(occurrenceKey) ?? 0) + 1;
    this.occurrences.set(occurrenceKey, occurrence);
    const interrupted = existing?.resolution === 'infrastructure_failure' && existing.failure_category === 'interrupted';
    if (interrupted) this.reopenInterruptedOpportunity(existing.opportunity_id);
    if (existing?.resolution !== null && !interrupted && existing !== undefined) return;
    const traceId = existing?.trace_id ?? newTraceId();
    this.activeTraceId = traceId;
    try {
      await this.takeTurnWithTrace(spec, traceId, existing, occurrence);
    } finally {
      this.activeTraceId = null;
    }
  }

  private async takeTurnWithTrace(
    spec: TurnSpec,
    traceId: string,
    existing: OpportunityRow | undefined,
    occurrence: number,
  ): Promise<void> {
    const opportunityId = existing?.opportunity_id ?? newOpportunityId();
    if (!existing) this.opportunitySequence += 1;
    const createdAt = nowIso();

    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO opportunities (opportunity_id, run_id, trace_id, sequence, agent_id, workshop_state,
             channel, breakout_group_id, round_index, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          opportunityId,
          this.runId,
          traceId,
          this.opportunitySequence,
          spec.agentId,
          spec.state,
          spec.channel,
          spec.breakoutGroupId ?? null,
          spec.roundIndex,
          createdAt,
        );
    }

    const opportunityEvent = this.emit(existing ? 'recovery_opportunity_reopened' : 'response_opportunity_created', {
      agent_id: spec.agentId,
      channel: spec.channel,
      payload: {
        opportunity_id: opportunityId,
        trace_id: traceId,
        round_index: spec.roundIndex,
        breakout_group_id: spec.breakoutGroupId ?? null,
        reused_opportunity: existing !== undefined,
      },
    });

    // A process can stop after routing has persisted a message but before the
    // opportunity update/checkpoint. Reuse that durable message and repair only
    // missing deliveries; invoking the provider again would create a duplicate
    // behavioural output under the same response opportunity.
    if (existing) {
      const persisted = this.findPersistedMessage(existing);
      if (persisted) {
        this.repairMessageDeliveries(persisted, opportunityEvent.event_id);
        const attempt = (this.db.prepare(
          `SELECT MAX(attempt) AS attempt FROM invocations WHERE run_id = ?
           AND opportunity_id = ?`,
        ).get(this.runId, opportunityId) as { attempt: number | null }).attempt ?? 1;
        this.resolveOpportunity(opportunityId, 'success', null, 1, persisted.message_id, attempt);
        return;
      }
    }

    const budget = this.budgets.check(spec.agentId);
    if (!budget.allowed) {
      this.emit('budget_exhausted', {
        agent_id: spec.agentId,
        channel: spec.channel,
        parent_event_id: opportunityEvent.event_id,
        payload: { opportunity_id: opportunityId, exhausted: budget.exhausted },
      });
      this.resolveOpportunity(opportunityId, 'infrastructure_failure', 'budget_exhausted', 0, null);
      return;
    }
    if (budget.warning) {
      this.emit('budget_warning', {
        agent_id: spec.agentId,
        channel: spec.channel,
        parent_event_id: opportunityEvent.event_id,
        payload: {
          opportunity_id: opportunityId,
          nearing: budget.warning,
          used: this.budgets.snapshot(spec.agentId),
        },
      });
    }

    const context = assembleContext({
      config: this.config,
      history: this.history,
      agentId: spec.agentId,
      state: spec.state,
      roundIndex: spec.roundIndex,
      totalRounds: spec.totalRounds,
      channel: spec.channel,
      breakoutGroupId: spec.breakoutGroupId,
      breakoutMembers: spec.breakoutMembers,
      opportunityId,
    });

    const contextEvent = this.emit('context_assembled', {
      agent_id: spec.agentId,
      channel: spec.channel,
      parent_event_id: opportunityEvent.event_id,
      payload: {
        opportunity_id: opportunityId,
        prompt_version: context.promptVersion,
        context_policy_version: this.config.context_policy.version,
        included_message_ids: context.includedMessageIds,
        public_message_ids: context.publicMessageIds,
        private_message_ids: context.privateMessageIds,
        summary_ids: context.summaryRecords.map((summary) => summary.summary_id),
        summary_source_message_ids: context.summaryRecords.flatMap(
          (summary) => summary.source_message_ids,
        ),
        included_count: context.includedMessageIds.length,
      },
    });
    this.persistSummaries(context, opportunityId);

    this.faults?.setContext({ state: spec.state, occurrence });
    this.executeToolProbes(spec, opportunityId, occurrence, contextEvent.event_id);

    const maxAttempts = this.config.runtime.max_retries + 1;
    let attempts = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attempts = attempt;
      const invocationId = newInvocationId();
      this.invocationSequence += 1;

      const startEvent = this.emit('agent_invocation_started', {
        agent_id: spec.agentId,
        channel: spec.channel,
        parent_event_id: contextEvent.event_id,
        causal_event_ids: [opportunityEvent.event_id],
        payload: { opportunity_id: opportunityId, invocation_id: invocationId, attempt },
      });

      const before = this.budgets.snapshot(spec.agentId);
      const result = await this.providerFor(spec.agentId).invoke({
        invocationId,
        agentId: spec.agentId,
        attempt,
        system: context.systemPrompt,
        messages: context.renderedMessages,
        model: this.config.model,
        timeoutMs: this.config.runtime.timeout_seconds * 1000,
        traceId: this.activeTraceId ?? undefined,
        configHash: this.frozen.hash,
        contextMessageIds: context.includedMessageIds,
        summaryIds: context.summaryRecords.map((summary) => summary.summary_id),
        summaryHashes: context.summaryRecords.map((summary) => summary.content_hash),
        capabilityManifest: this.config.capabilities.manifest,
        workshopState: spec.state,
      });

      this.budgets.recordCall(
        spec.agentId,
        (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
      );

      if (result.ok) {
        const classified = classifyContent(result.content ?? '');

        if (classified.kind === 'malformed') {
          this.writeInvocation({
            invocationId,
            opportunityId,
            spec,
            attempt,
            context,
            before,
            result,
            outcome: 'infra_failure',
            failureCategory: 'malformed_response',
            errorMessage: 'provider returned an empty or unparseable message',
            outputMessageId: null,
          });
          this.emitFailure(
            spec,
            opportunityId,
            invocationId,
            startEvent.event_id,
            'malformed_response',
            'provider returned an empty or unparseable message',
            attempt,
          );
          if (attempt < maxAttempts) {
            await this.scheduleRetry(spec, opportunityId, startEvent.event_id, attempt, maxAttempts);
            continue;
          }
          this.exhaust(spec, opportunityId, startEvent.event_id, 'malformed_response', attempts);
          return;
        }

        if (classified.kind === 'abstain' || classified.kind === 'no_op') {
          this.writeInvocation({
            invocationId,
            opportunityId,
            spec,
            attempt,
            context,
            before,
            result,
            outcome: classified.kind === 'abstain' ? 'explicit_abstention' : 'no_op',
            failureCategory: null,
            errorMessage: null,
            outputMessageId: null,
          });
          this.emit('agent_invocation_succeeded', {
            agent_id: spec.agentId,
            channel: spec.channel,
            parent_event_id: startEvent.event_id,
            payload: {
              opportunity_id: opportunityId,
              invocation_id: invocationId,
              latency_ms: result.latencyMs,
              usage: result.usage,
              behavioural_outcome: classified.kind === 'abstain' ? 'explicit_abstention' : 'no_op',
            },
          });
          this.emit(classified.kind === 'abstain' ? 'explicit_abstention' : 'no_op', {
            agent_id: spec.agentId,
            channel: spec.channel,
            parent_event_id: startEvent.event_id,
            payload: { opportunity_id: opportunityId, invocation_id: invocationId },
          });
          this.resolveOpportunity(
            opportunityId,
            classified.kind === 'abstain' ? 'explicit_abstention' : 'no_op',
            null,
            1,
            null,
            attempts,
          );
          return;
        }

        const messageId = this.routeMessage(
          spec,
          classified.text,
          invocationId,
          startEvent.event_id,
        );

        this.writeInvocation({
          invocationId,
          opportunityId,
          spec,
          attempt,
          context,
          before,
          result,
          outcome: 'success',
          failureCategory: null,
          errorMessage: null,
          outputMessageId: messageId,
        });

        this.emit('agent_invocation_succeeded', {
          agent_id: spec.agentId,
          channel: spec.channel,
          parent_event_id: startEvent.event_id,
          payload: {
            opportunity_id: opportunityId,
            invocation_id: invocationId,
            latency_ms: result.latencyMs,
            usage: result.usage,
            responded_model: result.respondedModel,
            output_message_id: messageId,
          },
        });

        this.resolveOpportunity(opportunityId, 'success', null, 1, messageId, attempts);
        return;
      }

      const category = result.failure?.category ?? 'unknown';
      const message = result.failure?.message ?? 'unknown provider failure';
      this.writeInvocation({
        invocationId,
        opportunityId,
        spec,
        attempt,
        context,
        before,
        result,
        outcome: 'infra_failure',
        failureCategory: category,
        errorMessage: message,
        outputMessageId: null,
      });
      this.emitFailure(
        spec,
        opportunityId,
        invocationId,
        startEvent.event_id,
        category,
        message,
        attempt,
      );

      if (attempt < maxAttempts) {
        await this.scheduleRetry(spec, opportunityId, startEvent.event_id, attempt, maxAttempts);
        continue;
      }
      this.exhaust(spec, opportunityId, startEvent.event_id, category, attempts);
      return;
    }
  }

  private async scheduleRetry(
    spec: TurnSpec,
    opportunityId: string,
    parentEventId: string,
    attempt: number,
    maxAttempts: number,
  ): Promise<void> {
    const backoff = this.config.runtime.retry_backoff_ms * attempt;
    this.emit('retry_scheduled', {
      agent_id: spec.agentId,
      channel: spec.channel,
      parent_event_id: parentEventId,
      payload: {
        opportunity_id: opportunityId,
        next_attempt: attempt + 1,
        max_attempts: maxAttempts,
        backoff_ms: backoff,
      },
    });
    if (backoff > 0) await new Promise((r) => setTimeout(r, backoff));
    this.emit('retry_started', {
      agent_id: spec.agentId,
      channel: spec.channel,
      parent_event_id: parentEventId,
      payload: { opportunity_id: opportunityId, attempt: attempt + 1 },
    });
  }

  private exhaust(
    spec: TurnSpec,
    opportunityId: string,
    parentEventId: string,
    category: InfrastructureFailure,
    attempts: number,
  ): void {
    this.emit('retry_exhausted', {
      agent_id: spec.agentId,
      channel: spec.channel,
      parent_event_id: parentEventId,
      payload: { opportunity_id: opportunityId, final_failure_category: category, attempts },
    });
    // The recorded category is the failure that actually occurred; `retry_exhausted`
    // is the surrounding event, not a replacement label.
    this.resolveOpportunity(opportunityId, 'infrastructure_failure', category, 0, null, attempts);
  }

  private emitFailure(
    spec: TurnSpec,
    opportunityId: string,
    invocationId: string,
    parentEventId: string,
    category: InfrastructureFailure,
    message: string,
    attempt: number,
  ): void {
    this.emit('agent_invocation_failed', {
      agent_id: spec.agentId,
      channel: spec.channel,
      parent_event_id: parentEventId,
      payload: {
        opportunity_id: opportunityId,
        invocation_id: invocationId,
        attempt,
        failure_category: category,
        error: message,
      },
    });
    this.emit(FAILURE_EVENT_TYPE[category], {
      agent_id: spec.agentId,
      channel: spec.channel,
      parent_event_id: parentEventId,
      payload: {
        opportunity_id: opportunityId,
        invocation_id: invocationId,
        attempt,
        failure_category: category,
        error: message,
      },
    });
  }

  // -------------------------------------------------------------- routing

  private routeMessage(
    spec: TurnSpec,
    content: string,
    invocationId: string,
    parentEventId: string,
  ): string {
    const isPrivate = spec.channel === 'private';
    const intended = isPrivate
      ? breakoutRecipients(this.config, spec.breakoutGroupId!, spec.agentId)
      : publicRecipients(this.config, spec.agentId);

    if (isPrivate && intended.length === 0) {
      this.emit('routing_error', {
        agent_id: spec.agentId,
        channel: spec.channel,
        parent_event_id: parentEventId,
        payload: {
          reason: 'breakout group resolved to zero recipients',
          breakout_group_id: spec.breakoutGroupId ?? null,
        },
      });
      throw new Error(`routing error: no recipients for breakout group ${spec.breakoutGroupId}`);
    }

    const messageId = newMessageId();
    this.messageSequence += 1;
    const createdAt = nowIso();

    const generatedEvent = this.emit(
      isPrivate ? 'private_message_generated' : 'message_generated',
      {
        agent_id: spec.agentId,
        channel: spec.channel,
        parent_event_id: parentEventId,
        payload: {
          message_id: messageId,
          invocation_id: invocationId,
          breakout_group_id: spec.breakoutGroupId ?? null,
          length: content.length,
        },
      },
    );

    const message: StoredMessage = {
      message_id: messageId,
      trace_id: this.activeTraceId,
      sequence: this.messageSequence,
      channel: spec.channel,
      breakout_group_id: spec.breakoutGroupId ?? null,
      sender_agent_id: spec.agentId,
      intended_recipients: intended,
      actual_recipients: intended,
      workshop_state: spec.state,
      created_at: createdAt,
      content,
      source_invocation_id: invocationId,
      source_event_id: generatedEvent.event_id,
    };

    this.db
      .prepare(
        `INSERT INTO messages (message_id, run_id, trace_id, sequence, channel, breakout_group_id,
           sender_agent_id, intended_recipients, actual_recipients, workshop_state, created_at,
           content, source_invocation_id, source_event_id, artifact_refs)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`,
      )
      .run(
        messageId,
        this.runId,
        this.activeTraceId,
        message.sequence,
        message.channel,
        message.breakout_group_id,
        message.sender_agent_id,
        JSON.stringify(message.intended_recipients),
        JSON.stringify(message.actual_recipients),
        message.workshop_state,
        message.created_at,
        message.content,
        invocationId,
        generatedEvent.event_id,
      );

    this.history.push(message);

    const routedEvent = this.emit(isPrivate ? 'private_message_routed' : 'message_routed', {
      agent_id: spec.agentId,
      channel: spec.channel,
      parent_event_id: generatedEvent.event_id,
      payload: {
        message_id: messageId,
        intended_recipients: intended,
        actual_recipients: intended,
        breakout_group_id: spec.breakoutGroupId ?? null,
      },
    });

    for (const recipient of intended) {
      this.emit(isPrivate ? 'private_message_delivered' : 'message_delivered', {
        agent_id: recipient,
        channel: spec.channel,
        parent_event_id: routedEvent.event_id,
        causal_event_ids: [generatedEvent.event_id],
        payload: {
          message_id: messageId,
          sender_agent_id: spec.agentId,
          breakout_group_id: spec.breakoutGroupId ?? null,
        },
      });
    }

    return messageId;
  }

  private findPersistedMessage(opportunity: OpportunityRow): StoredMessage | null {
    const candidate = this.db.prepare(
      `SELECT message_id FROM messages WHERE run_id = ? AND trace_id = ?
       ORDER BY sequence DESC LIMIT 1`,
    ).get(this.runId, opportunity.trace_id) as { message_id: string } | undefined;
    const messageId = opportunity.message_id ?? candidate?.message_id ?? null;
    if (!messageId) return null;
    const message = this.history.find((item) => item.message_id === messageId);
    if (!message) {
      throw new Error(`recovery message ${messageId} is missing from the durable message log`);
    }
    return message;
  }

  private repairMessageDeliveries(message: StoredMessage, parentEventId: string): void {
    const deliveryType = message.channel === 'private'
      ? 'private_message_delivered'
      : 'message_delivered';
    const delivered = new Set(
      readEvents(this.db, this.runId)
        .filter((event) => event.event_type === deliveryType && event.payload['message_id'] === message.message_id)
        .map((event) => event.agent_id)
        .filter((agentId): agentId is string => agentId !== null),
    );
    for (const recipient of message.actual_recipients) {
      if (delivered.has(recipient)) continue;
      this.emit(deliveryType, {
        agent_id: recipient,
        channel: message.channel,
        parent_event_id: parentEventId,
        causal_event_ids: message.source_event_id ? [message.source_event_id] : [],
        payload: {
          message_id: message.message_id,
          sender_agent_id: message.sender_agent_id,
          breakout_group_id: message.breakout_group_id,
          recovered: true,
        },
      });
    }
  }

  // ------------------------------------------------------------ persistence

  private executeToolProbes(
    spec: TurnSpec,
    opportunityId: string,
    occurrence: number,
    parentEventId: string,
  ): void {
    if (!this.config.tool_probe?.enabled) return;
    const probes = this.config.tool_probe.probes.filter(
      (probe) =>
        probe.agent_id === spec.agentId && probe.state === spec.state && probe.occurrence === occurrence,
    );
    const logicalCalls = new Map<string, number>();
    for (const probe of probes) {
      const configuredFault = this.config.fault_injection?.faults.find(
        (fault) =>
          fault.agent_id === spec.agentId &&
          fault.state === spec.state &&
          fault.occurrence === occurrence &&
          isToolFailureKind(fault.kind),
      );
      const callsUsed = logicalCalls.get(probe.tool_id) ?? 0;
      const maxAttempts = this.config.runtime.max_retries + 1;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const toolCallId = newToolCallId();
        this.toolCallSequence += 1;
        const started = this.emit('tool_call_started', {
          agent_id: spec.agentId,
          channel: spec.channel,
          parent_event_id: parentEventId,
          payload: { opportunity_id: opportunityId, tool_call_id: toolCallId, tool_id: probe.tool_id, attempt },
        });
        const forcedFault =
          configuredFault &&
          (configuredFault.recover_after_attempts === null || attempt <= configuredFault.recover_after_attempts)
            ? configuredFault.kind
            : null;
        const gatewayResult = this.toolGateway.execute({
          agentId: spec.agentId,
          toolId: probe.tool_id,
          input: probe.input,
          callsUsed,
          manifest: this.config.capabilities.manifest,
        });
        const result = gatewayResult.ok && forcedFault
          ? {
              ok: false as const,
              category: forcedFault,
              message: `injected tool fault: ${forcedFault} (attempt ${attempt})`,
            }
          : gatewayResult;
        if (result.ok) {
          this.writeToolCall({
            toolCallId, opportunityId, spec, toolId: probe.tool_id, input: probe.input, attempt,
            resultScope: result.resultScope, result: result.result, failure: null,
          });
          this.emit('tool_call_succeeded', {
            agent_id: spec.agentId,
            channel: spec.channel,
            parent_event_id: started.event_id,
            payload: { opportunity_id: opportunityId, tool_call_id: toolCallId, tool_id: probe.tool_id, attempt },
          });
          break;
        }
        this.writeToolCall({
          toolCallId, opportunityId, spec, toolId: probe.tool_id, input: probe.input, attempt,
          resultScope: null, result: null, failure: result,
        });
        this.emit('tool_call_failed', {
          agent_id: spec.agentId,
          channel: spec.channel,
          parent_event_id: started.event_id,
          payload: {
            opportunity_id: opportunityId, tool_call_id: toolCallId, tool_id: probe.tool_id, attempt,
            failure_category: result.category, error: result.message,
          },
        });
        if (attempt < maxAttempts) {
          if (result.category === 'permission_denied') break;
          this.emit('tool_retry_scheduled', {
            agent_id: spec.agentId,
            channel: spec.channel,
            parent_event_id: started.event_id,
            payload: { opportunity_id: opportunityId, tool_id: probe.tool_id, failed_attempt: attempt },
          });
        }
      }
      logicalCalls.set(probe.tool_id, callsUsed + 1);
    }
  }

  private writeToolCall(input: {
    toolCallId: string;
    opportunityId: string;
    spec: TurnSpec;
    toolId: string;
    input: Record<string, unknown>;
    attempt: number;
    resultScope: 'public' | 'private' | null;
    result: Record<string, unknown> | null;
    failure: { ok: false; category: InfrastructureFailure; message: string } | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO tool_calls (tool_call_id, run_id, trace_id, opportunity_id, sequence, attempt, agent_id,
           tool_id, workshop_state, channel, result_scope, input_json, result_json, outcome,
           failure_category, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.toolCallId,
        this.runId,
        this.activeTraceId,
        input.opportunityId,
        this.toolCallSequence,
        input.attempt,
        input.spec.agentId,
        input.toolId,
        input.spec.state,
        input.spec.channel,
        input.resultScope,
        JSON.stringify(input.input),
        input.result === null ? null : JSON.stringify(input.result),
        input.failure ? 'infra_failure' : 'success',
        input.failure?.category ?? null,
        input.failure?.message ?? null,
        nowIso(),
      );
  }

  private persistSummaries(
    context: ReturnType<typeof assembleContext>,
    opportunityId: string,
  ): void {
    for (const summary of context.summaryRecords) {
      this.db
        .prepare(
          `INSERT INTO context_summaries (summary_id, run_id, trace_id, opportunity_id, agent_id,
             scope, summarizer_version, source_message_ids, source_hash, content, content_hash,
             fidelity_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          summary.summary_id,
          this.runId,
          this.activeTraceId,
          opportunityId,
          summary.agent_id,
          summary.scope,
          summary.summarizer_version,
          JSON.stringify(summary.source_message_ids),
          summary.source_hash,
          summary.content,
          summary.content_hash,
          summary.fidelity_hash,
          nowIso(),
        );
    }
  }

  private writeInvocation(input: {
    invocationId: string;
    opportunityId: string;
    spec: TurnSpec;
    attempt: number;
    context: ReturnType<typeof assembleContext>;
    before: { calls: number; tokens: number };
    result: Awaited<ReturnType<AgentProvider['invoke']>>;
    outcome: 'success' | 'explicit_abstention' | 'no_op' | 'infra_failure';
    failureCategory: InfrastructureFailure | null;
    errorMessage: string | null;
    outputMessageId: string | null;
  }): void {
    const { spec, result, context } = input;
    this.db
      .prepare(
        `INSERT INTO invocations (invocation_id, run_id, opportunity_id, trace_id, sequence, agent_id,
           workshop_state, channel, attempt, provider, requested_model, responded_model,
           generation_params, prompt_version, system_prompt, rendered_messages,
           context_message_ids, context_public_ids, context_private_ids, context_policy_version,
           capability_manifest, budget_calls_used_before, budget_tokens_used_before,
           request_ts, response_ts, latency_ms, outcome, failure_category, error_message,
           finish_reason, input_tokens, output_tokens, output_message_id, raw_metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?)`,
      )
      .run(
        input.invocationId,
        this.runId,
        input.opportunityId,
        this.activeTraceId,
        this.invocationSequence,
        spec.agentId,
        spec.state,
        spec.channel,
        input.attempt,
        result.provider,
        result.requestedModel,
        result.respondedModel,
        JSON.stringify(this.config.model),
        context.promptVersion,
        context.systemPrompt,
        JSON.stringify(context.renderedMessages),
        JSON.stringify(context.includedMessageIds),
        JSON.stringify(context.publicMessageIds),
        JSON.stringify(context.privateMessageIds),
        this.config.context_policy.version,
        JSON.stringify(this.config.capabilities.manifest),
        input.before.calls,
        input.before.tokens,
        result.requestTs,
        result.responseTs,
        result.latencyMs,
        input.outcome,
        input.failureCategory,
        input.errorMessage,
        result.finishReason,
        result.usage.inputTokens,
        result.usage.outputTokens,
        input.outputMessageId,
        JSON.stringify(result.raw),
      );
  }

  private resolveOpportunity(
    opportunityId: string,
    resolution: OpportunityResolution,
    failureCategory: InfrastructureFailure | null,
    behaviourallyAvailable: 0 | 1,
    messageId: string | null,
    attempts = 0,
  ): void {
    this.db
      .prepare(
        `UPDATE opportunities SET resolved_at = ?, resolution = ?, failure_category = ?,
           behaviourally_available = ?, message_id = ?, attempts = ?
         WHERE opportunity_id = ?`,
      )
      .run(
        nowIso(),
        resolution,
        failureCategory,
        behaviourallyAvailable,
        messageId,
        attempts,
        opportunityId,
      );
    this.writeCheckpoint(opportunityId);
  }

  /** Reopen only the opportunity whose scheduled turn is actually being resumed. */
  private reopenInterruptedOpportunity(opportunityId: string): void {
    this.db
      .prepare(
        `UPDATE opportunities SET resolved_at = NULL, resolution = NULL, failure_category = NULL,
           behaviourally_available = 0, attempts = 0
         WHERE opportunity_id = ? AND resolution = 'infrastructure_failure'
           AND failure_category = 'interrupted'`,
      )
      .run(opportunityId);
  }

  /**
   * A resume can fail before it reaches every pending turn. Those turns must remain
   * explicitly classified so a later reconcile/resume can distinguish interruption
   * from agent behaviour; constructor-time reopening would leave them orphaned.
   */
  private classifyUnresolvedResumeOpportunities(): void {
    const resolvedAt = nowIso();
    this.db
      .prepare(
        `UPDATE opportunities SET resolution = 'infrastructure_failure',
           failure_category = 'interrupted', behaviourally_available = 0,
           resolved_at = ?
         WHERE run_id = ? AND resolution IS NULL`,
      )
      .run(resolvedAt, this.runId);
  }

  private writeCheckpoint(opportunityId: string): void {
    if (!this.config.recovery?.enabled) return;
    this.db
      .prepare(
        `INSERT INTO run_checkpoints (checkpoint_id, run_id, sequence, opportunity_id, event_sequence,
           state_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newCheckpointId(),
        this.runId,
        this.opportunitySequence,
        opportunityId,
        this.recorder.lastSequence,
        JSON.stringify({
          config_hash: this.frozen.hash,
          workshop_state: this.state,
          message_sequence: this.messageSequence,
          opportunity_sequence: this.opportunitySequence,
          invocation_sequence: this.invocationSequence,
          global_round: this.globalRound,
          budgets: this.budgets.all(),
        }),
        nowIso(),
      );
  }

  private transition(to: WorkshopState, reason?: string): void {
    const from = this.state;
    const startedAt = nowIso();

    // A recovered run may have durable transition rows beyond the last event that
    // survived an interruption. Reusing the existing row keeps the state-machine
    // history a single chain instead of appending a second copy of the same pass.
    const recordedKey = `${from}->${to}`;
    const alreadyRecorded = this.resuming ? (this.resumeTransitionKeys.get(recordedKey) ?? 0) : 0;
    if (alreadyRecorded > 0) {
      this.resumeTransitionKeys.set(recordedKey, alreadyRecorded - 1);
      this.state = to;
      return;
    }

    if (!canTransition(from, to)) {
      this.emit('state_transition_rejected', {
        payload: { from_state: from, to_state: to, reason: reason ?? null },
      });
      this.db
        .prepare(
          `INSERT INTO state_transitions (run_id, sequence, from_state, to_state, status, reason,
             started_at) VALUES (?, ?, ?, ?, 'rejected', ?, ?)`,
        )
        .run(this.runId, this.recorder.lastSequence, from, to, reason ?? null, startedAt);
      throw new InvalidTransitionError(from, to);
    }

    this.emit('state_transition_started', {
      payload: { from_state: from, to_state: to, reason: reason ?? null },
    });

    this.state = to;
    const completedAt = nowIso();

    this.db
      .prepare(
        `INSERT INTO state_transitions (run_id, sequence, from_state, to_state, status, reason,
           started_at, completed_at) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?)`,
      )
      .run(this.runId, this.recorder.lastSequence, from, to, reason ?? null, startedAt, completedAt);

    this.emit('state_transition_completed', {
      payload: { from_state: from, to_state: to, reason: reason ?? null },
    });
  }

  private finishRun(
    status: 'COMPLETED' | 'FAILED' | 'CANCELLED',
    terminationReason: TerminationReason,
    failureReason?: string,
  ): void {
    this.db
      .prepare(
        `UPDATE runs SET status = ?, termination_reason = ?, failure_reason = ?, ended_at = ?,
           duration_ms = ? WHERE run_id = ?`,
      )
      .run(
        status,
        terminationReason,
        failureReason ?? null,
        nowIso(),
        Date.now() - this.startedAtMs,
        this.runId,
      );
  }

  private result(
    status: 'COMPLETED' | 'FAILED' | 'CANCELLED',
    terminationReason: TerminationReason,
  ): RunResult {
    return {
      runId: this.runId,
      status,
      terminationReason,
      configHash: this.frozen.hash,
      durationMs: Date.now() - this.startedAtMs,
      messageCount: this.messageSequence,
      eventCount: this.recorder.lastSequence,
    };
  }

  private emit(
    type: Parameters<EventRecorder['record']>[0]['event_type'],
    input: Omit<Parameters<EventRecorder['record']>[0], 'event_type' | 'workshop_state'>,
  ): AgoraEvent {
    const traceId = input.trace_id ?? this.activeTraceId;
    const event = this.recorder.record({
      ...input,
      trace_id: traceId,
      event_type: type,
      workshop_state: this.state,
      payload: traceId
        ? { ...(input.payload ?? {}), trace_id: input.payload?.['trace_id'] ?? traceId }
        : input.payload,
    });
    this.onEvent?.(event);
    return event;
  }
}

type ContentClassification =
  | { kind: 'message'; text: string }
  | { kind: 'abstain' }
  | { kind: 'no_op' }
  | { kind: 'malformed' };

function isToolFailureKind(
  kind: FaultKind,
): kind is 'tool_timeout' | 'tool_unavailable' | 'tool_invalid_response' {
  return kind === 'tool_timeout' || kind === 'tool_unavailable' || kind === 'tool_invalid_response';
}

function isWorkshopState(value: string): value is WorkshopState {
  return ['CREATED', 'INTRODUCTION', 'PUBLIC_DISCUSSION', 'PRIVATE_OR_BREAKOUT', 'FINAL_DISCUSSION', 'CLOSING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(value);
}

function phaseRank(state: WorkshopState): number {
  return ['CREATED', 'INTRODUCTION', 'PUBLIC_DISCUSSION', 'PRIVATE_OR_BREAKOUT', 'FINAL_DISCUSSION', 'CLOSING'].indexOf(state);
}

function opportunityMatches(row: OpportunityRow, spec: TurnSpec): boolean {
  return row.agent_id === spec.agentId && row.workshop_state === spec.state && row.channel === spec.channel &&
    row.round_index === spec.roundIndex && row.breakout_group_id === (spec.breakoutGroupId ?? null);
}

/**
 * Behaviour-vs-infrastructure is decided here for output content.
 *
 * An empty response is classified as `malformed`, i.e. infrastructure — silence is
 * only counted as behaviour when the agent explicitly says so with the protocol
 * token. Guessing the other way would manufacture abstentions out of provider bugs.
 */
export function classifyContent(raw: string): ContentClassification {
  const text = raw.trim();
  if (text.length === 0) return { kind: 'malformed' };
  if (text === ABSTAIN_TOKEN || text.startsWith(`${ABSTAIN_TOKEN} `)) return { kind: 'abstain' };
  if (text === PASS_TOKEN || text.startsWith(`${PASS_TOKEN} `)) return { kind: 'no_op' };
  return { kind: 'message', text };
}
