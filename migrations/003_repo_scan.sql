-- Repo scans are first-class events in an opportunity's history (and archived to Walrus like messages).
alter table memory_events drop constraint if exists memory_events_kind_check;
alter table memory_events add constraint memory_events_kind_check check (kind in ('source_message','user_correction','verification_report','repo_scan'));
