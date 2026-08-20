import { createHash } from 'node:crypto';
import { canonicalize } from '../config/hash.js';
import type { AgentInvocationRequest, AgentInvocationResult, AgentProvider } from './types.js';

const hash = (value: unknown): string =>
  `sha256:${createHash('sha256').update(canonicalize(value), 'utf8').digest('hex')}`;

/**
 * A deterministic receipt of the context authorized for an invocation. It does not
 * model understanding or deliberation; it detects wrong/missing context wiring.
 */
export class MockContextContractProvider implements AgentProvider {
  readonly name = 'mock_context_contract';

  async invoke(request: AgentInvocationRequest): Promise<AgentInvocationResult> {
    const ts = new Date().toISOString();
    const receipt = {
      kind: 'mock_context_contract',
      trace_id: request.traceId ?? null,
      config_hash: request.configHash ?? null,
      agent_id: request.agentId,
      attempt: request.attempt,
      system_hash: hash(request.system),
      rendered_messages_hash: hash(request.messages),
      context_message_ids: request.contextMessageIds ?? [],
      summary_ids: request.summaryIds ?? [],
      summary_hashes: request.summaryHashes ?? [],
      capability_manifest_hash: hash(request.capabilityManifest ?? []),
    };

    return {
      ok: true,
      provider: this.name,
      requestedModel: request.model.model,
      respondedModel: request.model.model,
      requestTs: ts,
      responseTs: ts,
      latencyMs: 0,
      finishReason: 'context_contract',
      content: canonicalize(receipt),
      usage: { inputTokens: 0, outputTokens: 0 },
      failure: null,
      raw: { context_contract: receipt },
    };
  }
}
