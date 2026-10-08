alter table opportunities add column if not exists risk_level text check (risk_level in ('high','medium','low'));
alter table opportunities add column if not exists risk_p real;
