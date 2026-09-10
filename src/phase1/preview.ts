import type { ExperimentConfig, WorkshopState } from '../config/schema.js';
import { plannedStates } from '../orchestrator/stateMachine.js';
import { turnInstruction, type TurnInstructionInput } from '../prompts/registry.js';

/** Static instruction catalogue, not a fabricated future transcript. The runner's
 * actual invocations remain the authority for dynamic history and scheduling. */
export function previewInstructions(config: ExperimentConfig) {
  const instructions: { agent_id: string; state: WorkshopState; round: number; channel: string; text: string }[] = [];
  for (const state of plannedStates(config.workshop.rounds)) {
    const rounds = state === 'CLOSING' ? 1 : config.workshop.rounds[state.toLowerCase() as keyof typeof config.workshop.rounds];
    for (let round = 0; round < rounds; round++) {
      const add = (input: Omit<TurnInstructionInput, 'config' | 'state' | 'roundIndex' | 'totalRounds'>) => instructions.push({ agent_id: input.agentId, state, round, channel: input.channel, text: turnInstruction({ ...input, config, state, roundIndex: round, totalRounds: rounds }) });
      if (round === 0 || state === 'PUBLIC_DISCUSSION') add({ agentId: config.moderator.id, isModerator: true, channel: 'public' });
      if (state === 'CLOSING') continue;
      for (const p of config.participants) {
        const group = config.channels.private.breakout_groups.find(g => g.members.includes(p.id));
        if (state === 'PRIVATE_OR_BREAKOUT') {
          if (group) add({ agentId: p.id, isModerator: false, channel: 'private', breakoutGroupId: group.id, breakoutMembers: group.members });
        } else add({ agentId: p.id, isModerator: false, channel: 'public' });
      }
    }
  }
  return instructions;
}
