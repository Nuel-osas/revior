-- Zentos-style custodial wallets: one Sui wallet + one MemWal account per Google identity.
-- Secrets are AES-256-GCM ciphertext. Same Google account -> same address forever.
create table if not exists user_wallets (
  user_id uuid primary key references users(id) on delete cascade,
  address text not null unique,
  wallet_ct text not null,                  -- encrypted suiprivkey of the user's wallet
  delegate_ct text not null,                -- encrypted MemWal delegate private key (hex)
  delegate_address text not null,
  memwal_account_id text,
  status text not null default 'provisioning' check (status in ('provisioning','ready','failed')),
  create_digest text,
  delegate_digest text,
  last_error text,
  exported_at timestamptz,
  created_at timestamptz not null default now()
);
