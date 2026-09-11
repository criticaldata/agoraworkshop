import { z } from 'zod';

/** Opt-in, no defaults: old frozen manifests must retain their exact hashes. */
export const CanonicalProtocolSchema = z.object({
  version: z.literal('canonical-eight-stage-v1'),
  voting_rule: z.literal('single_choice_absolute_majority_v1'),
  ballot_attempt_policy: z.literal('single_attempt_no_repair'),
  final_output: z.literal('deterministic_collective_artifact_v1'),
  reconvening_rounds: z.literal(1),
}).strict();

export const CANONICAL_PROTOCOL: z.infer<typeof CanonicalProtocolSchema> = {
  version: 'canonical-eight-stage-v1', voting_rule: 'single_choice_absolute_majority_v1',
  ballot_attempt_policy: 'single_attempt_no_repair', final_output: 'deterministic_collective_artifact_v1',
  reconvening_rounds: 1,
};
export const STAGES = [
  ['S1', 'Independent Initial Position'], ['S2', 'Public Plenary I'],
  ['S3', 'Private Rooms / Breakouts'], ['S4', 'Public Reconvening'],
  ['S5', 'Public Plenary II'], ['S6', 'Independent Final Position'],
  ['S7', 'Sealed Collective Outcome'], ['S8', 'Structured Final Output'],
] as const;

export interface BreakoutAssignment {
  id: string;
  members: string[];
}

/** Independent topology check used by the canonical protocol and its tests. */
export function validateBreakoutAssignment(
  assignments: BreakoutAssignment[],
  participantIds: string[],
  moderatorId: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const expected = new Set(participantIds);
  if (assignments.length !== 2) errors.push('exactly two breakout groups are required');
  if (new Set(assignments.map(group => group.id)).size !== assignments.length) errors.push('breakout group IDs must be unique');
  const members = assignments.flatMap(group => group.members);
  if (members.some(member => member === moderatorId)) errors.push('moderator cannot be a breakout member');
  if (members.some(member => !expected.has(member))) errors.push('breakout contains an unknown participant');
  if (new Set(members).size !== members.length) errors.push('each participant must appear in exactly one group');
  if (members.length !== participantIds.length || participantIds.some(id => !members.includes(id))) errors.push('every participant must appear exactly once');
  const sizes = assignments.map(group => group.members.length).sort((a, b) => a - b);
  if (sizes.join(',') !== '2,3') errors.push('canonical breakouts must be disjoint 2+3 groups');
  return { valid: errors.length === 0, errors };
}
