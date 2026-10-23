import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const specDir = join(process.cwd(), 'specs', 'phase1a');
const matrixPath = join(specDir, 'requirement-test-matrix.md');
const requirementPattern = /\b(?:CTX|EXP|ORCH|VIS|RPT|EVD|DRY|RPL|TST)-\d{2}\b/g;

function normativeRequirementIds(): string[] {
  return readdirSync(specDir)
    .filter((name) => name.endsWith('.md') && name !== basename(matrixPath))
    .flatMap((name) => readFileSync(join(specDir, name), 'utf8').match(requirementPattern) ?? [])
    .filter((id, index, all) => all.indexOf(id) === index)
    .sort();
}

function matrixRows() {
  return readFileSync(matrixPath, 'utf8')
    .split('\n')
    .map((line) => {
      const match = line.match(/^\| `((?:CTX|EXP|ORCH|VIS|RPT|EVD|DRY|RPL|TST)-\d{2})` \| `([^`]+)`(?: plus [^|]+)? \| ([^|]+) \| (GREEN|PARTIAL|RED|BLOCKED) \|$/);
      return match
        ? { id: match[1]!, test: match[2]!, proof: match[3]!.trim(), status: match[4]! }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

function behavioralTestSource(): string {
  return readdirSync(join(process.cwd(), 'tests'))
    .filter((name) => name.endsWith('.test.ts') && name !== basename(import.meta.filename))
    .map((name) => readFileSync(join(process.cwd(), 'tests', name), 'utf8'))
    .join('\n');
}

describe('Phase 1A specification traceability', () => {
  it('accounts for every normative requirement exactly once', () => {
    const expected = normativeRequirementIds();
    const actual = matrixRows().map((row) => row.id).sort();

    expect(expected).toHaveLength(80);
    expect(actual).toHaveLength(new Set(actual).size);
    expect(actual).toEqual(expected);
  });

  it('gives every requirement a named test and an observable proof statement', () => {
    for (const row of matrixRows()) {
      expect(row.test, `${row.id} needs a precise test name`).toMatch(/\.test\.ts > /);
      expect(row.proof.length, `${row.id} needs an assertion-level proof statement`).toBeGreaterThan(24);
    }
  });

  it('keeps the implemented status totals explicit', () => {
    const totals = Object.groupBy(matrixRows(), (row) => row.status);

    expect(totals.GREEN).toHaveLength(80);
    expect(totals.PARTIAL ?? []).toHaveLength(0);
    expect(totals.RED ?? []).toHaveLength(0);
    expect(totals.BLOCKED ?? []).toHaveLength(0);
  });

  it('cites every GREEN requirement in the behavioral test that proves it', () => {
    const source = behavioralTestSource();

    for (const row of matrixRows().filter((entry) => entry.status === 'GREEN')) {
      expect(source, `${row.id} is GREEN but no behavioral test cites it`).toContain(`[${row.id}]`);
    }
  });
});
