-- TimeWise — schedule Web Push reminders.
-- Run once after deploying send-due-reminders and setting CRON_SECRET as an
-- Edge Function secret. Replace REPLACE_WITH_CRON_SECRET before running.
-- The URL and cron secret are stored in Supabase Vault, not in the job SQL.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

delete from vault.secrets
  where name in ('timewise_reminder_url', 'timewise_cron_secret');

select vault.create_secret(
  'https://REPLACE_WITH_PROJECT_REF.supabase.co/functions/v1/send-due-reminders',
  'timewise_reminder_url'
);
select vault.create_secret('REPLACE_WITH_CRON_SECRET', 'timewise_cron_secret');

do $$
begin
  if exists (select 1 from cron.job where jobname = 'timewise-send-due-reminders') then
    perform cron.unschedule('timewise-send-due-reminders');
  end if;
end $$;

select cron.schedule(
  'timewise-send-due-reminders',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'timewise_reminder_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'timewise_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $job$
);

select jobid, jobname, schedule, active
  from cron.job
  where jobname = 'timewise-send-due-reminders';
