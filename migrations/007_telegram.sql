-- Telegram: each private chat maps to a Revoir user (google_iss = 'telegram', google_sub = Telegram user id)
-- and remembers which offer new messages go to.
create table if not exists tg_chats (
  chat_id bigint primary key,
  user_id uuid not null references users(id) on delete cascade,
  active_opportunity uuid references opportunities(id) on delete set null,
  updated_at timestamptz not null default now()
);
