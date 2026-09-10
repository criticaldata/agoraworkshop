import type { Db } from '../db/index.js';
import { newEventId, nowIso } from '../core/ids.js';
import { getOpportunities, getRun, listRuns } from '../db/queries.js';

/**
 * A run left in CREATED or RUNNING was interrupted: the process that was executing it
 * stopped without writing a terminal status. Runs execute in the web process, so a
 * deploy, a container restart, or a crash produces exactly this.
 *
 * `INTERRUPTED` is its own status. It is not COMPLETED, because the workshop did not
 * finish; it is not FAILED, because nothing in the experiment failed; and it is not
 * CANCELLED, because no operator asked for it. Collapsing it into any of those three
 * would misdescribe what happened.
 */
export const INTERRUPTED_STATUS = 'INTERRUPTED' as const;

export interface ReconciledRun {
  run_id: string;
  previous_status: string;
  events_preserved: number;
  opportunities_resolved: number;
}

export interface ReconcileResult {
  checked: number;
  interrupted: ReconciledRun[];
}

/**
 * Marks every non-terminal run as interrupted. Partial data is left exactly as it was
 * written: no event is deleted, no message is removed, and no opportunity that already
 * had a resolution is touched. A dangling opportunity is explicitly classified as an
 * infrastructure interruption so recovery can reopen it without treating silence as
 * agent behaviour; the status and interruption event are then recorded.
 */
export function reconcileInterruptedRuns(db: Db, at = nowIso(), runIds?: string[]): ReconcileResult {
  const candidates = runIds ? runIds.flatMap(id => { const run = getRun(db, id); return run ? [run] : []; }) : listRuns(db);
  const stale = candidates.filter(
    (run) => run.status === 'CREATED' || run.status === 'RUNNING',
  );

  const interrupted: ReconciledRun[] = [];

  const apply = db.transaction((): void => {
    for (const run of stale) {
      const dangling = getOpportunities(db, run.run_id).filter((o) => o.resolution === null);

      for (const opportunity of dangling) {
        // An interrupted turn is an infrastructure failure, never an abstention. The
        // agent was never given the chance to stay silent, so silence here says
        // nothing about its behaviour.
        db.prepare(
          `UPDATE opportunities
              SET resolution = 'infrastructure_failure',
                  failure_category = 'interrupted',
                  behaviourally_available = 0,
                  resolved_at = ?
            WHERE opportunity_id = ?`,
        ).run(at, opportunity.opportunity_id);
      }

      const lastSequence =
        (
          db
            .prepare(`SELECT MAX(sequence) AS seq FROM events WHERE run_id = ?`)
            .get(run.run_id) as { seq: number | null }
        ).seq ?? 0;

      const eventCount = (
        db.prepare(`SELECT COUNT(*) AS c FROM events WHERE run_id = ?`).get(run.run_id) as {
          c: number;
        }
      ).c;

      const lastState =
        (
          db
            .prepare(
              `SELECT workshop_state FROM events WHERE run_id = ? ORDER BY sequence DESC LIMIT 1`,
            )
            .get(run.run_id) as { workshop_state: string } | undefined
        )?.workshop_state ?? run.status;

      db.prepare(
        `INSERT INTO events (event_id, run_id, experiment_id, config_hash, sequence, timestamp,
           elapsed_ms, event_type, workshop_state, agent_id, channel, parent_event_id,
           causal_event_ids, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'run_interrupted', ?, NULL, NULL, NULL, '[]', ?)`,
      ).run(
        newEventId(),
        run.run_id,
        run.experiment_id,
        run.config_hash,
        lastSequence + 1,
        at,
        0,
        lastState,
        JSON.stringify({
          detected_at: at,
          previous_status: run.status,
          reason: 'process restarted while the run was still executing',
          events_preserved: eventCount,
          opportunities_resolved: dangling.length,
        }),
      );

      db.prepare(
        `UPDATE runs
            SET status = ?,
                termination_reason = 'interrupted',
                failure_reason = ?,
                ended_at = COALESCE(ended_at, ?)
          WHERE run_id = ?`,
      ).run(
        INTERRUPTED_STATUS,
        'the process executing this run stopped before the workshop reached a terminal state',
        at,
        run.run_id,
      );

      interrupted.push({
        run_id: run.run_id,
        previous_status: run.status,
        events_preserved: eventCount,
        opportunities_resolved: dangling.length,
      });
    }
  });

  apply();

  return { checked: stale.length, interrupted };
}
