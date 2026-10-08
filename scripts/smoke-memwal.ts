// Milestone 0 smoke test: delegate key -> mainnet relayer -> remember -> done -> recall. Synthetic text only.
import { readFileSync } from "node:fs";
import { MemWal } from "@mysten-incubation/memwal";
const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const ns = "rv_smoketest";
const mw = MemWal.create({ key: env.MEMWAL_DELEGATE_KEY, accountId: env.MEMWAL_ACCOUNT_ID, serverUrl: env.MEMWAL_SERVER_URL, namespace: ns });
console.log("health", (await mw.health()).status);
const who: any = await (mw as any).signedRequest("GET", "/api/whoami", {}, [200]);
console.log("whoami owner", who.owner);
let t = Date.now();
const r = await mw.rememberAndWait("SYNTHETIC SMOKE TEST: the example offer says applicants pay no fees.", ns, { timeoutMs: 180_000 });
console.log(`remember done in ${((Date.now() - t) / 1000).toFixed(1)}s blob ${r.blob_id}`);
t = Date.now();
const rec = await mw.recall({ query: "is there an applicant fee?", limit: 3, namespace: ns });
console.log(`recall ${((Date.now() - t) / 1000).toFixed(1)}s:`, rec.results.map((x) => `${x.distance.toFixed(2)} ${x.text}`));
