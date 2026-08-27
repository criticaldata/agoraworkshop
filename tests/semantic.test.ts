import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import {
  extractRunSemantics,
  getExtraction,
  latestExtraction,
  listExtractions,
  reviewNode,
  semanticEdges,
  semanticEvidence,
  semanticNodes,
} from '../src/semantic/pipeline.js';
import { StubExtractor } from '../src/semantic/extractors.js';
import {
  EXTRACTION_PROMPT_VERSION,
  PIPELINE_VERSION,
  shownLabel,
  type ExtractionRequest,
  type ExtractionOutcome,
  type SemanticExtractor,
} from '../src/semantic/types.js';
import { buildRunGraph, filterGraph } from '../src/analytics/graph.js';
import { buildTimeline } from '../src/analytics/interaction.js';
import {
  getInvocations,
  getMessages,
  getOpportunities,
  getRun,
  runConfig,
} from '../src/db/queries.js';
import { readEvents } from '../src/events/recorder.js';
import { frozen, tempDb } from './helpers.js';

async function recorded() {
  const db = tempDb();
  const runner = new WorkshopRunner({ db, frozen: frozen() });
  await runner.execute();
  const run = getRun(db, runner.id)!;
  return {
    db,
    runId: runner.id,
    run,
    config: runConfig(run),
    events: readEvents(db, runner.id),
    messages: getMessages(db, runner.id),
    opportunities: getOpportunities(db, runner.id),
    invocations: getInvocations(db, runner.id),
  };
}

/** An extractor that returns exactly what a test tells it to. */
class ScriptedExtractor implements SemanticExtractor {
  readonly name = 'scripted';
  readonly provider = 'none';
  readonly model = 'scripted-test';
  readonly method = 'scripted_test';
  constructor(private readonly outcome: ExtractionOutcome) {}
  async extract(_request: ExtractionRequest): Promise<ExtractionOutcome> {
    return this.outcome;
  }
}

describe('semantic extraction', () => {
  it('records the pipeline, model, prompt and code that produced it', async () => {
    const r = await recorded();
    const summary = await extractRunSemantics({
      db: r.db,
      runId: r.runId,
      extractor: new StubExtractor(),
    });

    const row = getExtraction(r.db, summary.extractionId)!;
    expect(row.status).toBe('completed');
    expect(row.pipeline_version).toBe(PIPELINE_VERSION);
    expect(row.prompt_version).toBe(EXTRACTION_PROMPT_VERSION);
    expect(row.extraction_method).toBe('keyword_stub');
    expect(row.messages_considered).toBe(r.messages.length);
    expect(JSON.parse(row.source_trace_ids_json)).toEqual(
      [...new Set(r.messages.map((message) => message.trace_id).filter((trace): trace is string => Boolean(trace)))],
    );
  });

  it('writes a new extraction rather than replacing the previous one', async () => {
    const r = await recorded();
    const first = await extractRunSemantics({
      db: r.db,
      runId: r.runId,
      extractor: new StubExtractor(),
    });
    const second = await extractRunSemantics({
      db: r.db,
      runId: r.runId,
      extractor: new StubExtractor(),
    });

    expect(first.extractionId).not.toBe(second.extractionId);
    expect(listExtractions(r.db, r.runId)).toHaveLength(2);
    // The graph uses the newest, and the older reading remains on record.
    expect(latestExtraction(r.db, r.runId)!.extraction_id).toBe(second.extractionId);
    expect(getExtraction(r.db, first.extractionId)!.status).toBe('completed');
  });

  it('gives every derived node the messages it was read out of', async () => {
    const r = await recorded();
    const summary = await extractRunSemantics({
      db: r.db,
      runId: r.runId,
      extractor: new StubExtractor(),
    });

    const nodes = semanticNodes(r.db, summary.extractionId);
    expect(nodes.length).toBeGreaterThan(0);
    const messageIds = new Set(r.messages.map((m) => m.message_id));

    for (const node of nodes) {
      const evidence = semanticEvidence(r.db, summary.extractionId, node.node_id);
      // A node with no evidence is a defect, not a finding.
      expect(evidence.length).toBeGreaterThan(0);
      for (const row of evidence) {
        expect(messageIds.has(row.message_id)).toBe(true);
      }
      expect(messageIds.has(node.first_message_id!)).toBe(true);
    }
  });

  it('drops a claim that carries no words from the text', async () => {
    const r = await recorded();
    const first = r.messages[0]!;
    const summary = await extractRunSemantics({
      db: r.db,
      runId: r.runId,
      extractor: new ScriptedExtractor({
        results: [
          {
            messageId: first.message_id,
            topics: ['reversibility'],
            concepts: [],
            claims: [
              { text: 'grounded claim', topic: 'reversibility', quote: 'some real words' },
              { text: 'ungrounded claim', topic: 'reversibility', quote: '' },
            ],
          },
        ],
        usage: { inputTokens: 0, outputTokens: 0 },
      }),
    });

    const claims = semanticNodes(r.db, summary.extractionId).filter((n) => n.kind === 'claim');
    expect(claims.map((c) => c.label)).toEqual(['grounded claim']);
  });

  it('refuses a reading of a message the run did not record', async () => {
    const r = await recorded();
    const summary = await extractRunSemantics({
      db: r.db,
      runId: r.runId,
      extractor: new ScriptedExtractor({
        results: [
          { messageId: 'msg_not_from_this_run', topics: ['invented'], concepts: [], claims: [] },
        ],
        usage: { inputTokens: 0, outputTokens: 0 },
      }),
    });

    expect(semanticNodes(r.db, summary.extractionId)).toEqual([]);
  });

  it('deduplicates a label repeated across messages and keeps the earliest sighting', async () => {
    const r = await recorded();
    const [a, b] = r.messages;
    const summary = await extractRunSemantics({
      db: r.db,
      runId: r.runId,
      extractor: new ScriptedExtractor({
        results: [
          { messageId: b!.message_id, topics: ['Reversibility'], concepts: [], claims: [] },
          { messageId: a!.message_id, topics: ['reversibility.'], concepts: [], claims: [] },
        ],
        usage: { inputTokens: 0, outputTokens: 0 },
      }),
    });

    const topics = semanticNodes(r.db, summary.extractionId).filter((n) => n.kind === 'topic');
    expect(topics).toHaveLength(1);
    expect(topics[0]!.mention_count).toBe(2);
    // First observed is the earliest recorded message, not the first one extracted.
    expect(topics[0]!.first_message_id).toBe(a!.message_id);
  });

  it('asserts only relations the pipeline can support from the text', async () => {
    const r = await recorded();
    const summary = await extractRunSemantics({
      db: r.db,
      runId: r.runId,
      extractor: new StubExtractor(),
    });

    const relations = new Set(semanticEdges(r.db, summary.extractionId).map((e) => e.relation));
    for (const relation of relations) {
      expect(['discussed', 'introduced', 'referenced', 'expressed', 'belongs_to']).toContain(
        relation,
      );
    }
    for (const forbidden of ['supports', 'opposes', 'persuades', 'agrees', 'influences']) {
      expect(relations.has(forbidden as never)).toBe(false);
    }
  });

  it('keeps a failed extraction on record instead of losing it', async () => {
    const r = await recorded();
    const failing: SemanticExtractor = {
      name: 'failing',
      provider: 'none',
      model: 'x',
      method: 'test',
      extract: async () => {
        throw new Error('extractor exploded');
      },
    };

    await expect(
      extractRunSemantics({ db: r.db, runId: r.runId, extractor: failing }),
    ).rejects.toThrow('extractor exploded');

    const rows = listExtractions(r.db, r.runId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.failure_reason).toContain('exploded');
    // A failed extraction is not offered to the graph.
    expect(latestExtraction(r.db, r.runId)).toBeNull();
  });
});

describe('human review', () => {
  it('records a correction without overwriting what the machine produced', async () => {
    const r = await recorded();
    const summary = await extractRunSemantics({
      db: r.db,
      runId: r.runId,
      extractor: new StubExtractor(),
    });
    const node = semanticNodes(r.db, summary.extractionId)[0]!;

    reviewNode({ db: r.db, nodeId: node.node_id, action: 'rename', label: 'Reversibility' });

    const after = semanticNodes(r.db, summary.extractionId).find(
      (n) => n.node_id === node.node_id,
    )!;
    expect(after.label).toBe(node.label);
    expect(after.review_label).toBe('Reversibility');
    expect(after.review_state).toBe('renamed');
    expect(after.reviewed_at).not.toBeNull();
    // A reader sees the correction; the record keeps both.
    expect(shownLabel(after)).toBe('Reversibility');
  });

  it('takes a removed node off the graph but leaves it in the record', async () => {
    const r = await recorded();
    const summary = await extractRunSemantics({
      db: r.db,
      runId: r.runId,
      extractor: new StubExtractor(),
    });
    const node = semanticNodes(r.db, summary.extractionId).find((n) => n.kind === 'topic')!;
    reviewNode({ db: r.db, nodeId: node.node_id, action: 'remove', note: 'extraction error' });

    const graph = buildRunGraph({
      runId: r.runId,
      config: r.config,
      messages: r.messages,
      opportunities: r.opportunities,
      invocations: r.invocations,
      phases: [],
      semantic: {
        extraction: null,
        nodes: semanticNodes(r.db, summary.extractionId),
        edges: semanticEdges(r.db, summary.extractionId),
      },
    });

    expect(graph.nodes.some((n) => n.id === node.node_id)).toBe(false);
    expect(
      semanticNodes(r.db, summary.extractionId).some((n) => n.node_id === node.node_id),
    ).toBe(true);
  });
});

describe('run graph', () => {
  async function graphFor(withSemantics = false) {
    const r = await recorded();
    let semantic = null;
    if (withSemantics) {
      const summary = await extractRunSemantics({
        db: r.db,
        runId: r.runId,
        extractor: new StubExtractor(),
      });
      semantic = {
        extraction: null,
        nodes: semanticNodes(r.db, summary.extractionId),
        edges: semanticEdges(r.db, summary.extractionId),
      };
    }
    const timeline = buildTimeline({
      config: r.config,
      events: r.events,
      messages: r.messages,
    });
    return {
      r,
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
        semantic,
      }),
    };
  }

  it('has one node per participant and marks them as recorded', async () => {
    const { graph } = await graphFor();
    const participants = graph.nodes.filter((n) => n.layer === 'recorded');
    expect(participants.map((n) => n.id).sort()).toEqual([
      'agent_1', 'agent_2', 'agent_3', 'agent_4', 'agent_5', 'moderator',
    ]);
    expect(participants.every((n) => n.kind === 'agent' || n.kind === 'moderator')).toBe(true);
  });

  it('counts communication edges from the recipients recorded at the time', async () => {
    const { r, graph } = await graphFor();
    let expected = 0;
    for (const m of r.messages) {
      expected += m.actual_recipients.filter((to) => to !== m.sender_agent_id).length;
    }
    const comms = graph.edges.filter((e) => e.layer === 'recorded');
    expect(comms.reduce((n, e) => n + e.weight, 0)).toBe(expected);
    expect(comms.every((e) => e.messageIds.length === e.weight)).toBe(true);
  });

  it('never draws a private edge outside a shared breakout group', async () => {
    const { r, graph } = await graphFor();
    const groups = r.config.channels.private.breakout_groups;
    for (const edge of graph.edges.filter((e) => e.relation === 'private_message')) {
      expect(
        groups.some((g) => g.members.includes(edge.source) && g.members.includes(edge.target)),
      ).toBe(true);
    }
  });

  it('places phase bands inside the sequence range the graph is drawn on', async () => {
    const { graph } = await graphFor();
    expect(graph.phases.length).toBeGreaterThan(0);
    for (const band of graph.phases) {
      expect(band.fromSequence).toBeGreaterThanOrEqual(graph.minSequence);
      expect(band.toSequence).toBeLessThanOrEqual(graph.maxSequence);
      expect(band.fromSequence).toBeLessThanOrEqual(band.toSequence);
    }
  });

  it('marks derived nodes as derived and keeps them out of the recorded layer', async () => {
    const { graph } = await graphFor(true);
    const derived = graph.nodes.filter((n) => n.layer === 'derived');
    expect(derived.length).toBeGreaterThan(0);
    expect(derived.every((n) => ['topic', 'concept', 'claim'].includes(n.kind))).toBe(true);
    expect(
      graph.nodes.filter((n) => n.layer === 'recorded').every((n) => n.kind !== 'topic'),
    ).toBe(true);
  });

  it('filters by time without changing what is stored', async () => {
    const { graph } = await graphFor(true);
    const early = filterGraph(graph, { upToSequence: graph.minSequence });

    expect(early.nodes.length).toBeLessThan(graph.nodes.length);
    expect(early.edges.every((e) => e.firstSequence <= graph.minSequence)).toBe(true);
    // Participants are present throughout: an agent that has not spoken yet is still
    // part of the workshop.
    expect(early.nodes.filter((n) => n.layer === 'recorded')).toHaveLength(6);
    expect(graph.nodes.length).toBeGreaterThan(early.nodes.length);
  });

  it('filters by kind and drops derived nodes left with nothing attached', async () => {
    const { graph } = await graphFor(true);
    const onlyAgents = filterGraph(graph, { kinds: ['agent', 'moderator'] });
    expect(onlyAgents.nodes.every((n) => n.layer === 'recorded')).toBe(true);
    expect(onlyAgents.edges.every((e) => e.layer === 'recorded')).toBe(true);
  });

  it('names no relation the record cannot support', async () => {
    const { graph } = await graphFor(true);
    const text = JSON.stringify(graph).toLowerCase();
    for (const word of ['influence', 'persuas', 'coalition', 'caused', 'agrees', 'opposes']) {
      expect(text).not.toContain(word);
    }
  });
});
