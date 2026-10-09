-- What the bot is waiting for after a bare command (/new without a name, /scan without a link).
alter table tg_chats add column if not exists awaiting text;
