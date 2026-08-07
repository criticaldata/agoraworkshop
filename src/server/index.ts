import express from 'express';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDatabase } from '../db/index.js';
import { freezeConfig, loadConfigFile } from '../config/load.js';
import { executeRun, WorkshopRunner } from '../orchestrator/runner.js';
import {
  getInvocation,
  getInvocations,
  getMessages,
  getOpportunities,
  getRun,
  listRuns,
  runConfig,
} from '../db/queries.js';
import { readEvents } from '../events/recorder.js';
import { computeAnalytics } from '../analytics/summary.js';
import { evaluateGates, finalizeReport } from '../acceptance/gates.js';
import { exportRun } from '../export/exporter.js';
import { renderReplayHtml } from '../export/replayHtml.js';
import { page, provenancePage, runsPage } from './pages.js';
import { homePage } from './home.js';
import { codeCommitSha } from '../core/git.js';

const CONFIG_DIR = resolve(process.env.AGORA_CONFIG_DIR ?? './configs');

const db = getDatabase();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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

app.get('/', (_req, res) => {
  const runs = listRuns(db);
  const latestRun = runs.find((run) => run.status === 'COMPLETED') ?? null;
  res.type('html').send(
    homePage({
      latestRun,
      latestEvents: latestRun ? readEvents(db, latestRun.run_id) : [],
      runCount: runs.length,
    }),
  );
});

app.get('/runs', (req, res) => {
  const notice = typeof req.query['notice'] === 'string' ? req.query['notice'] : null;
  res.type('html').send(runsPage(listRuns(db), availableConfigs(), notice));
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

app.get('/runs/:runId', (req, res) => {
  const runId = String(req.params['runId']);
  const run = getRun(db, runId);
  if (!run) {
    res.status(404).type('html').send(page('Not found', '<h1>Run not found</h1>'));
    return;
  }
  const config = runConfig(run);
  const events = readEvents(db, runId);
  const messages = getMessages(db, runId);
  const invocations = getInvocations(db, runId);
  const analytics = computeAnalytics(db, runId);
  const acceptance = finalizeReport(evaluateGates({ db, runId }));
  const isRunning = run.status === 'RUNNING' || active.has(runId);

  const replay = renderReplayHtml({ run, config, events, messages, invocations, analytics, acceptance });
  // Splice the replay body into the app chrome so there is one visual system.
  const body = replay.slice(replay.indexOf('<main>') + 6, replay.lastIndexOf('</main>'));

  const actions = `
  <form class="launch" method="post" action="/runs/${runId}/rerun">
    <button type="submit">Rerun this frozen config</button>
    <a href="/runs/${runId}/replay"><button type="button" class="secondary">Standalone replay</button></a>
    <a href="/api/runs/${runId}/export" ><button type="button" class="secondary">Export bundle</button></a>
    <span class="status-line">${isRunning ? 'Run in progress — page refreshes automatically.' : `${invocations.length} invocations recorded`}</span>
  </form>
  <p class="note">Inspect any invocation to see the exact context that produced a message:
  ${invocations
    .slice(0, 40)
    .map(
      (i) =>
        `<a class="mono" href="/runs/${runId}/invocations/${i.invocation_id}">${i.agent_id}#${i.attempt}</a>`,
    )
    .join(' · ')}${invocations.length > 40 ? ' …' : ''}</p>`;

  res.type('html').send(page(`AGORA run ${runId}`, actions + body, { refresh: isRunning }));
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

app.get('/api/runs/:runId/export', (req, res) => {
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

function launch(frozen: ReturnType<typeof freezeConfig>, sourceRunId: string | null): string {
  const runner = new WorkshopRunner({
    db,
    frozen,
    sourceRunId,
    codeCommitSha: codeCommitSha(),
  });
  active.set(runner.id, runner);
  void runner
    .execute()
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
  console.log(`AGORA Phase 0 listening on :${port}`);
  console.log(`  data:    ${process.env.AGORA_DATA_DIR ?? './data'}`);
  console.log(`  configs: ${CONFIG_DIR} (${availableConfigs().join(', ') || 'none found'})`);
});

export { app, executeRun };
