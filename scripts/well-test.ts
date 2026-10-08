// Synthetic test of the cross-user "well of experience". All users are google_iss='test' (excluded from stats).
import { randomUUID } from "node:crypto";
import { sql } from "../lib/db.js";
import { seal } from "../lib/crypto.js";
import { submitMessage } from "../lib/pipeline.js";
import { reportOutcome } from "../lib/community.js";

async function user(name: string) {
  const [u] = await sql`insert into users (google_iss, google_sub, profile_ct, consent_version, consent_at) values ('test', ${"well-" + name + "-" + Date.now()}, ${seal({ name })}, 1, now()) returning id`;
  const [o] = await sql`insert into opportunities (user_id, label_ct) values (${u.id}, ${seal("well test " + name)}) returning id`;
  return { u: u.id, o: o.id };
}
const say = async (x: { u: string; o: string }, text: string) => (await submitMessage(x.u, x.o, text, randomUUID(), "test")).assessment as any;
const show = (who: string, a: any) => {
  const v = a.verdict;
  console.log(`${who}: ${v.label} p=${v.probability?.toFixed(2)} | signals: ${v.signals.join("; ")}`);
  for (const m of v.community.matches) console.log(`   community: ${m.kind} ${m.hint} scam=${m.scam_users} legit=${m.legit_users} known=${m.known_scam}`);
  for (const p of v.community.similar) console.log(`   similar ${p.outcome} (${p.distance.toFixed(2)}): ${p.summary.slice(0, 110)}`);
};

const A = await user("A");
await say(A, "Hi, I'm Grace from Bluewave Talent. Remote React role, $2,000/month, no fee to apply. Text me on WhatsApp +234 803 555 4521.");
show("A msg2", await say(A, "Congrats, you passed! Pay the $45 verification fee today to 0x3fa9c2b7e1d04a5b8c6f7e2d1a0b9c8d7e6f5a4b to reserve your slot."));
console.log("A reports scam:", JSON.stringify(await reportOutcome(A.u, A.o, "scam", true)).slice(0, 220));

const B = await user("B");
show("B (same number, different format)", await say(B, "Hello from the hiring team at NovaWorks. We have a remote frontend role for you. Please message our coordinator on 0803-555-4521."));

const C = await user("C");
await say(C, "Remote data entry role, $1,800/month. Contact HR on +2348035554521 on WhatsApp. A small onboarding deposit of $30 is required today.");
console.log("C reports scam:", JSON.stringify(await reportOutcome(C.u, C.o, "scam", true)).slice(0, 120));

console.log("waiting 50s for the anonymised patterns to land on Walrus...");
await new Promise((r) => setTimeout(r, 50_000));
const D = await user("D");
show("D (new person, same number, similar script)", await say(D, "Hi! You've been shortlisted for a remote role. To secure your position please pay the $40 verification fee today via the link. Questions? WhatsApp 08035554521."));
const pats = await sql`select outcome, archive_status from community_patterns`;
console.log("patterns:", JSON.stringify(pats));
