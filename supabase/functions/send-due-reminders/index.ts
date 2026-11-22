// TimeWise — send Web Push reminders using each task's own lead time and snooze state.
// Deploy with the Supabase CLI, then schedule it (see README).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const DEFAULT_LOOKAHEAD_MINUTES = 10;

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

type Task = {
  id: string;
  user_id: string;
  title: string;
  time: string;
  due: string;
  repeat: string;
  reminder_minutes: number | null;
  snoozed_until: string | null;
  done: boolean;
};

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
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minutes: Number(value('hour')) * 60 + Number(value('minute'))
  };
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

function authorized(request: Request) {
  const auth = request.headers.get('authorization') || '';
  const supplied = request.headers.get('x-cron-secret') || '';
  return Boolean(
    (cronSecret && supplied === cronSecret) ||
    auth === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
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

  const { data: tasks, error: taskError } = await supabase
    .from('tasks')
    .select('id, user_id, title, time, due, repeat, reminder_minutes, snoozed_until, done')
    .eq('done', false)
    .gte('due', utcDate(-2))
    .lte('due', utcDate(2));

  if (taskError) {
    return new Response(JSON.stringify({ error: taskError.message }), { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  const stale: string[] = [];
  const expiredSnoozes = new Set<string>();
  const nowInstant = new Date();

  for (const subscription of (subscriptions || []) as Subscription[]) {
    const now = localNow(subscription.timezone || 'UTC');
    const dueTasks = ((tasks || []) as Task[]).filter((task) => {
      if (task.user_id !== subscription.user_id) return false;

      // A snooze in the future suppresses the reminder entirely.
      if (task.snoozed_until) {
        const snoozedUntil = new Date(task.snoozed_until);
        if (!Number.isNaN(snoozedUntil.getTime()) && snoozedUntil > nowInstant) return false;
        // An elapsed snooze means "remind me again now": fire once, then clear it.
        expiredSnoozes.add(task.id);
        return true;
      }

      // A recurring task that wasn't completed still counts as due today.
      const effectiveDue = task.repeat && task.repeat !== 'none' && task.due < now.date
        ? now.date
        : task.due;
      if (effectiveDue !== now.date) return false;
      const minutes = taskMinutes(task.time);
      if (minutes === null) return false;
      const lead = Number(task.reminder_minutes ?? DEFAULT_LOOKAHEAD_MINUTES);
      const diff = minutes - now.minutes;
      return diff >= 0 && diff <= lead;
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
        if (status === 404 || status === 410) stale.push(subscription.endpoint);
      }
    }
  }

  if (stale.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', stale);
  }

  // Clear snoozes whose window has passed so the reminder can fire again next time.
  const expiredIds = Array.from(expiredSnoozes);
  if (expiredIds.length) {
    await supabase.from('tasks').update({ snoozed_until: null }).in('id', expiredIds);
  }

  return new Response(
    JSON.stringify({
      sent,
      failed,
      removedStale: stale.length,
      clearedSnoozes: expiredIds.length,
      subscriptions: (subscriptions || []).length,
      tasksChecked: (tasks || []).length
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
