import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import {
  agentTrajectory,
  buildTimeline,
  compareRuns,
  interactionMatrix,
  runMeasures,
} from '../src/analytics/interaction.js';
import {
  parseExplorerQuery,
  renderExplorer,
  renderInspectorFragment,
  resolveSelection,
  toFilters,
} from '../src/server/explorer.js';
import { graphPage } from '../src/server/graphPage.js';
import { buildRunGraph } from '../src/analytics/graph.js';
import {
  extractRunSemantics,
  getExtraction,
  semanticEdges,
  semanticNodes,
} from '../src/semantic/pipeline.js';
import { StubExtractor } from '../src/semantic/extractors.js';
import { agentPage } from '../src/server/agentPage.js';
import { parseStructureQuery, structurePage } from '../src/server/structure.js';
import { comparePage } from '../src/server/compare.js';
import { apiPage } from '../src/server/apiPage.js';
import {
  getInvocations,
  getMessages,
  getOpportunities,
  getRun,
  runConfig,
} from '../src/db/queries.js';
import { readEvents } from '../src/events/recorder.js';
import { freezeConfig } from '../src/config/load.js';
import { frozen, tempDb } from './helpers.js';

const withFaults = () =>
  frozen({
    fault_injection: {
      enabled: true,
      faults: [
        {
          agent_id: 'agent_4',
          state: 'FINAL_DISCUSSION',
          occurrence: 1,
          kind: 'provider_error',
          recover_after_attempts: null,
        },
      ],
    },
  });

async function loaded(config = frozen()) {
  const db = tempDb();
  const runner = new WorkshopRunner({ db, frozen: config });
  await runner.execute();
  const run = getRun(db, runner.id)!;
  return {
    db,
    run,
    runId: runner.id,
    config: runConfig(run),
    events: readEvents(db, runner.id),
    messages: getMessages(db, runner.id),
    opportunities: getOpportunities(db, runner.id),
    invocations: getInvocations(db, runner.id),
  };
}

function explorerHtml(r: Awaited<ReturnType<typeof loaded>>, search: Record<string, unknown> = {}) {
  const query = parseExplorerQuery(search);
  return renderExplorer({
    run: r.run,
    config: r.config,
    timeline: buildTimeline({
      config: r.config,
      events: r.events,
      messages: r.messages,
      filters: toFilters(query),
    }),
    events: r.events,
    messages: r.messages,
    invocations: r.invocations,
    query,
  });
}

describe('run explorer', () => {
  it('draws one lane per participant, each linking to that agent', async () => {
    const r = await loaded();
    const html = explorerHtml(r);

    for (const id of ['moderator', 'agent_1', 'agent_2', 'agent_3', 'agent_4', 'agent_5']) {
      expect(html).toContain(`/runs/${r.runId}/agents/${id}`);
    }
    expect(html).not.toContain('${');
  });

  it('shows the workshop phases as bands over the lanes', async () => {
    const r = await loaded();
    const html = explorerHtml(r);
    for (const label of ['Introduction', 'Public discussion', 'Breakout', 'Final discussion']) {
      expect(html).toContain(label);
    }
  });

  it('gives every marker a shape and a label, not colour alone', async () => {
    const r = await loaded();
    const html = explorerHtml(r);
    // Each marker carries an aria-label naming what it is.
    expect(html).toContain('aria-label="Public message');
    expect(html).toContain('aria-label="Private message');
    expect(html).toContain('Every marker carries a shape and a label as well as a colour.');
  });

  it('hides infrastructure events until asked, and says how many it hid', async () => {
    const r = await loaded(withFaults());
    const plain = explorerHtml(r);
    const detailed = explorerHtml(r, { infra: '1' });

    expect(plain).toContain('Hidden by default so behaviour is legible');
    expect(plain).not.toContain('k-failure');
    expect(detailed).toContain('k-failure');
  });

  it('opens an inspector with the message, its context and its model call', async () => {
    const r = await loaded();
    const marker = buildTimeline({
      config: r.config,
      events: r.events,
      messages: r.messages,
    }).markers.find((m) => m.kind === 'public_message')!;

    const html = explorerHtml(r, { event: String(marker.sequence) });

    expect(html).toContain('What this agent had been given');
    expect(html).toContain('Model call');
    expect(html).toContain('source messages in total');
    // Provenance is reachable from the event, not duplicated into it.
    expect(html).toContain(`/runs/${r.runId}/invocations/`);
  });

  it('describes a failure as an apparatus outcome, not as a choice', async () => {
    const r = await loaded(withFaults());
    const failure = buildTimeline({
      config: r.config,
      events: r.events,
      messages: r.messages,
      filters: { infrastructure: true },
    }).markers.find((m) => m.kind === 'failure')!;

    const html = explorerHtml(r, { event: String(failure.sequence), infra: '1' });
    expect(html).toContain('not what the agent chose to do');
  });

  it('says the records are unchanged when a filter empties the view', async () => {
    const r = await loaded();
    const html = explorerHtml(r, { agents: 'agent_1', channel: 'private', phase: 'CLOSING' });
    expect(html).toContain('The records are unchanged; only this view is narrowed.');
  });
});

describe('agent trajectory page', () => {
  it('reports operational metrics and keeps failure apart from silence', async () => {
    const r = await loaded(withFaults());
    const html = agentPage(
      r.run,
      r.config,
      agentTrajectory(r.config, 'agent_4', r.events, r.messages, r.opportunities, r.invocations),
      'full',
      '/',
    );

    expect(html).toContain('Unavailable turns');
    expect(html).toContain('counted apart from declining to speak');
    expect(html).not.toContain('${');
  });

  it('names no disposition the record cannot support', async () => {
    const r = await loaded();
    const html = agentPage(
      r.run,
      r.config,
      agentTrajectory(r.config, 'agent_1', r.events, r.messages, r.opportunities, r.invocations),
      'full',
      '/',
    ).toLowerCase();

    for (const word of ['coalition', 'influence', 'persuasion', 'dominance', 'alliance']) {
      expect(html).not.toContain(word);
    }
  });
});

describe('interaction structure page', () => {
  function structureHtml(r: Awaited<ReturnType<typeof loaded>>, search: Record<string, unknown> = {}) {
    const query = parseStructureQuery(search);
    return structurePage({ mode: 'full', returnTo: '/',
      run: r.run,
      config: r.config,
      matrix: interactionMatrix(r.config, r.messages, r.invocations, query.metric, {
        channel: query.channel,
        phase: query.phase,
      }),
      messages: r.messages,
      query,
      phases: [...new Set(r.messages.map((m) => m.workshop_state))],
    });
  }

  it('is called an interaction network, never an influence network', async () => {
    const r = await loaded();
    const html = structureHtml(r);
    expect(html).toContain('Interaction network');
    expect(html.toLowerCase()).not.toContain('influence network');
  });

  it('states plainly that a count is not a causal claim', async () => {
    const r = await loaded();
    const html = structureHtml(r);
    expect(html).toContain('does not establish that one caused another');
    expect(html).toContain('not a measure of influence');
  });

  it('offers the underlying messages behind every non-zero cell', async () => {
    const r = await loaded();
    const html = structureHtml(r, { pair: 'agent_1>agent_2' });
    expect(html).toContain('id="pair"');
    expect(html).toContain('Clear selection');
    expect(html).not.toContain('${');
  });

  it('carries the matrix numbers as text for the network drawing', async () => {
    const r = await loaded();
    const html = structureHtml(r);
    // The graphic is labelled and its counts are available without reading the picture.
    expect(html).toContain('The same counts are given as text in the matrix above');
  });
});

describe('compare page', () => {
  async function measures(config = frozen()) {
    const r = await loaded(config);
    return {
      r,
      measures: runMeasures(r.run, r.config, r.messages, r.opportunities, r.invocations),
    };
  }

  it('warns before comparing runs that do not share a configuration', async () => {
    const a = await measures();
    const b = await measures(freezeConfig({ ...JSON.parse(a.r.run.config_json), experiment_id: 'other' }));

    const html = comparePage({
      comparison: compareRuns([a.measures, b.measures]),
      timelines: [],
      groups: [],
    });
    expect(html).toContain('do not share a settings fingerprint');
    expect(html).toContain('Read these comparisons with care');
  });

  it('warns before comparing runs with different moderator policies', async () => {
    const a = await measures();
    const b = await measures(
      frozen({ moderator: { id: 'moderator', display_name: 'Moderator', mode: 'scripted' } }),
    );

    const html = comparePage({
      comparison: compareRuns([a.measures, b.measures]),
      timelines: [],
      groups: [],
    });
    expect(html).toContain('different moderator policies');
  });

  it('never presents a stochastic outcome as a single deterministic number', async () => {
    const a = await measures();
    const b = await measures();

    const html = comparePage({
      comparison: compareRuns([a.measures, b.measures]),
      timelines: [],
      groups: [],
    });
    expect(html).toContain('Range');
    expect(html).toContain('not a prediction of what another run would produce');
    expect(html).toContain('Identical text between runs is not expected');
  });

  it('confirms when runs really do share one configuration', async () => {
    const a = await measures();
    const b = await measures();
    const html = comparePage({
      comparison: compareRuns([a.measures, b.measures]),
      timelines: [],
      groups: [],
    });
    expect(html).toContain('Same configuration.');
  });

  it('offers comparable groups when nothing has been selected', async () => {
    const html = comparePage({
      comparison: compareRuns([]),
      timelines: [],
      groups: [
        {
          configHash: 'sha256:abc',
          experimentId: 'agora_test',
          model: 'mock',
          moderatorMode: 'llm',
          runIds: ['run_a', 'run_b'],
        },
      ],
    });
    expect(html).toContain('Compare these 2');
    expect(html).toContain('/compare?runs=run_a,run_b');
  });
});

describe('raw API page', () => {
  it('lists the data endpoints and marks the ones that spend money', async () => {
    const r = await loaded();
    const html = apiPage(r.run);

    expect(html).toContain('/api/runs/{run_id}/events');
    expect(html).toContain(`/api/runs/${r.runId}/events`);
    expect(html).toContain('credential');
    expect(html).toContain('None of them replaces the records');
    expect(html).not.toContain('${');
  });

  it('renders without a run to link against', () => {
    const html = apiPage(null);
    expect(html).toContain('Record a run to get live links');
    expect(html).not.toContain('${');
  });
});

describe('graph page', () => {
  it('says plainly when nothing has been extracted, and how to do it', async () => {
    const r = await loaded();
    const timeline = buildTimeline({ config: r.config, events: r.events, messages: r.messages });
    const html = graphPage({ mode: 'full', returnTo: '/',
      run: r.run,
      config: r.config,
      graph: buildRunGraph({
        runId: r.runId,
        config: r.config,
        messages: r.messages,
        opportunities: r.opportunities,
        invocations: r.invocations,
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

    expect(html).toContain('No idea extraction for this run');
    expect(html).toContain('never started by opening a page');
    // The Ideas layer cannot be entered when there is nothing derived to show.
    expect(/data-mode="ideas"[\s\S]{0,80}disabled/.test(html)).toBe(true);
    expect(html).not.toContain('${');
  });

  it('warns in the open when the extraction is the meaningless stub', async () => {
    const r = await loaded();
    const summary = await extractRunSemantics({
      db: r.db,
      runId: r.runId,
      extractor: new StubExtractor(),
    });
    const extraction = getExtraction(r.db, summary.extractionId)!;
    const timeline = buildTimeline({ config: r.config, events: r.events, messages: r.messages });

    const html = graphPage({ mode: 'full', returnTo: '/',
      run: r.run,
      config: r.config,
      graph: buildRunGraph({
        runId: r.runId,
        config: r.config,
        messages: r.messages,
        opportunities: r.opportunities,
        invocations: r.invocations,
        phases: timeline.phases.map((p) => ({
          phase: String(p.phase),
          label: p.label,
          fromSequence: p.fromSequence,
          toSequence: p.toSequence,
        })),
        semantic: {
          extraction: {
            extractionId: extraction.extraction_id,
            method: extraction.extraction_method,
            model: extraction.model,
            pipelineVersion: extraction.pipeline_version,
            promptVersion: extraction.prompt_version,
            createdAt: extraction.created_at,
          },
          nodes: semanticNodes(r.db, summary.extractionId),
          edges: semanticEdges(r.db, summary.extractionId),
        },
      }),
      extractions: [extraction],
      assetVersion: 'testasset',
    });

    // The claim is on the page itself; the identifiers sit behind a disclosure so the
    // graph is not pushed off the first screen by its own provenance.
    expect(html).toContain('derived mechanically from word frequency and mean nothing');
    expect(html).toContain('must not be read as a reading of the discussion');
    expect(html).toContain('How this reading was produced');
    expect(html).toContain('Ideas are derived, not recorded');
    // Provenance of the reading is on the page, not buried in the database.
    expect(html).toContain(extraction.pipeline_version);
    expect(html).toContain(extraction.prompt_version);
    expect(html).not.toContain('${');
  });

  it('stamps the client assets so a deploy cannot serve a stale script', async () => {
    const r = await loaded();
    const timeline = buildTimeline({ config: r.config, events: r.events, messages: r.messages });
    const html = graphPage({ mode: 'full', returnTo: '/',
      run: r.run,
      config: r.config,
      graph: buildRunGraph({
        runId: r.runId,
        config: r.config,
        messages: r.messages,
        opportunities: r.opportunities,
        invocations: r.invocations,
        phases: timeline.phases.map((p) => ({
          phase: String(p.phase),
          label: p.label,
          fromSequence: p.fromSequence,
          toSequence: p.toSequence,
        })),
        semantic: null,
      }),
      extractions: [],
      assetVersion: 'abc123',
    });

    expect(html).toContain('/static/graph.js?v=abc123');
    expect(html).toContain('/static/cytoscape.min.js?v=abc123');
  });

  it('offers the same information as text for anyone not reading the picture', async () => {
    const r = await loaded();
    const timeline = buildTimeline({ config: r.config, events: r.events, messages: r.messages });
    const html = graphPage({ mode: 'full', returnTo: '/',
      run: r.run,
      config: r.config,
      graph: buildRunGraph({
        runId: r.runId,
        config: r.config,
        messages: r.messages,
        opportunities: r.opportunities,
        invocations: r.invocations,
        phases: [],
        semantic: null,
      }),
      extractions: [],
      assetVersion: 'v',
    });

    expect(html).toContain('Reading this without the canvas');
    expect(html).toContain(`/runs/${r.runId}/structure`);
    expect(html).toContain('Recorded entities are filled and solid');
  });
});

describe('selecting a marker by message', () => {
  it('resolves a message id to the marker that carries it', async () => {
    const r = await loaded();
    const timeline = buildTimeline({ config: r.config, events: r.events, messages: r.messages });
    const marker = timeline.markers.find((m) => m.messageId)!;

    const resolved = resolveSelection(
      parseExplorerQuery({ message: marker.messageId }),
      timeline,
    );
    expect(resolved.selected).toBe(marker.sequence);
  });

  it('leaves the selection empty rather than guessing at an unknown message', async () => {
    const r = await loaded();
    const timeline = buildTimeline({ config: r.config, events: r.events, messages: r.messages });
    const resolved = resolveSelection(parseExplorerQuery({ message: 'msg_nope' }), timeline);
    expect(resolved.selected).toBeNull();
  });
});

describe('opening a marker without leaving the page', () => {
  it('renders the inspector on its own, with no page around it', async () => {
    const r = await loaded();
    const query = parseExplorerQuery({ event: '8' });
    const timeline = buildTimeline({
      config: r.config,
      events: r.events,
      messages: r.messages,
      filters: toFilters(query),
    });
    const fragment = renderInspectorFragment({
      run: r.run,
      config: r.config,
      timeline,
      events: r.events,
      messages: r.messages,
      invocations: r.invocations,
      query: resolveSelection(query, timeline),
    });

    expect(fragment.startsWith('<div class="ex-inspector')).toBe(true);
    expect(fragment).not.toContain('<!doctype');
    expect(fragment).not.toContain('<nav');
    expect(fragment).not.toContain('${');
  });

  it('keeps every marker a real link, so the view works with no script', async () => {
    const r = await loaded();
    const html = explorerHtml(r);
    // The script only intercepts these; without it they still select the marker.
    expect(html).toContain(`href="/runs/${r.runId}/timeline?event=`);
    expect(html).toContain('data-event="');
  });
});
