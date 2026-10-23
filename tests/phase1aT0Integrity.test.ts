import { describe, expect, it } from 'vitest';
import { configHash } from '../src/config/hash.js';
import {
  Phase1aRuntime,
  createFixtureManifest,
  verifyEvidenceBundle,
  type Cell,
  type Phase1aManifest,
  type Phase1aProvider,
  type ProviderCallSpec,
  type ProviderResponse,
} from '../src/phase1a/index.js';
import { buildSyntheticCampaign, SELECTED_REPORT_NOTICE_TIMING } from '../src/phase1a/wp01/index.js';
import { adaptWp01Run } from '../src/phase1a/wp02/index.js';

const campaign = buildSyntheticCampaign({ report_notice_timing: SELECTED_REPORT_NOTICE_TIMING });
const cells: Cell[] = ['A', 'B', 'C', 'D'];

function manifest(cell: Cell, maxRetries = 1): Phase1aManifest {
  const run = campaign.runs.find((entry) => entry.condition_id === cell)!;
  return adaptWp01Run(campaign, run.run_id, {
    admissionClass: 'engineering', topic: 'audit-only synthetic workshop',
    approvedAt: 'SYNTHETIC_AUDIT_NOT_SCIENTIFIC_APPROVAL',
    limits: { maxCalls: 40, maxTokens: 100000, maxRetries },
  });
}

function response(spec: ProviderCallSpec, content: unknown, outcome: ProviderResponse['outcome'] = 'success'): ProviderResponse {
  // Deliberately violate the adapter's static content type at the external boundary.
  return {
    outcome, provider: spec.provider, model: spec.model, content,
    usage: { inputTokens: 7, outputTokens: 2 }, finishReason: 'stop',
    raw: { fixture: true, native: { response: content } },
  } as ProviderResponse;
}

function provider(answer: (spec: ProviderCallSpec) => ProviderResponse) {
  const calls: ProviderCallSpec[] = [];
  const implementation: Phase1aProvider = {
    async invoke(spec) { calls.push(structuredClone(spec)); return answer(spec); },
  };
  return { calls, implementation };
}

const malformed = [
  ['null', null], ['empty', ''], ['whitespace', ' \t\r\n '],
  ['undefined', undefined], ['number', 42], ['boolean', false],
  ['object', { text: 'not a response string' }], ['array', ['not a response string']],
] as const;

describe('P06/S04: required success content at the WP02 admission boundary', () => {
  for (const cell of cells) {
    describe(`canonical engineering condition ${cell}`, () => {
      it.each(malformed)('[ORCH-05] [ORCH-06] rejects %s success, preserves attempts, and blocks t0 advancement', async (_name, content) => {
        const runtime = new Phase1aRuntime();
        const m = manifest(cell);
        const id = runtime.createRun(m);
        const p = provider((spec) => response(spec, content));
        expect(await runtime.run(id, p.implementation)).toBe('FAILED');
        const bundle = runtime.evidence(id);
        expect(p.calls.map((call) => [call.operationKey, call.attempt])).toEqual([
          [`t0:${m.participants[0].id}`, 1], [`t0:${m.participants[0].id}`, 2],
        ]);
        expect(bundle.provider_calls.map((call) => call.terminal_status)).toEqual(['invalid_response', 'invalid_response']);
        expect(bundle.provider_calls[0]!.previous_attempt_ids).toEqual([]);
        expect(bundle.provider_calls[1]!.previous_attempt_ids).toEqual([bundle.provider_calls[0]!.call_id]);
        expect(bundle.provider_calls.every((call) => call.usage?.inputTokens === 7 && call.usage.outputTokens === 2)).toBe(true);
        expect(bundle.events.filter((event) => event.event_type === 'retry.scheduled')).toHaveLength(1);
        expect(bundle.events.filter((event) => event.event_type === 'provider_call.failed')).toHaveLength(2);
        expect(bundle.events.find((event) => event.event_type === 'run.failed')?.payload.reason).toBe('invalid_response');
        expect(bundle.events.some((event) => ['operation.committed', 'checkpoint.t0.completed', 'report_requirement.disclosed', 'run.completed'].includes(event.event_type))).toBe(false);
        expect(bundle.artifacts.filter((artifact) => artifact.visibility !== 'operator')).toEqual([]);
        for (const call of bundle.provider_calls) {
          const artifact = bundle.artifacts.find((entry) => entry.artifact_id === call.raw_artifact_ref)!;
          const archived = JSON.parse(artifact.content);
          expect(artifact.visibility).toBe('operator');
          // Artifacts hash their serialized string; calls hash the parsed raw object.
          expect(configHash(artifact.content)).toBe(artifact.content_hash);
          expect(configHash(archived)).toBe(call.raw_response_hash);
          expect(archived.validation_error).toBe('success_requires_nonempty_text');
          expect(archived.content_type).toBe(content === null ? 'null' : typeof content);
          expect(archived.content_present).toBe(true);
          expect(archived.provider_response.outcome).toBe('success');
          expect(archived.provider_response.provider).toBe(call.provider);
          expect(archived.provider_response.model).toBe(call.model);
          expect(archived.provider_response.finishReason).toBe('stop');
          // JSON cannot encode undefined: the explicit presence/type fields retain that fact.
          expect(archived.provider_response.content).toEqual(content);
          expect(archived.provider_response.raw).toEqual(content === undefined
            ? { fixture: true, native: {} } : { fixture: true, native: { response: content } });
        }
        expect(verifyEvidenceBundle(bundle)).toMatchObject({ valid: true, errors: [] });
      });

      it('[ORCH-05] records an absent content field without pretending it was null', async () => {
        const runtime = new Phase1aRuntime();
        const id = runtime.createRun(manifest(cell, 0));
        const p = provider((spec) => { const answer = response(spec, undefined); delete (answer as Partial<ProviderResponse>).content; return answer; });
        expect(await runtime.run(id, p.implementation)).toBe('FAILED');
        const bundle = runtime.evidence(id);
        expect(p.calls).toHaveLength(1);
        const raw = JSON.parse(bundle.artifacts.find((artifact) => artifact.kind === 'provider.raw')!.content);
        expect(raw.content_present).toBe(false);
        expect(raw.content_type).toBe('undefined');
        expect(Object.hasOwn(raw.provider_response, 'content')).toBe(false);
      });

      it.each(['bigint', 'cyclic'] as const)('[ORCH-06] retains non-JSON %s rejection without losing technical attempts', async (kind) => {
        const content: unknown = kind === 'bigint' ? 42n : { text: 'cyclic fixture' };
        if (kind === 'cyclic') (content as Record<string, unknown>).self = content;
        const runtime = new Phase1aRuntime();
        const id = runtime.createRun(manifest(cell));
        // Keep native raw serializable to isolate the malformed content, not an unrelated raw bug.
        const p = provider((spec) => ({ ...response(spec, content), raw: { fixture: true } }));
        expect(await runtime.run(id, p.implementation)).toBe('FAILED');
        const bundle = runtime.evidence(id);
        expect(bundle.provider_calls.map((call) => call.terminal_status)).toEqual(['invalid_response', 'invalid_response']);
        expect(bundle.events.filter((event) => event.event_type === 'retry.scheduled')).toHaveLength(1);
        expect(bundle.events.some((event) => event.event_type === 'operation.committed' || event.event_type === 'report_requirement.disclosed')).toBe(false);
        expect(p.calls.some((call) => call.operationKey.startsWith('round:'))).toBe(false);
        for (const call of bundle.provider_calls) {
          const raw = JSON.parse(bundle.artifacts.find((artifact) => artifact.artifact_id === call.raw_artifact_ref)!.content);
          expect(raw.validation_error).toBe('success_requires_nonempty_text');
          expect(raw.provider_response_format).toBe('redacted-json-v1');
          expect(raw.provider_response.content).toEqual(kind === 'bigint'
            ? { non_json_type: 'bigint', decimal: '42' }
            : { text: 'cyclic fixture', self: { non_json_type: 'circular_reference' } });
          expect(raw.provider_response.outcome).toBe('success');
          expect(raw.provider_response.raw).toEqual({ fixture: true });
          expect(raw.content_type).toBe(kind === 'bigint' ? 'bigint' : 'object');
        }
        expect(verifyEvidenceBundle(bundle).valid).toBe(true);
      });

      it('[ORCH-05] retains both malformed-content and identity-mismatch diagnoses', async () => {
        const runtime = new Phase1aRuntime();
        const id = runtime.createRun(manifest(cell, 0));
        const p = provider((spec) => ({ ...response(spec, null), provider: 'wrong-provider', model: 'wrong-model' }));
        expect(await runtime.run(id, p.implementation)).toBe('FAILED');
        const bundle = runtime.evidence(id);
        expect(bundle.provider_calls[0]!.terminal_status).toBe('invalid_response');
        const raw = JSON.parse(bundle.artifacts.find((artifact) => artifact.kind === 'provider.raw')!.content);
        expect(raw.validation_error).toBe('success_requires_nonempty_text');
        expect(raw.adapter_identity_mismatch).toEqual({ provider: 'wrong-provider', model: 'wrong-model' });
        expect(raw.provider_response).toMatchObject({ outcome: 'success', content: null, provider: 'wrong-provider', model: 'wrong-model' });
        expect(verifyEvidenceBundle(bundle).valid).toBe(true);
      });

      it.each(['null', 'bigint', 'cyclic'] as const)('[ORCH-06] retains field-aware credential redaction for %s diagnostics', async (kind) => {
        const content: unknown = kind === 'null' ? null : kind === 'bigint' ? 42n : { text: 'cyclic fixture' };
        if (kind === 'cyclic') (content as Record<string, unknown>).self = content;
        const runtime = new Phase1aRuntime();
        const id = runtime.createRun(manifest(cell, 0));
        const p = provider((spec) => ({ ...response(spec, content), raw: {
          access_token: 'CREDENTIAL_CANARY_ONE', authorization: 'CREDENTIAL_CANARY_TWO', harmless: 'retained',
        } }));
        expect(await runtime.run(id, p.implementation)).toBe('FAILED');
        const bundle = runtime.evidence(id);
        expect(JSON.stringify(bundle)).not.toContain('CREDENTIAL_CANARY_ONE');
        expect(JSON.stringify(bundle)).not.toContain('CREDENTIAL_CANARY_TWO');
        const raw = JSON.parse(bundle.artifacts.find((artifact) => artifact.kind === 'provider.raw')!.content);
        expect(raw.provider_response.raw).toEqual({ access_token: '[REDACTED]', authorization: '[REDACTED]', harmless: 'retained' });
        expect(verifyEvidenceBundle(bundle).valid).toBe(true);
      });

      it.each([0, 1, 2])('[EXP-14] invalid mandatory t0 at participant index %i cannot disclose or start a round', async (index) => {
        const runtime = new Phase1aRuntime();
        const m = manifest(cell);
        const id = runtime.createRun(m);
        const invalidKey = `t0:${m.participants[index]!.id}`;
        const p = provider((spec) => response(spec, spec.operationKey === invalidKey ? null : `valid ${spec.operationKey}`));
        expect(await runtime.run(id, p.implementation)).toBe('FAILED');
        const bundle = runtime.evidence(id);
        expect(bundle.artifacts.filter((artifact) => artifact.kind === 'checkpoint.t0')).toHaveLength(index);
        expect(bundle.events.filter((event) => event.event_type === 'operation.committed')).toHaveLength(index);
        expect(bundle.events.some((event) => event.event_type === 'report_requirement.disclosed')).toBe(false);
        expect(p.calls.some((call) => call.operationKey.startsWith('round:'))).toBe(false);
        expect(bundle.artifacts.some((artifact) => artifact.content === '[success]')).toBe(false);
        expect(verifyEvidenceBundle(bundle).valid).toBe(true);
      });

      it.each([0, 2])('[ORCH-07] respects maxRetries=%i for malformed success', async (maxRetries) => {
        const runtime = new Phase1aRuntime();
        const id = runtime.createRun(manifest(cell, maxRetries));
        const p = provider((spec) => response(spec, '   '));
        expect(await runtime.run(id, p.implementation)).toBe('FAILED');
        const bundle = runtime.evidence(id);
        expect(p.calls).toHaveLength(maxRetries + 1);
        expect(bundle.events.filter((event) => event.event_type === 'retry.scheduled')).toHaveLength(maxRetries);
        expect(bundle.provider_calls.map((call) => call.attempt)).toEqual(Array.from({ length: maxRetries + 1 }, (_, index) => index + 1));
      });

      it('[EXP-14] valid responses preserve exact text and all three commits precede disclosure/public discussion', async () => {
        const runtime = new Phase1aRuntime();
        const m = manifest(cell);
        const id = runtime.createRun(m);
        const p = provider((spec) => response(spec, `  valid ${spec.operationKey}\n`));
        expect(await runtime.run(id, p.implementation)).toBe('COMPLETE');
        const bundle = runtime.evidence(id);
        expect(p.calls).toHaveLength(cell === 'B' || cell === 'D' ? 31 : 24);
        const commits = bundle.events.filter((event) => event.event_type === 'operation.committed' && String(event.payload.operation_key).startsWith('t0:'));
        expect(commits).toHaveLength(3);
        expect(bundle.artifacts.filter((artifact) => artifact.kind === 'checkpoint.t0').map((artifact) => artifact.content)).toEqual(m.participants.map((participant) => `  valid t0:${participant.id}\n`));
        expect(p.calls.filter((call) => call.operationKey.startsWith('t0:')).every((call) => call.context.length === 0 && !/report/i.test(call.userPrompt))).toBe(true);
        const notices = bundle.events.filter((event) => event.event_type === 'report_requirement.disclosed');
        const firstRound = bundle.events.find((event) => event.event_type === 'provider_call.started' && String(event.payload.operation_key).startsWith('round:'))!;
        expect(firstRound.sequence).toBeGreaterThan(Math.max(...commits.map((event) => event.sequence)));
        if (cell === 'B' || cell === 'D') {
          expect(notices).toHaveLength(1);
          expect(notices[0]!.sequence).toBeGreaterThan(Math.max(...commits.map((event) => event.sequence)));
          expect(notices[0]!.sequence).toBeLessThan(firstRound.sequence);
        } else {
          expect(notices).toEqual([]);
          expect(bundle.artifacts.some((artifact) => artifact.kind === 'condition.report-disclosure')).toBe(false);
        }
        expect(verifyEvidenceBundle(bundle).valid).toBe(true);
      });

      it('[ORCH-07] an authorized successful retry resolves t0 without erasing the invalid attempt', async () => {
        const runtime = new Phase1aRuntime();
        const m = manifest(cell);
        const id = runtime.createRun(m);
        const key = `t0:${m.participants[2].id}`;
        const p = provider((spec) => response(spec, spec.operationKey === key && spec.attempt === 1 ? '' : `valid ${spec.operationKey}`));
        expect(await runtime.run(id, p.implementation)).toBe('COMPLETE');
        const bundle = runtime.evidence(id);
        const attempts = bundle.provider_calls.filter((call) => call.operation_key === key);
        expect(attempts.map((call) => call.terminal_status)).toEqual(['invalid_response', 'success']);
        expect(attempts[1]!.previous_attempt_ids).toEqual([attempts[0]!.call_id]);
        expect(bundle.artifacts.filter((artifact) => artifact.kind === 'checkpoint.t0')).toHaveLength(3);
        expect(bundle.events.filter((event) => event.event_type === 'operation.committed' && event.payload.operation_key === key)).toHaveLength(1);
        const firstRound = bundle.events.find((event) => event.event_type === 'provider_call.started' && String(event.payload.operation_key).startsWith('round:'))!;
        const lastT0 = bundle.events.find((event) => event.event_type === 'operation.committed' && event.payload.operation_key === key)!;
        expect(firstRound.sequence).toBeGreaterThan(lastT0.sequence);
        expect(verifyEvidenceBundle(bundle).valid).toBe(true);
      });

      it.each(['refused', 'abstained'] as const)('[ORCH-08] preserves delivered %s as a distinct non-retried outcome', async (outcome) => {
        const runtime = new Phase1aRuntime();
        const m = manifest(cell);
        const id = runtime.createRun(m);
        const p = provider((spec) => response(spec, `explicit ${outcome}`, outcome));
        expect(await runtime.run(id, p.implementation, { stopAfterOperations: 3 })).toBe('T0');
        const bundle = runtime.evidence(id);
        expect(p.calls).toHaveLength(3);
        expect(bundle.provider_calls.map((call) => call.terminal_status)).toEqual([outcome, outcome, outcome]);
        expect(bundle.events.some((event) => event.event_type === 'retry.scheduled')).toBe(false);
        expect(bundle.artifacts.filter((artifact) => artifact.kind === 'checkpoint.t0').map((artifact) => artifact.content)).toEqual(Array(3).fill(`explicit ${outcome}`));
      });
    });
  }

  it('P06 retains the original lower-level adversarial predicate', async () => {
    const base = createFixtureManifest();
    const m = createFixtureManifest({ ...base, cell: 'B', participants: base.participants.map((participant) => ({ ...participant, model: 'gemma-fixture' })) as unknown as Phase1aManifest['participants'] });
    const r = new Phase1aRuntime();
    const id = r.createRun(m);
    await r.run(id, { invoke: async (s) => ({ outcome: 'success', provider: s.provider, model: s.model, content: null, usage: null, finishReason: 'stop', raw: { fixture: true } }) });
    expect(r.state(id) === 'FAILED').toBe(true);
  });

  it.each(['null', 'empty', 'whitespace'] as const)('S04 retains the original canonical B %s predicate', async (kind) => {
    const r = new Phase1aRuntime();
    const id = r.createRun(manifest('B'));
    await r.run(id, { invoke: async (s) => ({ outcome: 'success', provider: s.provider, model: s.model, content: kind === 'null' ? null : kind === 'empty' ? '' : '   ', usage: null, finishReason: 'stop', raw: { fixture: true } }) });
    const b = r.evidence(id);
    expect(r.state(id) === 'FAILED' && !b.events.some((e) => e.event_type === 'report_requirement.disclosed') && !b.provider_calls.some((c) => c.operation_key.startsWith('round:'))).toBe(true);
  });
});
