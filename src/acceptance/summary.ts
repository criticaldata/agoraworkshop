import { getMessages } from '../db/queries.js';
import { readEvents } from '../events/recorder.js';
import type { Db } from '../db/index.js';
import { auditPrivacyLeaks, type AcceptanceReport, type GateStatus } from './gates.js';

/**
 * The four questions Phase 0 exists to answer, in the words they were asked in.
 *
 * The acceptance report is organised by gate, which is how the checks run; this is
 * organised by question, which is how they were commissioned. Nothing new is judged
 * here. Routing and privacy are read from the same records, under the same rules, as the
 * infrastructure gate; failure attribution and reproducibility are the gates of those
 * names, unchanged.
 *
 * A question with nothing to judge reports NOT_EXERCISED and is never drawn as a tick.
 * An untested separation and a working one look nothing alike, and the difference is the
 * whole point of the exercise.
 */
export interface Phase0Check {
  key: 'routing' | 'privacy' | 'failure_attribution' | 'reproducibility';
  question: string;
  status: GateStatus;
  /** One line of evidence, in counts rather than adjectives. */
  detail: string;
}

export function phase0Summary(
  db: Db,
  runId: string,
  report: AcceptanceReport,
): Phase0Check[] {
  return [
    routingCheck(db, runId),
    privacyCheck(db, runId),
    {
      key: 'failure_attribution',
      question: 'Can a failure of the apparatus be told apart from an agent staying silent?',
      status: report.gates.failure_attribution_validated.status,
      detail: firstLine(report.gates.failure_attribution_validated),
    },
    {
      key: 'reproducibility',
      question: 'Does the same configuration produce the same run again?',
      status: report.gates.baseline_reproducible.status,
      detail: firstLine(report.gates.baseline_reproducible),
    },
  ];
}

function routingCheck(db: Db, runId: string): Phase0Check {
  const question = 'Did every message reach the participants it was addressed to?';
  const messages = getMessages(db, runId);
  const delivered = readEvents(db, runId).filter(
    (e) =>
      e.event_type === 'message_delivered' || e.event_type === 'private_message_delivered',
  );

  if (messages.length === 0) {
    return {
      key: 'routing',
      question,
      status: 'NOT_EXERCISED',
      detail: 'No messages were sent, so routing was never tested.',
    };
  }

  const misrouted = messages.filter((m) => m.actual_recipients.length === 0);
  if (misrouted.length > 0 || delivered.length === 0) {
    return {
      key: 'routing',
      question,
      status: 'FAIL',
      detail:
        delivered.length === 0
          ? `${messages.length} messages sent and no delivery was recorded.`
          : `${misrouted.length} of ${messages.length} messages reached nobody.`,
    };
  }

  return {
    key: 'routing',
    question,
    status: 'PASS',
    detail: `${messages.length} messages sent, ${delivered.length} deliveries recorded, none reached nobody.`,
  };
}

function privacyCheck(db: Db, runId: string): Phase0Check {
  const question = 'Did anything said in a breakout reach an agent outside it?';
  const privateMessages = getMessages(db, runId).filter((m) => m.channel === 'private');

  if (privateMessages.length === 0) {
    return {
      key: 'privacy',
      question,
      status: 'NOT_EXERCISED',
      detail: 'Nothing was said privately in this run, so separation was never tested.',
    };
  }

  const leaks = auditPrivacyLeaks(db, runId);
  if (leaks.violations.length > 0) {
    return {
      key: 'privacy',
      question,
      status: 'FAIL',
      detail: `${leaks.violations.length} private messages appeared in the context of an agent outside the breakout.`,
    };
  }

  return {
    key: 'privacy',
    question,
    status: 'PASS',
    detail:
      `${privateMessages.length} private messages; visibility was re-derived for ` +
      `${leaks.contextReferencesChecked} context references across ${leaks.invocationsChecked} ` +
      'model calls, with no leak.',
  };
}

/**
 * What to show for a gate in one line.
 *
 * A failure outranks a gap, and a gap outranks evidence: the summary must never lead
 * with the reassuring half of a mixed result.
 */
function firstLine(gate: {
  evidence: string[];
  failures: string[];
  not_exercised: string[];
}): string {
  const line =
    gate.failures[0] ?? gate.not_exercised[0] ?? gate.evidence[0] ?? 'Nothing recorded.';
  return line.charAt(0).toUpperCase() + line.slice(1) + (line.endsWith('.') ? '' : '.');
}
