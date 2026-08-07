import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { docsPage, FACTS } from '../src/server/docs.js';
import { EVENT_TYPES, INFRASTRUCTURE_FAILURES } from '../src/events/types.js';
import { SCHEMA_SQL } from '../src/db/schema.js';

/**
 * The documentation quotes figures about the code. These tests check the figures
 * against the source, so the page cannot drift away from what it describes.
 */
describe('documentation stays true to the code', () => {
  it('quotes the actual number of event types', () => {
    expect(FACTS.eventTypes).toBe(EVENT_TYPES.length);
    expect(docsPage()).toContain(`${EVENT_TYPES.length} event types`);
  });

  it('quotes the actual number of infrastructure failure categories', () => {
    expect(FACTS.failureCategories).toBe(INFRASTRUCTURE_FAILURES.length);
    expect(docsPage()).toContain(`${INFRASTRUCTURE_FAILURES.length} infrastructure categories`);
  });

  it('quotes the actual number of tables', () => {
    const tables = SCHEMA_SQL.match(/CREATE TABLE IF NOT EXISTS/g) ?? [];
    expect(FACTS.tables).toBe(tables.length);
    expect(docsPage()).toContain(`${tables.length} tables in SQLite`);
  });

  it('names every table that the schema actually creates', () => {
    const names = [...SCHEMA_SQL.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]!);
    const html = docsPage();
    for (const name of names) {
      expect(html, `documentation should describe the ${name} table`).toContain(
        `>${name}</td>`,
      );
    }
  });

  it('pins the same Node major that the container runs', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    expect(dockerfile).toContain(`node:${FACTS.runtimeNode}-`);
  });
});

describe('documentation page', () => {
  it('evaluates every template placeholder rather than printing it literally', () => {
    // A escaped placeholder compiles and type-checks but renders as visible source.
    expect(docsPage()).not.toContain('${');
  });

  it('documents the access model and its real limits', () => {
    const html = docsPage();
    expect(html).toContain('Access control');
    expect(html).toContain('AGORA_AUTH_PASSWORD');
    expect(html).toContain('It fails closed.');
    // The route table must actually render its rows.
    expect(html).toContain('Starting a run, rerunning, exporting');
    expect(html).toContain('Health check');
    // And the limits of the design must be stated, not just its properties.
    expect(html).toContain('one shared credential');
  });

  it('no longer claims the deployed instance is unauthenticated', () => {
    expect(docsPage()).not.toContain('The deployed instance is unauthenticated');
  });

  it('is self-contained: no external assets and no scripts', () => {
    const html = docsPage();
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('covers architecture, limits and proposed work', () => {
    const html = docsPage();
    expect(html).toContain('Shape of the system');
    expect(html).toContain('Current limits');
    expect(html).toContain('Proposed work');
  });

  it('separates limits by kind so they are not all treated the same way', () => {
    const html = docsPage();
    expect(html).toContain('limit operational');
    expect(html).toContain('limit design');
    expect(html).toContain('limit gap');
  });

  it('states the constraint that governs every extension', () => {
    expect(docsPage()).toContain(
      'preserve the separation',
    );
  });

  it('records what is deliberately not proposed', () => {
    const html = docsPage();
    expect(html).toContain('Not proposed');
    expect(html).toContain('coalition detection');
  });

  it('links to the other views', () => {
    const html = docsPage();
    expect(html).toContain('href="/runs"');
    expect(html).toContain('href="/"');
  });
});
