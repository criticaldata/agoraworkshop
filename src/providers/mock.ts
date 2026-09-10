import { createHash } from 'node:crypto';
import { mockPositionContent } from '../phase1/positions.js';
import type { AgentInvocationRequest, AgentInvocationResult, AgentProvider } from './types.js';

/**
 * Deterministic stand-in provider. Used by the test suite and by cheap smoke runs so
 * the runtime can be exercised without spending tokens. Output depends only on the
 * agent id and the rendered context, so repeated runs of the same config produce the
 * same text — useful for asserting on routing and provenance without stochasticity.
 */
export class MockProvider implements AgentProvider {
  readonly name = 'mock';

  constructor(private readonly latencyMs = 0) {}

  async invoke(request: AgentInvocationRequest): Promise<AgentInvocationResult> {
    const requestTs = new Date().toISOString();
    const startedAt = Date.now();
    if (this.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.latencyMs));
    }

    const seed = createHash('sha256')
      .update(request.agentId)
      .update(String(request.messages.length))
      .update(request.messages.at(-1)?.content ?? '')
      .digest('hex');

    const content = mockPositionContent(request) ??
      `[${request.agentId}] ${PHRASES[parseInt(seed.slice(0, 4), 16) % PHRASES.length]} ` +
      `(context depth ${request.messages.length}, seed ${seed.slice(0, 8)})`;

    const responseTs = new Date().toISOString();
    return {
      ok: true,
      provider: this.name,
      requestedModel: request.model.model,
      respondedModel: request.model.model,
      requestTs,
      responseTs,
      latencyMs: Date.now() - startedAt,
      finishReason: 'end_turn',
      content,
      usage: {
        inputTokens: request.messages.reduce((n, m) => n + Math.ceil(m.content.length / 4), 0),
        outputTokens: Math.ceil(content.length / 4),
      },
      failure: null,
      raw: { deterministic: true, seed: seed.slice(0, 16) },
    };
  }
}

const PHRASES = [
  'Redesign should start from what suffering is avoidable rather than what capability is impressive.',
  'Any redesign proposal needs a stated decision procedure before it needs a target.',
  'I would keep variance high; homogeneity looks efficient and fails badly.',
  'The interesting constraint is reversibility, not optimality.',
  'I want to separate claims about values from claims about mechanism here.',
  'Before answering, note that we are optimising a proxy none of us chose.',
];
