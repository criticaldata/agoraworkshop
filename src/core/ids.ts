import { randomUUID } from 'node:crypto';

export const newRunId = (): string => `run_${randomUUID()}`;
export const newEventId = (): string => `evt_${randomUUID()}`;
export const newOpportunityId = (): string => `opp_${randomUUID()}`;
export const newTraceId = (): string => `trace_${randomUUID()}`;
export const newInvocationId = (): string => `inv_${randomUUID()}`;
export const newMessageId = (): string => `msg_${randomUUID()}`;

export function nowIso(): string {
  return new Date().toISOString();
}
