# TimeWise — Version 1.1

First development milestone, plus checklists, focus tracking, per-task reminders, daily planning, and dark mode.

## Architecture decision

Build the **web application first**, then build the mobile app on top of the **same backend and design system**. This keeps the API, authentication, data model, and UI tokens consistent across platforms and avoids duplicating business logic.

Mobile starts as an installable **PWA** that reuses the web app, design system, and Supabase backend. A native Android wrapper is included with **Capacitor** for app-store distribution; the web source remains the single source of truth.

## Web stack

Plain **HTML, CSS, and JavaScript**. No framework or build step — open `index.html` directly in a browser. Shared design tokens live in `assets/css/styles.css`; screen-specific styles are layered on top.

## Current state

- `index.html` — landing page
- `register.html` / `login.html` — auth screens (Supabase auth when configured)
- `dashboard.html` — app shell, stats, today's plan (drag to reorder), focus timer linked to a task, live focus chart/activity
- `tasks.html` — full task manager: add, edit, delete, filter, sort, search, priorities, due dates, repeating tasks, subtask checklists, snooze
- `calendar.html` — monthly calendar with tasks per day and quick add
- `insights.html` — progress metrics from your tasks and focus sessions, plus CSV export
- `settings.html` — profile name, focus length, week start, light/dark theme, data export/reset, connection status
- `manifest.webmanifest`, `sw.js`, `assets/js/pwa.js` — installable offline-capable PWA layer

`assets/js/store.js` is the shared task layer used by both the dashboard and task manager. Without Supabase credentials it uses `localStorage`; once configured and signed in, Supabase becomes the source of truth with realtime updates.

## Connect Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/schema.sql` in the Supabase SQL Editor. It creates the `tasks` table, enables RLS, and adds per-user policies.
3. Open your project's **Connect** dialog (or **Settings → API Keys**) and copy:
   - `supabaseUrl` — project URL
   - `supabaseAnonKey` — the publishable key (`sb_publishable_...`) or legacy anon key (never a secret/service_role key)
4. In **Authentication → URL Configuration**, add your site URL and redirect URLs for `register.html`, `login.html`, and `dashboard.html`.
5. Enable Email auth, and optionally Google/GitHub under **Authentication → Providers**.
6. Sign up from `register.html`, then open `dashboard.html` or `tasks.html`. The badge in the top bar shows `Connected` when Supabase is active.

If credentials are missing, the app stays fully usable in **Local demo** mode.

### Account extras (optional but recommended)

Run these in the Supabase SQL Editor too:

- `supabase/recurring.sql` — adds the `repeat` column to `tasks` for daily/weekly/monthly tasks (only needed on projects created before recurring support).
- `supabase/profiles.sql` — creates `public.profiles` so display name, focus length, week start, and theme follow the account across devices. New users get a profile automatically; existing accounts get one on their next visit.
- `supabase/enhancements.sql` — adds subtasks, plan order, per-task reminder lead time, snooze, and the `focus_sessions` table to a project created before v1.1. Fresh projects get all of these from `schema.sql` + `profiles.sql` instead.
- `supabase/waitlist.sql` — stores landing-page early-access emails. Without it, the form confirms locally but doesn't save the address.
- `supabase/push.sql` — required for Web Push (see below).

Password reset sends people to `reset.html`. Add that file to **Authentication → URL Configuration → Redirect URLs**, for example `http://localhost:8000/reset.html`, alongside the existing site URLs.

Legal pages live at `terms.html` and `privacy.html`. Update their wording to match your own policies before launch.

## Recurring tasks

A task can repeat daily, weekly, or monthly. Completing it does not mark it done — it stays open and its due date moves to the next occurrence, so it keeps appearing in Today, Calendar, and Insights. If you miss an occurrence, the next check-in starts from today rather than a past date. The reminder function also treats an unfinished recurring task as due today.

## v1.1 features

- **Subtasks** — add ordered steps to any task on the Tasks screen; tick them off individually.
- **Focus sessions** — pick a task on the dashboard timer; completed sessions are logged per task and appear in the dashboard stats/chart and in Insights (including CSV export).
- **Per-task reminders & snooze** — choose a lead time when editing a task; snooze for an hour from the Tasks list or the notification center.
- **Daily planning** — drag rows in Today's plan to set a custom order; the order is saved per account and used across devices.
- **Dark theme** — switch under Settings → Preferences. The choice is stored locally and synced to your Supabase profile.

## Product hardening

The app now covers the seven core product requirements:

- **Security** — RLS with `FORCE ROW LEVEL SECURITY` on every private table, ownership-safe focus sessions, per-user push endpoints, account-scoped browser cache, and no secret keys in client code.
- **Synchronization** — Realtime for tasks, focus sessions and profiles (with full replica identity), debounced refetches, and refetch on tab focus/visibility.
- **Time zones** — an IANA time zone in your profile drives the calendar day, display, and reminder evaluation on every device. The push subscription's zone is refreshed when the profile changes.
- **Accessibility** — skip links, a live status region, keyboard plan reordering, focus-managed sidebar and notification dialog, named controls, and reduced-motion support.
- **Performance** — small deferred-payload shell, a 1.5 s network-first timeout in the service worker, and no duplicate startup sync.
- **Backup** — **Settings → Your data → Export all data (JSON)** saves tasks, subtasks, focus sessions and preferences; **Import / restore** merges or replaces them.
- **Notifications** — per-task lead time including **Never**, an account-wide mute, quiet hours, and muted tags. These are enforced by the Edge Function and the in-app notification center.

Run `supabase/product-requirements.sql` after the base SQL files to apply these schema and policy changes to an existing project.

## Mobile / PWA

Service workers require `http://` or `https://`, so serve the folder instead of opening `file://`:

```bash
cd TimeWise
python3 -m http.server 8000
```

Then open `http://localhost:8000`. The browser will offer an "Install TimeWise" banner once the PWA criteria are met. `sw.js` caches the app shell for offline use; Supabase requests are never cached.

## Web Push notifications (PWA / browser)

Real push reminders are included. Each task has its own lead time (at the due time, or 5/10/15/30/60 minutes before), and snoozing a task quiets it for an hour before it fires once more. They work in an HTTPS browser / installed PWA. Native Android needs FCM via a Capacitor push plugin and is not covered by this web-push flow.

Setup:

1. Run `supabase/push.sql` in the Supabase SQL Editor. It creates `public.push_subscriptions` with per-user RLS.
2. Generate VAPID keys:
   ```bash
   npm run vapid:keys
   ```
   Paste the **public** key into `vapidPublicKey` in `assets/js/config.js`. Keep the private key secret.
3. Set Edge Function secrets with the Supabase CLI:
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=...
   ```
4. Deploy the sender:
   ```bash
   supabase functions deploy send-due-reminders --no-verify-jwt
   ```
5. Schedule it every 5 minutes. The included `supabase/cron.sql` uses Supabase's own pg_cron + pg_net: it stores the function URL and `CRON_SECRET` in Supabase Vault, then creates a repeating job. Replace the two placeholders (project ref and cron secret) and run it in the SQL Editor. Any external cron service also works:
   ```bash
   */5 * * * * curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$SUPABASE_URL/functions/v1/send-due-reminders"
   ```
6. Open `settings.html` over `http://localhost` or HTTPS and click **Enable notifications**.

The Edge Function resolves the account's profile time zone (falling back to the subscription zone), respects the global mute / quiet hours / muted tags, checks each task's lead time, skips active snoozes, sends the push, and removes stale subscriptions scoped to the owning user. Remember to add `https://localhost/*` to Supabase redirect URLs for the Android WebView.

## Subscriptions & payments (Stripe)

Free includes 25 active tasks and 3 steps per task. Pro is unlimited. When Stripe is not configured, the app stays in **local-demo mode**: all limits are unlocked, the pricing page explains the demo, and no network calls are made. No card data ever reaches TimeWise — Checkout and the billing portal are hosted by Stripe.

Setup (use Stripe **test mode** first):

1. Run `supabase/billing.sql` in the SQL Editor. It creates the read-only `subscriptions` table, the webhook replay table, and realtime publication.
2. Create a recurring monthly Price in Stripe and copy its price ID.
3. Store secrets **only** in Supabase, never in browser files:
   ```bash
   supabase secrets set \
     STRIPE_SECRET_KEY=sk_test_... \
     STRIPE_PRICE_PRO=price_... \
     STRIPE_WEBHOOK_SECRET=whsec_... \
     SITE_URL=https://your-site.com
   ```
   `SITE_URL` must be the deployed site's origin — it becomes the Checkout success/cancel and billing portal return URL.
4. In Stripe, add a webhook endpoint at `https://<project-ref>.supabase.co/functions/v1/stripe-webhook` for these events:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Deploy the functions (JWT settings come from `supabase/config.toml`; only the webhook skips JWT verification because Stripe signs its own requests):
   ```bash
   supabase functions deploy create-checkout-session create-portal-session stripe-webhook --yes
   ```
6. Paste the Stripe **publishable** key (`pk_test_...` / `pk_live_...`) into `stripePublishableKey` in `assets/js/config.js`, bump the service-worker cache version in `sw.js`, then sync/redeploy the site.

`create-checkout-session` and `create-portal-session` verify the signed-in user from the Supabase JWT. The webhook verifies the Stripe signature (HMAC-SHA256, 5-minute tolerance), rejects replays, and is the only writer of entitlements. Users see their plan on `settings.html` and can upgrade or manage billing from `pricing.html`.

## Native Android app (Capacitor)

The project includes a Capacitor Android wrapper. It loads the same static app in a WebView; there is no separate mobile codebase.

Prerequisites: Node.js 18+, npm, Android Studio with the Android SDK, and a Java JDK.

```bash
npm install
npm run cap:sync      # copies web files into www/ and syncs the native project
npm run cap:open:android   # opens the Android project in Android Studio
npm run cap:build:android  # builds a debug APK
```

`capacitor.config.json` uses `webDir: "www"` and `androidScheme: "https"`, so the WebView origin is `https://localhost`. Add `https://localhost/*` to Supabase **Authentication → URL Configuration → Redirect URLs** so email confirmation and OAuth return to the app.

`scripts/sync-web.js` copies only the HTML files, `manifest.webmanifest`, `sw.js`, and `assets/` into `www/`. Run it before every native build — edits in the project root are not picked up until you do. `npm run assets:native` regenerates the Android launcher icons and splash screens from `assets/img/icon-512.png`. iOS requires macOS/Xcode and can be added later with `npx cap add ios`.

The `android/` project is already generated and synced. Building an APK additionally requires Android Studio, its SDK, and a Java JDK on the machine doing the build.

## Testing

```bash
node tests/store.test.js
node tests/settings.test.js
node tests/billing.test.js
python3 tests/smoke.py
```

See `tests/README.md` for details and `tests/manual-checklist.md` for the pre-release manual pass.

For a live end-to-end check of reminder lead times and snooze handling, run the optional probe against the deployed Edge Function:

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SECRET_KEY=sb_secret_... \
node tests/push-probe.js
```

The probe creates five temporary tasks, invokes the function, checks the results, and deletes its own rows. It uses the existing push subscription, so up to two test notifications may arrive on the registered device. Keep the secret key out of browser code and out of version control.

## Nine-stage build status

| Stage | Status |
| --- | --- |
| 1. Product planning & design spec | Done — `docs/DESIGN-SPEC.md` |
| 2. Landing page & UI | Done |
| 3. Registration & login | Done |
| 4. Task management & dashboard | Done |
| 5. Planner, calendar & focus timer | Done |
| 6. Supabase database & security | Done |
| 7. Subscriptions & payments | Done — local-demo fallback plus Stripe Edge Functions |
| 8. Mobile application | Done — PWA + Capacitor Android wrapper |
| 9. Testing & launch | Testing done — deployment artifacts in `docs/` |

Launch assets: `docs/DEPLOYMENT.md`, `docs/STORE_LISTING.md`, `docs/RELEASE-CHECKLIST.md`.
