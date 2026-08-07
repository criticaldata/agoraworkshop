import type { ExperimentConfig, WorkshopState } from '../config/schema.js';
import { displayName } from '../config/schema.js';
import { isVisibleTo, type StoredMessage } from './visibility.js';
import {
  moderatorSystemPrompt,
  participantSystemPrompt,
  turnInstruction,
  type TurnInstructionInput,
} from '../prompts/registry.js';

export interface AssembledContext {
  systemPrompt: string;
  promptVersion: string;
  /** Exactly what will be sent to the provider, minus credentials. */
  renderedMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  includedMessageIds: string[];
  publicMessageIds: string[];
  privateMessageIds: string[];
  turnInstruction: string;
}

export interface AssembleContextInput {
  config: ExperimentConfig;
  history: StoredMessage[];
  agentId: string;
  state: WorkshopState;
  roundIndex: number;
  totalRounds: number;
  channel: 'public' | 'private';
  breakoutGroupId?: string;
  breakoutMembers?: string[];
}

/**
 * Builds the exact context an agent is exposed to for one turn.
 *
 * Phase 0 uses raw context assembly rather than summarisation: the raw messages are
 * authoritative, and nothing derived is inserted into an agent's view. Public and
 * private histories stay logically separate right up to the point of rendering, and
 * both the ids and the rendered text are recorded so "what exactly did agent 2 see
 * when it produced message 37" is answerable from storage alone.
 */
export function assembleContext(input: AssembleContextInput): AssembledContext {
  const { config, agentId, state } = input;
  const isModerator = agentId === config.moderator.id;
  const policy = config.context_policy;

  const visible = input.history.filter((message) => {
    if (!isVisibleTo(config, message, agentId)) return false;
    if (message.channel === 'public' && !policy.include_public_history) return false;
    if (message.channel === 'private' && !policy.include_own_private) return false;
    return true;
  });

  const ordered = [...visible].sort((a, b) => a.sequence - b.sequence);
  const trimmed =
    policy.max_messages === null ? ordered : ordered.slice(-policy.max_messages);

  const prompt = isModerator
    ? moderatorSystemPrompt(config)
    : participantSystemPrompt(config, agentId);

  const instructionInput: TurnInstructionInput = {
    config,
    state,
    agentId,
    isModerator,
    roundIndex: input.roundIndex,
    totalRounds: input.totalRounds,
    channel: input.channel,
    breakoutGroupId: input.breakoutGroupId,
    breakoutMembers: input.breakoutMembers,
  };
  const instruction = turnInstruction(instructionInput);

  const transcript =
    trimmed.length === 0
      ? 'No messages have been sent yet. You are opening the workshop.'
      : trimmed.map((message) => renderMessage(config, message)).join('\n\n');

  // A single user turn carrying transcript + instruction. Assistant-turn prefills are
  // not used: current Claude models reject them, and they would blur the line between
  // what the runtime asserted and what the agent produced.
  const renderedMessages: AssembledContext['renderedMessages'] = [
    {
      role: 'user',
      content: [
        `WORKSHOP PHASE: ${state}`,
        ``,
        `TRANSCRIPT SO FAR (oldest first):`,
        transcript,
        ``,
        `YOUR TURN:`,
        instruction,
      ].join('\n'),
    },
  ];

  return {
    systemPrompt: prompt.text,
    promptVersion: prompt.version,
    renderedMessages,
    includedMessageIds: trimmed.map((m) => m.message_id),
    publicMessageIds: trimmed.filter((m) => m.channel === 'public').map((m) => m.message_id),
    privateMessageIds: trimmed.filter((m) => m.channel === 'private').map((m) => m.message_id),
    turnInstruction: instruction,
  };
}

function renderMessage(config: ExperimentConfig, message: StoredMessage): string {
  const who = displayName(config, message.sender_agent_id);
  if (message.channel === 'public') {
    return `[#${message.sequence}] (public) ${who}: ${message.content}`;
  }
  const to = message.actual_recipients.map((id) => displayName(config, id)).join(', ');
  return `[#${message.sequence}] (private:${message.breakout_group_id}) ${who} -> ${to}: ${message.content}`;
}
