import { describe, expect, it } from 'vitest';
import { BASE_STYLES } from '../src/server/theme.js';
import { RUN_NAV_STYLES } from '../src/server/runNav.js';
import { STYLES } from '../src/export/replayHtml.js';
import { homePage } from '../src/server/home.js';
import { docsPage } from '../src/server/docs.js';

/**
 * The interface is light only. A dark ground was measured as harder to read for this
 * content, so the dark-mode rules were removed rather than merely defaulted away from.
 */
const SHEETS: Array<[string, string]> = [
  ['theme', BASE_STYLES],
  ['replay', STYLES],
];

describe('colour scheme', () => {
  for (const [name, sheet] of SHEETS) {
    it(`${name}: carries no dark-mode rules`, () => {
      expect(sheet).not.toContain('prefers-color-scheme');
    });

    it(`${name}: pins the browser to the light scheme`, () => {
      // `light dark` would let the browser dark-render scrollbars and form controls
      // even though every colour here is light.
      expect(sheet).toContain('color-scheme: light;');
      expect(sheet).not.toContain('color-scheme: light dark');
    });

    it(`${name}: paints an explicit light ground rather than inheriting one`, () => {
      expect(sheet).toMatch(/--(paper|bg): #f7f9fb;/);
    });
  }

  it('uses the same ground on every page family', () => {
    expect(BASE_STYLES).toContain('--paper: #f7f9fb;');
    expect(STYLES).toContain('--bg: #f7f9fb;');
  });

  it('renders pages with no dark-mode rule reaching the browser', () => {
    for (const html of [homePage({ latestRun: null, latestEvents: [], runCount: 0 }), docsPage()]) {
      expect(html).not.toContain('prefers-color-scheme');
    }
  });
});

describe('the run masthead only uses tokens its pages define', () => {
  /**
   * The overview stylesheet calls the page ground --paper; the operator stylesheet calls
   * it --bg. A masthead that names only one of them renders transparent on the other,
   * and a sticky transparent header is one the content scrolls straight through.
   */
  it('names a fallback for every custom property it reads', () => {
    const reads = [...RUN_NAV_STYLES.matchAll(/var\((--[a-z-]+)([^)]*)\)/g)];
    expect(reads.length).toBeGreaterThan(0);

    const definedByOperatorPages = new Set(
      [...STYLES.matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]!),
    );

    for (const [, token, rest] of reads) {
      const hasFallback = rest.includes(',');
      expect(
        definedByOperatorPages.has(token!) || hasFallback,
        `${token} is not defined by the operator stylesheet and has no fallback`,
      ).toBe(true);
    }
  });
});
