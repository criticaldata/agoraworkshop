import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, type Db } from '../src/db/index.js';
import { freezeConfig, type FrozenConfig } from '../src/config/load.js';

export function tempDb(): Db {
  const dir = mkdtempSync(join(tmpdir(), 'agora-test-'));
  return openDatabase(join(dir, 'agora.sqlite'));
}

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'agora-out-'));
}

/** A small, fast configuration used across the test suite. */
export function baseConfigObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    experiment_id: 'agora_test',
    config_version: 1,
    model: {
      provider: 'mock',
      model: 'mock-deterministic-v1',
      max_output_tokens: 128,
      temperature: null,
      top_p: null,
      top_k: null,
      seed: null,
      thinking: 'disabled',
      thinking_display: 'omitted',
      effort: 'low',
    },
    participants: [
      { id: 'agent_1', display_name: 'Agent 1' },
      { id: 'agent_2', display_name: 'Agent 2' },
      { id: 'agent_3', display_name: 'Agent 3' },
      { id: 'agent_4', display_name: 'Agent 4' },
      { id: 'agent_5', display_name: 'Agent 5' },
    ],
    moderator: { id: 'moderator', display_name: 'Moderator' },
    workshop: {
      topic: 'How should humans be redesigned?',
      max_duration_seconds: 120,
      rounds: {
        introduction: 1,
        public_discussion: 1,
        private_or_breakout: 1,
        final_discussion: 1,
      },
    },
    channels: {
      public: { enabled: true },
      private: {
        enabled: true,
        moderator_observes_private: false,
        breakout_groups: [
          { id: 'breakout_a', members: ['agent_1', 'agent_2'] },
          { id: 'breakout_b', members: ['agent_3', 'agent_4', 'agent_5'] },
        ],
      },
    },
    capabilities: { tools_enabled: false, manifest: [] },
    budgets: { max_calls_per_agent: 20, max_tokens_per_agent: 100000, warning_threshold: 0.8 },
    runtime: { timeout_seconds: 5, max_retries: 2, retry_backoff_ms: 0 },
    prompts: { participant_prompt_version: 'v1', moderator_prompt_version: 'v1' },
    context_policy: {
      version: 'v1',
      include_public_history: true,
      include_own_private: true,
      max_messages: null,
    },
    scheduling: { order: 'rotate_by_round' },
    fault_injection: null,
    ...overrides,
  };
}

export function frozen(overrides: Record<string, unknown> = {}): FrozenConfig {
  return freezeConfig(baseConfigObject(overrides));
}
