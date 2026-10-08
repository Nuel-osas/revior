// Dev only: print a session cookie for the synthetic e2e user, to test the UI without Google.
import { createHmac } from "node:crypto";
import { sql } from "../lib/db.js";
const [u] = await sql`select id from users where google_iss = 'test' order by created_at desc limit 1`;
const body = Buffer.from(JSON.stringify({ u: u.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
console.log(`${body}.${createHmac("sha256", process.env.AUTH_SESSION_SECRET!).update(body).digest("base64url")}`);
