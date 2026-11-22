/* TimeWise — registration and login interactions.
   Uses Supabase when configured; otherwise keeps the front-end demo behavior. */

(function () {
  'use strict';

  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var Backend = window.TimeWiseBackend;

  document.querySelectorAll('.year').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  function setNotice(text, isError) {
    var notice = document.getElementById('form-notice');
    if (!notice) return;
    notice.textContent = text || '';
    notice.classList.toggle('is-error', Boolean(isError));
  }

  function setError(input, message) {
    var field = input.closest('.field');
    if (!field) return;
    var error = field.querySelector('.field-error');
    if (error) error.textContent = message || '';
    field.classList.toggle('is-invalid', Boolean(message));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function backendReady() {
    return Boolean(Backend && Backend.isConfigured());
  }

  function errorMessage(error, fallback) {
    return (error && error.message) || fallback || 'Something went wrong. Please try again.';
  }

  // Show / hide password fields
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

  // Password strength meter (registration only)
  var password = document.getElementById('password');
  var strength = document.getElementById('password-strength');

  if (password && strength) {
    var label = strength.querySelector('.strength-label');
    var labels = ['Use 8+ characters', 'Weak password', 'Fair password', 'Good password', 'Strong password'];

    function updateStrength(value) {
      var score = 0;
      if (value) {
        if (value.length < 8) {
          score = 1;
        } else {
          score = 1;
          if (value.length >= 12) score++;
          if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
          if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
        }
      }
      score = Math.min(score, 4);
      strength.dataset.score = String(score);
      if (label) label.textContent = labels[score];
    }

    password.addEventListener('input', function () { updateStrength(password.value); });
    updateStrength('');
  }

  // Clear an error as soon as the user corrects it
  document.querySelectorAll('form').forEach(function (form) {
    form.querySelectorAll('input').forEach(function (input) {
      input.addEventListener('input', function () { setError(input, ''); });
      if (input.type === 'checkbox') {
        input.addEventListener('change', function () {
          var termsError = document.getElementById('terms-error');
          if (termsError) termsError.textContent = '';
          setNotice('');
        });
      }
    });
  });

  // Registration
  var registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', function (event) {
      event.preventDefault();
      setNotice('');

      var name = registerForm.elements.name;
      var email = registerForm.elements.email;
      var pass = registerForm.elements.password;
      var confirm = registerForm.elements['confirm-password'];
      var terms = registerForm.elements.terms;
      var termsError = document.getElementById('terms-error');
      var valid = true;

      if (name.value.trim().length < 2) {
        setError(name, 'Please enter your name.');
        valid = false;
      }
      if (!emailPattern.test(email.value.trim())) {
        setError(email, 'Enter a valid email address.');
        valid = false;
      }
      if (pass.value.length < 8) {
        setError(pass, 'Use at least 8 characters.');
        valid = false;
      }
      if (confirm.value !== pass.value || !confirm.value) {
        setError(confirm, 'Passwords do not match.');
        valid = false;
      }
      if (!terms.checked) {
        if (termsError) termsError.textContent = 'Please accept the terms to continue.';
        valid = false;
      }
      if (!valid) {
        setNotice('Please check the highlighted fields.', true);
        return;
      }

      if (backendReady()) {
        setNotice('Creating your account…');
        Backend.signUp({
          name: name.value.trim(),
          email: email.value.trim(),
          password: pass.value
        }).then(function (data) {
          if (data && data.user && !data.session) {
            setNotice('Check your inbox to confirm your email, then log in.');
          } else {
            window.location.href = 'dashboard.html';
          }
        }).catch(function (error) {
          setNotice(errorMessage(error, 'Could not create your account.'), true);
        });
        return;
      }

      setNotice('Details look good. Add Supabase credentials to create your account.');
    });
  }

  // Login
  var loginForm = document.getElementById('login-form');
  if (loginForm) {
    var savedEmail = null;
    try { savedEmail = localStorage.getItem('timewiseEmail'); } catch (e) { /* storage unavailable */ }
    if (savedEmail) loginForm.elements.email.value = savedEmail;

    if (backendReady()) {
      Backend.getSession().then(function (session) {
        if (session) setNotice('You are already signed in. Open the dashboard to continue.');
      });
    }

    loginForm.addEventListener('submit', function (event) {
      event.preventDefault();
      setNotice('');

      var email = loginForm.elements.email;
      var pass = loginForm.elements.password;
      var remember = loginForm.elements.remember;
      var valid = true;

      if (!emailPattern.test(email.value.trim())) {
        setError(email, 'Enter a valid email address.');
        valid = false;
      }
      if (!pass.value) {
        setError(pass, 'Enter your password.');
        valid = false;
      }
      if (!valid) {
        setNotice('Please check the highlighted fields.', true);
        return;
      }

      try {
        if (remember.checked) localStorage.setItem('timewiseEmail', email.value.trim());
        else localStorage.removeItem('timewiseEmail');
      } catch (e) { /* storage unavailable */ }

      if (backendReady()) {
        setNotice('Logging in…');
        Backend.signIn(email.value.trim(), pass.value)
          .then(function () { window.location.href = 'dashboard.html'; })
          .catch(function (error) { setNotice(errorMessage(error, 'Could not log in.'), true); });
        return;
      }

      setNotice('Credentials look good. Add Supabase credentials to enable sign-in.');
    });
  }

  // Social sign-in
  document.querySelectorAll('.oauth-btn').forEach(function (button) {
    button.addEventListener('click', function () {
      if (backendReady()) {
        setNotice('Opening ' + button.dataset.provider + '…');
        Backend.signInWithOAuth(button.dataset.provider)
          .catch(function (error) { setNotice(errorMessage(error, 'Could not sign in with ' + button.dataset.provider + '.'), true); });
        return;
      }
      setNotice(button.dataset.provider + ' sign-in will be available once Supabase is connected.');
    });
  });

  // Password reset
  var forgot = document.getElementById('forgot-password');
  if (forgot) {
    forgot.addEventListener('click', function (event) {
      event.preventDefault();
      if (backendReady()) {
        var emailField = document.getElementById('email');
        var email = emailField ? emailField.value.trim() : '';
        if (!emailPattern.test(email)) {
          setNotice('Enter your email above first.', true);
          return;
        }
        setNotice('Sending reset link…');
        Backend.sendPasswordReset(email)
          .then(function () { setNotice('Check your inbox for a password reset link.'); })
          .catch(function (error) { setNotice(errorMessage(error, 'Could not send reset link.'), true); });
        return;
      }
      setNotice('Password reset will be available once Supabase is connected.');
    });
  }
})();
