const NS = 'http://www.w3.org/2000/svg';
const STATUS = {
  committed: 'Committed', pending: 'Pending', partial: 'Partial',
  technical_failure: 'Technical failure', uncommitted_response: 'Uncommitted response', not_attempted: 'Not attempted',
};
const TITLES = { T0: 'T0 · Private baseline', PUBLIC: 'Public discussion', T6: 'T6 · Private checkpoint',
  'report:draft': 'Report draft', 'report:review1': 'Review 1', 'report:review2': 'Review 2',
  'report:revised': 'Report revision', TR: 'TR · Private checkpoint' };

function html(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function svg(tag, attributes = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function aggregate(operations) {
  if (operations.every(op => op.status === 'committed')) return 'committed';
  for (const status of ['pending', 'technical_failure', 'uncommitted_response']) {
    if (operations.some(op => op.status === status)) return status;
  }
  return operations.some(op => op.status === 'committed') ? 'partial' : 'not_attempted';
}

/** Graph projection and interaction. Analyzer data is never modified by selection. */
export class PathwayView {
  constructor({ inspectEvidence, clearEvidence }) {
    this.inspectEvidence = inspectEvidence;
    this.clearEvidence = clearEvidence;
    this.mode = 'execution';
    this.expanded = false;
    this.data = null;
    this.diagram = document.getElementById('pathway-diagram');
    this.detail = document.getElementById('pathway-detail');
    this.executionButton = document.getElementById('execution-view');
    this.reportButton = document.getElementById('report-view');
    this.expandInput = document.getElementById('expand-rounds');
    this.uncommittedButton = document.getElementById('first-uncommitted');
    this.executionButton.addEventListener('click', () => this.setMode('execution'));
    this.reportButton.addEventListener('click', () => this.setMode('report'));
    this.expandInput.addEventListener('change', () => { this.expanded = this.expandInput.checked; this.render(); });
    this.uncommittedButton.addEventListener('click', () => {
      const next = this.data?.pathway.operations.find(op => op.status !== 'committed');
      if (!next) return;
      this.mode = 'execution'; this.selectedId = next.opportunity_id; this.clearEvidence(); this.render(); this.focusSelectedNode();
    });
    this.observedWidth = 0;
    this.resizeObserver = new ResizeObserver(() => {
      const width = this.diagram.clientWidth;
      if (width > 0 && width !== this.observedWidth) {
        this.observedWidth = width;
        if (this.data) this.render();
      }
    });
    this.resizeObserver.observe(this.diagram);
  }

  clear() {
    this.data = null; this.selectedId = null;
    this.diagram.replaceChildren(); this.detail.replaceChildren();
    this.nodes = []; this.edges = [];
  }

  setData(data) {
    this.data = data; this.mode = 'execution'; this.expanded = false; this.expandInput.checked = false;
    const operations = data.pathway.operations;
    this.selectedId = (operations.find(op => op.status !== 'committed') ?? operations.find(op => op.stage === 'PUBLIC') ?? operations[0]).opportunity_id;
    this.render();
  }

  setMode(mode) {
    if (!this.data) return;
    this.mode = mode; this.render(); this.clearEvidence();
  }

  refreshControls() {
    if (!this.data) return;
    this.executionButton.setAttribute('aria-pressed', String(this.mode === 'execution'));
    this.reportButton.setAttribute('aria-pressed', String(this.mode === 'report'));
    this.expandInput.disabled = this.mode !== 'execution';
    const complete = this.data.pathway.operations.every(op => op.status === 'committed');
    this.uncommittedButton.disabled = complete;
    this.uncommittedButton.textContent = complete ? 'All operations committed' : 'First uncommitted operation';
  }

  project() {
    const { operations, report_edges: reportEdges } = this.data.pathway;
    this.graphWidth = Math.max(320, Math.min(600, this.diagram.clientWidth));
    if (this.mode === 'report') {
      const width = Math.min(240, (this.graphWidth - 44) / 2);
      const center = (this.graphWidth - width) / 2;
      const positions = [[center, 22], [12, 166], [this.graphWidth - 12 - width, 166], [center, 326]];
      this.nodes = operations.filter(op => op.stage === 'REPORT').map((op, i) => ({
        id: op.opportunity_id, title: TITLES[op.opportunity_id], operations: [op],
        x: positions[i][0], y: positions[i][1], width, height: 70,
      }));
      this.edges = reportEdges;
      return;
    }
    const groups = new Map();
    for (const op of operations) {
      const key = op.stage === 'PUBLIC' && this.expanded ? `round-${op.round}` : op.stage === 'REPORT' ? op.opportunity_id : op.stage;
      if (!groups.has(key)) groups.set(key, { id: key, title: key.startsWith('round-') ? `Public round ${op.round}` : TITLES[key], operations: [] });
      groups.get(key).operations.push(op);
    }
    const width = Math.min(360, this.graphWidth - 80);
    this.nodes = [...groups.values()].map((group, i) => ({ ...group, x: (this.graphWidth - width) / 2, y: 22 + i * 92, width, height: 70 }));
    this.edges = this.nodes.slice(1).map((node, i) => ({ from: this.nodes[i].id, to: node.id, kind: 'scheduled_successor' }));
  }

  render() {
    if (!this.data) return;
    this.project(); this.refreshControls(); this.diagram.replaceChildren();
    const caption = document.getElementById('pathway-caption');
    const legend = document.getElementById('pathway-legend');
    caption.textContent = this.mode === 'execution'
      ? 'Scheduled order from WP03. A connector denotes the next scheduled stage, not information sharing.'
      : 'Report context dependencies from WP03. Reviews execute sequentially but each receives only the draft.';
    legend.textContent = this.mode === 'execution'
      ? 'Arrows: scheduled succession. Select a node for operation states and evidence.'
      : 'Solid arrows: input observed in a recorded call. Dashed arrows: required input not yet observed. Selection highlights incident dependencies.';
    document.getElementById('pathway-count').textContent = `${this.data.pathway.operations.length} planned operations · ${this.data.pathway.workflow_version}`;
    if (!this.nodes.length) {
      this.diagram.append(html('p', `No report pathway is assigned in condition ${this.data.run.condition}. Execution ends after T6.`, 'pathway-empty'));
      this.detail.replaceChildren(html('h4', 'No report operations'), html('p', 'This is a condition assignment, not missing evidence.'));
      return;
    }
    if (!this.nodes.some(node => node.operations.some(op => op.opportunity_id === this.selectedId))) this.selectedId = this.nodes[0].operations[0].opportunity_id;
    const height = this.mode === 'execution' ? this.nodes.at(-1).y + 92 : 424;
    const graph = svg('svg', { viewBox: `0 0 ${this.graphWidth} ${height}`, width: this.graphWidth, height, role: 'group', 'aria-label': this.mode === 'execution' ? 'Execution order nodes' : 'Report input dependencies' });
    const definitions = svg('defs');
    for (const name of ['neutral', 'selected']) {
      const marker = svg('marker', { id: `pathway-arrow-${name}`, markerWidth: 7, markerHeight: 7, refX: 6, refY: 3.5, orient: 'auto', markerUnits: 'userSpaceOnUse' });
      marker.append(svg('path', { d: 'M0 0 L7 3.5 L0 7 Z', class: `arrow-${name}` })); definitions.append(marker);
    }
    graph.append(definitions);
    for (const edge of this.edges) {
      const from = this.nodes.find(node => node.id === edge.from), to = this.nodes.find(node => node.id === edge.to);
      if (!from || !to) continue;
      const x1 = from.x + from.width / 2, y1 = from.y + from.height, x2 = to.x + to.width / 2, y2 = to.y;
      const directDraft = this.mode === 'report' && edge.from === 'report:draft' && edge.to === 'report:revised';
      const path = directDraft ? `M${from.x + from.width} ${from.y + 35} H${this.graphWidth - 4} V${to.y + 35} H${to.x + to.width}`
        : `M${x1} ${y1} V${(y1 + y2) / 2} H${x2} V${y2}`;
      const line = svg('path', { d: path, class: `pathway-edge${edge.observation === 'planned' ? ' planned' : ''}`, 'data-from': edge.from, 'data-to': edge.to, 'marker-end': 'url(#pathway-arrow-neutral)' });
      line.append(svg('title', {}, `${from.title} → ${to.title}: ${edge.observation ?? 'scheduled succession'}`)); graph.append(line);
    }
    this.nodes.forEach((node, index) => {
      const committed = node.operations.filter(op => op.status === 'committed').length;
      const state = aggregate(node.operations);
      const group = svg('g', { class: `pathway-node state-${state}`, role: 'button', tabindex: 0, 'data-node': node.id,
        'aria-label': `${node.title}: ${committed} of ${node.operations.length} committed; ${STATUS[state]}`, 'aria-pressed': 'false' });
      group.append(svg('rect', { x: node.x, y: node.y, width: node.width, height: node.height, rx: 2 }),
        svg('text', { x: node.x + 14, y: node.y + 23, class: 'node-title' }, node.title),
        svg('text', { x: node.x + 14, y: node.y + 43, class: 'node-count' }, `${committed} / ${node.operations.length} committed`),
        svg('text', { x: node.x + 10, y: node.y + 60, class: 'node-status' }, STATUS[state]));
      if (this.mode === 'execution') graph.append(svg('text', { x: node.x - 20, y: node.y + 26, 'text-anchor': 'end', class: 'node-number' }, String(index + 1).padStart(2, '0')));
      const select = () => this.selectOperation(node.operations.find(op => op.status !== 'committed') ?? node.operations[0]);
      group.addEventListener('click', select);
      group.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
        const moves = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
        if (event.key in moves || event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? this.nodes.length - 1 : Math.max(0, Math.min(this.nodes.length - 1, index + moves[event.key]));
          this.diagram.querySelectorAll('.pathway-node')[next].focus();
        }
      });
      graph.append(group);
    });
    this.diagram.append(graph); this.updateSelection(); this.renderDetails();
  }

  selectOperation(operation) {
    this.selectedId = operation.opportunity_id;
    this.clearEvidence(); this.updateSelection(); this.renderDetails();
  }

  selectEvidence(artifactId) {
    const operation = this.data?.pathway.operations.find(op => op.output_artifact_id === artifactId);
    if (!operation || operation.opportunity_id === this.selectedId) return;
    this.selectedId = operation.opportunity_id;
    if (this.mode === 'report' && operation.stage !== 'REPORT') {
      this.mode = 'execution'; this.render();
    } else { this.updateSelection(); this.renderDetails(); }
  }

  updateSelection() {
    const selected = this.nodes.find(node => node.operations.some(op => op.opportunity_id === this.selectedId));
    for (const node of this.diagram.querySelectorAll('.pathway-node')) {
      node.classList.toggle('selected', node.dataset.node === selected?.id);
      node.setAttribute('aria-pressed', String(node.dataset.node === selected?.id));
    }
    for (const line of this.diagram.querySelectorAll('.pathway-edge')) {
      const active = [line.dataset.from, line.dataset.to].includes(selected?.id);
      line.classList.toggle('selected', active);
      line.setAttribute('marker-end', `url(#pathway-arrow-${active ? 'selected' : 'neutral'})`);
    }
  }

  focusSelectedNode() {
    const node = this.diagram.querySelector('.pathway-node.selected');
    node?.focus();
  }

  renderDetails() {
    const node = this.nodes.find(n => n.operations.some(op => op.opportunity_id === this.selectedId));
    if (!node) return;
    const op = node.operations.find(item => item.opportunity_id === this.selectedId);
    this.detail.replaceChildren(html('h4', node.title));
    const list = html('div', undefined, 'operation-list');
    list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Stage operations');
    for (const item of node.operations) {
      const button = html('button', undefined, 'operation-choice'); button.type = 'button';
      button.setAttribute('aria-pressed', String(item.opportunity_id === this.selectedId));
      button.append(html('span', item.opportunity_id), html('span', STATUS[item.status]));
      button.addEventListener('click', () => {
        this.selectOperation(item);
        this.detail.querySelector('.operation-choice[aria-pressed="true"]')?.focus({ preventScroll: true });
      });
      list.append(button);
    }
    this.detail.append(list, html('h4', 'Operation record'));
    const fields = { 'Schedule position': String(op.sequence), Participant: op.participant_id,
      Status: STATUS[op.status], 'Last recorded outcome': op.outcome ?? 'No recorded outcome',
      'Planned target state': op.planned_state,
      'Recorded transition': op.recorded_transition ? `${op.recorded_transition.from ?? 'Unspecified'} → ${op.recorded_transition.to ?? 'Unspecified'}` : 'No committed transition',
      Visibility: op.visibility,
      'Terminal attempts': String(op.attempts), 'Technical attempts': String(op.technical_attempts), 'Pending attempts': String(op.pending_attempts) };
    const metadata = html('dl', undefined, 'operation-metadata');
    for (const [key, value] of Object.entries(fields)) metadata.append(html('dt', key), html('dd', value));
    this.detail.append(metadata);
    if (op.stage === 'T0') {
      const disclosure = this.data.pathway.report_disclosure;
      this.detail.append(html('p', disclosure.required ? `Report disclosure: ${disclosure.event_ids.length ? 'recorded' : 'not recorded'}. ${disclosure.boundary}` : 'No report disclosure is required in this condition.'));
    }
    if (this.mode === 'report') {
      const inputs = this.edges.filter(edge => edge.to === op.opportunity_id);
      this.detail.append(html('h4', 'Required report inputs'));
      if (!inputs.length) this.detail.append(html('p', 'The draft receives the public context. Private checkpoints and reviewer-only material are excluded.'));
      for (const edge of inputs) this.detail.append(html('p', `${TITLES[edge.from]} — ${edge.observation === 'observed' ? `observed in ${edge.observed_call_ids.length} recorded call(s)` : 'planned; not observed in a recorded call'}`));
    }
    if (this.data.evidence.some(a => a.artifact_id === op.output_artifact_id)) {
      const source = html('button', 'Inspect source evidence', 'source-link'); source.type = 'button';
      source.addEventListener('click', () => this.inspectEvidence(op.output_artifact_id)); this.detail.append(source);
    } else this.detail.append(html('p', op.output_artifact_id ? 'Source text is withheld for this visibility or outcome.' : 'No committed output artifact.', 'muted'));
    const refs = html('details'); refs.append(html('summary', 'Event and call references'));
    for (const id of [...op.source_event_ids, ...op.source_call_ids]) refs.append(html('code', id));
    this.detail.append(refs);
  }
}
