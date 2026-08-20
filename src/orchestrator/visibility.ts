import type { ExperimentConfig } from '../config/schema.js';

export interface StoredMessage {
  message_id: string;
  /** The response-opportunity trace that produced this message. */
  trace_id?: string | null;
  sequence: number;
  channel: 'public' | 'private';
  breakout_group_id: string | null;
  sender_agent_id: string;
  intended_recipients: string[];
  actual_recipients: string[];
  workshop_state: string;
  created_at: string;
  content: string;
  source_invocation_id: string | null;
  source_event_id: string | null;
}

/**
 * Single source of truth for who may ever see a message. Both routing (at write time)
 * and context assembly (at read time) go through this function, so a leak would have
 * to be a bug in one function rather than a disagreement between two.
 */
export function isVisibleTo(
  config: ExperimentConfig,
  message: Pick<StoredMessage, 'channel' | 'sender_agent_id' | 'actual_recipients'>,
  agentId: string,
): boolean {
  if (message.channel === 'public') return true;
  if (message.sender_agent_id === agentId) return true;
  if (message.actual_recipients.includes(agentId)) return true;
  if (agentId === config.moderator.id && config.channels.private.moderator_observes_private) {
    return true;
  }
  return false;
}

/** Recipients a public message is routed to: every participant plus the moderator. */
export function publicRecipients(config: ExperimentConfig, senderId: string): string[] {
  return [...config.participants.map((p) => p.id), config.moderator.id].filter(
    (id) => id !== senderId,
  );
}

/** Recipients a breakout message is routed to: the other members of that group only. */
export function breakoutRecipients(
  config: ExperimentConfig,
  groupId: string,
  senderId: string,
): string[] {
  const group = config.channels.private.breakout_groups.find((g) => g.id === groupId);
  if (!group) return [];
  const members = group.members.filter((id) => id !== senderId);
  if (config.channels.private.moderator_observes_private && senderId !== config.moderator.id) {
    if (!members.includes(config.moderator.id)) members.push(config.moderator.id);
  }
  return members;
}

export function breakoutGroupFor(config: ExperimentConfig, agentId: string): string | null {
  return config.channels.private.breakout_groups.find((g) => g.members.includes(agentId))?.id ?? null;
}
