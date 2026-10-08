// Apply migrations in order:  pnpm db:migrate
import { readdirSync, readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);
for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
  const text = readFileSync(`migrations/${f}`, "utf8");
  for (const stmt of text.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await sql.query(stmt);
  console.log("applied", f);
}
const t = await sql`select table_name from information_schema.tables where table_schema='public' order by 1`;
console.log(t.map((r) => r.table_name).join(", "));
