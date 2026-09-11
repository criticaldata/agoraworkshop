import { Router } from 'express';
import type { Db } from '../db/index.js';
import { loadConfigFile } from '../config/load.js';
import { getMessages } from '../db/queries.js';
import { annotate, reviewerAnnotations } from '../semantic/phase1Annotations.js';
import { campaign, freezeCampaign, initializePhase1, linkEvidence, planCampaign, previewPrompts, runCampaign, saveDraft, starterInput, type PlanInput } from '../phase1/campaign.js';
import { campaignAnalysis } from '../phase1/analysis.js';
import { campaignBundle } from '../phase1/export.js';
import { page } from './pages.js';
import { recordClosureEvidence } from '../phase1/closure.js';
import { analysisPlanDraft } from '../phase1/scienceContract.js';
import { scientificEvaluationDraft } from '../phase1/evaluationContract.js';
import { scientificDataset, lockScientificDataset } from '../phase1/scientificDataset.js';
import { executeScientificAnalysis } from '../phase1/scientificAnalysis.js';
import { scienceSnapshots, readScienceSnapshot, campaignLock } from '../phase1/scienceStore.js';
import { reviewArtifact, visibleArtifactReviews } from '../phase1/artifactReview.js';
import { collectiveRecords } from '../phase1/collective.js';
import { permissionForPath, requirePermission } from './auth.js';
import { createReviewAssignments, blindedReviewProjection, submitIndependentReview, listAdjudicationCandidates, submitAdjudication } from '../phase1/reviewWorkspace.js';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const json = (value: unknown) => `<pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(value, null, 2))}</pre>`;
const field = (name: string, label: string, value: unknown, rows = 3) => `<label style="display:block;margin:1rem 0">${esc(label)}<textarea name="${esc(name)}" rows="${rows}" required style="display:block;width:100%">${esc(value)}</textarea></label>`;
const hidden = (name: string, value: string) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;

function editor(input: PlanInput): string {
  return `<h1>Phase 1A · role experiments</h1><p>Draft → preview → freeze → execute → compare → annotate → export. No provider calls occur while editing or previewing.</p>
  <p>The starter roles and rubric are proposals, not validated cultural or professional identities. Five cyclic role permutations and alternating AB/BA order are frozen before execution. An odd block count is not fully order-balanced.</p>
  <form method="post" action="/phase1/drafts">
  ${field('title', 'Campaign title', input.title, 1)}
  ${field('protocol_id', 'Protocol ID', input.protocol_id, 1)}${field('protocol_version', 'Protocol version', input.protocol_version, 1)}
  <label>Purpose <select name="purpose"><option${input.purpose === 'engineering' ? ' selected' : ''}>engineering</option><option${input.purpose === 'pilot' ? ' selected' : ''}>pilot</option></select></label>
  ${field('pack_id', 'Role pack ID', input.role_pack.id, 1)}${field('pack_version', 'Role pack version (increment for edits)', input.role_pack.version, 1)}
  ${hidden('pack_title', input.role_pack.title)}${hidden('pack_status', input.role_pack.status)}
  ${field('common', 'Common participant instruction', input.role_pack.common_instruction)}
  ${field('neutral', 'Neutral control instruction', input.role_pack.neutral_instruction)}
  ${input.role_pack.roles.map((r, i) => `<fieldset><legend>Role ${i + 1}: ${esc(r.title)}</legend>${field(`role_id_${i}`, 'Stable role ID', r.id, 1)}${field(`role_title_${i}`, 'Role title', r.title, 1)}${field(`role_${i}`, 'Exact instruction (only assigned participant receives this)', r.instruction)}</fieldset>`).join('')}
  ${field('rubric_version', 'Frozen rubric version', input.role_pack.rubric.version, 1)}${field('rubric', 'Human review rubric', input.role_pack.rubric.instructions)}
  <details><summary>Scientific role definitions and analysis plan</summary><p>Optional versioned contracts. Null keeps the legacy workflow. Unknown scientific choices remain null, not hidden defaults. Use the scientific template to opt into the expanded questionnaire and proposed endpoint hierarchy.</p>${field('scientific_basis', 'Role construct/source mapping (JSON or null)', JSON.stringify(input.role_pack.scientific_basis ?? null, null, 2), 12)}${field('analysis_plan', 'Analysis plan (JSON or null)', JSON.stringify(input.analysis_plan ?? null, null, 2), 20)}</details>
  <details><summary>Behavioral evaluation protocol: questionnaire, role criteria and scoring</summary><p>These defaults are proposed, not approved by Mateo. Initial assessments are independent; final assessments use authorized discussion history. Probes are not broadcast and consume the same frozen agent/campaign budgets. Use null to retain the legacy transcript-only protocol.</p>${field('evaluation', 'Versioned evaluation JSON (null disables it)', JSON.stringify(input.evaluation ?? null, null, 2), 25)}</details>
  ${field('opening', 'Moderator opening (identical across paired cases)', input.opening_message)}
  <details><summary>Canonical eight-stage protocol and sealed voting</summary><p>S1 → S2 → S3 → S4 reconvening → S5 second plenary → S6 independent final positions → S7 sealed ballots → S8 deterministic output. Proposed voting rule: three of five votes, all five ballots valid; no-majority is unresolved. This rule still needs scientific approval. Use null only for legacy experiments.</p>${field('canonical', 'Canonical protocol JSON', JSON.stringify(input.canonical ?? null, null, 2), 9)}</details>
  <p><label>Blocks / pairs <input name="blocks" type="number" min="1" max="50" value="${input.blocks}" required></label>
  <label>Provider-call ceiling <input name="calls" type="number" min="1" max="100000" value="${input.limits.max_provider_calls}" required></label>
  <label>Reported-token stop threshold <input name="tokens" type="number" min="1" value="${input.limits.max_reported_tokens}" required></label></p>
  <details><summary>Provider, moderator mode, rounds, recovery and fixed settings (existing config JSON)</summary><p>Keep credentials in environment variables. Participant order plus role order determines the initial assignment; each later block rotates the roles.</p>${field('base_config', 'Base configuration', JSON.stringify(input.base_config, null, 2), 22)}</details>
  <button>Save draft and preview</button></form>`;
}

function formInput(body: Record<string, string>): unknown {
  const evaluation = body.evaluation ? JSON.parse(body.evaluation) : null;
  const canonical = body.canonical ? JSON.parse(body.canonical) : null;
  const analysisPlan = body.analysis_plan ? JSON.parse(body.analysis_plan) : null;
  const scientificBasis = body.scientific_basis ? JSON.parse(body.scientific_basis) : null;
  return { title: body.title, protocol_id: body.protocol_id, protocol_version: body.protocol_version, purpose: body.purpose,
    ...(evaluation ? { evaluation } : {}),
    ...(canonical ? { canonical } : {}),
    ...(analysisPlan ? { analysis_plan: analysisPlan } : {}),
    base_config: JSON.parse(body.base_config!), blocks: Number(body.blocks), opening_message: body.opening,
    limits: { max_provider_calls: Number(body.calls), max_reported_tokens: Number(body.tokens) },
    role_pack: { id: body.pack_id, version: body.pack_version, title: body.pack_title, status: body.pack_status, common_instruction: body.common, neutral_instruction: body.neutral, ...(scientificBasis ? { scientific_basis: scientificBasis } : {}),
      roles: Array.from({ length: 5 }, (_, i) => ({ id: body[`role_id_${i}`], title: body[`role_title_${i}`], instruction: body[`role_${i}`] })), rubric: { version: body.rubric_version, instructions: body.rubric } },
  };
}

export function phase1Router(db: Db, templatePath: string): Router {
  initializePhase1(db);
  const router = Router();
  router.use((req, res, next) => {
    const permission = permissionForPath(req.path);
    if (!permission) { next(); return; }
    requirePermission(permission)(req, res, next);
  });
  const jobs = new Map<string, Promise<void>>();
  const errors = new Map<string, string>();
  const launch = (id: string, live: boolean, resume: boolean) => {
    if (jobs.has(id)) throw new Error('Campaign is already running');
    const c = campaign(db, id);
    if (!['mock', 'mock_context_contract'].includes(c.plan.input.base_config.model.provider) && !live) throw new Error('Live provider selected: explicit live confirmation required');
    errors.delete(id);
    const task = runCampaign(db, id, { allowLive: live, resumeInterrupted: resume }).catch(e => { errors.set(id, String(e)); }).finally(() => { jobs.delete(id); });
    jobs.set(id, task);
  };
  const draft = (id: string): PlanInput => {
    const r = db.prepare('SELECT input_json FROM phase1_drafts WHERE id = ?').get(id) as { input_json: string } | undefined;
    if (!r) throw new Error('Draft not found');
    return JSON.parse(r.input_json) as PlanInput;
  };
  router.get('/phase1', (req, res) => {
    const input = typeof req.query.duplicate === 'string' ? campaign(db, req.query.duplicate).plan.input : starterInput(loadConfigFile(templatePath).config, true);
    if (req.query.scientific === 'true' && !req.query.duplicate) { input.evaluation = scientificEvaluationDraft(); input.analysis_plan = analysisPlanDraft(); }
    const rows = db.prepare('SELECT id, title, state FROM phase1_campaigns ORDER BY created_at DESC').all() as { id: string; title: string; state: string }[];
    res.send(page('Phase 1A setup', `<p><a href="/phase1?scientific=true">New scientific calibration draft</a> · <a href="/phase1">Canonical engineering draft</a></p><p>${rows.map(r => `<a href="/phase1/campaigns/${esc(r.id)}">${esc(r.title)} · ${esc(r.state)}</a>`).join('<br>')}</p>${editor(input)}`));
  });
  router.post('/phase1/drafts', (req, res) => { const raw = formInput(req.body); planCampaign(raw); res.redirect(303, `/phase1/drafts/${saveDraft(db, raw)}`); });
  router.get('/phase1/drafts/:id', (req, res) => {
    const plan = planCampaign(draft(String(req.params.id)));
    res.send(page('Preview Phase 1A', `<h1>Review before freezing</h1><p>No provider calls made. Dynamic transcript context will be recorded with each actual invocation.</p>${json({ workload: plan.workload, limits: plan.input.limits, comparisons: plan.comparisons })}<form method="post" action="/phase1/freeze">${hidden('draft_id', String(req.params.id))}<button>Freeze this exact draft</button></form><details><summary>Every resolved prompt and turn instruction</summary>${json(previewPrompts(plan))}</details>`));
  });
  router.post('/phase1/freeze', (req, res) => res.redirect(303, `/phase1/campaigns/${freezeCampaign(db, draft(String(req.body.draft_id)))}`));
  router.post('/phase1/campaigns/:id/start', (req, res) => { launch(String(req.params.id), req.body.live === 'yes', req.body.resume === 'yes'); res.redirect(303, `/phase1/campaigns/${req.params.id}`); });
  router.get('/phase1/campaigns/:id', (req, res) => {
    const id = String(req.params.id), c = campaign(db, id), analysis = campaignAnalysis(db, id);
    res.send(page(c.row.title, `<h1>${esc(c.row.title)}</h1><p>${esc(c.row.state)} · ${esc(c.row.manifest_hash)}</p><p>${esc(errors.get(id) ?? '')}</p>
    <p><a href="/phase1?duplicate=${esc(id)}">Duplicate as editable draft</a> · <a href="/phase1/campaigns/${esc(id)}/review">Human evidence review</a></p>
    ${c.plan.input.analysis_plan ? `<p><a href="/phase1/campaigns/${esc(id)}/science">Scientific analysis workspace: coverage, reliability, dataset lock and results</a></p>` : ''}
    ${json({ workload: c.plan.workload, limits: c.plan.input.limits, usage: analysis.usage, denominators: analysis.denominators, status: analysis.status })}
    <h2>Scientific closure gates</h2><p>Software execution is not scientific PASS. Uploaded evidence is retained with hashes, not automatically certified.</p>${json(analysis.closure)}
    <details><summary>Register closure evidence</summary><p>Approval and analysis plans must be recorded before the first case starts. Other reports can be added later. Reviewer identity is self-declared. See docs/phase1/CANONICAL_PROTOCOL.md for the evidence schema.</p><form method="post" action="/phase1/campaigns/${esc(id)}/closure-evidence">${field('evidence', 'Evidence JSON', JSON.stringify({ version: 'phase1-closure-evidence-v1', manifest_hash: c.row.manifest_hash, kind: 'analysis_plan', author: '', title: '', body: '', related_evidence_hashes: [] }, null, 2), 12)}<button>Record evidence (not a PASS approval)</button></form></details>
    <h2>Eight-stage outcomes</h2><p>Researcher view: individual ballots and authorized private contexts are sensitive. They are never sent to other participants.</p>${analysis.collective.map(r => `<details><summary>${esc(r.case_id)} · ${r.audit.complete && r.audit.verified ? 'Complete, verified' : 'Pending or incomplete'}</summary>${json(r.records?.stages)}${json(r.records?.output)}${json(r.audit)}<details><summary>Sealed individual ballot records (researcher-only)</summary>${json(r.records?.ballots)}</details></details>`).join('')}
    <form method="post" action="/phase1/campaigns/${esc(id)}/start"><label><input type="checkbox" name="live" value="yes">Authorize live provider calls (only needed for non-mock provider)</label><br><label><input type="checkbox" name="resume" value="yes">Resume interrupted cases when their frozen recovery policy permits</label><br><button>Execute pending cases</button></form>
    <table><thead><tr><th>Case</th><th>Status</th><th>Inspect</th><th>Error</th></tr></thead><tbody>${c.cases.map(r => `<tr><td>${esc(r.case_id)}</td><td>${esc(r.state)}</td><td>${r.run_id ? `<a href="/runs/${esc(r.run_id)}">Run</a> · <a href="/runs/${esc(r.run_id)}/timeline">Timeline</a> · <a href="/runs/${esc(r.run_id)}/transcript">Transcript</a>` : 'Not started'}</td><td>${esc(r.error)}</td></tr>`).join('')}</tbody></table>
    <h2>Paired descriptive comparison</h2>${json(analysis.pairs)}<details><summary>Measurements, provenance IDs and technical checks</summary>${json(analysis)}</details>
    <p>No inferential or behavioural-validity claim is made. Empty human labels mean unavailable outcomes. Complete-case comparisons can be biased.</p>
    <form method="post" action="/phase1/campaigns/${esc(id)}/export"><p>Export is unblinded and contains private transcripts and all labels.</p><button>Download full review bundle</button></form>`, { refresh: jobs.has(id) }));
  });
  router.get('/phase1/campaigns/:id/review', (req, res) => {
    const id = String(req.params.id), c = campaign(db, id), author = req.agoraPrincipal?.id ?? '';
    // Deliberately omit conditions, hidden prompts and role assignments here.
    const sources = c.cases.flatMap(r => r.run_id ? getMessages(db, r.run_id).filter(m => m.sender_agent_id !== c.plan.input.base_config.moderator.id).map(m => ({ run_id: r.run_id!, ...m })) : []);
    res.send(page('Human evidence review', `<h1>Human evidence review</h1><p>Labels from colleagues are hidden for each source/category until you submit your own. Identity is self-declared under the existing shared researcher credential; this is workflow blinding, not adversarial access isolation. Avoid the unblinded campaign/export pages while independently reviewing.</p>
    <form><label>Reviewer identity <input name="author" value="${esc(author)}" required></label><button>Open my review</button></form>
    <h2>Frozen rubric</h2>${json(c.plan.input.role_pack.rubric)}${json(c.plan.input.role_pack.roles.map(r => ({ id: r.id, title: r.title, assessment_perspective: r.instruction })))}
    ${c.plan.input.analysis_plan?.artifact_rubric ? `<details><summary>S8 human artifact quality (not participant behavior)</summary>${json(c.plan.input.analysis_plan.artifact_rubric)}${json(c.cases.filter(r => r.run_id).map(r => ({ run_id: r.run_id, output: collectiveRecords(db, r.run_id!).output })))}${author ? `<form method="post" action="/phase1/campaigns/${esc(id)}/artifact-reviews">${field('review', 'Artifact review JSON: exact artifact hash and quote; score 0–2 or null when not assessable', JSON.stringify({ run_id: c.cases[0]?.run_id ?? '', artifact_hash: '', author, rubric_version: c.plan.input.analysis_plan.artifact_rubric.version, criterion_id: c.plan.input.analysis_plan.artifact_rubric.criteria[0]?.id, score: null, quote: '', reason: '' }, null, 2), 13)}<button>Submit immutable artifact review</button></form>${json(visibleArtifactReviews(db, id, author))}` : ''}</details>` : ''}
    ${c.plan.input.evaluation ? `<details><summary>Predefined outcome definitions, criterion weights and questionnaire</summary>${json(c.plan.input.evaluation)}</details><p>New categories: role_criterion (criterion_id, label scored, score 0–2; or not_assessable and null score), direct_reply, interaction_contingency (present plus relation: supports/challenges/extends/rejects/revises), introduced_idea (present, quoted idea), argument_uptake (idea_annotation_id). Positive interaction labels require earlier, actually exposed peer evidence. For uptake, the source is the introduced idea and the target is the later peer reuse. Absent uptake requires review of all eligible follow-up messages. Missing review is never counted as absent.</p>` : ''}
    ${author ? `<form method="post" action="/phase1/campaigns/${esc(id)}/annotations">${field('annotation', 'Annotation JSON (replace evidence IDs and exact quote; add target_message_id and target_quote for relational readings)', JSON.stringify({ run_id: sources[0]?.run_id ?? '', message_id: sources[0]?.message_id ?? '', author, annotator_type: 'human', rubric_version: c.plan.input.role_pack.rubric.version, category: 'role_consistency', label: 'not_assessable', quote: sources[0]?.content ?? '', reason: 'Explain the quoted evidence against the frozen rubric.' }, null, 2), 15)}<button>Submit immutable annotation</button></form><h2>Visible review history</h2>${json(reviewerAnnotations(db, id, author))}` : ''}
    <details><summary>Source messages (public and authorized researcher-visible private records)</summary>${json(sources)}</details><p>Allowed categories: role_consistency, agreement, disagreement, position_change, public_private_difference. Add supersedes or adjudicates IDs for an append-only revision. Role-consistency assessment uses evaluator targets in the unblinded campaign comparison; hiding condition metadata does not prevent inference from text.</p>`));
  });
  router.post('/phase1/campaigns/:id/annotations', (req, res) => { const raw = { ...JSON.parse(req.body.annotation), author: req.agoraPrincipal?.id }; annotate(db, String(req.params.id), raw); res.redirect(303, `/phase1/campaigns/${req.params.id}/review`); });
  router.post('/phase1/campaigns/:id/artifact-reviews', (req, res) => { const raw = { ...JSON.parse(req.body.review), author: req.agoraPrincipal?.id }; reviewArtifact(db, String(req.params.id), raw); res.redirect(303, `/phase1/campaigns/${req.params.id}/review`); });
  router.post('/phase1/campaigns/:id/export', (req, res) => { const id = String(req.params.id); res.attachment(`${id}.json`).json(campaignBundle(db, id)); });
  router.post('/phase1/campaigns/:id/closure-evidence', (req, res) => { recordClosureEvidence(db, String(req.params.id), JSON.parse(String(req.body.evidence))); res.redirect(303, `/phase1/campaigns/${req.params.id}`); });

  router.get('/phase1/campaigns/:id/science', (req, res) => {
    const id = String(req.params.id), lock = campaignLock(db, id);
    const dataset = lock ? readScienceSnapshot(db, lock).payload : scientificDataset(db, id);
    const snapshots = scienceSnapshots(db, id);
    res.send(page('Scientific analysis', `<h1>Scientific analysis workspace</h1><p><a href="/phase1/campaigns/${esc(id)}">Back to campaign</a></p><p>Researcher-only, unblinded. Draft and mock calculations do not establish scientific PASS.</p>
      <h2>Frozen analysis plan</h2>${json(dataset.analysis_plan)}
      <h2>Annotation coverage and reliability</h2>${json(dataset.gates)}${json(dataset.reliability)}
      <details><summary>Resolved run-level outcomes, exclusions and missingness</summary>${json(dataset.outcomes)}</details>
      ${lock ? `<p>Dataset locked: ${esc(lock)}. Further annotations and campaign execution are disabled.</p><form method="post" action="/phase1/campaigns/${esc(id)}/analyze">${hidden('dataset_id', lock)}<button>Calculate and save immutable analysis</button></form>` : `<form method="post" action="/phase1/campaigns/${esc(id)}/lock-dataset"><p>Locking is irreversible through the app. Finish independent review and adjudication first. Incomplete calibration datasets can be locked for diagnostic analysis, but remain incomplete.</p><label><input type="checkbox" name="confirm_lock" value="yes" required>I understand that this freezes data and annotations</label><button>Lock this dataset</button></form>`}
      <h2>Analysis snapshots</h2>${snapshots.filter(s => s.kind === 'analysis').map(s => `<details><summary>${esc(s.id)} · ${esc(s.content_hash)}</summary>${json(s.payload)}<a href="/api/phase1/campaigns/${esc(id)}/snapshots/${esc(s.id)}">Download reproducible analysis JSON</a></details>`).join('') || '<p>No analysis saved yet.</p>'}`));
  });
  router.post('/phase1/campaigns/:id/lock-dataset', (req, res) => { if (req.body.confirm_lock !== 'yes') throw new Error('Explicit dataset-lock confirmation required'); lockScientificDataset(db, String(req.params.id)); res.redirect(303, `/phase1/campaigns/${req.params.id}/science`); });
  router.post('/phase1/campaigns/:id/analyze', (req, res) => { executeScientificAnalysis(db, String(req.params.id), String(req.body.dataset_id)); res.redirect(303, `/phase1/campaigns/${req.params.id}/science`); });

  // Same service functions as the UI and CLI. Mount after the existing auth middleware.
  router.post('/api/phase1/preview', (req, res) => { const plan = planCampaign(req.body); res.json({ plan, prompts: previewPrompts(plan) }); });
  router.post('/api/phase1/drafts', (req, res) => res.status(201).json({ id: saveDraft(db, req.body) }));
  router.post('/api/phase1/freeze', (req, res) => res.status(201).json({ id: freezeCampaign(db, draft(String(req.body.draft_id))) }));
  router.get('/api/phase1/campaigns/:id', (req, res) => res.json({ ...campaign(db, String(req.params.id)), analysis: campaignAnalysis(db, String(req.params.id)), execution_error: errors.get(String(req.params.id)) ?? null }));
  router.post('/api/phase1/campaigns/:id/start', (req, res) => { launch(String(req.params.id), req.body.allow_live === true, req.body.resume_interrupted === true); res.status(202).json({ id: req.params.id, status: 'accepted' }); });
  router.post('/api/phase1/campaigns/:id/annotations', (req, res) => {
    const principal = req.agoraPrincipal;
    if (!principal) { res.status(401).json({ error: 'authentication required' }); return; }
    res.status(201).json({ id: annotate(db, String(req.params.id), { ...req.body, author: principal.id }) });
  });
  router.post('/api/phase1/campaigns/:id/artifact-reviews', (req, res) => {
    const principal = req.agoraPrincipal;
    if (!principal) { res.status(401).json({ error: 'authentication required' }); return; }
    res.status(201).json({ id: reviewArtifact(db, String(req.params.id), { ...req.body, author: principal.id }) });
  });
  router.get('/api/phase1/campaigns/:id/artifact-reviews', (req, res) => res.json(visibleArtifactReviews(db, String(req.params.id), req.agoraPrincipal?.id ?? '')));
  router.post('/api/phase1/campaigns/:id/closure-evidence', (req, res) => res.status(201).json(recordClosureEvidence(db, String(req.params.id), req.body)));
  router.get('/api/phase1/campaigns/:id/science', (req, res) => { const id = String(req.params.id), lock = campaignLock(db, id); res.json({ dataset: lock ? readScienceSnapshot(db, lock).payload : scientificDataset(db, id), lock, snapshots: scienceSnapshots(db, id).map(s => ({ id: s.id, kind: s.kind, hash: s.content_hash })) }); });
  router.post('/api/phase1/campaigns/:id/lock-dataset', (req, res) => { if (req.body.confirm_lock !== true) throw new Error('confirm_lock=true required'); res.status(201).json(lockScientificDataset(db, String(req.params.id))); });
  router.post('/api/phase1/campaigns/:id/analyze', (req, res) => res.status(201).json(executeScientificAnalysis(db, String(req.params.id), String(req.body.dataset_id))));
  router.get('/api/phase1/campaigns/:id/snapshots/:snapshot', (req, res) => { const saved = readScienceSnapshot(db, String(req.params.snapshot)); if (saved.campaign_id !== String(req.params.id)) throw new Error('Snapshot belongs to another campaign'); res.attachment(`${saved.id}.json`).json(saved); });
  router.get('/api/phase1/campaigns/:id/annotations', (req, res) => res.json(reviewerAnnotations(db, String(req.params.id), req.agoraPrincipal?.id ?? '')));
  router.post('/api/phase1/review/snapshots/:snapshot/assignments', (req, res) => {
    const principal = req.agoraPrincipal;
    if (!principal || !['admin', 'operator'].includes(principal.role)) { res.status(403).json({ error: 'operator or admin permission required' }); return; }
    res.status(201).json(createReviewAssignments(db, String(req.params.snapshot), req.body.reviewers));
  });
  router.get('/api/phase1/review/assignments/:assignment', (req, res) => res.json(blindedReviewProjection(db, String(req.params.assignment), req.agoraPrincipal!)));
  router.post('/api/phase1/review/assignments/:assignment', (req, res) => res.status(201).json({ id: submitIndependentReview(db, String(req.params.assignment), req.agoraPrincipal!, req.body.label) }));
  router.get('/api/phase1/adjudication/:snapshot', (req, res) => res.json({ candidates: listAdjudicationCandidates(db, String(req.params.snapshot)) }));
  router.post('/api/phase1/adjudication', (req, res) => res.status(201).json({ id: submitAdjudication(db, String(req.body.candidate_id), req.agoraPrincipal!, req.body.decision) }));
  router.post('/api/phase1/campaigns/:id/evidence', (req, res) => { if (!['exact_rerun', 'failure_attribution'].includes(req.body.purpose)) throw new Error('Invalid evidence purpose'); linkEvidence(db, String(req.params.id), String(req.body.run_id), req.body.purpose); res.json({ linked: true }); });
  router.post('/api/phase1/campaigns/:id/export', (req, res) => res.json(campaignBundle(db, String(req.params.id))));
  router.use((error: Error, req: import('express').Request, res: import('express').Response, _next: import('express').NextFunction) => { if (req.path.startsWith('/api/')) res.status(400).json({ error: error.message }); else res.status(400).send(page('Phase 1A validation error', `<h1>Cannot proceed</h1>${json(error.message)}<p>Use Back to correct the draft; frozen campaigns cannot be edited.</p>`)); });
  return router;
}
