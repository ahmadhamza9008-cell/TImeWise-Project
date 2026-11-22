# TimeWise — Release Checklist (v1.1)

Copy this into the release ticket. Every box needs an owner, a date, and a link/screenshot in the release record. Full details live in [`DEPLOYMENT.md`](DEPLOYMENT.md) and [`STORE_LISTING.md`](STORE_LISTING.md).

## Quick command block

```bash
cd /home/ahmad/TimeWise
npm ci
node tests/store.test.js
node tests/settings.test.js
python3 tests/smoke.py                       # set CHROME_BIN if Chrome not on PATH
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SECRET_KEY=sb_secret_... \
  node tests/push-probe.js                   # live only; creates 5 temporary tasks
```

---

## 1. Pre-launch — code and config

- [ ] **Code freeze**: release commit/tag recorded; no source edits after QA sign-off; `git status` clean.
- [ ] Version alignment checked: `package.json` `1.1.0`, `android/app/build.gradle` `versionName "1.1.0"`, `versionCode` bumped for this upload; store "What's new" says v1.1.
- [ ] `assets/js/config.js` verified per environment: `supabaseUrl` HTTPS, `supabaseAnonKey` publishable (`sb_publishable_...`), VAPID public key matches the Edge Function secret, `redirectUrl` correct/blank, `paystackPublicKey` deliberately set (`pk_test_...`/`pk_live_...`) or blank for demo. **No secret/service-role/Paystack secret keys anywhere in browser code.**
- [ ] `supabase/config.toml` project ID matches the target project; `verify_jwt = false` for `send-due-reminders` is intentional.
- [ ] SW cache name bumped (`sw.js`: `timewise-v7` → next value) if any cached file changed; `CORE_ASSETS` updated if files were added/removed.
- [ ] Generated copies refreshed: `npm run web:sync`; `npm run cap:sync` for native; `npm run assets:native` only if icons/splashes changed.
- [ ] No hand-edits to generated `www/` or Android asset copies.
- [ ] Legal pages reachable at `/privacy.html` and `/terms.html`; wording matches final data practices (no ads/tracking, Web Push only).

## 2. Pre-launch — tests

- [ ] `node tests/store.test.js` → all tests pass (29 expected).
- [ ] `node tests/settings.test.js` → all tests pass (10 expected).
- [ ] `python3 tests/smoke.py` → passes; headless Chrome phase not skipped (`CHROME_BIN=/usr/bin/google-chrome python3 tests/smoke.py` if needed).
- [ ] `tests/manual-checklist.md` walked end-to-end after the final UI/Supabase change (auth, tasks, dashboard, calendar, insights, recurring, settings).
- [ ] **Live push probe** against the deployed function with a registered subscription: `SUPABASE_URL=... SUPABASE_SECRET_KEY=... node tests/push-probe.js` → all six checks pass, probe rows cleaned up, test notifications expected on device.
- [ ] Two-browser/account session test: a second user cannot read or edit the first user's tasks; Realtime update appears in another tab.
- [ ] Password reset link opens `reset.html`, and confirmations land on `dashboard.html`.

## 3. Pre-launch — Supabase, RLS, and functions

- [ ] Migrations applied in order: `schema.sql` → `profiles.sql` → `push.sql` → `enhancements.sql` → `product-requirements.sql` → (optional `recurring.sql`, `waitlist.sql`) → **`billing.sql` / `paystack.sql` (Paystack billing, present in this repo)**.
- [ ] RLS verification queries (SQL Editor) — all expected results:

```sql
-- All private tables (incl. billing): relrowsecurity = true AND relforcerowsecurity = true
select relname, relrowsecurity, relforcerowsecurity
  from pg_class
 where oid in ('public.tasks'::regclass, 'public.focus_sessions'::regclass,
               'public.profiles'::regclass, 'public.push_subscriptions'::regclass,
               'public.subscriptions'::regclass, 'public.stripe_webhook_events'::regclass);

-- No permissive policy on private tables (expect 0 rows)
select tablename, policyname from pg_policies
 where schemaname = 'public'
   and tablename in ('tasks','focus_sessions','profiles','push_subscriptions','subscriptions','stripe_webhook_events')
   and (qual::text = 'true' or with_check::text = 'true');

-- Cross-user canary (expect all counts = 0)
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000000';
select (select count(*) from public.tasks) as tasks,
       (select count(*) from public.focus_sessions) as sessions,
       (select count(*) from public.profiles) as profiles,
       (select count(*) from public.push_subscriptions) as push,
       (select count(*) from public.subscriptions) as subscriptions;
rollback;
```

- [ ] Focus-session ownership FK present: `focus_sessions_owner_task_fkey` references `(user_id, id)`; tasks have full replica identity.
- [ ] Edge Functions deployed with correct JWT flags: `send-due-reminders --no-verify-jwt`, `initialize-paystack-payment`, `manage-paystack-subscription`, `paystack-webhook --no-verify-jwt`.
- [ ] Edge Function health checks:
  - [ ] `curl -sS -o /dev/null -w '%{http_code}' -X POST $SUPABASE_URL/functions/v1/send-due-reminders` → **401** (unauthenticated).
  - [ ] `curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" .../send-due-reminders` → JSON with `sent/failed/subscriptions/tasksChecked`, no `"error"`.
  - [ ] `supabase functions logs send-due-reminders --project-ref <ref> --tail` shows no unexpected exceptions.
  - [ ] If billing on: checkout/portal reject requests without a JWT (401/503); webhook rejects an unsigned POST (400/503).
- [ ] Secrets set in Supabase (never browser): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`; VAPID public key matches `config.js`. If billing on: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PLAN_CODE`, `SITE_URL`.
- [ ] pg_cron job active: `select jobname, schedule, active from cron.job where jobname = 'timewise-send-due-reminders';` → every 5 minutes, active; recent `cron.job_run_details` show success.
- [ ] Auth URL config: Site URL plus `register.html`, `login.html`, `dashboard.html`, `reset.html`, wildcard, and **`https://localhost/*`** for the Android WebView.

### Billing (only if enabled)

- [ ] Paystack webhook endpoint registered at `https://<PROJECT_REF>.supabase.co/functions/v1/paystack-webhook` in Paystack Dashboard → Settings → API Keys & Webhooks. Paystack signs with `x-paystack-signature` (HMAC SHA512 using your secret key).
- [ ] Paystack test-mode purchase → `subscriptions` row has `plan='pro'`, `status` reflects active entitlement; Settings → **Your plan** shows Pro; cancel/non-renew updates after webhook; duplicate event is acknowledged without double-writing (`stripe_webhook_events`, legacy replay-table name).
- [ ] `pricing.html` exists, is linked from Settings/navigation, and `pricing.html` + `assets/css/pricing.css` + `assets/js/billing.js` + `assets/js/pricing.js` are in `sw.js` `CORE_ASSETS` before the cache bump.
- [ ] Play Store decision recorded: Paystack web checkout is **not** Play Billing — either ship Play build with billing off or complete Play Billing/policy work before selling through Play.
- [ ] `privacy.html` lists Paystack as a third party; store data-safety answers updated.

## 4. Pre-launch — PWA, Android, store assets

- [ ] Static site on HTTPS; `/`, `/sw.js`, `/manifest.webmanifest` all 200 with correct MIME types.
- [ ] **PWA install check**: HTTPS origin, install banner appears, installed app opens `dashboard.html` in standalone mode, cached shell opens offline, icons render at 192/512.
- [ ] Config/cache interaction verified: after config change, SW cache name was bumped and `caches.keys()` contains only the new `timewise-v*`.
- [ ] Android debug smoke: `npm run cap:sync`, app opens in Android Studio, login works in WebView (`https://localhost/*` allow-listed), back button exits cleanly.
- [ ] **Android release build/signing**: signed AAB/APK produced (`/home/ahmad/tools/build-release.sh` or Gradle `assembleRelease bundleRelease` with `TIMEWISE_*` env vars), keystore + passwords backed up outside the repo, `versionCode` bumped; no `google-services.json` expected (native FCM not implemented).
- [ ] Store assets ready: app name/tagline/short description (≤80 chars)/full description/keywords, 5 screenshots (+ optional landing), v1.1 "What's new", privacy and terms URLs, support email, content rating **Everyone**.
- [ ] Known limitations acknowledged in release notes/metadata: Web Push only, no native FCM, offline shell only, no iOS build, Paystack web checkout vs Play Billing decision.

## 5. Pre-launch — data, accessibility, monitoring

- [ ] Backup taken before release (`pg_dump`/Supabase backup or PITR confirmation).
- [ ] **Backup/restore drill completed**: Settings → *Export all data (JSON)* → import with **Merge** and then **Replace** on a test account; verify tasks, subtasks, focus sessions and preferences return. CSV export also checked.
- [ ] **Accessibility keyboard pass**: skip links appear on focus; all controls reachable with visible focus rings; Today's plan row ↑/↓ reordering works; notification dialog opens with focus, closes with Escape, returns focus to the bell; reduced-motion respected; no horizontal scroll at 1440/1024/768/390 px.
- [ ] Analytics/monitoring plan confirmed: no analytics SDK is bundled; Supabase Auth/DB/Functions logs, cron `job_run_details`, function counters, static-host access logs, and an uptime probe are configured (or explicitly waived and recorded).
- [ ] Alerting owner defined for 401s, `failed > 0`, inactive cron, Paystack webhook failures/retries, unexpected Pro entitlements, and certificate expiry.
- [ ] Rollback plan reviewed: previous deploy ID/git tag recorded, last known-good function version identified, secret-rotation procedure known (see `DEPLOYMENT.md` §8).

## 6. Post-launch (first 24–72 hours)

- [ ] Smoke commands from `DEPLOYMENT.md` §9 re-run against production; badge shows `Connected` for signed-in users.
- [ ] Edge Function and cron logs checked after the first scheduled run; push counters and `job_run_details` healthy; no stale-subscription spike.
- [ ] Auth logs monitored for redirect/config errors; `reset.html` and Android WebView login confirmed from real devices.
- [ ] If billing on: Paystack webhook log has no retries/failures, `subscriptions` matches Paystack Dashboard, and `stripe_webhook_events` (legacy replay-table name) shows no unexpected gaps.
- [ ] Store listing live with correct privacy policy URL (incl. Paystack disclosure if enabled) and no stray test data in screenshots.
- [ ] Support inbox (`hello@timewise.app`) checked; known limitations communicated consistently.
- [ ] Feedback/crash reports triaged; any hotfix goes through code freeze → tests → cache bump → redeploy.
- [ ] Rollback decision point recorded (time, owner, metrics reviewed); release marked complete only after sign-off.
