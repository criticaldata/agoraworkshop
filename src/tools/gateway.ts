import type { ExperimentConfig } from '../config/schema.js';
import type { ToolGatewayRequest, ToolGatewayResult } from './types.js';

type StructuredEntry = Exclude<ExperimentConfig['capabilities']['manifest'][number], string>;

/** Phase 0.1's deterministic, allow-listed tool boundary. */
export class ToolGateway {
  execute(request: ToolGatewayRequest): ToolGatewayResult {
    const entry = request.manifest.find(
      (candidate): candidate is StructuredEntry =>
        typeof candidate !== 'string' && candidate.id === request.toolId,
    );
    if (!entry || !entry.allowed_agents.includes(request.agentId)) {
      return {
        ok: false,
        category: 'permission_denied',
        message: `tool ${request.toolId} is not authorized for agent ${request.agentId}`,
      };
    }

    if ((request.callsUsed ?? 0) >= entry.max_calls_per_opportunity) {
      return {
        ok: false,
        category: 'permission_denied',
        message: `tool ${request.toolId} exceeded max_calls_per_opportunity for this opportunity`,
      };
    }

    if (request.toolId !== 'echo') {
      return {
        ok: false,
        category: 'provider_error',
        message: `tool ${request.toolId} has no Phase 0.1 deterministic implementation`,
      };
    }

    return { ok: true, resultScope: entry.result_scope, result: { ...request.input } };
  }
}
