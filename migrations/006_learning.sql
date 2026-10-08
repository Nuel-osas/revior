-- Platform learning: what each offer looked like (signals, tactics, Revoir's prediction) when its outcome was reported.
create table if not exists outcome_snapshots (
  opportunity_id uuid primary key references opportunities(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  outcome text not null check (outcome in ('scam','legit','unsure')),
  predicted_level text,
  predicted_p real,
  signals jsonb not null default '[]',
  tactics jsonb not null default '[]',
  created_at timestamptz not null default now()
);
