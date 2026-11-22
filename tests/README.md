# Testing TimeWise

No test framework is required.

## Automated

```bash
# Store unit tests (CRUD, persistence, subscriptions, migration)
node tests/store.test.js

# Settings unit tests (defaults, persistence, validation, subscriptions)
node tests/settings.test.js

# Static checks + headless Chrome rendering on every page
python3 tests/smoke.py
```

If Chrome is not on `PATH`, set it explicitly:

```bash
CHROME_BIN=/usr/bin/google-chrome python3 tests/smoke.py
```

The smoke test checks:

- JavaScript syntax for every file in `assets/js/`
- Local links and asset references in every HTML page
- Rendered markers, task counts, and runtime console errors on all app pages

## Live push probe

`tests/push-probe.js` is an optional end-to-end check of the deployed reminder function. It needs a live Supabase project, a registered push subscription, and a secret key passed through the environment:

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SECRET_KEY=sb_secret_... \
node tests/push-probe.js
```

It verifies per-task reminder lead times, future-snooze suppression, and expired-snooze follow-up. Five temporary tasks are created and deleted automatically. Expect up to two harmless test notifications on the registered device. Never commit the secret key.

## Manual

Work through `tests/manual-checklist.md` before a release, especially after Supabase or UI changes.
