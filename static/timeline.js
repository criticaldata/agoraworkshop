/*
 * Opening a marker on the interaction timeline.
 *
 * The markers are ordinary links, and they stay ordinary links: with no script, or if
 * this fails, selecting one loads the page with that marker selected, which is what the
 * server already renders. That keeps every state of the view deep-linkable and citable.
 *
 * What this adds is only the feel. A full navigation reloads the page and jumps the
 * browser to the panel, which reads as arriving somewhere else rather than opening a
 * detail in place. Here the panel is swapped, the address bar is corrected, and the page
 * does not move.
 */
(function () {
  'use strict';

  var grid = document.querySelector('.ex-grid');
  var panel = document.getElementById('inspector');
  if (!grid || !panel || !window.fetch || !window.history || !history.replaceState) return;

  var pending = null;

  function markSelected(sequence) {
    var markers = grid.querySelectorAll('.ex-marker');
    for (var i = 0; i < markers.length; i += 1) {
      var mine = markers[i].getAttribute('data-event') === String(sequence);
      markers[i].classList.toggle('sel', mine);
    }
  }

  function open(link) {
    var sequence = link.getAttribute('data-event');
    if (!sequence) return false;

    var url = link.getAttribute('href').split('#')[0];
    // Abandon a slower earlier request so panels cannot arrive out of order.
    if (pending) pending.cancelled = true;
    var request = { cancelled: false };
    pending = request;

    panel.setAttribute('aria-busy', 'true');

    fetch(url + (url.indexOf('?') === -1 ? '?' : '&') + 'fragment=inspector', {
      headers: { Accept: 'text/html' },
    })
      .then(function (response) {
        if (!response.ok) throw new Error('inspector request failed');
        return response.text();
      })
      .then(function (html) {
        if (request.cancelled) return;
        panel.outerHTML = html;
        panel = document.getElementById('inspector');
        if (panel) panel.removeAttribute('aria-busy');
        markSelected(sequence);
        history.replaceState(null, '', url);
      })
      .catch(function () {
        if (request.cancelled) return;
        // Fall back to the link's own behaviour rather than leaving a stale panel.
        window.location.href = link.getAttribute('href');
      });

    return true;
  }

  grid.addEventListener('click', function (event) {
    // Leave modified clicks alone: opening in a new tab must keep working.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    var link = event.target.closest('.ex-marker');
    if (!link || !grid.contains(link)) return;
    if (open(link)) event.preventDefault();
  });
})();
