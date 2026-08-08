import { randomUUID } from 'node:crypto';
import type { Db } from '../db/index.js';
import { getMessages, getRun } from '../db/queries.js';
import { nowIso } from '../core/ids.js';
import { codeProvenance } from '../core/provenance.js';
import type { StoredMessage } from '../orchestrator/visibility.js';
import {
  EXTRACTION_PROMPT_VERSION,
  PIPELINE_VERSION,
  type ExtractionRow,
  type MessageExtraction,
  type SemanticEdgeRow,
  type SemanticEvidenceRow,
  type SemanticExtractor,
  type SemanticKind,
  type SemanticNodeRow,
  type SemanticRelation,
} from './types.js';

/**
 * Turns an extractor's readings into stored, versioned, evidence-backed graph data.
 *
 * The pipeline owns three things the extractor deliberately does not: identity
 * (deduplicating labels within a run), provenance (which messages produced what), and
 * versioning (which pipeline, model, prompt and code did it).
 */

export interface RunExtractionOptions {
  db: Db;
  runId: string;
  extractor: SemanticExtractor;
  /** Only these channels are read. Defaults to everything recorded. */
  channels?: Array<'public' | 'private'>;
}

export interface ExtractionSummary {
  extractionId: string;
  status: ExtractionRow['status'];
  topics: number;
  concepts: number;
  claims: number;
  edges: number;
  evidence: number;
  messagesConsidered: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

/** Labels are matched case- and punctuation-insensitively within one run. */
const normalise = (label: string): string =>
  label.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');

export async function extractRunSemantics(
  options: RunExtractionOptions,
): Promise<ExtractionSummary> {
  const { db, runId, extractor } = options;
  const run = getRun(db, runId);
  if (!run) throw new Error(`unknown run: ${runId}`);

  const channels = options.channels ?? ['public', 'private'];
  const messages = getMessages(db, runId).filter((m) =>
    channels.includes(m.channel as 'public' | 'private'),
  );

  const extractionId = `sx_${randomUUID()}`;
  const provenance = codeProvenance();

  db.prepare(
    `INSERT INTO semantic_extractions (extraction_id, run_id, pipeline_version,
       extraction_method, provider, model, prompt_version, code_commit_sha,
       messages_considered, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)`,
  ).run(
    extractionId,
    runId,
    PIPELINE_VERSION,
    extractor.method,
    extractor.provider,
    extractor.model,
    EXTRACTION_PROMPT_VERSION,
    provenance.git_commit_sha,
    messages.length,
    nowIso(),
  );

  try {
    const outcome = await extractor.extract({ runId, messages });
    const summary = store(db, extractionId, runId, messages, outcome.results);

    db.prepare(
      `UPDATE semantic_extractions
          SET status = 'completed', completed_at = ?, input_tokens = ?, output_tokens = ?
        WHERE extraction_id = ?`,
    ).run(nowIso(), outcome.usage.inputTokens, outcome.usage.outputTokens, extractionId);

    return {
      extractionId,
      status: 'completed',
      messagesConsidered: messages.length,
      usage: outcome.usage,
      ...summary,
    };
  } catch (error) {
    // A failed extraction stays recorded as failed rather than disappearing, so a graph
    // that is missing is distinguishable from one that was never attempted.
    db.prepare(
      `UPDATE semantic_extractions SET status = 'failed', failure_reason = ?, completed_at = ?
        WHERE extraction_id = ?`,
    ).run(error instanceof Error ? error.message : String(error), nowIso(), extractionId);
    throw error;
  }
}

interface StoreCounts {
  topics: number;
  concepts: number;
  claims: number;
  edges: number;
  evidence: number;
}

function store(
  db: Db,
  extractionId: string,
  runId: string,
  messages: StoredMessage[],
  results: MessageExtraction[],
): StoreCounts {
  const byId = new Map(messages.map((m) => [m.message_id, m]));

  const nodes = new Map<string, SemanticNodeRow>();
  const edges = new Map<string, SemanticEdgeRow>();
  const evidence: Array<Omit<SemanticEvidenceRow, 'id'>> = [];

  /** One node per normalised label within a kind, so a repeated topic is one node. */
  const nodeFor = (
    kind: SemanticKind,
    label: string,
    parentId: string | null,
    message: StoredMessage,
  ): SemanticNodeRow => {
    const key = `${kind}:${normalise(label)}`;
    const existing = nodes.get(key);
    if (existing) {
      existing.mention_count += 1;
      // First observation is the earliest, by recorded sequence.
      if (message.sequence < (existing.first_sequence ?? Number.MAX_SAFE_INTEGER)) {
        existing.first_sequence = message.sequence;
        existing.first_message_id = message.message_id;
      }
      return existing;
    }
    const row: SemanticNodeRow = {
      node_id: `sn_${randomUUID()}`,
      extraction_id: extractionId,
      run_id: runId,
      kind,
      label: label.trim(),
      parent_node_id: parentId,
      first_message_id: message.message_id,
      first_sequence: message.sequence,
      first_elapsed_ms: null,
      mention_count: 1,
      confidence: null,
      review_state: 'unreviewed',
      review_label: null,
      review_note: null,
      reviewed_at: null,
      merged_into_id: null,
    };
    nodes.set(key, row);
    return row;
  };

  const edgeFor = (
    relation: SemanticRelation,
    fromKind: string,
    fromId: string,
    toKind: string,
    toId: string,
  ): SemanticEdgeRow => {
    const key = `${relation}:${fromId}:${toId}`;
    const existing = edges.get(key);
    if (existing) {
      existing.weight += 1;
      return existing;
    }
    const row: SemanticEdgeRow = {
      edge_id: `se_${randomUUID()}`,
      extraction_id: extractionId,
      run_id: runId,
      relation,
      from_kind: fromKind,
      from_id: fromId,
      to_kind: toKind,
      to_id: toId,
      weight: 1,
      confidence: null,
      review_state: 'unreviewed',
      reviewed_at: null,
    };
    edges.set(key, row);
    return row;
  };

  const witness = (subjectKind: string, subjectId: string, m: StoredMessage, quote: string | null) => {
    evidence.push({
      extraction_id: extractionId,
      run_id: runId,
      subject_kind: subjectKind,
      subject_id: subjectId,
      message_id: m.message_id,
      invocation_id: m.source_invocation_id,
      sequence: m.sequence,
      agent_id: m.sender_agent_id,
      quote,
    });
  };

  // Sorted so "first observed" is decided by the recorded order, not by extractor order.
  const ordered = [...results].sort(
    (a, b) => (byId.get(a.messageId)?.sequence ?? 0) - (byId.get(b.messageId)?.sequence ?? 0),
  );

  for (const result of ordered) {
    const message = byId.get(result.messageId);
    if (!message) continue; // Never store a reading of a message this run did not record.

    const topicNodes = new Map<string, SemanticNodeRow>();
    for (const label of result.topics) {
      if (!label.trim()) continue;
      const topic = nodeFor('topic', label, null, message);
      topicNodes.set(normalise(label), topic);
      const first = topic.first_message_id === message.message_id && topic.mention_count === 1;
      edgeFor(first ? 'introduced' : 'discussed', 'agent', message.sender_agent_id, 'topic', topic.node_id);
      witness('topic', topic.node_id, message, null);
    }

    for (const concept of result.concepts) {
      if (!concept.label?.trim()) continue;
      const parent = topicNodes.get(normalise(concept.topic ?? '')) ?? null;
      const node = nodeFor('concept', concept.label, parent?.node_id ?? null, message);
      const first = node.first_message_id === message.message_id && node.mention_count === 1;
      edgeFor(first ? 'introduced' : 'referenced', 'agent', message.sender_agent_id, 'concept', node.node_id);
      if (parent) edgeFor('belongs_to', 'concept', node.node_id, 'topic', parent.node_id);
      witness('concept', node.node_id, message, null);
    }

    for (const claim of result.claims) {
      // A claim without words behind it is dropped rather than kept with a caveat.
      if (!claim.text?.trim() || !claim.quote?.trim()) continue;
      const parent = topicNodes.get(normalise(claim.topic ?? '')) ?? null;
      const node = nodeFor('claim', claim.text, parent?.node_id ?? null, message);
      edgeFor('expressed', 'agent', message.sender_agent_id, 'claim', node.node_id);
      if (parent) edgeFor('belongs_to', 'claim', node.node_id, 'topic', parent.node_id);
      witness('claim', node.node_id, message, claim.quote.trim());
    }
  }

  const insertNode = db.prepare(
    `INSERT INTO semantic_nodes (node_id, extraction_id, run_id, kind, label, parent_node_id,
       first_message_id, first_sequence, first_elapsed_ms, mention_count, confidence,
       review_state, review_label, review_note, reviewed_at, merged_into_id)
     VALUES (@node_id, @extraction_id, @run_id, @kind, @label, @parent_node_id,
       @first_message_id, @first_sequence, @first_elapsed_ms, @mention_count, @confidence,
       @review_state, @review_label, @review_note, @reviewed_at, @merged_into_id)`,
  );
  const insertEdge = db.prepare(
    `INSERT INTO semantic_edges (edge_id, extraction_id, run_id, relation, from_kind, from_id,
       to_kind, to_id, weight, confidence, review_state, reviewed_at)
     VALUES (@edge_id, @extraction_id, @run_id, @relation, @from_kind, @from_id,
       @to_kind, @to_id, @weight, @confidence, @review_state, @reviewed_at)`,
  );
  const insertEvidence = db.prepare(
    `INSERT INTO semantic_evidence (extraction_id, run_id, subject_kind, subject_id,
       message_id, invocation_id, sequence, agent_id, quote)
     VALUES (@extraction_id, @run_id, @subject_kind, @subject_id, @message_id,
       @invocation_id, @sequence, @agent_id, @quote)`,
  );

  db.transaction(() => {
    for (const node of nodes.values()) insertNode.run(node);
    for (const edge of edges.values()) insertEdge.run(edge);
    for (const row of evidence) insertEvidence.run(row);
  })();

  const all = [...nodes.values()];
  return {
    topics: all.filter((n) => n.kind === 'topic').length,
    concepts: all.filter((n) => n.kind === 'concept').length,
    claims: all.filter((n) => n.kind === 'claim').length,
    edges: edges.size,
    evidence: evidence.length,
  };
}

// ------------------------------------------------------------------ reading

export function listExtractions(db: Db, runId: string): ExtractionRow[] {
  return db
    .prepare(
      `SELECT * FROM semantic_extractions WHERE run_id = ? ORDER BY created_at DESC`,
    )
    .all(runId) as ExtractionRow[];
}

/** The extraction a graph should use unless one was named: the newest that succeeded. */
export function latestExtraction(db: Db, runId: string): ExtractionRow | null {
  return (
    (db
      .prepare(
        `SELECT * FROM semantic_extractions
          WHERE run_id = ? AND status = 'completed'
          ORDER BY created_at DESC LIMIT 1`,
      )
      .get(runId) as ExtractionRow | undefined) ?? null
  );
}

export function getExtraction(db: Db, extractionId: string): ExtractionRow | null {
  return (
    (db
      .prepare(`SELECT * FROM semantic_extractions WHERE extraction_id = ?`)
      .get(extractionId) as ExtractionRow | undefined) ?? null
  );
}

export function semanticNodes(db: Db, extractionId: string): SemanticNodeRow[] {
  return db
    .prepare(`SELECT * FROM semantic_nodes WHERE extraction_id = ? ORDER BY first_sequence`)
    .all(extractionId) as SemanticNodeRow[];
}

export function semanticEdges(db: Db, extractionId: string): SemanticEdgeRow[] {
  return db
    .prepare(`SELECT * FROM semantic_edges WHERE extraction_id = ?`)
    .all(extractionId) as SemanticEdgeRow[];
}

export function semanticEvidence(
  db: Db,
  extractionId: string,
  subjectId?: string,
): SemanticEvidenceRow[] {
  if (subjectId) {
    return db
      .prepare(
        `SELECT * FROM semantic_evidence WHERE extraction_id = ? AND subject_id = ?
          ORDER BY sequence`,
      )
      .all(extractionId, subjectId) as SemanticEvidenceRow[];
  }
  return db
    .prepare(`SELECT * FROM semantic_evidence WHERE extraction_id = ? ORDER BY sequence`)
    .all(extractionId) as SemanticEvidenceRow[];
}

// ------------------------------------------------------------------- review

export interface ReviewInput {
  db: Db;
  nodeId: string;
  action: 'approve' | 'rename' | 'merge' | 'remove' | 'error';
  label?: string;
  note?: string;
  mergeInto?: string;
}

/**
 * Records a researcher's correction **alongside** the machine output.
 *
 * The original label is never overwritten, so an extraction remains a faithful record of
 * what the pipeline produced, and a reviewed graph remains auditable as both.
 */
export function reviewNode(input: ReviewInput): void {
  const { db, nodeId, action } = input;
  const state =
    action === 'approve'
      ? 'approved'
      : action === 'rename'
        ? 'renamed'
        : action === 'merge'
          ? 'merged'
          : action === 'remove'
            ? 'removed'
            : 'error';

  db.prepare(
    `UPDATE semantic_nodes
        SET review_state = ?, review_label = ?, review_note = ?, merged_into_id = ?,
            reviewed_at = ?
      WHERE node_id = ?`,
  ).run(
    state,
    action === 'rename' ? input.label ?? null : null,
    input.note ?? null,
    action === 'merge' ? input.mergeInto ?? null : null,
    nowIso(),
    nodeId,
  );
}
