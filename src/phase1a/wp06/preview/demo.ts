import { Phase1aRuntime, createFixtureManifest, type EvidenceBundle, type Phase1aProvider } from '../../index.js';
import { createReportAnnotationTemplate, type ReportAnnotations } from '../annotations.js';

export type DemoScenario = 'complete' | 'partial' | 'no-report' | 'disagreement';
const proposals = [
  'Keep full audit trails. A minority still objects to retaining sensitive records.',
  'Publish summaries with detailed methods and named reviewers.',
  'Release all raw data. A minority still supports unrestricted release.',
];
const report = 'Keep full audit trails, while recording the minority objection to sensitive records. Publish summaries.';

/** Scripted examples only: labels are authored fixtures, never inferred from text. */
export async function previewDemo(scenario: DemoScenario) {
  const runtime = new Phase1aRuntime(() => '2026-10-30T00:00:00.000Z');
  const manifest = createFixtureManifest(scenario === 'no-report' ? { cell: 'C', reportEnabled: false } : {});
  const id = runtime.createRun(manifest);
  const provider: Phase1aProvider = { async invoke(spec) {
    const outcome = scenario === 'partial' && spec.operationKey === 'round:2:agent_1' ? 'timeout' : 'success';
    const content = spec.operationKey.startsWith('round:') ? proposals[Number(spec.participantId.at(-1)) - 1]!
      : spec.operationKey === 'report:revised' ? report : 'Synthetic private or intermediate material; not shown in the preview.';
    return { provider: spec.provider, model: spec.model, outcome, content: outcome === 'success' ? content : null,
      usage: { inputTokens: 20, outputTokens: null }, finishReason: null, raw: { fixture: true } };
  } };
  await runtime.run(id, provider);
  const bundle = runtime.evidence(id);
  const annotations = scenario === 'complete' || scenario === 'disagreement' ? demoAnnotations(bundle) : undefined;
  if (scenario === 'disagreement') {
    const rating = annotations!.ratings.find(r => r.proposition_id === 'proposal-1' && r.construct === 'report_retention' && r.coder_id === 'demo-coder-b')!;
    rating.label = 'ABSENT'; rating.evidence = [];
    rating.rationale = 'Deliberate synthetic disagreement to demonstrate a withheld aggregate.';
  }
  return { bundle, annotations };
}

function demoAnnotations(bundle: EvidenceBundle): ReportAnnotations {
  const data = createReportAnnotationTemplate(bundle, ['demo-coder-a', 'demo-coder-b']);
  data.inventory_status = 'DECLARED_COMPLETE';
  const publicArtifacts = bundle.artifacts.filter(a => a.kind.startsWith('round.'));
  const final = bundle.artifacts.find(a => a.kind === 'report.revised')!;
  const span = (a: typeof final) => ({ artifact_id: a.artifact_id, start: 0, end: a.content.length, quote: a.content });
  data.propositions = publicArtifacts.slice(0, 3).map((a, i) => ({ proposition_id: `proposal-${i + 1}`, summary: proposals[i]!, origin: span(a) }));
  const labels = {
    public_dissent: ['PRESENT', 'ABSENT', 'PRESENT'],
    report_retention: ['FULL', 'PARTIAL', 'ABSENT'],
    dissent_preservation: ['PRESENT', 'NOT_ASSESSABLE', 'ABSENT'],
  } as const;
  for (const [i, proposition] of data.propositions.entries()) {
    for (const coder of data.coder_ids) {
      for (const construct of Object.keys(labels) as (keyof typeof labels)[]) {
        const label = labels[construct][i]!;
        data.ratings.push({ annotation_id: `${proposition.proposition_id}-${construct}-${coder}`, coder_id: coder,
          proposition_id: proposition.proposition_id, construct, label,
          rationale: 'Scripted demonstration label; not a research observation or a calibrated judgment.',
          reviewed_artifact_ids: construct === 'public_dissent' ? publicArtifacts.map(a => a.artifact_id) : [final.artifact_id],
          evidence: label === 'ABSENT' || label === 'NOT_ASSESSABLE' ? [] : [span(construct === 'public_dissent' ? publicArtifacts[i]! : final)],
        });
      }
    }
  }
  return data;
}
