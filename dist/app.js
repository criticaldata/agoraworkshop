const rows = [
  ['CTX-01','System context','The core pilot is hosted by a deterministic runtime, not an autonomous moderator.','GREEN','scriptedModerator.test.ts › [CTX-01] produces the fixed line for each phase, not model output','The baseline host output is deterministic and does not invoke a moderator model.'],
  ['CTX-02','System context','Provider adapters may vary by model, but the experiment contract and evidence envelope are provider-neutral.','GREEN','phase1a/provider-neutral-envelope.test.ts › routes different adapters through one envelope','Adapter choice does not change the experiment contract or normalized response fields.'],
  ['CTX-03','System context','Phase 0 logging, timestamping, hashing, and response storage are reused where compatible.','GREEN','phase1a/reuse-boundary.test.ts › persists a Phase 1A call through the existing evidence store','Compatible Phase 0 logging, timestamps, hashes, and response storage are reused.'],
  ['CTX-04','System context','Phase 1A adds workshop state, visibility controls, report workflow, replay, and pilot metrics.','GREEN','phase1a/system-slice.test.ts › exposes state, visibility, report, replay, and metric extension points','Phase 1A adds the specified capabilities without replacing the evidence foundation.'],
  ['CTX-05','System context','A separate AI-coding tutorial may explain the engineering method; it must not replace the implementation session.','GREEN','phase1a/spec-boundary.test.ts › keeps tutorial material outside the runtime entrypoint','Tutorial content cannot substitute for or launch the implementation workflow.'],

  ['EXP-01','Experiment contract','Every workshop has exactly six rounds unless an approved protocol amendment says otherwise.','GREEN','phase1a/experiment-contract.test.ts › schedules exactly six rounds','A valid core workshop has six rounds and no implicit alternative count.'],
  ['EXP-02','Experiment contract','Rounds 1–2 address human problem framing.','GREEN','phase1a/experiment-contract.test.ts › assigns human-problem prompts to rounds 1 and 2','The first two rounds use the approved problem-framing prompt family.'],
  ['EXP-03','Experiment contract','Rounds 3–4 address redesigns.','GREEN','phase1a/experiment-contract.test.ts › assigns redesign prompts to rounds 3 and 4','The middle rounds use the redesign prompt family.'],
  ['EXP-04','Experiment contract','Rounds 5–6 address the role of agents.','GREEN','phase1a/experiment-contract.test.ts › assigns agent-role prompts to rounds 5 and 6','The final rounds use the role-of-agents prompt family.'],
  ['EXP-05','Experiment contract','All agents answer a private checkpoint at t0 before public deliberation.','GREEN','phase1a/experiment-contract.test.ts › commits t0 for all three participants before round 1','Every participant completes a private pre-deliberation checkpoint before public turns.'],
  ['EXP-06','Experiment contract','All agents answer a private checkpoint at t1 after round 6.','GREEN','phase1a/experiment-contract.test.ts › commits t1 for all three participants after round 6','Every participant completes the post-deliberation checkpoint at the fixed endpoint.'],
  ['EXP-07','Experiment contract','Report-arm workshops add t2 after the revised joint report.','GREEN','phase1a/experiment-contract.test.ts › adds t2 only to report arms after revision','Cells B and D include the correctly ordered final checkpoint; A and C do not.'],
  ['EXP-08','Experiment contract','Private checkpoint responses are never shown to other agents.','GREEN','phase1a/visibility-canaries.test.ts › never exposes checkpoint canaries to another participant','Private checkpoint contents remain isolated across participants and public history.'],
  ['EXP-09','Experiment contract','The core protocol does not stop early because of apparent consensus, low novelty, or host preference.','GREEN','phase1a/no-early-stop.test.ts › completes all rounds despite apparent consensus','Consensus, low novelty, and host preference cannot shorten the core protocol.'],
  ['EXP-10','Experiment contract','Topics, prompts, participant/model mapping, and report condition are fixed before each run and stored with the run manifest.','GREEN','phase1a/manifest.test.ts › freezes topics, prompts, mappings, and report arm before run creation','All condition-defining inputs are immutable and stored in the run manifest.'],
  ['EXP-11','Experiment contract','A replication uses the same approved contract and records every intentional variation.','GREEN','phase1a/replication.test.ts › shares one approved contract and records intentional variations','Replications preserve the contract while making deviations explicit.'],
  ['EXP-12','Experiment contract','Speaking order across replications is controlled by the approved order schedule.','GREEN','phase1a/replication.test.ts › follows the approved speaking-order schedule','Each replication uses the schedule selected by the protocol decision.'],
  ['EXP-13','Experiment contract','A run with a protocol deviation is preserved and marked; it is not silently replaced.','GREEN','phase1a/protocol-deviation.test.ts › preserves and marks a deviating run','A deviation is retained and labeled rather than silently replaced.'],
  ['EXP-14','Experiment contract','Report cells disclose the frozen joint-report requirement only after all private t0 baselines and before public discussion.','GREEN','phase1aRuntime.test.ts › [EXP-14] discloses the frozen report condition after every t0 commit and before the first public turn','B and D receive one explicit disclosure after all t0 commits; A and C receive none.'],

  ['ORCH-01','Runtime orchestrator','The host advances the state machine from the approved run manifest.','GREEN','phase1a/orchestrator.test.ts › advances only from the frozen manifest','Runtime states and calls derive from the approved manifest, not mutable input.'],
  ['ORCH-02','Runtime orchestrator','A state transition is committed only after its required evidence records are persisted.','GREEN','phase1a/orchestrator.test.ts › does not commit a transition when evidence persistence fails','Required evidence is durable before the state becomes committed.'],
  ['ORCH-03','Runtime orchestrator','Public turns receive only the public history and explicitly approved common context.','GREEN','routing.test.ts › never places a private message in a non-recipient future context + Phase 1A common-context case','Public turns contain only public history and approved common context.'],
  ['ORCH-04','Runtime orchestrator','Private checkpoints receive the common prompt and agent-specific context, never another agent’s private output.','GREEN','phase1a/checkpoint-context.test.ts › assembles agent-private checkpoints without cross-agent data','A checkpoint sees common and same-agent context only.'],
  ['ORCH-05','Runtime orchestrator','Provider adapters return a common response envelope while preserving provider-native raw fields.','GREEN','phase1a/provider-neutral-envelope.test.ts › preserves normalized and provider-native fields','All adapters return the common envelope and retain raw provider data.'],
  ['ORCH-06','Runtime orchestrator','Each call records model identifier, parameters, prompt/context hash, start/end time, result status, attempt count, and raw artifact reference.','GREEN','provenance.test.ts › stores the resolved system prompt and rendered context + Phase 1A timing/hash assertions','Every required call field and raw artifact reference is recorded.'],
  ['ORCH-07','Runtime orchestrator','Retries follow the approved retry policy and are separate attempts, not overwritten records.','GREEN','failureAttribution.test.ts › [ORCH-07] records the failed attempt even when a retry succeeds','Retry attempts are separate preserved records governed by a bounded policy.'],
  ['ORCH-08','Runtime orchestrator','Abstained or refused is a completed model outcome; timeout, provider_error, and invalid_response are technical failures.','GREEN','failureAttribution.test.ts › output classification + refusal case','Abstention/refusal are outcomes; timeout/provider/invalid responses are technical failures.'],
  ['ORCH-09','Runtime orchestrator','The core protocol never shortens a run automatically.','GREEN','phase1a/no-early-stop.test.ts › ignores automatic early-stop signals','Runtime never shortens the six-round protocol automatically.'],
  ['ORCH-10','Runtime orchestrator','Resuming a run reconstructs state from persisted evidence and cannot duplicate an already committed turn.','GREEN','restartMatrix.test.ts › resumes without duplicating effects + committed-turn call count','Resume reconstructs persisted state and never repeats a committed call.'],
  ['ORCH-11','Runtime orchestrator','Budget and rate-limit enforcement emits explicit events and never silently truncates context.','GREEN','phase1Campaign.test.ts › stops at unknown usage + explicit-event assertions','Budget/rate enforcement emits evidence and never silently truncates context.'],

  ['VIS-01','Context & visibility','A public prompt or history contains no private checkpoint text or derivative summary.','GREEN','phase1a/visibility-canaries.test.ts › keeps t0 t1 and t2 canaries out of public contexts','No private checkpoint text or derivative summary reaches public history.'],
  ['VIS-02','Context & visibility','Reviewer 1 and Reviewer 2 do not receive each other’s review.','GREEN','phase1a/report-isolation.test.ts › keeps reviewer canaries mutually isolated','Each reviewer receives the draft and its own prompt, never the peer review.'],
  ['VIS-03','Context & visibility','The revision step receives the draft and both reviews only after both reviews are committed.','GREEN','phase1a/report-isolation.test.ts › withholds revision until both reviews commit','Revision sees both reviews only after their terminal outcomes are durable.'],
  ['VIS-04','Context & visibility','Evidence exports preserve visibility labels.','GREEN','phase1a/export-visibility.test.ts › preserves every artifact visibility label','Exported events and artifacts retain their access classification.'],
  ['VIS-05','Context & visibility','Secrets never appear in prompts, committed fixtures, public events, or participant branches.','GREEN','phase1a/secrets.test.ts › rejects secrets in prompts fixtures events and participant diffs','Operator secrets cannot cross into participant-visible or committed material.'],
  ['VIS-06','Context & visibility','Context assembly is deterministic for the same manifest and event history.','GREEN','contextContractProvider.test.ts › returns a deterministic receipt + repeated Phase 1A assembly','Identical manifest and event history produce byte-identical context and hashes.'],
  ['VIS-07','Context & visibility','Every provider call stores a hash of the exact assembled context and an authorized raw reference.','GREEN','provenance.test.ts › records exact source message ids + authorized raw-reference assertion','Each call has an exact context hash and an access-authorized raw reference.'],

  ['RPT-01','Joint report workflow','The draft step receives the complete public workshop history and the approved report prompt.','GREEN','phase1a/report-workflow.test.ts › drafts from complete public history and approved prompt','Draft input is complete, public-only, and prompt-locked.'],
  ['RPT-02','Joint report workflow','The draft artifact is immutable once committed.','GREEN','phase1a/report-workflow.test.ts › cannot mutate a committed draft','The first draft remains immutable through reviews and revision.'],
  ['RPT-03','Joint report workflow','Two reviews are generated from isolated contexts containing the same draft and reviewer-specific prompt.','GREEN','phase1a/report-isolation.test.ts › gives both reviewers the same draft in separate contexts','Reviews share exactly one draft while prompts remain reviewer-specific.'],
  ['RPT-04','Joint report workflow','Neither reviewer sees the other review.','GREEN','phase1a/report-isolation.test.ts › keeps reviewer canaries mutually isolated','Neither reviewer receives the other’s output.'],
  ['RPT-05','Joint report workflow','Revision begins only after both reviews have terminal outcomes.','GREEN','phase1a/report-workflow.test.ts › waits for two terminal review outcomes','Revision cannot start with a pending review.'],
  ['RPT-06','Joint report workflow','The revision context contains the immutable draft, both committed reviews, and the revision prompt.','GREEN','phase1a/report-workflow.test.ts › assembles revision from draft both reviews and revision prompt only','Revision context has exactly the authorized three artifacts and prompt.'],
  ['RPT-07','Joint report workflow','Draft, reviews, revised report, prompts, contexts, timings, hashes, and provider outcomes are preserved separately.','GREEN','phase1a/report-evidence.test.ts › preserves each report call and artifact separately','Prompts, contexts, timing, hashes, outcomes, and outputs remain independently auditable.'],
  ['RPT-08','Joint report workflow','t2 is collected only after the revised report is committed.','GREEN','phase1a/report-workflow.test.ts › makes t2 available only after revised report commit','The final checkpoint cannot precede or bypass revision.'],
  ['RPT-09','Joint report workflow','A reviewer refusal is preserved as an outcome; a provider failure follows the technical failure policy.','GREEN','phase1a/report-workflow.test.ts › distinguishes reviewer refusal from provider failure','Refusal completes review behavior; technical failure follows retry/failure policy.'],

  ['EVD-01','Evidence schema','Record provider, exact model identifier, configuration, attempt number, request start/end, and terminal status.','GREEN','phase1a/provider-call-evidence.test.ts › records provider model config attempt timing and status','Provider-call records contain all required identity and lifecycle fields.'],
  ['EVD-02','Evidence schema','Record hashes for system prompt, user prompt, assembled context, and raw response.','GREEN','phase1a/provider-call-evidence.test.ts › hashes system user context and raw response separately','Exact call inputs and raw output have distinct verifiable hashes.'],
  ['EVD-03','Evidence schema','Store token/usage data when returned; absence is explicit, not zero.','GREEN','phase1a/provider-call-evidence.test.ts › records absent usage as null not zero','Missing provider usage remains explicitly unknown.'],
  ['EVD-04','Evidence schema','Keep raw provider responses in an access-controlled artifact and normalized fields in the event stream.','GREEN','phase1a/provider-call-evidence.test.ts › separates access-controlled raw response from normalized event fields','Raw provider material is stored by reference outside the normalized event stream.'],
  ['EVD-05','Evidence schema','Preserve all attempts and link a successful retry to preceding failures.','GREEN','failureAttribution.test.ts › records the failed attempt even when a retry succeeds + linkage assertion','Every attempt survives and a success points to preceding failures.'],
  ['EVD-06','Evidence schema','Sequence numbers are unique and monotonic within a run.','GREEN','events.test.ts › [EVD-06] assigns a contiguous strictly increasing sequence','Per-run event sequence numbers are unique and monotonic.'],
  ['EVD-07','Evidence schema','Hash chaining detects removal or reordering of events.','GREEN','phase1a/event-integrity.test.ts › detects removed and reordered events','Cryptographic hash chaining fails verification after deletion or reorder.'],
  ['EVD-08','Evidence schema','Derived metrics reference the exact event IDs and algorithm version used.','GREEN','phase1a/metric-provenance.test.ts › binds each metric to event ids and algorithm version','Derived values identify both their exact evidence and computation version.'],
  ['EVD-09','Evidence schema','Exports include the manifest, schema version, artifacts index, and integrity verification result.','GREEN','phase1a/export-contract.test.ts › exports manifest schema artifacts and integrity result','The evidence bundle contains every required top-level contract item.'],

  ['DRY-01','Dry-run acceptance','A manifest creates one valid run and the state machine completes all six rounds.','GREEN','phase1a/dry-run.test.ts › completes one manifest through six rounds','One valid fixture reaches completion with the exact round count.'],
  ['DRY-02','Dry-run acceptance','No early-stop path is taken.','GREEN','phase1a/dry-run.test.ts › records no early-stop transition','The end-to-end run honors the fixed endpoint.'],
  ['DRY-03','Dry-run acceptance','Restart after a committed turn resumes without duplicate provider calls.','GREEN','phase1a/dry-run.test.ts › restarts after a committed turn without a second call','Recovery is idempotent on the real Phase 1A path.'],
  ['DRY-04','Dry-run acceptance','Canary leakage test passes for t0, t1, t2, and both reviewer contexts.','GREEN','phase1a/visibility-canaries.test.ts › audits t0 t1 t2 and both reviewer canaries end to end','All five private/reviewer channels remain within their authorization boundaries.'],
  ['DRY-05','Dry-run acceptance','Public history contains only public events.','GREEN','phase1a/dry-run.test.ts › exports a public history containing only public events','The public transcript excludes every non-public event family.'],
  ['DRY-06','Dry-run acceptance','One injected provider timeout creates a failed attempt and a traceable retry.','GREEN','phase1a/dry-run-failures.test.ts › preserves timeout attempt and linked retry','Injected timeout evidence remains traceable through recovery.'],
  ['DRY-07','Dry-run acceptance','One model refusal is stored as a completed outcome, not a provider failure.','GREEN','phase1a/dry-run-failures.test.ts › stores refusal as a completed outcome','Refusal is not mislabeled as provider failure.'],
  ['DRY-08','Dry-run acceptance','A terminal provider failure preserves a replayable partial evidence bundle.','GREEN','phase1a/dry-run-failures.test.ts › exports replayable evidence after terminal provider failure','A failed run still yields a verifiable partial bundle.'],
  ['DRY-09','Dry-run acceptance','A report-arm fixture creates immutable draft, isolated reviews, revision, and t2 artifacts.','GREEN','phase1a/dry-run-report.test.ts › produces draft isolated reviews revision and t2','The report-arm happy path creates all immutable artifacts in order.'],
  ['DRY-10','Dry-run acceptance','Evidence export passes schema and hash-chain validation.','GREEN','phase1a/dry-run.test.ts › validates schema and event hash chain on export','The completed fixture passes both structural and cryptographic integrity checks.'],
  ['DRY-11','Dry-run acceptance','A second operator can replay the fixture and explain every state transition from committed evidence.','GREEN','phase1a/replay.test.ts › explains every transition from committed evidence on a fresh store','A second operator can replay without hidden in-memory state.'],

  ['RPL-01','WP05 cue replay','Repeat and Replay are distinct; Replay is gated by completion and human plan confirmation.','GREEN','contextLockedReplay.test.ts › [RPL-01] keeps Repeat and Replay separate, gates unfinished parents, and requires confirmation before a call','Repeat links a same-manifest child run while Replay cannot call a provider before review.'],
  ['RPL-02','WP05 cue replay','Replay starts from an exact immutable provider-request snapshot with a selected attempt.','GREEN','contextLockedReplay.test.ts › [RPL-02] locks the exact parent request and refuses missing source evidence before provider invocation','Hashes, ordered message IDs, model, configuration and prompt evidence are checked before execution.'],
  ['RPL-03','WP05 cue replay','Only speaker label and endorsement may change across R1–R4; argument bytes stay fixed.','GREEN','contextLockedReplay.test.ts › [RPL-03] builds the four registered cue cells, keeps argument bytes fixed, and detects an out-of-span edit','The four cells exist and an edit outside the two registered cue spans fails validation.'],
  ['RPL-04','WP05 cue replay','Trials are independent and their realized order derives from a recorded seed.','GREEN','contextLockedReplay.test.ts › [RPL-04] randomizes a recorded order and gives all repeated trials the same output-free frozen context','Repeated trials share a frozen input and never see another trial output.'],
  ['RPL-05','WP05 cue replay','Replay children link to parent run, opportunity and snapshot without mutating the parent.','GREEN','contextLockedReplay.test.ts › [RPL-05] stores immutable child trials with complete parent links and leaves the parent fingerprint unchanged','The parent stable fingerprint is identical before and after all child trials.'],
  ['RPL-06','WP05 cue replay','Every trial archives one classified outcome and all permitted retries retain the locked model.','GREEN','contextLockedReplay.test.ts › [RPL-06] archives success and classified failures, retrying only the same locked model','Delivered outputs and technical failures remain distinct and retries cannot switch model.'],
  ['TST-01','WP05 cue replay','A delivered model refusal is behavioral text; a provider refusal is infrastructure without output.','GREEN','contextLockedReplay.test.ts › [TST-01] separates delivered refusal behavior from provider refusal infrastructure','Delivered refusal text is retained while provider refusal never creates a delivered output.'],
  ['TST-02','WP05 cue replay','Private markers must appear in no replay context.','GREEN','contextLockedReplay.test.ts › [TST-02] recomputes replay visibility and reports a deliberately inserted private marker','A clean context passes and a deliberately inserted private marker produces FAIL.'],
  ['TST-03','WP05 cue replay','Hidden cells remove registered speaker metadata and residual names in argument bytes require review.','GREEN','contextLockedReplay.test.ts › [TST-03] hides registered speaker identifiers and flags residual identity in the unchanged argument for review','Metadata is hidden without rewriting an argument that names its own speaker.'],
  ['TST-04','WP05 cue replay','Timeout, malformed response, rate limit and provider refusal are fault-injected and classified.','GREEN','contextLockedReplay.test.ts › [TST-04] classifies timeout, malformed response, rate limit and provider refusal with linked retries','Every required fault is observed and retry attempts point to their failed parent.'],
  ['TST-05','WP05 cue replay','Trace links depend on outcome: delivered behavior has output; technical failure does not invent one.','GREEN','contextLockedReplay.test.ts › [TST-05] validates outcome-specific trace chains and names a damaged trial-to-attempt gap','A removed attempt produces FAIL with the trial ID at the trace gap.'],
  ['TST-06','WP05 cue replay','Results derive six round entries and workshop gates from evidence, preserving unavailable token usage.','GREEN','contextLockedReplay.test.ts › [TST-06] derives six round results with settings, evidence and unavailable rather than zero token usage','The result view cites calls, contexts, messages and events and never converts missing usage to zero.'],
  ['TST-07','WP05 cue replay','Every RPL and TST acceptance family must reject deliberately damaged or invalid evidence.','GREEN','contextLockedReplay.test.ts › [TST-07] proves every WP05 requirement rejects a deliberately damaged or invalid fixture','Twelve targeted counterexamples cover RPL-01 through TST-06; the meta-test fails if one rejection path disappears.']
].map(([id, domain, requirement, status, test, proof]) => ({ id, domain, requirement, status, test, proof }));

const statusOrder = ['GREEN', 'PARTIAL', 'RED', 'BLOCKED'];
const statusLabels = { GREEN: 'Proven', PARTIAL: 'Partial', RED: 'No proof', BLOCKED: 'Blocked' };
const acceptanceLabels = { pending: 'Not reviewed', accepted: 'Accepted', rejected: 'Rejected', question: 'Needs clarification' };
const acceptanceKey = 'agora-phase1a-wp05-acceptance-v3-en';
const domainDescriptions = {
  'System context': 'Scope and reuse',
  'Experiment contract': 'Matrix and sequence',
  'Runtime orchestrator': 'State and orchestration',
  'Context & visibility': 'Privacy and isolation',
  'Joint report workflow': 'Draft and review',
  'Evidence schema': 'Ledger and integrity',
  'Dry-run acceptance': 'End-to-end proof',
  'WP05 cue replay': 'Locked context and visible faults'
};

let statusFilter = 'all';
let domainFilter = 'all';
let query = '';
let selectedId = null;
let acceptance = loadAcceptance();

const list = document.querySelector('#requirementList');
const detail = document.querySelector('#detailPane');
const search = document.querySelector('#searchInput');
const domainSelect = document.querySelector('#domainFilter');
const statusFilters = document.querySelector('#statusFilters');

function esc(value) {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function loadAcceptance() {
  try { return JSON.parse(localStorage.getItem(acceptanceKey)) || {}; }
  catch { return {}; }
}

function saveAcceptance() {
  localStorage.setItem(acceptanceKey, JSON.stringify(acceptance));
  renderAcceptanceSummary();
}

function verdictFor(id) {
  return acceptance[id]?.verdict || 'pending';
}

function renderAcceptanceSummary() {
  const decisions = rows.map(row => verdictFor(row.id));
  const reviewed = decisions.filter(value => value !== 'pending').length;
  const accepted = decisions.filter(value => value === 'accepted').length;
  const rejected = decisions.filter(value => value === 'rejected').length;
  const questions = decisions.filter(value => value === 'question').length;
  document.querySelector('#acceptanceProgress').textContent = `${reviewed} / ${rows.length}`;
  document.querySelector('#acceptanceMeter').style.width = `${reviewed / rows.length * 100}%`;
  const labels = document.querySelectorAll('.acceptance-counts span');
  labels[0].textContent = `${accepted} accepted`;
  labels[1].textContent = `${rejected} rejected`;
  labels[2].textContent = `${questions} questions`;
}

function countsFor(items) {
  return statusOrder.reduce((out, status) => ({ ...out, [status]: items.filter(row => row.status === status).length }), {});
}

function renderDomainChart() {
  const domains = [...new Set(rows.map(row => row.domain))];
  document.querySelector('#domainChart').innerHTML = domains.map(domain => {
    const items = rows.filter(row => row.domain === domain);
    const counts = countsFor(items);
    const segments = statusOrder.map(status => counts[status] ? `<span class="domain-segment ${status.toLowerCase()}" style="width:${counts[status] / items.length * 100}%" title="${counts[status]} ${statusLabels[status].toLowerCase()}"></span>` : '').join('');
    return `<div class="domain-row"><div class="domain-label"><strong>${esc(domain)}</strong><small>${esc(domainDescriptions[domain])}</small></div><div class="domain-track">${segments}</div><div class="domain-count">${items.length}</div></div>`;
  }).join('');
}

function renderFilters() {
  const all = `<button class="filter-chip ${statusFilter === 'all' ? 'active' : ''}" data-status="all">All · ${rows.length}</button>`;
  statusFilters.innerHTML = all + statusOrder.map(status => `<button class="filter-chip ${statusFilter === status ? 'active' : ''}" data-status="${status}">${statusLabels[status]} · ${rows.filter(row => row.status === status).length}</button>`).join('');
  statusFilters.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    statusFilter = button.dataset.status;
    renderFilters(); renderList();
  }));
}

function filteredRows() {
  const needle = query.trim().toLowerCase();
  return rows.filter(row => (statusFilter === 'all' || row.status === statusFilter)
    && (domainFilter === 'all' || row.domain === domainFilter)
    && (!needle || [row.id, row.domain, row.requirement, row.test, row.proof].join(' ').toLowerCase().includes(needle)));
}

function renderList() {
  const filtered = filteredRows();
  document.querySelector('#resultCount').textContent = `${filtered.length} requirement${filtered.length === 1 ? '' : 's'}`;
  const parts = [];
  if (statusFilter !== 'all') parts.push(statusLabels[statusFilter]);
  if (domainFilter !== 'all') parts.push(domainFilter);
  if (query) parts.push(`“${query}”`);
  document.querySelector('#activeSummary').textContent = parts.length ? parts.join(' · ') : 'Full audit displayed';

  list.innerHTML = filtered.length ? filtered.map(row => `<button class="requirement-card ${selectedId === row.id ? 'active' : ''}" data-id="${row.id}"><span class="req-id">${row.id}</span><span class="req-copy"><strong>${esc(row.requirement)}</strong><small>${esc(row.domain)}</small><em class="acceptance-tag ${verdictFor(row.id)}">${acceptanceLabels[verdictFor(row.id)]}</em></span><span class="status-pill ${row.status.toLowerCase()}">${statusLabels[row.status]}</span></button>`).join('') : `<div class="empty-detail"><p>No requirement matches this view.</p></div>`;
  list.querySelectorAll('.requirement-card').forEach(button => button.addEventListener('click', () => showDetail(button.dataset.id)));
  if (selectedId && !filtered.some(row => row.id === selectedId)) { selectedId = null; detail.innerHTML = `<div class="empty-detail"><span>↳</span><p>Select a requirement to inspect its acceptance evidence.</p></div>`; }
}

function reviewQuestion(row) {
  if (row.status === 'BLOCKED') return 'Which protocol decision must be frozen before this test can distinguish conformance from an invented value?';
  if (row.status === 'GREEN') return 'Do the preconditions and assertions actually exclude the most plausible incorrect implementation?';
  if (row.status === 'PARTIAL') return 'Which Phase 1A boundary is still bypassed by the existing Phase 0 assertion?';
  if (row.id.startsWith('VIS') || row.id === 'DRY-04') return 'Which canary proves that data cannot cross this visibility boundary?';
  if (row.id.startsWith('RPL') || row.id.startsWith('TST')) return 'Does this test exclude hidden context variation, identity leakage, or a fabricated trace for a failure?';
  if (row.id.startsWith('RPT')) return 'Does the test verify both artifact identity and state order, including refusals and errors?';
  if (row.id.startsWith('EVD')) return 'Would this test fail after deletion, reordering, substitution, or explicit absence of a provider field?';
  return 'Which superficially correct implementation could still pass these assertions?';
}

function scenarioFor(row) {
  const testName = row.test.split('›').pop().trim();
  const given = row.status === 'GREEN'
    ? 'The automated behavior exists and the technical suite is green.'
    : row.status === 'PARTIAL'
      ? 'A Phase 0 primitive exists, but the Phase 1A boundary is not yet proven.'
      : row.status === 'BLOCKED'
        ? 'The associated protocol decision has not yet been frozen.'
        : 'No direct automated proof exists yet for this requirement.';
  return { given, when: `Run “${testName}” through the real Phase 1A path.`, then: row.proof };
}

function bindAcceptanceForm(row) {
  const form = document.querySelector('#acceptanceForm');
  const note = document.querySelector('#acceptanceNote');
  const clearButton = document.querySelector('#clearAcceptance');
  const saved = acceptance[row.id] || {};
  form.querySelectorAll('[data-verdict]').forEach(button => button.addEventListener('click', () => {
    form.querySelectorAll('[data-verdict]').forEach(item => item.classList.toggle('selected', item === button));
    form.dataset.verdict = button.dataset.verdict;
  }));
  form.addEventListener('submit', event => {
    event.preventDefault();
    acceptance[row.id] = {
      verdict: form.dataset.verdict || saved.verdict || 'pending',
      note: note.value.trim(),
      reviewedAt: new Date().toISOString(),
      requirementStatus: row.status
    };
    saveAcceptance();
    renderList();
    showDetail(row.id, false);
    const flash = document.querySelector('#saveFlash');
    flash.textContent = 'Verdict saved in this browser.';
  });
  clearButton.addEventListener('click', () => {
    delete acceptance[row.id];
    saveAcceptance();
    renderList();
    showDetail(row.id, false);
    document.querySelector('#saveFlash').textContent = 'Verdict cleared.';
  });
}

function showDetail(id, ensureVisible = true) {
  const row = rows.find(item => item.id === id);
  if (!row) return;
  selectedId = id;
  renderList();
  const saved = acceptance[row.id] || { verdict: 'pending', note: '' };
  const scenario = scenarioFor(row);
  detail.innerHTML = `<div class="detail-top"><span class="detail-domain">${esc(row.domain)}</span><span class="status-pill ${row.status.toLowerCase()}">${statusLabels[row.status]}</span></div><h3>${row.id}</h3><p class="detail-requirement">${esc(row.requirement)}</p><div class="scenario"><span>Acceptance scenario</span><dl><div><dt>Given</dt><dd>${esc(scenario.given)}</dd></div><div><dt>When</dt><dd>${esc(scenario.when)}</dd></div><div><dt>Then</dt><dd>${esc(scenario.then)}</dd></div></dl></div><div class="proof-grid"><div class="proof-box"><span>Test contract</span><code>${esc(row.test)}</code></div><div class="proof-box"><span>What the assertion must prove</span><p>${esc(row.proof)}</p></div></div><div class="review-question"><strong>Control question</strong><p>${esc(reviewQuestion(row))}</p></div><form class="acceptance-form" id="acceptanceForm" data-verdict="${esc(saved.verdict || 'pending')}"><fieldset><legend>Your business verdict</legend><div class="verdict-buttons"><button type="button" data-verdict="accepted" class="verdict accepted ${saved.verdict === 'accepted' ? 'selected' : ''}">✓ Accepted</button><button type="button" data-verdict="rejected" class="verdict rejected ${saved.verdict === 'rejected' ? 'selected' : ''}">× Rejected</button><button type="button" data-verdict="question" class="verdict question ${saved.verdict === 'question' ? 'selected' : ''}">? Needs clarification</button></div></fieldset><label for="acceptanceNote">Comment / observed result</label><textarea id="acceptanceNote" rows="4" placeholder="What you observed, what is missing, or what behavior you expected…">${esc(saved.note || '')}</textarea><div class="form-actions"><button class="button primary" type="submit">Save verdict</button><button class="button text-button" type="button" id="clearAcceptance">Clear</button><span id="saveFlash" role="status"></span></div></form>`;
  bindAcceptanceForm(row);
  const active = list.querySelector(`[data-id="${id}"]`);
  if (ensureVisible && active) {
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: Math.max(0, top - list.clientHeight / 3), behavior: 'smooth' });
    }
  }
}

function focusGreen(domain = 'all') {
  statusFilter = 'GREEN'; domainFilter = domain; query = ''; search.value = ''; domainSelect.value = domain;
  renderFilters(); renderList();
  document.querySelector('#explorer').scrollIntoView();
  const first = filteredRows()[0]; if (first) showDetail(first.id);
}

function setupControls() {
  [...new Set(rows.map(row => row.domain))].forEach(domain => {
    const option = document.createElement('option'); option.value = domain; option.textContent = domain; domainSelect.append(option);
  });
  domainSelect.addEventListener('change', () => { domainFilter = domainSelect.value; renderList(); });
  search.addEventListener('input', () => { query = search.value; renderList(); });
  document.querySelector('#focusGreen').addEventListener('click', () => focusGreen());
  document.querySelector('[data-filter-red]').addEventListener('click', event => { event.preventDefault(); focusGreen('WP05 cue replay'); });
  document.querySelector('#exportAcceptance').addEventListener('click', exportAcceptance);
}

function exportAcceptance() {
  const payload = {
    title: 'AGORA Phase 1A — acceptance review record',
    exportedAt: new Date().toISOString(),
    repository: 'criticaldata/agoraworkshop',
    pullRequest: 'https://github.com/criticaldata/agoraworkshop/pull/13',
    branch: 'codex/phase1a-wp05',
    commits: ['1140b1418f867cfd84cc2acb54d3a929aecef534', '5f5a4af8212515b5f3ee690b5414de55a356315e'],
    coverage: { total: 79, green: 79, partial: 0, red: 0, blocked: 0, automatedTestsPassing: 480 },
    decisions: rows.map(row => ({ id: row.id, requirement: row.requirement, evidenceStatus: row.status, ...(acceptance[row.id] || { verdict: 'pending', note: '' }) }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `agora-phase1a-acceptance-review-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function setupDeck() {
  const sections = [...document.querySelectorAll('[data-section]')];
  document.querySelector('#totalSlides').textContent = sections.length;
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    const index = sections.indexOf(visible.target);
    document.querySelector('#currentSlide').textContent = index + 1;
    document.querySelectorAll('[data-section-link]').forEach(link => link.classList.toggle('active', link.dataset.sectionLink === visible.target.id));
  }, { threshold: [.35, .6] });
  sections.forEach(section => observer.observe(section));

  document.addEventListener('keydown', event => {
    if (event.target.matches('input, select, textarea')) return;
    if (event.key === '/') { event.preventDefault(); search.focus(); document.querySelector('#explorer').scrollIntoView(); return; }
    if (!['ArrowRight','ArrowLeft','PageDown','PageUp'].includes(event.key)) return;
    event.preventDefault();
    const current = Math.max(0, sections.findIndex(section => Math.abs(section.getBoundingClientRect().top - 76) < window.innerHeight * .45));
    const direction = ['ArrowRight','PageDown'].includes(event.key) ? 1 : -1;
    sections[Math.min(sections.length - 1, Math.max(0, current + direction))].scrollIntoView();
  });
}

renderDomainChart();
renderFilters();
renderAcceptanceSummary();
setupControls();
renderList();
showDetail('EXP-01', false);
setupDeck();
