// AES-256-GCM for content at rest in Postgres; HMAC for MemWal namespace derivation.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { cfg } from "./config.js";

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cfg.contentKey, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${ct.toString("base64url")}`;
}

export function open<T = any>(token: string): T {
  const [v, iv, tag, ct] = token.split(".");
  if (v !== "v1") throw new Error("unknown ciphertext version");
  const d = createDecipheriv("aes-256-gcm", cfg.contentKey, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8"));
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Exact MemWal namespaces, derived server-side only: rv1_<user-hmac>_<opportunity-uuid> and rv1_<user-hmac>_general.
const userTag = (userId: string) => createHmac("sha256", cfg.nsKey).update(`user:${userId}`).digest("hex").slice(0, 16);
export const opportunityNamespace = (userId: string, oppId: string) => `rv1_${userTag(userId)}_${oppId.replace(/-/g, "")}`;
export const generalNamespace = (userId: string) => `rv1_${userTag(userId)}_general`;
