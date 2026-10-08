-- Well of experience: outcomes people report, and hashed indicators shared across users (counts only).
alter table opportunities add column if not exists outcome text check (outcome in ('scam','legit','unsure'));
alter table opportunities add column if not exists outcome_at timestamptz;
create table if not exists community_indicators (
  hash text primary key,                 -- HMAC of the normalised indicator; raw values are never stored here
  kind text not null,                    -- phone | email | domain | handle | wallet | repo
  hint text not null,                    -- masked preview, e.g. +234 ••• 4521, ***@bluewave-talent.com
  scam_users int not null default 0,
  legit_users int not null default 0,
  unsure_users int not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create table if not exists community_votes (
  user_id uuid not null references users(id) on delete cascade,
  hash text not null references community_indicators(hash) on delete cascade,
  outcome text not null check (outcome in ('scam','legit','unsure')),
  opportunity_id uuid references opportunities(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, hash)
);
create table if not exists community_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  outcome text not null,
  summary_ct text not null,              -- anonymised pattern summary (encrypted at rest; also archived to Walrus)
  archive_status text not null default 'pending',
  memwal_job_id text,
  blob_id text,
  created_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);
