import { describe, expect, it } from 'vitest';
import { reconcileInterruptedRuns } from '../src/orchestrator/reconcile.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { readEvents } from '../src/events/recorder.js';
import { frozen, tempDb } from './helpers.js';

const CUTS = ['before_invocation', 'after_invocation', 'after_message_persisted', 'during_delivery'] as const;

describe('recovery restart matrix', () => {
  for (const cut of CUTS) {
    it(`resumes without duplicating effects when interrupted ${cut.replaceAll('_', ' ')}`, async () => {
      const db = tempDb();
      const config = frozen({ recovery: { enabled: true, checkpoint_every: 'opportunity' } });
      const first = new WorkshopRunner({ db, frozen: config });
      await first.execute();
      const target = db.prepare(
        `SELECT opportunity_id, trace_id, message_id FROM opportunities WHERE run_id = ? ORDER BY sequence DESC LIMIT 1`,
      ).get(first.id) as { opportunity_id: string; trace_id: string; message_id: string | null };
      const targetEvents = readEvents(db, first.id).filter(
        (event) => event.trace_id === target.trace_id,
      );
      const cutEvent = cut === 'before_invocation'
        ? targetEvents.find((event) => event.event_type === 'context_assembled')
        : cut === 'after_invocation'
          ? targetEvents.find((event) => event.event_type === 'agent_invocation_succeeded')
          : cut === 'after_message_persisted'
            ? targetEvents.find((event) => event.event_type === 'message_routed')
            : targetEvents.find((event) => event.event_type === 'message_delivered');
      expect(cutEvent, `missing cut event for ${cut}`).toBeDefined();

      db.prepare(`DELETE FROM events WHERE run_id = ? AND sequence > ?`).run(first.id, cutEvent!.sequence);
      db.prepare(`DELETE FROM state_transitions WHERE run_id = ? AND sequence > ?`).run(first.id, cutEvent!.sequence);
      db.prepare(`DELETE FROM run_checkpoints WHERE run_id = ? AND opportunity_id = ?`).run(first.id, target.opportunity_id);
      db.prepare(
        `UPDATE opportunities SET resolved_at = NULL, resolution = NULL, failure_category = NULL,
           behaviourally_available = 0, attempts = 0 WHERE opportunity_id = ?`,
      ).run(target.opportunity_id);
      db.prepare(
        `UPDATE runs SET status = 'RUNNING', termination_reason = NULL, ended_at = NULL,
           failure_reason = 'matrix interruption' WHERE run_id = ?`,
      ).run(first.id);
      const reconciliation = reconcileInterruptedRuns(db);
      expect(reconciliation.interrupted.map((row) => row.run_id)).toContain(first.id);

      const resumed = new WorkshopRunner({ db, frozen: config, resumeRunId: first.id });
      const result = await resumed.execute();
      const opportunities = db.prepare(
        `SELECT opportunity_id, resolution, message_id FROM opportunities WHERE run_id = ? ORDER BY sequence`,
      ).all(first.id) as Array<{ opportunity_id: string; resolution: string; message_id: string | null }>;
      const deliveryKeys = readEvents(db, first.id)
        .filter((event) => event.event_type === 'message_delivered' || event.event_type === 'private_message_delivered')
        .map((event) => `${event.payload['message_id']}::${event.agent_id}`);

      expect(result.status).toBe('COMPLETED');
      expect(opportunities.every((row) => row.resolution !== null)).toBe(true);
      expect(new Set(opportunities.map((row) => row.opportunity_id)).size).toBe(opportunities.length);
      expect(new Set(deliveryKeys).size).toBe(deliveryKeys.length);
      if (cut !== 'before_invocation') {
        expect(opportunities.at(-1)?.message_id).toBe(target.message_id);
      }
    });
  }
});
