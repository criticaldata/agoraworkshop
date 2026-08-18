import type { ExperimentConfig } from '../config/schema.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { MockProvider } from './mock.js';
import { FaultInjectingProvider } from './faultInjection.js';
import type { AgentProvider } from './types.js';

function baseProvider(config: ExperimentConfig): AgentProvider {
  switch (config.model.provider) {
    case 'openai':
      return new OpenAIProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'mock':
      return new MockProvider();
    case 'mock_context_contract':
      throw new Error('mock_context_contract is not available until the Phase 0.1 provider is installed');
  }
}

export function buildProvider(config: ExperimentConfig): {
  provider: AgentProvider;
  faults: FaultInjectingProvider | null;
} {
  const base = baseProvider(config);

  if (config.fault_injection?.enabled) {
    const faults = new FaultInjectingProvider(base, config);
    return { provider: faults, faults };
  }
  return { provider: base, faults: null };
}
