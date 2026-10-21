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
