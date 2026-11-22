/* TimeWise — pricing page behavior. All payment actions go through the
   billing module and secure Edge Functions; no card data touches this site. */

(function () {
  'use strict';

  var Billing = window.TimeWiseBilling;
  var Backend = window.TimeWiseBackend;

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  var banner = document.getElementById('checkout-banner');
  var badge = document.getElementById('pricing-plan-badge');
  var upgrade = document.getElementById('upgrade-btn');
  var portal = document.getElementById('portal-btn');
  var note = document.getElementById('pricing-note');
  var fineprint = document.getElementById('pricing-fineprint');
  var freeCta = document.getElementById('free-cta');

  function showBanner(message, tone) {
    if (!banner) return;
    banner.textContent = message;
    banner.dataset.tone = tone || 'success';
    banner.hidden = false;
  }

  var params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') {
    showBanner('Payment complete. Your Pro plan will appear here in a moment — refresh if it takes a few seconds.');
  } else if (params.get('checkout') === 'cancel') {
    showBanner('Checkout cancelled. No charge was made.', 'error');
  } else if (params.get('billing') === 'return') {
    showBanner('Billing settings updated.');
  }

  function render(snapshot) {
    if (badge) {
      if (snapshot.demo) badge.textContent = 'Local demo — all features unlocked';
      else if (snapshot.plan === 'pro') badge.textContent = 'Current plan: TimeWise Pro';
      else badge.textContent = 'Current plan: Free';
    }
    if (upgrade) {
      if (snapshot.demo) {
        upgrade.textContent = 'All features unlocked';
        upgrade.disabled = true;
      } else if (snapshot.plan === 'pro') {
        upgrade.textContent = 'You are on Pro';
        upgrade.disabled = true;
      } else {
        upgrade.textContent = 'Upgrade to Pro';
        upgrade.disabled = false;
      }
    }
    if (portal) portal.hidden = snapshot.demo || snapshot.plan !== 'pro';
    if (note && snapshot.demo) note.textContent = 'No card needed — Stripe is not connected in this build.';
    if (fineprint && snapshot.configured) {
      fineprint.textContent = 'Payments are processed by Stripe. TimeWise never stores your card details.';
    }
  }

  if (Billing && Billing.subscribe) Billing.subscribe(render);

  if (Backend && Backend.getSession && freeCta) {
    Backend.getSession().then(function (session) {
      freeCta.setAttribute('href', session && session.user ? 'dashboard.html' : 'register.html');
    }).catch(function () { /* leave register link as the safe default */ });
  }

  if (upgrade) {
    upgrade.addEventListener('click', function () {
      if (!Billing) return;
      upgrade.disabled = true;
      upgrade.textContent = 'Opening secure checkout…';
      Billing.startCheckout().catch(function (error) {
        showBanner(error.message || 'Could not start checkout.', 'error');
        upgrade.disabled = false;
        upgrade.textContent = 'Upgrade to Pro';
      });
    });
  }

  if (portal) {
    portal.addEventListener('click', function () {
      if (!Billing) return;
      Billing.openPortal().catch(function (error) {
        showBanner(error.message || 'Could not open billing portal.', 'error');
      });
    });
  }
})();
