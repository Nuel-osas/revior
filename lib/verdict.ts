// The verdict: is this offer a scam? Three independent inputs, all shown to the user.
//   1. Jev: calibrated probability that the offer, as remembered so far, is a scam
//   2. Signals: deterministic red flags from the sourced claims and repo scans
//   3. The well of experience: indicators and patterns other people reported
import { cfg } from "./config.js";
import type { Claim } from "./providers.js";
import type { Match } from "./community.js";

export type Verdict = {
  level: "high" | "medium" | "low";
  label: string;
  probability: number | null;
  jev_p?: number | null;
  learned?: { p: number; outcomes: number; weight: number; used: { key: string; scam: number; legit: number }[] } | null;
  tactics?: string[];
  signals: string[];
  community: { matches: Match[]; similar: { outcome: string; summary: string; distance: number }[] };
};

type C = Pick<Claim, "topic" | "statement" | "quote" | "requested_action"> & { source: string };

export function signalsFrom(claims: C[], changes: { relation: string; what: string }[], repoLevels: string[], allText: string): string[] {
  const s: string[] = [];
  const t = allText.toLowerCase();
  // Only when the candidate is the one paying ("we pay you $400" is not a red flag).
  const youPay = (c: C) => c.topic === "payment_or_fee" && c.requested_action && !/\b(we|company|employer|they) (will )?pay (you|the (candidate|recipient|contractor))\b|paid to you|payments? (are|is) made to you|you invoice|no payment/i.test(`${c.statement} ${c.quote}`);
  if (claims.some(youPay)) s.push("You are asked to pay something");
  if (/gift ?card|usdt|bitcoin|\bbtc\b|crypto|wallet address|western union|moneygram|send (the )?money/.test(t)) s.push("Payment by crypto, gift card or money transfer");
  if (/(via|through|using) (the |this )?link|click (the |this )?link|pay(ment)? link/.test(t)) s.push("Payment or onboarding through a link they send");
  if (/\b(today|right now|immediately|asap|within (24|48) hours|before (tonight|midnight)|expires? (today|soon))\b/.test(t) && claims.some((c) => c.requested_action)) s.push("Pressure to act quickly");
  if (claims.some((c) => c.topic === "communication_channel" && /telegram|whatsapp|signal|personal (email|number)/i.test(c.statement))) s.push("Moved to Telegram, WhatsApp or a personal channel");
  if (claims.some((c) => c.topic === "documents_or_credentials" && c.requested_action)) s.push("Asks for documents, IDs or credentials");
  if (/no (video|camera)|text(-| )only interview|interview (on|via) (telegram|whatsapp|chat)/.test(t)) s.push("No video call or a text-only interview");
  if (/\$\s?\d{3,}\s?(\/|per)\s?(day|hour)|earn \$?\d{3,} (daily|a day)|no experience (needed|required)/.test(t)) s.push("Pay that looks too good for the work");
  const contra = changes.filter((c) => c.relation === "contradiction").length;
  if (contra) s.push(`${contra} earlier promise${contra === 1 ? "" : "s"} contradicted`);
  if (repoLevels.includes("red_flags")) s.push("A repo they sent has red flags");
  else if (repoLevels.includes("caution")) s.push("A repo they sent needs a closer look");
  return s;
}

export async function scamProbability(claims: C[], changes: { what: string }[], signals: string[], community: Verdict["community"]) {
  const state = {
    claims: claims.slice(-25).map((c) => `${c.source}: ${c.statement}`),
    changes: changes.map((c) => c.what).slice(0, 6),
    red_flags: signals,
    community: {
      indicators_reported_as_scam_by_others: community.matches.filter((m) => m.scam_users > 0).map((m) => `${m.kind} reported by ${m.scam_users} as scam, ${m.legit_users} as legit`),
      similar_reported_patterns: community.similar.map((p) => `${p.outcome}: ${p.summary}`),
    },
  };
  try {
    const res = await fetch(`${cfg.jev.base}/v1/systemone`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.jev.key}` },
      body: JSON.stringify({ model: cfg.jev.model, state, questions: { scam: { type: "noul", instructions: "This job or collaboration offer is a scam: it aims to take the candidate's money, credentials, personal data or run malicious code on their machine, rather than being a genuine opportunity." } } }),
      signal: AbortSignal.timeout(20_000),
    });
    const j: any = await res.json();
    const p = j?.answers?.scam?.noul;
    return typeof p === "number" ? p : null;
  } catch {
    return null;
  }
}

export function decide(p: number | null, signals: string[], community: Verdict["community"]): Verdict {
  const known = community.matches.some((m) => m.known_scam);
  const reported = community.matches.some((m) => m.scam_users > m.legit_users);
  const similarScam = community.similar.some((x) => x.outcome === "scam");
  const strong = signals.filter((x) => /pay something|crypto|documents|red flags|contradicted/.test(x)).length;
  let level: Verdict["level"] = "low";
  if (known || (p ?? 0) >= 0.7 || (strong >= 2 && (p ?? 0.5) >= 0.5)) level = "high";
  else if (reported || similarScam || (p ?? 0) >= 0.4 || strong >= 1) level = "medium";
  const label = level === "high" ? "Likely scam" : level === "medium" ? "Suspicious" : "No scam signals found";
  return { level, label, probability: p, signals, community };
}
