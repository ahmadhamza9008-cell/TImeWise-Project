/* TimeWise — landing page interactions (vanilla JavaScript) */

(function () {
  'use strict';

  // Footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // Mobile navigation
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');

  if (toggle && nav) {
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 760) setOpen(false);
    });
  }

  // Reveal on scroll
  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealItems.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealItems.forEach((el, index) => {
      el.style.transitionDelay = `${(index % 3) * 80}ms`;
      observer.observe(el);
    });
  } else {
    revealItems.forEach((el) => el.classList.add('is-visible'));
  }

  // Early-access form — saved to Supabase when configured.
  const form = document.getElementById('early-access-form');
  const message = document.getElementById('form-message');

  if (form && message) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = form.elements.email.value.trim();

      if (!email) {
        message.textContent = 'Please enter your email address.';
        message.style.color = '#fca5a5';
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        message.textContent = 'That email does not look quite right.';
        message.style.color = '#fca5a5';
        return;
      }

      const submit = form.querySelector('button[type="submit"]');
      const backend = window.TimeWiseBackend;
      if (!backend || !backend.joinWaitlist) {
        message.textContent = 'Thanks! Connect Supabase to save your email to the list.';
        message.style.color = '';
        form.reset();
        return;
      }

      if (submit) submit.disabled = true;
      message.textContent = 'Adding you to the list…';
      message.style.color = '';

      backend.joinWaitlist(email).then(() => {
        message.textContent = 'Thanks! You are on the list. We will be in touch.';
        form.reset();
      }).catch((error) => {
        if (error && (error.code === '23505' || /duplicate/i.test(error.message || ''))) {
          message.textContent = 'You are already on the list — we will be in touch.';
          form.reset();
        } else {
          message.textContent = 'Could not save your email. Please try again.';
          message.style.color = '#fca5a5';
        }
      }).then(() => {
        if (submit) submit.disabled = false;
      });
    });
  }
})();
