-- TimeWise — Supabase schema
-- Run this in the Supabase SQL Editor for a new project.

create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  time text not null default 'Anytime',
  tag text not null default 'Personal',
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  due date,
  notes text not null default '',
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly', 'monthly')),
  subtasks jsonb not null default '[]'::jsonb,
  plan_order integer,
  reminder_minutes integer not null default 10 check (reminder_minutes in (-1, 0, 5, 10, 15, 30, 60)),
  snoozed_until timestamptz,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tasks_user_id_created_at_idx
  on public.tasks (user_id, created_at desc);

create index if not exists tasks_user_id_plan_order_idx
  on public.tasks (user_id, plan_order);

-- Needed by the ownership-safe focus-session foreign key below.
create unique index if not exists tasks_user_id_id_idx
  on public.tasks (user_id, id);

alter table public.tasks enable row level security;

drop policy if exists "Users can view their own tasks" on public.tasks;
create policy "Users can view their own tasks"
  on public.tasks for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own tasks" on public.tasks;
create policy "Users can insert their own tasks"
  on public.tasks for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own tasks" on public.tasks;
create policy "Users can update their own tasks"
  on public.tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own tasks" on public.tasks;
create policy "Users can delete their own tasks"
  on public.tasks for delete
  using (auth.uid() = user_id);

-- Focus sessions logged by the dashboard timer.
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

-- A session may only point at a task owned by the same user.
alter table public.focus_sessions
  add constraint focus_sessions_owner_task_fkey
  foreign key (user_id, task_id) references public.tasks (user_id, id)
  on delete cascade;

alter table public.focus_sessions enable row level security;

drop policy if exists "Users can view their own focus sessions" on public.focus_sessions;
create policy "Users can view their own focus sessions"
  on public.focus_sessions for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own focus sessions" on public.focus_sessions;
create policy "Users can insert their own focus sessions"
  on public.focus_sessions for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own focus sessions" on public.focus_sessions;
create policy "Users can update their own focus sessions"
  on public.focus_sessions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own focus sessions" on public.focus_sessions;
create policy "Users can delete their own focus sessions"
  on public.focus_sessions for delete using (auth.uid() = user_id);

-- Realtime UPDATE/DELETE events need the full row so user_id filters match.
alter table public.tasks replica identity full;
alter table public.focus_sessions replica identity full;

-- Defense in depth: RLS applies even to the table owner.
alter table public.tasks force row level security;
alter table public.focus_sessions force row level security;

-- Allow Realtime to broadcast changes (safe with RLS enabled).
-- Wrapped in an exception handler so an unavailable publication can never
-- roll back the table creation above.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
exception when others then
  null; -- Realtime is optional; the app still works via polling/manual refresh.
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'focus_sessions'
  ) then
    alter publication supabase_realtime add table public.focus_sessions;
  end if;
exception when others then
  null; -- Realtime is optional.
end $$;

-- Refresh PostgREST's schema cache so the REST endpoints are available immediately.
notify pgrst, 'reload schema';
