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

## Manual

Work through `tests/manual-checklist.md` before a release, especially after Supabase or UI changes.
