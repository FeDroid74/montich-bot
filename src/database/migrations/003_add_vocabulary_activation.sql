alter table vocabulary_words
  add column if not exists is_active boolean not null default true;

update vocabulary_words
set is_active = true
where is_active is distinct from true;

create index if not exists idx_vocabulary_words_source_active
  on vocabulary_words(source, is_active);
