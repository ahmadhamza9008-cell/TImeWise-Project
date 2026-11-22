-- TimeWise — landing page early-access list
-- Run this in the Supabase SQL Editor. Anonymous visitors may join, but nobody
-- can read the list through the public API.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

drop policy if exists "Anyone can join the waitlist" on public.waitlist;
create policy "Anyone can join the waitlist"
  on public.waitlist for insert with check (true);

notify pgrst, 'reload schema';
