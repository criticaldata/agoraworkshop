export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runs (
  run_id                TEXT PRIMARY KEY,
  experiment_id         TEXT NOT NULL,
  config_hash           TEXT NOT NULL,
  config_json           TEXT NOT NULL,
  config_canonical      TEXT NOT NULL,
  config_source_path    TEXT,
  source_run_id         TEXT,
  status                TEXT NOT NULL,
  termination_reason    TEXT,
  failure_reason        TEXT,
  provider              TEXT NOT NULL,
  model                 TEXT NOT NULL,
  code_commit_sha       TEXT,
  commit_source         TEXT,
  deployment_id         TEXT,
  app_version           TEXT,
  environment           TEXT,
  created_at            TEXT NOT NULL,
  started_at            TEXT,
  ended_at              TEXT,
  duration_ms           INTEGER
);

CREATE INDEX IF NOT EXISTS idx_runs_config_hash ON runs(config_hash);

CREATE TABLE IF NOT EXISTS events (
  event_id          TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  experiment_id     TEXT NOT NULL,
  config_hash       TEXT NOT NULL,
  sequence          INTEGER NOT NULL,
  timestamp         TEXT NOT NULL,
  elapsed_ms        INTEGER NOT NULL,
  event_type        TEXT NOT NULL,
  workshop_state    TEXT NOT NULL,
  agent_id          TEXT,
  channel           TEXT,
  trace_id          TEXT,
  parent_event_id   TEXT,
  causal_event_ids  TEXT NOT NULL,
  payload           TEXT NOT NULL,
  UNIQUE (run_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_events_run_seq ON events(run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(run_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_trace ON events(run_id, trace_id);

CREATE TABLE IF NOT EXISTS state_transitions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id            TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  sequence          INTEGER NOT NULL,
  from_state        TEXT NOT NULL,
  to_state          TEXT NOT NULL,
  status            TEXT NOT NULL,
  reason            TEXT,
  started_at        TEXT NOT NULL,
  completed_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_transitions_run ON state_transitions(run_id, sequence);

CREATE TABLE IF NOT EXISTS opportunities (
  opportunity_id        TEXT PRIMARY KEY,
  run_id                TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  trace_id              TEXT,
  sequence              INTEGER NOT NULL,
  agent_id              TEXT NOT NULL,
  workshop_state        TEXT NOT NULL,
  channel               TEXT NOT NULL,
  breakout_group_id     TEXT,
  round_index           INTEGER NOT NULL,
  created_at            TEXT NOT NULL,
  resolved_at           TEXT,
  resolution            TEXT,
  failure_category      TEXT,
  behaviourally_available INTEGER NOT NULL DEFAULT 0,
  message_id            TEXT,
  attempts              INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_opportunities_run ON opportunities(run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_opportunities_trace ON opportunities(run_id, trace_id);

CREATE TABLE IF NOT EXISTS invocations (
  invocation_id            TEXT PRIMARY KEY,
  run_id                   TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  opportunity_id           TEXT NOT NULL,
  trace_id                 TEXT,
  sequence                 INTEGER NOT NULL,
  agent_id                 TEXT NOT NULL,
  workshop_state           TEXT NOT NULL,
  channel                  TEXT NOT NULL,
  attempt                  INTEGER NOT NULL,
  provider                 TEXT NOT NULL,
  requested_model          TEXT NOT NULL,
  responded_model          TEXT,
  generation_params        TEXT NOT NULL,
  prompt_version           TEXT NOT NULL,
  system_prompt            TEXT NOT NULL,
  rendered_messages        TEXT NOT NULL,
  context_message_ids      TEXT NOT NULL,
  context_public_ids       TEXT NOT NULL,
  context_private_ids      TEXT NOT NULL,
  context_policy_version   TEXT NOT NULL,
  capability_manifest      TEXT NOT NULL,
  budget_calls_used_before INTEGER NOT NULL,
  budget_tokens_used_before INTEGER NOT NULL,
  request_ts               TEXT NOT NULL,
  response_ts              TEXT,
  latency_ms               INTEGER,
  outcome                  TEXT NOT NULL,
  failure_category         TEXT,
  error_message            TEXT,
  finish_reason            TEXT,
  input_tokens             INTEGER,
  output_tokens            INTEGER,
  output_message_id        TEXT,
  raw_metadata             TEXT
);

CREATE INDEX IF NOT EXISTS idx_invocations_run ON invocations(run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_invocations_opportunity ON invocations(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_invocations_trace ON invocations(run_id, trace_id);

CREATE TABLE IF NOT EXISTS messages (
  message_id          TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  trace_id            TEXT,
  sequence            INTEGER NOT NULL,
  channel             TEXT NOT NULL,
  breakout_group_id   TEXT,
  sender_agent_id     TEXT NOT NULL,
  intended_recipients TEXT NOT NULL,
  actual_recipients   TEXT NOT NULL,
  workshop_state      TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  content             TEXT NOT NULL,
  source_invocation_id TEXT,
  source_event_id     TEXT,
  artifact_refs       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_run ON messages(run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_messages_trace ON messages(run_id, trace_id);

CREATE TABLE IF NOT EXISTS context_summaries (
  summary_id          TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  trace_id            TEXT NOT NULL,
  opportunity_id      TEXT NOT NULL REFERENCES opportunities(opportunity_id) ON DELETE CASCADE,
  agent_id            TEXT NOT NULL,
  scope               TEXT NOT NULL,
  summarizer_version  TEXT NOT NULL,
  source_message_ids  TEXT NOT NULL,
  source_hash         TEXT NOT NULL,
  content             TEXT NOT NULL,
  content_hash        TEXT NOT NULL,
  fidelity_hash       TEXT NOT NULL,
  created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_summaries_run_trace ON context_summaries(run_id, trace_id);

CREATE TABLE IF NOT EXISTS artifacts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  path         TEXT NOT NULL,
  sha256       TEXT NOT NULL,
  bytes        INTEGER NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id);

-- ---------------------------------------------------------------- semantics
--
-- Derived analysis, kept strictly apart from the experimental record above. Nothing in
-- these tables is authoritative: every row points back to the messages it was derived
-- from, and deleting all of it would lose no experimental data.
--
-- An extraction is a versioned artifact. Re-running the pipeline creates a new row
-- rather than overwriting the old one, so a graph produced under one prompt and model
-- can never be silently replaced by one produced under another.

CREATE TABLE IF NOT EXISTS semantic_extractions (
  extraction_id      TEXT PRIMARY KEY,
  run_id             TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  pipeline_version   TEXT NOT NULL,
  extraction_method  TEXT NOT NULL,
  provider           TEXT NOT NULL,
  model              TEXT NOT NULL,
  prompt_version     TEXT NOT NULL,
  code_commit_sha    TEXT,
  messages_considered INTEGER NOT NULL,
  status             TEXT NOT NULL,
  failure_reason     TEXT,
  created_at         TEXT NOT NULL,
  completed_at       TEXT,
  input_tokens       INTEGER,
  output_tokens      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_extractions_run ON semantic_extractions(run_id, created_at);

CREATE TABLE IF NOT EXISTS semantic_nodes (
  node_id          TEXT PRIMARY KEY,
  extraction_id    TEXT NOT NULL REFERENCES semantic_extractions(extraction_id) ON DELETE CASCADE,
  run_id           TEXT NOT NULL,
  kind             TEXT NOT NULL,
  label            TEXT NOT NULL,
  -- concept belongs to a topic; claim belongs to a topic. Null for topics themselves.
  parent_node_id   TEXT,
  first_message_id TEXT,
  first_sequence   INTEGER,
  first_elapsed_ms INTEGER,
  mention_count    INTEGER NOT NULL DEFAULT 0,
  confidence       REAL,
  -- Machine output is never overwritten. A review is recorded alongside it.
  review_state     TEXT NOT NULL DEFAULT 'unreviewed',
  review_label     TEXT,
  review_note      TEXT,
  reviewed_at      TEXT,
  merged_into_id   TEXT
);

CREATE INDEX IF NOT EXISTS idx_semantic_nodes_extraction ON semantic_nodes(extraction_id, kind);
CREATE INDEX IF NOT EXISTS idx_semantic_nodes_run ON semantic_nodes(run_id);

CREATE TABLE IF NOT EXISTS semantic_edges (
  edge_id        TEXT PRIMARY KEY,
  extraction_id  TEXT NOT NULL REFERENCES semantic_extractions(extraction_id) ON DELETE CASCADE,
  run_id         TEXT NOT NULL,
  relation       TEXT NOT NULL,
  from_kind      TEXT NOT NULL,
  from_id        TEXT NOT NULL,
  to_kind        TEXT NOT NULL,
  to_id          TEXT NOT NULL,
  weight         INTEGER NOT NULL DEFAULT 1,
  confidence     REAL,
  review_state   TEXT NOT NULL DEFAULT 'unreviewed',
  reviewed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_semantic_edges_extraction ON semantic_edges(extraction_id, relation);

-- The audit path. A semantic node or edge without evidence is a bug, not a finding.
CREATE TABLE IF NOT EXISTS semantic_evidence (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  extraction_id  TEXT NOT NULL REFERENCES semantic_extractions(extraction_id) ON DELETE CASCADE,
  run_id         TEXT NOT NULL,
  subject_kind   TEXT NOT NULL,
  subject_id     TEXT NOT NULL,
  message_id     TEXT NOT NULL,
  invocation_id  TEXT,
  sequence       INTEGER NOT NULL,
  agent_id       TEXT NOT NULL,
  quote          TEXT
);

CREATE INDEX IF NOT EXISTS idx_semantic_evidence_subject ON semantic_evidence(extraction_id, subject_id);
`;
