// Single entry point for /api/* and /auth/google/* (see vercel.json rewrites).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { finishGoogle, requireUser, signOut, startGoogle } from "../lib/auth.js";
import { cfg } from "../lib/config.js";
import { open, seal } from "../lib/crypto.js";
import { sql } from "../lib/db.js";
import { loadOpportunity, rebuildDetails, submitCorrection, submitMessage, submitRepoScan } from "../lib/pipeline.js";
import { transcribeImage } from "../lib/providers.js";
import { exportWallet, provisionWallet, publicView, walletFor } from "../lib/wallet.js";

export const config = { maxDuration: 300 };

const body = (req: VercelRequest) => (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {});
const cp = (s: string) => Array.from(s).length;

async function route(path: string, req: VercelRequest, res: VercelResponse) {
  const m = req.method ?? "GET";
  if (path === "auth/start") return startGoogle(res);
  if (path === "auth/callback") return finishGoogle(req, res);
  if (path === "stats" && m === "GET") {
    // Aggregate evidence only: no content, no identities.
    const rows = await sql`select u.id, count(e.*) filter (where e.archive_status = 'done') as confirmed, count(distinct e.opportunity_id) as opps,
                                  min(e.recorded_at) as first, max(e.recorded_at) as last, count(distinct date(e.recorded_at)) as days
                           from users u join memory_events e on e.user_id = u.id where u.google_iss <> 'test' group by u.id order by confirmed desc`;
    const gm = await sql`select count(*) filter (where g.archive_status = 'done') as n from general_memory_items g join users u on u.id = g.user_id where u.google_iss <> 'test'`;
    return res.json({
      users_with_activity: rows.length,
      users_with_10_plus_confirmed: rows.filter((r) => Number(r.confirmed) >= 10).length,
      confirmed_opportunity_blobs: rows.reduce((s, r) => s + Number(r.confirmed), 0),
      confirmed_general_memory_blobs: Number(gm[0].n),
      per_user: rows.map((r, i) => ({ user: `user ${i + 1}`, confirmed_blobs: Number(r.confirmed), opportunities: Number(r.opps), active_days: Number(r.days), first: r.first, last: r.last })),
      network: "mainnet",
    });
  }

  const userId = requireUser(req);
  const b = m === "GET" ? {} : body(req);

  if (path === "me") {
    const [u] = await sql`select profile_ct, consent_version from users where id = ${userId}`;
    if (!u) throw Object.assign(new Error("not signed in"), { status: 401 });
    return res.json({ user: open(u.profile_ct), consent: u.consent_version === cfg.consentVersion, wallet: publicView(await walletFor(userId)) });
  }
  if (path === "signout") { signOut(res); return res.json({ ok: true }); }
  if (path === "consent" && m === "POST") {
    await sql`update users set consent_version = ${cfg.consentVersion}, consent_at = now() where id = ${userId}`;
    // Zentos-style: the user's own Sui wallet and MemWal account, gas sponsored.
    return res.json({ ok: true, wallet: await provisionWallet(userId) });
  }
  const [consented] = await sql`select 1 from users where id = ${userId} and consent_version = ${cfg.consentVersion}`;
  if (!consented) throw Object.assign(new Error("accept the processing notice first"), { status: 403 });

  if (path === "opportunities" && m === "GET") {
    const rows = await sql`select o.id, o.label_ct, o.status, o.last_activity_at, o.details_ct,
                                  (select count(*) from memory_events e where e.opportunity_id = o.id) as events
                           from opportunities o where o.user_id = ${userId} and o.status <> 'excluded' order by o.last_activity_at desc`;
    return res.json(rows.map((r) => {
      const details = r.details_ct ? open<Record<string, any>>(r.details_ct) : {};
      return { id: r.id, label: open(r.label_ct), status: r.status, last_activity_at: r.last_activity_at, events: Number(r.events),
               conflicts: Object.values(details).filter((t: any) => t.state === "conflicting_claims").length };
    }));
  }
  if (path === "opportunities" && m === "POST") {
    const label = String(b.label ?? "").trim().slice(0, 80);
    if (!label) throw Object.assign(new Error("label required"), { status: 400 });
    const [{ n }] = await sql`select count(*) as n from opportunities where user_id = ${userId} and status = 'active'`;
    if (Number(n) >= cfg.maxActive) throw Object.assign(new Error(`close an opportunity first (max ${cfg.maxActive} active)`), { status: 400 });
    const [o] = await sql`insert into opportunities (user_id, label_ct) values (${userId}, ${seal(label)}) returning id`;
    return res.json({ id: o.id, label });
  }
  if (path === "opportunity" && m === "GET") {
    const o = await loadOpportunity(userId, String(req.query.id));
    const events = await sql`select e.id, e.seq, e.kind, e.body_ct, e.archive_status, e.blob_id, e.recorded_at, a.body_ct as assessment_ct
                             from memory_events e left join assessments a on a.event_id = e.id where e.opportunity_id = ${o.id} order by e.seq`;
    const states = new Map((await sql`select claim_id, state from claim_states where opportunity_id = ${o.id}`).map((r) => [r.claim_id, r.state]));
    return res.json({
      id: o.id, label: open(o.label_ct), status: o.status,
      details: o.details_ct ? open(o.details_ct) : {},
      timeline: events.map((e) => {
        const bd = open<any>(e.body_ct);
        return { id: e.id, source_id: `S${e.seq}`, kind: e.kind, recorded_at: e.recorded_at, archive_status: e.archive_status, blob_id: e.blob_id,
                 text: bd.source.text, origin: bd.source.origin, platform: bd.source.platform ?? null, claims: bd.claims.map((c: any) => ({ ...c, claim_id: `${e.id}:${c.n}`, state: states.get(`${e.id}:${c.n}`) ?? "active" })),
                 assessment: e.assessment_ct ? open(e.assessment_ct) : null };
      }),
    });
  }
  if (path === "message" && m === "POST") {
    const o = await loadOpportunity(userId, String(b.id));
    if (o.status !== "active") throw Object.assign(new Error("reopen this opportunity to add updates"), { status: 400 });
    const [real] = await sql`select google_iss <> 'test' as real from users where id = ${userId}`;
    if (real?.real && (await walletFor(userId))?.status !== "ready") await provisionWallet(userId);
    const text = String(b.text ?? "").trim();
    if (!text) throw Object.assign(new Error("paste the message text"), { status: 400 });
    if (cp(text) > cfg.maxSource) throw Object.assign(new Error(`too long: keep it under ${cfg.maxSource} characters`), { status: 400 });
    const [{ n }] = await sql`select count(*) as n from memory_events where user_id = ${userId} and recorded_at > now() - interval '1 day'`;
    if (Number(n) >= cfg.dailyLimit) throw Object.assign(new Error("daily limit reached, try again tomorrow"), { status: 429 });
    const origin = b.origin === "screenshot" ? "screenshot" : "user_paste";
    return res.json(await submitMessage(userId, o.id, text, String(b.idem ?? randomUUID()), open(o.label_ct), origin, origin === "screenshot" ? String(b.platform ?? "other").slice(0, 20) : undefined));
  }
  if (path === "scan" && m === "POST") {
    const o = await loadOpportunity(userId, String(b.id));
    if (o.status !== "active") throw Object.assign(new Error("reopen this opportunity to add updates"), { status: 400 });
    const [{ n }] = await sql`select count(*) as n from memory_events where user_id = ${userId} and recorded_at > now() - interval '1 day'`;
    if (Number(n) >= cfg.dailyLimit) throw Object.assign(new Error("daily limit reached, try again tomorrow"), { status: 429 });
    return res.json(await submitRepoScan(userId, o.id, String(b.url ?? ""), String(b.idem ?? randomUUID()), open(o.label_ct)));
  }
  if (path === "transcribe" && m === "POST") {
    await loadOpportunity(userId, String(b.id));
    const img = String(b.image ?? "");
    if (!/^data:image\/(png|jpe?g|webp);base64,/.test(img)) throw Object.assign(new Error("send a PNG, JPEG or WebP screenshot"), { status: 400 });
    if (img.length > 3_500_000) throw Object.assign(new Error("screenshot too large: try cropping it"), { status: 400 });
    const [{ n }] = await sql`select count(*) as n from memory_events where user_id = ${userId} and recorded_at > now() - interval '1 day'`;
    if (Number(n) >= cfg.dailyLimit) throw Object.assign(new Error("daily limit reached, try again tomorrow"), { status: 429 });
    return res.json(await transcribeImage(img));
  }
  if (path === "correct" && m === "POST") {
    const o = await loadOpportunity(userId, String(b.id));
    return res.json(await submitCorrection(userId, o.id, String(b.claim_id), b.action === "withdraw" ? "withdraw" : "replace", String(b.replacement ?? "").slice(0, 500), String(b.idem ?? randomUUID())));
  }
  if (path === "status" && m === "POST") {
    const o = await loadOpportunity(userId, String(b.id));
    const st = b.status === "closed" ? "closed" : "active";
    await sql`update opportunities set status = ${st} where id = ${o.id}`;
    return res.json({ ok: true, status: st });
  }
  if (path === "forget" && m === "POST") {
    // Immediate exclusion from every response. Remote blob removal is a separate owner-authorized step (not automated yet).
    const o = await loadOpportunity(userId, String(b.id));
    await sql`update opportunities set status = 'excluded' where id = ${o.id}`;
    await sql`update general_memory_items set status = 'withdrawn' where source_opportunity_id = ${o.id}`;
    return res.json({ ok: true, status: "excluded", remote_deletion: "pending (owner-authorized removal not yet automated)" });
  }
  if (path === "memory" && m === "GET") {
    const rows = await sql`select g.id, g.kind, g.statement_ct, g.archive_status, g.blob_id, g.created_at, g.source_opportunity_id
                           from general_memory_items g join opportunities o on o.id = g.source_opportunity_id
                           where g.user_id = ${userId} and g.status = 'active' and o.status <> 'excluded' order by g.created_at desc limit 50`;
    return res.json(rows.map((r) => ({ id: r.id, kind: r.kind, statement: open(r.statement_ct), archive_status: r.archive_status, blob_id: r.blob_id, created_at: r.created_at, opportunity_id: r.source_opportunity_id })));
  }
  if (path === "wallet" && m === "GET") {
    const w = await walletFor(userId);
    return res.json(w?.status === "ready" ? publicView(w) : publicView(w) ?? { status: "none" });
  }
  if (path === "wallet/provision" && m === "POST") return res.json(await provisionWallet(userId));
  if (path === "wallet/export" && m === "POST") {
    if (b.confirm !== "export") throw Object.assign(new Error("confirmation required"), { status: 400 });
    return res.json(await exportWallet(userId));
  }
  if (path === "rebuild" && m === "POST") return res.json(await rebuildDetails(userId, (await loadOpportunity(userId, String(b.id))).id));
  throw Object.assign(new Error("not found"), { status: 404 });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = String(req.query.path ?? "").replace(/^\/+|\/+$/g, "");
  try {
    await route(path, req, res);
  } catch (e: any) {
    const status = e?.status ?? (/not found/.test(e?.message) ? 404 : 500);
    if (status === 500) console.error(path, e?.stack ?? e);
    if (path.startsWith("auth/")) return res.redirect(302, `/?error=${encodeURIComponent(e?.message ?? "sign-in failed")}`);
    res.status(status).json({ error: status === 500 ? "Something went wrong on our side. Your message was not lost if it shows in the timeline." : e.message });
  }
}
