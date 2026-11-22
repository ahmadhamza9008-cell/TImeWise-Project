-- TimeWise — recurring task support (run once on an existing project)
-- Fresh installs already get this column from schema.sql.

alter table public.tasks
  add column if not exists repeat text not null default 'none';

-- Keep values valid going forward. The app also validates before writing.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_repeat_check' and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_repeat_check
      check (repeat in ('none', 'daily', 'weekly', 'monthly'));
  end if;
end $$;

notify pgrst, 'reload schema';
