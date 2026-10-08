// One user contribution, end to end:
//   freeze event -> DeepSeek extracts sourced claims -> archive to MemWal (async, confirmed later)
//   -> recall earlier evidence (MemWal semantic recall + confirmed DB projection) -> Jev classifies claim pairs
//   -> DeepSeek explains with citations -> validate -> update details + general memory.
import { randomUUID } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { sql } from "./db.js";
import { generalNamespace, open, opportunityNamespace, seal, sha256 } from "./crypto.js";
import { archive, archiveStatus, archiveText, compare, explain, extractClaims, operatorMemwal, parseEventId, recallIn, type Claim, type Pair, type Topic } from "./providers.js";
import { memwalFor } from "./wallet.js";
import { parseGithubUrl, scanRepo } from "./repo-scan.js";
import { extractIndicators, lookup, similarPatterns } from "./community.js";
import { decide, scamProbability, signalsFrom, type Verdict } from "./verdict.js";
import { blend, learnedProbability, learnedStats, normTactic, tacticVocabulary } from "./learning.js";

// Verdict for the offer as remembered so far: Jev probability + red-flag signals + the community well.
async function offerVerdict(oppId: string, allTexts: string[], claims: any[], changes: { relation: string; what: string }[], newestText: string, newTactics: string[] = []): Promise<Verdict> {
  const prev = await sql`select a.body_ct, e.kind from assessments a join memory_events e on e.id = a.event_id where e.opportunity_id = ${oppId}`;
  const prevBodies = prev.map((r) => ({ kind: r.kind as string, a: open<any>(r.body_ct) }));
  const repoLevels = prevBodies.filter((x) => x.kind === "repo_scan").map((x) => x.a.level as string);
  const tactics = [...new Set([...prevBodies.flatMap((x) => (x.a.tactics ?? []) as string[]), ...newTactics].map(normTactic).filter(Boolean))];
  const text = allTexts.join("\n");
  const signals = signalsFrom(claims, changes, repoLevels, text);
  const [matches, similar] = await Promise.all([lookup(extractIndicators(text)).catch(() => []), similarPatterns(newestText.slice(0, 1500))]);
  const community = { matches, similar };
  const jevP = await scamProbability(claims, changes, signals, community);
  // The platform's own learning: how these signals and tactics turned out in offers people reported on.
  const stats = await learnedStats();
  const learned = learnedProbability(stats, [...signals, ...tactics]);
  const blended = blend(jevP, learned, stats.outcomes);
  const v = decide(blended.p, signals, community);
  v.jev_p = jevP;
  v.learned = learned ? { p: learned.p, outcomes: stats.outcomes, weight: +blended.weight.toFixed(2), used: learned.used } : null;
  v.tactics = tactics;
  return v;
}
async function storeRisk(oppId: string, v: Verdict) {
  await sql`update opportunities set risk_level = ${v.level}, risk_p = ${v.probability} where id = ${oppId}`;
}

// Each user's memory lives in their own MemWal account, owned by their custodial wallet.
const memoryOf = async (userId: string) => (await memwalFor(userId)) ?? operatorMemwal();

type EventBody = {
  source: { text: string; origin: "user_paste" | "screenshot"; platform?: string; received_at: string };
  claims: Claim[];
  correction?: { target_claim_ids: string[]; action: "replace" | "withdraw"; explanation: string };
  verification?: { target: string; method: string; result: "reported_confirmed" | "reported_denied" | "inconclusive" };
  provenance: { extractor?: { requested: string; returned: string } };
};

// Claims in related topics are compared too ("onboarding only via portal" vs "contact on Telegram").
const RELATED: Record<Topic, Topic[]> = {
  payment_or_fee: ["payment_or_fee", "compensation", "onboarding_process"],
  compensation: ["compensation", "payment_or_fee"],
  role_or_company: ["role_or_company", "contact_or_identity"],
  contact_or_identity: ["contact_or_identity", "role_or_company", "communication_channel"],
  communication_channel: ["communication_channel", "onboarding_process", "contact_or_identity"],
  onboarding_process: ["onboarding_process", "communication_channel", "payment_or_fee", "documents_or_credentials"],
  documents_or_credentials: ["documents_or_credentials", "onboarding_process"],
  schedule_or_deadline: ["schedule_or_deadline"],
  other: [],
};
const PRIORITY: Topic[] = ["payment_or_fee", "documents_or_credentials", "communication_channel", "onboarding_process", "contact_or_identity", "compensation", "role_or_company", "schedule_or_deadline", "other"];

export async function loadOpportunity(userId: string, oppId: string) {
  const [o] = await sql`select * from opportunities where id = ${oppId} and user_id = ${userId} and status <> 'excluded'`;
  if (!o) throw new Error("opportunity not found");
  return o;
}

async function confirmedEvents(oppId: string): Promise<{ id: string; seq: number; kind: string; archive_status: string; blob_id: string | null; body: EventBody }[]> {
  const rows = await sql`select id, seq, kind, body_ct, archive_status, blob_id, recorded_at from memory_events where opportunity_id = ${oppId} order by seq`;
  return rows.map((r) => ({ id: r.id, seq: r.seq, kind: r.kind, archive_status: r.archive_status, blob_id: r.blob_id, body: open<EventBody>(r.body_ct) }));
}

// Archive in the background and record confirmation only on a terminal "done" with a blob id.
function archiveLater(userId: string, table: "memory_events" | "general_memory_items", rowId: string, text: string, namespace: string) {
  waitUntil(
    (async () => {
      try {
        const mw = await memoryOf(userId);
        const jobId = await archive(mw, text, namespace);
        if (table === "memory_events") await sql`update memory_events set memwal_job_id = ${jobId} where id = ${rowId}`;
        else await sql`update general_memory_items set memwal_job_id = ${jobId} where id = ${rowId}`;
        const t0 = Date.now();
        while (Date.now() - t0 < 240_000) {
          await new Promise((r) => setTimeout(r, 2500));
          const s = await archiveStatus(mw, jobId);
          if (s.status === "done" && s.blob_id) {
            if (table === "memory_events") await sql`update memory_events set archive_status = 'done', blob_id = ${s.blob_id} where id = ${rowId}`;
            else await sql`update general_memory_items set archive_status = 'done', blob_id = ${s.blob_id} where id = ${rowId}`;
            return;
          }
          if (s.status === "failed" || s.status === "not_found") break;
        }
        if (table === "memory_events") await sql`update memory_events set archive_status = 'failed' where id = ${rowId} and archive_status = 'pending'`;
        else await sql`update general_memory_items set archive_status = 'failed' where id = ${rowId} and archive_status = 'pending'`;
      } catch (e: any) {
        console.error("archive", e?.message ?? e);
        if (table === "memory_events") await sql`update memory_events set archive_status = 'failed' where id = ${rowId} and archive_status = 'pending'`;
      }
    })(),
  );
}

async function freezeEvent(userId: string, oppId: string, kind: EventBody extends never ? never : string, body: EventBody, idem: string) {
  const [dup] = await sql`select id, seq from memory_events where user_id = ${userId} and idempotency_key = ${idem}`;
  if (dup) return { id: dup.id as string, seq: dup.seq as number, duplicate: true };
  const [o] = await sql`update opportunities set next_seq = next_seq + 1, last_activity_at = now() where id = ${oppId} and user_id = ${userId} returning next_seq - 1 as seq`;
  const id = randomUUID();
  const payload = JSON.stringify(body);
  await sql`insert into memory_events (id, opportunity_id, user_id, seq, kind, body_ct, payload_sha256, idempotency_key)
            values (${id}, ${oppId}, ${userId}, ${o.seq}, ${kind}, ${seal(body)}, ${sha256(payload)}, ${idem})`;
  for (const c of body.claims) await sql`insert into claim_states (claim_id, opportunity_id, event_id, topic) values (${`${id}:${c.n}`}, ${oppId}, ${id}, ${c.topic}) on conflict do nothing`;
  return { id, seq: o.seq as number, duplicate: false };
}

export async function submitMessage(userId: string, oppId: string, text: string, idem: string, label: string, origin: "user_paste" | "screenshot" = "user_paste", platform?: string) {
  const t0 = Date.now();
  const extracted = await extractClaims(text);
  const body: EventBody = { source: { text, origin, ...(platform ? { platform } : {}), received_at: new Date().toISOString() }, claims: extracted.claims, provenance: { extractor: extracted.model } };
  const ev = await freezeEvent(userId, oppId, "source_message", body, idem);
  if (ev.duplicate) return { duplicate: true, event_id: ev.id };
  const ns = opportunityNamespace(userId, oppId);
  archiveLater(userId, "memory_events", ev.id, archiveText(ev.id, ev.seq, "source_message", text, extracted.claims), ns);
  const tExtract = Date.now();

  // ---- earlier evidence: MemWal recall (semantic) + confirmed projection (deterministic) ----
  const events = (await confirmedEvents(oppId)).filter((e) => e.id !== ev.id);
  const states = new Map((await sql`select claim_id, state from claim_states where opportunity_id = ${oppId}`).map((r) => [r.claim_id, r.state]));
  let recalledIds = new Set<string>();
  let recallError: string | null = null;
  if (events.length) {
    try {
      const query = extracted.claims.map((c) => c.statement).join("; ") || text.slice(0, 500);
      const hits = await recallIn(await memoryOf(userId), ns, query, 8);
      // Accept a recalled memory only if it parses to an event of THIS opportunity.
      const known = new Set(events.map((e) => e.id));
      recalledIds = new Set(hits.map((h) => parseEventId(h.text)).filter((id): id is string => !!id && known.has(id)));
    } catch (e: any) {
      recallError = String(e?.message ?? e);
    }
  }
  const tRecall = Date.now();

  // Prior active claims, newest first; recalled events get priority.
  const prior = events
    .flatMap((e) => e.body.claims.map((c: Claim) => ({ ...c, source: `S${e.seq}`, claim_id: `${e.id}:${c.n}`, recalled: recalledIds.has(e.id), seq: e.seq })))
    .filter((c) => (states.get(c.claim_id) ?? "active") === "active")
    .sort((a, b) => Number(b.recalled) - Number(a.recalled) || b.seq - a.seq);

  // ---- bounded pairs for Jev ----
  const pairs: Pair[] = [];
  const cur = [...extracted.claims].sort((a, b) => PRIORITY.indexOf(a.topic) - PRIORITY.indexOf(b.topic));
  for (const c of cur) {
    for (const p of prior) {
      if (pairs.length >= 6) break;
      if (!RELATED[c.topic].includes(p.topic)) continue;
      if (pairs.some((x) => x.prior.quote === p.quote && x.current.quote === c.quote)) continue;
      pairs.push({ id: `p${pairs.length + 1}`, topic: c.topic, prior: { source: p.source, statement: p.statement, quote: p.quote }, current: { source: `S${ev.seq}`, statement: c.statement, quote: c.quote } });
    }
  }
  // A screenshot or long paste can hold the whole story ("no fee" ... "pay the $45 fee"), so also compare
  // claims within this message, earlier line against later line.
  const curOrdered = [...extracted.claims].sort((a, b) => text.indexOf(a.quote) - text.indexOf(b.quote));
  for (let i = 0; i < curOrdered.length && pairs.length < 8; i++) {
    for (let j = i + 1; j < curOrdered.length && pairs.length < 8; j++) {
      const a = curOrdered[i], b = curOrdered[j];
      if (!RELATED[b.topic].includes(a.topic) || a.quote === b.quote) continue;
      pairs.push({ id: `p${pairs.length + 1}`, topic: b.topic, prior: { source: `S${ev.seq}`, statement: a.statement, quote: a.quote }, current: { source: `S${ev.seq}`, statement: b.statement, quote: b.quote } });
    }
  }
  const jev = await compare(pairs);
  const tJev = Date.now();

  // ---- explanation with citations ----
  const usedSources = new Set([`S${ev.seq}`, ...pairs.map((p) => p.prior.source)]);
  const sourceTexts = events.filter((e) => usedSources.has(`S${e.seq}`)).map((e) => ({ id: `S${e.seq}`, kind: e.kind, text: e.body.source.text, date: e.body.source.received_at.slice(0, 10) }));
  const known_tactics = await tacticVocabulary().catch(() => []);
  const ex = await explain({
    known_tactics,
    opportunity: label,
    current_source: { id: `S${ev.seq}`, text, claims: extracted.claims.map((c) => ({ topic: c.topic, statement: c.statement, quote: c.quote })) },
    earlier_sources: sourceTexts,
    jev: jev.results.map((r) => ({ ...pairs.find((p) => p.id === r.id), relation: r.choice, probability: r.probabilities[r.choice] })),
    note: recallError ? "Earlier evidence could not be recalled from memory; say the comparison may be incomplete." : undefined,
  });
  const valid = new Set([...usedSources, ...events.map((e) => `S${e.seq}`)]);
  const a = ex.assessment ?? {};
  const assessment = {
    headline: String(a.headline ?? ""),
    changes: (a.changes ?? []).filter((c: any) => valid.has(c.prior) && valid.has(c.current) && ["contradiction", "change"].includes(c.relation)),
    notes: (a.notes ?? []).map((n: any) => ({ text: String(n.text ?? ""), sources: (n.sources ?? []).filter((s: string) => valid.has(s)) })).filter((n: any) => n.text),
    unknown: String(a.unknown ?? ""),
    next_check: String(a.next_check ?? ""),
    source_id: `S${ev.seq}`,
    tactics: (Array.isArray(a.tactics) ? a.tactics : []).map((t: string) => normTactic(t)).filter(Boolean).slice(0, 4),
    jev: jev.results.map((r) => ({ ...r, pair: pairs.find((p) => p.id === r.id) })),
    jev_error: jev.error ?? null,
    jev_model: jev.model ?? null,
    recall: { recalled_events: [...recalledIds].length, prior_events: events.length, error: recallError },
    models: { extractor: extracted.model, explainer: ex.model },
    timings_ms: { extract: tExtract - t0, recall: tRecall - tExtract, jev: tJev - tRecall, explain: Date.now() - tJev },
  };
  const verdict = await offerVerdict(
    oppId,
    [...events.map((e) => e.body.source.text), text],
    [...prior.map((c) => ({ ...c })), ...extracted.claims.map((c) => ({ ...c, source: `S${ev.seq}` }))],
    assessment.changes,
    text,
    assessment.tactics,
  );
  (assessment as any).verdict = verdict;
  await storeRisk(oppId, verdict);
  await sql`insert into assessments (opportunity_id, event_id, body_ct) values (${oppId}, ${ev.id}, ${seal(assessment)})`;

  // Contradicted earlier claims become "disputed" (kept, never overwritten).
  for (const r of jev.results) {
    if (r.choice !== "contradiction" || (r.probabilities.contradiction ?? 0) < 0.6) continue;
    const p = pairs.find((x) => x.id === r.id)!;
    const old = prior.find((c) => c.source === p.prior.source && c.quote === p.prior.quote);
    if (old) await sql`update claim_states set state = 'disputed' where claim_id = ${old.claim_id} and state = 'active'`;
    // Contradiction inside this same message: the earlier line is the disputed one.
    if (p.prior.source === `S${ev.seq}`) {
      const own = extracted.claims.find((c) => c.quote === p.prior.quote);
      if (own) await sql`update claim_states set state = 'disputed' where claim_id = ${`${ev.id}:${own.n}`} and state = 'active'`;
    }
  }

  await rebuildDetails(userId, oppId);
  if (assessment.next_check) await addOpenCheck(userId, oppId, ev.id, label, assessment.next_check);
  return { event_id: ev.id, source_id: `S${ev.seq}`, claims: extracted.claims, assessment };
}

// A repo the offer asks you to clone/run: static scan, stored in this offer's memory like any other event.
export async function submitRepoScan(userId: string, oppId: string, url: string, idem: string, label: string) {
  const ref = parseGithubUrl(url);
  if (!ref) throw Object.assign(new Error("paste a public GitHub repository link"), { status: 400 });
  const scan = await scanRepo(ref).catch((e) => { throw Object.assign(new Error(`Couldn't scan ${ref.owner}/${ref.repo}: ${e?.message ?? e}`), { status: 400 }); });
  const text = `Repo scan: ${scan.url} (${scan.level.replace(/_/g, " ")})`;
  const body: EventBody = { source: { text, origin: "user_paste", received_at: new Date().toISOString() }, claims: [], provenance: {} };
  const ev = await freezeEvent(userId, oppId, "repo_scan", body, idem);
  if (ev.duplicate) return { duplicate: true, event_id: ev.id };
  const memo = [
    `[rv1 ev=${ev.id} S${ev.seq} repo_scan]`,
    `GitHub repo ${scan.repo} at commit ${scan.commit ?? scan.ref}: ${scan.level.replace(/_/g, " ")}.`,
    scan.summary,
    ...scan.install_behavior.map((b: string) => `- runs automatically: ${b}`),
    ...scan.findings.map((f: any) => `- ${f.severity}: ${f.what} (${f.file}:${f.line ?? "?"})`),
  ].join("\n");
  archiveLater(userId, "memory_events", ev.id, memo, opportunityNamespace(userId, oppId));
  const priorEvents = await confirmedEvents(oppId);
  const verdict = await offerVerdict(oppId, priorEvents.map((e) => e.body.source.text).concat(`${scan.url}`), priorEvents.flatMap((e) => e.body.claims.map((c: Claim) => ({ ...c, source: `S${e.seq}` }))), [], scan.summary);
  if (scan.level === "red_flags" && verdict.level !== "high") { verdict.level = "high"; verdict.label = "Likely scam"; }
  await storeRisk(oppId, verdict);
  const assessment = { kind: "repo_scan", source_id: `S${ev.seq}`, ...scan, verdict };
  await sql`insert into assessments (opportunity_id, event_id, body_ct) values (${oppId}, ${ev.id}, ${seal(assessment)})`;
  if (scan.level !== "no_red_flags_found" && scan.next_step) await addOpenCheck(userId, oppId, ev.id, label, `Repo ${scan.repo}: ${scan.next_step}`);
  return { event_id: ev.id, source_id: `S${ev.seq}`, assessment };
}

// Corrections never edit history: they append an event and change claim state.
export async function submitCorrection(userId: string, oppId: string, claimId: string, action: "replace" | "withdraw", replacement: string, idem: string) {
  const [cs] = await sql`select claim_id, topic, event_id from claim_states where claim_id = ${claimId} and opportunity_id = ${oppId}`;
  if (!cs) throw new Error("claim not found in this opportunity");
  const claims: Claim[] = action === "replace" && replacement ? [{ n: 1, topic: cs.topic, statement: replacement, quote: replacement, requested_action: false }] : [];
  const body: EventBody = {
    source: { text: replacement || "(withdrawn by user)", origin: "user_paste", received_at: new Date().toISOString() },
    claims,
    correction: { target_claim_ids: [claimId], action, explanation: "User correction of the extracted interpretation." },
    provenance: {},
  };
  const ev = await freezeEvent(userId, oppId, "user_correction", body, idem);
  await sql`update claim_states set state = ${action === "replace" ? "superseded" : "withdrawn"}, superseded_by = ${ev.id} where claim_id = ${claimId}`;
  archiveLater(userId, "memory_events", ev.id, archiveText(ev.id, ev.seq, "user_correction", `Correction of ${claimId}: ${replacement || "withdrawn"}`, claims), opportunityNamespace(userId, oppId));
  await rebuildDetails(userId, oppId);
  return { event_id: ev.id, source_id: `S${ev.seq}` };
}

// Current details = per-topic projection of confirmed claims. Conflicts stay visible instead of being overwritten.
export async function rebuildDetails(userId: string, oppId: string) {
  const events = await confirmedEvents(oppId);
  const states = new Map((await sql`select claim_id, state from claim_states where opportunity_id = ${oppId}`).map((r) => [r.claim_id, r.state]));
  const topics: Record<string, { current: any; history: any[]; state: string }> = {};
  for (const e of events) {
    for (const c of e.body.claims) {
      const id = `${e.id}:${c.n}`;
      const st = states.get(id) ?? "active";
      const entry = { claim_id: id, source: `S${e.seq}`, statement: c.statement, quote: c.quote, state: st, requested_action: c.requested_action, kind: e.kind };
      const t = (topics[c.topic] ??= { current: null, history: [], state: "consistent" });
      t.history.push(entry);
      if (st === "active" || st === "disputed") t.current = entry;
      if (st === "disputed") t.state = "conflicting_claims";
    }
  }
  await sql`update opportunities set details_ct = ${seal(topics)}, details_revision = details_revision + 1 where id = ${oppId} and user_id = ${userId}`;
  return topics;
}

// Private general memory: open checks carry their originating opportunity. Archived in the user's general namespace.
async function addOpenCheck(userId: string, oppId: string, eventId: string, label: string, check: string) {
  const statement = `Open check in "${label}": ${check}`;
  const id = randomUUID();
  await sql`insert into general_memory_items (id, user_id, kind, statement_ct, status, source_opportunity_id, source_event_id) values (${id}, ${userId}, 'open_check', ${seal(statement)}, 'active', ${oppId}, ${eventId})`;
  archiveLater(userId, "general_memory_items", id, `[rv1 gm=${id} open_check] ${statement}`, generalNamespace(userId));
}
