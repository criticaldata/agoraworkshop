const STORAGE = {
  reviews: 'agora-acceptance-workbook-reviews-v1',
  manual: 'agora-acceptance-workbook-manual-v1'
};

const verdictLabels = {
  pending: 'Not reviewed',
  accepted: 'Accepted',
  rejected: 'Rejected',
  blocked: 'Blocked'
};

const state = {
  snapshot: null,
  requirements: [],
  decisions: [],
  reviews: readStorage(STORAGE.reviews, {}),
  manualCases: readStorage(STORAGE.manual, []),
  status: 'all',
  domain: 'all',
  query: '',
  selectedId: null
};

const els = {
  sourceBar: document.querySelector('#sourceBar'),
  sourceStatus: document.querySelector('#sourceStatus'),
  refresh: document.querySelector('#refreshRepository'),
  search: document.querySelector('#searchInput'),
  statusFilters: document.querySelector('#statusFilters'),
  domainFilter: document.querySelector('#domainFilter'),
  reviewSummary: document.querySelector('#reviewSummary'),
  resultCount: document.querySelector('#resultCount'),
  listContext: document.querySelector('#listContext'),
  caseList: document.querySelector('#caseList'),
  caseDetail: document.querySelector('#caseDetail'),
  decisionList: document.querySelector('#decisionList'),
  addManual: document.querySelector('#addManualCase'),
  dialog: document.querySelector('#manualCaseDialog'),
  manualForm: document.querySelector('#manualCaseForm'),
  importButton: document.querySelector('#importReview'),
  importFile: document.querySelector('#importFile'),
  exportButton: document.querySelector('#exportReview'),
  chatForm: document.querySelector('#chatForm'),
  chatInput: document.querySelector('#chatInput'),
  messages: document.querySelector('#messages'),
  clearChat: document.querySelector('#clearChat')
};

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'unknown time' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function shortSha(value = '') {
  return value.slice(0, 7) || 'unknown';
}

function allCases() {
  return [...state.requirements, ...state.manualCases.map(item => ({ ...item, manual: true }))];
}

function verdictFor(id) {
  return state.reviews[id]?.verdict || 'pending';
}

function reviewKey(item) {
  return item.manual ? `manual:${item.id}` : `${item.source?.ref || 'repository'}:${item.id}`;
}

function filteredCases() {
  const needle = state.query.trim().toLowerCase();
  return allCases().filter(item => {
    const verdict = verdictFor(reviewKey(item));
    return (state.status === 'all' || verdict === state.status)
      && (state.domain === 'all' || item.domain === state.domain)
      && (!needle || [item.id, item.domain, item.requirement, item.check, item.source?.path]
        .filter(Boolean).join(' ').toLowerCase().includes(needle));
  });
}

function renderFilters() {
  const items = allCases();
  const statuses = ['all', 'pending', 'accepted', 'rejected', 'blocked'];
  els.statusFilters.innerHTML = statuses.map(status => {
    const count = status === 'all' ? items.length : items.filter(item => verdictFor(reviewKey(item)) === status).length;
    return `<button class="filter-button ${state.status === status ? 'active' : ''}" type="button" data-status="${status}"><span>${verdictLabels[status] || 'All'}</span><span>${count}</span></button>`;
  }).join('');
  els.statusFilters.querySelectorAll('[data-status]').forEach(button => button.addEventListener('click', () => {
    state.status = button.dataset.status;
    renderWorkbook();
  }));

  const domains = [...new Set(items.map(item => item.domain).filter(Boolean))].sort();
  els.domainFilter.innerHTML = '<option value="all">All areas</option>' + domains
    .map(domain => `<option value="${escapeHtml(domain)}">${escapeHtml(domain)}</option>`).join('');
  els.domainFilter.value = domains.includes(state.domain) ? state.domain : 'all';
  if (!domains.includes(state.domain)) state.domain = 'all';

  const reviewed = items.filter(item => verdictFor(reviewKey(item)) !== 'pending').length;
  els.reviewSummary.innerHTML = `<strong>Review progress</strong><span>${reviewed} of ${items.length} items reviewed in this browser.</span>`;
}

function renderList() {
  const items = filteredCases();
  els.resultCount.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
  els.listContext.textContent = state.snapshot
    ? `${state.snapshot.defaultBranch} @ ${shortSha(state.snapshot.commitSha)}`
    : 'Repository unavailable';
  els.caseList.innerHTML = items.length ? items.map(item => {
    const key = reviewKey(item);
    const verdict = verdictFor(key);
    return `<button class="case-card ${state.selectedId === key ? 'active' : ''}" type="button" data-key="${escapeHtml(key)}">
      <span class="case-id">${escapeHtml(item.id)}</span>
      <span class="case-copy"><strong>${escapeHtml(item.requirement)}</strong><small>${escapeHtml(item.domain || 'Uncategorised')}${item.manual ? ' · Manual' : ''}</small></span>
      <span class="status-tag ${verdict}">${verdictLabels[verdict]}</span>
    </button>`;
  }).join('') : '<div class="empty-state"><p>No test-book item matches these filters.</p></div>';
  els.caseList.querySelectorAll('[data-key]').forEach(button => button.addEventListener('click', () => showCase(button.dataset.key)));
}

function sourceLink(item) {
  if (item.manual || !item.source?.url) return '<span>Local manual item — export the review to share it.</span>';
  return `<a href="${escapeHtml(item.source.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.source.path)} · ${escapeHtml(item.source.ref || shortSha(state.snapshot?.commitSha))}</a>`;
}

function showCase(key) {
  const item = allCases().find(candidate => reviewKey(candidate) === key);
  if (!item) return;
  state.selectedId = key;
  renderList();
  const saved = state.reviews[key] || { verdict: 'pending', note: '' };
  els.caseDetail.innerHTML = `
    <div class="detail-head"><span class="detail-domain">${escapeHtml(item.domain || 'Uncategorised')}</span><span class="status-tag ${escapeHtml(saved.verdict)}">${verdictLabels[saved.verdict] || verdictLabels.pending}</span></div>
    <h3>${escapeHtml(item.id)}</h3>
    <p class="detail-requirement">${escapeHtml(item.requirement)}</p>
    <div class="check-card"><span>How to check</span><p>${escapeHtml(item.check || 'Confirm the expected behaviour with a realistic project scenario and record what was observed.')}</p></div>
    <div class="source-card"><span>Repository source</span>${sourceLink(item)}</div>
    ${item.evidence?.url ? `<div class="source-card"><span>Linked technical evidence</span><a href="${escapeHtml(item.evidence.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.evidence.label)}</a><p>A link means evidence is referenced. It does not mean the test currently passes.</p></div>` : ''}
    <form class="review-form" id="reviewForm">
      <fieldset><legend>Business verdict</legend><div class="verdicts">
        ${['pending', 'accepted', 'rejected', 'blocked'].map(verdict => `<button class="verdict ${saved.verdict === verdict ? 'selected' : ''}" type="button" data-verdict="${verdict}">${verdictLabels[verdict]}</button>`).join('')}
      </div></fieldset>
      <label for="reviewNote">Observed result or question</label>
      <textarea id="reviewNote" rows="5" placeholder="Describe what you observed in plain language…">${escapeHtml(saved.note || '')}</textarea>
      <div class="form-row"><button class="button primary" type="submit">Save review</button><button class="text-button" id="clearReview" type="button">Clear</button><span class="save-note" id="saveNote" role="status"></span></div>
    </form>`;

  const form = document.querySelector('#reviewForm');
  let chosenVerdict = saved.verdict || 'pending';
  form.querySelectorAll('[data-verdict]').forEach(button => button.addEventListener('click', () => {
    chosenVerdict = button.dataset.verdict;
    form.querySelectorAll('[data-verdict]').forEach(candidate => candidate.classList.toggle('selected', candidate === button));
  }));
  form.addEventListener('submit', event => {
    event.preventDefault();
    state.reviews[key] = {
      verdict: chosenVerdict,
      note: document.querySelector('#reviewNote').value.trim(),
      reviewedAt: new Date().toISOString(),
      sourceCommit: state.snapshot?.commitSha || null
    };
    saveStorage(STORAGE.reviews, state.reviews);
    renderWorkbook();
    showCase(key);
    document.querySelector('#saveNote').textContent = 'Saved in this browser.';
  });
  document.querySelector('#clearReview').addEventListener('click', () => {
    delete state.reviews[key];
    saveStorage(STORAGE.reviews, state.reviews);
    renderWorkbook();
    showCase(key);
  });
}

function renderWorkbook() {
  renderFilters();
  renderList();
  if (state.selectedId && !allCases().some(item => reviewKey(item) === state.selectedId)) {
    state.selectedId = null;
    els.caseDetail.innerHTML = '<div class="empty-state"><span aria-hidden="true">↳</span><p>Select a test-book item to review it.</p></div>';
  }
}

function renderDecisions() {
  els.decisionList.innerHTML = state.decisions.length ? state.decisions.map(item => `
    <article class="decision-card"><header><strong>${escapeHtml(item.id)}</strong><span class="status-tag ${String(item.status).toLowerCase().includes('open') ? 'blocked' : ''}">${escapeHtml(item.status || 'Recorded')}</span></header><p>${escapeHtml(item.decision)}</p><small>${item.source?.url ? `<a href="${escapeHtml(item.source.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.source.path)}</a>` : escapeHtml(item.owner || '')}</small></article>
  `).join('') : '<div class="empty-state"><p>No structured decision register was found in the current repository snapshot.</p></div>';
}

async function loadSnapshot(force = false) {
  els.sourceBar.className = 'source-bar';
  els.sourceStatus.textContent = 'Checking the project repository…';
  els.refresh.disabled = true;
  try {
    const response = await fetch(`/api/snapshot${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'GitHub could not be read.');
    state.snapshot = payload;
    state.requirements = payload.requirements || [];
    state.decisions = payload.decisions || [];
    els.sourceBar.className = 'source-bar ready';
    els.sourceStatus.textContent = `Live from ${payload.repository} · ${payload.defaultBranch} @ ${shortSha(payload.commitSha)} · checked ${formatTime(payload.retrievedAt)}`;
    renderWorkbook();
    renderDecisions();
  } catch (error) {
    state.snapshot = null;
    state.requirements = [];
    state.decisions = [];
    els.sourceBar.className = 'source-bar error';
    els.sourceStatus.textContent = `GitHub could not be verified: ${error.message}`;
    renderWorkbook();
    renderDecisions();
  } finally {
    els.refresh.disabled = false;
  }
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function addMessage(role, text, meta = null) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
  const bubble = document.createElement('div');
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  bubble.appendChild(paragraph);
  if (meta) {
    const details = document.createElement('div');
    details.className = 'message-meta';
    details.textContent = `GitHub checked ${formatTime(meta.retrievedAt)} · ${shortSha(meta.commitSha)}`;
    bubble.appendChild(details);
    if (meta.sources?.length) {
      const sources = document.createElement('div');
      sources.className = 'source-links';
      meta.sources.forEach(source => {
        const link = document.createElement('a');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = source.label || source.path;
        sources.appendChild(link);
      });
      bubble.appendChild(sources);
    }
  }
  if (role !== 'user') {
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = 'A';
    wrapper.appendChild(avatar);
  }
  wrapper.appendChild(bubble);
  els.messages.appendChild(wrapper);
  els.messages.scrollTop = els.messages.scrollHeight;
  return wrapper;
}

async function askAssistant(question) {
  addMessage('user', question);
  const pending = addMessage('assistant', 'Checking GitHub before answering…');
  try {
    const response = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    const payload = await response.json();
    pending.remove();
    if (!response.ok) throw new Error(payload.error || 'The repository could not be verified.');
    addMessage('assistant', payload.answer, payload);
  } catch (error) {
    pending.remove();
    addMessage('assistant', `I could not verify GitHub, so I did not answer. ${error.message}`);
  }
}

els.refresh.addEventListener('click', () => loadSnapshot(true));
els.search.addEventListener('input', event => { state.query = event.target.value; renderList(); });
els.domainFilter.addEventListener('change', event => { state.domain = event.target.value; renderWorkbook(); });

els.addManual.addEventListener('click', () => els.dialog.showModal());
els.manualForm.addEventListener('submit', event => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  const data = new FormData(els.manualForm);
  const id = String(data.get('id')).trim();
  state.manualCases.push({
    id,
    domain: String(data.get('domain')).trim(),
    requirement: String(data.get('requirement')).trim(),
    check: String(data.get('check')).trim(),
    createdAt: new Date().toISOString()
  });
  saveStorage(STORAGE.manual, state.manualCases);
  els.manualForm.reset();
  els.dialog.close();
  renderWorkbook();
});

els.exportButton.addEventListener('click', () => downloadJson(`agora-acceptance-review-${new Date().toISOString().slice(0, 10)}.json`, {
  format: 'agora-acceptance-review-v1',
  exportedAt: new Date().toISOString(),
  repository: state.snapshot ? {
    name: state.snapshot.repository,
    defaultBranch: state.snapshot.defaultBranch,
    commitSha: state.snapshot.commitSha,
    retrievedAt: state.snapshot.retrievedAt
  } : null,
  reviews: state.reviews,
  manualCases: state.manualCases
}));

els.importButton.addEventListener('click', () => els.importFile.click());
els.importFile.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.format !== 'agora-acceptance-review-v1' || typeof payload.reviews !== 'object') throw new Error('This is not an AGORA acceptance review export.');
    state.reviews = { ...state.reviews, ...payload.reviews };
    if (Array.isArray(payload.manualCases)) state.manualCases = payload.manualCases;
    saveStorage(STORAGE.reviews, state.reviews);
    saveStorage(STORAGE.manual, state.manualCases);
    renderWorkbook();
  } catch (error) {
    window.alert(error.message);
  } finally {
    event.target.value = '';
  }
});

els.chatForm.addEventListener('submit', event => {
  event.preventDefault();
  const question = els.chatInput.value.trim();
  if (!question) return;
  els.chatInput.value = '';
  askAssistant(question);
});
els.chatInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    els.chatForm.requestSubmit();
  }
});
document.querySelectorAll('.suggestions button').forEach(button => button.addEventListener('click', () => {
  els.chatInput.value = button.textContent;
  els.chatForm.requestSubmit();
}));
els.clearChat.addEventListener('click', () => {
  els.messages.innerHTML = '<div class="message assistant-message"><div class="avatar" aria-hidden="true">A</div><div><p>Ask me about the purpose, specifications, tests, decisions, pull requests, or code. I will explain what GitHub currently contains in non-technical language.</p></div></div>';
});

renderWorkbook();
if (window.location.protocol === 'file:') {
  els.sourceBar.className = 'source-bar error';
  els.sourceStatus.textContent = 'This application needs an HTTP server to verify GitHub. Open the hosted site or run npm start; a file:// copy cannot access the API.';
  els.refresh.disabled = true;
} else {
  loadSnapshot();
}
