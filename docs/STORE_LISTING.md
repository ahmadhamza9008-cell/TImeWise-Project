# TimeWise — Store Listing Copy (v1.1)

Use these placeholders consistently across all store submissions and the in-app legal pages:

| Placeholder | Replace with |
| --- | --- |
| `https://app.example.com` | Your production web/PWA origin |
| `https://app.example.com/privacy.html` | Public privacy policy URL (file already exists in the repo) |
| `https://app.example.com/terms.html` | Public terms URL (file already exists in the repo) |
| `hello@timewise.app` | Support email already referenced in `privacy.html` / `terms.html` |

---

## 1. App identity

| Field | Value |
| --- | --- |
| **App name** | TimeWise |
| **Package / application ID** | `com.timewise.app` |
| **Version** | 1.1.0 (`versionName` in `android/app/build.gradle`; `package.json` is `1.1.0`) |
| **One-line tagline** | Plan your day, protect your focus time, and see where your hours go. |
| **Tagline source** | `manifest.webmanifest` description — keep web and store copy aligned |
| **Category (Google Play)** | Productivity (secondary: Tools) |
| **PWA directory category** | Productivity / Utilities |
| **Content rating** | Everyone (see §7) |
| **Languages** | English (all UI copy in the repo is English) |
| **Minimum Android** | API 22 / Android 5.1 (`minSdkVersion = 22` in `android/variables.gradle`); target SDK 34 |

---

## 2. Short description

**Google Play limit: 80 characters. This copy is 76 characters.**

```text
Plan tasks, track focus, and get gentle reminders in one calm daily planner.
```

Alternatives (also ≤80 characters):

```text
A calm task planner with focus sessions, reminders and offline access.   (70)
Plan your day, stay focused, and track progress — no ads, no clutter.    (69)
```

---

## 3. Full description

```text
TimeWise turns a messy to-do list into a calm, focused plan. Capture tasks, protect your deep work time, and finally see where your day goes — on the web, as an installable PWA, or in the Android app.

Everything in one place
• Task manager with priorities, due dates, tags, notes, search, filters and sorting
• Subtask checklists for bigger jobs, plus daily, weekly and monthly repeating tasks
• Monthly calendar with tasks per day and quick add
• Today's plan you can drag into order (and reorder with the keyboard)
• 25/50-minute focus timer that can be linked to a task
• Insights with completion, priority and category views, a weekly chart, focus-session stats and CSV export
• Per-task reminders: at the due time or 5, 10, 15, 30, 60 minutes before, plus "Never"
• Snooze for an hour, account-wide mute, quiet hours and muted tags
• Light and dark themes, configurable week start and IANA time zone
• Works offline with a cached app shell; local demo mode if you don't create an account

What's new in 1.1
Subtasks, task-linked focus sessions, per-task reminder lead times and snooze, drag-and-drop daily planning, dark mode, and stronger privacy controls. See the "What's new" section below for the full list.

Your data, yours to keep
TimeWise has no ads, no behavioural tracking and no selling of your data. Sign-in and cloud sync are handled by Supabase with row-level security: only your account can read or change your tasks, profile and push subscription. Settings → Your data lets you export everything as JSON (tasks, subtasks, focus sessions and preferences), import/restore with Merge or Replace, export a CSV summary, clear completed tasks, or reset local data. Turn notifications off at any time to remove your push subscription.

Optional Pro plan
When billing is enabled, Free includes 25 active tasks and 3 steps per task, while Pro is unlimited. Payments are handled by Paystack’s secure hosted checkout and subscription management; TimeWise never stores your card details. If billing is not enabled in your build, every feature is unlocked and no limits apply.

Start on your laptop, check in from your phone. One account, one calm, consistent plan.
```

**Store formatting note:** Google Play converts `•` bullets well, but if your submission tool strips them, use `-` instead. Keep the "Your data, yours to keep" paragraph — that is the privacy positioning for this listing.

---

## 4. Keywords / discovery terms

Google Play does not expose a separate keyword field; use these terms naturally in the title, short description, and full description. If you also submit to an App Store-style directory that has a 100-character keywords field, the string below is **95 characters**.

```text
planner,tasks,to-do,focus,timer,calendar,reminders,productivity,time tracking,offline,checklist
```

| Theme | Terms |
| --- | --- |
| Core intent | task planner, to-do list, daily planner, checklist, getting things done |
| Differentiators | focus timer, time tracking, deep work, streak, weekly insights |
| Features | calendar, reminders, recurring tasks, subtasks, snooze, dark mode, offline |
| Audience | study planner, work organiser, personal organiser, productivity app |
| Privacy angle | no ads, no tracking, private planner, data export |

Avoid competitor brand names and unsupported claims (for example, "native notifications" — see §8).

---

## 5. Screenshot caption ideas

Google Play requires at least 2 screenshots and allows up to 8. The recommended **five-slot launch set** is dashboard → tasks → calendar → insights → settings; the **landing** caption below is for the web/PWA listing or as a sixth Play slot. Captions are suggestions — keep them short enough to read at thumbnail size.

| Slot | Screen | Caption idea |
| --- | --- | --- |
| Web / optional 6 | **Landing** (`index.html`) | "Make every hour count. A calmer way to plan your day." |
| 1 | **Dashboard** (`dashboard.html`) | "Today's plan, focus time and streaks — all in one view." |
| 2 | **Tasks** (`tasks.html`) | "Subtasks, reminders, due dates and repeating tasks, sorted your way." |
| 3 | **Calendar** (`calendar.html`) | "See your week at a glance and add a task on any day." |
| 4 | **Insights** (`insights.html`) | "See where your hours go, then export the numbers as CSV." |
| 5 | **Settings** (`settings.html`) | "Your theme, time zone, quiet hours and data — under your control." |

Capture at a modern phone size (the app is checked at 390 px width with no horizontal scroll). Use real-looking but fictitious task data; do not include a real email or Supabase URL in screenshots.

---

## 6. What's new — v1.1

```text
Version 1.1 brings the features that make TimeWise a daily habit:

• Subtasks — break any task into ordered steps and tick them off
• Focus sessions — link the timer to a task and see the time in Insights
• Per-task reminders — choose the lead time that fits each task, or Never
• Snooze — quiet a reminder for an hour, then get one follow-up
• Daily planning — drag Today's plan into order, or use the keyboard controls
• Dark theme — switch instantly in Settings, and sync it with your account
• Quiet hours, muted tags and a mute-all switch for reminder control
• IANA time zones so schedules and reminders follow you across devices
• Full JSON backup and restore, including subtasks and focus sessions
• Stronger security: row-level security forced on every private table
```

---

## 7. Privacy policy and data-safety notes

| Item | Value / guidance |
| --- | --- |
| **Privacy policy URL** | `https://app.example.com/privacy.html` |
| **Terms URL** | `https://app.example.com/terms.html` |
| **In-app links** | Both pages are linked from `index.html` and the registration form; keep them reachable over HTTPS. |
| **Data collected (per `privacy.html`)** | Account email, display name and password hash (Supabase Auth); tasks and notes; preferences; push subscription endpoint/keys and time zone; waitlist email only if submitted. If billing is enabled: Paystack customer/subscription codes/identifiers, plan/status and period end. Card details are handled by Paystack, not stored by TimeWise. |
| **Data sharing** | Supabase hosts auth, database and the functions. Google/GitHub only if the user chooses those providers. Google Fonts and the Supabase JS CDN are loaded from public CDNs. **If billing is enabled, Paystack processes payments and subscription events — update `privacy.html` to list Paystack before launch.** |
| **Ads / tracking** | None. The privacy page explicitly says data is not sold and there is no advertising or behavioural tracking. |
| **Account deletion / export** | Privacy page directs users to Supabase account settings or the support email; in-app export/import is under Settings → Your data. |
| **Children** | Not intended for children under 13 (per `privacy.html`). |

If you add analytics, advertising, or native push in a future release, update `privacy.html` **before** changing the store listing's data-safety declarations.

---

## 8. Content rating notes

Suggested answers for the Google Play content questionnaire:

| Question area | Suggested response |
| --- | --- |
| Rating target | **Everyone** |
| Violence, horror, sexual content, language | None |
| Ads | No ads in the app |
| In-app purchases | Optional Pro subscription when billing is enabled, paid through **Paystack hosted checkout (web)**, not Google Play Billing. If you ship the Play build with `paystackPublicKey: ''`, answer "None" and do not advertise paid tiers. See §9 for the Play policy caveat. |
| User-generated content | Private to the signed-in account; no public sharing, chat, or moderation surface |
| Data collection | Email/account data, task content, push subscription, optional waitlist email — described in the privacy policy |
| Permissions | `INTERNET` only (`android/app/src/main/AndroidManifest.xml`) |
| Interactive elements | Unrestricted web content is not browsed; the WebView loads the app's own origin (`https://localhost`) |

If you later enable Google/GitHub sign-in, ads, Paystack payments, or external links inside the WebView, revisit the questionnaire. For a Play build that enables web checkout, check Google Play's policy on digital subscriptions (Play Billing is normally required) before publishing.

---

## 9. Known limitations (be honest in the listing / release notes)

- **Web Push only.** Reminders use the browser Push API plus a Supabase Edge Function and VAPID keys. **Native FCM is not implemented**: there is no Capacitor push plugin (`capacitor.plugins.json` is `[]`), no `google-services.json`, and no native notification permission in the manifest. The Android build's `google-services` plugin is conditional and logs that push will not work when the file is absent.
- Push requires HTTPS (or `localhost`), a registered service worker, browser notification permission, and a signed-in account with a push subscription. iOS is not included in the repository.
- The Android app is a Capacitor WebView wrapper around the same static web app; it is not a separate native UI. Auth relies on the `https://localhost/*` Supabase redirect allow-list.
- Offline mode caches the app shell only. Cloud-synced tasks, profiles, Realtime updates, and push delivery need a network connection; without Supabase credentials the app runs in **Local demo** mode.
- **Paystack billing is web checkout, not Play Billing.** The repo includes `supabase/billing.sql`, `supabase/paystack.sql`, Paystack Edge Functions, `pricing.html`, and `assets/js/billing.js`, but purchases happen on Paystack-hosted pages. Google Play generally requires Google Play Billing for digital subscriptions on Android; either leave `paystackPublicKey: ''` in the Play build (all features unlocked, no limits) or implement Play Billing before selling through Play. The PWA/web store can use Paystack checkout normally.
- Billing is unconfigured by default (`paystackPublicKey: ''`). Free limits (25 active tasks, 3 subtasks per task) are only enforced when a publishable key **and** Paystack secrets are set. `pricing.html` is present and linked from Settings/navigation. Legacy DB identifiers (`stripe_webhook_events`, `stripe_*` columns) remain in the schema for compatibility; Paystack is the active provider.
- No analytics SDK or error-reporting SDK is bundled.
- Minor copy inconsistency to verify before publishing: `settings.html` and the landing page eyebrow still say "Version 1.0" while the shipped version is 1.1.0. Confirm with the product owner whether to leave or update it (documentation only — no source changes made here).
