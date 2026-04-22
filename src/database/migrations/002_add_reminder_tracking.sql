alter table user_settings
  add column if not exists last_reminded_at timestamptz;

alter table user_settings
  alter column timezone set default 'Europe/Belgrade';

update user_settings
set timezone = 'Europe/Belgrade'
where timezone is null;
