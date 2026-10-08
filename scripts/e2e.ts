// End-to-end pipeline test on Mainnet with a synthetic test user (google_iss = "test"). Not a real user.
import { randomUUID } from "node:crypto";
import { sql } from "../lib/db.js";
import { seal } from "../lib/crypto.js";
import { submitMessage } from "../lib/pipeline.js";

const [u] = await sql`insert into users (google_iss, google_sub, profile_ct, consent_version, consent_at) values ('test', ${"e2e-" + Date.now()}, ${seal({ name: "E2E test" })}, 1, now()) returning id`;
const label = "Frontend contract (synthetic)";
const [o] = await sql`insert into opportunities (user_id, label_ct) values (${u.id}, ${seal(label)}) returning id`;
console.log("user", u.id, "opp", o.id);

const r1 = await submitMessage(u.id, o.id, "Hi, we're Northstar Labs. The contract pays $1,500 monthly. Applicants pay no fees. Onboarding happens only through our careers portal.", randomUUID(), label);
console.log("S1:", r1.assessment?.headline, "| next:", r1.assessment?.next_check, "| ms", JSON.stringify(r1.assessment?.timings_ms));

console.log("waiting for S1 to be confirmed on Walrus...");
for (let i = 0; i < 60; i++) {
  const [e] = await sql`select archive_status, blob_id from memory_events where id = ${r1.event_id}`;
  if (e.archive_status !== "pending") { console.log("S1 archive:", e.archive_status, e.blob_id); break; }
  await new Promise((r) => setTimeout(r, 3000));
}
const r2 = await submitMessage(u.id, o.id, "Quick update: please send a refundable $60 onboarding deposit today to secure the role. Our HR partner Mark will contact you on Telegram to finish onboarding.", randomUUID(), label);
const a = r2.assessment!;
console.log("\nS2 headline:", a.headline);
for (const c of a.changes) console.log(" change", c.prior, "->", c.current, c.relation, ":", c.what);
for (const n of a.notes) console.log(" note", n.sources, n.text);
console.log(" unknown:", a.unknown, "\n next_check:", a.next_check);
console.log(" jev:", a.jev.map((j: any) => `${j.pair.prior.source}->${j.pair.current.source} ${j.pair.topic}: ${j.choice} ${(j.probabilities[j.choice] ?? 0).toFixed(2)}`).join(" | "));
console.log(" recall:", JSON.stringify(a.recall), "ms", JSON.stringify(a.timings_ms));
await new Promise((r) => setTimeout(r, 45000)); // let the background archive finish
const ev = await sql`select seq, archive_status, blob_id from memory_events where opportunity_id = ${o.id} order by seq`;
console.log("archive:", JSON.stringify(ev));
