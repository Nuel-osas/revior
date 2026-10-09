// Submission evidence: per real user, how many memories are stored on Walrus, with their Sui address and blob IDs.
import { sql } from "../lib/db.js";
const users = await sql`select u.id, u.created_at, w.address from users u left join user_wallets w on w.user_id = u.id where u.google_iss <> 'test' order by u.created_at`;
let qualifying = 0;
for (const u of users) {
  const ev = await sql`select kind, blob_id from memory_events where user_id = ${u.id} and archive_status = 'done'`;
  const gm = await sql`select blob_id from general_memory_items where user_id = ${u.id} and archive_status = 'done'`;
  const offers = await sql`select count(*)::int n from opportunities where user_id = ${u.id}`;
  const total = ev.length + gm.length;
  if (total >= 10) qualifying++;
  console.log(`\nuser ${u.id.slice(0, 8)}  joined ${new Date(u.created_at).toISOString().slice(0, 10)}  wallet ${u.address ?? "none"}`);
  console.log(`  offers ${offers[0].n}  offer memories ${ev.length}  general memories ${gm.length}  total on Walrus ${total}${total >= 10 ? "  ✓" : ""}`);
  for (const r of [...ev, ...gm].slice(0, 3)) console.log(`  blob ${r.blob_id}`);
}
console.log(`\n${users.length} real users, ${qualifying} with 10+ memories (need 3)`);
