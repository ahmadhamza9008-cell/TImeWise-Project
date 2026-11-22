/* TimeWise — connection badge and sign-out control for app screens. */

(function () {
  'use strict';

  var badge = document.getElementById('backend-status');

  function setBadge(state, label) {
    if (!badge) return;
    badge.textContent = label;
    badge.dataset.state = state;
  }

  if (window.TimeWiseBackend && window.TimeWiseBackend.isConfigured()) {
    setBadge('connecting', 'Connecting…');
  } else {
    setBadge('local', 'Local demo');
  }

  window.addEventListener('timewise:backend-status', function (event) {
    setBadge(event.detail.state, event.detail.label);
  });

  var signOut = document.getElementById('sign-out-btn');
  if (signOut && window.TimeWiseBackend) {
    signOut.hidden = true;
    window.addEventListener('timewise:auth-change', function (event) {
      signOut.hidden = !event.detail.session;
    });
    window.TimeWiseBackend.getSession().then(function (session) {
      signOut.hidden = !session;
    });
    signOut.addEventListener('click', function () {
      window.TimeWiseBackend.signOut().then(function () { window.location.href = 'index.html'; });
    });
  }
})();
