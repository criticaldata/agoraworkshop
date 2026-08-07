import { describe, expect, it } from 'vitest';
import { homePage } from '../src/server/home.js';
import type { RunRow } from '../src/db/queries.js';
import type { AgoraEvent } from '../src/events/types.js';

const run: RunRow = {
  run_id: 'run_abc',
  experiment_id: 'agora_phase0_v1',
  config_hash: 'sha256:deadbeef',
  config_json: '{}',
  config_canonical: '{}',
  config_source_path: null,
  source_run_id: null,
  status: 'COMPLETED',
  termination_reason: 'completed',
  failure_reason: null,
  provider: 'openai',
  model: 'gpt-5.6-luna',
  code_commit_sha: null,
  created_at: '2026-01-01T00:00:00.000Z',
  started_at: '2026-01-01T00:00:00.000Z',
  ended_at: '2026-01-01T00:00:10.000Z',
  duration_ms: 10000,
};

function event(type: string, elapsed: number): AgoraEvent {
  return {
    event_id: `evt_${type}_${elapsed}`,
    run_id: run.run_id,
    experiment_id: run.experiment_id,
    config_hash: run.config_hash,
    sequence: elapsed,
    timestamp: '2026-01-01T00:00:00.000Z',
    elapsed_ms: elapsed,
    event_type: type as AgoraEvent['event_type'],
    workshop_state: 'PUBLIC_DISCUSSION',
    agent_id: 'agent_1',
    channel: 'public',
    parent_event_id: null,
    causal_event_ids: [],
    payload: {},
  };
}

describe('overview page', () => {
  it('is self-contained: no external assets and no scripts', () => {
    const html = homePage({ latestRun: null, latestEvents: [], runCount: 0 });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('sends people to the runs list rather than keeping them on the overview', () => {
    const html = homePage({ latestRun: null, latestEvents: [], runCount: 0 });
    expect(html).toContain('href="/runs"');
  });

  it('states the scope limits rather than only selling the product', () => {
    const html = homePage({ latestRun: null, latestEvents: [], runCount: 0 });
    expect(html).toContain('What this work does not establish');
    expect(html).toContain('not evidence about how AI agents behave');
    expect(html).toContain('Repeated runs are not expected to produce the same text');
    expect(html).toContain('are not treated as an accurate account');
  });

  it('explains the failure-versus-abstention distinction in plain language', () => {
    const html = homePage({ latestRun: null, latestEvents: [], runCount: 0 });
    expect(html).toContain('7 of 10');
    expect(html).toContain('7 of 8');
    expect(html).toContain('Recorded decision not to respond');
  });

  it('invites a first run when nothing has been recorded yet', () => {
    const html = homePage({ latestRun: null, latestEvents: [], runCount: 0 });
    expect(html).toContain('No run has been carried out on this instance yet');
    expect(html).toContain('No runs have been recorded on this instance');
  });

  it('plots the real trace of the most recent run, with counts drawn from its events', () => {
    const events = [
      event('run_started', 0),
      event('message_generated', 100),
      event('message_generated', 200),
      event('private_message_generated', 300),
      event('timeout', 400),
      event('run_completed', 500),
    ];
    const html = homePage({ latestRun: run, latestEvents: events, runCount: 3 });

    expect(html).toContain('2 public messages');
    expect(html).toContain('1 private messages');
    expect(html).toContain('1 technical failures');
    expect(html).toContain('6 recorded events in total');
    expect(html).toContain(`/runs/${run.run_id}`);
    expect(html).toContain('3 runs recorded');
  });

  it('escapes run identifiers rather than interpolating them raw', () => {
    const html = homePage({
      latestRun: { ...run, run_id: 'run_<script>' },
      latestEvents: [event('message_generated', 10)],
      runCount: 1,
    });
    expect(html).not.toContain('run_<script>');
    expect(html).toContain('run_&lt;script&gt;');
  });
});
