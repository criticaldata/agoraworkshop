import { describe, expect, it } from 'vitest';
import {
  runsPage,
  timelinePage,
  transcriptPage,
  turnsPage,
  provenancePage,
  type RunGroup,
} from '../src/server/pages.js';
import { parseExplorerQuery, renderExplorer, toFilters } from '../src/server/explorer.js';
import { buildTimeline } from '../src/analytics/interaction.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { readEvents } from '../src/events/recorder.js';
import {
  getInvocations,
  getMessages,
  getRun,
  runConfig,
  runSummaries,
} from '../src/db/queries.js';
import { computeAnalytics } from '../src/analytics/summary.js';
import { evaluateGates, finalizeReport } from '../src/acceptance/gates.js';
import { frozen, tempDb } from './helpers.js';

async function completedRun() {
  const db = tempDb();
  const config = frozen({
    fault_injection: {
      enabled: true,
      faults: [
        {
          agent_id: 'agent_2',
          state: 'PUBLIC_DISCUSSION',
          occurrence: 1,
          kind: 'timeout',
          recover_after_attempts: 1,
        },
      ],
    },
  });
  const runner = new WorkshopRunner({ db, frozen: config });
  await runner.execute();
  return { db, runId: runner.id };
}

describe('runs list', () => {
  it('groups runs by settings fingerprint rather than listing them flat', async () => {
    const { db, runId } = await completedRun();
    const run = getRun(db, runId)!;
    const groups: RunGroup[] = [
      {
        configHash: run.config_hash,
        experimentId: run.experiment_id,
        model: run.model,
        moderatorMode: 'llm',
        topic: runConfig(run).workshop.topic,
        runs: [run],
      },
    ];

    const html = runsPage({
      groups,
      summaries: runSummaries(db, [runId]),
      configs: ['a.yaml'],
      notice: null,
      totalRuns: 1,
      shownRuns: 1,
      filter: { q: '', model: null, status: null, comparableOnly: false },
      models: [],
      statuses: [],
    });
    expect(html).toContain('grouped by the fingerprint');
    expect(html).toContain(run.experiment_id);
    expect(html).toContain(runConfig(run).workshop.topic);
    // The identifier is shortened for scanning but still links to the full run.
    expect(html).toContain(`/runs/${runId}`);
  });

  it('shows counts per run so the list can be scanned without opening each one', async () => {
    const { db, runId } = await completedRun();
    const run = getRun(db, runId)!;
    const summaries = runSummaries(db, [runId]);
    const summary = summaries.get(runId)!;

    expect(summary.public_messages).toBeGreaterThan(0);
    expect(summary.private_messages).toBeGreaterThan(0);

    const html = runsPage({
      groups: [
        {
          configHash: run.config_hash,
          experimentId: run.experiment_id,
          model: run.model,
          moderatorMode: 'llm',
          topic: 'topic',
          runs: [run],
        },
      ],
      summaries,
      configs: [],
      notice: null,
      totalRuns: 1,
      shownRuns: 1,
      filter: { q: '', model: null, status: null, comparableOnly: false },
      models: [],
      statuses: [],
    });
    expect(html).toContain(`<b>${summary.public_messages}</b> public`);
    expect(html).toContain(`<b>${summary.private_messages}</b> private`);
  });

  it('gives a direction rather than a blank space when there are no runs', () => {
    const html = runsPage({
      groups: [],
      summaries: new Map(),
      configs: ['a.yaml'],
      notice: null,
      totalRuns: 0,
      shownRuns: 0,
      filter: { q: '', model: null, status: null, comparableOnly: false },
      models: [],
      statuses: [],
    });
    expect(html).toContain('No runs recorded yet');
    expect(html).toContain('Start run');
  });
});

describe('run views', () => {
  async function views() {
    const { db, runId } = await completedRun();
    const run = getRun(db, runId)!;
    const config = runConfig(run);
    const events = readEvents(db, runId);
    const messages = getMessages(db, runId);
    const invocations = getInvocations(db, runId);
    const query = parseExplorerQuery({});
    const base = {
      run,
      config,
      events,
      messages,
      invocations,
      analytics: computeAnalytics(db, runId),
      acceptance: finalizeReport(evaluateGates({ db, runId })),
      isRunning: false,
    };
    return {
      db,
      runId,
      run,
      invocations,
      timeline: timelinePage({
        ...base,
        exportedFiles: 0,
        assetVersion: 'testasset',
        explorer: renderExplorer({
          run,
          config,
          timeline: buildTimeline({ config, events, messages, filters: toFilters(query) }),
          events,
          messages,
          invocations,
          query,
        }),
      }),
      transcript: transcriptPage({ ...base, explorer: '' }),
      turns: turnsPage({ ...base, explorer: '' }),
    };
  }

  it('carries the run and every other view on each one', async () => {
    const v = await views();
    for (const html of [v.timeline, v.transcript, v.turns]) {
      // The way back to the run list, and across to each sibling view.
      expect(html).toContain('href="/runs"');
      expect(html).toContain(`href="/runs/${v.runId}"`);
      expect(html).toContain(`href="/runs/${v.runId}/timeline"`);
      expect(html).toContain(`href="/runs/${v.runId}/structure"`);
      expect(html).toContain(`href="/runs/${v.runId}/transcript"`);
      expect(html).toContain(`href="/runs/${v.runId}/turns"`);
      expect(html).toContain(`href="/runs/${v.runId}/validation"`);
      expect(html).not.toContain('${');
    }
  });

  it('marks which view is open, once, on each page', async () => {
    const v = await views();
    const current = (html: string) => (html.match(/aria-current="page"/g) ?? []).length;
    expect(current(v.timeline)).toBe(1);
    expect(current(v.transcript)).toBe(1);
    expect(current(v.turns)).toBe(1);
    expect(v.turns).toContain('href="/runs/' + v.runId + '/turns"\n              title=');
  });

  it('keeps navigation and spending apart', async () => {
    const v = await views();
    // Nothing inside the view strip submits anything.
    const strip = v.timeline.slice(
      v.timeline.indexOf('<nav class="rn-views"'),
      v.timeline.indexOf('</nav>', v.timeline.indexOf('<nav class="rn-views"')),
    );
    expect(strip).not.toContain('<form');
    expect(strip).not.toContain('<button');
  });

  it('lists every turn including failed attempts, each linking to its context', async () => {
    const v = await views();
    const failed = v.invocations.filter((i) => i.outcome === 'infra_failure');
    expect(failed.length).toBeGreaterThan(0);

    for (const invocation of v.invocations) {
      expect(v.turns).toContain(`/runs/${v.runId}/invocations/${invocation.invocation_id}`);
    }
    expect(v.turns).toContain(failed[0]!.failure_category!);
  });

  it('shows phases in readable form rather than as log constants', async () => {
    const v = await views();
    expect(v.turns).toContain('Open discussion');
    expect(v.turns).not.toContain('<td class="muted">PUBLIC_DISCUSSION</td>');
  });
});

describe('provenance page', () => {
  it('separates the recorded metadata from the material the agent received', async () => {
    const { db, runId } = await completedRun();
    const run = getRun(db, runId)!;
    const invocation = getInvocations(db, runId).find((i) => i.outcome === 'success')!;
    const html = provenancePage(run, invocation);

    expect(html).toContain('prov-side');
    expect(html).toContain('System prompt');
    expect(html).toContain('Generation parameters');
    expect(html).toContain('Source messages');
    expect(html).toContain(`/runs/${runId}#turns`);
  });

  it('reports how many messages were included and how they split by channel', async () => {
    const { db, runId } = await completedRun();
    const run = getRun(db, runId)!;
    const invocation = getInvocations(db, runId).filter((i) => i.outcome === 'success').at(-1)!;
    const ids = JSON.parse(invocation.context_message_ids) as string[];
    const html = provenancePage(run, invocation);
    expect(html).toContain(`${ids.length} in total`);
  });
});
