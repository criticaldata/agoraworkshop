import type { WorkshopState } from '../config/schema.js';
import type { AgentInvocationRequest, AgentInvocationResult, AgentProvider } from './types.js';
import { configHash } from '../config/hash.js';

/**
 * A moderator that reads from a fixed script instead of calling a model.
 *
 * The point is attribution. When the moderator is a model, every procedural line it
 * produces is also model output, and a reader cannot tell the scaffolding of the
 * session apart from the behaviour under observation. A scripted moderator removes
 * that ambiguity: its text is fixed in this file, identical in every run, and costs
 * nothing.
 *
 * It deliberately does not summarise, paraphrase, or characterise anything a
 * participant said. Summarising is interpretation, and interpretation from the
 * apparatus would contaminate the record it is supposed to be keeping.
 */
export const SCRIPTED_MODERATOR_VERSION = 'scripted_moderator_v1';

const LINES: Record<WorkshopState, string> = {
  CREATED: 'The session has been created.',
  INTRODUCTION:
    'This session is now open. Each participant will introduce themselves in turn. ' +
    'Please state who you are and what you work on.',
  PUBLIC_DISCUSSION:
    'Public discussion is now open on the stated topic. Each participant speaks in turn ' +
    'and may respond to what has already been said.',
  PRIVATE_OR_BREAKOUT:
    'Breakout groups are now in session. Each group discusses within its own channel. ' +
    'Messages sent here are visible only to the members of your group.',
  FINAL_DISCUSSION:
    'The full group is reconvened. Final discussion is now open to all participants.',
  // No summary. The moderator closes the session and says nothing about its content.
  CLOSING:
    'The session is now closed. This moderator does not summarise the discussion; ' +
    'the record of what was said is the transcript itself.',
  COMPLETED: 'The session is complete.',
  FAILED: 'The session ended early.',
  CANCELLED: 'The session was cancelled by the operator.',
};

/** The exact text this moderator will produce in a given state. Used by tests and docs. */
export function scriptedModeratorLine(state: WorkshopState): string {
  return LINES[state];
}

export class ScriptedModeratorProvider implements AgentProvider {
  readonly name = 'scripted';
  constructor(private readonly opening?: string) {}

  async invoke(request: AgentInvocationRequest): Promise<AgentInvocationResult> {
    const ts = new Date().toISOString();
    // No network call, no model, no sampling: the same state always yields the same line.
    const content = request.workshopState === 'INTRODUCTION' && this.opening ? this.opening : LINES[request.workshopState ?? 'PUBLIC_DISCUSSION'];
    const version = scriptedModeratorVersion(this.opening);

    return {
      ok: true,
      provider: this.name,
      requestedModel: version,
      respondedModel: version,
      requestTs: ts,
      responseTs: ts,
      latencyMs: 0,
      finishReason: 'scripted',
      content,
      // Zero, not unknown: no tokens were bought because no provider was called.
      usage: { inputTokens: 0, outputTokens: 0 },
      failure: null,
      raw: {
        scripted: true,
        script_version: version,
        workshop_state: request.workshopState ?? null,
      },
    };
  }
}

export function scriptedModeratorVersion(opening?: string): string {
  return opening ? `${SCRIPTED_MODERATOR_VERSION}:${configHash(opening)}` : SCRIPTED_MODERATOR_VERSION;
}
