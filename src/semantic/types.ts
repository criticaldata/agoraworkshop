import type { StoredMessage } from '../orchestrator/visibility.js';

/**
 * Post-hoc semantic extraction.
 *
 * Everything in this module runs **after** a workshop has finished, over messages that
 * were already recorded. Nothing it produces is ever shown to a participating agent or
 * fed back into a run: the separation between executing an experiment and analysing it
 * afterwards is what makes the analysis admissible at all.
 *
 * Three rules hold throughout:
 *
 *  - Derived, never authoritative. A topic is a reading of some messages. The messages
 *    are the record; the topic is an opinion about them, and it carries the message ids
 *    it was formed from so a reader can disagree.
 *  - No node without evidence. A claim that cannot be traced to source text is dropped,
 *    not kept with a caveat.
 *  - Versioned. An extraction records the pipeline, model, prompt and code that produced
 *    it. Re-running writes a new extraction rather than overwriting the old one, so a
 *    graph never changes meaning quietly when a prompt is edited.
 */

/** Bumped when the shape of what the pipeline produces changes. */
export const PIPELINE_VERSION = 'semantic_v1';

/** Bumped when the extraction prompt changes, even if the shape does not. */
export const EXTRACTION_PROMPT_VERSION = 'extract_v1';

export type SemanticKind = 'topic' | 'concept' | 'claim';

/**
 * Relations the pipeline is allowed to assert.
 *
 * Deliberately narrow. `supports`, `opposes`, `persuades`, `agrees` and the rest are
 * absent because no validated method behind this pipeline can tell them apart from
 * mentioning something, and a wrong edge of that kind would be read as a finding.
 */
export type SemanticRelation =
  | 'discussed'
  | 'introduced'
  | 'referenced'
  | 'expressed'
  | 'belongs_to';

export const RELATION_LABEL: Record<SemanticRelation, string> = {
  discussed: 'discussed',
  introduced: 'first raised',
  referenced: 'referred to',
  expressed: 'expressed',
  belongs_to: 'belongs to',
};

/** One message's reading. The extractor returns this and nothing else. */
export interface MessageExtraction {
  messageId: string;
  topics: string[];
  concepts: Array<{ label: string; topic: string }>;
  /** A concise paraphrase of something asserted, plus the words it came from. */
  claims: Array<{ text: string; topic: string; quote: string }>;
}

export interface ExtractionRequest {
  runId: string;
  messages: StoredMessage[];
}

export interface ExtractionOutcome {
  results: MessageExtraction[];
  usage: { inputTokens: number | null; outputTokens: number | null };
}

/**
 * A source of readings. Implemented by a deterministic stand-in for tests and
 * development, and by a model-backed extractor that costs money and is only ever
 * started deliberately.
 */
export interface SemanticExtractor {
  readonly name: string;
  readonly provider: string;
  readonly model: string;
  readonly method: string;
  extract(request: ExtractionRequest): Promise<ExtractionOutcome>;
}

// --------------------------------------------------------------- stored rows

export interface ExtractionRow {
  extraction_id: string;
  run_id: string;
  pipeline_version: string;
  extraction_method: string;
  provider: string;
  model: string;
  prompt_version: string;
  code_commit_sha: string | null;
  messages_considered: number;
  status: 'running' | 'completed' | 'failed';
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

export type ReviewState = 'unreviewed' | 'approved' | 'renamed' | 'merged' | 'removed' | 'error';

export interface SemanticNodeRow {
  node_id: string;
  extraction_id: string;
  run_id: string;
  kind: SemanticKind;
  label: string;
  parent_node_id: string | null;
  first_message_id: string | null;
  first_sequence: number | null;
  first_elapsed_ms: number | null;
  mention_count: number;
  confidence: number | null;
  review_state: ReviewState;
  review_label: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  merged_into_id: string | null;
}

export interface SemanticEdgeRow {
  edge_id: string;
  extraction_id: string;
  run_id: string;
  relation: SemanticRelation;
  from_kind: string;
  from_id: string;
  to_kind: string;
  to_id: string;
  weight: number;
  confidence: number | null;
  review_state: ReviewState;
  reviewed_at: string | null;
}

export interface SemanticEvidenceRow {
  id: number;
  extraction_id: string;
  run_id: string;
  subject_kind: string;
  subject_id: string;
  message_id: string;
  invocation_id: string | null;
  sequence: number;
  agent_id: string;
  quote: string | null;
}

/** What a reader sees: the machine's label unless a human replaced it, and which. */
export const shownLabel = (node: SemanticNodeRow): string =>
  node.review_state === 'renamed' && node.review_label ? node.review_label : node.label;
