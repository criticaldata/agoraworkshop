import express from 'express';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { getDatabase, type Db } from '../db/index.js';
import { freezeConfig, loadConfigFile } from '../config/load.js';
import { executeRun, WorkshopRunner } from '../orchestrator/runner.js';
import {
  getArtifacts,
  getInvocation,
  getInvocations,
  getMessages,
  getOpportunities,
  getRun,
  listRuns,
  runConfig,
  runsWithConfigHash,
  runSummaries,
  type RunRow,
} from '../db/queries.js';
import { readEvents } from '../events/recorder.js';
import {
  parseViewMode,
  readViewMode,
  safeReturnTo,
  VIEW_MODE_COOKIE,
} from './viewMode.js';
import { phase0Summary } from '../acceptance/summary.js';
import { computeAnalytics } from '../analytics/summary.js';
import { evaluateGates, finalizeReport } from '../acceptance/gates.js';
import { exportRun } from '../export/exporter.js';
import { exportOnCompletion } from '../export/autoExport.js';
import { renderReplayHtml } from '../export/replayHtml.js';
import {
  page,
  provenancePage,
  runsPage,
  timelinePage,
  transcriptPage,
  turnsPage,
  type RunGroup,
} from './pages.js';
import { homePage } from './home.js';
import { docsPage } from './docs.js';
import { codeProvenance, describeProvenance } from '../core/provenance.js';
import { reconcileInterruptedRuns } from '../orchestrator/reconcile.js';
import { buildValidationSet } from '../acceptance/validationSet.js';
import { validationPage } from './validation.js';
import {
  parseExplorerQuery,
  renderExplorer,
  renderInspectorFragment,
  resolveSelection,
  toFilters,
} from './explorer.js';
import { agentPage } from './agentPage.js';
import { parseStructureQuery, structurePage } from './structure.js';
import { comparePage, type ComparePageInput } from './compare.js';
import { apiPage } from './apiPage.js';
import { graphPage } from './graphPage.js';
import { buildRunGraph, type RunGraph } from '../analytics/graph.js';
import {
  latestExtraction,
  listExtractions,
  semanticEdges,
  semanticEvidence,
  semanticNodes,
} from '../semantic/pipeline.js';
import {
  agentTrajectory,
  buildTimeline,
  compareRuns,
  interactionMatrix,
  runMeasures,
} from '../analytics/interaction.js';
import { authConfigFromEnv, createAuthMiddleware, describeAuth } from './auth.js';
import { phase1Router } from './phase1.js';
import { wp06Router } from './wp06.js';

const CONFIG_DIR = resolve(process.env.AGORA_CONFIG_DIR ?? './configs');

const db = getDatabase();

// Before anything can start a new run. A run left RUNNING in the database is one this
// process cannot own, because this process has only just started; the only honest
// reading is that a previous process was interrupted mid-run.
const reconciled = reconcileInterruptedRuns(db);

/**
 * Cache key for the client assets, derived from their contents.
 *
 * Keying on the deployed revision instead would be wrong twice over: an edit to a script
 * would not change the key during development, and a deploy that touched no asset would
 * throw the cache away for nothing.
 */
const ASSET_VERSION = (() => {
  const dir = resolve(process.env['AGORA_STATIC_DIR'] ?? './static');
  const hash = createHash('sha256');
  for (const name of ['cytoscape.min.js', 'graph.js', 'timeline.js']) {
    try {
      hash.update(readFileSync(join(dir, name)));
    } catch {
      // A missing asset is a deployment problem, not a reason to refuse to start. The
      // page will 404 on it and say so.
      hash.update(name);
    }
  }
  return hash.digest('hex').slice(0, 12);
})();

const app = express();
// Access control runs before body parsing, so an unauthenticated request is refused
// before anything it sent is read.
const authConfig = authConfigFromEnv();
app.use(createAuthMiddleware(authConfig));

app.use('/wp06', wp06Router(authConfig));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(phase1Router(db, join(CONFIG_DIR, 'agora_phase0_1_context_contract.yaml')));

/** Runs launched from the UI execute in-process; this tracks the live ones. */
const active = new Map<string, WorkshopRunner>();

function availableConfigs(): string[] {
  try {
    return readdirSync(CONFIG_DIR)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json'))
      .sort();
  } catch {
    return [];
  }
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, runs: listRuns(db, 1).length >= 0, configs: availableConfigs().length });
});

// ------------------------------------------------------------------ pages

app.get('/', (req, res) => {
  const runs = listRuns(db);
  const latestRun = runs.find((run) => run.status === 'COMPLETED') ?? null;
  res.type('html').send(
    homePage({
      mode: readViewMode(req.headers.cookie),
      latestRun,
      latestEvents: latestRun ? readEvents(db, latestRun.run_id) : [],
      runCount: runs.length,
    }),
  );
});

/**
 * Switching between the simple view and the technical one.
 *
 * A preference, not a mutation of any record, but it is kept in a cookie so it survives
 * a link followed from outside and a page opened tomorrow. The return path is validated
 * rather than trusted: it arrives in a form field like any other input.
 */
app.post('/view-mode', (req, res) => {
  res.cookie(VIEW_MODE_COOKIE, parseViewMode(req.body?.mode), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  res.redirect(303, safeReturnTo(req.body?.return_to));
});

app.get('/docs', (req, res) => {
  res.type('html').send(docsPage(readViewMode(req.headers.cookie)));
});

app.get('/runs', (req, res) => {
  const notice = typeof req.query['notice'] === 'string' ? req.query['notice'] : null;
  const q = String(req.query['q'] ?? '').trim();
  const model = typeof req.query['model'] === 'string' ? req.query['model'] : null;
  const status = typeof req.query['status'] === 'string' ? req.query['status'] : null;
  const comparableOnly = req.query['comparable'] === '1';

  const all = listRuns(db, 500);
  const needle = q.toLowerCase();
  const matches = all.filter((run) => {
    if (model && run.model !== model) return false;
    if (status && run.status !== status) return false;
    if (!needle) return true;
    return (
      run.run_id.toLowerCase().includes(needle) ||
      run.experiment_id.toLowerCase().includes(needle) ||
      run.config_hash.toLowerCase().includes(needle)
    );
  });

  // Group by settings fingerprint, newest group first. Runs sharing a fingerprint were
  // carried out under identical conditions, which is the comparison that matters.
  const byHash = new Map<string, RunGroup>();
  for (const run of matches) {
    const existing = byHash.get(run.config_hash);
    if (existing) {
      existing.runs.push(run);
      continue;
    }
    const config = runConfig(run);
    byHash.set(run.config_hash, {
      configHash: run.config_hash,
      experimentId: run.experiment_id,
      model: run.model,
      moderatorMode: config.moderator.mode ?? 'llm',
      topic: config.workshop.topic,
      runs: [run],
    });
  }

  const groups = [...byHash.values()].filter(
    (group) =>
      !comparableOnly || group.runs.filter((r) => r.status === 'COMPLETED').length >= 2,
  );
  const shown = groups.flatMap((g) => g.runs);

  res.type('html').send(
    runsPage({
      groups,
      summaries: runSummaries(db, shown.map((r) => r.run_id)),
      configs: availableConfigs(),
      notice,
      totalRuns: all.length,
      shownRuns: shown.length,
      filter: { q, model, status, comparableOnly },
      models: [...new Set(all.map((r) => r.model))].sort(),
      statuses: [...new Set(all.map((r) => r.status))].sort(),
      mode: readViewMode(req.headers.cookie),
      returnTo: req.originalUrl,
    }),
  );
});

app.post('/runs', (req, res) => {
  const name = String(req.body?.config ?? '');
  if (!availableConfigs().includes(name)) {
    res.redirect(`/runs?notice=${encodeURIComponent('Unknown config file')}`);
    return;
  }
  try {
    const frozen = loadConfigFile(resolve(CONFIG_DIR, name));
    const runId = launch(frozen, null);
    res.redirect(`/runs/${runId}`);
  } catch (error) {
    res.redirect(`/runs?notice=${encodeURIComponent(message(error))}`);
  }
});

app.post('/runs/:runId/rerun', (req, res) => {
  const source = getRun(db, String(req.params['runId']));
  if (!source) {
    res.redirect(`/runs?notice=${encodeURIComponent('Unknown run')}`);
    return;
  }
  const frozen = freezeConfig(JSON.parse(source.config_json), source.config_source_path);
  const runId = launch(frozen, source.run_id);
  res.redirect(`/runs/${runId}`);
});

/**
 * A run opens into its graph. The other views are routes of their own rather than
 * sections of one long page, and each carries the masthead back to the run.
 */
function runViewContext(req: express.Request, res: express.Response) {
  const runId = String(req.params['runId']);
  const run = getRun(db, runId);
  if (!run) {
    res.status(404).type('html').send(page('Not found', '<h1>Run not found</h1>'));
    return null;
  }
  const config = runConfig(run);
  const events = readEvents(db, runId);
  const messages = getMessages(db, runId);
  const invocations = getInvocations(db, runId);
  return {
    runId,
    run,
    config,
    events,
    messages,
    invocations,
    analytics: computeAnalytics(db, runId),
    acceptance: finalizeReport(evaluateGates({ db, runId })),
    isRunning: run.status === 'RUNNING' || active.has(runId),
    mode: readViewMode(req.headers.cookie),
    returnTo: req.originalUrl,
  };
}

app.get('/runs/:runId', (req, res) => {
  const ctx = runViewContext(req, res);
  if (!ctx) return;
  res.type('html').send(
    graphPage({
      run: ctx.run,
      config: ctx.config,
      graph: composeGraph(db, ctx.run, ctx.config),
      extractions: listExtractions(db, ctx.runId),
      assetVersion: ASSET_VERSION,
      mode: ctx.mode,
      returnTo: ctx.returnTo,
    }),
  );
});

app.get('/runs/:runId/timeline', (req, res) => {
  const ctx = runViewContext(req, res);
  if (!ctx) return;
  const parsed = parseExplorerQuery(req.query as Record<string, unknown>);
  const timeline = buildTimeline({
    config: ctx.config,
    events: ctx.events,
    messages: ctx.messages,
    filters: toFilters(parsed),
  });
  const query = resolveSelection(parsed, timeline);

  const explorerInput = {
    run: ctx.run,
    config: ctx.config,
    timeline,
    events: ctx.events,
    messages: ctx.messages,
    invocations: ctx.invocations,
    query,
  };

  // The inspector on its own, for opening a marker without reloading the page.
  if (req.query['fragment'] === 'inspector') {
    res.type('html').send(renderInspectorFragment(explorerInput));
    return;
  }

  res.type('html').send(
    timelinePage({
      ...ctx,
      exportedFiles: getArtifacts(db, ctx.runId).length,
      assetVersion: ASSET_VERSION,
      explorer: renderExplorer({
        run: ctx.run,
        config: ctx.config,
        timeline,
        events: ctx.events,
        messages: ctx.messages,
        invocations: ctx.invocations,
        query,
      }),
    }),
  );
});

app.get('/runs/:runId/transcript', (req, res) => {
  const ctx = runViewContext(req, res);
  if (!ctx) return;
  res.type('html').send(transcriptPage({ ...ctx, explorer: '' }));
});

app.get('/runs/:runId/turns', (req, res) => {
  const ctx = runViewContext(req, res);
  if (!ctx) return;
  res.type('html').send(turnsPage({ ...ctx, explorer: '' }));
});

/**
 * Comparable groups: one settings fingerprint with two or more completed runs. Anything
 * with fewer cannot show run-to-run variation, so it is not offered as a comparison.
 */
function comparableGroups(): ComparePageInput['groups'] {
  const byHash = new Map<string, RunRow[]>();
  for (const run of listRuns(db, 500)) {
    if (run.status !== 'COMPLETED') continue;
    byHash.set(run.config_hash, [...(byHash.get(run.config_hash) ?? []), run]);
  }
  return [...byHash.entries()]
    .filter(([, runs]) => runs.length >= 2)
    .map(([configHash, runs]) => {
      const config = runConfig(runs[0]!);
      return {
        configHash,
        experimentId: runs[0]!.experiment_id,
        model: runs[0]!.model,
        moderatorMode: config.moderator.mode ?? 'llm',
        runIds: runs.map((r) => r.run_id),
      };
    });
}

app.get('/compare', (req, res) => {
  const requested = String(req.query['runs'] ?? '')
    .split(',')
    .filter(Boolean);
  const hash = typeof req.query['hash'] === 'string' ? req.query['hash'] : null;

  const runs = hash
    ? runsWithConfigHash(db, hash).filter((r) => r.status === 'COMPLETED')
    : requested.map((id) => getRun(db, id)).filter((r): r is RunRow => r !== null);

  const measures = runs.map((run) =>
    runMeasures(
      run,
      runConfig(run),
      getMessages(db, run.run_id),
      getOpportunities(db, run.run_id),
      getInvocations(db, run.run_id),
    ),
  );

  // Only the first few timelines are drawn: past that the page stops being readable and
  // the measures table carries the comparison anyway.
  const timelines = runs.slice(0, 3).map((run) => {
    const config = runConfig(run);
    return {
      runId: run.run_id,
      config,
      timeline: buildTimeline({
        config,
        events: readEvents(db, run.run_id),
        messages: getMessages(db, run.run_id),
      }),
    };
  });

  res.type('html').send(
    comparePage({
      comparison: compareRuns(measures),
      timelines,
      groups: comparableGroups(),
    }),
  );
});

app.get('/runs/:runId/structure', (req, res) => {
  const runId = String(req.params['runId']);
  const run = getRun(db, runId);
  if (!run) {
    res.status(404).type('html').send(page('Not found', '<h1>Run not found</h1>'));
    return;
  }
  const config = runConfig(run);
  const messages = getMessages(db, runId);
  const query = parseStructureQuery(req.query as Record<string, unknown>);
  const matrix = interactionMatrix(config, messages, getInvocations(db, runId), query.metric, {
    channel: query.channel,
    phase: query.phase,
  });

  res.type('html').send(
    structurePage({
      run,
      config,
      matrix,
      messages,
      query,
      phases: [...new Set(messages.map((m) => m.workshop_state))],
      mode: readViewMode(req.headers.cookie),
      returnTo: req.originalUrl,
    }),
  );
});

app.get('/runs/:runId/agents/:agentId', (req, res) => {
  const runId = String(req.params['runId']);
  const agentId = String(req.params['agentId']);
  const run = getRun(db, runId);
  if (!run) {
    res.status(404).type('html').send(page('Not found', '<h1>Run not found</h1>'));
    return;
  }
  const config = runConfig(run);
  const known = [config.moderator.id, ...config.participants.map((p) => p.id)];
  if (!known.includes(agentId)) {
    res
      .status(404)
      .type('html')
      .send(page('Not found', '<h1>No such participant in this run</h1>'));
    return;
  }

  res.type('html').send(
    agentPage(
      run,
      config,
      agentTrajectory(
        config,
        agentId,
        readEvents(db, runId),
        getMessages(db, runId),
        getOpportunities(db, runId),
        getInvocations(db, runId),
      ),
      readViewMode(req.headers.cookie),
      req.originalUrl,
    ),
  );
});

app.get('/runs/:runId/validation', (req, res) => {
  const runId = String(req.params['runId']);
  const run = getRun(db, runId);
  if (!run) {
    res.status(404).type('html').send(page('Not found', '<h1>Run not found</h1>'));
    return;
  }
  const invocations = getInvocations(db, runId);
  res.type('html').send(
    validationPage({
      set: buildValidationSet({ db, runId }),
      checks: phase0Summary(db, runId, finalizeReport(evaluateGates({ db, runId }))),
      mode: readViewMode(req.headers.cookie),
      returnTo: req.originalUrl,
      run,
      config: runConfig(run),
      analytics: computeAnalytics(db, runId),
      comparableRunIds: runsWithConfigHash(db, run.config_hash)
        .filter((r) => r.run_id !== runId)
        .map((r) => r.run_id),
      sampleInvocationId: invocations[0]?.invocation_id ?? null,
      exportedFiles: getArtifacts(db, runId).length,
    }),
  );
});

app.get('/api/runs/:runId/validation', (req, res) => {
  const runId = String(req.params['runId']);
  if (!getRun(db, runId)) {
    res.status(404).json({ error: 'unknown run' });
    return;
  }
  res.json(buildValidationSet({ db, runId }));
});

app.get('/runs/:runId/replay', (req, res) => {
  const runId = String(req.params['runId']);
  const run = getRun(db, runId);
  if (!run) {
    res.status(404).send('run not found');
    return;
  }
  res.type('html').send(
    renderReplayHtml({
      run,
      config: runConfig(run),
      events: readEvents(db, runId),
      messages: getMessages(db, runId),
      invocations: getInvocations(db, runId),
      analytics: computeAnalytics(db, runId),
      acceptance: finalizeReport(evaluateGates({ db, runId })),
    }),
  );
});

app.get('/runs/:runId/invocations/:invocationId', (req, res) => {
  const run = getRun(db, String(req.params['runId']));
  const invocation = getInvocation(db, String(req.params['invocationId']));
  if (!run || !invocation) {
    res.status(404).type('html').send(page('Not found', '<h1>Invocation not found</h1>'));
    return;
  }
  res.type('html').send(provenancePage(run, invocation));
});

// -------------------------------------------------------------------- api

/**
 * Vendored client assets for the graph view. Served from the application itself, with a
 * long cache life because the filenames change only when the files do.
 */
app.use(
  '/static',
  express.static(resolve(process.env['AGORA_STATIC_DIR'] ?? './static'), {
    maxAge: '1h',
    fallthrough: false,
  }),
);

app.get('/runs/:runId/graph', (req, res) => {
  // The graph is the run's own page now. The old address still works.
  res.redirect(301, `/runs/${encodeURIComponent(String(req.params['runId']))}`);
});

app.get('/api/runs/:runId/graph', (req, res) => {
  const runId = String(req.params['runId']);
  const run = getRun(db, runId);
  if (!run) {
    res.status(404).json({ error: 'unknown run' });
    return;
  }
  res.json(composeGraph(db, run, runConfig(run)));
});

/** Evidence behind one derived node: the messages it was read out of. */
app.get('/api/runs/:runId/semantic/:nodeId', (req, res) => {
  const runId = String(req.params['runId']);
  const nodeId = String(req.params['nodeId']);
  const extraction = latestExtraction(db, runId);
  if (!extraction) {
    res.status(404).json({ error: 'no completed extraction for this run' });
    return;
  }
  res.json({
    extraction_id: extraction.extraction_id,
    node_id: nodeId,
    evidence: semanticEvidence(db, extraction.extraction_id, nodeId),
  });
});

app.get('/api', (_req, res) => {
  res.type('html').send(apiPage(listRuns(db, 1)[0] ?? null));
});

app.get('/api/configs', (_req, res) => res.json({ configs: availableConfigs() }));
app.get('/api/runs', (_req, res) => res.json({ runs: listRuns(db) }));

app.post('/api/runs', (req, res) => {
  const name = String(req.body?.config ?? '');
  if (!availableConfigs().includes(name)) {
    res.status(400).json({ error: 'unknown config' });
    return;
  }
  try {
    const frozen = loadConfigFile(resolve(CONFIG_DIR, name));
    const runId = launch(frozen, null);
    res.status(202).json({ run_id: runId, config_hash: frozen.hash });
  } catch (error) {
    res.status(400).json({ error: message(error) });
  }
});

app.post('/api/runs/:runId/rerun', (req, res) => {
  const source = getRun(db, String(req.params['runId']));
  if (!source) {
    res.status(404).json({ error: 'unknown run' });
    return;
  }
  const frozen = freezeConfig(JSON.parse(source.config_json), source.config_source_path);
  const runId = launch(frozen, source.run_id);
  res.status(202).json({ run_id: runId, config_hash: frozen.hash, source_run_id: source.run_id });
});

app.get('/api/runs/:runId', (req, res) => {
  const run = getRun(db, String(req.params['runId']));
  if (!run) {
    res.status(404).json({ error: 'unknown run' });
    return;
  }
  res.json({ ...run, config: runConfig(run), live: active.has(run.run_id) });
});

app.get('/api/runs/:runId/events', (req, res) =>
  res.json({ events: readEvents(db, String(req.params['runId'])) }),
);
app.get('/api/runs/:runId/messages', (req, res) =>
  res.json({ messages: getMessages(db, String(req.params['runId'])) }),
);
app.get('/api/runs/:runId/opportunities', (req, res) =>
  res.json({ opportunities: getOpportunities(db, String(req.params['runId'])) }),
);
app.get('/api/runs/:runId/invocations', (req, res) =>
  res.json({ invocations: getInvocations(db, String(req.params['runId'])) }),
);

app.get('/api/runs/:runId/analytics', (req, res) => {
  try {
    res.json(computeAnalytics(db, String(req.params['runId'])));
  } catch (error) {
    res.status(404).json({ error: message(error) });
  }
});

app.get('/api/runs/:runId/acceptance', (req, res) => {
  const runId = String(req.params['runId']);
  const faultRun = req.query['fault_run'];
  const rerun = req.query['rerun'];
  try {
    res.json(
      finalizeReport(
        evaluateGates({
          db,
          runId,
          failureEvidenceRunId: typeof faultRun === 'string' ? faultRun : null,
          reproducibilityRunId: typeof rerun === 'string' ? rerun : null,
        }),
      ),
    );
  } catch (error) {
    res.status(404).json({ error: message(error) });
  }
});

app.post('/runs/:runId/export', (req, res) => {
  const runId = String(req.params['runId']);
  // Only ever back to a page of this run. A redirect target taken from a request body
  // is an open redirect unless it is constrained, whatever else is guarding the route.
  const requested = String(req.body?.back ?? '');
  const back =
    requested === `/runs/${runId}/validation` ? requested : `/runs/${runId}`;
  try {
    exportRun({ db, runId });
    res.redirect(303, back);
  } catch (error) {
    res
      .status(400)
      .type('html')
      .send(page('Export failed', `<h1>Export failed</h1><p>${message(error)}</p>`));
  }
});

app.post('/api/runs/:runId/export', (req, res) => {
  const runId = String(req.params['runId']);
  const faultRun = req.query['fault_run'];
  const rerun = req.query['rerun'];
  try {
    const result = exportRun({
      db,
      runId,
      failureEvidenceRunId: typeof faultRun === 'string' ? faultRun : null,
      reproducibilityRunId: typeof rerun === 'string' ? rerun : null,
    });
    res.json({
      run_id: result.runId,
      directory: result.directory,
      files: result.files,
      ready_for_controlled_behavioral_experiment:
        result.acceptance.ready_for_controlled_behavioral_experiment,
    });
  } catch (error) {
    res.status(400).json({ error: message(error) });
  }
});

// ---------------------------------------------------------------- helpers

/**
 * The graph for a run: recorded communication always, plus the most recent completed
 * extraction when one exists. Rendering a page never starts an extraction, because
 * extraction calls a model and costs money.
 */
function composeGraph(db: Db, run: RunRow, config: ReturnType<typeof runConfig>): RunGraph {
  const runId = run.run_id;
  const messages = getMessages(db, runId);
  const events = readEvents(db, runId);
  const timeline = buildTimeline({ config, events, messages });
  const extraction = latestExtraction(db, runId);

  return buildRunGraph({
    runId,
    config,
    messages,
    opportunities: getOpportunities(db, runId),
    invocations: getInvocations(db, runId),
    phases: timeline.phases.map((p) => ({
      phase: String(p.phase),
      label: p.label,
      fromSequence: p.fromSequence,
      toSequence: p.toSequence,
    })),
    semantic: extraction
      ? {
          extraction: {
            extractionId: extraction.extraction_id,
            method: extraction.extraction_method,
            model: extraction.model,
            pipelineVersion: extraction.pipeline_version,
            promptVersion: extraction.prompt_version,
            createdAt: extraction.created_at,
          },
          nodes: semanticNodes(db, extraction.extraction_id),
          edges: semanticEdges(db, extraction.extraction_id),
        }
      : null,
  });
}

function launch(frozen: ReturnType<typeof freezeConfig>, sourceRunId: string | null): string {
  const runner = new WorkshopRunner({
    db,
    frozen,
    sourceRunId,
    provenance: codeProvenance(),
  });
  active.set(runner.id, runner);
  void runner
    .execute()
    .then((result) => {
      // Exporting is part of finishing a run, not a chore for the operator.
      exportOnCompletion(db, runner.id, result.status, console.error);
    })
    .catch((error: unknown) => {
      console.error(`run ${runner.id} failed:`, message(error));
    })
    .finally(() => {
      active.delete(runner.id);
    });
  return runner.id;
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`AGORA WORKSHOP Phase 0 listening on :${port}`);
  console.log(`  data:    ${process.env.AGORA_DATA_DIR ?? './data'}`);
  console.log(`  configs: ${CONFIG_DIR} (${availableConfigs().join(', ') || 'none found'})`);
  console.log(`  ${describeAuth(authConfig)}`);
  console.log(`  code:    ${describeProvenance(codeProvenance())}`);
  if (reconciled.interrupted.length > 0) {
    for (const run of reconciled.interrupted) {
      console.log(
        `  marked ${run.run_id} INTERRUPTED (was ${run.previous_status}, ` +
          `${run.events_preserved} events kept, ${run.opportunities_resolved} turns unresolved)`,
      );
    }
  }
});

export { app, executeRun };
