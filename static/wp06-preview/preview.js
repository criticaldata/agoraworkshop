/* Read-only client. Treat every uploaded string as text, never HTML. */
import { PathwayView } from './pathway.js';

const $ = id => document.getElementById(id);
let current = null;
let busy = false;
const names = { T0: 'T0 · baseline', PUBLIC: 'Public discussion', T6: 'T6 · after discussion', REPORT: 'Report production', TR: 'TR · after report', public_dissent: 'Public dissent', report_retention: 'Report retention', dissent_preservation: 'Dissent preservation' };
const human = value => String(value).toLowerCase().replaceAll('_', ' ');
const percent = value => value === null ? 'Unavailable' : `${(value * 100).toFixed(1)}%`;
const decimal = value => value === null ? 'Unavailable' : value.toFixed(3);
const pathway = new PathwayView({ inspectEvidence: inspect, clearEvidence: resetInspector });

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function table(headers, rows) {
  const result = element('table'), head = element('thead'), body = element('tbody'), heading = element('tr');
  for (const header of headers) { const th = element('th', header); th.scope = 'col'; heading.append(th); }
  head.append(heading);
  for (const cells of rows) {
    const tr = element('tr');
    for (const cell of cells) { const td = element('td'); td.append(cell instanceof Node ? cell : document.createTextNode(String(cell))); tr.append(td); }
    body.append(tr);
  }
  result.append(head, body); return result;
}
function sourceLink(id, label = 'View source', span) {
  if (!current.evidence.some(a => a.artifact_id === id)) return element('span', 'Source withheld', 'muted');
  const button = element('button', label, 'source-link'); button.type = 'button';
  button.addEventListener('click', () => inspect(id, span)); return button;
}
function inspect(id, span) {
  const artifact = current.evidence.find(a => a.artifact_id === id);
  if (!artifact) return;
  pathway.selectEvidence(id);
  $('inspector-heading').textContent = human(artifact.kind.replaceAll('.', ' '));
  $('evidence-meta').textContent = `${id}${span ? ` · UTF-16 span ${span.start}–${span.end}` : ''}`;
  $('evidence-text').replaceChildren();
  if (span) {
    $('evidence-text').append(document.createTextNode(artifact.content.slice(0, span.start)),
      element('mark', artifact.content.slice(span.start, span.end)), document.createTextNode(artifact.content.slice(span.end)));
  } else $('evidence-text').textContent = artifact.content;
  $('evidence-hash').textContent = artifact.content_hash;
  $('inspector').scrollIntoView({ block: 'nearest' });
  $('inspector').focus({ preventScroll: true });
}
function resetInspector() {
  $('inspector-heading').textContent = 'Source evidence';
  $('evidence-meta').textContent = 'Select an eligible public turn or final report.';
  $('evidence-text').replaceChildren(); $('evidence-hash').textContent = '';
}
function discard() {
  current = null; $('analysis').hidden = true; $('download').disabled = true;
  pathway.clear();
  for (const id of ['cards', 'coverage', 'measures', 'reliability', 'agreement-content', 'opportunities', 'judgments', 'provenance']) $(id).replaceChildren();
  resetInspector(); $('empty').hidden = false;
}
async function load(action, message) {
  if (busy) return;
  busy = true; discard(); $('empty').hidden = true; $('error').hidden = true; $('status').textContent = message;
  $('results').setAttribute('aria-busy', 'true');
  document.querySelectorAll('button, input, select').forEach(node => { node.disabled = true; });
  try {
    const response = await action();
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The analysis request failed.');
    current = data; render();
    $('status').textContent = data.input_kind === 'synthetic' ? 'Synthetic example loaded. All content and coder labels are scripted.' : 'Uploaded files verified and analyzed by this AGORA server. Inspect provenance before interpreting results.';
  } catch (error) {
    discard(); $('error').textContent = error.message || 'Unable to load this input.'; $('error').hidden = false;
    $('status').textContent = 'No results available. Correct the input or load an example.';
  } finally {
    busy = false; $('results').removeAttribute('aria-busy');
    document.querySelectorAll('button, input, select').forEach(node => { node.disabled = false; });
    $('download').disabled = current === null;
    pathway.refreshControls();
  }
}
function render() {
  const { run, report, records } = current;
  $('analysis').hidden = false; $('empty').hidden = true; $('filter').value = 'all';
  $('source').textContent = current.input_kind === 'synthetic' ? 'SYNTHETIC EXAMPLE' : 'UPLOADED EVIDENCE';
  $('run-title').textContent = `Condition ${run.condition} · Replicate ${run.replication}`;
  $('run-subtitle').textContent = `Admission: ${run.source.admissionClass} · ${human(run.evidence_completeness)} opportunity coverage · analysis unit: one run`;
  $('run-state').textContent = run.state;
  pathway.setData(current);
  const totals = run.totals;
  const cards = [
    ['Committed / planned', `${totals.committed} / ${totals.planned}`, `${totals.not_attempted} never attempted · ${totals.pending} pending`],
    ['Committed response rate', percent(totals.response_rate.value), `${totals.response_rate.numerator} successes / ${totals.response_rate.denominator} committed behavioral outcomes`],
    ['Recorded attempts', totals.attempts, `${totals.technical_attempts} technical attempts · ${totals.pending_attempts} in flight`],
    ['Uncommitted opportunities', totals.planned - totals.committed, `${totals.technical_failures} terminal technical failures · ${totals.uncommitted_responses} delivered but uncommitted`],
  ];
  for (const [title, value, detail] of cards) { const card = element('article', undefined, 'card'); card.append(element('h4', title), element('strong', value), element('p', detail)); $('cards').append(card); }
  $('coverage').append(table(['Stage', 'Planned', 'Committed', 'Unattempted', 'Pending', 'Technical failures', 'Response rate'],
    Object.entries(run.by_stage).map(([stage, s]) => [names[stage], s.planned, s.committed, s.not_attempted, s.pending, s.technical_failures, percent(s.response_rate.value)])));
  $('annotation-status').textContent = report ? `Inventory: ${human(report.inventory_status)} · ${report.proposition_count} propositions · ${records.coder_ids.length} declared coders. Completeness and independence are human attestations.`
    : 'No annotation file loaded. Report measures and coder agreement are unavailable; delivery counts do not supply semantic labels.';
  for (const key of ['report_retention', 'dissent_preservation']) {
    const metric = report?.[key], card = element('article', undefined, 'measure');
    card.append(element('h4', names[key]), element('strong', metric ? percent(metric.value) : 'Unavailable'));
    card.append(element('p', metric ? `${metric.numerator} / ${metric.denominator} · ${metric.availability}` : 'Requires validated independent annotations.'));
    card.append(element('p', key === 'report_retention' ? 'FULL + PARTIAL / all registered public propositions.' : 'Preserved dissent / propositions with outstanding public dissent.'));
    if (metric?.reasons.length) card.append(element('p', metric.reasons.map(human).join(' · '), 'reasons'));
    if (key === 'report_retention' && metric) card.append(element('p', Object.entries(metric.counts).map(([label, count]) => `${label}: ${count}`).join(' · ')));
    $('measures').append(card);
  }
  $('agreement-details').hidden = !report;
  if (report) {
    $('reliability').append(table(['Original ratings', 'Nominal alpha', 'Pair agreement', 'Pairable items', 'Missing ratings', 'Not assessable'], Object.entries(report.reliability).map(([key, r]) => [names[key], decimal(r.krippendorff_alpha), percent(r.observed_agreement), `${r.pairable_items} / ${r.planned_items}`, r.missing_ratings, r.not_assessable_ratings])));
    for (const [key, r] of Object.entries(report.reliability)) {
      $('agreement-content').append(element('h4', names[key]), element('p', r.alpha_unavailable_reason ? `Alpha unavailable: ${human(r.alpha_unavailable_reason)}.` : 'Alpha uses original assessable ratings. Adjudication does not alter agreement.'));
      $('agreement-content').append(element('p', `Pairable label counts: ${Object.entries(r.label_counts).map(([label, count]) => `${label}: ${count}`).join(' · ') || 'none'}`));
      $('agreement-content').append(table(['Coder pair', 'Items', 'Agreement', 'Label pairs [left, right]'], r.pairwise.map(p => [p.coder_ids.join(' / '), p.assessable_items, percent(p.observed_agreement), JSON.stringify(p.confusion_matrix)])));
    }
  }
  renderOpportunities(); renderJudgments();
  const metadata = { 'Run ID': run.run_id, 'Manifest hash': run.manifest_hash, 'Evidence hash': run.evidence_hash,
    'Campaign hash': run.source.campaignHash, 'Admission class': run.source.admissionClass,
    'Analysis version': run.algorithm_version, 'Annotation hash': report?.annotation_hash ?? 'No annotations',
    'Codebook hash': report?.codebook_hash ?? 'No annotations', 'Scientific status': run.scientific_status };
  for (const [key, value] of Object.entries(metadata)) { const row = element('div', undefined, 'provenance-row'); row.append(element('span', key), element('span', value)); $('provenance').append(row); }
  for (const [key, usage] of Object.entries(run.usage)) $('provenance').append(element('p', `${human(key)}: total ${usage.total ?? 'unavailable'}; known subtotal ${usage.known_total}; missing usage in ${usage.missing_calls} / ${usage.recorded_calls} recorded calls.`));
  const limits = element('ul'); for (const limit of [...run.limitations, ...(report?.limitations ?? [])]) limits.append(element('li', limit)); $('provenance').append(limits);
}
function renderOpportunities() {
  const filter = $('filter').value;
  const rows = current.run.opportunities.filter(row => filter === 'all' || (filter === 'incomplete' ? row.status !== 'committed' : row.stage === filter));
  $('opportunities').replaceChildren(table(['Opportunity', 'Status / last outcome', 'Attempts', 'Evidence'], rows.map(row => [row.opportunity_id,
    `${human(row.status)} / ${row.outcome ? human(row.outcome) : 'no outcome'}`, `${row.attempts}${row.pending_attempts ? ` + ${row.pending_attempts} pending` : ''}`,
    row.output_artifact_id && current.evidence.some(a => a.artifact_id === row.output_artifact_id) ? sourceLink(row.output_artifact_id) : 'Not available here'])));
  if (!rows.length) $('opportunities').append(element('p', 'No opportunities match this filter.', 'muted'));
}
function renderJudgments() {
  const { records, report } = current;
  if (!records) { $('judgments').append(element('p', 'Load an annotation file to inspect human judgments.', 'muted')); return; }
  if (!records.propositions.length) { $('judgments').append(element('p', 'The proposition inventory is empty. No absence finding is inferred.', 'muted')); return; }
  for (const item of report.items) {
    const proposition = records.propositions.find(p => p.proposition_id === item.proposition_id);
    const details = element('details');
    details.append(element('summary', `${item.proposition_id} · ${names[item.construct]} · ${item.label || item.status}`), element('p', proposition.summary),
      element('p', `Resolution: ${item.resolution ? human(item.resolution) : 'unresolved'} · Missing coders: ${item.missing_coder_ids.join(', ') || 'none'}`),
      sourceLink(proposition.origin.artifact_id, 'Inspect proposition origin', proposition.origin));
    const judgments = [...records.ratings.filter(r => r.proposition_id === item.proposition_id && r.construct === item.construct), ...records.adjudications.filter(r => r.proposition_id === item.proposition_id && r.construct === item.construct)];
    for (const record of judgments) {
      const block = element('div', undefined, 'rating');
      block.append(element('h4', `${record.coder_id || `Adjudicator: ${record.adjudicator_id}`} · ${record.label}`), element('p', record.rationale), element('p', `Reviewed artifacts: ${record.reviewed_artifact_ids.length}`));
      if (record.annotation_ids) block.append(element('p', `Original annotations: ${record.annotation_ids.join(', ')}`));
      record.evidence.forEach((span, i) => block.append(sourceLink(span.artifact_id, `Inspect quote ${i + 1}`, span)));
      const reviewed = element('details'); reviewed.append(element('summary', 'Reviewed sources'));
      record.reviewed_artifact_ids.forEach(id => { const p = element('p'); p.append(sourceLink(id, id)); reviewed.append(p); });
      block.append(reviewed); details.append(block);
    }
    $('judgments').append(details);
  }
}
$('demo').addEventListener('click', () => load(() => fetch(`./api/demo/${encodeURIComponent($('scenario').value)}`, { cache: 'no-store' }), 'Loading a synthetic example…'));
$('upload').addEventListener('submit', event => {
  event.preventDefault();
  load(async () => {
    const bundle = $('bundle').files[0], annotations = $('annotations').files[0];
    if (!bundle) throw new Error('Choose an evidence bundle first.');
    if (bundle.size + (annotations?.size ?? 0) > 10 * 1024 * 1024) throw new Error('Combined files exceed 10 MiB.');
    const body = JSON.stringify({ bundle: JSON.parse(await bundle.text()), ...(annotations ? { annotations: JSON.parse(await annotations.text()) } : {}) });
    return fetch('./api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  }, 'Verifying evidence and annotations…');
});
$('filter').addEventListener('change', renderOpportunities);
$('clear').addEventListener('click', () => { discard(); $('upload').reset(); $('error').hidden = true; $('error').textContent = ''; $('status').textContent = 'Loaded data cleared from the page.'; });
$('download').addEventListener('click', () => {
  if (!current) return;
  // Export the actual analyzer results only, not source bodies or annotation quotes.
  const output = { schema_version: 'wp06-preview-export-v1', input_kind: current.input_kind, run: current.run, report: current.report };
  const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' }));
  const anchor = element('a'); anchor.href = url; anchor.download = 'wp06-analysis.json'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
load(() => fetch('./api/demo/complete', { cache: 'no-store' }), 'Loading a synthetic example…');
