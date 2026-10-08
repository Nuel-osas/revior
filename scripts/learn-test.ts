// Synthetic learning-loop test (google_iss='test' users, excluded from public stats except the learning tables).
import { randomUUID } from "node:crypto";
import { sql } from "../lib/db.js";
import { seal } from "../lib/crypto.js";
import { submitMessage } from "../lib/pipeline.js";
import { reportOutcome } from "../lib/community.js";
import { accuracy, learnedStats } from "../lib/learning.js";

async function offer(name: string, msgs: string[]) {
  const [u] = await sql`insert into users (google_iss, google_sub, profile_ct, consent_version, consent_at) values ('test', ${"learn-" + name + "-" + Date.now()}, ${seal({ name })}, 1, now()) returning id`;
  const [o] = await sql`insert into opportunities (user_id, label_ct) values (${u.id}, ${seal(name)}) returning id`;
  let last: any;
  for (const m of msgs) last = (await submitMessage(u.id, o.id, m, randomUUID(), name)).assessment;
  return { u: u.id, o: o.id, last };
}
const scams = [
  ["Remote social media assistant, $900/week, no experience needed. Chat with our manager Lisa on Telegram.", "You're hired! To activate your account, buy a $50 starter kit via the link today."],
  ["Hello, we found your CV. Remote data entry, $35/hour. Interview is a quick text chat on Telegram, no video needed.", "Congratulations. Please send your ID card and a $25 processing fee in USDT to complete onboarding."],
  ["Amazon partner hiring product reviewers, earn $300 daily from home.", "Before your first task, deposit $40 to unlock the task dashboard. Do it within 24 hours or the slot expires."],
  ["Web3 startup needs a frontend dev, $8,000/month remote, start immediately.", "Great, final step: clone our repo and run npm install, then send us your wallet address for salary. Pay $30 for the security audit license today."],
];
const legits = [
  ["Hi, I'm Sam, engineering manager at Paystack. I saw your talk at DevFest. Would you like a 30 minute video call next week about a backend role?", "Thanks for the call. Our recruiter will email you an interview loop through Greenhouse. No payment is ever required in our process."],
  ["Hello from the Sui Foundation grants team. Your proposal passed first review. Please book a video call via our Calendly link on sui.io.", "Following the call, the grant agreement will come through DocuSign from our legal team. Milestone payments are made to you."],
  ["Hi, this is Ada from a fintech in Lagos. We'd like you to do a paid 2-day contract to review our React app. We pay $400 on completion via bank transfer.", "Contract attached from our company email. You invoice us after delivery; nothing is paid upfront by you."],
];
for (const [i, m] of scams.entries()) { const r = await offer("scam" + i, m); console.log(`scam${i} predicted: ${r.last.verdict.label} ${(r.last.verdict.probability ?? 0).toFixed(2)} tactics=${JSON.stringify(r.last.tactics)}`); await reportOutcome(r.u, r.o, "scam", true); }
for (const [i, m] of legits.entries()) { const r = await offer("legit" + i, m); console.log(`legit${i} predicted: ${r.last.verdict.label} ${(r.last.verdict.probability ?? 0).toFixed(2)} tactics=${JSON.stringify(r.last.tactics)}`); await reportOutcome(r.u, r.o, "legit", true); }
const l = await learnedStats();
console.log(`\nlearned from ${l.outcomes} outcomes (${l.scams} scam, ${l.legits} legit). top features:`);
for (const f of l.features.sort((a, b) => (b.scam - b.legit) - (a.scam - a.legit)).slice(0, 8)) console.log(`   ${f.kind} "${f.key}" scam=${f.scam} legit=${f.legit}`);
console.log("accuracy:", JSON.stringify(await accuracy()));
const n = await offer("new", ["Hi! Remote customer support role, $1,200/week, no experience required. Our HR will message you on Telegram.", "You passed! Pay a $35 onboarding fee via the link today to receive your training materials."]);
const v = n.last.verdict;
console.log(`\nNEW OFFER: ${v.label} p=${v.probability?.toFixed(2)} (jev ${v.jev_p?.toFixed(2)}, learned ${v.learned?.p.toFixed(2)} from ${v.learned?.outcomes} outcomes, weight ${v.learned?.weight})`);
for (const u of v.learned?.used ?? []) console.log(`   learned: "${u.key}" seen in ${u.scam} scams, ${u.legit} legit`);
