// Link check: phishing tells in the links and email domains a "recruiter" sends.
// Never fetches the links themselves. The only network call is RDAP (public registry data) for a domain's age.
//   lookalike   a domain imitating a known brand (binance-careers.top, rnetamask.io, sui-foundation.com)
//   new domain  registered in the last 30 days
//   hidden      URL shorteners, punycode (xn--), raw IP addresses
//   changed     the newest message links to a domain that none of the earlier messages used

export type LinkFinding = { host: string; kind: "lookalike" | "new_domain" | "shortener" | "punycode" | "raw_ip" | "changed_domain"; detail: string };

// Official domains per brand. Anything else that imitates the brand is a lookalike.
const BRANDS: Record<string, string[]> = {
  sui: ["sui.io", "suifoundation.org", "mystenlabs.com", "suiscan.xyz", "suivision.xyz", "suins.io"],
  mysten: ["mystenlabs.com"],
  walrus: ["walrus.xyz", "wal.app", "walrus.site"],
  metamask: ["metamask.io"],
  binance: ["binance.com", "binance.us"],
  coinbase: ["coinbase.com"],
  bybit: ["bybit.com"],
  kucoin: ["kucoin.com"],
  kraken: ["kraken.com"],
  okx: ["okx.com"],
  phantom: ["phantom.app", "phantom.com"],
  trustwallet: ["trustwallet.com"],
  ledger: ["ledger.com"],
  uniswap: ["uniswap.org"],
  opensea: ["opensea.io"],
  solana: ["solana.com", "solana.org"],
  ethereum: ["ethereum.org"],
  linkedin: ["linkedin.com", "lnkd.in"],
  github: ["github.com"],
  google: ["google.com"],
  microsoft: ["microsoft.com"],
  zoom: ["zoom.us", "zoom.com"],
  calendly: ["calendly.com"],
  telegram: ["telegram.org", "t.me"],
  discord: ["discord.com", "discord.gg"],
  upwork: ["upwork.com"],
  indeed: ["indeed.com"],
  slack: ["slack.com"],
  deel: ["deel.com"],
};
// Words scammers bolt onto a short brand name: sui-careers, suifoundation-hr, binancejobs.
const BOLT_ON = /^(foundation|network|labs?|careers?|jobs?|hr|hiring|recruit(ing|ment)?|grants?|airdrops?|wallet|app|official|support|team|portal|onboard(ing)?|verify|verification|meet|meeting|call|connect|dao|io|web3|global|pro|hub)$/;
const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "goo.gl", "is.gd", "ow.ly", "cutt.ly", "rebrand.ly", "shorturl.at", "rb.gy", "tiny.cc", "s.id", "t.ly", "bl.ink", "short.io", "v.gd", "qr.co"]);
// Shared hosting: the registrable domain belongs to the host, not the sender, so lookalike and age checks don't apply.
const HOSTED = /\.(github\.io|vercel\.app|netlify\.app|pages\.dev|web\.app|firebaseapp\.com|herokuapp\.com|notion\.site|gitbook\.io|medium\.com|substack\.com|blogspot\.com|wordpress\.com)$/;
const SECOND_LEVEL = /^(co|com|org|net|gov|edu|ac)\.[a-z]{2}$/;

const URL_RE = /\b(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,}|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:\/[^\s)"'>]*)?/gi;
const TLD_OK = /\.(com|net|org|io|xyz|co|app|dev|ai|info|biz|online|site|top|link|live|work|jobs|careers|ng|uk|us|me|gg|finance|exchange|network|tech|pro|club|vip|cc|ly|at|id|in|so|to|sh|fi|zone|click|space|store|shop|world|today|support|digital)$/i;

export function extractHosts(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    const host = m[1].toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    if (!isIp && !TLD_OK.test(host) && !host.startsWith("xn--") && !host.includes(".xn--")) continue;
    if (!isIp && /^\d/.test(host.split(".").slice(-1)[0])) continue;
    out.add(host);
  }
  return [...out];
}

export function registrable(host: string): string {
  const p = host.split(".");
  if (p.length <= 2) return host;
  const last2 = p.slice(-2).join(".");
  return SECOND_LEVEL.test(last2) ? p.slice(-3).join(".") : last2;
}

const isOfficial = (host: string, brand: string) => BRANDS[brand].some((d) => host === d || host.endsWith(`.${d}`));
// Undo the usual character swaps: rn->m, vv->w, 0->o, 1->l, 3->e, 5->s, 4->a.
const deglyph = (s: string) => s.replace(/rn/g, "m").replace(/vv/g, "w").replace(/0/g, "o").replace(/[1|]/g, "l").replace(/3/g, "e").replace(/5/g, "s").replace(/4/g, "a");
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function lookalikeOf(host: string): string | null {
  if (HOSTED.test(host)) return null;
  const reg = registrable(host);
  const label = reg.split(".")[0];
  const flat = deglyph(label.replace(/-/g, ""));
  const tokens = label.split(/[-_]/).map(deglyph);
  for (const brand of Object.keys(BRANDS)) {
    if (isOfficial(host, brand)) return null;
  }
  for (const brand of Object.keys(BRANDS)) {
    if (brand.length < 5) {
      // Short names (sui, okx, zoom) only when the brand is a whole token, or the brand plus a bolt-on word.
      if (tokens.some((t) => t === brand || (t.startsWith(brand) && BOLT_ON.test(t.slice(brand.length))))) return brand;
      continue;
    }
    if (flat.includes(brand)) return brand;
    if (flat !== brand && lev(flat, brand) <= (brand.length >= 8 ? 2 : 1)) return brand;
  }
  return null;
}

// IANA's bootstrap file maps each TLD to its registry's RDAP server (rdap.org blocks server-side clients).
let bootstrap: { at: number; map: Map<string, string> } | null = null;
async function rdapBase(tld: string): Promise<string | null> {
  if (!bootstrap || Date.now() - bootstrap.at > 24 * 3600_000) {
    const j: any = await (await fetch("https://data.iana.org/rdap/dns.json", { signal: AbortSignal.timeout(4000) })).json();
    const map = new Map<string, string>();
    for (const [tlds, urls] of j.services as [string[], string[]][]) for (const t of tlds) map.set(t, urls.find((u) => u.startsWith("https")) ?? urls[0]);
    bootstrap = { at: Date.now(), map };
  }
  return bootstrap.map.get(tld.toLowerCase()) ?? null;
}

const ageCache = new Map<string, { days: number | null; at: number }>();
export async function domainAgeDays(domain: string): Promise<number | null> {
  const hit = ageCache.get(domain);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.days;
  let days: number | null = null;
  try {
    const base = await rdapBase(domain.split(".").pop()!);
    if (!base) throw new Error("no RDAP server for this TLD");
    const r = await fetch(`${base.replace(/\/$/, "")}/domain/${encodeURIComponent(domain)}`, { signal: AbortSignal.timeout(4000), headers: { accept: "application/rdap+json" } });
    if (r.ok) {
      const j: any = await r.json();
      const reg = (j.events ?? []).find((e: any) => e.eventAction === "registration")?.eventDate;
      if (reg) days = Math.floor((Date.now() - Date.parse(reg)) / 86_400_000);
    }
  } catch { /* registry unreachable: no age signal rather than a guess */ }
  ageCache.set(domain, { days, at: Date.now() });
  return days;
}

const KNOWN_OLD = new Set(Object.values(BRANDS).flat().map(registrable).concat(["gmail.com", "outlook.com", "yahoo.com", "proton.me", "icloud.com", "x.com", "twitter.com", "youtube.com", "whatsapp.com", "wa.me", "notion.so", "docs.google.com", "forms.gle"]));

// earlierText: every earlier message in the offer. newestText: the message being assessed.
export async function checkLinks(earlierText: string, newestText: string): Promise<{ signals: string[]; links: LinkFinding[] }> {
  const all = extractHosts(`${earlierText}\n${newestText}`);
  const findings: LinkFinding[] = [];
  for (const host of all) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) { findings.push({ host, kind: "raw_ip", detail: "links to a bare IP address instead of a domain" }); continue; }
    if (host.split(".").some((l) => l.startsWith("xn--"))) findings.push({ host, kind: "punycode", detail: "uses look-alike characters from another alphabet (punycode)" });
    if (SHORTENERS.has(host)) { findings.push({ host, kind: "shortener", detail: "a shortened link that hides where it really goes" }); continue; }
    const brand = lookalikeOf(host);
    if (brand) findings.push({ host, kind: "lookalike", detail: `imitates ${brand} (official: ${BRANDS[brand].slice(0, 2).join(", ")})` });
  }
  // Domain age for the sender's own domains (skip big brands, mail providers and shared hosting), at most 4 lookups.
  const toAge = [...new Set(all.filter((h) => !/^\d/.test(h) && !HOSTED.test(h) && !SHORTENERS.has(h)).map(registrable))].filter((d) => !KNOWN_OLD.has(d)).slice(0, 4);
  const ages = await Promise.all(toAge.map(async (d) => [d, await domainAgeDays(d)] as const));
  for (const [d, days] of ages) if (days !== null && days < 30) findings.push({ host: d, kind: "new_domain", detail: `registered ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}` });
  // Memory: a new message that points somewhere the earlier messages never did.
  const before = new Set(extractHosts(earlierText).map(registrable));
  if (before.size) {
    for (const h of extractHosts(newestText)) {
      const r = registrable(h);
      if (!before.has(r) && !KNOWN_OLD.has(r) && !SHORTENERS.has(h) && !/^\d/.test(h)) findings.push({ host: h, kind: "changed_domain", detail: `earlier messages used ${[...before].slice(0, 2).join(", ")}` });
    }
  }
  const has = (k: LinkFinding["kind"]) => findings.some((f) => f.kind === k);
  const signals: string[] = [];
  if (has("lookalike")) signals.push("Link imitates a known brand");
  if (has("new_domain")) signals.push("Link to a domain registered in the last 30 days");
  if (has("punycode") || has("raw_ip")) signals.push("Link disguises its real address");
  if (has("shortener")) signals.push("Shortened link hides the destination");
  if (has("changed_domain")) signals.push("Sends a link on a domain the earlier messages never used");
  return { signals, links: findings };
}
