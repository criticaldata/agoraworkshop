import { describe, expect, it } from 'vitest';
import {
  DeterministicMockProvider,
  Phase1aRuntime,
  createFixtureManifest,
  type Phase1aManifest,
} from '../src/phase1a/index.js';
import {
  REPORT_ALLOCATION_POLICY,
  WP03_WORKFLOW_VERSION,
  allocateReportRoles,
  buildWorkshopPlan,
  contextForOperation,
  reportDisclosureBoundary,
  validateWorkshopPlan,
  type Wp03Artifact,
} from '../src/phase1a/wp03/workflow.js';

function noReportManifest(): Phase1aManifest {
  const base = createFixtureManifest();
  const participants = base.participants.map((participant) => ({ ...participant, model: 'gemma-fixture' })) as unknown as Phase1aManifest['participants'];
  return createFixtureManifest({ ...structuredClone(base), cell: 'A', reportEnabled: false, participants });
}

function artifact(id: string, kind: string, visibility: Wp03Artifact['visibility'], owner: string | null, content: string): Wp03Artifact {
  return { artifact_id: id, kind, visibility, owner_id: owner, content };
}

describe('WP03 deterministic workshop plan', () => {
  it('[RPT-10] counterbalances writer and reviewer roles across the three replications', () => {
    const ids = ['P1', 'P2', 'P3'];
    expect(allocateReportRoles(ids, 1)).toMatchObject({ writerId: 'P1', reviewer1Id: 'P2', reviewer2Id: 'P3' });
    expect(allocateReportRoles(ids, 2)).toMatchObject({ writerId: 'P2', reviewer1Id: 'P3', reviewer2Id: 'P1' });
    expect(allocateReportRoles(ids, 3)).toMatchObject({ writerId: 'P3', reviewer1Id: 'P1', reviewer2Id: 'P2' });
    expect(() => allocateReportRoles(ids, 4)).toThrow(/replication 1, 2, or 3/);
    expect(() => createFixtureManifest({ replication: 4 })).toThrow(/replication must be 1, 2, or 3/);
  });

  it('[RPT-08] [RPT-10] builds the report arm in the exact checkpoint, workshop, report and t2 order', () => {
    const plan = buildWorkshopPlan(createFixtureManifest({ replication: 2 }));
    expect(plan.workflowVersion).toBe(WP03_WORKFLOW_VERSION);
    expect(plan.reportAllocation).toMatchObject({ policy: REPORT_ALLOCATION_POLICY, writerId: 'agent_2', reviewer1Id: 'agent_3', reviewer2Id: 'agent_1' });
    expect(plan.operations).toHaveLength(31);
    expect(plan.operations.slice(0, 3).map((operation) => operation.key)).toEqual(['t0:agent_1', 't0:agent_2', 't0:agent_3']);
    expect(plan.operations.slice(3, 21).every((operation) => operation.key.startsWith('round:'))).toBe(true);
    expect(plan.operations.slice(21, 24).map((operation) => operation.key)).toEqual(['t1:agent_1', 't1:agent_2', 't1:agent_3']);
    expect(plan.operations.slice(24, 28).map((operation) => operation.key)).toEqual(['report:draft', 'report:review1', 'report:review2', 'report:revised']);
    expect(plan.operations.slice(28).map((operation) => operation.key)).toEqual(['t2:agent_1', 't2:agent_2', 't2:agent_3']);
  });

  it('[RPT-01] omits the complete report branch from no-report arms', () => {
    const plan = buildWorkshopPlan(noReportManifest());
    expect(plan.reportAllocation).toBeNull();
    expect(plan.operations).toHaveLength(24);
    expect(plan.operations.some((operation) => operation.kind.startsWith('report.') || operation.kind === 'checkpoint.t2')).toBe(false);
  });

  it('[RPT-10] fails closed when the deterministic plan is changed after construction', () => {
    const manifest = createFixtureManifest();
    const plan = buildWorkshopPlan(manifest);
    plan.operations[24] = { ...plan.operations[24]!, participantId: 'agent_3' };
    expect(validateWorkshopPlan(manifest, plan)).toContain('operation plan does not match the deterministic WP03 schedule');
  });
});

describe('WP03 context and disclosure boundaries', () => {
  const manifest = createFixtureManifest();
  const operations = buildWorkshopPlan(manifest).operations;
  const draftOperation = operations.find((operation) => operation.kind === 'report.draft')!;
  const review1Operation = operations.find((operation) => operation.kind === 'report.review1')!;
  const review2Operation = operations.find((operation) => operation.kind === 'report.review2')!;
  const revisionOperation = operations.find((operation) => operation.kind === 'report.revised')!;

  it('[RPT-01] keeps private checkpoint content out of the draft context', () => {
    const artifacts = [
      artifact('public-1', 'round.1', 'public', null, 'PUBLIC CLAIM'),
      artifact('private-1', 'checkpoint.t0', 'private-agent', 'agent_1', 'PRIVATE CANARY'),
    ];
    expect(contextForOperation(artifacts, draftOperation).map((entry) => entry.content)).toEqual(['PUBLIC CLAIM']);
  });

  it('[RPT-03] [RPT-04] gives both reviewers the same draft and neither review', () => {
    const artifacts = [
      artifact('draft', 'report.draft', 'reviewer-isolated', 'agent_1', 'DRAFT'),
      artifact('review-1', 'report.review1', 'reviewer-isolated', 'agent_2', 'REVIEW ONE'),
    ];
    expect(contextForOperation(artifacts, review1Operation).map((entry) => entry.content)).toEqual(['DRAFT']);
    expect(contextForOperation(artifacts, review2Operation).map((entry) => entry.content)).toEqual(['DRAFT']);
  });

  it('[RPT-05] [RPT-06] begins revision only with one draft and both terminal reviews in fixed order', () => {
    const incomplete = [
      artifact('draft', 'report.draft', 'reviewer-isolated', 'agent_1', 'DRAFT'),
      artifact('review-1', 'report.review1', 'reviewer-isolated', 'agent_2', 'REVIEW ONE'),
    ];
    expect(() => contextForOperation(incomplete, revisionOperation)).toThrow(/two terminal reviews/);
    const complete = [...incomplete, artifact('review-2', 'report.review2', 'reviewer-isolated', 'agent_3', '[refused]')];
    expect(contextForOperation(complete, revisionOperation).map((entry) => entry.content)).toEqual(['DRAFT', 'REVIEW ONE', '[refused]']);
  });

  it('[EXP-14] refuses report disclosure before all three t0 commits', () => {
    expect(() => reportDisclosureBoundary(manifest, ['t0:agent_1', 't0:agent_2'], false)).toThrow(/every t0/);
    expect(reportDisclosureBoundary(manifest, ['t0:agent_1', 't0:agent_2', 't0:agent_3'], false)).toBe('disclose');
    expect(reportDisclosureBoundary(noReportManifest(), [], false)).toBe('skip');
  });
});

describe('WP03 runtime integration', () => {
  it('[RPT-02] [RPT-07] [RPT-08] [RPT-10] records allocation and executes the selected roles', async () => {
    const provider = new DeterministicMockProvider();
    const runtime = new Phase1aRuntime();
    const runId = runtime.createRun(createFixtureManifest({ replication: 2 }));
    expect(await runtime.run(runId, provider)).toBe('COMPLETE');

    const bundle = runtime.evidence(runId);
    expect(bundle.events.find((event) => event.event_type === 'report.roles_allocated')?.payload).toEqual({
      policy: REPORT_ALLOCATION_POLICY,
      workflow_version: WP03_WORKFLOW_VERSION,
      replication: 2,
      writer_id: 'agent_2',
      reviewer_1_id: 'agent_3',
      reviewer_2_id: 'agent_1',
    });
    expect(provider.calls.find((call) => call.operationKey === 'report:draft')?.participantId).toBe('agent_2');
    expect(provider.calls.find((call) => call.operationKey === 'report:review1')?.participantId).toBe('agent_3');
    expect(provider.calls.find((call) => call.operationKey === 'report:review2')?.participantId).toBe('agent_1');
    expect(provider.calls.find((call) => call.operationKey === 'report:revised')?.participantId).toBe('agent_2');

    const revisedSequence = bundle.events.find((event) => event.event_type === 'report.revised.completed')!.sequence;
    const firstT2Sequence = bundle.events.find((event) => event.event_type === 'checkpoint.t2.completed')!.sequence;
    expect(firstT2Sequence).toBeGreaterThan(revisedSequence);
    expect(bundle.integrity.valid).toBe(true);
  });
});
