import { expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createAuthMiddleware } from '../src/server/auth.js';
import { phase1Router } from '../src/server/phase1.js';
import { campaign, freezeCampaign, starterInput } from '../src/phase1/campaign.js';
import { lockDataset } from '../src/phase1/scienceStore.js';
import { listAdjudicationCandidates, reviewAssignments } from '../src/phase1/reviewWorkspace.js';
import { frozen, tempDb } from './helpers.js';

const basic = (id: string, password: string) => `Basic ${Buffer.from(`${id}:${password}`, 'utf8').toString('base64')}`;

it('provides admin assignment, blinded reviewer and adjudication UI paths', async () => {
  const db = tempDb();
  const campaignId = freezeCampaign(db, { ...starterInput(frozen().config, true), blocks: 1 });
  const snapshot = lockDataset(db, campaignId, {
    source_runs: [{ messages: [{ message_id: 'm1', content: 'Evidence text', workshop_state: 'PUBLIC_DISCUSSION', channel: 'public' }] }],
    coding_units: [{ key: 'u1', message_id: 'm1', category: 'role_criterion', criterion_id: 'function' }],
    manifest: { input: { role_pack: { rubric: { version: 'behavioral-v2' } } } },
  });
  const app = express();
  app.use(createAuthMiddleware({ password: null, users: new Map([
    ['admin', { role: 'admin', password: 'admin-pass' }],
    ['reviewer_a', { role: 'reviewer', password: 'reviewer-a-pass' }],
    ['reviewer_b', { role: 'reviewer', password: 'reviewer-b-pass' }],
    ['adjudicator', { role: 'adjudicator', password: 'adjudicator-pass' }],
  ]), scope: 'all', realm: 'test' }));
  app.use(express.urlencoded({ extended: false })); app.use(express.json());
  app.use(phase1Router(db, 'configs/agora_phase0_1_context_contract.yaml'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, id: string, password: string, init: RequestInit = {}) => fetch(base + path, { ...init, headers: { authorization: basic(id, password), ...init.headers }, redirect: 'manual' });
  try {
    const adminCreate = await request(`/phase1/review/snapshots/${snapshot.id}/assignments`, 'admin', 'admin-pass', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ reviewers: 'reviewer_a,reviewer_b' }),
    });
    expect(adminCreate.status).toBe(303);
    const packagePage = await request(`/phase1/review/snapshots/${snapshot.id}`, 'reviewer_a', 'reviewer-a-pass');
    const packageHtml = await packagePage.text();
    expect(packagePage.status).toBe(200);
    expect(packageHtml).toContain('Human validation package');
    expect(packageHtml).not.toContain('reviewer_ids');
    const assignmentA = reviewAssignments(db, snapshot.id, 'reviewer_a')[0]!;
    const assignmentB = reviewAssignments(db, snapshot.id, 'reviewer_b')[0]!;
    expect((await request(`/phase1/review/assignments/${assignmentA.assignment_id}`, 'reviewer_a', 'reviewer-a-pass')).status).toBe(200);
    const label = JSON.stringify({ label: 'scored', score: 2, quote: 'Evidence text', reason: 'Clear evidence.' });
    expect((await request(`/phase1/review/assignments/${assignmentA.assignment_id}`, 'reviewer_a', 'reviewer-a-pass', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ label }) })).status).toBe(303);
    expect((await request(`/phase1/review/assignments/${assignmentB.assignment_id}`, 'reviewer_b', 'reviewer-b-pass', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ label: JSON.stringify({ ...JSON.parse(label), score: 0 }) }) })).status).toBe(303);
    const candidate = listAdjudicationCandidates(db, snapshot.id)[0]!;
    const adjudicationPage = await request(`/phase1/adjudication/${snapshot.id}`, 'adjudicator', 'adjudicator-pass');
    expect(adjudicationPage.status).toBe(200);
    expect(await adjudicationPage.text()).toContain('Adjudication workspace');
    const adjudicated = await request('/phase1/adjudication', 'adjudicator', 'adjudicator-pass', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ candidate_id: candidate, decision: JSON.stringify({ label: 'scored', score: 1, quote: 'Evidence text', reason: 'Adjudicated against the frozen evidence.' }) }) });
    expect(adjudicated.status).toBe(303);
    expect(db.prepare('SELECT COUNT(*) AS n FROM phase1_adjudications').get()).toEqual({ n: 1 });
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close();
  }
}, 15000);
