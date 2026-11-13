import { z } from 'zod';
import { configHash } from '../../config/hash.js';
import type { EvidenceBundle } from '../index.js';
import { analyzeRun } from './index.js';
import { REPORT_CODEBOOK, REPORT_CODEBOOK_HASH, type ReportConstruct } from './codebook.js';
import { nominalReliability } from './reliability.js';

const Id = z.string().trim().min(1);
const Hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const Construct = z.enum(['public_dissent', 'report_retention', 'dissent_preservation']);
const Label = z.enum(['PRESENT', 'ABSENT', 'FULL', 'PARTIAL', 'DISTORTED', 'NOT_ASSESSABLE']);
const Span = z.object({ artifact_id: Id, start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string().min(1) }).strict();
const Judgment = z.object({
  proposition_id: Id, construct: Construct, label: Label,
  evidence: z.array(Span), reviewed_artifact_ids: z.array(Id), rationale: Id,
}).strict();
export const ReportAnnotationsSchema = z.object({
  schema_version: z.literal('wp06-report-annotations-v1'),
  run_id: Id, evidence_hash: Hash, codebook_hash: z.literal(REPORT_CODEBOOK_HASH),
  inventory_status: z.enum(['DRAFT', 'DECLARED_COMPLETE']),
  coder_ids: z.array(Id).min(2),
  propositions: z.array(z.object({ proposition_id: Id, summary: Id, origin: Span }).strict()),
  ratings: z.array(Judgment.extend({ annotation_id: Id, coder_id: Id }).strict()),
  adjudications: z.array(Judgment.extend({ adjudication_id: Id, adjudicator_id: Id, annotation_ids: z.array(Id).min(2) }).strict()),
}).strict();
export type ReportAnnotations = z.infer<typeof ReportAnnotationsSchema>;
type JudgmentRecord = z.infer<typeof Judgment>;
type EvidenceSpan = z.infer<typeof Span>;
const constructs: ReportConstruct[] = ['public_dissent', 'report_retention', 'dissent_preservation'];

function unique(values: readonly string[], name: string) {
  if (new Set(values).size !== values.length) throw new Error(`WP06 duplicate ${name}`);
}
function itemKey(proposition: string, construct: string) { return JSON.stringify([proposition, construct]); }

/** Blank inventory and ratings: no findings or annotations are generated. */
export function createReportAnnotationTemplate(bundle: EvidenceBundle, coderIds: string[]): ReportAnnotations {
  const run = analyzeRun(bundle);
  const template = ReportAnnotationsSchema.parse({
    schema_version: 'wp06-report-annotations-v1', run_id: run.run_id, evidence_hash: run.evidence_hash,
    codebook_hash: REPORT_CODEBOOK_HASH, inventory_status: 'DRAFT', coder_ids: coderIds,
    propositions: [], ratings: [], adjudications: [],
  });
  unique(template.coder_ids, 'coder');
  return template;
}

/** Validates human-authored records; it never generates or changes semantic labels. */
export function analyzeReportAnnotations(bundle: EvidenceBundle, input: unknown) {
  const run = analyzeRun(bundle);
  const data = ReportAnnotationsSchema.parse(input);
  if (data.run_id !== run.run_id || data.evidence_hash !== run.evidence_hash) throw new Error('WP06 annotations refer to different evidence');
  unique(data.coder_ids, 'coder');
  unique(data.propositions.map(p => p.proposition_id), 'proposition');
  unique(data.ratings.map(r => r.annotation_id), 'annotation ID');
  unique(data.adjudications.map(r => r.adjudication_id), 'adjudication ID');
  unique(data.ratings.map(r => JSON.stringify([r.proposition_id, r.construct, r.coder_id])), 'coder/item rating');
  unique(data.adjudications.map(r => itemKey(r.proposition_id, r.construct)), 'item adjudication');
  const propositions = new Set(data.propositions.map(p => p.proposition_id));
  const successful = run.opportunities.filter(row => row.status === 'committed' && row.outcome === 'success');
  const publicIds = new Set(successful.filter(row => row.stage === 'PUBLIC').map(row => row.output_artifact_id!));
  const finalId = successful.find(row => row.opportunity_id === 'report:revised')?.output_artifact_id ?? null;
  const completePublic = run.by_stage.PUBLIC!.committed === run.by_stage.PUBLIC!.planned;
  const artifactMap = new Map(bundle.artifacts.map(a => [a.artifact_id, a]));

  function verifySpan(span: EvidenceSpan, allowed: Set<string>) {
    const artifact = artifactMap.get(span.artifact_id);
    if (!allowed.has(span.artifact_id) || !artifact || span.start >= span.end || span.end > artifact.content.length
      || artifact.content.slice(span.start, span.end) !== span.quote) throw new Error('WP06 invalid or out-of-scope evidence span');
  }
  for (const proposition of data.propositions) verifySpan(proposition.origin, publicIds);

  function validateJudgment(record: JudgmentRecord) {
    if (!propositions.has(record.proposition_id)) throw new Error('WP06 unknown proposition');
    if (!(REPORT_CODEBOOK.labels[record.construct] as readonly string[]).includes(record.label)) throw new Error('WP06 label does not belong to construct');
    const allowed = record.construct === 'public_dissent' ? publicIds : new Set(finalId ? [finalId] : []);
    unique(record.reviewed_artifact_ids, 'reviewed artifact');
    if (record.reviewed_artifact_ids.some(id => !allowed.has(id))) throw new Error('WP06 out-of-scope reviewed artifact');
    record.evidence.forEach(span => {
      verifySpan(span, allowed);
      if (!record.reviewed_artifact_ids.includes(span.artifact_id)) throw new Error('WP06 evidence artifact must be reviewed');
    });
    if (record.label !== 'NOT_ASSESSABLE') {
      if (record.construct === 'public_dissent' ? !completePublic : !finalId) throw new Error('WP06 assessable judgment requires complete target evidence');
      if ([...allowed].some(id => !record.reviewed_artifact_ids.includes(id))) throw new Error('WP06 judgment requires review of the complete target');
      if (record.label !== 'ABSENT' && record.evidence.length === 0) throw new Error('WP06 positive judgment requires evidence spans');
    }
  }
  for (const rating of data.ratings) {
    if (!data.coder_ids.includes(rating.coder_id)) throw new Error('WP06 undeclared coder');
    validateJudgment(rating);
  }
  for (const adjudication of data.adjudications) {
    validateJudgment(adjudication);
    const originals = data.ratings.filter(r => r.proposition_id === adjudication.proposition_id && r.construct === adjudication.construct);
    unique(adjudication.annotation_ids, 'adjudication source');
    if (originals.length !== data.coder_ids.length || adjudication.annotation_ids.length !== originals.length
      || originals.some(r => !adjudication.annotation_ids.includes(r.annotation_id))
      || data.coder_ids.includes(adjudication.adjudicator_id)) throw new Error('WP06 adjudication requires every original rating and an independent adjudicator');
  }

  const items = data.propositions.flatMap(proposition => constructs.map(construct => {
    const originals = data.ratings.filter(r => r.proposition_id === proposition.proposition_id && r.construct === construct);
    const adjudication = data.adjudications.find(r => r.proposition_id === proposition.proposition_id && r.construct === construct);
    const allRated = originals.length === data.coder_ids.length;
    const unanimous = allRated && new Set(originals.map(r => r.label)).size === 1;
    const resolved = adjudication?.label ?? (unanimous ? originals[0]!.label : null);
    return {
      proposition_id: proposition.proposition_id, construct,
      status: resolved === 'NOT_ASSESSABLE' ? 'NOT_ASSESSABLE' : resolved !== null ? 'RESOLVED' : allRated ? 'DISAGREEMENT' : 'PENDING',
      label: resolved, resolution: adjudication ? 'ADJUDICATED' : unanimous ? 'UNANIMOUS' : null,
      annotation_ids: originals.map(r => r.annotation_id), adjudication_id: adjudication?.adjudication_id ?? null,
      missing_coder_ids: data.coder_ids.filter(id => !originals.some(r => r.coder_id === id)),
      source_artifact_ids: [...new Set([proposition.origin.artifact_id, ...originals.flatMap(r => r.reviewed_artifact_ids), ...(adjudication?.reviewed_artifact_ids ?? [])])],
    };
  }));
  const retention = items.filter(item => item.construct === 'report_retention');
  const dissent = items.filter(item => item.construct === 'public_dissent');
  const dissentIds = new Set(dissent.filter(item => item.label === 'PRESENT').map(item => item.proposition_id));
  const preservation = items.filter(item => item.construct === 'dissent_preservation' && dissentIds.has(item.proposition_id));
  const baseReasons = [
    ...(!bundle.manifest.reportEnabled ? ['NO_REPORT_CONDITION'] : !finalId ? ['NO_SUCCESSFUL_FINAL_REPORT'] : []),
    ...(!completePublic ? ['INCOMPLETE_PUBLIC_TRACE'] : []),
    ...(data.inventory_status !== 'DECLARED_COMPLETE' ? ['INCOMPLETE_PROPOSITION_INVENTORY'] : []),
  ];
  function metric(numerator: number, denominator: number, unresolved: boolean) {
    const reasons = [...baseReasons, ...(unresolved ? ['UNRESOLVED_OR_UNASSESSABLE_LABELS'] : []), ...(denominator === 0 ? ['ZERO_DENOMINATOR'] : [])];
    return { numerator, denominator, value: reasons.length ? null : numerator / denominator,
      availability: reasons.length ? 'unavailable' : 'exploratory', reasons };
  }
  const reliability = Object.fromEntries(constructs.map(construct => {
    const ratings = data.ratings.filter(r => r.construct === construct);
    return [construct, {
      ...nominalReliability(data.propositions.map(p => p.proposition_id), ratings.map(r => ({ item_id: r.proposition_id, coder_id: r.coder_id, label: r.label }))),
      source_annotation_ids: ratings.map(r => r.annotation_id),
      adjudicated_items: data.adjudications.filter(a => a.construct === construct).length,
      expected_ratings: data.propositions.length * data.coder_ids.length,
      missing_ratings: data.propositions.length * data.coder_ids.length - ratings.length,
    }];
  }));
  return {
    algorithm_version: 'wp06-report-analysis-v1', analysis_unit: 'run', visibility: 'operator',
    run_id: run.run_id, evidence_hash: run.evidence_hash, manifest_hash: run.manifest_hash,
    annotation_hash: configHash(data), codebook_hash: REPORT_CODEBOOK_HASH,
    codebook_status: REPORT_CODEBOOK.status, source: run.source,
    scientific_status: 'PENDING_SCIENTIFIC_APPROVAL', inventory_status: data.inventory_status,
    proposition_count: data.propositions.length,
    report_retention: {
      ...metric(retention.filter(item => item.label === 'FULL' || item.label === 'PARTIAL').length,
        data.propositions.length, retention.some(item => item.status !== 'RESOLVED')),
      counts: Object.fromEntries(REPORT_CODEBOOK.labels.report_retention.map(label => [label, retention.filter(item => item.label === label).length])),
      unresolved: retention.filter(item => item.label === null).length,
    },
    dissent_preservation: metric(preservation.filter(item => item.label === 'PRESENT').length, dissentIds.size,
      dissent.some(item => item.status !== 'RESOLVED') || preservation.some(item => item.status !== 'RESOLVED')),
    reliability, items,
    limitations: [
      'Draft codebook: numerical outputs are exploratory engineering calculations, not approved scientific findings.',
      'Proposition completeness, semantic equivalence and coder independence are human attestations, not established by schema validation.',
      'Reliability uses original assessable ratings only; adjudication never improves the reported agreement statistic.',
      'NOT_ASSESSABLE ratings are excluded from nominal alpha and reported separately. All-identical labels produce null alpha.',
      'No causal or mental-state claims. No confidence intervals or tests treating propositions as independent runs.',
      'Metadata-only summary; annotation inputs contain source quotes and must remain access-controlled.',
    ],
  };
}
