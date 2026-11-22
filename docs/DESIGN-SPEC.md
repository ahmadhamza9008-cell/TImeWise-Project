# TimeWise — Product Design Specification

**Document type:** Figma-handoff-equivalent product design specification
**Status:** Current implementation baseline (single source of truth)
**Last updated:** 22 November 2026
**Scope:** Root-level source files of the TimeWise web application (v1.1 + Pricing/Pro billing). Mirrored copies under `www/` and `android/app/src/main/assets/public/` are generated artifacts and are explicitly out of scope.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Information Architecture & Page Inventory](#2-information-architecture--page-inventory)
3. [Design Tokens](#3-design-tokens)
4. [Component Library](#4-component-library)
5. [Page-by-Page Specifications](#5-page-by-page-specifications)
6. [User Flows](#6-user-flows)
7. [Accessibility Specification](#7-accessibility-specification)
8. [Motion & Interaction Principles](#8-motion--interaction-principles)
9. [Design QA Checklist](#9-design-qa-checklist)
10. [Figma File Structure](#10-figma-file-structure)
11. [Appendix A — Data, State & PWA Behavior](#appendix-a--data-state--pwa-behavior)

---

## 1. Product Overview

### 1.1 Product vision

TimeWise is a calm, fast, accessible personal task and time-management companion. It helps people plan their day, focus on what matters, and understand where their time goes — across web and mobile, online or offline. The product deliberately avoids "theatre" productivity UI: it presents one clear next action, gentle guidance, and honest progress. The marketing promise is *"Plan your day. Own your time."* with the tagline *"Your day, beautifully organized."*

### 1.2 Target users

- **Busy professionals & hybrid workers** juggling meetings, deep work, and shifting priorities across devices and time zones.
- **Students & freelancers** who need simple planning, recurring routines, and focus sessions without complex project-management overhead.
- **Accessibility-conscious users** who rely on keyboard navigation, screen readers, high contrast, reduced motion, and configurable reminders.
- **Offline / low-bandwidth users & field workers** who need the app to open instantly and keep working without a reliable connection.
- **Privacy-conscious users** who want explicit control over their data, export/backup, and account deletion.

### 1.3 Jobs to be Done (JTBD)

1. *"When my day is scattered, help me decide what to work on next, so I can start with confidence."*
2. *"When I need deep work, help me run a timed focus session linked to a task, so I stop context-switching."*
3. *"When something is due, remind me at the right time in my local time zone, so I never miss it."*
4. *"When I switch devices, keep my tasks and sessions in sync, so I never lose my place."*
5. *"When I want to reflect, show me honestly where my time went, so I can improve my habits."*
6. *"When I'm offline, let me keep planning, so the tool never gets in my way."*
7. *"When I'm ready to pay or stop paying, let me manage my plan simply and transparently."*

### 1.4 Feature set (implemented, v1.1 + billing)

- Task capture, edit, complete, delete, **subtasks**, **recurrence** (daily/weekly/monthly), priority, categories, due dates/times, per-task reminders, **snooze**, pinned "Top 3" focus tasks, and drag-free **keyboard reordering** of the daily plan.
- **Focus sessions** (25/50-minute presets, linked tasks) with a live countdown and completion logging.
- **Calendar** month grid with tasks, daily planning, and completion directly from cells.
- **Insights** dashboard with completion/overdue/streak/focus-time statistics, a 7-day activity chart, category breakdown, and CSV export.
- **Daily planning** flow with a guided sidebar on the dashboard.
- **Dark theme**, per-user timezone, notification settings, and push notifications.
- **PWA** installability, offline app shell, background sync of changes, and push notification handling.
- **Authentication**: email/password, Google & GitHub OAuth, password reset, local demo mode.
- **Preferences & data**: settings search, export/import (JSON), full backup, account deletion, cache clearing.
- **Pricing & billing**: Free and Pro ($5/month) plans, Stripe Checkout + Billing Portal, entitlement-aware feature gating.

### 1.5 Seven core requirements (from README.md)

| # | Requirement | Implementation summary |
|---|-------------|------------------------|
| R1 | **Security** | Row Level Security on all Supabase tables; auth-required Edge Functions for Stripe; sanitized inputs; no secrets in client config beyond public keys. |
| R2 | **Synchronization** | Supabase Postgres + realtime subscriptions; optimistic local state; 250ms debounced refetch; refetch on window focus/visibility; offline change queue via SW background sync. |
| R3 | **Time zones** | Per-profile `timezone` setting; date/time storage and display normalized through `toLocalDateKey`/`formatDate`/`formatTime`; monthly recurrence clamped to month length. |
| R4 | **Accessibility** | Semantic landmarks, skip link, live region, full keyboard operation, visible focus rings, `prefers-reduced-motion`, ARIA on dialogs/toggles/tabs; manual checklist provided. |
| R5 | **Performance** | Preconnect/preload of fonts & critical CSS, cached app shell (v8), lazy loading of charts, 1,500ms network timeout in SW, minimal JS bundles. |
| R6 | **Backup** | JSON export/import, full backup (tasks + sessions + preferences), restore with validation, account deletion, cache reset. |
| R7 | **Notifications** | In-app notification center (overdue/soon/later grouping), per-task reminders, 60-minute snooze, configurable lead times, Web Push via VAPID, SW display. |

### 1.6 Guiding design principles

- **Clarity over cleverness:** one primary action per view, descriptive labels, no ambiguous icon-only controls.
- **Calm visual language:** teal/green accent on near-white slate, generous whitespace, soft radii, no heavy shadows except elevated overlays.
- **Inclusive by default:** 48px minimum touch targets, 4.5:1+ text contrast, keyboard parity for every pointer interaction.
- **Resilient:** loading, empty, error, offline, and "local demo" states are first-class designs, not afterthoughts.
- **Honest feedback:** every mutation produces visible status in the polite live region and/or a toast.

---

## 2. Information Architecture & Page Inventory

### 2.1 Sitemap / IA diagram

```text
TimeWise
├── Marketing & acquisition
│   ├── index.html          (Landing / waitlist)
│   └── pricing.html        (Free vs Pro plans, FAQ, checkout entry)
├── Authentication
│   ├── register.html       (Create account / Google / GitHub)
│   ├── login.html          (Sign in / Google / GitHub)
│   └── reset.html          (Request password reset link)
├── Authenticated app (app shell: sidebar + topbar)
│   ├── dashboard.html      (Today overview, Top 3, focus, plan, activity)
│   ├── tasks.html          (Task library, filters, subtasks, snooze)
│   ├── calendar.html       (Month grid, day planning, add/complete)
│   ├── insights.html       (Statistics, activity chart, CSV export)
│   └── settings.html       (Profile, preferences, data, notifications)
└── Legal
    ├── privacy.html        (Privacy policy)
    └── terms.html          (Terms of service)
```

Navigation rules:
- Public pages: persistent header with logo, anchor nav, "Sign in" and "Get started" CTAs.
- App pages: shared sidebar (`Dashboard`, `Tasks`, `Calendar`, `Insights`, `Settings`) collapsed into an off-canvas drawer at ≤860px; topbar with page title, status pill, theme toggle, notification bell, and user avatar.
- `aria-current="page"` is applied to the active sidebar link; `aria-pressed` to toggles.
- Legal pages are linked from marketing/app footers and from Settings → Privacy/Terms.

### 2.2 Page inventory (12 current pages)

| # | File | Purpose | Auth | Scripts | Primary CTA |
|---|------|---------|------|---------|-------------|
| 1 | `index.html` | Landing, waitlist, feature tour, testimonials, FAQ | Public | `landing.js` | "Start planning free" / waitlist form |
| 2 | `register.html` | Create account, OAuth, link to login | Public | `auth.js` | "Create account" |
| 3 | `login.html` | Sign in, OAuth, "Forgot password?" | Public | `auth.js` | "Sign in" |
| 4 | `reset.html` | Request reset email / set new password | Public | `auth.js` | "Send reset link" / "Update password" |
| 5 | `dashboard.html` | Today, Top 3, focus card, plan, activity | App | `dashboard.js`, `notifications.js` | "Add task" / "Start focus" |
| 6 | `tasks.html` | Full task library and management | App | `tasks.js`, `notifications.js` | "New task" |
| 7 | `calendar.html` | Monthly planning and completion | App | `calendar.js`, `notifications.js` | "Add task" |
| 8 | `insights.html` | Productivity statistics and export | App | `insights.js`, `notifications.js` | "Export CSV" |
| 9 | `settings.html` | Profile, preferences, data, notifications | App | `settings-page.js`, `notifications.js` | "Save changes" / "Export" |
| 10 | `privacy.html` | Privacy policy | Public | `main.js` | Back to home |
| 11 | `terms.html` | Terms of service | Public | `main.js` | Back to home |
| 12 | `pricing.html` | Plan comparison, FAQ, billing entry | Public/App-aware | `billing.js`, `pricing.js`, `main.js` | "Continue free" / "Upgrade to Pro" |

> The original 11-page core inventory is preserved above; `pricing.html` is the current 12th companion page introduced with the Pro billing tier and is documented throughout.

### 2.3 Shared shell anatomy

- **Sidebar** `248px` wide; logo/wordmark, primary nav list, "Focus mode" toggle, "Install app" action, user block with plan badge, sign-out.
- **Topbar** `72px` tall; mobile menu button, page title, sync status pill (`Saved`, `Saving…`, `Offline — changes queued`), theme toggle, notifications bell with unread badge, avatar menu.
- **Main content** max-width `1440px` on dashboard; `container` (`min(100% - 40px, 1160px)`) on marketing/auth/pricing pages.
- **Notification drawer** and **off-canvas sidebar overlay** are the two global overlays; both trap focus, close on Escape, and restore focus on close.

---

## 3. Design Tokens

All tokens are defined in `assets/css/tokens.css` and consumed by every stylesheet. Dark theme overrides are in `assets/css/theme.css` under `html[data-theme="dark"]`. Values below are verbatim from source.

### 3.1 Color tokens

| Token | Light value | Dark value | Usage |
|-------|-------------|------------|-------|
| `--ink` | `#0f172a` | `#e2e8f0` | Primary text, headings |
| `--ink-soft` | `#334155` | `#cbd5e1` | Secondary text, labels |
| `--muted` | `#64748b` | `#94a3b8` | Metadata, placeholders, captions |
| `--line` | `#e2e8f0` | `#1e293b` | Borders, dividers, hairlines |
| `--surface` | `#ffffff` | `#0b1220` | Panels, cards, app background |
| `--surface-soft` | `#f8fafc` | `#111c2e` | Page background, subtle fills, inputs |
| `--accent` | `#0d9488` | `#2dd4bf` | Primary actions, active states, links |
| `--accent-dark` | `#0f766e` | `#5eead4` | Hover/focus of accent controls |
| `--accent-light` | `#ccfbf1` | `#134e4a` | Accent tints, selected row backgrounds |
| `--glow` | `#2dd4bf` | `#2dd4bf` | Focus ring, highlight glow |
| `--amber` | `#f59e0b` | `#f59e0b` | Warnings, streaks, "soon" states |
| `--danger` | `#ef4444` | `#f87171` | Destructive actions, overdue |
| `--success` | `#10b981` | `#34d399` | Success, completed states |

Dark theme additionally sets `color-scheme: dark` so native form controls and scrollbars adapt.

### 3.2 Shape, type, layout tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--radius` | `18px` | Default card/button/input corner radius |
| `--radius-sm` | `10px` | Small chips, badges, inputs in dense UIs |
| `--radius-lg` | `26px` | Hero panels, large dialogs |
| `--container` | `1160px` | Max content width for marketing/auth/pricing |
| `--font-body` | `"Inter", system-ui, sans-serif` | Body copy, UI labels |
| `--font-display` | `"Sora", "Inter", sans-serif` | Headings, wordmark, numeric stats |
| `--shadow-soft` | `0 10px 30px rgba(15,23,42,.08)` | Card elevation |
| `--shadow-lift` | `0 18px 45px rgba(15,23,42,.14)` | Dialogs, popovers, hovered cards |
| `--sidebar-w` | `248px` | App sidebar width |
| `--topbar-h` | `72px` | App topbar height |
| `--focus-ring` | `3px solid var(--glow)` / offset `3px` | Global `:focus-visible` |

### 3.3 Typography scale

| Role | Font | Size / line-height | Weight | Tracking |
|------|------|--------------------|--------|----------|
| Display / Hero H1 | Sora | `clamp(2.6rem, 5vw, 4.5rem)` / `1.05` | 700 | `-0.03em` |
| Section H2 | Sora | `clamp(1.9rem, 3.2vw, 2.75rem)` / `1.12` | 700 | `-0.02em` |
| Card H3 | Sora | `1.25rem` / `1.3` | 600 | `-0.01em` |
| Body | Inter | `1rem` / `1.6` | 400 | normal |
| Small / caption | Inter | `0.875rem` / `1.5` | 400–500 | normal |
| Micro / badge | Inter | `0.75rem` / `1.4` | 600 | `0.02em` |
| Stat number | Sora | `2.25rem` / `1` | 700 | `-0.02em` |

Fonts are loaded from Google Fonts with `preconnect` and `display=swap`; critical CSS is preloaded for first paint.

### 3.4 Spacing scale

Base 4px grid: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80px` mapped to `--space-1 … --space-11`. Typical card padding `24px`, section vertical rhythm `80px`, grid gaps `16–24px`.

### 3.5 Responsive breakpoints

| Context | Breakpoints (px) | Behavior |
|---------|------------------|----------|
| Landing / marketing | 980, 760 | 3-col → 2-col → 1-col; nav collapses |
| Auth | 900, 520 | Split layout → stacked; form full-width |
| Dashboard | 1120, 860, 560 | Sidebar off-canvas at 860; cards stack at 560 |
| Tasks | 1120, 760, 560 | Toolbar wraps; list rows compact |
| Calendar | 1120, 640 | Day cells shrink; agenda/list fallback at 640 |
| Insights | 1080, 640 | Chart grid stacks; stats 2-col → 1-col |
| Settings | 1000, 560 | Tabs → stacked accordion-style sections |
| Pricing | 760 | 3-col → 1-col; FAQ narrows |

---

## 4. Component Library

### 4.1 Buttons

| Variant | Spec | Use |
|---------|------|-----|
| `.btn` | min-height `48px`, radius `18px`, padding `0 22px`, font-weight 600, solid accent fill, white/dark text | Primary actions |
| `.btn-lg` | min-height `56px`, larger padding, display font label | Hero CTAs |
| `.btn-sm` | min-height `40px`, radius `10px`, smaller padding | Inline/table actions |
| `.btn-ghost` | transparent, `1px solid var(--line)` | Secondary/cancel |
| `.btn-soft` | `--accent-light` fill, `--accent-dark` text | Selected/toggle state |
| `.btn-icon` | square, icon + accessible label | Theme, bell, menu |
| `.btn-danger` | `--danger` fill | Destructive confirmations |

States: hover lifts with `--shadow-lift` and shifts `--accent-dark`; active translates down `1px`; disabled is `opacity:.55` and `pointer-events:none`; focus uses global ring. Loading state shows inline spinner and sets `aria-busy="true"`.

### 4.2 Inputs & forms

- Text, email, password, date, time, number, select, and textarea share `48px` min height, `1px solid var(--line)`, radius `10px`, background `--surface-soft`, padding `12px 14px`.
- Labels are always visible (no placeholder-only fields); help text uses `--muted` `0.875rem`.
- Error state: `1px solid var(--danger)` + inline message with `role="alert"`.
- Checkbox/toggle: custom switch with `aria-pressed` or native checkbox; 44px hit area.
- Search fields use a leading magnifier icon and `aria-label` (e.g., "Search tasks", "Search settings").
- Form validation is inline; auth errors surface both inline and in the live region.

### 4.3 Cards & panels

- `.card`: `--surface` fill, `1px solid var(--line)`, radius `18px`, padding `24px`, `--shadow-soft`.
- `.panel`: larger container for dashboard sections with header row (title + action link).
- `.stat-card`: label (`--muted` small caps), big number (Sora 700), delta/trend chip, optional sparkline.
- Task row: checkbox, title, metadata chips (priority, category, due, reminder), subtask progress, KEBAK (ellipsis) menu, drag/reorder handle with keyboard fallback.

### 4.4 Navigation

- Marketing header: sticky, translucent `--surface` with blur, logo left, anchor nav center, auth CTAs right; hamburger below 760px.
- Sidebar nav item: 44px tall, icon + label, active state `--accent-light` fill + `--accent-dark` text + left accent bar.
- Tabs (settings, insights): underline style with `role="tablist"`, `aria-selected`, arrow-key navigation.

### 4.5 Chips, badges & status pills

- Priority chips: High (`--danger` tint), Medium (`--amber` tint), Low (`--accent-light`).
- Category chips: neutral outline with colored dot.
- Reminder chip: bell icon + humanized lead time.
- Plan badge: `Free` (neutral) / `Pro` (accent gradient with star).
- Sync pill: `Saved` (success dot), `Saving…` (amber pulse), `Offline — changes queued` (muted dot).

### 4.6 Overlays & dialogs

- Notification drawer: right-side panel (`role="dialog"`, `aria-modal="true"`), 360px wide, grouped sections Overdue / Soon / Later, mute tags, "Snooze 60 min", "Mark all read".
- Confirm dialogs: centered modal with backdrop, destructive action in `--danger`, Escape/backdrop close, focus returned to trigger.
- Mobile sidebar: off-canvas left drawer with semi-transparent overlay; sets `inert` and `aria-hidden="true"` on background content while open.

### 4.7 Charts & data viz

- 7-day activity bar chart: CSS/SVG bars in `--accent`, hover tooltip, reduced-motion disables growth animation.
- Focus-time donut / category breakdown: accessible `<figure>` with `<figcaption>` and a visually hidden data table for screen readers.

### 4.8 Empty, loading & error states

- Empty states: friendly illustration (inline SVG, muted/accent palette), headline, one-line explanation, primary CTA.
- Loading: skeleton blocks matching card/row shapes; never a bare spinner for >300ms operations.
- Error: inline banner with `role="alert"`, plain-language message, retry action; offline state explains changes are queued.

---

## 5. Page-by-Page Specifications

### 5.1 `index.html` — Landing

- **Hero:** H1 "Your day, beautifully organized.", subhead "Plan your day. Own your time.", email waitlist form with submit button, trust row (free to start, works offline, accessible).
- **Sections:** hero and app preview, feature grid (planning, focus, insights, sync), how-it-works 3 steps, testimonials, FAQ accordion, final CTA, footer with Privacy/Terms/Pricing links. Pricing is linked from the header nav and footer.
- **Interactions:** waitlist form shows success toast and live-region confirmation; `landing.js` handles submit; anchor nav smooth-scroll (reduced-motion aware).

### 5.2 `login.html` / `register.html` / `reset.html` — Auth

- Split-screen layout: left brand/value panel with abstract time-themed illustration, right centered form card.
- Login: email + password, "Remember me", "Forgot password?", Google/GitHub OAuth buttons, link to register.
- Register: name, email, password + confirm, same OAuth options, terms/privacy acknowledgment.
- Reset: email-only request state and token-based "set new password" state.
- Consistency: all errors inline + live region; OAuth failures show plain-language message; success redirects to `dashboard.html`.

### 5.3 `dashboard.html` — Today

- Greeting header with date (profile timezone), sync pill, "Add task" CTA.
- Top 3 card: three pinned priority tasks with reorder controls (keyboard: focus handle, press Alt+↑/↓).
- Focus card: 25/50 presets, linked-task select, Start/Pause/Reset, circular countdown, completion toast.
- Today plan: ordered task list with checkboxes and inline add.
- Activity snapshot: 7-day mini chart, completion/overdue/focus stats, "View insights" link.
- Sidebar daily-planning hint; notification bell opens drawer.

### 5.4 `tasks.html` — Task library

- Toolbar: search (debounced), status filter (All / Today / Upcoming / Completed / Overdue), category filter, priority filter, sort, "New task" CTA.
- Task rows: complete checkbox, title (strikethrough when done), chips, subtask progress bar, reminder/snooze indicator, actions menu (Edit, Add subtask, Snooze 1h, Duplicate, Delete).
- New/Edit task form as slide-over dialog: title, notes, due date + time, priority, category, recurrence (none/daily/weekly/monthly), reminder lead time, subtasks list, "Pin to Top 3".
- Pro gating: task count beyond `FREE_TASK_LIMIT` and subtasks beyond `FREE_SUBTASK_LIMIT` show upgrade inline notice linked to `pricing.html` (local demo bypass).

### 5.5 `calendar.html` — Calendar

- Month grid with weekday headers, prev/next/today controls, timezone-aware "today" highlight.
- Day cells show up to 3 task dots/titles with "+N more"; clicking a day opens an agenda panel.
- Agenda panel: add task for that date, complete tasks inline, drag not required; keyboard arrows navigate days.
- Legend for priority colors; empty days show subtle "+" affordance.

### 5.6 `insights.html` — Insights

- Stat cards: completed, overdue, current streak, total focus time, completion rate.
- 7-day activity bar chart with hover/focus tooltips and screen-reader table.
- Category breakdown donut/list with percentages.
- Focus-session history list (duration, linked task, date).
- "Export CSV" button generating a downloadable report; empty states for new accounts.

### 5.7 `settings.html` — Settings

- Sections via tablist: Profile, Preferences, Notifications, Data & Backup, Billing.
- Profile: display name, email (read-only or editable), timezone select (IANA), avatar, plan badge with "Manage billing".
- Preferences: theme (System / Light / Dark) with live preview, start-of-week, default reminder lead time, focus duration default.
- Notifications: per-category toggles, reminder lead-time checkboxes (`-1, 0, 5, 10, 15, 30, 60`), Web Push "Enable notifications" with permission-state messaging.
- Data & Backup: Export all data (JSON), Export CSV (summary), Import/restore (Merge or Replace with file picker + validation), Clear completed (two-step confirm), Reset local data (two-step confirm). Signed-in users can sign out from Account/Notifications panels.
- Settings search filters/visible-highlights sections; `settings-page.js` handles all panels and status feedback.
- Billing section: current plan, usage vs Free limits, "Upgrade"/"Manage plan" link to `pricing.html` or portal.

### 5.8 `pricing.html` — Plans & billing

- Header: "Simple, honest pricing", subhead, plan badge reflecting the current entitlement, and a `?checkout=success|cancel|billing=return` status banner.
- Two plan cards: **Free** `$0` forever (25 active tasks, 3 steps per task, planner, calendar, focus timer, Insights, reminders, backup) and **Pro** `$5` / month (unlimited tasks and steps, everything in Free, early access to new planning tools).
- Comparison table and FAQ accordion (limits, cancellation, card storage, local demo).
- CTA states: local demo → "All features unlocked" (disabled) and a demo explanation; configured + Free → "Upgrade to Pro" (opens Stripe Checkout; signed-out users get a sign-in message); configured + Pro → "You are on Pro" plus "Manage billing" (Stripe portal).
- `billing.js` exposes `window.TimeWiseBilling` with `configured()`, `getState()`, `refresh()`, `setUser()`, `subscribe()`, `limits()`, `checkTaskCreation()`, `checkSubtaskCreation()`, `startCheckout()`, `openPortal()`. Current `stripePublishableKey: ''` means billing is **not configured** in this checkout: all features are unlocked for local demo. With a valid `pk_test_`/`pk_live_` key + configured Supabase, checkout/portal call Edge Functions `create-checkout-session` and `create-portal-session`.

### 5.9 `privacy.html` / `terms.html` — Legal

- Single-column readable document, max-width 720px, H1 + last-updated date (`21 November 2026`), section anchors, plain-language summary callout.
- Privacy covers data collected, Supabase storage, Stripe billing data, push tokens, retention, deletion, and contact. Terms cover acceptable use, subscriptions, refunds, and liability.
- Footer links back to home, pricing, and the companion legal page.

---

## 6. User Flows

Each flow lists the concrete steps, states, and feedback used in implementation.

### Flow 1 — Landing, waitlist & signup
1. Visitor lands on `index.html` → sees hero and CTA.
2. Submits email to waitlist → inline success state + live-region confirmation + toast.
3. Clicks "Get started" → `register.html`.
4. Completes email/password or Google/GitHub OAuth → account created → redirect `dashboard.html`.

### Flow 2 — Login, password reset & OAuth
1. Returning user opens `login.html` → enters credentials or chooses OAuth.
2. Success → `dashboard.html`; failure → inline error + live region.
3. "Forgot password?" → `reset.html` → submit email → "Check your inbox" confirmation.
4. Email link → `reset.html` with token → set new password → sign-in redirect.

### Flow 3 — Local demo to dashboard
1. With no Supabase session configured/signed in, the app runs in local demo mode.
2. `app-settings.js` and page scripts render the local identity and load seeded/local tasks from `window.TimeWiseStore`.
3. The app-status badge shows "Local demo" and settings explain that tasks are saved on this device.
4. Tasks, focus, and settings work against local storage; billing remains unlocked when Stripe is not configured.

### Flow 4 — Daily planning & focus session
1. Dashboard "Top 3" → add up to three priority tasks; reorder with Alt+↑/↓ (focus retained on handle).
2. Focus card → choose 25 or 50 minutes, select linked task, press Start.
3. Timer counts down; Pause/Reset available; on completion a `focus_sessions` record is saved.
4. Toast + live-region confirmation; dashboard stats, activity chart, and Insights update.

### Flow 5 — Task CRUD, recurrence, subtasks & snooze
1. `tasks.html` → "New task" → fill title, due date/time, priority, category, recurrence, reminder, subtasks.
2. Save → row appears; realtime sync across devices; local state optimistic.
3. Edit/duplicate/delete via row menu with confirm for delete.
4. Recurring tasks **stay open** after completion: daily `+1 day`, weekly `+7 days`, monthly clamped to last valid day.
5. Subtasks can be added/toggled; Pro limit of 3 subtasks enforced when billing configured.
6. "Snooze 1h" shifts reminder by 60 minutes; notification drawer offers the same snooze.

### Flow 6 — Calendar add & complete
1. `calendar.html` → navigate months; click a day → agenda panel.
2. "Add task" pre-fills the selected date; save updates month dots and agenda.
3. Complete a task in the agenda → strikethrough + stats update + realtime broadcast.
4. Keyboard arrow keys move between days; Escape closes panel and returns focus.

### Flow 7 — Insights & CSV export
1. `insights.html` → review stat cards, 7-day chart, category donut, focus history.
2. Hover/focus bars for tooltips; screen readers read the hidden data table.
3. "Export CSV" → client-generated file download; toast confirms.
4. New accounts see empty states with "Add your first task" CTA.

### Flow 8 — Settings, backup, theme, timezone & push
1. `settings.html` → settings search or tabs to reach a section.
2. Change theme (System/Light/Dark) → live preview via `data-theme`; persisted to profile/local storage.
3. Change timezone → all times re-render in the new zone; recurring logic recomputes.
4. Notifications → toggle push on/off, quiet hours, muted tags, choose per-task reminder lead times, enable Web Push (permission prompt; graceful denial message).
5. Data → Export JSON / CSV → download; Import → choose file → validate → Merge or Replace; Clear completed / Reset local data use two-step confirmation.
6. Every action shows status in the live region and a toast/banner.

### Flow 9 — Pricing, checkout, portal & PWA install
1. User opens `pricing.html` from the header nav, footer, or Settings → "Your plan".
2. Free plan shows its 25-task / 3-step limits; Pro shows $5/month features. Settings shows live usage against the Free task limit.
3. "Continue free" → dashboard for signed-in users, register page otherwise.
4. With Stripe configured: "Upgrade to Pro" → `startCheckout()` → Edge Function `create-checkout-session` → Stripe Checkout → return to `pricing.html?checkout=success&session_id=…` → webhook writes the entitlement → realtime/`refresh()` updates the Pro badge and unlocks limits.
5. Pro user "Manage billing" → `openPortal()` → Stripe Billing Portal (update card, cancel, invoices), returning to `settings.html?billing=return`.
6. If billing is not configured (current state): the CTA is labelled "All features unlocked"; no limits are enforced and no payment calls are made.
7. PWA: eligible browsers offer install via `pwa.js`; the installed app opens standalone at `./dashboard.html` (manifest `start_url`), with the offline shell served by SW (`timewise-v8`).

---

## 7. Accessibility Specification

Based on `assets/js/a11y.js`, ARIA usage across pages, and `tests/manual-checklist.md`.

### 7.1 Structure & navigation
- Valid HTML5 landmarks: `<header>`, `<nav aria-label="Primary">`, `<main id="main">`, `<footer>`.
- `a11y.js` injects a skip link ("Skip to main content") as the first focusable element, targeting `#main`.
- `a11y.js` injects a polite live region `#timewise-live-status` (`role="status"`, `aria-live="polite"`, visually hidden) used for all state announcements.
- Page titles are unique and descriptive; `lang` set on `<html>`.

### 7.2 Keyboard & focus
- Every interactive element reachable via Tab in logical order; no positive `tabindex`.
- Global focus indicator: `3px solid var(--glow)` outline with `3px` offset on `:focus-visible` — never removed.
- Dialogs/drawers trap focus, close on Escape, and restore focus to trigger on close.
- Off-canvas sidebar sets `inert` + `aria-hidden="true"` on background while open.
- Top-3 reorder: keyboard handle with Alt+Arrow, focus stays on moved item; announce new position via live region.
- Calendar day navigation via arrow keys; tabs via Left/Right arrows.

### 7.3 Semantics & ARIA
- Icon-only buttons have `aria-label` ("Toggle theme", "Notifications", "Open menu").
- Toggles use `aria-pressed`; tabs use `role="tablist"/"tab"/"tabpanel"` with `aria-selected`.
- Active nav uses `aria-current="page"`; dialogs use `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.
- Form errors use `role="alert"` and are programmatically associated with fields.
- Charts have `<figure>/<figcaption>` plus visually hidden data tables.
- Notification drawer groups use headings; mute state has explicit text tags, not color alone.

### 7.4 Contrast & visual
- Text tokens meet WCAG AA (4.5:1 body, 3:1 large text) in both themes; dark theme swaps tokens rather than dimming.
- Color is never the sole conveyor of meaning: priority chips include text labels, status pills include text + shape.
- Minimum target size 44–48px; hit areas extended for small icons.

### 7.5 Motion & time
- All animation/transition durations collapse to `.01ms` under `@media (prefers-reduced-motion: reduce)`.
- Focus timer completion notified via live region + toast, never flashing/strobing content.
- No content flashes >3 times/second.

### 7.6 Forms, auth & errors
- Visible labels, autocomplete attributes, clear password requirements, inline validation.
- Timezone select is a labelled native `<select>` with IANA zone list.
- File import states accepted format and validation errors in text.

### 7.7 Testing
- Automated: axe/Lighthouse target ≥95 accessibility score.
- Manual: complete `tests/manual-checklist.md` including keyboard-only pass, screen-reader smoke (NVDA/VoiceOver), 200% zoom, and reduced-motion OS setting.

---

## 8. Motion & Interaction Principles

### 8.1 Animation inventory (from CSS)

| Name | Trigger | Duration / easing | Purpose |
|------|---------|-------------------|---------|
| `pulse` | Accent dots, sync "Saving…", attention cues | ~1.6s ease-in-out infinite | Subtle liveliness |
| `float` | Hero illustration, empty-state art | ~6s ease-in-out infinite | Soft ambient movement |
| `reveal` | Hero/section enter on load | ~600ms ease-out, staggered | Guided attention |
| `banner-in` | Error/success banners | ~280ms ease-out | Enter feedback |
| `toast-in` / `toast-out` | Toasts | ~240ms ease-out/in | Transient confirmation |
| `panel-slide` | Notification drawer, sidebar, slide-overs | ~260ms cubic-bezier | Spatial continuity |
| `bar-grow` | Insights chart bars | ~500ms ease-out | Data entrance |
| `timer-tick` | Focus ring progress | linear, tied to session | Accurate countdown |

### 8.2 Principles
- **Purposeful:** motion explains cause/effect (panel origin, state change), never decorates arbitrarily.
- **Fast:** UI transitions 160–300ms; entrances ≤600ms; never block interaction.
- **Transform/opacity-first:** animate only compositor-friendly properties for smoothness.
- **Reduced-motion:** a single global rule forces `.01ms` durations; content remains fully functional without animation.
- **Feedback parity:** every pointer action has a keyboard equivalent with the same visible/live-region feedback.
- **No autoplay media:** content is static or user-triggered.

---

## 9. Design QA Checklist

Use before every handoff and release. Each item should be verified in both Light and Dark themes and at the breakpoints in §3.5.

### Visual & tokens
- [ ] Only tokens from `tokens.css` used; no hard-coded hex in new components.
- [ ] Light and Dark themes verified; `color-scheme: dark` active in dark.
- [ ] Typography scale, spacing grid, radii, and shadows match §3.
- [ ] Responsive layouts checked at every documented breakpoint; no overflow or clipped text.

### Components & states
- [ ] All button variants, hover/active/disabled/loading states present.
- [ ] Inputs have visible labels, help text, and error states.
- [ ] Empty, loading (skeleton), error, offline, and demo states designed for every data view.
- [ ] Chips/badges include text, not color alone.

### Content & flows
- [ ] All 12 pages present and reachable; IA/nav active states correct.
- [ ] All 9 flows walkthrough-complete with success + failure states.
- [ ] Copy is plain-language; no orphaned "Version 1.0" strings (source uses v1.1).
- [ ] Legal pages show last-updated `21 November 2026` and correct cross-links.

### Accessibility
- [ ] Skip link and `#timewise-live-status` present on every page.
- [ ] Full keyboard-only pass; focus visible and correctly ordered/trapped.
- [ ] ARIA roles/states correct; dialogs labelled and Escape/backdrop close tested.
- [ ] Screen-reader smoke test (NVDA/VoiceOver); hidden chart table announced.
- [ ] 200% zoom and 400% reflow; reduced-motion OS setting verified.
- [ ] Contrast ≥4.5:1 body / 3:1 large text in both themes.

### Behavior & data
- [ ] Task CRUD, recurrence rollover (incl. monthly clamp), subtasks, snooze verified.
- [ ] Focus timer 25/50 presets, linked task, session logging, stats/chart update verified.
- [ ] Realtime sync across two clients; offline queue + refetch on focus/visibility verified.
- [ ] Notifications grouping, reminder lead times, mute, snooze, Web Push permission states verified.
- [ ] Timezone change re-renders all dates/times correctly.
- [ ] Export/import/backup/delete-account flows validated; destructive actions require confirmation.
- [ ] Billing: Free limits enforced when configured; demo unlock when `stripePublishableKey: ''`; checkout/portal deep-links return and refresh entitlement.

### PWA & performance
- [ ] Manifest installability; icons correct; standalone launch at `./dashboard.html`.
- [ ] Offline shell works with `timewise-v8`; SW timeout (1,500ms) fallback verified; push notification display verified.
- [ ] Lighthouse: Performance ≥90, Accessibility ≥95, Best Practices ≥90, PWA installable.
- [ ] Fonts preconnected/swap; critical CSS preloaded; charts lazy where applicable.

---

## 10. Figma File Structure

Recommended organization for the design source that corresponds to this spec.

### 10.1 Pages (top-level)
1. **Cover & README** — purpose, version (v1.1), links to this spec, changelog.
2. **Foundations** — colors, typography, spacing, radii, shadows, icons, motion specs.
3. **Components** — atoms (buttons, inputs, chips) and molecules (cards, rows, nav items, dialogs).
4. **Patterns** — app shell, forms, overlays, empty/loading/error states, notifications.
5. **Marketing** — Landing + Pricing frames.
6. **Auth** — Login, Register, Reset frames.
7. **App — Dashboard**
8. **App — Tasks**
9. **App — Calendar**
10. **App — Insights**
11. **App — Settings**
12. **Legal** — Privacy, Terms.
13. **Flows** — 9 user-flow boards with connectors and annotation callouts.
14. **Responsive & Motion** — breakpoint variants and prototype motion curves.
15. **Handoff / Dev Notes** — links to CSS variables, ARIA notes, QA checklist.

### 10.2 Naming convention
`Page / Section / Component / State — Variant` — e.g., `App - Tasks / TaskRow / Default — Overdue`, `Foundations / Color / Accent / Light`. Auto-layout for all frames; constraints on every resizable layer.

### 10.3 Component setup
- **Variants** for Button (variant × size × state), Input (type × state), Chip (tone), TaskRow (status × priority), Toggle (on/off), StatusPill (synced).
- **Boolean properties** for icon/loading; **text properties** for labels; **instance swap** for icons.
- All colors/type bound to Foundation styles/variables with Light/Dark modes mirroring `tokens.css`.

### 10.4 Prototype & handoff notes
- Prototype the 9 flows with clickable CTAs, overlays, and success/failure branches; use Smart Animate with the durations in §8.
- Annotate keyboard interactions (Alt+↑/↓ reorder, Escape, arrow-key tabs/calendar) and live-region announcements directly on frames.
- Attach this spec and `tests/manual-checklist.md` as Dev Resources; include token variable names in component descriptions so engineering can map 1:1 to CSS.

---

## Appendix A — Data, State & PWA Behavior

### A.1 Storage & sync
- Local keys: `timewise_tasks`, `timewise_focus_sessions`, `timewise_billing`, account-keyed caches (e.g., `timewise_tasks:<user-id>`).
- Supabase tables: `profiles`, `tasks`, `subtasks`, `focus_sessions`, `subscriptions`; Row Level Security scoped to `auth.uid()`.
- Realtime subscriptions broadcast task/session/profile/subscription changes; local state updates optimistically, with a `250ms` debounced refetch and refetch on window focus/visibility change.
- Offline edits queue via SW background sync and flush when connectivity returns.

### A.2 Recurrence rules
- Daily: `+1 day`; Weekly: `+7 days`; Monthly: `+1 month` clamped to the last valid day of shorter months; recurring completions keep the task open with the new due date.

### A.3 Notifications
- Reminder lead-time values: `-1, 0, 5, 10, 15, 30, 60` minutes; default `10`.
- Notification center groups: Overdue / Soon / Later, with mute tags and 60-minute snooze.
- Web Push uses VAPID keys in `config.js`; permission denial/deferred states are handled gracefully with inline messaging.

### A.4 Focus sessions
- Presets 25 / 50 minutes; optional linked task.
- Completion logs a `focus_sessions` record and updates dashboard stats, activity chart, and Insights.

### A.5 Billing & entitlement
- `window.TimeWiseBilling`: `configured()` requires a Stripe key matching `/^pk_(test|live)_/` **and** configured Supabase; `getState()` returns cached/plan state; `checkTaskCreation()` / `checkSubtaskCreation()` gate limits; `startCheckout()` / `openPortal()` call Edge Functions `create-checkout-session` / `create-portal-session`.
- Free limits: `FREE_TASK_LIMIT = 25`, `FREE_SUBTASK_LIMIT = 3`; active statuses `['active','trialing']`.
- Current config: `stripePublishableKey: ''` → billing not configured; local demo unlocks all features; pricing CTAs show demo messaging.

### A.6 PWA / service worker
- `sw.js` cache name `timewise-v8`; shell cache includes all app pages **and pricing/billing assets**.
- `NETWORK_TIMEOUT_MS = 1500`: network-first with fast fallback to cache for shell navigations.
- Handles `push` events to display notifications and `notificationclick` to focus/open the app.
- Manifest: name "TimeWise", `start_url: ./dashboard.html`, `display: standalone`, themed icons, theme/background colors matching tokens.

### A.7 Known content inconsistencies (for design/PM awareness)
- `README.md` declares Version 1.1 while several UI strings still read "Version 1.0" — align before release.
- Document dates: legal pages `21 November 2026`; this spec `22 November 2026`.

---

*End of specification. Source of truth: root-level HTML, CSS, and JS in `/home/ahmad/TimeWise/` plus `README.md` and `tests/manual-checklist.md`. Mirrored copies under `www/` and `android/app/src/main/assets/public/` are generated and excluded.*
