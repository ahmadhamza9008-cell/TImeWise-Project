-- TimeWise — hardening + product requirements (security, sync, time zones, notifications).
-- Run after schema.sql, profiles.sql, push.sql, and enhancements.sql.

-- Allow an explicit "never remind" opt-out per task.
alter table public.tasks drop constraint if exists tasks_reminder_minutes_check;
alter table public.tasks
  add constraint tasks_reminder_minutes_check
  check (reminder_minutes in (-1, 0, 5, 10, 15, 30, 60));

-- Profile preferences: IANA time zone and notification controls.
-- An empty zone means "follow this device"; the client fills it in on first sync.
alter table public.profiles
  add column if not exists timezone text not null default '',

  add column if not exists push_enabled boolean not null default true,
  add column if not exists quiet_start text,
  add column if not exists quiet_end text,
  add column if not exists muted_tags jsonb not null default '[]'::jsonb;

alter table public.profiles alter column timezone set default '';

-- Realtime UPDATE/DELETE events must carry user_id so RLS filters match.
alter table public.tasks replica identity full;
alter table public.focus_sessions replica identity full;

-- Profiles are synced across devices too.
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception
  when duplicate_object then null;
end $$;

-- Defense in depth: even the table owner is subject to RLS.
alter table public.tasks force row level security;
alter table public.focus_sessions force row level security;
alter table public.profiles force row level security;
alter table public.push_subscriptions force row level security;

-- Policies that were missing but useful for account control.
drop policy if exists "Users can delete their own profile" on public.profiles;
create policy "Users can delete their own profile"
  on public.profiles for delete using (auth.uid() = id);

drop policy if exists "Users can update their own focus sessions" on public.focus_sessions;
create policy "Users can update their own focus sessions"
  on public.focus_sessions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A focus session may only be linked to a task owned by the same user.
create unique index if not exists tasks_user_id_id_idx on public.tasks (user_id, id);
update public.focus_sessions
  set task_id = null
  where task_id is not null
    and not exists (
      select 1 from public.tasks
      where public.tasks.id = public.focus_sessions.task_id
        and public.tasks.user_id = public.focus_sessions.user_id
    );
alter table public.focus_sessions drop constraint if exists focus_sessions_task_id_fkey;
alter table public.focus_sessions drop constraint if exists focus_sessions_owner_task_fkey;
alter table public.focus_sessions
  add constraint focus_sessions_owner_task_fkey
  foreign key (user_id, task_id) references public.tasks (user_id, id)
  on delete cascade;

-- One subscription endpoint per user (not globally unique).
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_key;
create unique index if not exists push_subscriptions_user_endpoint_idx
  on public.push_subscriptions (user_id, endpoint);

notify pgrst, 'reload schema';
