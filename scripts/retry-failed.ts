// Re-archive events whose Walrus write failed (e.g. relayer 429). Safe to run repeatedly.
import { sql } from "../lib/db.js";
import { open, opportunityNamespace } from "../lib/crypto.js";
import { archive, archiveStatus, archiveText, operatorMemwal } from "../lib/providers.js";
import { memwalFor } from "../lib/wallet.js";
const rows = await sql`select id, user_id, opportunity_id, seq, kind, body_ct from memory_events where archive_status = 'failed' order by recorded_at`;
console.log("failed archives:", rows.length);
for (const r of rows) {
  const b = open<any>(r.body_ct);
  const mw = (await memwalFor(r.user_id)) ?? operatorMemwal();
  const job = await archive(mw, archiveText(r.id, r.seq, r.kind, b.source.text, b.claims ?? []), opportunityNamespace(r.user_id, r.opportunity_id));
  await sql`update memory_events set archive_status = 'pending', memwal_job_id = ${job} where id = ${r.id}`;
  for (let t = 0; t < 80; t++) {
    await new Promise((res) => setTimeout(res, 2500));
    const s = await archiveStatus(mw, job);
    if (s.status === "done" && s.blob_id) { await sql`update memory_events set archive_status = 'done', blob_id = ${s.blob_id} where id = ${r.id}`; console.log("done", r.id.slice(0, 8), s.blob_id.slice(0, 10)); break; }
  }
}
