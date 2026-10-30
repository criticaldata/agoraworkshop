import type { EvidenceBundle } from '../../index.js';
import { buildWorkshopPlan, contextForOperation } from '../../wp03/workflow.js';
import type { analyzeRun } from '../index.js';

type RunAnalysis = ReturnType<typeof analyzeRun>;

/** Metadata only. Scheduled transitions and observed report inputs are distinct. */
export function buildPreviewPathway(bundle: EvidenceBundle, run: RunAnalysis) {
  const plan = buildWorkshopPlan(bundle.manifest);
  const opportunities = new Map(run.opportunities.map(row => [row.opportunity_id, row]));
  const calls = new Map(bundle.provider_calls.map(call => [call.call_id, call]));
  const transitions = new Map<string, { from: string | null; to: string | null; event_id: string }>();
  let previousState: string | null = 'CREATED';
  for (const event of bundle.events) {
    if (event.event_type !== 'operation.committed') continue;
    const targetState = typeof event.payload.state === 'string' ? event.payload.state : null;
    transitions.set(String(event.payload.operation_key), { from: previousState, to: targetState, event_id: event.event_id });
    previousState = targetState;
  }
  const operations = plan.operations.map((operation, index) => {
    const row = opportunities.get(operation.key)!;
    return {
      ...row,
      sequence: index + 1,
      planned_state: operation.state,
      recorded_transition: transitions.get(operation.key) ?? null,
      round: operation.key.startsWith('round:') ? Number(operation.key.split(':')[1]) : null,
    };
  });
  // Reuse WP03 input isolation rules for the draft/review/revision subgraph.
  const reportArtifacts = plan.operations.filter(op => ['report.draft', 'report.review1', 'report.review2'].includes(op.kind))
    .map(op => ({ artifact_id: op.key, kind: op.kind, visibility: op.visibility, owner_id: op.ownerId, content: '' }));
  const reportEdges = plan.operations.filter(op => ['report.review1', 'report.review2', 'report.revised'].includes(op.kind))
    .flatMap(target => contextForOperation(reportArtifacts, target).map(input => {
      const source = opportunities.get(input.sourceArtifactId!)!;
      const targetRow = opportunities.get(target.key)!;
      const observedCalls = targetRow.source_call_ids.filter(id => source.output_artifact_id
        && calls.get(id)?.context_message_ids.includes(source.output_artifact_id));
      return { from: source.opportunity_id, to: target.key, kind: 'report_input' as const,
        observation: observedCalls.length ? 'observed' as const : 'planned' as const,
        source_artifact_id: source.output_artifact_id, observed_call_ids: observedCalls };
    }));
  return {
    version: 'wp06-preview-pathway-v1', workflow_version: plan.workflowVersion,
    report_enabled: bundle.manifest.reportEnabled, operations,
    execution_edges: operations.slice(1).map((operation, index) => ({
      from: operations[index]!.opportunity_id, to: operation.opportunity_id, kind: 'scheduled_successor' as const,
    })),
    report_edges: reportEdges,
    report_disclosure: {
      required: bundle.manifest.reportEnabled,
      event_ids: bundle.events.filter(event => event.event_type === 'report_requirement.disclosed').map(event => event.event_id),
      boundary: 'After all T0 commitments; before public round 1.',
    },
  };
}
