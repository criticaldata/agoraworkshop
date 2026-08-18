import type { ExperimentConfig } from '../config/schema.js';
import type { InfrastructureFailure } from '../events/types.js';

export interface ToolGatewayRequest {
  agentId: string;
  toolId: string;
  input: Record<string, unknown>;
  manifest: ExperimentConfig['capabilities']['manifest'];
}

export type ToolGatewayResult =
  | { ok: true; resultScope: 'public' | 'private'; result: Record<string, unknown> }
  | { ok: false; category: InfrastructureFailure; message: string };

