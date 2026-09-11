import { describe, expect, it } from 'vitest';
import { validateBreakoutAssignment } from '../src/phase1/canonicalContract.js';

const participants = ['agent_1', 'agent_2', 'agent_3', 'agent_4', 'agent_5'];

describe('canonical Phase 1A topology', () => {
  it('accepts exactly two disjoint 2+3 participant groups', () => {
    expect(validateBreakoutAssignment([
      { id: 'breakout_a', members: ['agent_1', 'agent_2'] },
      { id: 'breakout_b', members: ['agent_3', 'agent_4', 'agent_5'] },
    ], participants, 'moderator')).toEqual({ valid: true, errors: [] });
  });

  it.each([
    [['agent_1', 'agent_1'], ['agent_2', 'agent_3', 'agent_4']],
    [['agent_1'], ['agent_2', 'agent_3', 'agent_4', 'agent_5']],
    [['agent_1', 'agent_2'], ['agent_3', 'agent_4'], ['agent_5']],
    [['agent_1', 'moderator'], ['agent_2', 'agent_3', 'agent_4']],
  ])('rejects invalid membership %j', (left, right) => {
    const result = validateBreakoutAssignment([
      { id: 'a', members: left as string[] },
      { id: 'b', members: right as string[] },
    ], participants, 'moderator');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
