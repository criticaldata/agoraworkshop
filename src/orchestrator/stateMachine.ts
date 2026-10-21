import type { WorkshopState } from '../config/schema.js';

/**
 * Explicit finite state machine. Transitions are deterministic given the runtime
 * state and the config; only the text produced inside a state is stochastic.
 */
/**
 * The canonical phase order. A run may move forward through it and may skip phases the
 * config gave zero rounds, but it may never move backwards, and COMPLETED is reachable
 * only from CLOSING — so every run ends with an explicit close.
 */
const PHASE_ORDER: WorkshopState[] = [
  'CREATED',
  'INTRODUCTION',
  'PUBLIC_DISCUSSION',
  'PRIVATE_OR_BREAKOUT',
  'PUBLIC_RECONVENING',
  'FINAL_DISCUSSION',
  'CLOSING',
];

function forwardTransitions(from: WorkshopState): WorkshopState[] {
  const index = PHASE_ORDER.indexOf(from);
  if (index === -1) return [];
  const forward = PHASE_ORDER.slice(index + 1);
  return from === 'CLOSING'
    ? ['COMPLETED', 'FAILED', 'CANCELLED']
    : [...forward, 'FAILED', 'CANCELLED'];
}

export const ALLOWED_TRANSITIONS: Record<WorkshopState, WorkshopState[]> = {
  CREATED: forwardTransitions('CREATED'),
  INTRODUCTION: forwardTransitions('INTRODUCTION'),
  PUBLIC_DISCUSSION: forwardTransitions('PUBLIC_DISCUSSION'),
  PRIVATE_OR_BREAKOUT: forwardTransitions('PRIVATE_OR_BREAKOUT'),
  PUBLIC_RECONVENING: forwardTransitions('PUBLIC_RECONVENING'),
  FINAL_DISCUSSION: forwardTransitions('FINAL_DISCUSSION'),
  CLOSING: forwardTransitions('CLOSING'),
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export const TERMINAL_STATES: WorkshopState[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

export function canTransition(from: WorkshopState, to: WorkshopState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: WorkshopState,
    readonly to: WorkshopState,
  ) {
    super(`invalid workshop state transition: ${from} -> ${to}`);
  }
}

/**
 * The canonical happy-path sequence for a config. Phases with zero configured rounds
 * are skipped, but the ordering never varies.
 */
export function plannedStates(rounds: {
  introduction: number;
  public_discussion: number;
  private_or_breakout: number;
  final_discussion: number;
}, canonical = false): WorkshopState[] {
  const states: WorkshopState[] = [];
  if (rounds.introduction > 0) states.push('INTRODUCTION');
  if (rounds.public_discussion > 0) states.push('PUBLIC_DISCUSSION');
  if (rounds.private_or_breakout > 0) states.push('PRIVATE_OR_BREAKOUT');
  if (canonical) states.push('PUBLIC_RECONVENING');
  if (rounds.final_discussion > 0) states.push('FINAL_DISCUSSION');
  states.push('CLOSING');
  return states;
}
