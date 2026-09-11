import { describe, expect, it } from 'vitest';
import { classifyTerminalOutcome, isBehavioralTerminalOutcome } from '../src/phase1/terminalOutcome.js';

describe('behavioral terminal outcomes', () => {
  it.each(['success', 'explicit_abstention', 'no_op'])('%s is behavioral', value => {
    expect(isBehavioralTerminalOutcome(value)).toBe(true);
    expect(classifyTerminalOutcome(value)).toBe('behavioral');
  });

  it.each(['timeout', 'provider_error', 'tool_timeout', 'invalid', 'budget', 'deadline', 'cancellation'])('%s is not behavioral', value => {
    expect(isBehavioralTerminalOutcome(value)).toBe(false);
    expect(classifyTerminalOutcome(value)).not.toBe('behavioral');
  });

  it('does not infer behavior from unknown or missing evidence', () => {
    expect(isBehavioralTerminalOutcome(null)).toBe(false);
    expect(classifyTerminalOutcome(undefined)).toBe('incomplete');
    expect(classifyTerminalOutcome('infra_failure', 'provider_error')).toBe('infrastructure');
  });
});
