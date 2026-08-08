import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { buildRunGraph } from '../src/analytics/graph.js';
import { buildTimeline } from '../src/analytics/interaction.js';
import { computeAnalytics } from '../src/analytics/summary.js';
import { evaluateGates, finalizeReport } from '../src/acceptance/gates.js';
import { phase0Summary } from '../src/acceptance/summary.js';
import { buildValidationSet } from '../src/acceptance/validationSet.js';
import {
  getInvocations,
  getMessages,
  getOpportunities,
  getRun,
  runConfig,
} from '../src/db/queries.js';
import { readEvents } from '../src/events/recorder.js';
import { graphPage } from '../src/server/graphPage.js';
import { validationPage } from '../src/server/validation.js';
import { readViewMode, safeReturnTo, type ViewMode } from '../src/server/viewMode.js';
import { frozen, tempDb } from './helpers.js';

/**
 * The simple view is the demonstration; the full view is the instrument.
 *
 * What these tests hold to is the promise that makes the split safe: reducing what is
 * advertised must never reduce what is reachable, and must never turn an unproven claim
 * into a shown one.
 */

async function loaded() {
  const db = tempDb();
  const runner = new WorkshopRunner({ db, frozen: frozen() });
  await runner.execute();
  const run = getRun(db, runner.id)!;
  return { db, run, runId: runner.id, config: runConfig(run) };
}

function graphHtml(r: Awaited<ReturnType<typeof loaded>>, mode: ViewMode): string {
  const events = readEvents(r.db, r.runId);
  const messages = getMessages(r.db, r.runId);
  const timeline = buildTimeline({ config: r.config, events, messages });
  return graphPage({
    run: r.run,
    config: r.config,
    mode,
    returnTo: `/runs/${r.runId}`,
    graph: buildRunGraph({
      runId: r.runId,
      config: r.config,
      messages,
      opportunities: getOpportunities(r.db, r.runId),
      invocations: getInvocations(r.db, r.runId),
      phases: timeline.phases.map((p) => ({
        phase: String(p.phase),
        label: p.label,
        fromSequence: p.fromSequence,
        toSequence: p.toSequence,
      })),
      semantic: null,
    }),
    extractions: [],
    assetVersion: 'testasset',
  });
}

function validationHtml(r: Awaited<ReturnType<typeof loaded>>, mode: ViewMode): string {
  return validationPage({
    set: buildValidationSet({ db: r.db, runId: r.runId }),
    run: r.run,
    config: r.config,
    analytics: computeAnalytics(r.db, r.runId),
    checks: phase0Summary(
      r.db,
      r.runId,
      finalizeReport(evaluateGates({ db: r.db, runId: r.runId })),
    ),
    mode,
    returnTo: `/runs/${r.runId}/validation`,
    comparableRunIds: [],
    sampleInvocationId: null,
    exportedFiles: 0,
  });
}

describe('choosing how much of the instrument is on show', () => {
  it('shows the demonstration to a reader who has never chosen', () => {
    expect(readViewMode(undefined)).toBe('simple');
    expect(readViewMode('')).toBe('simple');
    expect(readViewMode('other=1')).toBe('simple');
    expect(readViewMode('agora_view=nonsense')).toBe('simple');
  });

  it('remembers a reader who asked for everything', () => {
    expect(readViewMode('agora_view=full')).toBe('full');
    expect(readViewMode('theme=dark; agora_view=full; other=1')).toBe('full');
    expect(readViewMode('agora_view=simple')).toBe('simple');
  });

  it('returns only to paths on this site', () => {
    expect(safeReturnTo('/runs/run_1?event=4')).toBe('/runs/run_1?event=4');
    expect(safeReturnTo('/')).toBe('/');
    // Anything that could send the reader somewhere else goes home instead.
    expect(safeReturnTo('//evil.example')).toBe('/');
    expect(safeReturnTo('https://evil.example')).toBe('/');
    expect(safeReturnTo('/ok\\..\\evil')).toBe('/');
    expect(safeReturnTo('/ok\nSet-Cookie: x=1')).toBe('/');
    expect(safeReturnTo(undefined)).toBe('/');
    expect(safeReturnTo(42)).toBe('/');
  });
});

describe('the simple view of a run', () => {
  it('offers the graph and the validation, and not the rest', async () => {
    const r = await loaded();
    const html = graphHtml(r, 'simple');

    expect(html).toContain(`href="/runs/${r.runId}"`);
    expect(html).toContain(`href="/runs/${r.runId}/validation"`);
    for (const hidden of ['/structure', '/turns', '/transcript']) {
      expect(html).not.toContain(`href="/runs/${r.runId}${hidden}"`);
    }
  });

  it('leaves out the analyses Phase 0 did not commission', async () => {
    const r = await loaded();
    const html = graphHtml(r, 'simple');

    // No idea layer, and nothing that names its vocabulary.
    expect(html).not.toContain('data-mode="ideas"');
    expect(html).not.toContain('data-kind="topic"');
    expect(html).not.toContain('data-kind="claim"');
    expect(html).not.toContain('data-kind="concept"');
    // No comparison and no raw API in the site chrome.
    expect(html).not.toContain('href="/compare"');
    expect(html).not.toContain('href="/api"');
  });

  it('says what the page is for, in one sentence', async () => {
    const r = await loaded();
    expect(graphHtml(r, 'simple')).toContain('agents and a moderator');
  });

  it('keeps every message reachable without the canvas', async () => {
    const r = await loaded();
    // The drill-down is not advertised as a view, but the way into it must remain.
    expect(graphHtml(r, 'simple')).toContain(`href="/runs/${r.runId}/timeline"`);
  });

  it('carries the way back to the full instrument', async () => {
    const r = await loaded();
    const html = graphHtml(r, 'simple');
    expect(html).toContain('action="/view-mode"');
    expect(html).toContain('value="full"');
    expect(html).toContain(`value="/runs/${r.runId}"`);
  });

  it('restores everything when the reader asks for it', async () => {
    const r = await loaded();
    const html = graphHtml(r, 'full');
    expect(html).toContain('data-mode="ideas"');
    expect(html).toContain('data-kind="claim"');
    expect(html).toContain(`href="/runs/${r.runId}/structure"`);
    expect(html).toContain('href="/compare"');
    // And the switch now points the other way.
    expect(html).toContain('value="simple"');
  });
});

describe('the switch itself', () => {
  const source = readFileSync(new URL('../src/server/index.ts', import.meta.url), 'utf8');

  it('changes the preference through a POST, never a link', () => {
    expect(source).toContain("app.post('/view-mode'");
    expect(source).not.toContain("app.get('/view-mode'");
  });

  it('never redirects to a path it was handed without checking it', () => {
    const handler = source.split("app.post('/view-mode'")[1]!.split('app.')[0]!;
    // Every mention of the submitted path goes through the check, without exception.
    const mentions = handler.match(/return_to/g) ?? [];
    const checked = handler.match(/safeReturnTo\(req\.body\?\.return_to\)/g) ?? [];
    expect(mentions).toHaveLength(1);
    expect(checked).toHaveLength(1);
  });

  it('is the only state-changing request served without the credential', () => {
    const auth = readFileSync(new URL('../src/server/auth.ts', import.meta.url), 'utf8');
    const set = auth.match(/const PREFERENCE_PATHS = new Set\(\[([^\]]*)\]\)/)![1]!;
    expect(set.match(/'[^']+'/g)).toEqual(["'/view-mode'"]);
  });

  it('writes nothing but a cookie', () => {
    const handler = source.split("app.post('/view-mode'")[1]!.split('app.')[0]!;
    for (const forbidden of ['db', 'launch(', 'exportRun(', 'writeFile']) {
      expect(handler).not.toContain(forbidden);
    }
    expect(handler).toContain('res.cookie(');
  });

  it('reads the mode from the request rather than fixing it in a route', () => {
    // A route that hard-coded a mode would quietly ignore what the reader chose.
    expect(source).not.toMatch(/mode: '(simple|full)'/);
    expect(source).toContain('readViewMode(req.headers.cookie)');
  });
});

describe('the four Phase 0 questions', () => {
  it('answers all four from the run', async () => {
    const r = await loaded();
    const checks = phase0Summary(
      r.db,
      r.runId,
      finalizeReport(evaluateGates({ db: r.db, runId: r.runId })),
    );

    expect(checks.map((c) => c.key)).toEqual([
      'routing',
      'privacy',
      'failure_attribution',
      'reproducibility',
    ]);
    for (const check of checks) {
      expect(check.question.length).toBeGreaterThan(0);
      expect(check.detail.length).toBeGreaterThan(0);
      expect(['PASS', 'FAIL', 'NOT_EXERCISED']).toContain(check.status);
    }
  });

  it('never disagrees with the gate the same records were judged by', async () => {
    const r = await loaded();
    const report = finalizeReport(evaluateGates({ db: r.db, runId: r.runId }));
    const checks = phase0Summary(r.db, r.runId, report);
    const infrastructure = report.gates.infrastructure_validated.status;

    // Routing and privacy are read from the same records under the same rules. If either
    // is a defect, the gate that covers them cannot be claiming a pass.
    for (const key of ['routing', 'privacy'] as const) {
      if (checks.find((c) => c.key === key)!.status === 'FAIL') {
        expect(infrastructure).toBe('FAIL');
      }
    }
  });

  it('draws a tick only where a check passed', async () => {
    const r = await loaded();
    const checks = phase0Summary(
      r.db,
      r.runId,
      finalizeReport(evaluateGates({ db: r.db, runId: r.runId })),
    );
    const html = validationHtml(r, 'simple');

    const ticks = (html.match(/vp-mark ok/g) ?? []).length;
    expect(ticks).toBe(checks.filter((c) => c.status === 'PASS').length);

    // A question that never arose says so in words, not with a mark that reads as a pass.
    for (const check of checks.filter((c) => c.status === 'NOT_EXERCISED')) {
      expect(html).toContain(check.detail);
      expect(html).toContain('NOT EXERCISED');
    }
  });

  it('shows the questions in both views and the technical detail in only one', async () => {
    const r = await loaded();
    const simple = validationHtml(r, 'simple');
    const full = validationHtml(r, 'full');

    expect(simple).toContain('vp-four');
    expect(full).toContain('vp-four');

    // The scope disclaimer is not an advanced feature and never disappears.
    expect(simple).toContain('Phase 0 validates the apparatus');
    expect(full).toContain('Phase 0 validates the apparatus');

    expect(simple).not.toContain('id="evidence-runs"');
    expect(simple).not.toContain('id="provenance"');
    expect(full).toContain('id="evidence-runs"');
    expect(full).toContain('id="provenance"');
  });
});
