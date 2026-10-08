// Google sign-in (OpenID Connect code flow, basic scopes only) + stateless signed session cookie.
// Writes require a same-origin request carrying the X-Revior header (CSRF): browsers cannot add it cross-site without CORS.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cfg } from "./config.js";
import { sql } from "./db.js";
import { seal } from "./crypto.js";

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const COOKIE = "rv_session";
const TTL = 14 * 24 * 3600;
const secure = () => cfg.baseUrl.startsWith("https://");
const mac = (s: string) => createHmac("sha256", cfg.sessionSecret).update(s).digest("base64url");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function cookies(req: VercelRequest) {
  return Object.fromEntries(String(req.headers.cookie ?? "").split(/;\s*/).filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)));
}
const setCookie = (res: VercelResponse, name: string, value: string, maxAge: number) =>
  res.appendHeader("Set-Cookie", `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure() ? "; Secure" : ""}`);

export function startGoogle(res: VercelResponse) {
  const state = randomBytes(16).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  setCookie(res, "rv_oauth", `${state}.${nonce}`, 600);
  const g = cfg.google;
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({ client_id: g.id, redirect_uri: g.redirect, response_type: "code", scope: "openid email profile", state, nonce, prompt: "select_account" }).toString();
  res.redirect(302, u.toString());
}

export async function finishGoogle(req: VercelRequest, res: VercelResponse) {
  const [state, nonce] = String(cookies(req).rv_oauth ?? "").split(".");
  if (!state || req.query.state !== state) throw new Error("sign-in state mismatch, please try again");
  const g = cfg.google;
  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: String(req.query.code ?? ""), client_id: g.id, client_secret: g.secret, redirect_uri: g.redirect, grant_type: "authorization_code" }),
  });
  const t: any = await tok.json();
  if (!tok.ok || !t.id_token) throw new Error("Google sign-in failed");
  const { payload } = await jwtVerify(t.id_token, JWKS, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: g.id });
  if (payload.nonce !== nonce) throw new Error("sign-in nonce mismatch");
  const profile = { name: payload.name ?? "", email: payload.email ?? "", picture: payload.picture ?? "" };
  // Identity = issuer + subject, never email.
  const [u] = await sql`insert into users (google_iss, google_sub, profile_ct) values (${String(payload.iss)}, ${String(payload.sub)}, ${seal(profile)})
                        on conflict (google_iss, google_sub) do update set profile_ct = excluded.profile_ct returning id`;
  setCookie(res, "rv_oauth", "", 0);
  issueSession(res, u.id);
  res.redirect(302, "/");
}

export function issueSession(res: VercelResponse, userId: string) {
  const body = Buffer.from(JSON.stringify({ u: userId, exp: Math.floor(Date.now() / 1000) + TTL })).toString("base64url");
  setCookie(res, COOKIE, `${body}.${mac(body)}`, TTL);
}
export const signOut = (res: VercelResponse) => setCookie(res, COOKIE, "", 0);

export function requireUser(req: VercelRequest): string {
  const [body, sig] = String(cookies(req)[COOKIE] ?? "").split(".");
  if (!body || !sig || !same(sig, mac(body))) throw Object.assign(new Error("not signed in"), { status: 401 });
  const s = JSON.parse(Buffer.from(body, "base64url").toString());
  if (s.exp < Date.now() / 1000) throw Object.assign(new Error("session expired"), { status: 401 });
  if (req.method !== "GET") {
    const origin = String(req.headers.origin ?? "");
    if (req.headers["x-revior"] !== "1" || (origin && origin !== cfg.baseUrl)) throw Object.assign(new Error("blocked request"), { status: 403 });
  }
  return s.u as string;
}
