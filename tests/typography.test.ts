import { describe, expect, it } from 'vitest';
import { homePage } from '../src/server/home.js';
import { docsPage } from '../src/server/docs.js';
import {
  runsPage,
  timelinePage,
  transcriptPage,
  turnsPage,
  provenancePage,
} from '../src/server/pages.js';
import { renderReplayHtml } from '../src/export/replayHtml.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { readEvents } from '../src/events/recorder.js';
import {
  getInvocations,
  getMessages,
  getOpportunities,
  getRun,
  runConfig,
  runSummaries,
} from '../src/db/queries.js';
import { parseExplorerQuery, renderExplorer, toFilters } from '../src/server/explorer.js';
import { structurePage, parseStructureQuery } from '../src/server/structure.js';
import { agentPage } from '../src/server/agentPage.js';
import { comparePage } from '../src/server/compare.js';
import { apiPage } from '../src/server/apiPage.js';
import {
  agentTrajectory,
  buildTimeline,
  compareRuns,
  interactionMatrix,
  runMeasures,
} from '../src/analytics/interaction.js';
import { computeAnalytics } from '../src/analytics/summary.js';
import { evaluateGates, finalizeReport } from '../src/acceptance/gates.js';
import { frozen, tempDb } from './helpers.js';

const EM_DASH = '—';

/**
 * The interface uses no em dashes. This renders every page and reports the surrounding
 * text of any that appear, so a new one cannot be added without the failure naming it.
 *
 * Agent-authored content is excluded: prompt text and message bodies are experimental
 * material displayed verbatim, and rewriting them would change what was actually sent.
 */
/**
 * Removes content that is recorded experimental material shown verbatim: system prompts
 * and rendered context in <pre> blocks, and agent message bodies in transcript bubbles.
 * Rewriting those would change what was actually sent to the model, so they are outside
 * the scope of interface typography.
 */
function chromeOnly(html: string): string {
  return html
    .replace(/<pre[\s\S]*?<\/pre>/g, '<pre></pre>')
    .replace(/<div class="bubble[\s\S]*?<\/div>/g, '<div class="bubble"></div>');
}

function offendingLines(html: string): string[] {
  return chromeOnly(html)
    .split('\n')
    .filter((line) => line.includes(EM_DASH))
    .map((line) => line.trim().slice(0, 160));
}

async function renderedPages(): Promise<Array<[string, string]>> {
  const db = tempDb();
  const runner = new WorkshopRunner({
    db,
    frozen: frozen({
      fault_injection: {
        enabled: true,
        faults: [
          {
            agent_id: 'agent_2',
            state: 'PUBLIC_DISCUSSION',
            occurrence: 1,
            kind: 'timeout',
            recover_after_attempts: null,
          },
        ],
      },
    }),
  });
  await runner.execute();
  const runId = runner.id;
  const run = getRun(db, runId)!;

  const input = {
    run,
    config: runConfig(run),
    events: readEvents(db, runId),
    messages: getMessages(db, runId),
    invocations: getInvocations(db, runId),
    analytics: computeAnalytics(db, runId),
    acceptance: finalizeReport(evaluateGates({ db, runId })),
  };

  const failed = input.invocations.find((i) => i.outcome === 'infra_failure')!;

  const explorerQuery = parseExplorerQuery({ infra: '1' });
  const timeline = buildTimeline({
    config: input.config,
    events: input.events,
    messages: input.messages,
    filters: toFilters(explorerQuery),
  });
  const explorer = renderExplorer({
    run,
    config: input.config,
    timeline,
    events: input.events,
    messages: input.messages,
    invocations: input.invocations,
    query: { ...explorerQuery, selected: timeline.markers[0]?.sequence ?? null },
  });

  return [
    ['overview', homePage({ mode: 'full', latestRun: run, latestEvents: input.events, runCount: 1 })],
    ['documentation', docsPage()],
    [
      'runs list',
      runsPage({ mode: 'full', returnTo: '/',
        groups: [
          {
            configHash: run.config_hash,
            experimentId: run.experiment_id,
            model: run.model,
            moderatorMode: 'llm',
            topic: input.config.workshop.topic,
            runs: [run],
          },
        ],
        summaries: runSummaries(db, [runId]),
        configs: ['agora_phase0_v1.yaml'],
        notice: 'a notice',
        totalRuns: 1,
        shownRuns: 1,
        filter: { q: '', model: 'mock-deterministic-v1', status: null, comparableOnly: false },
        models: ['mock-deterministic-v1'],
        statuses: ['COMPLETED'],
      }),
    ],
    ['timeline view', timelinePage({ mode: 'full', returnTo: '/',
        ...input,
        isRunning: false,
        explorer,
        exportedFiles: 0,
        assetVersion: 'testasset',
      })],
    ['transcript view', transcriptPage({ mode: 'full', returnTo: '/', ...input, isRunning: false, explorer: '' })],
    ['turns view', turnsPage({ mode: 'full', returnTo: '/', ...input, isRunning: false, explorer: '' })],
    ['provenance', provenancePage(run, failed)],
    ['replay', renderReplayHtml(input)],
    [
      'interaction structure',
      structurePage({ mode: 'full', returnTo: '/',
        run,
        config: input.config,
        matrix: interactionMatrix(input.config, input.messages, input.invocations),
        messages: input.messages,
        query: parseStructureQuery({ pair: 'agent_1>agent_2' }),
        phases: [...new Set(input.messages.map((m) => m.workshop_state))],
      }),
    ],
    [
      'agent trajectory',
      agentPage(
        run,
        input.config,
        agentTrajectory(
          input.config,
          'agent_1',
          input.events,
          input.messages,
          getOpportunities(db, runId),
          input.invocations,
        ),
        'full',
        '/',
      ),
    ],
    [
      'compare',
      comparePage({
        comparison: compareRuns([
          runMeasures(
            run,
            input.config,
            input.messages,
            getOpportunities(db, runId),
            input.invocations,
          ),
        ]),
        timelines: [{ runId, config: input.config, timeline }],
        groups: [
          {
            configHash: run.config_hash,
            experimentId: run.experiment_id,
            model: run.model,
            moderatorMode: 'llm',
            runIds: [runId, 'run_other'],
          },
        ],
      }),
    ],
    ['raw api', apiPage(run)],
  ];
}

describe('typography', () => {
  it('uses no em dash anywhere in the interface', async () => {
    const problems: string[] = [];
    for (const [name, html] of await renderedPages()) {
      for (const line of offendingLines(html)) {
        problems.push(`${name}: ${line}`);
      }
    }
    expect(problems, `em dashes found:\n${problems.join('\n')}`).toEqual([]);
  }, 30000);
});
