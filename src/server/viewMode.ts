import { esc } from '../export/replayHtml.js';

/**
 * How much of the instrument is on show.
 *
 * Phase 0 has one thing to demonstrate: five agents interacted in a controlled workshop,
 * and we can see exactly who communicated with whom, when, and what each model was given.
 * Everything else the application can do — idea extraction, the interaction matrix, per
 * agent trajectories, cross-run comparison, the raw API — is real work that answers
 * questions nobody has asked yet. Shown at the same level as the demonstration, it reads
 * as scope creep rather than as depth.
 *
 * So the default view carries the demonstration and nothing else, and the rest stays one
 * click away under its own name. Nothing is removed: every route still resolves, every
 * page still renders, and a link into a technical view still works when it is followed
 * from outside. The mode governs what the interface advertises, not what it holds.
 */
export type ViewMode = 'simple' | 'full';

export const VIEW_MODE_COOKIE = 'agora_view';

/** Simple unless the reader has asked for more. A first visit is always the demonstration. */
export function readViewMode(cookieHeader: string | undefined): ViewMode {
  if (!cookieHeader) return 'simple';
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== VIEW_MODE_COOKIE) continue;
    return part.slice(index + 1).trim() === 'full' ? 'full' : 'simple';
  }
  return 'simple';
}

export function parseViewMode(value: unknown): ViewMode {
  return value === 'full' ? 'full' : 'simple';
}

/** Control characters, which split headers, and the backslash, which some browsers
 *  normalise into the protocol-relative form rejected just above. */
const UNSAFE_IN_PATH = /[\u0000-\u001f\u007f\u005c]/;

/**
 * Where to go back to after switching.
 *
 * The path arrives in a form field, so it is attacker-controlled in the same way any
 * query parameter is. Only a path on this site is honoured: anything protocol-relative,
 * absolute, or carrying a control character becomes the home page instead of an open
 * redirect.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  if (UNSAFE_IN_PATH.test(value)) return '/';
  return value;
}

/**
 * The switch between the two views.
 *
 * A form rather than a link: this sets a preference that persists, and a link is
 * something a browser may follow on its own. The label names the destination, because a
 * control that names its current state leaves the reader to work out what pressing it
 * does.
 */
export function modeToggle(mode: ViewMode, returnTo: string): string {
  const next: ViewMode = mode === 'simple' ? 'full' : 'simple';
  return `<form class="vm-switch" method="post" action="/view-mode">
    <input type="hidden" name="mode" value="${next}">
    <input type="hidden" name="return_to" value="${esc(returnTo)}">
    <button type="submit" class="vm-btn" title="${
      mode === 'simple'
        ? 'Everything the instrument records, including analyses that are not part of Phase 0'
        : 'Back to the Phase 0 view: the workshop, the interactions, and the checks'
    }">${
      mode === 'simple'
        ? 'Technical details <span aria-hidden="true">›</span>'
        : '<span aria-hidden="true">‹</span> Simple view'
    }</button>
  </form>`;
}

export const VIEW_MODE_STYLES = `
.vm-switch { margin: 0; }
.vm-btn {
  font: inherit; font-size: .74rem; font-weight: 600; letter-spacing: .02em;
  padding: .25rem .6rem; cursor: pointer;
  color: var(--muted); background: transparent;
  border: 1px solid var(--line); border-radius: 999px;
}
.vm-btn:hover { color: var(--ink); border-color: var(--muted); }
.vm-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
`;
