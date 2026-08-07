import type { ExperimentConfig } from '../config/schema.js';
import { AnthropicProvider } from './anthropic.js';
import { MockProvider } from './mock.js';
import { FaultInjectingProvider } from './faultInjection.js';
import type { AgentProvider } from './types.js';

export function buildProvider(config: ExperimentConfig): {
  provider: AgentProvider;
  faults: FaultInjectingProvider | null;
} {
  const base: AgentProvider =
    config.model.provider === 'anthropic' ? new AnthropicProvider() : new MockProvider();

  if (config.fault_injection?.enabled) {
    const faults = new FaultInjectingProvider(base, config);
    return { provider: faults, faults };
  }
  return { provider: base, faults: null };
}
