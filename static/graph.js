/*
 * Graph view behaviour.
 *
 * The only client script in AGORA. It draws the graph the server computed, and it
 * computes nothing of its own: filtering hides elements, it never recounts them, so what
 * the canvas shows and what the JSON says can never drift apart.
 *
 * Evidence for a selection is fetched from the server rather than embedded, so the page
 * stays small on a run with many claims and the inspector always reads live records.
 */
(function () {
  'use strict';

  var dataEl = document.getElementById('gr-data');
  var canvas = document.getElementById('gr-canvas');
  if (!dataEl || !canvas || typeof cytoscape === 'undefined') return;

  var GRAPH = JSON.parse(dataEl.textContent);
  var runId = GRAPH.runId;

  var state = {
    mode: 'interaction',
    kinds: { agent: true, moderator: true, topic: true, concept: false, claim: false },
    relations: { public_message: true, private_message: true },
    phase: '',
    agent: '',
    upTo: GRAPH.maxSequence,
    query: '',
    focus: null,
    frozen: false,
    playing: false,
  };

  /* Derived relations are shown whenever the Ideas layer is on; they are not separately
     toggleable, because a topic with its edges hidden is a node with no meaning. */
  var DERIVED_RELATIONS = ['discussed', 'introduced', 'referenced', 'expressed', 'belongs_to'];

  var RELATION_LABEL = {
    public_message: 'public message',
    private_message: 'private message',
    discussed: 'discussed',
    introduced: 'first raised',
    referenced: 'referred to',
    expressed: 'expressed',
    belongs_to: 'belongs to',
  };

  // ------------------------------------------------------------------ elements

  function elements() {
    var nodes = GRAPH.nodes.map(function (n) {
      return {
        data: {
          id: n.id,
          label: n.label,
          kind: n.kind,
          layer: n.layer,
          firstSequence: n.firstSequence,
          phases: n.phases,
          facts: n.facts,
          parentId: n.parentId || null,
          reviewState: n.reviewState || null,
        },
      };
    });
    var edges = GRAPH.edges.map(function (e) {
      return {
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          relation: e.relation,
          layer: e.layer,
          weight: e.weight,
          firstSequence: e.firstSequence,
          phases: e.phases,
          messageIds: e.messageIds,
        },
      };
    });
    return { nodes: nodes, edges: edges };
  }

  var cy = cytoscape({
    container: canvas,
    elements: elements(),
    /* A handful of participants would otherwise be fitted to fill the canvas, blowing
       the nodes and their labels up to the size of the picture. */
    maxZoom: 1.4,
    minZoom: 0.12,
    /* The wheel scrolls the page. Zooming a graph that is already laid out to fit gains
       nothing and costs the reader the scroll they were expecting. Fit and Re-lay out
       still set the zoom; a person just cannot do it by accident. */
    userZoomingEnabled: false,
    style: [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          'font-family': 'ui-sans-serif, system-ui, sans-serif',
          'font-size': '11px',
          color: '#14181f',
          'text-valign': 'bottom',
          'text-margin-y': 5,
          'text-wrap': 'ellipsis',
          'text-max-width': '110px',
          'border-width': 2,
          /* Labels sit over edges, so they get a plate to stay legible. */
          'text-background-color': '#ffffff',
          'text-background-opacity': 0.85,
          'text-background-padding': '2px',
          'text-background-shape': 'roundrectangle',
        },
      },
      /* Recorded entities are filled and solid. */
      {
        selector: 'node[kind = "agent"]',
        style: { shape: 'ellipse', width: 26, height: 26, 'background-color': '#2f5fe0', 'border-color': '#2f5fe0' },
      },
      {
        selector: 'node[kind = "moderator"]',
        style: { shape: 'ellipse', width: 32, height: 32, 'background-color': '#14181f', 'border-color': '#14181f', 'font-weight': 'bold' },
      },
      /* Derived entities are hollow and dashed, and shaped differently again so the
         distinction never rests on colour alone. */
      {
        selector: 'node[layer = "derived"]',
        style: { 'background-color': '#ffffff', 'border-style': 'dashed', 'font-style': 'italic' },
      },
      {
        selector: 'node[kind = "topic"]',
        style: { shape: 'round-rectangle', width: 34, height: 22, 'border-color': '#8a5a00' },
      },
      {
        selector: 'node[kind = "concept"]',
        style: { shape: 'diamond', width: 24, height: 24, 'border-color': '#1f7a4d' },
      },
      {
        selector: 'node[kind = "claim"]',
        style: { shape: 'rectangle', width: 20, height: 14, 'border-color': '#5d6673', 'font-size': '10px' },
      },
      {
        selector: 'edge',
        style: {
          'curve-style': 'bezier',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.7,
          width: 'mapData(weight, 1, 12, 1, 5)',
          'line-color': '#c3ccd8',
          'target-arrow-color': '#c3ccd8',
        },
      },
      {
        selector: 'edge[relation = "public_message"]',
        style: { 'line-color': '#9db4ee', 'target-arrow-color': '#9db4ee' },
      },
      {
        selector: 'edge[relation = "private_message"]',
        style: { 'line-style': 'dashed', 'line-color': '#d3a54a', 'target-arrow-color': '#d3a54a' },
      },
      {
        selector: 'edge[layer = "derived"]',
        style: { 'line-style': 'dotted', 'line-color': '#9aa4b2', 'target-arrow-color': '#9aa4b2', width: 1.5 },
      },
      { selector: '.hidden', style: { display: 'none' } },
      { selector: '.faded', style: { opacity: 0.12 } },
      {
        selector: 'node:selected',
        style: { 'border-width': 4, 'border-color': '#c7361f' },
      },
      { selector: 'edge:selected', style: { 'line-color': '#c7361f', 'target-arrow-color': '#c7361f', width: 4 } },
      { selector: '.match', style: { 'border-width': 4, 'border-color': '#1f7a4d' } },
    ],
    layout: { name: 'preset' },
  });

  /* Layout is chosen for what is on the canvas, not one algorithm for everything.
     Both settle immediately: a canvas that keeps drifting is one nobody can read.

     Interaction is a handful of participants who nearly all talk to each other. A
     force-directed layout pulls that into an unreadable knot, and its arrangement would
     carry no information anyway, so a ring is used: every participant is visible, and
     two runs of one configuration lay out the same way and can be compared by eye.

     Ideas has a hierarchy worth showing, so it is drawn in rings by kind, with topics at
     the centre and the participants who raised them around the outside. */
  /* Positions are computed over everything the current mode can show, not over what is
     currently visible. Filtering and scrubbing then only hide and reveal, so a node
     appears where it belongs instead of at a stale position, and the picture holds
     still while a researcher moves through time. */
  function layoutScope() {
    var kinds = state.mode === 'ideas'
      ? ['agent', 'moderator', 'topic', 'concept', 'claim']
      : ['agent', 'moderator'];
    return cy.nodes().filter(function (n) { return kinds.indexOf(n.data('kind')) !== -1; });
  }

  function runLayout() {
    if (state.frozen) return;
    var scope = layoutScope();
    if (scope.length === 0) return;
    var visible = scope.union(scope.connectedEdges());

    /* Sized to the canvas rather than to the node count: a ring of six laid out at its
       natural radius is a thumbnail in the corner, and the zoom cap that keeps a large
       graph readable also stops it being enlarged afterwards. */
    var box = canvas.getBoundingClientRect();
    var radius = Math.max(90, Math.min(box.width, box.height) / 2 - 70);

    var options =
      state.mode === 'ideas'
        ? {
            name: 'concentric',
            animate: false,
            padding: 40,
            minNodeSpacing: Math.max(26, radius / 6),
            avoidOverlap: true,
            concentric: function (node) {
              var kind = node.data('kind');
              if (kind === 'topic') return 4;
              if (kind === 'concept') return 3;
              if (kind === 'claim') return 2;
              return 1;
            },
            levelWidth: function () { return 1; },
          }
        : {
            name: 'circle',
            animate: false,
            padding: 40,
            avoidOverlap: true,
            radius: radius,
          };

    visible.layout(options).run();
    fitToVisible();
  }

  function fitToVisible() {
    var shown = cy.nodes().not('.hidden');
    if (shown.length > 0) cy.fit(shown, 50);
  }

  // ------------------------------------------------------------------- filters

  function visibleKinds() {
    var kinds = {};
    Object.keys(state.kinds).forEach(function (k) {
      var derived = k === 'topic' || k === 'concept' || k === 'claim';
      kinds[k] = state.kinds[k] && (state.mode === 'ideas' || !derived);
    });
    return kinds;
  }

  function apply() {
    var kinds = visibleKinds();
    cy.batch(function () {
      cy.nodes().forEach(function (n) {
        var d = n.data();
        var show = kinds[d.kind];
        if (show && d.firstSequence > state.upTo) show = false;
        if (show && state.phase && d.phases && d.phases.length && d.phases.indexOf(state.phase) === -1) show = false;
        if (show && state.agent && (d.kind === 'agent' || d.kind === 'moderator') && d.id !== state.agent) show = false;
        n.toggleClass('hidden', !show);
      });

      cy.edges().forEach(function (e) {
        var d = e.data();
        var show;
        if (d.layer === 'derived') {
          show = state.mode === 'ideas' && DERIVED_RELATIONS.indexOf(d.relation) !== -1;
        } else {
          show = !!state.relations[d.relation];
        }
        if (show && d.firstSequence > state.upTo) show = false;
        if (show && state.phase && d.phases && d.phases.length && d.phases.indexOf(state.phase) === -1) show = false;
        if (show) {
          show = !e.source().hasClass('hidden') && !e.target().hasClass('hidden');
        }
        e.toggleClass('hidden', !show);
      });

      /* A derived node with nothing attached is noise. Participants always stay: an
         agent that said nothing is a fact about the run, not an absence of data. */
      cy.nodes('[layer = "derived"]').forEach(function (n) {
        if (n.hasClass('hidden')) return;
        var live = n.connectedEdges().filter(function (e) { return !e.hasClass('hidden'); });
        if (live.length === 0) n.addClass('hidden');
      });

      applyFocus();
      applySearch();
    });
  }

  function applyFocus() {
    cy.elements().removeClass('faded');
    if (!state.focus) return;
    var node = cy.getElementById(state.focus);
    if (!node || node.length === 0) return;
    var keep = node.closedNeighborhood();
    cy.elements().not(keep).not('.hidden').addClass('faded');
  }

  function applySearch() {
    cy.elements().removeClass('match');
    if (!state.query) return;
    var q = state.query.toLowerCase();
    cy.nodes().forEach(function (n) {
      if (n.hasClass('hidden')) return;
      if (String(n.data('label')).toLowerCase().indexOf(q) !== -1) n.addClass('match');
    });
  }

  // ----------------------------------------------------------------- inspector

  var panel = document.getElementById('gr-inspector');

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function factsList(facts) {
    return Object.keys(facts)
      .map(function (key) {
        return (
          '<div><dt>' +
          escapeHtml(key.replace(/_/g, ' ')) +
          '</dt><dd>' +
          escapeHtml(facts[key]) +
          '</dd></div>'
        );
      })
      .join('');
  }

  function asPanel() {
    if (panel) panel.classList.remove('empty-state');
  }

  function asHint(text) {
    if (!panel) return;
    panel.classList.add('empty-state');
    panel.innerHTML = '<p class="gr-placeholder">' + escapeHtml(text) + '</p>';
  }

  function showNode(node) {
    asPanel();
    var d = node.data();
    var derived = d.layer === 'derived';
    var html =
      '<span class="gr-badge ' + d.layer + '">' +
      (derived ? 'derived from text' : 'recorded') +
      '</span>' +
      '<h3>' + escapeHtml(d.label) + '</h3>' +
      '<dl class="gr-facts">' + factsList(d.facts) + '</dl>';

    if (!derived) {
      html +=
        '<p class="ins-actions">' +
        '<a class="btn-sm" href="/runs/' + runId + '/agents/' + encodeURIComponent(d.id) + '">Trajectory</a>' +
        '<a class="btn-sm" href="/runs/' + runId + '/timeline?agents=' + encodeURIComponent(d.id) + '">Timeline</a>' +
        '</p>';
      panel.innerHTML = html;
      return;
    }

    html +=
      '<p class="gr-placeholder" id="gr-ev-loading">Loading the messages this was derived from…</p>';
    panel.innerHTML = html;
    loadEvidence(d.id);
  }

  function loadEvidence(nodeId) {
    fetch('/api/runs/' + encodeURIComponent(runId) + '/semantic/' + encodeURIComponent(nodeId))
      .then(function (r) { return r.json(); })
      .then(function (payload) {
        var loading = document.getElementById('gr-ev-loading');
        if (!loading) return;
        var items = payload.evidence || [];
        if (items.length === 0) {
          loading.textContent = 'No source messages recorded. That is a defect, not a finding.';
          return;
        }
        loading.outerHTML =
          '<h4 class="gr-ev-head">Derived from ' + items.length + ' message' +
          (items.length === 1 ? '' : 's') + '</h4>' +
          '<ul class="gr-evidence">' +
          items
            .map(function (ev) {
              return (
                '<li><div class="mono">#' + ev.sequence + ' · ' + escapeHtml(ev.agent_id) + '</div>' +
                (ev.quote ? '<div>' + escapeHtml(ev.quote) + '</div>' : '') +
                '<a class="btn-sm" href="/runs/' + runId + '?message=' + encodeURIComponent(ev.message_id) + '&infra=1#inspector">Open the message</a>' +
                (ev.invocation_id
                  ? ' <a class="btn-sm" href="/runs/' + runId + '/invocations/' + encodeURIComponent(ev.invocation_id) + '">Exact context</a>'
                  : '') +
                '</li>'
              );
            })
            .join('') +
          '</ul>';
      })
      .catch(function () {
        var loading = document.getElementById('gr-ev-loading');
        if (loading) loading.textContent = 'Could not load the source messages.';
      });
  }

  function showEdge(edge) {
    asPanel();
    var d = edge.data();
    var derived = d.layer === 'derived';
    var html =
      '<span class="gr-badge ' + d.layer + '">' +
      (derived ? 'derived from text' : 'recorded') +
      '</span>' +
      '<h3>' + escapeHtml(edge.source().data('label')) + ' → ' + escapeHtml(edge.target().data('label')) + '</h3>' +
      '<dl class="gr-facts">' +
      '<div><dt>relation</dt><dd>' + escapeHtml(RELATION_LABEL[d.relation] || d.relation) + '</dd></div>' +
      '<div><dt>count</dt><dd>' + d.weight + '</dd></div>' +
      (d.phases && d.phases.length
        ? '<div><dt>phases</dt><dd>' + escapeHtml(d.phases.join(', ')) + '</dd></div>'
        : '') +
      '<div><dt>first at sequence</dt><dd>' + d.firstSequence + '</dd></div>' +
      '</dl>';

    if (!derived) {
      html +=
        '<p class="gr-placeholder">' + d.messageIds.length + ' message' +
        (d.messageIds.length === 1 ? '' : 's') +
        ' behind this. This edge records that messages were sent and delivered. It is not a measure of influence.</p>' +
        '<p class="ins-actions"><a class="btn-sm" href="/runs/' + runId + '/structure?pair=' +
        encodeURIComponent(edge.source().data('id')) + '%3E' + encodeURIComponent(edge.target().data('id')) +
        '#pair">Read these messages</a></p>';
    } else {
      html += '<p class="gr-placeholder">A derived association. Select the node at either end to see the messages behind it.</p>';
    }
    panel.innerHTML = html;
  }

  cy.on('tap', 'node', function (evt) { showNode(evt.target); });
  cy.on('tap', 'edge', function (evt) { showEdge(evt.target); });
  cy.on('tap', function (evt) {
    if (evt.target === cy) {
      asHint('Select a node or an edge to see what it was derived from.');
    }
  });
  cy.on('dbltap', 'node', function (evt) {
    state.focus = state.focus === evt.target.id() ? null : evt.target.id();
    apply();
  });

  // ------------------------------------------------------------------ controls

  function bindToggles(containerId, attribute, onToggle) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener('click', function (e) {
      var button = e.target.closest('[data-' + attribute + ']');
      if (!button) return;
      onToggle(button.getAttribute('data-' + attribute), button, container);
      apply();
      fitToVisible();
    });
  }

  bindToggles('gr-kinds', 'kind', function (kind, button) {
    state.kinds[kind] = !state.kinds[kind];
    button.classList.toggle('on', state.kinds[kind]);
    button.setAttribute('aria-pressed', String(state.kinds[kind]));
  });

  bindToggles('gr-relations', 'relation', function (relation, button) {
    state.relations[relation] = !state.relations[relation];
    button.classList.toggle('on', state.relations[relation]);
    button.setAttribute('aria-pressed', String(state.relations[relation]));
  });

  bindToggles('gr-phases', 'phase', function (phase, button, container) {
    state.phase = phase;
    Array.prototype.forEach.call(container.querySelectorAll('.chip'), function (c) {
      c.classList.toggle('on', c === button);
    });
  });

  bindToggles('gr-agents', 'agent', function (agent, button, container) {
    state.agent = agent;
    Array.prototype.forEach.call(container.querySelectorAll('.chip'), function (c) {
      c.classList.toggle('on', c === button);
    });
  });

  var modeNote = document.getElementById('gr-mode-note');
  Array.prototype.forEach.call(document.querySelectorAll('.gr-mode'), function (button) {
    button.addEventListener('click', function () {
      if (button.disabled) return;
      state.mode = button.getAttribute('data-mode');
      Array.prototype.forEach.call(document.querySelectorAll('.gr-mode'), function (b) {
        var on = b === button;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', String(on));
      });
      if (modeNote) {
        modeNote.textContent =
          state.mode === 'ideas'
            ? 'Outlined, dashed elements are read out of the transcript afterwards. They are an analysis, not part of the record.'
            : 'Only recorded communication. No text was interpreted to produce this.';
      }
      apply();
      runLayout();
    });
  });

  var search = document.getElementById('gr-q');
  if (search) {
    search.addEventListener('input', function () {
      state.query = search.value.trim();
      applySearch();
      if (state.query) {
        var matched = cy.nodes('.match').not('.hidden');
        if (matched.length > 0) {
          cy.animate({ fit: { eles: matched, padding: 80 }, duration: 200 });
          if (matched.length === 1) showNode(matched[0]);
        }
      }
    });
  }

  document.getElementById('gr-fit').addEventListener('click', function () {
    cy.fit(cy.elements().not('.hidden'), 40);
  });
  document.getElementById('gr-relayout').addEventListener('click', function () {
    state.frozen = false;
    document.getElementById('gr-freeze').classList.remove('on');
    runLayout();
  });
  document.getElementById('gr-freeze').addEventListener('click', function () {
    state.frozen = !state.frozen;
    this.classList.toggle('on', state.frozen);
  });
  document.getElementById('gr-clear').addEventListener('click', function () {
    state.focus = null;
    state.query = '';
    if (search) search.value = '';
    cy.elements().unselect();
    apply();
  });

  // ---------------------------------------------------------------- time control

  var scrub = document.getElementById('gr-scrub');
  var readout = document.getElementById('gr-time-read');
  var playButton = document.getElementById('gr-play');
  var timer = null;

  function phaseAt(sequence) {
    for (var i = GRAPH.phases.length - 1; i >= 0; i -= 1) {
      var p = GRAPH.phases[i];
      if (sequence >= p.fromSequence) return p.label;
    }
    return '';
  }

  function setTime(value) {
    state.upTo = Number(value);
    scrub.value = String(state.upTo);
    readout.textContent =
      state.upTo >= GRAPH.maxSequence
        ? 'whole run'
        : '#' + state.upTo + ' · ' + phaseAt(state.upTo);
    apply();
  }

  scrub.addEventListener('input', function () { setTime(scrub.value); });

  /* Steps land on positions where something was actually recorded, so Forward always
     changes the picture rather than stepping through empty sequence numbers. */
  var stops = (function () {
    var set = {};
    GRAPH.nodes.forEach(function (n) { if (n.firstSequence > 0) set[n.firstSequence] = true; });
    GRAPH.edges.forEach(function (e) { if (e.firstSequence > 0) set[e.firstSequence] = true; });
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  })();

  function step(direction) {
    var current = state.upTo;
    var next = null;
    if (direction > 0) {
      for (var i = 0; i < stops.length; i += 1) {
        if (stops[i] > current) { next = stops[i]; break; }
      }
      if (next === null) next = GRAPH.maxSequence;
    } else {
      for (var j = stops.length - 1; j >= 0; j -= 1) {
        if (stops[j] < current) { next = stops[j]; break; }
      }
      if (next === null) next = GRAPH.minSequence;
    }
    setTime(next);
  }

  document.getElementById('gr-next').addEventListener('click', function () { stop(); step(1); });
  document.getElementById('gr-prev').addEventListener('click', function () { stop(); step(-1); });

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    state.playing = false;
    playButton.classList.add('paused');
    playButton.setAttribute('aria-label', 'Play the run through');
    playButton.setAttribute('title', 'Play the run through');
  }

  function play() {
    if (state.playing) return;
    state.playing = true;
    playButton.classList.remove('paused');
    playButton.setAttribute('aria-label', 'Pause');
    playButton.setAttribute('title', 'Pause');
    if (state.upTo >= GRAPH.maxSequence) setTime(GRAPH.minSequence);
    timer = setInterval(function () {
      if (state.upTo >= GRAPH.maxSequence) { stop(); return; }
      step(1);
    }, 550);
  }

  playButton.addEventListener('click', function () {
    if (state.playing) { stop(); return; }
    play();
  });

  // ------------------------------------------------------------------- start

  apply();
  runLayout();

  /* The run plays through on arrival, so the first thing a reader sees is the workshop
     accumulating rather than a finished picture. Anyone who would rather not watch it
     can pause, and a reader who prefers no motion at all is left at the end state. */
  var prefersStill =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersStill) {
    stop();
    setTime(GRAPH.maxSequence);
  } else {
    setTime(GRAPH.minSequence);
    play();
  }
})();
