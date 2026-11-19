import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ChatCompletionsProvider } from '../experiment/provider.js';
const [configFile, credentialFile, outputFile] = process.argv.slice(2);
if (!configFile || !credentialFile || !outputFile) throw new Error('Usage: canary <deployment.json> <credential-file> <output.json>');
const config = JSON.parse(readFileSync(configFile, 'utf8'));
const credential = readFileSync(credentialFile, 'utf8').trim();
const url = 'http://127.0.0.1:18500';
const headers = { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' };
const health = await fetch(`${url}/health`, { headers, signal: AbortSignal.timeout(10000) }).then(r => r.json()) as any;
if (health.halted || !health.config_hash) throw new Error('Gateway is not healthy');
const report: any = { schema_version: 'agora-deployment-canary-v1', mode: 'engineering_only_not_scientific_data', started_at: new Date().toISOString(), deployment_config_hash: health.config_hash, engine_version: config.engine_version, gateway_sha256: config.gateway_sha256, results: [], result: 'pending' };
const save = () => writeFileSync(outputFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
save();
for (const [model, metadata] of Object.entries(config.models) as [string, any][]) {
  const provider = new ChatCompletionsProvider([{ provider: metadata.family, url: `${url}/v1/chat/completions`, credential, expectedConfigHash: health.config_hash, expectedRevision: metadata.manifest_digest }], 120000);
  for (const kind of ['short', 'long-context']) {
    const prompt = kind === 'short' ? 'This is an engineering connectivity test, not a research workshop. Reply with one short sentence confirming that you can respond.' : 'The marker at the beginning is ORCHID-4729.\n' + ' neutral'.repeat(24000) + '\nReturn only the marker stated at the beginning.';
    const start = Date.now();
    let response = await provider.invoke({ provider: metadata.family, model, participantId: 'engineering-canary', operationKey: `engineering:${kind}`, configuration: { temperature: 0.7, top_p: 1, max_tokens: 1024 }, systemPrompt: 'Follow the test request. Give a concise visible answer.', userPrompt: prompt, context: [], attempt: 1 });
    if (response.outcome === 'rate_limit') {
      report.results.push({model, kind, attempt:1, outcome:response.outcome, usage:response.usage, passed:false, retried:true}); save();
      await new Promise(resolve => setTimeout(resolve, 2000));
      response = await provider.invoke({ provider: metadata.family, model, participantId: 'engineering-canary', operationKey: `engineering:${kind}`, configuration: { temperature: 0.7, top_p: 1, max_tokens: 1024 }, systemPrompt: 'Follow the test request. Give a concise visible answer.', userPrompt: prompt, context: [], attempt: 2 });
    }
    const passed = response.outcome === 'success' && !!response.content?.trim() && (kind !== 'long-context' || ((response.usage?.inputTokens ?? 0) > 16000 && response.content.includes('ORCHID-4729')));
    const item = { family: metadata.family, model, model_revision: metadata.manifest_digest, kind, passed, elapsed_ms: Date.now() - start, outcome: response.outcome, usage: response.usage, finish_reason: response.finishReason, response_sha256: createHash('sha256').update(JSON.stringify(response)).digest('hex'), content: response.content, raw: response.raw };
    report.results.push(item); save(); console.log(JSON.stringify({ model, kind, passed, elapsed_ms: item.elapsed_ms, usage: item.usage }));
    if (!passed) throw new Error(`Canary failed: ${model} ${kind}`);
  }
}
const model = Object.keys(config.models)[0];
const overflow = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers, signal: AbortSignal.timeout(120000), body: JSON.stringify({ model, messages: [{ role: 'user', content: ' neutral'.repeat(40000) }], temperature: 0.7, top_p: 1, max_tokens: 16, stream: false, n: 1 }) });
report.overflow_rejection = { model, status: overflow.status, passed: overflow.status === 400 };
const unauthorized = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(10000) });
report.unauthenticated_rejection = { status: unauthorized.status, passed: unauthorized.status === 403 };
report.final_health = await fetch(`${url}/health`, { headers, signal: AbortSignal.timeout(10000) }).then(r => r.json());
report.result = report.final_health.halted === null && report.overflow_rejection.passed && report.unauthenticated_rejection.passed ? 'pass' : 'fail';
report.finished_at = new Date().toISOString(); save();
if (report.result !== 'pass') throw new Error('Deployment safety checks failed');
console.log('All three model canaries, long-context recall, overflow rejection and authentication checks passed.');
