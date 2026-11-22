// TimeWise — send Web Push reminders using profile preferences, per-task lead
// time and snooze state. Deploy with the Supabase CLI, then schedule it (README).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const DEFAULT_LOOKAHEAD_MINUTES = 10;
const ZERO_LEAD_GRACE_MINUTES = 4; // cron runs every 5 min; allow a small late window

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';
const cronSecret = Deno.env.get('CRON_SECRET') || '';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

type Subscription = {
  user_id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  timezone: string;
};

type Profile = {
  id: string;
  timezone: string | null;
  push_enabled: boolean | null;
  quiet_start: string | null;
  quiet_end: string | null;
  muted_tags: string[] | null;
};

type Task = {
  id: string;
  user_id: string;
  title: string;
  time: string;
  due: string;
  repeat: string;
  tag: string | null;
  reminder_minutes: number | null;
  snoozed_until: string | null;
  done: boolean;
};

function validTimezone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return timeZone;
  } catch (_) {
    return 'UTC';
  }
}

function localNow(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const date = `${value('year')}-${value('month')}-${value('day')}`;
  const minutes = Number(value('hour')) * 60 + Number(value('minute'));
  return { date, minutes, dayNumber: dayNumber(date) };
}

function dayNumber(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!match) return 0;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000;
}

function utcDate(offsetDays: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function taskMinutes(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function inQuietHours(nowMinutes: number, start: string | null, end: string | null): boolean {
  const startMinutes = taskMinutes(start || '');
  const endMinutes = taskMinutes(end || '');
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  // Window wraps midnight, e.g. 22:00–07:00.
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(request: Request) {
  const auth = request.headers.get('authorization') || '';
  const supplied = request.headers.get('x-cron-secret') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  return Boolean(
    (cronSecret && constantTimeEqual(supplied, cronSecret)) ||
    (serviceKey && constantTimeEqual(auth, `Bearer ${serviceKey}`))
  );
}

Deno.serve(async (request) => {
  if (!authorized(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  if (!vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: 'VAPID keys are not configured' }), { status: 500 });
  }

  const { data: subscriptions, error: subError } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, keys, timezone');

  if (subError) {
    return new Response(JSON.stringify({ error: subError.message }), { status: 500 });
  }

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, timezone, push_enabled, quiet_start, quiet_end, muted_tags');

  if (profileError) {
    return new Response(JSON.stringify({ error: profileError.message }), { status: 500 });
  }
  const profileMap = new Map<string, Profile>(
    ((profiles || []) as Profile[]).map((profile) => [profile.id, profile])
  );

  const { data: tasks, error: taskError } = await supabase
    .from('tasks')
    .select('id, user_id, title, time, due, repeat, tag, reminder_minutes, snoozed_until, done')
    .eq('done', false)
    .gte('due', utcDate(-2))
    .lte('due', utcDate(2));

  if (taskError) {
    return new Response(JSON.stringify({ error: taskError.message }), { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  const stale: Array<{ user_id: string; endpoint: string }> = [];
  const expiredSnoozes = new Map<string, string>(); // task id -> user id
  const nowInstant = new Date();

  for (const subscription of (subscriptions || []) as Subscription[]) {
    const profile = profileMap.get(subscription.user_id);
    if (profile && profile.push_enabled === false) continue;

    const timeZone = validTimezone(profile?.timezone || subscription.timezone);
    const now = localNow(timeZone);
    if (profile && inQuietHours(now.minutes, profile.quiet_start, profile.quiet_end)) continue;

    const mutedTags = new Set((profile?.muted_tags || []).map((tag) => String(tag)));

    const dueTasks = ((tasks || []) as Task[]).filter((task) => {
      if (task.user_id !== subscription.user_id) return false;
      if (task.tag && mutedTags.has(task.tag)) return false;

      const snoozedUntil = task.snoozed_until ? new Date(task.snoozed_until) : null;
      const snoozeExpired = Boolean(snoozedUntil && !Number.isNaN(snoozedUntil.getTime()) && snoozedUntil <= nowInstant);
      if (snoozedUntil && !Number.isNaN(snoozedUntil.getTime()) && snoozedUntil > nowInstant) return false;

      // A recurring task that wasn't completed still counts as due today.
      const effectiveDue = task.repeat && task.repeat !== 'none' && task.due < now.date
        ? now.date
        : task.due;
      if (effectiveDue !== now.date) return false;

      const minutes = taskMinutes(task.time);
      if (minutes === null && !snoozeExpired) return false;

      // A negative lead time is an explicit "no reminder" opt-out.
      const lead = Number(task.reminder_minutes ?? DEFAULT_LOOKAHEAD_MINUTES);
      if (lead < 0 && !snoozeExpired) return false;

      if (snoozeExpired) {
        expiredSnoozes.set(task.id, task.user_id);
        return true;
      }

      // Absolute local-minute comparison handles cross-midnight lead windows.
      const diff = (dayNumber(effectiveDue) * 1440 + minutes!) - (now.dayNumber * 1440 + now.minutes);
      return diff >= -ZERO_LEAD_GRACE_MINUTES && diff <= lead;
    });

    for (const task of dueTasks) {
      const followUp = expiredSnoozes.has(task.id);
      const payload = JSON.stringify({
        title: 'TimeWise — task due soon',
        body: `${task.title} at ${task.time}` + (followUp ? ' (snooze over)' : ''),
        icon: '/assets/img/icon-192.png',
        badge: '/assets/img/icon-192.png',
        tag: `timewise-${task.id}`,
        data: { url: '/tasks.html' }
      });

      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          payload
        );
        sent++;
      } catch (error) {
        failed++;
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          stale.push({ user_id: subscription.user_id, endpoint: subscription.endpoint });
        }
      }
    }
  }

  // Scope stale-endpoint deletion to the owning user.
  for (const item of stale) {
    await supabase.from('push_subscriptions').delete()
      .eq('user_id', item.user_id).eq('endpoint', item.endpoint);
  }

  // Clear only the snoozes belonging to the user whose subscription fired them.
  for (const [id, userId] of expiredSnoozes) {
    await supabase.from('tasks').update({ snoozed_until: null })
      .eq('id', id).eq('user_id', userId);
  }

  return new Response(
    JSON.stringify({
      sent,
      failed,
      removedStale: stale.length,
      clearedSnoozes: expiredSnoozes.size,
      subscriptions: (subscriptions || []).length,
      tasksChecked: (tasks || []).length
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
