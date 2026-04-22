alter table custom_sentences
  add column if not exists russian_translation text;

alter table custom_sentences
  add column if not exists last_reviewed_at timestamptz;

alter table custom_sentences
  add column if not exists correct_answers integer not null default 0;

alter table custom_sentences
  add column if not exists wrong_answers integer not null default 0;

alter table custom_sentences
  add column if not exists is_active boolean not null default true;

update custom_sentences
set is_active = true
where is_active is distinct from true;

create index if not exists idx_custom_sentences_user_active_review
  on custom_sentences(user_id, is_active, scheduled_review_at);
