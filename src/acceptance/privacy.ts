import type { Db } from '../db/index.js';
import { getInvocations, getMessages, getRun, runConfig } from '../db/queries.js';
import { isVisibleTo } from '../orchestrator/visibility.js';

/**
 * Re-derived privacy evidence, kept in its own module so that both the gate report and
 * the individual acceptance metrics can use it without importing each other.
 */
export interface LeakAudit {
  invocationsChecked: number;
  contextReferencesChecked: number;
  violations: Array<{
    invocation_id: string;
    agent_id: string;
    message_id: string;
    reason: string;
  }>;
}

/**
 * Recomputes, from stored data alone, whether any agent was ever exposed to a message
 * it was not authorised to see. This is the strongest available evidence that
 * public/private separation held, because it re-derives visibility rather than
 * trusting the routing decision that was made at the time.
 */
export function auditPrivacyLeaks(db: Db, runId: string): LeakAudit {
  const run = getRun(db, runId);
  if (!run) throw new Error(`unknown run: ${runId}`);
  const config = runConfig(run);

  const messages = new Map(getMessages(db, runId).map((m) => [m.message_id, m]));
  const invocations = getInvocations(db, runId);

  const violations: LeakAudit['violations'] = [];
  let references = 0;

  for (const invocation of invocations) {
    const ids = JSON.parse(invocation.context_message_ids) as string[];
    for (const id of ids) {
      references += 1;
      const message = messages.get(id);
      if (!message) {
        violations.push({
          invocation_id: invocation.invocation_id,
          agent_id: invocation.agent_id,
          message_id: id,
          reason: 'context referenced a message that is not in the message store',
        });
        continue;
      }
      if (!isVisibleTo(config, message, invocation.agent_id)) {
        violations.push({
          invocation_id: invocation.invocation_id,
          agent_id: invocation.agent_id,
          message_id: id,
          reason: `agent was exposed to a ${message.channel} message it is not authorised to see`,
        });
      }
    }
  }

  return { invocationsChecked: invocations.length, contextReferencesChecked: references, violations };
}
