alter table user_settings
  add column if not exists reminder_interval_days integer not null default 1;

update user_settings
set reminder_interval_days = 1
where reminder_interval_days is null or reminder_interval_days < 1;
