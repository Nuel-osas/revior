# Revoir

A chatbot that remembers what a recruiter told you, and catches the moment the story changes.

Fake job offers rarely look fake on day one. "Applicants pay no fees" on Monday becomes "send a refundable $60 deposit today, we'll finish on Telegram" on Thursday. A bot without memory only ever sees Thursday. Revoir recalls Monday from Walrus Memory and puts both quotes side by side.

| | |
|---|---|
| Live | https://revior.xyz |
| Telegram bot | [@revior_security_bot](https://t.me/revior_security_bot): forward a recruiter's messages or screenshots |
| Demo video | https://youtu.be/DXSasOUvmM8 |
| Article | [How I built a chatbot that remembers what recruiters promised you](https://medium.com/@pemmy606/how-i-built-a-chatbot-that-remembers-what-recruiters-promised-you-walrus-memory-deepseek-jev-e8fcc60db0f5) |
| Guide for job seekers | [The Scam Is the Change](https://substack.com/profile/256342516-ruru/note/c-356439779) (Substack) |
| Memory | Walrus Memory (`@mysten-incubation/memwal` 0.1.8) on Sui mainnet |
| Models | DeepSeek V4 Flash (`deepseek-flash`, text and screenshots) and Jev by TypeSafe (claim comparison) |

Built for Walrus Session 8, "Chatbots That Remember".

## What it does

1. Sign in with Google. Revoir creates your own Sui wallet and your own Walrus Memory account (gas is sponsored).
2. Create an offer and paste each message as it arrives, as text or a screenshot.
3. For every message, Revoir extracts the claims (pay, fees, channel, contacts) with exact quotes, recalls the earlier claims for that offer from Walrus Memory, has Jev compare then and now, and has DeepSeek explain what changed, citing both messages.
4. You get a verdict: Likely scam, Suspicious, or No scam signals found.
5. Paste a GitHub link a "recruiter" wants you to run and Revoir scans it without running it: install hooks, VS Code autorun tasks, `curl | bash`, code that reads wallet or SSH keys, exfiltration webhooks.
6. Every link and email domain is checked without opening it: lookalikes of known brands (`binance-careers.top`, `rnetamask.io`, `sui-foundation.com`), domains registered in the last 30 days (registry RDAP data), shortened links, punycode and raw IP addresses, and a link on a domain the earlier messages never used.
7. When the offer ends, report how it went. Phone numbers, emails, domains, handles and wallets are hashed into a shared memory, so the next person who gets a message from the same number is warned.

## How Walrus Memory is used

| What | Where | When |
|---|---|---|
| Each message plus its extracted claims | The user's own MemWal account, namespace per offer | Written after every message, confirmed only when the job is `done` |
| Repo scan results | Same offer namespace | After each scan |
| Open checks ("verify the company on its own domain") | The user's general namespace | When the assessment suggests one |
| Anonymised scam tactics from reported outcomes | The app's account, shared community namespace | When a user reports an outcome |

Recall happens on every new message, before the model sees anything: the earlier claims for that offer are recalled and are what Jev and DeepSeek compare against. Without the recall there is nothing to compare, so the "Then" side is empty.

Each message in the app links to its blob on Walruscan ("✓ remembered on Walrus").

## Run it yourself

You need Node 22+, pnpm, a Postgres database (a free [Neon](https://neon.tech) project works), a Google OAuth client, a DeepSeek API key, a TypeSafe (Jev) API key, and two Sui mainnet wallets with a little SUI.

```bash
git clone https://github.com/Nuel-osas/revior
cd revior
pnpm install
cp .env.example .env
```

**1. Fill `.env`.** Every variable is explained in [.env.example](.env.example). Quick notes:
- Google: create an OAuth client of type "Web application" and add `http://localhost:3001/auth/google/callback` as an authorized redirect URI.
- Secrets: `openssl rand -base64 32` for `AUTH_SESSION_SECRET`, `CONTENT_ENCRYPTION_KEY_BASE64` and `NAMESPACE_HMAC_KEY_BASE64` (three different values).

**2. Create the database tables.**
```bash
pnpm db:migrate
```

**3. Create the app's Walrus Memory account (one time).** Put an owner wallet with about 0.05 SUI in `.env.owner` (this file is never deployed):
```
OWNER_ADDRESS=0x...
OWNER_SUI_PRIVATE_KEY=suiprivkey...
```
Then:
```bash
pnpm provision        # creates the MemWal account, writes MEMWAL_ACCOUNT_ID and MEMWAL_DELEGATE_KEY into .env
pnpm smoke            # remember + recall round trip on mainnet
```
Alternatively, create an account and delegate key at https://memory.walrus.xyz/dashboard and paste them into `.env`.

**4. Fund the gas sponsor.** Set `SPONSOR_ADDRESS` and `SPONSOR_SUI_PRIVATE_KEY` in `.env` (a separate wallet from the owner), then:
```bash
pnpm fund-sponsor 0.05   # moves 0.05 SUI from the owner to the sponsor, enough for about 10 users
```

**5. Run it.**
```bash
pnpm dev                 # http://localhost:3001
```

**6. Check it works end to end.**
```bash
pnpm e2e                 # synthetic test user: provisions a wallet, sends two messages, waits for Walrus, prints the changes found
pnpm evidence            # per real user: memories stored on Walrus, wallet address, blob IDs
```

Test users are created with `google_iss = 'test'` and are excluded from stats and from everything the platform learns.

### Telegram bot (optional)

Create a bot with @BotFather, put `TELEGRAM_BOT_TOKEN` in `.env` and in Vercel, deploy, then run `pnpm telegram:webhook https://your-domain`. Users forward a recruiter's messages (or screenshots) to the bot and get the same second look as on the web: the same pipeline, the same verdict, and their own wallet and Walrus Memory account. The webhook is verified with a secret derived from the bot token.

### Deploy

The app is a single Vercel function (`api/router.ts`) plus static files in `public/`, with routes in `vercel.json`. Add the same variables from `.env` to the Vercel project (never `.env.owner`), set `PUBLIC_BASE_URL` and `GOOGLE_REDIRECT_URI` to your domain, and deploy with `vercel --prod`.

## Layout

| Path | What it is |
|---|---|
| `api/router.ts` | All HTTP routes |
| `lib/pipeline.ts` | Message flow: extract, archive, recall, compare, explain, verdict |
| `lib/providers.ts` | DeepSeek, Jev and Walrus Memory calls (with 429 retry) |
| `lib/wallet.ts` | Per-user Sui wallet and MemWal account, sponsored transactions |
| `lib/community.ts` | Shared memory: hashed indicators, anonymised patterns |
| `lib/verdict.ts`, `lib/learning.ts` | Scam verdict, and the model that learns from reported outcomes |
| `lib/repo-scan.ts` | GitHub repo scan (downloads the tarball, never executes it) |
| `lib/telegram.ts` | Telegram bot: forward messages, screenshots, /scan, /offers, /done |
| `lib/links.ts` | Link check: lookalike brands, domain age via RDAP, shorteners, punycode, changed domains |
| `public/index.html` | The whole web app |
| `migrations/` | Postgres schema |
| `scripts/` | Provisioning, tests, evidence, recovery |
| `docs/` | The original product specification ([docs/SPEC.md](docs/SPEC.md)) |

## Things that broke, and the fixes

- **DeepSeek thinking mode returned empty answers.** With thinking on (the default), JSON responses came back empty with `finish_reason: length`. Revoir calls DeepSeek with thinking disabled.
- **Walrus Memory 429s.** The relayer allows 60 weighted requests per minute per delegate key. One shared key for all users hit that, and some writes failed. Fixed with per-user delegate keys, a retry loop that honours `retry_after_seconds`, and `pnpm retry-failed` to re-archive anything that failed.
- **Writes are asynchronous.** `remember` returns a job; Revoir polls until it is `done` before marking a message as remembered.

## Security notes

- Message content is AES-256-GCM encrypted in Postgres; MemWal namespaces use an HMAC of the user ID, so they don't reveal who the user is.
- Users' wallet keys are encrypted at rest and can be exported from "My wallet" in the app.
- The sponsor only signs gas for two fixed Move calls built by the server, never a transaction sent by a client.
- The owner key stays in `.env.owner` and is never deployed.
