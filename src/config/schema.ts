import { z } from 'zod';

/**
 * The experiment configuration is scientific data, not just wiring. Everything a
 * researcher would need to hold constant between runs lives here, and nothing that
 * affects agent behaviour is allowed to be hardcoded in the orchestrator.
 */

export const WORKSHOP_STATES = [
  'CREATED',
  'INTRODUCTION',
  'PUBLIC_DISCUSSION',
  'PRIVATE_OR_BREAKOUT',
  'FINAL_DISCUSSION',
  'CLOSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;

export type WorkshopState = (typeof WORKSHOP_STATES)[number];

/** States in which an agent may be given a response opportunity. */
export const ACTIVE_STATES = [
  'INTRODUCTION',
  'PUBLIC_DISCUSSION',
  'PRIVATE_OR_BREAKOUT',
  'FINAL_DISCUSSION',
  'CLOSING',
] as const;

export const FAULT_KINDS = [
  'timeout',
  'rate_limit',
  'provider_error',
  'network_error',
  'malformed_response',
] as const;

export type FaultKind = (typeof FAULT_KINDS)[number];

const AgentSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().min(1),
});

const FaultSchema = z.object({
  agent_id: z.string().min(1),
  state: z.enum(ACTIVE_STATES),
  /** Which invocation of this agent, within this state, to fault (1-indexed). */
  occurrence: z.number().int().positive(),
  kind: z.enum(FAULT_KINDS),
  /**
   * Number of *attempts* that fail before the fault clears. `null` means the fault
   * never clears, so the opportunity ends in retry exhaustion.
   */
  recover_after_attempts: z.number().int().positive().nullable(),
});

export const ExperimentConfigSchema = z
  .object({
    experiment_id: z.string().min(1),
    config_version: z.number().int().positive(),

    model: z.object({
      provider: z.enum(['openai', 'anthropic', 'mock']),
      /** Exact provider model identifier. Never substituted at runtime. */
      model: z.string().min(1),
      max_output_tokens: z.number().int().positive(),
      /**
       * Sampling parameters are recorded for provenance. `null` means "not set", and
       * adapters must not silently substitute a provider default for it. The OpenAI
       * adapter omits the field entirely; the Anthropic adapter refuses to start a run
       * that sets them, because current Claude models reject them outright.
       */
      temperature: z.number().nullable(),
      top_p: z.number().nullable(),
      top_k: z.number().int().nullable(),
      seed: z.number().int().nullable(),
      thinking: z.enum(['adaptive', 'disabled']),
      thinking_display: z.enum(['omitted', 'summarized']),
      effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
    }),

    participants: z.array(AgentSchema).min(1),
    /**
     * `mode` is optional and has no default on purpose. A default would be written into
     * every parsed config and would change the config hash of runs already recorded,
     * which would break rerun of those runs. Absent means the historical behaviour:
     * the moderator is a model like any other participant.
     */
    moderator: AgentSchema.extend({ mode: z.enum(['llm', 'scripted']).optional() }),

    workshop: z.object({
      topic: z.string().min(1),
      max_duration_seconds: z.number().int().positive(),
      rounds: z.object({
        introduction: z.number().int().nonnegative(),
        public_discussion: z.number().int().nonnegative(),
        private_or_breakout: z.number().int().nonnegative(),
        final_discussion: z.number().int().nonnegative(),
      }),
    }),

    channels: z.object({
      public: z.object({ enabled: z.boolean() }),
      private: z.object({
        enabled: z.boolean(),
        /** If false, private messages are invisible to the moderator. */
        moderator_observes_private: z.boolean(),
        breakout_groups: z.array(
          z.object({
            id: z.string().min(1),
            members: z.array(z.string().min(1)).min(2),
          }),
        ),
      }),
    }),

    capabilities: z.object({
      tools_enabled: z.boolean(),
      manifest: z.array(z.string()),
    }),

    budgets: z.object({
      max_calls_per_agent: z.number().int().positive(),
      max_tokens_per_agent: z.number().int().positive(),
      /** Fraction of a budget at which a budget_warning event is emitted. */
      warning_threshold: z.number().gt(0).lte(1),
    }),

    runtime: z.object({
      timeout_seconds: z.number().int().positive(),
      max_retries: z.number().int().nonnegative().max(5),
      retry_backoff_ms: z.number().int().nonnegative(),
    }),

    prompts: z.object({
      participant_prompt_version: z.string().min(1),
      moderator_prompt_version: z.string().min(1),
    }),

    context_policy: z.object({
      version: z.string().min(1),
      include_public_history: z.boolean(),
      include_own_private: z.boolean(),
      /** null = include the full raw history (Phase 0 default). */
      max_messages: z.number().int().positive().nullable(),
    }),

    scheduling: z.object({
      /**
       * `rotate_by_round` deterministically rotates the speaking order each round so
       * agent_1 does not always speak first. Still fully deterministic given the config.
       */
      order: z.enum(['config_order', 'rotate_by_round']),
    }),

    fault_injection: z
      .object({
        enabled: z.boolean(),
        faults: z.array(FaultSchema),
      })
      .nullable(),
  })
  .superRefine((cfg, ctx) => {
    const ids = new Set<string>();
    for (const p of cfg.participants) {
      if (ids.has(p.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate participant id: ${p.id}` });
      }
      ids.add(p.id);
    }
    if (ids.has(cfg.moderator.id)) {
      ctx.addIssue({ code: 'custom', message: 'moderator id collides with a participant id' });
    }

    // A scripted moderator makes no provider call, so a fault aimed at it could never
    // fire. Rejecting the config is better than silently not injecting the fault.
    if (cfg.moderator.mode === 'scripted') {
      for (const fault of cfg.fault_injection?.faults ?? []) {
        if (fault.agent_id === cfg.moderator.id) {
          ctx.addIssue({
            code: 'custom',
            message:
              'fault injection targets the moderator, but the moderator is scripted and never ' +
              'calls a provider, so the fault could not occur',
          });
        }
      }
    }

    const known = new Set([...ids, cfg.moderator.id]);
    const seenGroups = new Set<string>();
    for (const group of cfg.channels.private.breakout_groups) {
      if (seenGroups.has(group.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate breakout group id: ${group.id}` });
      }
      seenGroups.add(group.id);
      for (const member of group.members) {
        if (!known.has(member)) {
          ctx.addIssue({
            code: 'custom',
            message: `breakout group ${group.id} references unknown agent: ${member}`,
          });
        }
      }
    }

    for (const fault of cfg.fault_injection?.faults ?? []) {
      if (!known.has(fault.agent_id)) {
        ctx.addIssue({
          code: 'custom',
          message: `fault_injection references unknown agent: ${fault.agent_id}`,
        });
      }
    }

    if (cfg.channels.private.enabled && cfg.channels.private.breakout_groups.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'private channel is enabled but no breakout groups are defined',
      });
    }
  });

export type ExperimentConfig = z.infer<typeof ExperimentConfigSchema>;

export function agentIds(config: ExperimentConfig): string[] {
  return config.participants.map((p) => p.id);
}

export function allAgentIds(config: ExperimentConfig): string[] {
  return [...agentIds(config), config.moderator.id];
}

export function displayName(config: ExperimentConfig, agentId: string): string {
  if (agentId === config.moderator.id) return config.moderator.display_name;
  return config.participants.find((p) => p.id === agentId)?.display_name ?? agentId;
}
