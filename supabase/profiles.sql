-- TimeWise — account profile and synced preferences
-- Run this in the Supabase SQL Editor after schema.sql.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Friend',
  focus_minutes integer not null default 25 check (focus_minutes in (25, 50)),
  week_start text not null default 'monday' check (week_start in ('monday', 'sunday')),
  theme text not null default 'light' check (theme in ('light', 'dark')),
  timezone text not null default '',
  push_enabled boolean not null default true,
  quiet_start text,
  quiet_end text,
  muted_tags jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users can delete their own profile" on public.profiles;
create policy "Users can delete their own profile"
  on public.profiles for delete using (auth.uid() = id);

alter table public.profiles force row level security;

-- Give new accounts a profile using the name entered at sign-up.
create or replace function public.timewise_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Friend'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists timewise_profile_on_signup on auth.users;
create trigger timewise_profile_on_signup
  after insert on auth.users
  for each row execute function public.timewise_new_profile();

-- Realtime sync of preferences across the user's devices.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
exception when others then
  null; -- Realtime is optional.
end $$;

notify pgrst, 'reload schema';
