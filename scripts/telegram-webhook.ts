// Point the Telegram bot at the deployed webhook and set its command menu:  pnpm telegram:webhook [https://revior.xyz]
import { webhookSecret } from "../lib/telegram.js";
const base = (process.argv[2] ?? process.env.PUBLIC_BASE_URL ?? "https://revior.xyz").replace(/\/$/, "");
const call = async (method: string, payload: object) => {
  const r: any = await (await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })).json();
  console.log(method, r.ok ? "ok" : r.description);
  return r.result;
};
await call("setWebhook", { url: `${base}/api/telegram`, secret_token: webhookSecret(), allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
await call("setMyCommands", { commands: [
  { command: "new", description: "Start a new offer: /new Name" },
  { command: "offers", description: "Switch between your offers" },
  { command: "scan", description: "Scan a GitHub repo without running it" },
  { command: "done", description: "Report how the offer ended" },
  { command: "wallet", description: "Your Sui wallet and memory account" },
  { command: "help", description: "How Revoir works" },
] });
await call("setMyDescription", { description: "Forward a recruiter's messages here. Revoir remembers every promise on Walrus Memory and tells you when the story changes, with a scam verdict. Also checks links and GitHub repos without opening them." });
await call("setMyShortDescription", { short_description: "Catches fake job offers when the story changes. Memory on Walrus." });
console.log(await call("getWebhookInfo", {}));
