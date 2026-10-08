# Revoir

*Revoir* means "to see again". Live: https://revior.xyz · Walrus Memory on **Sui Mainnet** · DeepSeek Flash + Jev

## Status (8 October 2026)

The hackathon cut of the specification below is implemented and deployed. It covers the spec's first implementation milestone end to end: Google sign-in → create an opportunity → paste a message → DeepSeek extracts claims with exact quotes → the event is archived to MemWal on Mainnet and confirmed only on `done` → a later message recalls earlier evidence from MemWal, Jev classifies each prior/current claim pair, DeepSeek explains with citations → details, timeline and private general memory update → corrections append and supersede without editing history.

| Implemented | Deferred from the spec (still the plan) |
|---|---|
| **Zentos-style custodial wallet per Google user**: Ed25519 key minted on consent, AES-256-GCM in Postgres, same Google account = same Sui address; the wallet owns the user's **own MemWal account** (sponsored `create_account` + `add_delegate_key`, user pays 0 SUI); export endpoint as the self-custody escape hatch |
| Google OIDC (server-verified ID token), signed HttpOnly session, CSRF header + origin check | Separate durable worker with leases/fencing (archive polling runs in `waitUntil`) |
| AES-256-GCM encrypted content columns in Postgres (Neon); HMAC-derived MemWal namespaces | Owner-authorized remote deletion tool (forget excludes immediately; Walrus removal pending) |
| DeepSeek extraction with exact-substring quote validation; Jev `choice` per claim pair |
| **Scam verdict on every message**: Likely scam / Suspicious / No scam signals found, from Jev's `noul` probability over the remembered offer, deterministic red-flag signals, and community matches |
| **Well of experience (memory across users)**: users report how an offer ended; phones, emails, domains, handles, wallets and repos become HMAC-hashed indicators with one vote per user ("known" needs 2+ people), and an anonymised tactics pattern is archived to a shared Walrus Memory namespace and recalled by meaning for everyone's new messages |
| **GitHub repo scan** for "clone our repo and run npm install" take-home tests: downloads the public tarball (never executes it), deterministic rules for install hooks, VS Code `folderOpen` tasks, `curl \| bash`, eval/obfuscation, credential and wallet paths, env-var and Discord-webhook exfiltration, then DeepSeek reviews manifests, entry points and flagged files. Findings must quote evidence that exists in the file, or they are dropped. Scans are stored in the offer's Walrus memory |
| **Screenshots**: paste, drop or attach a WhatsApp/Telegram/email screenshot; DeepSeek V4.1 Flash transcribes it verbatim, the user reviews and edits the text, then it runs the same pipeline. Claims inside one message are also compared, so "no fee" followed by "pay the $45 fee" in one screenshot is caught | Retention sweeps, backups, preference confirmation in general memory |
| MemWal Mainnet archive + recall, recalled events validated against the opportunity | Verification-report UI beyond corrections |
| Cited assessment (changes, unknown, next check), conflicting terms kept visible | |

Run locally: `pnpm install`, copy `.env.example` to `.env` and fill it, `pnpm db:migrate`, `pnpm dev` (port 3000, or `PORT=3001`). One-time Mainnet account: `scripts/provision-mainnet.ts` with an owner key in `.env.owner` (never deployed). End-to-end test: `pnpm tsx --env-file=.env scripts/e2e.ts`.

Gas: a separate `revoir-sponsor` wallet only co-signs the two account-setup transactions the server builds (fixed Move targets, never a client-supplied transaction). Measured cost per new user on Mainnet: about 0.0048 SUI (0.0040 create_account + 0.0008 add_delegate_key).

Built and observed during the build:
- DeepSeek V4.1 Flash thinks by default and spent the whole 2,000-token budget on hidden reasoning, returning empty content (`finish_reason: length`). Extraction and explanation run with thinking disabled.
- Jev on "Applicants pay no fees" vs "send a refundable $60 onboarding deposit": contradiction 0.90 to 0.95. On "onboarding only through our careers portal" vs "HR partner will finish onboarding on Telegram": contradiction 0.98.

---

# SecondLook (original specification)

**A web assistant that remembers how a job or collaboration offer changes—and shows you what to verify before you take the next step.**

**Current direction:** sign in with Google → create an opportunity → chat and add updates → maintain its database record and sourced history → update the user's private general memory. This revision replaces the original Telegram-first entry point. Google sign-in identifies the account; Gmail inbox access is outside the first release. See the [complete account-to-memory flow](docs/12-account-and-opportunity-flow.md).

SecondLook keeps a sourced history of an offer across conversations. When a new message changes an earlier condition, introduces a new contact, or asks for something the sender previously ruled out, it puts the relevant messages beside each other. It helps the user make an informed decision without pretending to certify a person or opportunity.

This directory is the build specification, prepared on **8 October 2026**. It contains product decisions, architecture, contracts, synthetic evaluation scenarios, and a delivery plan. ~~There is no SecondLook application implementation or deployment here yet.~~ (Superseded the same day: see Status above.) Provider integrations described as verified have been checked against documentation and the installed MemWal SDK; live credentials and Mainnet behavior still need integration tests.

## The product in one table

| Project | What it remembers | Why that memory matters |
|---|---|---|
| SecondLook: a second opinion on an evolving job or collaboration offer | Dated messages, claimed identities, agreed conditions, requested actions, verification attempts, user corrections, and unresolved questions | A message that seems reasonable alone can contradict an earlier promise. The bot can show the change, cite both messages, and suggest an independent check. |

## The defining interaction

1. A developer signs in with Google, creates an opportunity, and pastes: “There are no applicant fees. Onboarding happens only through our careers portal.”
2. SecondLook saves the statement **as a claim**, with the message as its source.
3. Days later, the developer returns: “They now want an onboarding deposit.”
4. SecondLook retrieves the previous condition and responds: “This changes the earlier no-fee condition. Here are both messages. Confirm the request through a company contact you found independently before paying.”
5. The opportunity's details and unresolved checks update in the workspace. Relevant information enters the user's private general memory with its source attached.
6. The developer can correct a mistaken extraction, add a verification result, or remove the opportunity and derived memories.

All examples in these documents are synthetic. They are product scenarios, not evidence that anyone used the bot or that a real company acted dishonestly.

## Decisions locked for the first release

| Area | Decision |
|---|---|
| First user | Developers evaluating remote job or collaboration offers |
| Interface | Web workspace with Google sign-in, opportunity cards, and a chat inside each opportunity |
| Unit of memory | Opportunity history plus a separately scoped private general memory for each user |
| Conversation and extraction | DeepSeek Flash; configurable model identifier |
| Structured comparison | Jev, through the official Typesafe API |
| Persistent archive and semantic recall | MemWal on Walrus Mainnet for the submission |
| Backend | TypeScript on Node.js 22, HTTP service plus durable worker |
| Operational storage | PostgreSQL for identity, queues, references, deletion exclusions, and encrypted case projections |
| Product output | Changes, evidence, unknowns, and one useful verification step |
| Product boundary | No safety certification, fraud probability, public accusation, or autonomous contact/payment |

The requested DeepSeek V4 Flash alias currently maps to V4.1 Flash. The implementation default is `deepseek-flash`; retain the requested and returned model names in evaluation records. This is provider behavior, not an application model upgrade claim. [DeepSeek model documentation](https://api-docs.deepseek.com/quick_start/pricing/)

## Read in this order

| Document | What it resolves |
|---|---|
| [Product specification](docs/01-product.md) | Who this serves, why memory matters, scope, and success |
| [Web experience](docs/02-conversations.md) | Sign-in, opportunity screens, chat examples, and failure messages |
| [Architecture](docs/03-architecture.md) | Services, sequence diagrams, trust boundaries, and failure recovery |
| [Memory design](docs/04-memory.md) | Evidence, claims, corrections, retrieval, retention, and deletion |
| [Data and contracts](docs/05-data-and-contracts.md) | Database plan, application interfaces, schemas, and invariants |
| [Provider integrations](docs/06-integrations.md) | Verified API surfaces, configuration, and integration gates |
| [Security and privacy](docs/07-security-and-privacy.md) | Threats, tenant isolation, consent, and honest privacy promises |
| [Evaluation](docs/08-evaluation.md) | How to prove memory improves decisions without hiding failures |
| [Build plan](docs/09-build-plan.md) | Ordered implementation tasks and acceptance criteria |
| [Operations and submission](docs/10-operations-and-submission.md) | Deployment, incidents, real usage, and hackathon evidence |
| [Decisions and sources](docs/11-decisions-and-sources.md) | Tradeoffs, unresolved questions, and primary references |
| [Account and opportunity flow](docs/12-account-and-opportunity-flow.md) | Google identity, the opportunity details column, and updates to general memory |

Machine-readable artifacts: [opportunity memory schema](contracts/memory-event.schema.json), [general-memory schema](contracts/general-memory-event.schema.json), [assessment schema](contracts/assessment.schema.json), [example opportunity memory](fixtures/example-memory.json), [example general memory](fixtures/example-general-memory.json), [example assessment](fixtures/example-assessment.json), [evaluation scenarios](fixtures/evaluation-cases.json), and [configuration template](.env.example).

## First implementation milestone

Build one complete interaction: sign in with Google → create an opportunity → save a sourced no-fee claim → confirm the MemWal job → update the opportunity record → restart the worker → submit a later fee request → retrieve earlier evidence → return a cited comparison → update relevant general memory. Use the **same opportunity for a legitimate correction** and verify both memory scopes update. This is the core product proof before additional features.

The hackathon dates conflict: the official rules give **9 October, 14:00 UTC / 15:00 Lagos**, while the DeepSurge listing gives **16:00 UTC / 17:00 Lagos**. Plan against the earlier cutoff unless organizers clarify. Both real usage and elapsed usage time matter; a working demo built today cannot truthfully be described as having run for several days. See the [submission checklist](docs/10-operations-and-submission.md#submission-evidence).

Existing projects in the parent directory are separate work. Their users, memories, and deployments are not SecondLook evidence.
