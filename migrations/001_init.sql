-- Revoir hackathon cut. Content-bearing columns are AES-256-GCM ciphertext (lib/crypto.ts).
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_iss text not null,
  google_sub text not null,
  profile_ct text not null,                 -- encrypted {name, email, picture}
  consent_version int,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (google_iss, google_sub)
);

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  label_ct text not null,                   -- encrypted label
  details_ct text,                          -- encrypted current-details projection
  details_revision int not null default 0,
  status text not null default 'active' check (status in ('active','closed','excluded')),
  next_seq int not null default 1,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists opportunities_user on opportunities(user_id, last_activity_at desc);

-- One user contribution = one immutable event (source message, correction, verification report).
create table if not exists memory_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  seq int not null,
  kind text not null check (kind in ('source_message','user_correction','verification_report')),
  body_ct text not null,                    -- encrypted {source, claims, correction, verification, provenance}
  payload_sha256 text not null,
  idempotency_key text not null,
  archive_status text not null default 'pending' check (archive_status in ('pending','done','failed')),
  memwal_job_id text,
  blob_id text,
  recorded_at timestamptz not null default now(),
  unique (opportunity_id, seq),
  unique (user_id, idempotency_key)
);

-- Claim state is computed from corrections; stored here for fast projection.
create table if not exists claim_states (
  claim_id text primary key,                -- "<event uuid>:<n>"
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  event_id uuid not null references memory_events(id) on delete cascade,
  topic text not null,
  state text not null default 'active' check (state in ('active','disputed','superseded','withdrawn')),
  superseded_by uuid references memory_events(id)
);

create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  event_id uuid not null references memory_events(id) on delete cascade,
  body_ct text not null,                    -- encrypted assessment JSON incl. Jev traces
  created_at timestamptz not null default now()
);

create table if not exists general_memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('preference','open_check')),
  statement_ct text not null,
  status text not null default 'active' check (status in ('suggested','active','withdrawn')),
  source_opportunity_id uuid references opportunities(id) on delete cascade,
  source_event_id uuid references memory_events(id) on delete cascade,
  archive_status text not null default 'pending',
  memwal_job_id text,
  blob_id text,
  created_at timestamptz not null default now()
);
