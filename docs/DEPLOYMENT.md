# TimeWise — Production Deployment Guide

This guide covers the **v1.1.0** static PWA plus its Supabase backend and Capacitor Android wrapper. TimeWise is plain HTML/CSS/JS with **no framework build step**: the files in the repository root are the single source of truth. `www/` and the web assets under `android/app/src/main/assets/public/` are generated copies.

> **Important repository facts (verified at the time of writing)**
>
> - `package.json` is version `1.1.0`; `android/app/build.gradle` has `versionName "1.1.0"` and `versionCode 2`.
> - `sw.js` is `timewise-v8` and its `CORE_ASSETS` include `pricing.html`, `assets/css/pricing.css`, `assets/js/billing.js`, and `assets/js/pricing.js`. Bump the cache name on every web-asset release.
> - A **Paystack subscription layer is present** and deployed to the linked Supabase project: `supabase/billing.sql`, `supabase/paystack.sql`, `supabase/functions/initialize-paystack-payment/`, `manage-paystack-subscription/`, `paystack-webhook/`, `assets/js/billing.js`, `assets/js/pricing.js`, `pricing.html`. It is **unconfigured in the browser by default** (`paystackPublicKey: ''` in `config.js`), so the app runs in local-demo mode with all limits unlocked. To activate payments, set Paystack Edge Function secrets and the public key. Paystack secret keys must never enter browser code. Legacy DB identifiers (`stripe_webhook_events`, `stripe_*` columns) remain for compatibility.
> - Local release helpers outside the repo: `/home/ahmad/tools/build-apk.sh` (debug) and `/home/ahmad/tools/build-release.sh` (signed release). Signing credentials live in `/home/ahmad/tools/timewise-signing.properties` and the keystore outside the repo.
> - `assets/js/config.js` contains the working Supabase URL, publishable key, and VAPID public key for this environment. Replace them for a different deployment; these values are public by design and are cached by the service worker.

---

## 1. What ships

| Layer | Files | Notes |
| --- | --- | --- |
| Static web app | `*.html`, `assets/css/`, `assets/js/`, `assets/img/`, `manifest.webmanifest`, `sw.js` | Deploy these to the web root. No transpilation required. |
| PWA layer | `sw.js`, `assets/js/pwa.js`, `manifest.webmanifest` | Service worker registers as `./sw.js`; keep it at the site root (or app subpath root) with the correct scope. |
| Capacitor wrapper | `capacitor.config.json`, `android/` | `appId: com.timewise.app`, `webDir: www`, `androidScheme: https` → WebView origin is `https://localhost`. |
| Supabase schema | `supabase/*.sql` | Apply in the order given in §5. Includes `billing.sql` and `paystack.sql` for Paystack entitlements (legacy `stripe_*` DB names retained for compatibility). |
| Edge Functions | `supabase/functions/*` | `send-due-reminders` and `paystack-webhook` use `verify_jwt = false`; initialize/manage require a user JWT. |
| Billing layer | `pricing.html`, `assets/js/billing.js`, `assets/js/pricing.js`, billing Edge Functions | Optional; active only when `paystackPublicKey` and Paystack secrets are set. Webhook is the only writer of the `subscriptions` table. |
| Tests | `tests/store.test.js`, `tests/settings.test.js`, `tests/smoke.py`, `tests/push-probe.js`, `tests/manual-checklist.md` | See §9. |

---

## 2. Hosting options for the static site

All providers can serve the repository as-is. If you want a generated `www/` bundle, use `npm ci && npm run web:sync` and publish `www/`. Publishing the repository root works too because the HTML files already live there.

| Provider | Recommended build command | Publish directory | Notes |
| --- | --- | --- | --- |
| **Netlify** | `npm ci && npm run web:sync` | `www` | Or set build command to empty and publish `.` (root). Add a 404→`index.html` redirect only if you introduce client-side routes; the current app uses real `.html` files and does not need it. |
| **Vercel** | Framework: *Other*; `npm ci && npm run web:sync` | `www` | Set "Root Directory" to the repository root. Verify `manifest.webmanifest` and `sw.js` return `200`, not a SPA fallback. |
| **Cloudflare Pages** | `npm ci && npm run web:sync` | `www` | No Node runtime is needed at serve time; the output is static. Set custom headers if you want `Cache-Control: no-cache` on `sw.js`. |
| **GitHub Pages** | None (publish root from a branch), or a GitHub Action that runs `npm ci && npm run web:sync` and publishes `www` | `/` or `/www` | If serving from `/<repo>/`, set `redirectUrl` in `config.js` to that base URL and register matching Supabase redirect URLs. A custom domain is preferred so the PWA scope is `/`. Consider adding a `.nojekyll` file if Jekyll processing is enabled. |
| **Supabase Storage** | None | Public bucket | Create a public bucket, upload the static files, and set MIME types (`text/html`, `text/css`, `application/javascript`, `application/manifest+json`, `image/png`). Acceptable for simple hosting, but you get no rewrite/header control; verify the service worker and manifest are served correctly. |
| **Self-host (nginx/Caddy)** | `npm ci && npm run web:sync` | `www` | Full control over TLS, caching, and headers. Example below. |

Example Netlify configuration (shown for reference; do not add it unless you want it):

```toml
[build]
  command = "npm ci && npm run web:sync"
  publish = "www"

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache"
```

Example nginx site (serve the synced bundle at the domain root):

```nginx
server {
    listen 443 ssl http2;
    server_name app.example.com;

    ssl_certificate     /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;

    root /srv/timewise/www;
    index index.html;

    location / { try_files $uri $uri/ =404; }

    location = /sw.js { add_header Cache-Control "no-cache" always; }
    location = /manifest.webmanifest {
        types { } default_type "application/manifest+json";
    }
}
```

**HTTPS is mandatory** for service workers and Web Push (only `http://localhost` is exempt). Use a valid TLS certificate, redirect HTTP→HTTPS, and avoid mixed content (Google Fonts and the Supabase JS CDN are already HTTPS).

---

## 3. Exact build/sync commands available in this repo

Install dependencies once:

```bash
cd /home/ahmad/TimeWise
npm ci
```

| Command | Defined in | What it does |
| --- | --- | --- |
| `npm run web:sync` | `package.json` → `node scripts/sync-web.js` | **Deletes `www/`**, then copies every root `*.html`, `manifest.webmanifest`, `sw.js`, and the whole `assets/` directory into `www/`. Run after any web edit. |
| `npm run assets:native` | `python3 scripts/generate-native-assets.py` | Regenerates Android launcher icons and splash screens from `assets/img/icon-512.png`. Requires Pillow. Run only when the icon/branding changes. |
| `npm run vapid:keys` | `node scripts/generate-vapid.js` | Generates a VAPID key pair. Public key → `config.js`; private key → Supabase Edge Function secret only. |
| `npm run cap:sync` | `node scripts/sync-web.js && cap sync` | Syncs web files into `www/` **and** into the native Android project. Run before every Android build. |
| `npm run cap:add:android` | `node scripts/sync-web.js && cap add android` | Only needed when (re)creating the Android project. `android/` is already present. |
| `npm run cap:open:android` | `cap open android` | Opens the native project in Android Studio. |
| `npm run cap:build:android` | `node scripts/sync-web.js && cap build android` | Builds the Android app. Requires Android SDK + JDK. |
| `python3 scripts/generate-icons.py` | direct script | Regenerates the PWA 192/512 PNG icons. Requires Pillow. |
| `cd android && ./gradlew ...` | Gradle wrapper | Alternative native build path; see signing note below. |
| `/home/ahmad/tools/build-apk.sh` | local helper outside repo | Syncs web assets and builds a debug APK. |
| `/home/ahmad/tools/build-release.sh` | local helper outside repo | Syncs web assets and builds a signed release APK + AAB using external signing env vars. |

Signed release flow:

```bash
npm ci
npm run assets:native   # only if icons/splash screens changed
npm run cap:sync
/home/ahmad/tools/build-release.sh
# or set TIMEWISE_* signing env vars and run:
# cd android && ./gradlew clean :app:assembleRelease :app:bundleRelease
```

`android/app/build.gradle` reads release signing from `TIMEWISE_KEYSTORE`, `TIMEWISE_KEYSTORE_PASSWORD`, `TIMEWISE_KEY_ALIAS`, and `TIMEWISE_KEY_PASSWORD` env vars. Keep the keystore/properties outside version control (`.gitignore` already excludes `*.apk`, `*.aab`, `android/local.properties`). Bump `versionCode` for each Play upload; `versionName` should match the release (`1.1.0`).

`scripts/sync-web.js` is destructive to `www/` by design — never hand-edit `www/` or the copied Android web assets.

---

## 4. Environment variables and where each belongs

### 4.1 Public values — browser (`assets/js/config.js`)

```js
window.TimeWiseConfig = {
  supabaseUrl: 'https://<PROJECT_REF>.supabase.co', // publishable project URL
  supabaseAnonKey: 'sb_publishable_...',            // or legacy anon key; NEVER a service_role/secret key
  vapidPublicKey: '...',                            // safe to expose
  redirectUrl: 'https://app.example.com',           // optional; omit to derive from current page
  paystackPublicKey: ''                           // pk_test_... / pk_live_...; blank = billing disabled
};
```

| Value | Location | Safe in browser? | Notes |
| --- | --- | --- | --- |
| `supabaseUrl` | `assets/js/config.js` | Yes | Must be `https://` or the app falls back to **Local demo** mode (`supabase.js` checks the format). |
| `supabaseAnonKey` | `assets/js/config.js` | Yes | Use `sb_publishable_...` (or legacy anon). RLS is the security boundary. |
| `vapidPublicKey` | `assets/js/config.js` | Yes | Must match `VAPID_PUBLIC_KEY` in Edge Function secrets. Leave blank to hide the push UI. |
| `redirectUrl` | `assets/js/config.js` | Yes | Origin/base URL used for auth redirects; each flow appends `dashboard.html`, `reset.html`, etc. Leave blank to use the current page. |
| `paystackPublicKey` | `assets/js/config.js` | Yes | Set to `pk_test_...`/`pk_live_...` to enable billing (Free: 25 active tasks / 3 subtasks per task; Pro: unlimited). Leave blank for local-demo mode with no limits enforced. Must be paired with Paystack secrets below. |

> Anything in `config.js` is shipped to every browser and cached by the service worker. Bump the SW cache name whenever these values change (§7).

### 4.2 Secret values — Supabase only

| Value | Correct home | Never put it in |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` | Supabase Edge Function secret (mirror of the browser value) | — |
| `VAPID_PRIVATE_KEY` | Supabase Edge Function secret | Browser, repo, logs |
| `VAPID_SUBJECT` | Supabase Edge Function secret, e.g. `mailto:ops@example.com` | Browser |
| `CRON_SECRET` | Supabase Edge Function secret **and** Supabase Vault (via `supabase/cron.sql`); shell env for external cron | Browser, repo |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Automatically injected into Supabase Edge Functions | Browser, repo |
| `SUPABASE_SECRET_KEY` | Shell environment for `tests/push-probe.js` only | Browser, repo |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_PLAN_CODE`, `SITE_URL` | Supabase Edge Function secrets (see §5) | Browser, repo, client config |

Set function secrets with the CLI (run from the repo root; `supabase/config.toml` already declares `project_id` and `verify_jwt = false` for the function):

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY='<public-key>' \
  VAPID_PRIVATE_KEY='<private-key>' \
  VAPID_SUBJECT='mailto:ops@example.com' \
  CRON_SECRET='<long-random-string>'
```

If billing is enabled, add the Paystack secrets too (Edge Function secrets only — never `config.js`):

```bash
supabase secrets set \
  PAYSTACK_SECRET_KEY='sk_live_...' \
  PAYSTACK_PLAN_CODE='PLN_...' \
  SITE_URL='https://app.example.com'
```

`SITE_URL` is used for the Paystack callback URL. Register the Paystack webhook endpoint at `https://<PROJECT_REF>.supabase.co/functions/v1/paystack-webhook` in Paystack Dashboard → Settings → API Keys & Webhooks. Paystack signs webhooks with `x-paystack-signature` (HMAC SHA512 using your secret key). `supabase/config.toml` sets `verify_jwt = false` for the webhook because Paystack cannot send a Supabase JWT.

Passwords/keys for CI should be stored in the host's secret store (Netlify/Vercel/Cloudflare/GitHub Actions secrets), not committed. No build-time secrets are required for the static site.

---

## 5. Supabase setup order

Use the Supabase SQL Editor for `.sql` files and the Supabase CLI for function deploys/secrets. If using the CLI, confirm the linked project matches `project_id` in `supabase/config.toml`:

```bash
supabase link --project-ref <PROJECT_REF>
```

Apply in this order:

1. **`supabase/schema.sql`** — creates `public.tasks`, `public.focus_sessions`, indexes, per-user RLS policies, `FORCE ROW LEVEL SECURITY`, full replica identity, and Realtime publication entries.
2. **`supabase/profiles.sql`** — creates `public.profiles`, RLS policies, the `timewise_profile_on_signup` trigger, and Realtime for profiles.
3. **`supabase/push.sql`** — creates `public.push_subscriptions` with per-user RLS and a unique `(user_id, endpoint)` index.
4. **`supabase/enhancements.sql`** — for projects created before v1.1: adds subtasks, plan order, reminder/snooze columns, focus sessions, and the theme column. It is written to be safe to re-run. Note: its temporary reminder check excludes `-1`; step 5 restores the "Never" option.
5. **`supabase/product-requirements.sql`** — restores `reminder_minutes IN (-1, 0, 5, 10, 15, 30, 60)`, adds time-zone/notification preference columns, forces RLS on all four private tables, and reinstalls the ownership-safe focus-session foreign key.
6. **Optional legacy helpers:** `supabase/recurring.sql` (only for pre-recurring projects; fresh projects already have `repeat` from `schema.sql`) and **`supabase/waitlist.sql`** (recommended: the landing page early-access form writes to `public.waitlist`; without it the form only confirms locally). `waitlist` intentionally allows anonymous `INSERT` and has no public `SELECT`.
7. **`supabase/billing.sql` / `supabase/paystack.sql` (billing migration).** Run `billing.sql` after `product-requirements.sql` for a fresh install, or `paystack.sql` after `billing.sql` for an existing install. Creates/updates `public.subscriptions` (select-only for authenticated users; writes only by the service role), webhook replay table, and Realtime for plan changes.
8. **Deploy the Edge Functions** from `supabase/functions/`:

   ```bash
   # Reminder sender: JWT verification disabled; authorized by x-cron-secret / service key
   supabase functions deploy send-due-reminders --no-verify-jwt --project-ref <PROJECT_REF>

   # Billing: checkout and portal require a user JWT (verify_jwt = true, the default)
   supabase functions deploy create-checkout-session --project-ref <PROJECT_REF>
   supabase functions deploy create-portal-session --project-ref <PROJECT_REF>

   # Paystack webhook: JWT verification disabled; verified by Paystack signature inside the function
   supabase functions deploy initialize-paystack-payment --project-ref <PROJECT_REF>
   supabase functions deploy manage-paystack-subscription --project-ref <PROJECT_REF>
   supabase functions deploy paystack-webhook --no-verify-jwt --project-ref <PROJECT_REF>
   ```

   These flags match `supabase/config.toml`.

9. **Set Edge Function secrets** — run the `supabase secrets set ...` commands from §4.2. VAPID keys are generated with `npm run vapid:keys`; `CRON_SECRET` should be a long random value. For billing, set `PAYSTACK_SECRET_KEY`, `PAYSTACK_PLAN_CODE`, and `SITE_URL`, then register the Paystack webhook endpoint described in §4.2. Without them, the billing functions return `503 "Billing is not configured yet."` and the browser stays in local-demo mode.
10. **Configure pg_cron** — replace both placeholders in `supabase/cron.sql` (`REPLACE_WITH_PROJECT_REF`, `REPLACE_WITH_CRON_SECRET`), then run it in the SQL Editor. It enables `pg_cron`/`pg_net`, stores the function URL and secret in **Supabase Vault**, unschedules any old job, and schedules `timewise-send-due-reminders` every 5 minutes. Verify with:

    ```sql
    select jobid, jobname, schedule, active
      from cron.job
     where jobname = 'timewise-send-due-reminders';
    ```

    External cron alternative (store the secret in the cron host's secret store):

    ```cron
    */5 * * * * curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$SUPABASE_URL/functions/v1/send-due-reminders"
    ```

    To pause reminders during an incident: `select cron.unschedule('timewise-send-due-reminders');`

All migration scripts end with `notify pgrst, 'reload schema';` so PostgREST picks up new columns immediately.

---

## 6. DNS, HTTPS, PWA, and redirect URL configuration

### 6.1 DNS / TLS

- Point the apex and/or `www` record at your host; enable automatic TLS (Let's Encrypt or provider-managed) and HTTP→HTTPS redirect.
- Certificates must cover the exact hostname used in `config.js`, Supabase Auth redirect URLs, and the manifest scope.
- Keep external dependencies HTTPS-only: Google Fonts (`fonts.googleapis.com`/`fonts.gstatic.com`) and the Supabase JS module (`esm.sh`).
- If you serve from a subpath, all manifest paths are relative (`./`), so the PWA scope becomes that subpath; update `redirectUrl` and every auth redirect URL accordingly.

### 6.2 PWA installability

Verify before launch:

- `GET /manifest.webmanifest` returns 200 with MIME `application/manifest+json` (or `application/json`).
- Manifest has `name`, `short_name`, `description`, `start_url: "./dashboard.html"`, `scope: "./"`, `display: "standalone"`, and 192/512 PNG icons with `purpose: "any maskable"` (`assets/img/icon-192.png`, `icon-512.png`).
- `GET /sw.js` returns 200, JavaScript MIME type, and is not cache-busted to a hashed filename.
- Every page links the manifest (smoke test checks this).
- If billing is enabled, confirm `pricing.html` is linked from Settings and that `pricing.html`, `assets/css/pricing.css`, `assets/js/pricing.js`, and `assets/js/billing.js` are all present in `sw.js` `CORE_ASSETS` (they are in the current v8 list).
- Install banner appears on HTTPS after `beforeinstallprompt`; installed app opens the dashboard in standalone mode.

### 6.3 Supabase Auth redirect URLs

In **Authentication → URL Configuration**, set the **Site URL** to your production origin (e.g. `https://app.example.com/`). Add these redirect URLs:

```text
https://app.example.com/register.html
https://app.example.com/login.html
https://app.example.com/dashboard.html
https://app.example.com/reset.html
https://app.example.com/**
https://localhost/*
http://localhost:8000/*          (local development only)
```

`https://localhost/*` is required for the **Capacitor Android WebView**: `capacitor.config.json` sets `androidScheme: "https"`, so the WebView loads from `https://localhost`. `supabase.js` explicitly sends `dashboard.html` for sign-up/OAuth and `reset.html` for password reset; both must be allow-listed. If you enable Google/GitHub providers, also register the provider callback URLs.

---

## 7. Service-worker cache-bump procedure

`sw.js` currently uses `CACHE_NAME = 'timewise-v8'` and caches `config.js`, all HTML, CSS, and JS in `CORE_ASSETS` (including the pricing/billing files). Navigations are network-first with a 1.5 s timeout; same-origin static assets are cache-first; cross-origin requests (Supabase, fonts, CDN) bypass the worker. **A deploy without a cache bump can leave users on old HTML/config.**

Do this on every release that changes any cached file (especially `config.js`, VAPID key, or auth URLs):

1. Edit the root `sw.js`:

   ```js
   const CACHE_NAME = 'timewise-v9'; // increment from the current v8
   ```

   Add/remove entries in `CORE_ASSETS` if you added or renamed files.

2. Run the tests (§9).
3. Regenerate generated copies:

   ```bash
   npm run web:sync          # refresh www/sw.js for web hosting
   npm run cap:sync          # also refresh the Android web assets if shipping native
   ```

4. Deploy the static site. The SW `activate` handler deletes all caches whose name is not the current `CACHE_NAME`.
5. Verify in DevTools: *Application → Service Workers* → **Update on reload**; then check `await caches.keys()` in the console contains only the new cache name. Reinstall the PWA/clear site data only for stubborn test devices.
6. Confirm the console badge reads `Connected` and that Settings → Notifications uses the new VAPID key.

Do **not** bump the cache name in `www/sw.js` or the Android copy directly — those are generated from the root file.

---

## 8. Rollback plan

| Failure | Rollback action |
| --- | --- |
| Bad static deploy | Netlify: promote the previous deploy; Vercel: **Deployments → Promote** a prior build; Cloudflare Pages: **Rollback** to a previous deployment; GitHub Pages: revert the commit; self-host: restore the previous `www/` directory. |
| Bad `config.js` / VAPID public key | Restore the previous `config.js`, **bump `CACHE_NAME`**, re-run `npm run web:sync` (`cap:sync` for native), and redeploy. Leaving `vapidPublicKey: ''` immediately hides the push UI; leaving `supabaseUrl: ''` falls back to Local demo. |
| Bad Supabase schema change | SQL files are largely idempotent, but `product-requirements.sql` drops/recreates constraints and policies. Restore from a pre-migration `pg_dump` (or Supabase PITR) and re-run the remaining ordered steps. Never "undo" by hand-editing policies without verifying with §8.1-style RLS queries. |
| Bad Edge Function version | Redeploy the last known-good `index.ts` from git: `supabase functions deploy send-due-reminders --no-verify-jwt`. Function secrets are independent of code, so leave them unchanged unless they were the cause. |
| Bad cron behaviour | `select cron.unschedule('timewise-send-due-reminders');` to stop notifications, fix, then re-run `supabase/cron.sql` or re-schedule. |
| Bad billing / entitlement state | Disable the Paystack webhook endpoint in Paystack, set `paystackPublicKey: ''` in `config.js` (all features unlock in demo mode) and bump the SW cache. Repair `public.subscriptions` from backup or via the webhook; the webhook is the only writer, so do not hand-edit entitlements except during an incident. Redeploy the last known-good billing functions and rotate `PAYSTACK_SECRET_KEY` if exposed. |
| Leaked secret | Rotate immediately: `npm run vapid:keys` + update public key in `config.js`, re-set all VAPID secrets, rotate `CRON_SECRET` (and Vault copy), rotate Paystack secret key, rotate the Supabase service/secret key if exposed, bump the SW cache, redeploy, then re-run the live probe. |

After any rollback, re-run §9 smoke checks and the RLS verification queries.

### 8.1 RLS verification queries (run in Supabase SQL Editor)

```sql
-- 1. RLS enabled + FORCED on every private table (expect relrowsecurity and relforcerowsecurity = true)
select relname, relrowsecurity, relforcerowsecurity
  from pg_class
 where oid in (
   'public.tasks'::regclass,
   'public.focus_sessions'::regclass,
   'public.profiles'::regclass,
   'public.push_subscriptions'::regclass,
   'public.subscriptions'::regclass,
   'public.stripe_webhook_events'::regclass
 )
 order by relname;

-- 2. Policies present; no permissive USING/CHECK on private tables
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in ('tasks','focus_sessions','profiles','push_subscriptions','subscriptions','stripe_webhook_events')
 order by tablename, policyname;

select tablename, policyname
  from pg_policies
 where schemaname = 'public'
   and tablename in ('tasks','focus_sessions','profiles','push_subscriptions','subscriptions','stripe_webhook_events')
   and (qual::text = 'true' or with_check::text = 'true');
-- Expected: 0 rows. (public.waitlist insert-with-check(true) is intentional and excluded.)

-- 3. Cross-account canary: impersonate a random authenticated user, expect 0 rows
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000000';
select (select count(*) from public.tasks)            as tasks_visible,
       (select count(*) from public.focus_sessions)   as sessions_visible,
       (select count(*) from public.profiles)         as profiles_visible,
       (select count(*) from public.push_subscriptions) as push_visible,
       (select count(*) from public.subscriptions)    as subscriptions_visible;
rollback;

-- Billing-specific: authenticated users have SELECT only, never INSERT/UPDATE/DELETE
select grantee, privilege_type
  from information_schema.table_privileges
 where table_schema = 'public' and table_name = 'subscriptions'
   and grantee in ('anon','authenticated','service_role')
 order by grantee, privilege_type;
-- Expected: authenticated = SELECT; service_role = DELETE, INSERT, SELECT, UPDATE; anon = none.

-- 4. Ownership canary: inserting a row for another user must fail with a row-level-security violation
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000000';
do $$
begin
  insert into public.tasks (user_id, title)
  values ('11111111-1111-1111-1111-111111111111', 'RLS canary');
  raise exception 'FAIL: insert for another user succeeded';
exception
  when insufficient_privilege or check_violation then
    raise notice 'PASS: cross-user insert was rejected';
end $$;
rollback;
```

---

## 9. Smoke / launch verification commands

```bash
cd /home/ahmad/TimeWise
npm ci

# Unit + static checks (no framework required)
node tests/store.test.js
node tests/settings.test.js
python3 tests/smoke.py
# If Chrome is not on PATH:
CHROME_BIN=/usr/bin/google-chrome python3 tests/smoke.py

# Live end-to-end push probe (needs a registered push subscription)
SUPABASE_URL=https://<PROJECT_REF>.supabase.co \
SUPABASE_SECRET_KEY=sb_secret_... \
  node tests/push-probe.js

# Static site checks
curl -fsSI https://app.example.com/ | head -n 1
curl -fsSI https://app.example.com/manifest.webmanifest | grep -i 'content-type'
curl -fsSI https://app.example.com/sw.js | grep -i 'content-type'

# Edge Function: unauthenticated call must be 401
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST https://<PROJECT_REF>.supabase.co/functions/v1/send-due-reminders
# Expected: 401

# Edge Function: cron call must return counters
curl -sS -X POST \
  -H "x-cron-secret: $CRON_SECRET" \
  https://<PROJECT_REF>.supabase.co/functions/v1/send-due-reminders
# Expected JSON: {"sent":...,"failed":...,"removedStale":...,"clearedSnoozes":...,"subscriptions":...,"tasksChecked":...}

# Billing functions (when enabled): no JWT must be rejected; webhook without a valid signature must be rejected
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  https://<PROJECT_REF>.supabase.co/functions/v1/create-checkout-session
# Expected: 401 (or 503 "Billing is not configured yet." if secrets are absent)
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  https://<PROJECT_REF>.supabase.co/functions/v1/paystack-webhook
# Expected: 401 Invalid Paystack signature (or 503 if not configured)
```

Work through `tests/manual-checklist.md` for the full pre-release pass (auth, RLS across two sessions, Realtime, calendar, insights, PWA install, Android WebView, accessibility). The live push probe creates five temporary tasks and deletes them; expect up to two test notifications on the registered device.

---

## 10. Monitoring and logging recommendations

| Signal | Where | Command / query |
| --- | --- | --- |
| Auth failures, signups, password resets | Supabase Dashboard → Authentication → Logs | Filter by timestamp around releases. |
| Database errors / slow queries | Supabase Dashboard → Database → Logs | Watch PostgREST and RLS policy errors after migrations. |
| Edge Function invocations | Supabase Dashboard → Functions → `send-due-reminders` → Logs | `supabase functions logs send-due-reminders --project-ref <PROJECT_REF> --tail` |
| Push delivery counters | Function JSON response | Alert if `failed` or `removedStale` spikes; `"error": "VAPID keys are not configured"` means secrets are missing. |
| Cron health | `cron.job` / `cron.job_run_details` | See SQL below. |
| Billing functions | Supabase Dashboard → Functions → `initialize-paystack-payment`, `manage-paystack-subscription`, `paystack-webhook` → Logs | `supabase functions logs paystack-webhook --project-ref <PROJECT_REF> --tail`; watch for `503` (secrets missing), `401 Invalid Paystack signature`, and entitlement upsert failures. |
| Paystack webhook health | Paystack Dashboard → Settings → API Keys & Webhooks; `public.stripe_webhook_events` replay table | Confirm 200 responses, no retry storm, and one row per event id. |
| Entitlement sanity | `public.subscriptions` | Spot-check that paid test users have `plan='pro'`, `status IN ('active','attention','non-renewing')`, and a matching `provider_subscription_code`. |
| Static availability | Host CDN/access logs + external uptime probe | Check `/`, `/sw.js`, `/manifest.webmanifest`, and one auth redirect URL. |
| Browser errors | DevTools console / optional RUM tool | No analytics or error-reporting SDK is bundled; add one deliberately and update `privacy.html` if you do. |

```sql
select jobid, jobname, schedule, active
  from cron.job
 where jobname = 'timewise-send-due-reminders';

select start_time, status, response
  from cron.job_run_details
 where jobid = (
   select jobid from cron.job where jobname = 'timewise-send-due-reminders'
 )
 order by start_time desc
 limit 20;
```

```sql
-- Recent Paystack webhook events and the resulting entitlements (billing enabled)
select event_id, event_type, received_at
  from public.stripe_webhook_events
 order by received_at desc
 limit 20;

select user_id, plan, status, current_period_end, cancel_at_period_end, updated_at
  from public.subscriptions
 order by updated_at desc
 limit 20;
```

Recommended operational alerts: any non-200 on the function health check, repeated `401` responses (cron secret mismatch), `failed > 0` over several runs, cron job `active = false`, Paystack webhook failures/retries, unexpected `plan='pro'` rows, and certificate expiry. Keep a privacy-friendly analytics plan in mind; the app currently contains none.

---

## 11. Go-live checklist

| # | Item | Evidence / command |
| --- | --- | --- |
| 1 | Static site deployed over HTTPS on final hostname | `curl -I https://app.example.com/` |
| 2 | `config.js` has production URL, publishable key, VAPID public key, optional `redirectUrl`, and deliberate `paystackPublicKey` choice | Diff against environment plan; no secret keys present |
| 3 | All SQL migrations applied in §5 order (including `billing.sql` if billing is on) | Tables visible in Table Editor; RLS queries in §8.1 pass |
| 4 | Auth Site URL + all redirect URLs (including `https://localhost/*`) configured | Test signup, login, reset, OAuth if enabled |
| 5 | All Edge Functions deployed with the right JWT flags; VAPID secrets match | 401 unauthenticated, JSON 200 with cron secret; `config.toml` review |
| 6 | pg_cron job active every 5 minutes (or external cron live) | `cron.job` query + `job_run_details` |
| 7 | If billing is on: Paystack secrets set, webhook endpoint registered, `pricing.html` exists and is cached | Paystack test payment → `subscriptions` row → Settings shows plan; no `503` in logs |
| 8 | If billing is off for Play: `paystackPublicKey: ''`, store copy does not promise paid tiers, Play Billing policy reviewed | See `STORE_LISTING.md` §8/§9 |
| 9 | SW cache name bumped and generated copies synced (include `billing.js`/`pricing.html` if used) | `npm run web:sync` / `npm run cap:sync`; DevTools `caches.keys()` |
| 10 | PWA install + offline shell verified | Install banner, standalone launch, offline load |
| 11 | Unit/smoke/push-probe checks green | Commands in §9 |
| 12 | Android release AAB/APK signed, versionCode bumped, keystore backed up outside repo | Android Studio / Gradle output |
| 13 | Store listing, screenshots, privacy policy (incl. Paystack), terms, and content rating published | Links return 200; see `STORE_LISTING.md` |
| 14 | Backup taken and restore drill completed | `pg_dump`/Supabase backup + Settings → Import / restore |
| 15 | Monitoring/uptime alerts configured (incl. Paystack webhook) | Dashboard links + cron/function/webhook alerts |
| 16 | Rollback owner and previous deploy tagged | Previous deploy ID / git tag recorded |
