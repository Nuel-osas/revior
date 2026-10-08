// Mainnet test: provision a Zentos-style wallet + MemWal account for the newest synthetic test user, then use it.
import { sql } from "../lib/db.js";
import { memwalFor, provisionWallet } from "../lib/wallet.js";
const [u] = await sql`select id from users where google_iss = 'test' order by created_at desc limit 1`;
let t = Date.now();
const w = await provisionWallet(u.id);
console.log(`provisioned in ${((Date.now() - t) / 1000).toFixed(1)}s`, JSON.stringify(w));
const mw = (await memwalFor(u.id))!;
const who: any = await (mw as any).signedRequest("GET", "/api/whoami", {}, [200]);
console.log("relayer whoami owner:", who.owner, who.owner === w!.address ? "(= user's custodial wallet)" : "(MISMATCH)");
t = Date.now();
const r = await mw.rememberAndWait("SYNTHETIC: custodial wallet smoke test, applicants pay no fees.", "rv1_wallet_smoke", { timeoutMs: 180_000 });
console.log(`remember done ${((Date.now() - t) / 1000).toFixed(1)}s blob ${r.blob_id}`);
