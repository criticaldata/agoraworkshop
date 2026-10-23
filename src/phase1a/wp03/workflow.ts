export const WP03_WORKFLOW_VERSION = 'wp03-workflow-v1';
export const REPORT_ALLOCATION_POLICY = 'COUNTERBALANCED_ROTATION' as const;

export type Wp03Visibility = 'public' | 'private-agent' | 'reviewer-isolated' | 'operator';
export type Wp03RunState = 'CREATED' | 'T0' | 'ROUND_1' | 'ROUND_2' | 'ROUND_3' | 'ROUND_4' | 'ROUND_5' | 'ROUND_6' | 'T1' | 'REPORT_DRAFT' | 'REVIEW_1' | 'REVIEW_2' | 'REPORT_REVISED' | 'T2' | 'COMPLETE' | 'FAILED' | 'CANCELLED';

export interface Wp03Manifest {
  replication: number;
  reportEnabled: boolean;
  participants: readonly { id: string }[];
  rounds: readonly { number: 1 | 2 | 3 | 4 | 5 | 6; prompt: string }[];
  speakingOrder: readonly (readonly string[])[];
  checkpoints: Readonly<{ t0: string; t1: string; t2: string }>;
  reportPrompts: Readonly<{ draft: string; review1: string; review2: string; revision: string }>;
}

export interface Wp03Operation {
  key: string;
  state: Wp03RunState;
  kind: string;
  participantId: string;
  visibility: Wp03Visibility;
  ownerId: string | null;
  system: string;
  prompt: string;
}

export interface ReportRoleAllocation {
  policy: typeof REPORT_ALLOCATION_POLICY;
  workflowVersion: typeof WP03_WORKFLOW_VERSION;
  replication: number;
  writerId: string;
  reviewer1Id: string;
  reviewer2Id: string;
}

export interface Wp03Artifact {
  artifact_id: string;
  kind: string;
  visibility: Wp03Visibility;
  owner_id: string | null;
  content: string;
}

export interface Wp03ContextMessage {
  role: 'assistant';
  content: string;
  sourceArtifactId: string;
}

export interface WorkshopPlan {
  workflowVersion: typeof WP03_WORKFLOW_VERSION;
  operations: Wp03Operation[];
  reportAllocation: ReportRoleAllocation | null;
}

function participantIds(manifest: Wp03Manifest): [string, string, string] {
  const ids = manifest.participants.map((participant) => participant.id);
  if (ids.length !== 3 || new Set(ids).size !== 3 || ids.some((id) => !id.trim())) {
    throw new Error('WP03 requires exactly three unique participant ids');
  }
  return ids as [string, string, string];
}

export function allocateReportRoles(ids: readonly string[], replication: number): ReportRoleAllocation {
  if (ids.length !== 3 || new Set(ids).size !== 3 || ids.some((id) => !id.trim())) {
    throw new Error('Report allocation requires exactly three unique participant ids');
  }
  if (!Number.isInteger(replication) || replication < 1 || replication > 3) {
    throw new Error('Report allocation requires replication 1, 2, or 3');
  }
  const writerIndex = replication - 1;
  return {
    policy: REPORT_ALLOCATION_POLICY,
    workflowVersion: WP03_WORKFLOW_VERSION,
    replication,
    writerId: ids[writerIndex]!,
    reviewer1Id: ids[(writerIndex + 1) % 3]!,
    reviewer2Id: ids[(writerIndex + 2) % 3]!,
  };
}

export function buildWorkshopPlan(manifest: Wp03Manifest): WorkshopPlan {
  const ids = participantIds(manifest);
  if (manifest.rounds.length !== 6 || manifest.speakingOrder.length !== 6) {
    throw new Error('WP03 requires six public rounds and six speaking orders');
  }
  const operations: Wp03Operation[] = [];
  for (const participantId of ids) {
    operations.push({ key: `t0:${participantId}`, state: 'T0', kind: 'checkpoint.t0', participantId, visibility: 'private-agent', ownerId: participantId, system: 'Deterministic Phase 1A private checkpoint', prompt: manifest.checkpoints.t0 });
  }
  for (const round of manifest.rounds) {
    const order = manifest.speakingOrder[round.number - 1];
    if (!order || order.length !== 3 || [...order].sort().join('|') !== [...ids].sort().join('|')) {
      throw new Error(`WP03 speaking order for round ${round.number} must contain every participant exactly once`);
    }
    for (const participantId of order) {
      operations.push({ key: `round:${round.number}:${participantId}`, state: `ROUND_${round.number}` as Wp03RunState, kind: `round.${round.number}`, participantId, visibility: 'public', ownerId: null, system: 'Deterministic Phase 1A workshop host', prompt: round.prompt });
    }
  }
  for (const participantId of ids) {
    operations.push({ key: `t1:${participantId}`, state: 'T1', kind: 'checkpoint.t1', participantId, visibility: 'private-agent', ownerId: participantId, system: 'Deterministic Phase 1A private checkpoint', prompt: manifest.checkpoints.t1 });
  }
  const reportAllocation = manifest.reportEnabled ? allocateReportRoles(ids, manifest.replication) : null;
  if (reportAllocation) {
    operations.push({ key: 'report:draft', state: 'REPORT_DRAFT', kind: 'report.draft', participantId: reportAllocation.writerId, visibility: 'reviewer-isolated', ownerId: reportAllocation.writerId, system: 'Deterministic Phase 1A report pipeline', prompt: manifest.reportPrompts.draft });
    operations.push({ key: 'report:review1', state: 'REVIEW_1', kind: 'report.review1', participantId: reportAllocation.reviewer1Id, visibility: 'reviewer-isolated', ownerId: reportAllocation.reviewer1Id, system: 'Isolated reviewer 1', prompt: manifest.reportPrompts.review1 });
    operations.push({ key: 'report:review2', state: 'REVIEW_2', kind: 'report.review2', participantId: reportAllocation.reviewer2Id, visibility: 'reviewer-isolated', ownerId: reportAllocation.reviewer2Id, system: 'Isolated reviewer 2', prompt: manifest.reportPrompts.review2 });
    operations.push({ key: 'report:revised', state: 'REPORT_REVISED', kind: 'report.revised', participantId: reportAllocation.writerId, visibility: 'public', ownerId: null, system: 'Deterministic Phase 1A report revision', prompt: manifest.reportPrompts.revision });
    for (const participantId of ids) {
      operations.push({ key: `t2:${participantId}`, state: 'T2', kind: 'checkpoint.t2', participantId, visibility: 'private-agent', ownerId: participantId, system: 'Deterministic Phase 1A private checkpoint', prompt: manifest.checkpoints.t2 });
    }
  }
  return { workflowVersion: WP03_WORKFLOW_VERSION, operations, reportAllocation };
}

function message(artifact: Wp03Artifact): Wp03ContextMessage {
  return { role: 'assistant', content: artifact.content, sourceArtifactId: artifact.artifact_id };
}

export function contextForOperation(artifacts: readonly Wp03Artifact[], operation: Wp03Operation): Wp03ContextMessage[] {
  const publicContext = artifacts.filter((artifact) => artifact.visibility === 'public').map(message);
  if (operation.kind.startsWith('checkpoint.')) {
    const ownedPrivate = artifacts.filter((artifact) => artifact.visibility === 'private-agent' && artifact.owner_id === operation.participantId).map(message);
    return [...publicContext, ...ownedPrivate];
  }
  if (operation.kind === 'report.draft') return publicContext;
  if (operation.kind === 'report.review1' || operation.kind === 'report.review2') {
    const drafts = artifacts.filter((artifact) => artifact.kind === 'report.draft');
    if (drafts.length !== 1) throw new Error('Each report review requires exactly one committed draft');
    return drafts.map(message);
  }
  if (operation.kind === 'report.revised') {
    const requiredKinds = ['report.draft', 'report.review1', 'report.review2'];
    const required = requiredKinds.map((kind) => {
      const matches = artifacts.filter((artifact) => artifact.kind === kind);
      if (matches.length !== 1) throw new Error('Revision requires one committed draft and two terminal reviews');
      return matches[0]!;
    });
    return required.map(message);
  }
  return publicContext;
}

export function reportDisclosureBoundary(manifest: Wp03Manifest, committedOperationKeys: readonly string[], alreadyDisclosed: boolean): 'skip' | 'disclose' {
  if (!manifest.reportEnabled || alreadyDisclosed) return 'skip';
  const required = participantIds(manifest).map((id) => `t0:${id}`);
  if (required.some((key) => !committedOperationKeys.includes(key))) {
    throw new Error('Report requirement cannot be disclosed before every t0 checkpoint is committed');
  }
  return 'disclose';
}

export function validateWorkshopPlan(manifest: Wp03Manifest, plan: WorkshopPlan): string[] {
  const expected = buildWorkshopPlan(manifest);
  const issues: string[] = [];
  if (plan.workflowVersion !== WP03_WORKFLOW_VERSION) issues.push('workflow version mismatch');
  if (JSON.stringify(plan.operations) !== JSON.stringify(expected.operations)) issues.push('operation plan does not match the deterministic WP03 schedule');
  if (JSON.stringify(plan.reportAllocation) !== JSON.stringify(expected.reportAllocation)) issues.push('report role allocation does not match the declared policy');
  return issues;
}
