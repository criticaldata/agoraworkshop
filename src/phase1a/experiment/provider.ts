import type { Phase1aProvider, ProviderCallSpec, ProviderResponse, Outcome } from '../index.js';
import type { ExperimentPlan } from './plan.js';

export interface ResolvedEndpoint { provider: string; url: string; credential?: string }
export function resolveEndpoints(plan: ExperimentPlan, env: NodeJS.ProcessEnv = process.env): ResolvedEndpoint[] {
  return plan.endpoints.map(endpoint => {
    const value = env[endpoint.endpoint_ref.slice(4)];
    if (!value) throw new Error(`Missing endpoint ${endpoint.endpoint_ref}`);
    const url = new URL(value);
    if (endpoint.expected_url && url.href !== new URL(endpoint.expected_url).href) throw new Error(`Endpoint address differs from approved plan: ${endpoint.provider}`);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/chat/completions')) throw new Error(`Endpoint must be HTTPS (or loopback HTTP), without embedded credentials, and end in /chat/completions: ${endpoint.provider}`);
    const credential = endpoint.credential_env ? env[endpoint.credential_env] : undefined;
    if (endpoint.credential_env && !credential) throw new Error(`Missing credential environment variable ${endpoint.credential_env}`);
    return { provider: endpoint.provider, url: url.href, credential };
  });
}

/** One network request per invocation; retries belong to the evidence runtime. */
export class ChatCompletionsProvider implements Phase1aProvider {
  haltedReason: string | null = null;
  constructor(private readonly endpoints: ResolvedEndpoint[], private readonly timeoutMs: number, private readonly fetcher: typeof fetch = fetch) {}
  async invoke(spec: ProviderCallSpec): Promise<ProviderResponse> {
    const result = (outcome: Outcome, raw: Record<string, unknown>, extra: Partial<ProviderResponse> = {}): ProviderResponse => ({ outcome, provider: spec.provider, model: spec.model, content: null, usage: null, finishReason: null, raw, ...extra });
    if (this.haltedReason) return result('invalid_response', { transport_stop: this.haltedReason, request_sent: false });
    const endpoint = this.endpoints.find(e => e.provider === spec.provider);
    if (!endpoint) throw new Error('No endpoint for requested provider');
    const allowed = new Set(['temperature', 'top_p', 'max_tokens', 'seed']);
    if (Object.keys(spec.configuration).some(k => !allowed.has(k))) throw new Error('Unsupported generation parameter; no request sent');
    const request = { ...spec.configuration, model: spec.model, stream: false, n: 1, messages: [{ role: 'system', content: spec.systemPrompt }, ...spec.context.map(({ role, content }) => ({ role, content })), { role: 'user', content: spec.userPrompt }] };
    let response: Response;
    try {
      response = await this.fetcher(endpoint.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(endpoint.credential ? { Authorization: `Bearer ${endpoint.credential}` } : {}) }, body: JSON.stringify(request), signal: AbortSignal.timeout(this.timeoutMs), redirect: 'error' });
    } catch (error) {
      this.haltedReason = 'Network completion and token usage are unknown; operator reconciliation required';
      return result(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'provider_error', { transport_stop: this.haltedReason });
    }
    if (!response.ok) {
      // Do not archive potentially secret-bearing proxy error bodies.
      const outcome: Outcome = response.status === 401 || response.status === 403 ? 'permission_denied' : response.status === 429 ? 'rate_limit' : 'provider_error';
      if (![401, 403, 429].includes(response.status)) this.haltedReason = 'HTTP failure with unknown token usage';
      return result(outcome, { http_status: response.status, transport_stop: this.haltedReason }, { usage: [401, 403, 429].includes(response.status) ? { inputTokens: 0, outputTokens: 0 } : null });
    }
    let data: any;
    try { data = await response.json(); } catch { this.haltedReason = 'Non-JSON response with unknown token usage'; return result('invalid_response', { transport_stop: this.haltedReason }); }
    if (endpoint.credential) data = JSON.parse(JSON.stringify(data).split(endpoint.credential).join('[REDACTED]'));
    const usage = data?.usage;
    const knownUsage = Number.isSafeInteger(usage?.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isSafeInteger(usage?.completion_tokens) && usage.completion_tokens >= 0;
    if (!knownUsage) this.haltedReason = 'Missing or invalid token accounting';
    const raw = { http_status: response.status, response: data, transport_stop: this.haltedReason };
    const choice = data?.choices?.[0];
    if (!knownUsage || data?.model !== spec.model || !Array.isArray(data?.choices) || data.choices.length !== 1) {
      this.haltedReason ??= 'Unexpected model identity or response shape';
      return result('invalid_response', { ...raw, transport_stop: this.haltedReason });
    }
    const refusal = choice?.message?.refusal;
    const content = typeof refusal === 'string' && refusal.trim() ? refusal : choice?.message?.content;
    const accounting = { inputTokens: usage.prompt_tokens as number, outputTokens: usage.completion_tokens as number };
    if (typeof content !== 'string' || !content.trim() || choice?.message?.tool_calls?.length || typeof choice?.finish_reason !== 'string') return result('invalid_response', raw, { usage: accounting });
    // Free-form abstention/position semantics remain human-coded; never guessed by a regex.
    return result(typeof refusal === 'string' && refusal.trim() ? 'refused' : 'success', raw, { content, usage: accounting, finishReason: choice.finish_reason });
  }
}
