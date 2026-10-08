// How the whole platform learns from reported outcomes.
//   snapshot: when someone says how an offer ended, store the signals + tactics it showed and what Revoir predicted
//   stats:    per feature, in how many reported scams vs legit offers it appeared
//   model:    naive Bayes over present features, blended with Jev by evidence weight n/(n+10)
//   accuracy: Revoir's earlier predictions compared with what actually happened
import { sql } from "./db.js";

export type FeatureStat = { key: string; kind: "signal" | "tactic"; scam: number; legit: number };
export type Learned = { outcomes: number; scams: number; legits: number; features: FeatureStat[] };

let cache: { at: number; data: Learned } | null = null;

export async function learnedStats(): Promise<Learned> {
  if (cache && Date.now() - cache.at < 30_000) return cache.data;
  const [tot] = await sql`select count(*) filter (where outcome = 'scam') as s, count(*) filter (where outcome = 'legit') as l from outcome_snapshots`;
  const rows = await sql`
    select key, kind, count(*) filter (where outcome = 'scam') as scam, count(*) filter (where outcome = 'legit') as legit from (
      select jsonb_array_elements_text(signals) as key, 'signal' as kind, outcome from outcome_snapshots
      union all
      select jsonb_array_elements_text(tactics) as key, 'tactic' as kind, outcome from outcome_snapshots
    ) f group by key, kind`;
  const data: Learned = {
    outcomes: Number(tot.s) + Number(tot.l),
    scams: Number(tot.s),
    legits: Number(tot.l),
    features: rows.map((r) => ({ key: r.key, kind: r.kind, scam: Number(r.scam), legit: Number(r.legit) })),
  };
  cache = { at: Date.now(), data };
  return data;
}

// Tactic vocabulary so DeepSeek reuses learned tags instead of inventing synonyms.
export async function tacticVocabulary(limit = 40) {
  const l = await learnedStats();
  return l.features.filter((f) => f.kind === "tactic").sort((a, b) => b.scam + b.legit - (a.scam + a.legit)).slice(0, limit).map((f) => f.key);
}

export const normTactic = (t: string) => String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 48);

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (p: number) => Math.min(0.995, Math.max(0.005, p));

// Naive Bayes over the features this offer shows (present features only), Laplace-smoothed.
export function learnedProbability(l: Learned, present: string[]) {
  if (l.scams + l.legits < 3) return null;
  let lo = Math.log((l.scams + 1) / (l.legits + 1));
  const used: { key: string; scam: number; legit: number }[] = [];
  for (const key of new Set(present)) {
    const f = l.features.find((x) => x.key === key);
    if (!f) continue;
    lo += Math.log((f.scam + 1) / (l.scams + 2)) - Math.log((f.legit + 1) / (l.legits + 2));
    used.push({ key, scam: f.scam, legit: f.legit });
  }
  return { p: clamp(sigmoid(lo)), used };
}

// Blend: Jev carries the verdict early; learned evidence takes over as outcomes accumulate.
export function blend(jevP: number | null, learned: { p: number } | null, n: number) {
  if (learned === null) return { p: jevP, weight: 0 };
  if (jevP === null) return { p: learned.p, weight: 1 };
  const w = n / (n + 10);
  return { p: clamp(sigmoid(w * logit(learned.p) + (1 - w) * logit(clamp(jevP)))), weight: w };
}

export async function snapshotOutcome(oppId: string, userId: string, outcome: string, predicted: { level: string | null; p: number | null }, signals: string[], tactics: string[]) {
  await sql`insert into outcome_snapshots (opportunity_id, user_id, outcome, predicted_level, predicted_p, signals, tactics)
            values (${oppId}, ${userId}, ${outcome}, ${predicted.level}, ${predicted.p}, ${JSON.stringify([...new Set(signals)])}, ${JSON.stringify([...new Set(tactics.map(normTactic).filter(Boolean))])})
            on conflict (opportunity_id) do update set outcome = excluded.outcome, signals = excluded.signals, tactics = excluded.tactics, created_at = now()`;
  cache = null;
}

// How often Revoir's prediction (made before the outcome was known) matched what happened.
export async function accuracy() {
  const rows = await sql`select predicted_level, outcome, count(*) n from outcome_snapshots where outcome in ('scam','legit') and predicted_level is not null group by 1, 2`;
  const get = (lv: string, o: string) => Number(rows.find((r) => r.predicted_level === lv && r.outcome === o)?.n ?? 0);
  const highScam = get("high", "scam"), highLegit = get("high", "legit");
  const lowScam = get("low", "scam"), lowLegit = get("low", "legit");
  const medScam = get("medium", "scam"), medLegit = get("medium", "legit");
  const scams = highScam + medScam + lowScam;
  return {
    reported_outcomes: rows.reduce((s, r) => s + Number(r.n), 0),
    likely_scam_was_scam: highScam + highLegit ? +(highScam / (highScam + highLegit)).toFixed(2) : null,
    scams_flagged_before_outcome: scams ? +((highScam + medScam) / scams).toFixed(2) : null,
    no_signal_was_legit: lowScam + lowLegit ? +(lowLegit / (lowScam + lowLegit)).toFixed(2) : null,
  };
}
