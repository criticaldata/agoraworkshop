import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type NvidiaVllmProbeFailureCategory =
  | 'missing_base_url'
  | 'timeout'
  | 'network_error'
  | 'http_error'
  | 'malformed_response'
  | 'model_mismatch'
  | 'chat_failure';

export interface NvidiaVllmProbeFailure {
  category: NvidiaVllmProbeFailureCategory;
  message: string;
  status?: number;
}

export interface NvidiaVllmProbeResult {
  ok: boolean;
  provider: 'nvidia_vllm';
  endpoint: string | null;
  authorization_present: boolean;
  model: string;
  checked_at: string;
  request_contract: {
    path: '/v1/chat/completions';
    max_tokens: number;
    thinking: 'disabled';
  };
  models: {
    count: number;
    ids: string[];
    max_context_tokens: number | null;
  } | null;
  server: { version: string | null } | null;
  chat: {
    response_id: string | null;
    responded_model: string | null;
    finish_reason: string | null;
    content_length: number;
    input_tokens: number | null;
    output_tokens: number | null;
  } | null;
  failure: NvidiaVllmProbeFailure | null;
}

export interface NvidiaVllmProbeOptions {
  baseURL?: string;
  apiKey?: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  outDir?: string | null;
}

interface ModelEntry {
  id?: unknown;
  max_model_len?: unknown;
  max_context_length?: unknown;
  context_length?: unknown;
}

interface ModelsPayload {
  data?: unknown;
}

interface VersionPayload {
  version?: unknown;
}

interface ChatPayload {
  id?: unknown;
  model?: unknown;
  choices?: Array<{
    finish_reason?: unknown;
    message?: { content?: unknown } | null;
  }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } | null;
}

/**
 * Qualifies an already-running VLLM endpoint without starting or modifying it.
 * The returned object is deliberately a secretless receipt: it contains endpoint
 * identity and response metadata, never the authorization value or response body.
 */
export async function probeNvidiaVllm(
  options: NvidiaVllmProbeOptions,
): Promise<NvidiaVllmProbeResult> {
  const checkedAt = new Date().toISOString();
  const baseURL = options.baseURL ?? process.env.NVIDIA_VLLM_BASE_URL ?? '';
  const apiKey = options.apiKey ?? process.env.NVIDIA_VLLM_API_KEY ?? 'local-no-auth';
  const timeoutMs = options.timeoutMs ?? 10_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const result = emptyResult({
    endpoint: baseURL ? safeEndpoint(baseURL) : null,
    authorization_present: Boolean(apiKey),
    model: options.model,
    checked_at: checkedAt,
  });

  if (!baseURL) {
    return finish(result, {
      category: 'missing_base_url',
      message: 'NVIDIA_VLLM_BASE_URL is not set; preflight does not fall back to a mock',
    }, options.outDir);
  }

  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
  };

  const modelsResponse = await requestJson<ModelsPayload>(
    fetchImpl,
    joinBase(baseURL, 'models'),
    { method: 'GET', headers },
    timeoutMs,
  );
  if (!modelsResponse.ok) {
    return finish(result, toProbeFailure(modelsResponse), options.outDir);
  }
  const entries = Array.isArray(modelsResponse.body?.data)
    ? modelsResponse.body.data.filter(isRecord) as ModelEntry[]
    : [];
  const ids = entries.map((entry) => typeof entry.id === 'string' ? entry.id : null).filter(
    (id): id is string => id !== null,
  );
  result.models = {
    count: ids.length,
    ids,
    max_context_tokens: contextLengthFor(entries.find((entry) => entry.id === options.model)),
  };
  if (!ids.includes(options.model)) {
    return finish(result, {
      category: 'model_mismatch',
      message: `requested model ${options.model} is not served by the endpoint`,
    }, options.outDir);
  }

  const versionResponse = await requestJson<VersionPayload>(
    fetchImpl,
    joinRoot(baseURL, 'version'),
    { method: 'GET', headers },
    timeoutMs,
  );
  if (!versionResponse.ok) {
    return finish(result, toProbeFailure(versionResponse), options.outDir);
  }
  result.server = {
    version: typeof versionResponse.body?.version === 'string' ? versionResponse.body.version : null,
  };

  const chatResponse = await requestJson<ChatPayload>(
    fetchImpl,
    joinBase(baseURL, 'chat/completions'),
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: options.model,
        max_tokens: result.request_contract.max_tokens,
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: 'system', content: 'AGORA provider preflight.' },
          { role: 'user', content: 'Reply with exactly AGORA-READY.' },
        ],
      }),
    },
    timeoutMs,
  );
  if (!chatResponse.ok) {
    return finish(result, toProbeFailure(chatResponse, 'chat_failure'), options.outDir);
  }
  const choice = chatResponse.body?.choices?.[0];
  if (!choice || !isRecord(choice.message) || typeof choice.message.content !== 'string') {
    return finish(result, {
      category: 'malformed_response',
      message: 'chat preflight returned no usable choice',
    }, options.outDir);
  }
  result.chat = {
    response_id: typeof chatResponse.body?.id === 'string' ? chatResponse.body.id : null,
    responded_model: typeof chatResponse.body?.model === 'string' ? chatResponse.body.model : null,
    finish_reason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null,
    content_length: choice.message.content.length,
    input_tokens: numberOrNull(chatResponse.body?.usage?.prompt_tokens),
    output_tokens: numberOrNull(chatResponse.body?.usage?.completion_tokens),
  };
  return finish({ ...result, ok: true }, null, options.outDir);
}

function emptyResult(input: Pick<NvidiaVllmProbeResult, 'endpoint' | 'authorization_present' | 'model' | 'checked_at'>): NvidiaVllmProbeResult {
  return {
    ok: false,
    provider: 'nvidia_vllm',
    ...input,
    request_contract: {
      path: '/v1/chat/completions',
      max_tokens: 16,
      thinking: 'disabled',
    },
    models: null,
    server: null,
    chat: null,
    failure: null,
  };
}

function finish(
  result: NvidiaVllmProbeResult,
  failure: NvidiaVllmProbeFailure | null,
  outDir: string | null | undefined,
): NvidiaVllmProbeResult {
  const finalResult = { ...result, ok: failure === null, failure };
  if (outDir) {
    const directory = resolve(outDir);
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, 'provider_preflight.json'), `${JSON.stringify(finalResult, null, 2)}\n`, 'utf8');
  }
  return finalResult;
}

interface RequestSuccess<T> { ok: true; body: T; }
interface RequestFailure { ok: false; failure: NvidiaVllmProbeFailure; }
type RequestResult<T> = RequestSuccess<T> | RequestFailure;

async function requestJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<RequestResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const bodyText = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        failure: {
          category: 'http_error',
          message: `provider preflight returned HTTP ${response.status}`,
          status: response.status,
        },
      };
    }
    try {
      return { ok: true, body: JSON.parse(bodyText) as T };
    } catch {
      return {
        ok: false,
        failure: { category: 'malformed_response', message: 'provider preflight returned non-JSON data' },
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, failure: { category: 'timeout', message: 'provider preflight timed out' } };
    }
    return {
      ok: false,
      failure: {
        category: 'network_error',
        message: error instanceof Error ? error.message : 'provider preflight network failure',
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function toProbeFailure<T>(result: RequestFailure, override?: NvidiaVllmProbeFailureCategory): NvidiaVllmProbeFailure {
  return override ? { ...result.failure, category: override } : result.failure;
}

function joinBase(baseURL: string, suffix: string): string {
  return new URL(suffix, ensureTrailingSlash(baseURL)).toString();
}

function joinRoot(baseURL: string, suffix: string): string {
  const parsed = new URL(baseURL);
  return new URL(`/${suffix}`, parsed.origin).toString();
}

function safeEndpoint(baseURL: string): string | null {
  try {
    const parsed = new URL(baseURL);
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return null;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function contextLengthFor(entry: ModelEntry | undefined): number | null {
  if (!entry) return null;
  return numberOrNull(entry.max_model_len) ?? numberOrNull(entry.max_context_length) ?? numberOrNull(entry.context_length);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
