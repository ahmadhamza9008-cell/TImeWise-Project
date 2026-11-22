// TimeWise — controlled end-to-end probe for due reminders and snooze filtering.
//
// This talks to a live Supabase project and invokes the deployed Edge Function.
// It creates temporary tasks with a unique prefix and deletes them afterwards.
// The existing push subscription is used, so up to two harmless test notifications
// may arrive on the registered device.
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SECRET_KEY=sb_secret_... \
//   node tests/push-probe.js
//
// Never put the secret key in browser code or commit it to the repository.

const BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SECRET = process.env.SUPABASE_SECRET_KEY || '';
const FN = `${BASE}/functions/v1/send-due-reminders`;
const REST = `${BASE}/rest/v1`;
const PREFIX = `QA-PROBE-${Date.now()}-`;

if (!BASE || !SECRET) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY before running this probe.');
  process.exit(2);
}

const headers = {
  apikey: SECRET,
  Authorization: `Bearer ${SECRET}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
};

function localParts(timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minutes: Number(value('hour')) * 60 + Number(value('minute'))
  };
}

function shifted(date, minutes, delta) {
  const total = minutes + delta;
  const dayOffset = Math.floor(total / 1440);
  const m = ((total % 1440) + 1440) % 1440;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return {
    date: d.toISOString().slice(0, 10),
    time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  };
}

async function api(path, options = {}) {
  const res = await fetch(`${REST}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 500)}`);
  return body;
}

async function invoke() {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: '{}'
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`invoke ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

(async () => {
  let created = 0;
  try {
    const subscriptions = await api('/push_subscriptions?select=user_id,timezone');
    if (!subscriptions.length) throw new Error('No push subscriptions found; cannot probe.');
    const { user_id, timezone } = subscriptions[0];
    const now = localParts(timezone);
    console.log(`Subscription user=${user_id} timezone=${timezone} local=${now.date} ${String(Math.floor(now.minutes / 60)).padStart(2, '0')}:${String(now.minutes % 60).padStart(2, '0')}`);

    const near = shifted(now.date, now.minutes, 4);
    const far = shifted(now.date, now.minutes, 20);
    const futureSnooze = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const pastSnooze = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const rows = [
      { title: `${PREFIX}lead-ok`, due: near.date, time: near.time, reminder_minutes: 10, snoozed_until: null },
      { title: `${PREFIX}lead-skip`, due: far.date, time: far.time, reminder_minutes: 5, snoozed_until: null },
      { title: `${PREFIX}zero-skip`, due: far.date, time: far.time, reminder_minutes: 0, snoozed_until: null },
      { title: `${PREFIX}snooze-future`, due: near.date, time: near.time, reminder_minutes: 10, snoozed_until: futureSnooze },
      { title: `${PREFIX}snooze-expired`, due: near.date, time: near.time, reminder_minutes: 10, snoozed_until: pastSnooze }
    ].map((row) => ({ ...row, user_id, done: false, repeat: 'none' }));

    const inserted = await api('/tasks', { method: 'POST', body: JSON.stringify(rows) });
    created = inserted.length;
    console.log(`Created ${created} probe tasks.`);

    const result = await invoke();
    console.log('Function result:', JSON.stringify(result));

    const after = await api(`/tasks?select=id,title,snoozed_until&title=like.${encodeURIComponent(PREFIX + '*')}`);
    const byTitle = Object.fromEntries(after.map((task) => [task.title.replace(PREFIX, ''), task]));
    const sameInstant = (a, b) => a && b && Math.abs(new Date(a) - new Date(b)) < 1000;

    const checks = [
      ['lead time allows a task inside its window', result.sent >= 1],
      ['lead time blocks a task outside its window', Boolean(byTitle['lead-skip'])],
      ['zero lead time blocks a future task', Boolean(byTitle['zero-skip'])],
      ['future snooze is preserved (suppressed)', sameInstant(byTitle['snooze-future']?.snoozed_until, futureSnooze)],
      ['expired snooze is cleared after firing', byTitle['snooze-expired'] && byTitle['snooze-expired'].snoozed_until === null],
      ['expired snooze count reported', result.clearedSnoozes >= 1]
    ];

    let failed = 0;
    for (const [name, ok] of checks) {
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
      if (!ok) failed++;
    }
    console.log(failed ? `${failed}/${checks.length} probe checks FAILED` : `${checks.length}/${checks.length} probe checks passed`);
    process.exitCode = failed ? 1 : 0;
  } catch (error) {
    console.error('PROBE ERROR:', error.message);
    process.exitCode = 2;
  } finally {
    if (created) {
      try {
        await api(`/tasks?title=like.${encodeURIComponent(PREFIX + '*')}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' }
        });
        console.log('Cleaned up probe tasks.');
      } catch (error) {
        console.error('CLEANUP FAILED:', error.message);
        process.exitCode = 2;
      }
    }
  }
})();
