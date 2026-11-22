/* TimeWise — complete the password-reset flow after following the email link. */

(function () {
  'use strict';

  var Backend = window.TimeWiseBackend;
  var intro = document.getElementById('reset-intro');
  var form = document.getElementById('reset-form');
  var expired = document.getElementById('reset-expired');
  var notice = document.getElementById('reset-notice');
  var password = document.getElementById('new-password');
  var confirm = document.getElementById('confirm-password');
  var passwordError = document.getElementById('new-password-error');
  var confirmError = document.getElementById('confirm-error');

  function setError(el, message) {
    if (el) el.textContent = message || '';
  }

  function showForm() {
    if (form) form.hidden = false;
    if (expired) expired.hidden = true;
    if (intro) intro.textContent = 'Choose a password you haven’t used here before.';
  }

  function showExpired(message) {
    if (form) form.hidden = true;
    if (expired) expired.hidden = false;
    if (intro) intro.textContent = message || 'We couldn’t verify that link.';
  }

  document.querySelectorAll('.password-toggle').forEach(function (button) {
    button.addEventListener('click', function () {
      var input = document.getElementById(button.dataset.toggleTarget);
      if (!input) return;
      var shouldShow = input.type === 'password';
      input.type = shouldShow ? 'text' : 'password';
      button.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password');
      var text = button.querySelector('.toggle-text');
      if (text) text.textContent = shouldShow ? 'Hide' : 'Show';
    });
  });

  if (!Backend || !Backend.updatePassword) {
    showExpired('Password reset needs a connected Supabase project. Add your credentials in assets/js/config.js.');
    return;
  }

  Backend.getSession().then(function (session) {
    if (session && session.user) showForm();
    else showExpired('This link is invalid or has expired. Request a fresh one from the login page.');
  }).catch(function () {
    showExpired('We couldn’t check your reset link. Try again in a moment.');
  });

  if (!form) return;

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var value = password ? password.value : '';
    var repeat = confirm ? confirm.value : '';
    setError(passwordError, '');
    setError(confirmError, '');
    if (notice) notice.textContent = '';

    if (value.length < 8) {
      setError(passwordError, 'Use at least 8 characters.');
      return;
    }
    if (value !== repeat) {
      setError(confirmError, 'The passwords don’t match.');
      return;
    }

    var submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    Backend.updatePassword(value).then(function () {
      if (notice) notice.textContent = 'Password updated. You can log in now.';
      form.reset();
      if (intro) intro.textContent = 'All set — your new password is active.';
    }).catch(function (error) {
      setError(passwordError, (error && error.message) || 'Could not update the password.');
    }).then(function () {
      if (submit) submit.disabled = false;
    });
  });
})();
