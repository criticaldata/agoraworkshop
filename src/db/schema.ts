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
  parent_event_id   TEXT,
  causal_event_ids  TEXT NOT NULL,
  payload           TEXT NOT NULL,
  UNIQUE (run_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_events_run_seq ON events(run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(run_id, event_type);

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

CREATE TABLE IF NOT EXISTS invocations (
  invocation_id            TEXT PRIMARY KEY,
  run_id                   TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  opportunity_id           TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS messages (
  message_id          TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
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
`;
