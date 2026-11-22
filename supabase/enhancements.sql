-- TimeWise — enhancements for v1.1
-- Subtasks, daily plan order, per-task reminder timing/snooze, focus sessions,
-- and theme preference. Run once in the Supabase SQL Editor on an existing project.

alter table public.tasks
  add column if not exists subtasks jsonb not null default '[]'::jsonb,
  add column if not exists plan_order integer,
  add column if not exists reminder_minutes integer not null default 10,
  add column if not exists snoozed_until timestamptz;

alter table public.tasks
  drop constraint if exists tasks_reminder_minutes_check;
alter table public.tasks
  add constraint tasks_reminder_minutes_check
  check (reminder_minutes in (0, 5, 10, 15, 30, 60));

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  task_title text not null default '',
  duration_minutes integer not null check (duration_minutes > 0),
  started_at timestamptz not null default now()
);

create index if not exists focus_sessions_user_id_idx
  on public.focus_sessions (user_id);

alter table public.focus_sessions enable row level security;

drop policy if exists "Users can view their own focus sessions" on public.focus_sessions;
create policy "Users can view their own focus sessions"
  on public.focus_sessions for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own focus sessions" on public.focus_sessions;
create policy "Users can insert their own focus sessions"
  on public.focus_sessions for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own focus sessions" on public.focus_sessions;
create policy "Users can delete their own focus sessions"
  on public.focus_sessions for delete using (auth.uid() = user_id);

alter table public.profiles
  add column if not exists theme text not null default 'light';

alter table public.profiles
  drop constraint if exists profiles_theme_check;
alter table public.profiles
  add constraint profiles_theme_check check (theme in ('light', 'dark'));

notify pgrst, 'reload schema';
