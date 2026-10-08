// Remove synthetic test users' contributions from everything the platform learns from.
import { sql } from "../lib/db.js";
const t = await sql`select id from users where google_iss = 'test'`;
const ids = t.map((r) => r.id);
const a = await sql`delete from outcome_snapshots where user_id = any(${ids}) returning 1`;
const v = await sql`delete from community_votes where user_id = any(${ids}) returning hash`;
const p = await sql`delete from community_patterns where user_id = any(${ids}) returning 1`;
await sql`update community_indicators i set
  scam_users = (select count(*) from community_votes c where c.hash = i.hash and c.outcome = 'scam'),
  legit_users = (select count(*) from community_votes c where c.hash = i.hash and c.outcome = 'legit'),
  unsure_users = (select count(*) from community_votes c where c.hash = i.hash and c.outcome = 'unsure')`;
const d = await sql`delete from community_indicators i where not exists (select 1 from community_votes c where c.hash = i.hash) returning 1`;
console.log(`purged: ${a.length} outcome snapshots, ${v.length} votes, ${p.length} patterns, ${d.length} orphan indicators`);
const left = await sql`select (select count(*) from outcome_snapshots) s, (select count(*) from community_votes) v, (select count(*) from community_patterns) p, (select count(*) from community_indicators) i`;
console.log("remaining (real users only):", JSON.stringify(left[0]));
