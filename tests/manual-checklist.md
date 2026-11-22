# TimeWise — manual test checklist

Run these after changes that affect UI or Supabase. Automated checks live in `store.test.js` and `smoke.py`.

## Landing page

- Hero, feature, FAQ, and footer sections render without horizontal scrolling.
- "Get started free" opens `register.html`; "Log in" opens `login.html`.
- Mobile menu opens/closes and links work below 760px.
- Early-access form shows an error for invalid email and a success message for valid email.

## Registration and login (local demo mode)

- Empty and invalid fields show inline errors.
- Password show/hide works for both password fields.
- Strength meter updates as the password changes.
- Mismatched passwords and unchecked terms block submission.
- Links between register/login work.

## Dashboard

- Greeting matches the time of day; date is current.
- Today's plan shows only today's (or undated) tasks.
- Checking, deleting, and quick-adding a task updates the stats immediately.
- Search filters the list; empty state appears when nothing matches.
- 25/50 minute focus timer starts, pauses, resets, and completes.
- Today's plan rows show a grab cursor; dragging one reorders the list and the new order survives a hard refresh (and syncs across devices when signed in).
- The timer's "Focus on" select lists open tasks; completing a session logs it and updates Focus time, streak, this week's chart, and Recent activity.
- Sidebar opens/closes on mobile; placeholder links show a toast.

## Task manager

- Add, edit, delete, and complete a task.
- Filter by All / Today / Upcoming / Completed.
- Filter by priority and sort by due date, priority, and title.
- Search matches titles, notes, and categories.
- The task form's "Remind me" select offers at-the-time, 5, 10, 15, 30 and 60 minutes before; editing an existing task keeps its choice.
- Add and remove subtask steps in the form; saved steps appear as a checklist on the task row and can be ticked individually.
- The snooze button on a task row hides it from the notification center for an hour and shows a "Snoozed" badge.
- Overdue tasks are highlighted; notes display correctly.
- "Clear completed" needs a second click before deleting.
- Progress summary updates after every change.
- Changes made here appear on the dashboard after refresh.

## Recurring tasks

- The task form offers Does not repeat / Every day / Every week / Every month.
- A recurring task with no due date is placed on today when added.
- Checking off a daily task moves it to tomorrow and leaves it open.
- Weekly moves seven days; monthly clamps to the last day of shorter months.
- The repeating badge appears on the task manager and dashboard.
- Missed recurring tasks still appear in the notification center and Calendar.

## Supabase (when configured)

- Sign-up creates an auth user and redirects to the dashboard (or asks for email confirmation).
- Login and logout work; social providers redirect correctly if enabled.
- Tasks persist after a hard refresh and across devices with the same account.
- A second browser session cannot read or edit the first user's tasks (RLS).
- Realtime updates appear in another open tab.
- The top-bar badge shows "Connected"; errors appear as toasts.

## Calendar

- Current month opens with today highlighted.
- Previous/next month and Today controls work.
- Task chips appear on their due dates, with priority colors and "+N more" for busy days.
- Clicking a day shows its tasks in the side panel and lets you add a task for that date.
- Checking a task in the side panel updates it on the calendar and task manager.
- Search filters both the grid and the side panel.

## Insights

- All time / This week / This month filters change every metric.
- Top-bar search filters the metrics and CSV export.
- Completion donut matches the Completed and Still open cards.
- Priority and category bars scale to the largest value.
- This week chart shows tasks due on each weekday with today highlighted.
- The Focus sessions panel shows total time, session count, average length, and a per-task breakdown; all three change with the date range.
- Export CSV downloads a file with quoted fields, the current filtered tasks, plus `subtasks`, `reminder_minutes`, and `focus_minutes` columns.
- Toggling a task or finishing a focus session on another screen updates Insights on refresh.

## Settings

- Changing the display name updates the dashboard greeting, sidebar, and avatar on every screen.
- Focus length changes the dashboard timer's default and active button.
- Week start changes the Calendar column order and the Insights week view.
- Light/Dark switches the whole app immediately, survives refresh, and follows the account across devices when signed in.
- Export CSV downloads all tasks with the new columns; Clear completed and Reset local data each need a second click. Reset also clears saved focus sessions.
- Reset restores demo tasks but keeps preferences.
- Account panel shows Local demo or the signed-in Supabase email; sign out works when connected.

## PWA / mobile

- Serve over `http://localhost` (service workers do not run from `file://`).
- Chrome/Edge offer the install banner; installing opens the dashboard in standalone mode.
- After install, load the app offline — the cached shell opens and shows a clear offline fallback for network-only data.
- App icons render correctly at 192px and 512px.
- Layout is usable at 390px width with no horizontal scroll.

## Account extras

- Running `supabase/profiles.sql` creates `public.profiles`; changing display name, focus length, week start, or theme updates the row for that user.
- Running `supabase/enhancements.sql` on an older project adds the new task columns and `public.focus_sessions` without errors.
- Signing in on a second browser shows the same name, preferences, task order, subtasks, and focus sessions.
- "Forgot password?" sends an email whose link opens `reset.html` and lets you set a new password.
- Invalid/expired reset links show a clear message and a link back to login.
- The landing early-access form saves an email to `public.waitlist` (or reports "already on the list" on a repeat).
- Terms and Privacy links open real pages from the landing page and registration form.
- Settings search filters the panels and shows an empty message when nothing matches.

## Push notifications

- `supabase/push.sql` runs successfully and `public.push_subscriptions` appears in Table Editor.
- VAPID public key in `config.js` matches the secret used by the Edge Function.
- Settings → Notifications shows an Enable button over HTTPS/localhost.
- Enabling grants permission, creates a subscription row, and flips the button to Disable.
- Disabling unsubscribes and removes the row.
- A task triggers a push at its own lead time (set on the task form), with the task title and time.
- Snoozing from the notification center or Tasks screen suppresses the reminder for an hour, then one follow-up push arrives.
- Clicking the notification opens the task manager.

## Native Android wrapper

- `npm install` succeeds and `npm run cap:sync` copies the latest web files into `www/`.
- The app opens in Android Studio and builds a debug APK.
- Login works inside the WebView; `https://localhost/*` is an allowed Supabase redirect URL.
- Tabs, task editing, Calendar, Insights, and Settings behave the same as in the browser.
- Back button exits the app cleanly from the dashboard.

## Responsive / accessibility

- Check at 1440px, 1024px, 768px, and 390px widths.
- Keyboard navigation reaches all buttons and links; focus rings are visible.
- Form labels are associated with inputs; status messages are announced.
