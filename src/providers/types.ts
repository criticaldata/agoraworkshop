import type { ExperimentConfig, WorkshopState } from '../config/schema.js';
import type { InfrastructureFailure } from '../events/types.js';

export interface AgentInvocationRequest {
  invocationId: string;
  agentId: string;
  attempt: number;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  model: ExperimentConfig['model'];
  timeoutMs: number;
  /** Present so a scripted agent can pick its line. Model adapters ignore it. */
  workshopState?: WorkshopState;
}

export interface AgentInvocationResult {
  ok: boolean;
  provider: string;
  requestedModel: string;
  respondedModel: string | null;
  requestTs: string;
  responseTs: string;
  latencyMs: number;
  finishReason: string | null;
  content: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null };
  failure: { category: InfrastructureFailure; message: string } | null;
  /** Provider metadata that is safe to persist. Never contains credentials. */
  raw: Record<string, unknown>;
}

export interface AgentProvider {
  readonly name: string;
  invoke(request: AgentInvocationRequest): Promise<AgentInvocationResult>;
}

export function failureResult(
  provider: string,
  request: AgentInvocationRequest,
  requestTs: string,
  startedAt: number,
  category: InfrastructureFailure,
  message: string,
  raw: Record<string, unknown> = {},
): AgentInvocationResult {
  const responseTs = new Date().toISOString();
  return {
    ok: false,
    provider,
    requestedModel: request.model.model,
    respondedModel: null,
    requestTs,
    responseTs,
    latencyMs: Date.now() - startedAt,
    finishReason: null,
    content: null,
    usage: { inputTokens: null, outputTokens: null },
    failure: { category, message },
    raw,
  };
}
