create table if not exists users (
  id bigint generated always as identity primary key,
  telegram_id bigint not null unique,
  username text,
  first_name text not null,
  last_name text,
  role text not null check (role in ('admin', 'student')),
  created_at timestamptz not null default now()
);

create table if not exists user_settings (
  user_id bigint primary key references users(id) on delete cascade,
  reminder_time text,
  timezone text,
  daily_goal_minutes integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vocabulary_words (
  id bigint generated always as identity primary key,
  source text not null check (source in ('admin', 'user')),
  created_by_user_id bigint references users(id) on delete set null,
  serbian_latin text not null,
  russian_translation text not null,
  topic text,
  example_sentence text,
  created_at timestamptz not null default now()
);

create table if not exists user_word_progress (
  user_id bigint not null references users(id) on delete cascade,
  word_id bigint not null references vocabulary_words(id) on delete cascade,
  state text not null check (state in ('new', 'learning', 'review', 'mastered')),
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  correct_answers integer not null default 0,
  wrong_answers integer not null default 0,
  primary key (user_id, word_id)
);

create table if not exists custom_sentences (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  original_text text not null,
  corrected_text text,
  topic text,
  scheduled_review_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists faq_categories (
  id bigint generated always as identity primary key,
  slug text not null unique,
  title text not null
);

create table if not exists faq_entries (
  id bigint generated always as identity primary key,
  category_id bigint not null references faq_categories(id) on delete cascade,
  question text not null,
  answer text not null,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists faq_assets (
  id bigint generated always as identity primary key,
  faq_entry_id bigint not null references faq_entries(id) on delete cascade,
  file_name text not null,
  file_type text not null check (file_type in ('image', 'document')),
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vocabulary_words_topic on vocabulary_words(topic);
create index if not exists idx_user_word_progress_next_review_at on user_word_progress(next_review_at);
create index if not exists idx_custom_sentences_review_at on custom_sentences(scheduled_review_at);
create index if not exists idx_faq_entries_category_id on faq_entries(category_id);
