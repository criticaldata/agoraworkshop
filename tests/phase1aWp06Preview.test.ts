import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPreviewApp, PREVIEW_LIMIT_BYTES } from '../src/phase1a/wp06/preview/app.js';
import { previewDemo } from '../src/phase1a/wp06/preview/demo.js';
import { analyzeRun } from '../src/phase1a/wp06/index.js';
import { analyzeReportAnnotations } from '../src/phase1a/wp06/annotations.js';
import { Phase1aRuntime, DeterministicMockProvider, createFixtureManifest } from '../src/phase1a/index.js';

let server: Server, base: string;
beforeAll(async () => {
  server = createPreviewApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
});
const post = (body: unknown, headers = {}) => fetch(`${base}/api/analyze`, { method: 'POST',
  headers: { origin: base, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('WP06 local read-only preview', () => {
  it('serves a self-contained UI and limits browser access to the local origin', async () => {
    const response = await fetch(base);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    const html = await response.text();
    expect(html).toContain('Scientific approval pending');
    expect(html).toContain('Annotations <span>optional</span>');
    expect((await fetch(`${base}/preview.js`)).status).toBe(200);
    expect((await fetch(`${base}/preview.css`)).status).toBe(200);
    const forgedHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(base, { headers: { host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    expect(forgedHostStatus).toBe(403);
    expect((await post({}, { origin: 'https://attacker.example' })).status).toBe(403);
    expect((await post({}, { origin: '' })).status).toBe(403);
  });

  it('shows the complete synthetic fixture with known ratios and eligible source text only', async () => {
    const response = await fetch(`${base}/api/demo/complete`);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.input_kind).toBe('synthetic');
    expect(data.run.totals).toMatchObject({ planned: 31, committed: 31 });
    expect(data.report.report_retention.value).toBe(2 / 3);
    expect(data.report.dissent_preservation.value).toBe(.5);
    expect(data.evidence).toHaveLength(19);
    expect(data.evidence.every((a: { kind: string }) => a.kind.startsWith('round.') || a.kind === 'report.revised')).toBe(true);
    expect(JSON.stringify(data)).not.toContain('Synthetic private or intermediate material');
    expect(data.run.usage.output_tokens.total).toBeNull();
    expect(data.records.coder_ids).toEqual(['demo-coder-a', 'demo-coder-b']);
  });

  it('shows missingness, report ineligibility and unresolved labels in distinct scenarios', async () => {
    const partial = await (await fetch(`${base}/api/demo/partial`)).json();
    expect(partial.run.state).toBe('FAILED');
    expect(partial.run.totals).toMatchObject({ planned: 31, committed: 6, technical_attempts: 2, not_attempted: 24 });
    expect(partial.report).toBeNull();
    const noReport = await (await fetch(`${base}/api/demo/no-report`)).json();
    expect(noReport.run.totals.planned).toBe(24);
    expect(noReport.run.by_stage.REPORT.response_rate.value).toBeNull();
    const disagreement = await (await fetch(`${base}/api/demo/disagreement`)).json();
    expect(disagreement.report.report_retention.value).toBeNull();
    expect(disagreement.report.report_retention.reasons).toContain('UNRESOLVED_OR_UNASSESSABLE_LABELS');
    expect(disagreement.report.reliability.report_retention.krippendorff_alpha).toBeLessThan(1);
    expect((await fetch(`${base}/api/demo/missing`)).status).toBe(404);
  });

  it('returns the existing analyzer results unchanged and keeps successive uploads isolated', async () => {
    const first = await previewDemo('complete');
    const response = await post(first);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.input_kind).toBe('uploaded');
    expect(data.run).toEqual(analyzeRun(first.bundle));
    expect(data.report).toEqual(analyzeReportAnnotations(first.bundle, first.annotations));
    const second = await previewDemo('no-report');
    const other = await (await post(second)).json();
    expect(other.records).toBeNull();
    expect(other.report).toBeNull();
    expect(other.run.run_id).not.toBe(data.run.run_id);
    expect(JSON.stringify(other)).not.toContain(data.run.run_id);
  });

  it('rejects corrupt evidence and mismatched annotations without returning partial results', async () => {
    const input = await previewDemo('complete');
    input.bundle.artifacts[0]!.content = 'tampered';
    const corrupt = await post(input);
    expect(corrupt.status).toBe(400);
    expect(Object.keys(await corrupt.json())).toEqual(['error']);
    const a = await previewDemo('complete'), b = await previewDemo('complete');
    const mismatch = await post({ bundle: a.bundle, annotations: b.annotations });
    expect(mismatch.status).toBe(400);
    expect((await mismatch.json()).error).toContain('different evidence');
    for (const body of [null, {}, { bundle: {} }, { bundle: a.bundle, annotations: {} }]) {
      expect((await post(body)).status).toBe(400);
    }
  });

  it('bounds uploaded JSON and rejects unsupported request formats', async () => {
    const malformed = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: '{broken' });
    expect(malformed.status).toBe(400);
    expect(Object.keys(await malformed.json())).toEqual(['error']);
    expect((await post({}, { 'content-type': 'text/plain' })).status).toBe(415);
    const oversized = await post({ bundle: 'x'.repeat(PREVIEW_LIMIT_BYTES) });
    expect(oversized.status).toBe(413);
    expect((await oversized.json()).error).toContain('10 MiB');
  });

  it('projects every planned operation and scheduled transition without exposing private source text', async () => {
    const data = await (await fetch(`${base}/api/demo/complete`)).json();
    const pathway = data.pathway;
    expect(pathway.operations.map((op: { opportunity_id: string }) => op.opportunity_id))
      .toEqual(data.run.opportunities.map((op: { opportunity_id: string }) => op.opportunity_id));
    expect(pathway.execution_edges).toHaveLength(30);
    expect(pathway.execution_edges.every((edge: { from: string; to: string; kind: string }, i: number) =>
      edge.from === pathway.operations[i].opportunity_id && edge.to === pathway.operations[i + 1].opportunity_id
      && edge.kind === 'scheduled_successor')).toBe(true);
    expect(pathway.operations.find((op: { stage: string }) => op.stage === 'T6')).toMatchObject({ planned_state: 'T1', round: null });
    expect(pathway.operations.find((op: { stage: string }) => op.stage === 'TR')).toMatchObject({ planned_state: 'T2' });
    expect(pathway.report_disclosure.event_ids).toHaveLength(1);
    expect(pathway.operations[0].recorded_transition).toMatchObject({ from: 'CREATED', to: 'T0' });
    expect(pathway.operations[3].recorded_transition).toMatchObject({ from: 'T0', to: 'ROUND_1' });
    expect(JSON.stringify(pathway)).not.toContain('Synthetic private or intermediate material');
    expect(pathway.operations.every((op: object) => !('prompt' in op) && !('content' in op))).toBe(true);
  });

  it('distinguishes sequential review execution from independent review inputs and revision dependencies', async () => {
    const { pathway } = await (await fetch(`${base}/api/demo/complete`)).json();
    expect(pathway.report_edges.map((edge: { from: string; to: string }) => [edge.from, edge.to])).toEqual([
      ['report:draft', 'report:review1'], ['report:draft', 'report:review2'],
      ['report:draft', 'report:revised'], ['report:review1', 'report:revised'], ['report:review2', 'report:revised'],
    ]);
    expect(pathway.report_edges.every((edge: { observation: string; observed_call_ids: string[] }) => edge.observation === 'observed' && edge.observed_call_ids.length === 1)).toBe(true);
    expect(pathway.execution_edges).toContainEqual({ from: 'report:review1', to: 'report:review2', kind: 'scheduled_successor' });
  });

  it('keeps unobserved report inputs planned and omits report nodes in no-report conditions', async () => {
    const partial = await (await fetch(`${base}/api/demo/partial`)).json();
    expect(partial.pathway.report_edges).toHaveLength(5);
    expect(partial.pathway.report_edges.every((edge: { observation: string; observed_call_ids: string[] }) => edge.observation === 'planned' && edge.observed_call_ids.length === 0)).toBe(true);
    expect(partial.pathway.operations.find((op: { status: string }) => op.status === 'technical_failure')).toMatchObject({ opportunity_id: 'round:2:agent_1', technical_attempts: 2, recorded_transition: null });
    const noReport = await (await fetch(`${base}/api/demo/no-report`)).json();
    expect(noReport.pathway.report_enabled).toBe(false);
    expect(noReport.pathway.report_edges).toEqual([]);
    expect(noReport.pathway.operations).toHaveLength(24);
    expect(noReport.pathway.operations.at(-1).planned_state).toBe('T1');
    expect(noReport.pathway.report_disclosure).toMatchObject({ required: false, event_ids: [] });
  });

  it('uses the manifest speaking order and counterbalanced report allocation', async () => {
    const initial = createFixtureManifest();
    const runtime = new Phase1aRuntime();
    const id = runtime.createRun(createFixtureManifest({ replication: 2,
      speakingOrder: initial.speakingOrder.map(order => [order[2], order[1], order[0]]),
    }));
    await runtime.run(id, new DeterministicMockProvider());
    const { pathway } = await (await post({ bundle: runtime.evidence(id) })).json();
    expect(pathway.operations.slice(3, 6).map((op: { participant_id: string }) => op.participant_id)).toEqual(['agent_3', 'agent_2', 'agent_1']);
    expect(pathway.operations.find((op: { opportunity_id: string }) => op.opportunity_id === 'report:draft').participant_id).toBe('agent_2');
    expect(pathway.operations.find((op: { opportunity_id: string }) => op.opportunity_id === 'report:review1').participant_id).toBe('agent_3');
  });
});
