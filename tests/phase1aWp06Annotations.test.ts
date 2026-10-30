import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Phase1aRuntime, createFixtureManifest, type Phase1aProvider, type Outcome, type EvidenceBundle } from '../src/phase1a/index.js';
import { analyzeReportAnnotations, createReportAnnotationTemplate, type ReportAnnotations } from '../src/phase1a/wp06/annotations.js';
import { REPORT_CODEBOOK_HASH } from '../src/phase1a/wp06/codebook.js';
import { nominalReliability } from '../src/phase1a/wp06/reliability.js';

type Rating = ReportAnnotations['ratings'][number];
const report = 'Keep audit trails. Publish a summary. The group still disagrees about access.';
async function evidence(options: { report?: boolean; stop?: number; finalOutcome?: Outcome } = {}) {
  const runtime = new Phase1aRuntime();
  const manifest = createFixtureManifest(options.report === false ? { cell: 'C', reportEnabled: false } : {});
  const runId = runtime.createRun(manifest);
  const provider: Phase1aProvider = {
    async invoke(spec) {
      const outcome = spec.operationKey === 'report:revised' ? options.finalOutcome ?? 'success' : 'success';
      const content = spec.operationKey.startsWith('t') ? 'PRIVATE_CHECKPOINT_CANARY'
        : spec.operationKey.startsWith('report:review') ? 'ISOLATED_REVIEW_CANARY'
        : spec.operationKey === 'report:revised' ? report : `Public proposal ${spec.participantId}: keep audit trails and discuss access.`;
      return { outcome, provider: spec.provider, model: spec.model, content, usage: null, finishReason: 'stop', raw: {} };
    },
  };
  await runtime.run(runId, provider, { stopAfterOperations: options.stop });
  return runtime.evidence(runId);
}
function prepared(bundle: EvidenceBundle) {
  const data = createReportAnnotationTemplate(bundle, ['coder-a', 'coder-b']);
  data.inventory_status = 'DECLARED_COMPLETE';
  const publicArtifacts = bundle.artifacts.filter(a => /^round\./.test(a.kind));
  const final = bundle.artifacts.find(a => a.kind === 'report.revised')!;
  data.propositions = publicArtifacts.slice(0, 3).map((a, i) => ({
    proposition_id: `p${i}`, summary: `Candidate proposition ${i}`,
    origin: { artifact_id: a.artifact_id, start: 0, end: a.content.length, quote: a.content },
  }));
  const labels: Record<Rating['construct'], Rating['label'][]> = {
    public_dissent: ['PRESENT', 'ABSENT', 'PRESENT'],
    report_retention: ['FULL', 'PARTIAL', 'ABSENT'],
    dissent_preservation: ['PRESENT', 'NOT_ASSESSABLE', 'ABSENT'],
  };
  for (const p of data.propositions) {
    for (const coder of data.coder_ids) {
      for (const construct of Object.keys(labels) as Rating['construct'][]) {
        const label = labels[construct][Number(p.proposition_id.slice(1))]!;
        const a = construct === 'public_dissent' ? publicArtifacts[0]! : final;
        data.ratings.push({
          annotation_id: `${p.proposition_id}-${construct}-${coder}`, coder_id: coder,
          proposition_id: p.proposition_id, construct, label,
          rationale: 'Synthetic fixture assessment; not a research observation.',
          reviewed_artifact_ids: construct === 'public_dissent' ? publicArtifacts.map(a => a.artifact_id) : [final.artifact_id],
          evidence: label === 'ABSENT' || label === 'NOT_ASSESSABLE' ? [] : [{ artifact_id: a.artifact_id, start: 0, end: a.content.length, quote: a.content }],
        });
      }
    }
  }
  return data;
}
function rating(data: ReportAnnotations, construct: Rating['construct'] = 'report_retention', proposition = 'p0', coder = 'coder-b') {
  return data.ratings.find(r => r.construct === construct && r.proposition_id === proposition && r.coder_id === coder)!;
}

describe('WP06 independent annotation and report measures', () => {
  it('[ANA-09] derives retention and dissent from verified source-linked human records without rewriting evidence', async () => {
    const bundle = await evidence(), data = prepared(bundle);
    const before = JSON.stringify({ bundle, data });
    const result = analyzeReportAnnotations(bundle, data);
    expect(result.report_retention).toMatchObject({ numerator: 2, denominator: 3, value: 2 / 3, availability: 'exploratory', counts: { FULL: 1, PARTIAL: 1, ABSENT: 1 } });
    expect(result.dissent_preservation).toMatchObject({ numerator: 1, denominator: 2, value: .5 });
    expect(result.scientific_status).toBe('PENDING_SCIENTIFIC_APPROVAL');
    expect(result.codebook_status).toBe('DRAFT');
    expect(result.items).toHaveLength(9);
    expect(result.reliability.report_retention?.krippendorff_alpha).toBe(1);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CHECKPOINT_CANARY');
    expect(JSON.stringify(result)).not.toContain('ISOLATED_REVIEW_CANARY');
    expect(JSON.stringify(result)).not.toContain(report);
    expect(JSON.stringify({ bundle, data })).toBe(before);
  });

  it('[ANA-10] requires all declared coders and complete inventory rather than silently using complete cases', async () => {
    const bundle = await evidence(), data = prepared(bundle);
    data.ratings.splice(data.ratings.indexOf(rating(data)), 1);
    let result = analyzeReportAnnotations(bundle, data);
    expect(result.report_retention.value).toBeNull();
    expect(result.report_retention.unresolved).toBe(1);
    expect(result.reliability.report_retention?.missing_ratings).toBe(1);
    expect(result.items.find(i => i.construct === 'report_retention' && i.proposition_id === 'p0')?.missing_coder_ids).toEqual(['coder-b']);
    data.inventory_status = 'DRAFT';
    expect(analyzeReportAnnotations(bundle, data).report_retention.reasons).toContain('INCOMPLETE_PROPOSITION_INVENTORY');
    const third = prepared(bundle); third.coder_ids.push('coder-c');
    result = analyzeReportAnnotations(bundle, third);
    expect(result.report_retention.value).toBeNull();
    expect(result.items.every(item => item.status === 'PENDING')).toBe(true);
  });

  it('[ANA-10] preserves NOT_ASSESSABLE and zero denominators as unavailable', async () => {
    const bundle = await evidence(), data = prepared(bundle);
    for (const coder of data.coder_ids) rating(data, 'report_retention', 'p0', coder).label = 'NOT_ASSESSABLE';
    expect(analyzeReportAnnotations(bundle, data).report_retention).toMatchObject({ value: null, counts: { NOT_ASSESSABLE: 1 } });
    const noDissent = prepared(bundle);
    noDissent.ratings.filter(r => r.construct === 'public_dissent').forEach(r => { r.label = 'ABSENT'; });
    expect(analyzeReportAnnotations(bundle, noDissent).dissent_preservation).toMatchObject({ denominator: 0, value: null, reasons: ['ZERO_DENOMINATOR'] });
    const empty = createReportAnnotationTemplate(bundle, ['a', 'b']); empty.inventory_status = 'DECLARED_COMPLETE';
    expect(analyzeReportAnnotations(bundle, empty).report_retention.value).toBeNull();
  });

  it('[ANA-11] adjudicates separately while reliability retains original disagreements', async () => {
    const bundle = await evidence(), data = prepared(bundle);
    rating(data).label = 'ABSENT';
    const before = analyzeReportAnnotations(bundle, data);
    expect(before.report_retention.value).toBeNull();
    const originals = data.ratings.filter(r => r.proposition_id === 'p0' && r.construct === 'report_retention');
    const { annotation_id: _, coder_id: __, ...judgment } = originals[0]!;
    data.adjudications.push({ ...judgment, adjudication_id: 'adjudication-1', adjudicator_id: 'reviewer-c', annotation_ids: originals.map(r => r.annotation_id) });
    const after = analyzeReportAnnotations(bundle, data);
    expect(after.report_retention.value).toBe(2 / 3);
    expect(after.reliability.report_retention?.krippendorff_alpha).toBe(before.reliability.report_retention?.krippendorff_alpha);
    expect(after.reliability.report_retention?.adjudicated_items).toBe(1);
    expect(rating(data).label).toBe('ABSENT');
    data.adjudications[0]!.adjudicator_id = 'coder-a';
    expect(() => analyzeReportAnnotations(bundle, data)).toThrow(/independent adjudicator/);
    data.adjudications[0]!.adjudicator_id = 'reviewer-c';
    data.adjudications[0]!.annotation_ids[1] = 'unknown';
    expect(() => analyzeReportAnnotations(bundle, data)).toThrow(/every original/);
  });

  it.each(['run', 'fingerprint', 'codebook', 'span', 'label', 'duplicate', 'coder', 'proposition', 'reviewed'] as const)('[ANA-12] rejects invalid %s records', async kind => {
    const bundle = await evidence(), data = prepared(bundle);
    if (kind === 'run') data.run_id = 'other';
    if (kind === 'fingerprint') data.evidence_hash = `sha256:${'a'.repeat(64)}`;
    if (kind === 'codebook') data.codebook_hash = `sha256:${'b'.repeat(64)}`;
    if (kind === 'span') data.propositions[0]!.origin.quote = 'wrong';
    if (kind === 'label') rating(data).label = 'PRESENT';
    if (kind === 'duplicate') data.ratings.push(structuredClone(data.ratings[0]!));
    if (kind === 'coder') data.ratings[0]!.coder_id = 'undeclared';
    if (kind === 'proposition') data.ratings[0]!.proposition_id = 'unknown';
    if (kind === 'reviewed') rating(data).reviewed_artifact_ids = [];
    expect(() => analyzeReportAnnotations(bundle, data)).toThrow();
  });

  it('[ANA-12] rejects private evidence and missing positive spans', async () => {
    const bundle = await evidence(), data = prepared(bundle);
    const privateArtifact = bundle.artifacts.find(a => a.kind === 'checkpoint.t0')!;
    data.propositions[0]!.origin = { artifact_id: privateArtifact.artifact_id, start: 0, end: privateArtifact.content.length, quote: privateArtifact.content };
    expect(() => analyzeReportAnnotations(bundle, data)).toThrow(/out-of-scope/);
    const other = prepared(bundle); rating(other).evidence = [];
    expect(() => analyzeReportAnnotations(bundle, other)).toThrow(/requires evidence spans/);
    const absent = prepared(bundle); rating(absent, 'public_dissent', 'p1').reviewed_artifact_ids.pop();
    expect(() => analyzeReportAnnotations(bundle, absent)).toThrow(/complete target/);
  });

  it('[ANA-13] keeps no-report, failed-report and partial public evidence out of metric denominators', async () => {
    for (const [options, reason] of [
      [{ report: false }, 'NO_REPORT_CONDITION'],
      [{ finalOutcome: 'refused' as const }, 'NO_SUCCESSFUL_FINAL_REPORT'],
      [{ stop: 4 }, 'INCOMPLETE_PUBLIC_TRACE'],
    ] as const) {
      const bundle = await evidence(options);
      const data = createReportAnnotationTemplate(bundle, ['a', 'b']);
      data.inventory_status = 'DECLARED_COMPLETE';
      const result = analyzeReportAnnotations(bundle, data);
      expect(result.report_retention.value).toBeNull();
      expect(result.report_retention.reasons).toContain(reason);
      expect(result.dissent_preservation.value).toBeNull();
    }
  });

  it('[ANA-14] exposes template, codebook and annotated analysis through the offline CLI', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wp06-annotation-'));
    try {
      const bundle = await evidence(), data = prepared(bundle);
      const bundlePath = join(dir, 'bundle.json'), annotationPath = join(dir, 'annotations.json');
      writeFileSync(bundlePath, JSON.stringify(bundle)); writeFileSync(annotationPath, JSON.stringify(data));
      const cli = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'src/phase1a/wp06/cli.ts', ...args], { encoding: 'utf8' });
      const template = cli('--annotation-template', bundlePath, 'coder-a', 'coder-b');
      expect(template.status, template.stderr).toBe(0);
      expect(JSON.parse(template.stdout)).toMatchObject({ propositions: [], ratings: [], inventory_status: 'DRAFT' });
      const codebook = cli('--codebook');
      expect(JSON.parse(codebook.stdout).codebook_hash).toBe(REPORT_CODEBOOK_HASH);
      const result = cli(bundlePath, '--annotations', annotationPath);
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).report_retention.value).toBe(2 / 3);
      data.run_id = 'wrong'; writeFileSync(annotationPath, JSON.stringify(data));
      const bad = cli(bundlePath, '--annotations', annotationPath);
      expect(bad.status).toBe(1); expect(bad.stdout).toBe('');
      const invalidArgs = cli('--annotation-template', bundlePath, 'only-one');
      expect(invalidArgs.status).toBe(1); expect(invalidArgs.stdout).toBe('');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('WP06 nominal reliability', () => {
  const rows = (groups: string[][]) => groups.flatMap((labels, i) => labels.map((label, j) => ({ item_id: `i${i}`, coder_id: `c${j}`, label })));
  it('[ANA-15] matches hand-calculated alpha and confusion matrix for balanced two-coder ratings', () => {
    const result = nominalReliability(['i0', 'i1', 'i2'], rows([['P', 'P'], ['P', 'A'], ['A', 'A']]));
    expect(result.observed_disagreement).toBeCloseTo(1 / 3);
    expect(result.expected_disagreement).toBeCloseTo(.6);
    expect(result.krippendorff_alpha).toBeCloseTo(4 / 9);
    expect(result.observed_agreement).toBeCloseTo(2 / 3);
    expect(result.pairwise[0]?.confusion_matrix).toEqual({ '["P","P"]': 1, '["P","A"]': 1, '["A","A"]': 1 });
    expect(result.label_prevalence).toEqual({ A: .5, P: .5 });
  });
  it('[ANA-15] uses coincidence weighting with unequal coder counts and excludes singleton/missing ratings', () => {
    const result = nominalReliability(['i0', 'i1', 'i2', 'i3'], rows([['P', 'P', 'P'], ['P', 'A'], ['A'], ['NOT_ASSESSABLE']]));
    expect(result).toMatchObject({ pairable_items: 2, pairable_ratings: 5, assessable_ratings: 6, not_assessable_ratings: 1 });
    expect(result.krippendorff_alpha).toBeCloseTo(0);
    expect(result.observed_agreement).toBeCloseTo(.75);
    expect(result.label_counts).toEqual({ A: 1, P: 4 });
  });
  it('[ANA-15] reports degenerate samples as undefined and permits negative agreement', () => {
    expect(nominalReliability(['i0'], rows([['P', 'P']]))).toMatchObject({ krippendorff_alpha: null, observed_agreement: 1, alpha_unavailable_reason: 'NO_LABEL_VARIATION' });
    expect(nominalReliability(['i0'], [])).toMatchObject({ krippendorff_alpha: null, observed_agreement: null, alpha_unavailable_reason: 'NO_PAIRABLE_RATINGS' });
    expect(nominalReliability(['i0', 'i1'], rows([['P', 'A'], ['P', 'A']])).krippendorff_alpha).toBeCloseTo(-.5);
  });
  it('[ANA-15] rejects duplicate coder/item ratings and undeclared items', () => {
    const duplicate = rows([['P']]); duplicate.push(duplicate[0]!);
    expect(() => nominalReliability(['i0'], duplicate)).toThrow(/duplicate/);
    expect(() => nominalReliability([], rows([['P']]))).toThrow(/Invalid/);
  });
});
