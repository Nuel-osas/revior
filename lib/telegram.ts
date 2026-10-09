// Telegram bot: forward or paste a recruiter's messages, get the same second look as the web app.
// Same pipeline, same Walrus memory, same verdict. Each Telegram user gets their own Sui wallet and MemWal account.
import { createHash } from "node:crypto";
import { cfg } from "./config.js";
import { open, seal } from "./crypto.js";
import { sql } from "./db.js";
import { submitMessage, submitRepoScan } from "./pipeline.js";
import { transcribeImage } from "./providers.js";
import { reportOutcome } from "./community.js";
import { provisionWallet, walletFor } from "./wallet.js";
import { parseGithubUrl } from "./repo-scan.js";

const token = () => process.env.TELEGRAM_BOT_TOKEN ?? (() => { throw new Error("missing env TELEGRAM_BOT_TOKEN"); })();
// Webhook secret derived from the bot token, so there is no second secret to manage.
export const webhookSecret = () => createHash("sha256").update(`revoir-webhook:${token()}`).digest("hex").slice(0, 48);

async function tg(method: string, payload: object): Promise<any> {
  const r = await fetch(`https://api.telegram.org/bot${token()}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) });
  const j: any = await r.json().catch(() => ({}));
  if (!j.ok) console.error("telegram", method, j.description);
  return j.result;
}
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const send = (chat: number, text: string, extra: object = {}) => tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
const edit = (chat: number, id: number, text: string, extra: object = {}) => tg("editMessageText", { chat_id: chat, message_id: id, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

const HELP = `<b>Revoir</b> remembers what a recruiter told you and catches the moment the story changes.

<b>How to use it</b>
1. /new Name of the offer (e.g. <code>/new Binance community manager</code>)
2. Forward the recruiter's messages here, paste them, or send screenshots. Each one is saved to your Walrus memory.
3. Every new message is compared with everything they said before. You get what changed, quoted, and a verdict.

/offers  switch between offers
/scan github.com/user/repo  scan a repo they asked you to run, without running it
/done  report how the offer ended, so the next person is warned
/wallet  your Sui wallet and memory account

Web app: https://revior.xyz`;

async function userFor(from: any): Promise<{ id: string; consented: boolean }> {
  const sub = String(from.id);
  const profile = seal({ name: [from.first_name, from.last_name].filter(Boolean).join(" "), username: from.username ?? null });
  const [u] = await sql`insert into users (google_iss, google_sub, profile_ct) values ('telegram', ${sub}, ${profile})
                        on conflict (google_iss, google_sub) do update set google_sub = excluded.google_sub
                        returning id, consent_version`;
  return { id: u.id, consented: u.consent_version === cfg.consentVersion };
}

async function chatState(chat: number, userId: string) {
  const [c] = await sql`insert into tg_chats (chat_id, user_id) values (${chat}, ${userId}) on conflict (chat_id) do update set updated_at = now() returning active_opportunity`;
  return c.active_opportunity as string | null;
}
const setActive = (chat: number, oppId: string | null) => sql`update tg_chats set active_opportunity = ${oppId}, updated_at = now() where chat_id = ${chat}`;

async function underDailyLimit(userId: string) {
  const [{ n }] = await sql`select count(*) as n from memory_events where user_id = ${userId} and recorded_at > now() - interval '1 day'`;
  return Number(n) < cfg.dailyLimit;
}

async function createOffer(chat: number, userId: string, label: string) {
  const [{ n }] = await sql`select count(*) as n from opportunities where user_id = ${userId} and status = 'active'`;
  if (Number(n) >= cfg.maxActive) { await send(chat, `You have ${cfg.maxActive} open offers. Close one with /done first.`); return null; }
  const [o] = await sql`insert into opportunities (user_id, label_ct) values (${userId}, ${seal(label.slice(0, 80))}) returning id`;
  await setActive(chat, o.id);
  return o.id as string;
}

async function activeOffer(chat: number, userId: string, hint?: string) {
  const id = await chatState(chat, userId);
  if (id) {
    const [o] = await sql`select id, label_ct, status from opportunities where id = ${id} and user_id = ${userId}`;
    if (o && o.status === "active") return { id: o.id as string, label: open<string>(o.label_ct) };
  }
  // No offer yet: start one so the first forwarded message isn't lost.
  const label = hint ? `Offer from ${hint}` : `Offer ${new Date().toISOString().slice(0, 10)}`;
  const nid = await createOffer(chat, userId, label);
  if (!nid) return null;
  await send(chat, `Started a new offer: <b>${esc(label)}</b>. Rename it any time with /new.`);
  return { id: nid, label };
}

function verdictText(r: any): string {
  const a = r.assessment ?? {};
  const v = a.verdict;
  const out: string[] = [];
  if (v) {
    const dot = v.level === "high" ? "🔴" : v.level === "medium" ? "🟠" : "🟢";
    out.push(`${dot} <b>${esc(v.label)}</b>${typeof v.probability === "number" ? ` · ${Math.round(v.probability * 100)}% scam likelihood` : ""}`);
  }
  if (a.kind === "repo_scan") {
    out.push(`\n<b>${esc(a.repo)}</b>: ${esc(a.summary)}`);
    for (const f of (a.findings ?? []).slice(0, 4)) out.push(`• <b>${esc(f.severity)}</b> ${esc(f.file)}${f.line ? `:${f.line}` : ""}: ${esc(f.what)}`);
    if (a.next_step) out.push(`\n<b>Before you run anything:</b> ${esc(a.next_step)}`);
  } else {
    if (a.headline) out.push(`\n${esc(a.headline)}`);
    const contra = (a.jev ?? []).filter((j: any) => j.choice === "contradiction" && j.pair).slice(0, 3);
    if (contra.length) {
      out.push(`\n<b>What changed</b> (recalled from your Walrus memory)`);
      for (const j of contra) out.push(`Then ${esc(j.pair.prior.source)}: <i>"${esc(j.pair.prior.quote)}"</i>\nNow ${esc(j.pair.current.source)}: <i>"${esc(j.pair.current.quote)}"</i>`);
    } else if (a.recall?.prior_events === 0) {
      out.push(`\nSaved as the baseline (${esc(a.source_id)}). Forward the next message when it arrives and I'll compare it with this one.`);
    }
  }
  if (v?.signals?.length) out.push(`\n<b>Red flags</b>\n${v.signals.slice(0, 6).map((s: string) => `• ${esc(s)}`).join("\n")}`);
  const links = (v?.links ?? []).slice(0, 4);
  if (links.length) out.push(`\n<b>Links</b>\n${links.map((l: any) => `• <code>${esc(l.host)}</code> ${esc(l.detail)}`).join("\n")}`);
  const known = (v?.community?.matches ?? []).filter((m: any) => m.scam_users);
  if (known.length) out.push(`\n<b>From the Revoir community</b>\n${known.map((m: any) => `• This ${esc(m.kind)} was reported as a scam by ${m.scam_users} user${m.scam_users === 1 ? "" : "s"}`).join("\n")}`);
  if (a.next_check) out.push(`\n<b>Next check:</b> ${esc(a.next_check)}`);
  out.push(`\n<i>Saved to your Walrus memory as ${esc(a.source_id ?? r.source_id)}.</i>`);
  return out.join("\n").slice(0, 4000);
}

async function analyse(chat: number, userId: string, run: (offer: { id: string; label: string }) => Promise<any>, hint?: string) {
  if (!(await underDailyLimit(userId))) return send(chat, "Daily limit reached. Try again tomorrow.");
  const offer = await activeOffer(chat, userId, hint);
  if (!offer) return;
  const msg = await send(chat, `🔎 Taking a second look at <b>${esc(offer.label)}</b>: reading, recalling what they said before from Walrus, comparing…`);
  try {
    if ((await walletFor(userId))?.status !== "ready") await provisionWallet(userId);
    const r = await run(offer);
    if (r?.duplicate) return edit(chat, msg.message_id, "Already saved that one.");
    await edit(chat, msg.message_id, verdictText(r), { reply_markup: { inline_keyboard: [[{ text: "How did this end?", callback_data: `end:${offer.id}` }, { text: "Switch offer", callback_data: "offers" }]] } });
  } catch (e: any) {
    console.error("telegram analyse", e?.stack ?? e);
    await edit(chat, msg.message_id, `Something went wrong: ${esc(e?.message ?? "unknown error")}. Try sending it again.`);
  }
}

async function listOffers(chat: number, userId: string) {
  const rows = await sql`select id, label_ct, risk_level from opportunities where user_id = ${userId} and status = 'active' order by last_activity_at desc limit 8`;
  if (!rows.length) return send(chat, "No open offers yet. Start one with /new Name of the offer.");
  const active = await chatState(chat, userId);
  const dot = (l: string | null) => (l === "high" ? "🔴 " : l === "medium" ? "🟠 " : l === "low" ? "🟢 " : "");
  return send(chat, "Which offer should new messages go to?", { reply_markup: { inline_keyboard: rows.map((r) => [{ text: `${r.id === active ? "✓ " : ""}${dot(r.risk_level)}${open<string>(r.label_ct)}`.slice(0, 60), callback_data: `use:${r.id}` }]) } });
}

async function consentPrompt(chat: number) {
  return send(chat, `${HELP}\n\n<b>Before we start</b>\nRevoir saves the messages you send here, encrypted, and stores them in a Walrus Memory account owned by a Sui wallet created for you (gas is paid by Revoir). If you report how an offer ended, phone numbers, domains and handles from it are shared only as hashes, plus an anonymised description of the tactic. Remove codes, passwords and ID numbers before forwarding.`,
    { reply_markup: { inline_keyboard: [[{ text: "I agree, create my memory", callback_data: "consent" }]] } });
}

async function onCallback(q: any) {
  const chat = q.message?.chat?.id;
  const data = String(q.data ?? "");
  await tg("answerCallbackQuery", { callback_query_id: q.id });
  if (!chat) return;
  const u = await userFor(q.from);
  if (data === "consent") {
    await sql`update users set consent_version = ${cfg.consentVersion}, consent_at = now() where id = ${u.id}`;
    const m = await send(chat, "Creating your Sui wallet and Walrus Memory account…");
    try {
      const w: any = await provisionWallet(u.id);
      await edit(chat, m.message_id, `✅ Ready. Your wallet: <code>${esc(w?.address ?? "")}</code>\n\nStart with /new Name of the offer, then forward the recruiter's first message.`);
    } catch (e: any) {
      await edit(chat, m.message_id, `Couldn't create your wallet yet (${esc(e?.message)}). You can still start: /new Name of the offer.`);
    }
    return;
  }
  if (!u.consented) return consentPrompt(chat);
  if (data === "offers") return listOffers(chat, u.id);
  if (data.startsWith("use:")) {
    const id = data.slice(4);
    const [o] = await sql`select label_ct from opportunities where id = ${id} and user_id = ${u.id} and status = 'active'`;
    if (!o) return send(chat, "That offer is closed.");
    await chatState(chat, u.id); await setActive(chat, id);
    return send(chat, `New messages now go to <b>${esc(open<string>(o.label_ct))}</b>.`);
  }
  if (data.startsWith("end:")) {
    const id = data.slice(4);
    return send(chat, "How did it end?", { reply_markup: { inline_keyboard: [[{ text: "It was a scam", callback_data: `out:${id}:scam` }, { text: "It was legit", callback_data: `out:${id}:legit` }, { text: "Not sure", callback_data: `out:${id}:unsure` }]] } });
  }
  if (data.startsWith("out:")) {
    const [, id, outcome] = data.split(":");
    const [o] = await sql`select id from opportunities where id = ${id} and user_id = ${u.id}`;
    if (!o || !["scam", "legit", "unsure"].includes(outcome)) return;
    await reportOutcome(u.id, id, outcome as any, true);
    return send(chat, outcome === "scam" ? "Thank you. The numbers, domains and handles from this offer now warn the next person, and the verdict learns from it." : "Thank you, noted. It helps the verdict learn.");
  }
}

async function onMessage(m: any) {
  const chat = m.chat?.id;
  if (!chat) return;
  if (m.chat.type !== "private") return send(chat, "Message me directly so your offers stay private.");
  const u = await userFor(m.from);
  const text: string = (m.text ?? m.caption ?? "").trim();
  if (text === "/start" || text.startsWith("/start ") || !u.consented) {
    if (u.consented) return send(chat, HELP);
    return consentPrompt(chat);
  }
  if (text === "/help") return send(chat, HELP);
  if (text === "/offers") return listOffers(chat, u.id);
  if (text === "/wallet") {
    const w: any = await walletFor(u.id);
    return send(chat, w ? `Wallet: <code>${esc(w.address)}</code>\nMemory account: <code>${esc(w.memwal_account_id ?? "being created")}</code>\nhttps://suiscan.xyz/mainnet/account/${esc(w.address)}` : "No wallet yet. Send /start.");
  }
  // Answer to a bare /new or /scan from the command menu.
  await chatState(chat, u.id);
  const [{ awaiting }] = await sql`select awaiting from tg_chats where chat_id = ${chat}`;
  if (awaiting && text && !text.startsWith("/")) {
    await sql`update tg_chats set awaiting = null where chat_id = ${chat}`;
    if (awaiting === "name") {
      const id = await createOffer(chat, u.id, text);
      if (id) await send(chat, `Started <b>${esc(text.slice(0, 80))}</b>. Now forward or paste the recruiter's first message.`);
      return;
    }
    if (awaiting === "repo") {
      if (!parseGithubUrl(text)) return send(chat, "That isn't a public GitHub link. Try /scan again.");
      return analyse(chat, u.id, (o) => submitRepoScan(u.id, o.id, text, `tg:${chat}:${m.message_id}`, o.label));
    }
  }
  if (text.startsWith("/") && awaiting) await sql`update tg_chats set awaiting = null where chat_id = ${chat}`;
  if (text.startsWith("/new")) {
    const label = text.replace(/^\/new(@\w+)?/, "").trim();
    if (!label) {
      await sql`update tg_chats set awaiting = 'name' where chat_id = ${chat}`;
      return send(chat, "What should I call this offer? For example: <i>Binance community manager</i>");
    }
    await chatState(chat, u.id);
    const id = await createOffer(chat, u.id, label);
    if (id) await send(chat, `Started <b>${esc(label)}</b>. Forward or paste the recruiter's first message.`);
    return;
  }
  if (text === "/done") {
    const id = await chatState(chat, u.id);
    if (!id) return send(chat, "No offer selected. Use /offers.");
    return onCallback({ id: "local", data: `end:${id}`, from: m.from, message: { chat: { id: chat } } });
  }
  const hint = m.forward_origin?.sender_user?.first_name ?? m.forward_origin?.sender_user_name ?? m.forward_origin?.chat?.title ?? m.forward_from?.first_name;
  const repo = text.startsWith("/scan") ? text.replace(/^\/scan(@\w+)?/, "").trim() : (/^\S*github\.com\/\S+$/.test(text) ? text : "");
  if (text.startsWith("/scan") || repo) {
    if (!repo) {
      await sql`update tg_chats set awaiting = 'repo' where chat_id = ${chat}`;
      return send(chat, "Send me the GitHub link they asked you to clone or run.");
    }
    if (!parseGithubUrl(repo)) return send(chat, "Send a public GitHub link: <code>/scan github.com/user/repo</code>");
    return analyse(chat, u.id, (o) => submitRepoScan(u.id, o.id, repo, `tg:${chat}:${m.message_id}`, o.label));
  }
  if (m.photo?.length) {
    return analyse(chat, u.id, async (o) => {
      const f = await tg("getFile", { file_id: m.photo[m.photo.length - 1].file_id });
      const img = await fetch(`https://api.telegram.org/file/bot${token()}/${f.file_path}`, { signal: AbortSignal.timeout(15_000) });
      const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
      const t: any = await transcribeImage(`data:image/jpeg;base64,${b64}`);
      if (!t?.has_text || !t.transcript) throw new Error("I couldn't read any message text in that image");
      const full = text ? `${t.transcript}\n\n${text}` : t.transcript;
      return submitMessage(u.id, o.id, full.slice(0, cfg.maxSource), `tg:${chat}:${m.message_id}`, o.label, "screenshot", t.platform);
    }, hint);
  }
  if (text.startsWith("/")) return send(chat, HELP);
  if (!text) return send(chat, "Send the message text or a screenshot.");
  return analyse(chat, u.id, (o) => submitMessage(u.id, o.id, text.slice(0, cfg.maxSource), `tg:${chat}:${m.message_id}`, o.label, "user_paste", "telegram"), hint);
}

export async function handleUpdate(update: any) {
  try {
    if (update.callback_query) return await onCallback(update.callback_query);
    if (update.message) return await onMessage(update.message);
  } catch (e: any) {
    console.error("telegram update", e?.stack ?? e);
  }
}
