import type { Db } from '../db/index.js';
import { newEventId, nowIso } from '../core/ids.js';
import type { AgoraEvent, EventType } from './types.js';

export interface RecordEventInput {
  event_type: EventType;
  workshop_state: string;
  agent_id?: string | null;
  channel?: string | null;
  trace_id?: string | null;
  parent_event_id?: string | null;
  causal_event_ids?: string[];
  payload?: Record<string, unknown>;
}

/**
 * Assigns the per-run monotonic sequence and writes the event synchronously.
 * Logging is part of execution: if the write fails the run fails, rather than
 * continuing with an incomplete record.
 */
export class EventRecorder {
  private sequence = 0;

  constructor(
    private readonly db: Db,
    private readonly runId: string,
    private readonly experimentId: string,
    private readonly configHash: string,
    private readonly startedAtMs: number,
    initialSequence = 0,
  ) { this.sequence = initialSequence; }

  get lastSequence(): number {
    return this.sequence;
  }

  nextSequence(): number {
    return this.sequence + 1;
  }

  record(input: RecordEventInput): AgoraEvent {
    this.sequence += 1;
    const event: AgoraEvent = {
      event_id: newEventId(),
      run_id: this.runId,
      experiment_id: this.experimentId,
      config_hash: this.configHash,
      sequence: this.sequence,
      timestamp: nowIso(),
      elapsed_ms: Date.now() - this.startedAtMs,
      event_type: input.event_type,
      workshop_state: input.workshop_state,
      agent_id: input.agent_id ?? null,
      channel: input.channel ?? null,
      trace_id: input.trace_id ?? null,
      parent_event_id: input.parent_event_id ?? null,
      causal_event_ids: input.causal_event_ids ?? [],
      payload: input.payload ?? {},
    };

    this.db
      .prepare(
        `INSERT INTO events (event_id, run_id, experiment_id, config_hash, sequence, timestamp,
           elapsed_ms, event_type, workshop_state, agent_id, channel, trace_id, parent_event_id,
           causal_event_ids, payload)
         VALUES (@event_id, @run_id, @experiment_id, @config_hash, @sequence, @timestamp,
           @elapsed_ms, @event_type, @workshop_state, @agent_id, @channel, @trace_id, @parent_event_id,
           @causal_event_ids, @payload)`,
      )
      .run({
        ...event,
        causal_event_ids: JSON.stringify(event.causal_event_ids),
        payload: JSON.stringify(event.payload),
      });

    return event;
  }
}

interface EventRow {
  event_id: string;
  run_id: string;
  experiment_id: string;
  config_hash: string;
  sequence: number;
  timestamp: string;
  elapsed_ms: number;
  event_type: string;
  workshop_state: string;
  agent_id: string | null;
  channel: string | null;
  trace_id: string | null;
  parent_event_id: string | null;
  causal_event_ids: string;
  payload: string;
}

export function readEvents(db: Db, runId: string): AgoraEvent[] {
  const rows = db
    .prepare(`SELECT * FROM events WHERE run_id = ? ORDER BY sequence ASC`)
    .all(runId) as EventRow[];
  return rows.map((row) => ({
    ...row,
    event_type: row.event_type as EventType,
    causal_event_ids: JSON.parse(row.causal_event_ids) as string[],
    payload: JSON.parse(row.payload) as Record<string, unknown>,
  }));
}
