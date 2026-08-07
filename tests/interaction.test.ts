import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import {
  agentTrajectory,
  buildTimeline,
  compareRuns,
  interactionMatrix,
  matrixValue,
  runMeasures,
  type TimelineMarker,
} from '../src/analytics/interaction.js';
import {
  getInvocations,
  getMessages,
  getOpportunities,
  getRun,
  runConfig,
} from '../src/db/queries.js';
import { readEvents } from '../src/events/recorder.js';
import { freezeConfig } from '../src/config/load.js';
import { baseConfigObject, frozen, tempDb } from './helpers.js';

const withFaults = () =>
  frozen({
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

async function recorded(config = frozen()) {
  const db = tempDb();
  const runner = new WorkshopRunner({ db, frozen: config });
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

describe('timeline', () => {
  it('puts every marker in its own agent lane', async () => {
    const r = await recorded();
    const timeline = buildTimeline({ config: r.config, events: r.events, messages: r.messages });

    expect(timeline.lanes.map((l) => l.agentId)).toEqual([
      'moderator',
      'agent_1',
      'agent_2',
      'agent_3',
      'agent_4',
      'agent_5',
    ]);
    for (const lane of timeline.lanes) {
      expect(lane.markers.every((m) => m.agentId === lane.agentId)).toBe(true);
    }
    // Every kept marker belongs to exactly one lane, none is lost or duplicated.
    const laneTotal = timeline.lanes.reduce((n, l) => n + l.markers.length, 0);
    expect(laneTotal).toBe(timeline.markers.length);
  });

  it('orders markers by recorded sequence, not by timestamp', async () => {
    const r = await recorded();
    const timeline = buildTimeline({
      config: r.config,
      events: r.events,
      messages: r.messages,
      filters: { infrastructure: true },
    });

    const sequences = timeline.markers.map((m) => m.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
  });

  it('assigns each marker the phase the run was in when it was recorded', async () => {
    const r = await recorded();
    const timeline = buildTimeline({ config: r.config, events: r.events, messages: r.messages });
    const eventPhase = new Map(r.events.map((e) => [e.event_id, e.workshop_state]));

    for (const marker of timeline.markers) {
      expect(marker.phase).toBe(eventPhase.get(marker.eventId));
    }
    expect(timeline.phases.map((p) => p.phase)).toContain('PUBLIC_DISCUSSION');
    // Bands follow the state machine forward and never overlap.
    const bands = timeline.phases;
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i]!.fromSequence).toBeGreaterThan(bands[i - 1]!.fromSequence);
    }
  });

  it('classifies public and private messages from the stored channel', async () => {
    const r = await recorded();
    const timeline = buildTimeline({ config: r.config, events: r.events, messages: r.messages });
    const byId = new Map(r.messages.map((m) => [m.message_id, m]));

    const messageMarkers = timeline.markers.filter((m) => m.messageId);
    expect(messageMarkers.length).toBeGreaterThan(0);
    for (const marker of messageMarkers) {
      const stored = byId.get(marker.messageId!)!;
      expect(marker.channel).toBe(stored.channel);
      if (stored.sender_agent_id === 'moderator') {
        expect(marker.kind).toBe('moderator_message');
      } else {
        expect(marker.kind).toBe(stored.channel === 'private' ? 'private_message' : 'public_message');
      }
    }
  });

  it('keeps infrastructure failures separate from behavioural silence', async () => {
    const r = await recorded(withFaults());
    const timeline = buildTimeline({
      config: r.config,
      events: r.events,
      messages: r.messages,
      filters: { infrastructure: true },
    });

    const failures = timeline.markers.filter((m) => m.kind === 'failure');
    expect(failures.length).toBeGreaterThan(0);
    // A timeout is not silence. Nothing that failed may be reported as a choice.
    for (const failure of failures) {
      expect(failure.markerClass).toBe('infrastructure');
      expect(['abstention', 'no_op']).not.toContain(failure.kind);
    }
    for (const marker of timeline.markers) {
      const behavioural = ['public_message', 'private_message', 'moderator_message', 'abstention', 'no_op'];
      expect(marker.markerClass).toBe(behavioural.includes(marker.kind) ? 'behaviour' : 'infrastructure');
    }
  });

  it('hides infrastructure by default and says how much it hid', async () => {
    const r = await recorded(withFaults());
    const shown = buildTimeline({ config: r.config, events: r.events, messages: r.messages });

    expect(shown.markers.every((m) => m.markerClass === 'behaviour')).toBe(true);
    expect(shown.infrastructureMarkers).toBeGreaterThan(0);
    expect(shown.totalMarkers).toBeGreaterThan(shown.markers.length);
  });

  it('filters without altering what was recorded', async () => {
    const r = await recorded();
    const unfiltered = buildTimeline({ config: r.config, events: r.events, messages: r.messages });
    const privateOnly = buildTimeline({
      config: r.config,
      events: r.events,
      messages: r.messages,
      filters: { channel: 'private' },
    });
    const oneAgent = buildTimeline({
      config: r.config,
      events: r.events,
      messages: r.messages,
      filters: { agents: ['agent_1'] },
    });

    expect(privateOnly.markers.every((m) => m.channel === 'private')).toBe(true);
    expect(oneAgent.lanes.map((l) => l.agentId)).toEqual(['agent_1']);
    // The underlying totals are the same view of the same data.
    expect(privateOnly.totalMarkers).toBe(unfiltered.totalMarkers);
    expect(oneAgent.totalMarkers).toBe(unfiltered.totalMarkers);
  });

  it('never invents a marker for a message that was not stored', async () => {
    const r = await recorded();
    const timeline = buildTimeline({
      config: r.config,
      events: r.events,
      messages: [],
      filters: { infrastructure: true },
    });
    expect(timeline.markers.filter((m: TimelineMarker) => m.messageId !== null)).toEqual([]);
  });
});

describe('interaction matrix', () => {
  it('counts from the sender to the recipients actually recorded', async () => {
    const r = await recorded();
    const matrix = interactionMatrix(r.config, r.messages, r.invocations);

    let expected = 0;
    for (const message of r.messages) {
      expected += message.actual_recipients.filter((to) => to !== message.sender_agent_id).length;
    }
    // `messages` counts a message once per recipient pair, so the pair count matches.
    const pairCount = matrix.cells.reduce((n, c) => n + c.value, 0);
    expect(pairCount).toBe(expected);
    expect(matrix.cells.every((c) => c.from !== c.to)).toBe(true);
  });

  it('separates public from private traffic', async () => {
    const r = await recorded();
    const publicOnly = interactionMatrix(r.config, r.messages, r.invocations, 'messages', {
      channel: 'public',
    });
    const privateOnly = interactionMatrix(r.config, r.messages, r.invocations, 'messages', {
      channel: 'private',
    });
    const all = interactionMatrix(r.config, r.messages, r.invocations);

    expect(publicOnly.total + privateOnly.total).toBe(all.total);
    expect(privateOnly.total).toBeGreaterThan(0);
  });

  it('never reports a private message to an agent outside the breakout group', async () => {
    const r = await recorded();
    const privateOnly = interactionMatrix(r.config, r.messages, r.invocations, 'messages', {
      channel: 'private',
    });
    const groups = r.config.channels.private.breakout_groups;

    for (const cell of privateOnly.cells) {
      const shared = groups.some(
        (g) => g.members.includes(cell.from) && g.members.includes(cell.to),
      );
      expect(shared).toBe(true);
    }
  });

  it('filters by phase', async () => {
    const r = await recorded();
    const breakout = interactionMatrix(r.config, r.messages, r.invocations, 'messages', {
      phase: 'PRIVATE_OR_BREAKOUT',
    });
    const intro = interactionMatrix(r.config, r.messages, r.invocations, 'messages', {
      phase: 'INTRODUCTION',
    });

    expect(breakout.total).toBeGreaterThan(0);
    expect(intro.total).toBeGreaterThan(0);
    expect(breakout.total).not.toBe(
      interactionMatrix(r.config, r.messages, r.invocations).total,
    );
  });

  it('returns an empty matrix rather than failing when nothing matches', async () => {
    const r = await recorded();
    const empty = interactionMatrix(r.config, r.messages, r.invocations, 'messages', {
      phase: 'CLOSING',
      channel: 'private',
    });
    expect(empty.cells).toEqual([]);
    expect(empty.total).toBe(0);
    expect(empty.max).toBe(0);
    expect(matrixValue(empty, 'agent_1', 'agent_2')).toBe(0);
  });

  it('counts deliveries per recipient and messages per message', async () => {
    const r = await recorded();
    const deliveries = interactionMatrix(r.config, r.messages, r.invocations, 'deliveries');
    const messages = interactionMatrix(r.config, r.messages, r.invocations, 'messages');
    // One public message reaches several agents, so deliveries is the larger count.
    expect(deliveries.total).toBeGreaterThanOrEqual(messages.total);
  });
});

describe('agent trajectory', () => {
  it('includes every one of the agent events, in recorded order', async () => {
    const r = await recorded(withFaults());
    const trajectory = agentTrajectory(
      r.config,
      'agent_4',
      r.events,
      r.messages,
      r.opportunities,
      r.invocations,
    );

    const flat = trajectory.phases.flatMap((p) => p.markers);
    expect(flat.every((m) => m.agentId === 'agent_4')).toBe(true);
    expect(flat.map((m) => m.sequence)).toEqual([...flat.map((m) => m.sequence)].sort((a, b) => a - b));
  });

  it('counts a failed turn as unavailable, never as an abstention', async () => {
    const r = await recorded(withFaults());
    const trajectory = agentTrajectory(
      r.config,
      'agent_4',
      r.events,
      r.messages,
      r.opportunities,
      r.invocations,
    );

    // agent_4's final-discussion turn fails and never recovers.
    expect(trajectory.metrics.unavailableTurns).toBeGreaterThan(0);
    expect(trajectory.metrics.abstentions).toBe(0);
    expect(trajectory.metrics.infrastructureFailures).toBeGreaterThan(0);
  });

  it('reports counts that agree with the stored records', async () => {
    const r = await recorded();
    const trajectory = agentTrajectory(
      r.config,
      'agent_1',
      r.events,
      r.messages,
      r.opportunities,
      r.invocations,
    );

    expect(trajectory.metrics.responseOpportunities).toBe(
      r.opportunities.filter((o) => o.agent_id === 'agent_1').length,
    );
    expect(trajectory.metrics.publicMessages).toBe(
      r.messages.filter((m) => m.sender_agent_id === 'agent_1' && m.channel === 'public').length,
    );
    expect(trajectory.breakoutGroups).toEqual(['breakout_a']);
  });

  it('introduces no label the data does not support', async () => {
    const r = await recorded();
    const trajectory = agentTrajectory(
      r.config,
      'agent_1',
      r.events,
      r.messages,
      r.opportunities,
      r.invocations,
    );
    const text = JSON.stringify(trajectory).toLowerCase();
    for (const word of ['coalition', 'influence', 'persuasion', 'dominance', 'belief', 'trust', 'alliance', 'deception']) {
      expect(text).not.toContain(word);
    }
  });
});

describe('compare', () => {
  async function measured(config = frozen()) {
    const r = await recorded(config);
    return runMeasures(r.run, r.config, r.messages, r.opportunities, r.invocations);
  }

  it('flags runs that do not share a config hash', async () => {
    const a = await measured();
    const b = await measured(freezeConfig(baseConfigObject({ experiment_id: 'agora_other' })));

    const comparison = compareRuns([a, b]);
    expect(comparison.configHashes).toHaveLength(2);
    expect(comparison.sameConfiguration).toBe(false);
  });

  it('groups runs of one configuration by their exact hash', async () => {
    const a = await measured();
    const b = await measured();

    const comparison = compareRuns([a, b]);
    expect(comparison.sameConfiguration).toBe(true);
    expect(comparison.configHashes).toEqual([a.configHash]);
  });

  it('flags a comparison that mixes moderator policies', async () => {
    const a = await measured();
    const b = await measured(
      frozen({ moderator: { id: 'moderator', display_name: 'Moderator', mode: 'scripted' } }),
    );

    const comparison = compareRuns([a, b]);
    expect(comparison.sameModerator).toBe(false);
    expect(comparison.moderatorModes.sort()).toEqual(['llm', 'scripted']);
  });

  it('reports a spread rather than a single average', async () => {
    const a = await measured();
    const b = await measured();

    const comparison = compareRuns([a, b]);
    const messages = comparison.spreads.find((s) => s.key === 'publicMessages')!;
    expect(messages.values).toHaveLength(2);
    expect(messages.min).toBeLessThanOrEqual(messages.max);
    expect(typeof messages.identical).toBe('boolean');
    // Nothing in the comparison presents one number as the outcome.
    expect(Object.keys(messages)).toContain('median');
    expect(Object.keys(messages)).not.toContain('mean');
  });

  it('handles a single run and an empty set without failing', async () => {
    const a = await measured();
    expect(compareRuns([a]).spreads.every((s) => s.min === s.max)).toBe(true);

    const empty = compareRuns([]);
    expect(empty.runs).toEqual([]);
    expect(empty.sameConfiguration).toBe(true);
    expect(empty.spreads.every((s) => s.values.length === 0)).toBe(true);
  });
});
