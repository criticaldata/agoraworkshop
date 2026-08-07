import type { ExperimentConfig, FaultKind, WorkshopState } from '../config/schema.js';
import type { InfrastructureFailure } from '../events/types.js';
import {
  failureResult,
  type AgentInvocationRequest,
  type AgentInvocationResult,
  type AgentProvider,
} from './types.js';

const FAULT_TO_CATEGORY: Record<FaultKind, InfrastructureFailure> = {
  timeout: 'timeout',
  rate_limit: 'rate_limit',
  provider_error: 'provider_error',
  network_error: 'network_error',
  malformed_response: 'malformed_response',
};

export interface FaultContext {
  state: WorkshopState;
  /** Which invocation of this agent within this state, 1-indexed. */
  occurrence: number;
}

/**
 * Wraps any provider and deterministically injects infrastructure failures declared
 * in the config. This exists so a demo run can *prove* that infrastructure failure is
 * recorded distinctly from behavioural abstention, without waiting for a real outage.
 *
 * Because the fault plan lives in the config, it is part of the config hash: a run
 * with injected faults can never be confused with a clean baseline run.
 */
export class FaultInjectingProvider implements AgentProvider {
  readonly name: string;
  private context: FaultContext = { state: 'CREATED' as WorkshopState, occurrence: 0 };

  constructor(
    private readonly inner: AgentProvider,
    private readonly config: ExperimentConfig,
  ) {
    this.name = `${inner.name}+faults`;
  }

  setContext(context: FaultContext): void {
    this.context = context;
  }

  async invoke(request: AgentInvocationRequest): Promise<AgentInvocationResult> {
    const injection = this.config.fault_injection;
    if (injection?.enabled) {
      const fault = injection.faults.find(
        (f) =>
          f.agent_id === request.agentId &&
          f.state === this.context.state &&
          f.occurrence === this.context.occurrence,
      );
      const clears =
        fault?.recover_after_attempts !== null &&
        fault !== undefined &&
        request.attempt > fault.recover_after_attempts;

      if (fault && !clears) {
        const requestTs = new Date().toISOString();
        const startedAt = Date.now();
        return failureResult(
          this.inner.name,
          request,
          requestTs,
          startedAt,
          FAULT_TO_CATEGORY[fault.kind],
          `injected fault: ${fault.kind} (attempt ${request.attempt})`,
          { injected: true, fault_kind: fault.kind, occurrence: fault.occurrence },
        );
      }
    }
    return this.inner.invoke(request);
  }
}
