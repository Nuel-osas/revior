// The well of experience: what people learned from how their offers ended, shared across users as counts.
//   indicators: phone / email / domain / handle / wallet / repo, normalised then HMAC-hashed (raw values never stored)
//   votes: one per user per indicator; "known" needs 2+ different people
//   patterns: an anonymised description of the tactics (no names, numbers, links), stored in a shared
//             Walrus Memory namespace so new offers can be matched by meaning
import { createHmac } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { cfg } from "./config.js";
import { open, seal } from "./crypto.js";
import { sql } from "./db.js";
import { archive, archiveStatus, operatorMemwal, recallIn } from "./providers.js";
import { snapshotOutcome } from "./learning.js";

export type Kind = "phone" | "email" | "domain" | "handle" | "wallet" | "repo";
export type Indicator = { kind: Kind; value: string; hint: string };
export type Outcome = "scam" | "legit" | "unsure";
const COMMUNITY_NS = "rv1_community_v1";

// Platforms everyone uses are not indicators.
const COMMON = /^(gmail|googlemail|yahoo|outlook|hotmail|icloud|proton|protonmail|aol|live|msn)\.|^(github|gitlab|linkedin|google|youtube|twitter|x|facebook|instagram|whatsapp|wa|t|telegram|discord|zoom|calendly|notion|medium|microsoft|apple|amazon|vercel|netlify|bit|tinyurl)\.(com|me|org|ly|io|app|net|co|gg|so|us)$/i;

const mask = {
  phone: (d: string) => `+${d.slice(0, Math.max(1, d.length - 7))} ••• ${d.slice(-4)}`,
  email: (e: string) => `***@${e.split("@")[1]}`,
  handle: (h: string) => `@${h.slice(0, 2)}${"•".repeat(Math.max(1, h.length - 4))}${h.slice(-2)}`,
  wallet: (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`,
};

export function extractIndicators(text: string): Indicator[] {
  const out = new Map<string, Indicator>();
  const add = (i: Indicator) => out.set(`${i.kind}:${i.value}`, i);
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9-]+\.)+[A-Z]{2,}/gi)) {
    const e = m[0].toLowerCase();
    add({ kind: "email", value: e, hint: mask.email(e) });
    const dom = e.split("@")[1];
    if (!COMMON.test(dom)) add({ kind: "domain", value: dom, hint: dom });
  }
  for (const m of text.matchAll(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/gi)) {
    const r = `${m[1]}/${m[2]}`.replace(/[.,;:!?)]+$/, "").replace(/\.git$/, "").toLowerCase();
    add({ kind: "repo", value: r, hint: `github.com/${r}` });
  }
  for (const m of text.matchAll(/\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+(?:com|net|org|io|xyz|co|app|dev|ai|info|biz|online|site|top|link|live|work|jobs|careers|ng|uk|us|me))\b(?:\/[^\s)]*)?/gi)) {
    const host = m[1].toLowerCase();
    if (/github\.com$/.test(host) || COMMON.test(host) || /@/.test(text.slice(Math.max(0, (m.index ?? 0) - 1), m.index ?? 0))) continue;
    add({ kind: "domain", value: host, hint: host });
  }
  for (const m of text.matchAll(/(?:t\.me\/|telegram\.me\/|(?<![\w.])@)([A-Za-z][A-Za-z0-9_]{3,31})\b/g)) {
    const h = m[1].toLowerCase();
    if (out.has(`domain:${h}`)) continue;
    add({ kind: "handle", value: h, hint: mask.handle(h) });
  }
  for (const m of text.matchAll(/\b0x[a-fA-F0-9]{40}(?:[a-fA-F0-9]{24})?\b|\bbc1[a-z0-9]{25,59}\b|\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g)) {
    // EVM addresses are case-insensitive; base58 (Tron) and bech32 keep their case.
    add({ kind: "wallet", value: m[0].startsWith("0x") ? m[0].toLowerCase() : m[0], hint: mask.wallet(m[0]) });
  }
  for (const m of text.matchAll(/(?<![\w/])\+?\d[\d\s().-]{7,18}\d(?![\w/])/g)) {
    const d = m[0].replace(/\D/g, "");
    if (d.length < 9 || d.length > 15 || /^(19|20)\d{6}$/.test(d)) continue; // skip dates and short numbers
    // Same number in any format (+234 803…, 0803…) -> the last 10 digits.
    const canon = d.slice(-10);
    if (out.has(`phone:${canon}`)) continue;
    add({ kind: "phone", value: canon, hint: mask.phone(d) });
  }
  return [...out.values()].slice(0, 30);
}

const hashOf = (i: { kind: string; value: string }) => createHmac("sha256", cfg.nsKey).update(`indicator:${i.kind}:${i.value}`).digest("hex");

export type Match = { kind: Kind; hint: string; scam_users: number; legit_users: number; unsure_users: number; known_scam: boolean };

export async function lookup(indicators: Indicator[]): Promise<Match[]> {
  if (!indicators.length) return [];
  const hashes = indicators.map(hashOf);
  const rows = await sql`select hash, kind, hint, scam_users, legit_users, unsure_users from community_indicators where hash = any(${hashes})`;
  const local = new Map(indicators.map((i) => [hashOf(i), i]));
  return rows
    .filter((r) => r.scam_users + r.legit_users + r.unsure_users > 0)
    .map((r) => ({
      kind: r.kind,
      hint: local.get(r.hash)?.hint ?? r.hint,
      scam_users: r.scam_users,
      legit_users: r.legit_users,
      unsure_users: r.unsure_users,
      known_scam: r.scam_users >= 2 && r.scam_users > r.legit_users,
    }));
}

// Semantic match against anonymised patterns other people reported.
export async function similarPatterns(query: string) {
  try {
    const hits = await recallIn(operatorMemwal(), COMMUNITY_NS, query, 6);
    // Only patterns that a real (non-test) reporter still stands behind.
    const rows = await sql`select p.summary_ct from community_patterns p join users u on u.id = p.user_id where u.google_iss <> 'test'`;
    const real = new Set(rows.map((r) => open<string>(r.summary_ct).trim()));
    return hits
      .filter((h) => real.has(h.text.replace(/^\[rv1 pattern[^\]]*\]\s*/, "").trim()))
      .filter((h) => h.distance <= 0.62)
      .map((h) => ({ outcome: (h.text.match(/^\[rv1 pattern outcome=(\w+)\]/)?.[1] ?? "unsure") as Outcome, summary: h.text.replace(/^\[rv1 pattern[^\]]*\]\s*/, ""), distance: h.distance }))
      .filter((p) => p.outcome !== "unsure");
  } catch {
    return [];
  }
}

const PATTERN = `Summarise the tactics in this job or collaboration offer conversation as an anonymous pattern other people can be warned about (or reassured by).
Remove every name, company, phone number, email, link, handle, amount, date and place. Describe only the moves: how contact started, what was promised, what changed, what was requested and how.
2 to 3 sentences, plain language. Return JSON {"pattern": <string>}.`;

async function anonymisedPattern(texts: string[]) {
  const d = cfg.deepseek;
  const res = await fetch(`${d.base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${d.key}` },
    body: JSON.stringify({ model: d.model, temperature: 0.2, max_tokens: 400, response_format: { type: "json_object" }, thinking: { type: "disabled" }, messages: [{ role: "system", content: PATTERN }, { role: "user", content: texts.join("\n---\n").slice(0, 12000) }] }),
    signal: AbortSignal.timeout(30_000),
  });
  const j: any = await res.json();
  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
  const p = String(JSON.parse(j.choices?.[0]?.message?.content || "{}").pattern ?? "").trim();
  // Belt and braces: strip anything that still looks like an indicator.
  return p.replace(/\S+@\S+/g, "[email]").replace(/https?:\/\/\S+/g, "[link]").replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]").replace(/@\w{3,}/g, "[handle]");
}

// A user reports how an offer ended. Indicators get one vote from this user; the pattern joins the shared memory.
export async function reportOutcome(userId: string, oppId: string, outcome: Outcome, share: boolean) {
  // Learning snapshot first: what Revoir predicted, and which signals and tactics this offer showed.
  const [opp] = await sql`select risk_level, risk_p from opportunities where id = ${oppId} and user_id = ${userId}`;
  const assess = await sql`select body_ct from assessments where opportunity_id = ${oppId}`;
  const bodies = assess.map((r) => open<any>(r.body_ct));
  await snapshotOutcome(oppId, userId, outcome, { level: opp?.risk_level ?? null, p: opp?.risk_p ?? null },
    bodies.flatMap((b) => b.verdict?.signals ?? []), bodies.flatMap((b) => [...(b.tactics ?? []), ...(b.verdict?.tactics ?? [])]));
  await sql`update opportunities set outcome = ${outcome}, outcome_at = now() where id = ${oppId} and user_id = ${userId}`;
  if (!share) return { shared: false, indicators: 0 };
  const events = await sql`select body_ct from memory_events where opportunity_id = ${oppId} and user_id = ${userId} order by seq`;
  const texts = events.map((e) => open<any>(e.body_ct).source?.text ?? "").filter(Boolean);
  const indicators = extractIndicators(texts.join("\n"));
  for (const i of indicators) {
    const h = hashOf(i);
    await sql`insert into community_indicators (hash, kind, hint) values (${h}, ${i.kind}, ${i.hint}) on conflict (hash) do update set last_seen = now()`;
    await sql`insert into community_votes (user_id, hash, outcome, opportunity_id) values (${userId}, ${h}, ${outcome}, ${oppId})
              on conflict (user_id, hash) do update set outcome = excluded.outcome, created_at = now()`;
    await sql`update community_indicators set
                scam_users = (select count(*) from community_votes where hash = ${h} and outcome = 'scam'),
                legit_users = (select count(*) from community_votes where hash = ${h} and outcome = 'legit'),
                unsure_users = (select count(*) from community_votes where hash = ${h} and outcome = 'unsure')
              where hash = ${h}`;
  }
  let pattern: string | null = null;
  if (outcome !== "unsure" && texts.length) {
    pattern = await anonymisedPattern(texts).catch(() => null);
    if (pattern) {
      const [row] = await sql`insert into community_patterns (user_id, opportunity_id, outcome, summary_ct) values (${userId}, ${oppId}, ${outcome}, ${seal(pattern)})
                              on conflict (user_id, opportunity_id) do update set outcome = excluded.outcome, summary_ct = excluded.summary_ct, archive_status = 'pending' returning id`;
      const text = `[rv1 pattern outcome=${outcome}] ${pattern}`;
      waitUntil(
        (async () => {
          const mw = operatorMemwal();
          const job = await archive(mw, text, COMMUNITY_NS);
          await sql`update community_patterns set memwal_job_id = ${job} where id = ${row.id}`;
          for (let t = 0; t < 90; t++) {
            await new Promise((r) => setTimeout(r, 2500));
            const s = await archiveStatus(mw, job);
            if (s.status === "done" && s.blob_id) { await sql`update community_patterns set archive_status = 'done', blob_id = ${s.blob_id} where id = ${row.id}`; return; }
            if (s.status === "failed") break;
          }
          await sql`update community_patterns set archive_status = 'failed' where id = ${row.id} and archive_status = 'pending'`;
        })().catch(() => {}),
      );
    }
  }
  return { shared: true, indicators: indicators.length, pattern };
}

export async function communityStats() {
  const [r] = await sql`select (select count(distinct user_id) from community_votes) as reporters,
                               (select count(*) from community_indicators where scam_users >= 2 and scam_users > legit_users) as known_scam_indicators,
                               (select count(*) from community_patterns where archive_status = 'done') as patterns_on_walrus`;
  return { reporters: Number(r.reporters), known_scam_indicators: Number(r.known_scam_indicators), patterns_on_walrus: Number(r.patterns_on_walrus) };
}
