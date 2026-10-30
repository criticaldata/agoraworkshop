import express, { type ErrorRequestHandler } from 'express';
import { fileURLToPath } from 'node:url';
import type { EvidenceBundle } from '../../index.js';
import { analyzeRun } from '../index.js';
import { analyzeReportAnnotations, ReportAnnotationsSchema } from '../annotations.js';
import { previewDemo, type DemoScenario } from './demo.js';

export const PREVIEW_LIMIT_BYTES = 10 * 1024 * 1024;
const assets = fileURLToPath(new URL('../../../../static/wp06-preview/', import.meta.url));

export function previewAnalysis(bundle: EvidenceBundle, annotations?: unknown) {
  const run = analyzeRun(bundle);
  const report = annotations === undefined ? null : analyzeReportAnnotations(bundle, annotations);
  const records = report ? ReportAnnotationsSchema.parse(annotations) : null;
  // Only successful public turns and the final report are eligible source text.
  const visible = new Set(run.opportunities.filter(row => row.status === 'committed' && row.outcome === 'success'
    && (row.stage === 'PUBLIC' || row.opportunity_id === 'report:revised')).map(row => row.output_artifact_id));
  return { run, report, records,
    evidence: bundle.artifacts.filter(a => visible.has(a.artifact_id)).map(a => ({
      artifact_id: a.artifact_id, kind: a.kind, content: a.content, content_hash: a.content_hash,
    })),
  };
}

/** Standalone loopback service. No shared upload state, persistence, model calls or database. */
export function createPreviewApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    const allowed = [`127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}`];
    if (!allowed.includes(req.get('host') ?? '') || req.get('sec-fetch-site') === 'cross-site') {
      res.status(403).json({ error: 'Use this preview from its local address.' }); return;
    }
    if (req.method === 'POST' && req.get('origin') !== `http://${req.get('host')}`) {
      res.status(403).json({ error: 'Analysis requests must originate from this preview.' }); return;
    }
    next();
  });
  app.get('/api/demo/:scenario', async (req, res, next) => {
    if (!['complete', 'partial', 'no-report', 'disagreement'].includes(String(req.params.scenario))) {
      res.status(404).json({ error: 'Unknown demo scenario.' }); return;
    }
    try {
      const { bundle, annotations } = await previewDemo(req.params.scenario as DemoScenario);
      res.json({ ...previewAnalysis(bundle, annotations), input_kind: 'synthetic', scenario: req.params.scenario });
    } catch (error) { next(error); }
  });
  app.post('/api/analyze', (req, res, next) => {
    if (!req.is('application/json')) { res.status(415).json({ error: 'Choose JSON evidence and annotation files.' }); return; }
    next();
  }, express.json({ limit: PREVIEW_LIMIT_BYTES }), (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object' || !req.body.bundle) throw new Error('An evidence bundle is required.');
      res.json({ ...previewAnalysis(req.body.bundle, req.body.annotations), input_kind: 'uploaded' });
    } catch (error) { next(error); }
  });
  app.use(express.static(assets, { etag: false, maxAge: 0 }));
  app.use((_req, res) => { res.status(404).json({ error: 'Preview route not found.' }); });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error.type === 'entity.too.large') { res.status(413).json({ error: 'Combined upload exceeds 10 MiB.' }); return; }
    res.status(400).json({ error: error instanceof Error ? `Cannot analyze this input: ${error.message.slice(0, 600)}` : 'Cannot analyze this input.' });
  };
  app.use(errors);
  return app;
}
