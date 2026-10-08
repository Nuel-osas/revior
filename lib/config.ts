// Runtime configuration. Fails loudly on missing secrets instead of half-working.
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};
export const cfg = {
  get db() { return need("DATABASE_URL"); },
  get baseUrl() { return need("PUBLIC_BASE_URL").replace(/\/$/, ""); },
  get google() { return { id: need("GOOGLE_CLIENT_ID"), secret: need("GOOGLE_CLIENT_SECRET"), redirect: need("GOOGLE_REDIRECT_URI") }; },
  get sessionSecret() { return need("AUTH_SESSION_SECRET"); },
  get deepseek() { return { key: need("DEEPSEEK_API_KEY"), base: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com", model: process.env.DEEPSEEK_MODEL ?? "deepseek-flash" }; },
  get jev() { return { key: need("TYPESAFE_API_KEY"), base: process.env.JEV_BASE_URL ?? "https://api.typesafe.ai", model: process.env.JEV_MODEL ?? "jev-latest" }; },
  get memwal() { return { url: need("MEMWAL_SERVER_URL"), account: need("MEMWAL_ACCOUNT_ID"), key: need("MEMWAL_DELEGATE_KEY") }; },
  get contentKey() { return Buffer.from(need("CONTENT_ENCRYPTION_KEY_BASE64"), "base64"); },
  get nsKey() { return Buffer.from(need("NAMESPACE_HMAC_KEY_BASE64"), "base64"); },
  maxSource: Number(process.env.MAX_SOURCE_CODEPOINTS ?? 8000),
  dailyLimit: Number(process.env.USER_DAILY_ANALYSIS_LIMIT ?? 20),
  maxActive: Number(process.env.MAX_ACTIVE_CASES_PER_USER ?? 5),
  consentVersion: 1,
};
