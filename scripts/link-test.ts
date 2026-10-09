// Link check on synthetic messages: lookalikes, shorteners, punycode, domain age, changed domain, and false positives.
import { checkLinks, lookalikeOf } from "../lib/links.js";
const cases: [string, string | null][] = [
  ["binance-careers.top", "binance"], ["rnetamask.io", "metamask"], ["sui-foundation.com", "sui"], ["suifoundation-grants.xyz", "sui"],
  ["metamask.io", null], ["app.uniswap.org", null], ["suite.com", null], ["suitable.io", null], ["zoomcare.com", null],
  ["coinbase.com", null], ["c0inbase-hr.com", "coinbase"], ["walrus-hiring.xyz", "walrus"], ["docs.wal.app", null], ["okx-careers.net", "okx"],
  ["linkedln.com", "linkedin"], ["github.com", null], ["someone.github.io", null], ["northstarlabs.io", null], ["phantorn.app", "phantom"],
];
let bad = 0;
for (const [h, want] of cases) { const got = lookalikeOf(h); const ok = got === want; if (!ok) bad++; console.log(ok ? "ok  " : "FAIL", h.padEnd(28), "->", got); }
console.log(bad ? `${bad} lookalike case(s) failed` : "all lookalike cases pass");
const r = await checkLinks(
  "Hi, we're Northstar Labs. Apply at https://careers.google.com/jobs and email hr@google.com.",
  "Quick update: finish onboarding at https://bit.ly/3xYz and verify your wallet at https://xn--metmask-4ya.io or http://203.0.113.7/verify. Our HR portal is now https://binance-careers.top/start",
);
console.log(JSON.stringify(r, null, 1));
const { domainAgeDays } = await import("../lib/links.js");
for (const d of ["revior.xyz", "github.com", "no-such-domain-zz91.top", "suiscan.xyz", "binance.com"]) console.log("age", d, await domainAgeDays(d));
