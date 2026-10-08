# Build plan

## Build order

Implement a complete sourced comparison before adding extra channels or polishing a dashboard. The required stack is DeepSeek Flash, Jev, and MemWal; the first usable surface is a web workspace with Google sign-in.

No package scripts or application commands described below exist yet. Create them during implementation, pin dependencies in a lockfile, and replace proposed instructions with verified commands once the application runs.

## Milestone 0 — integration proof

**Deliverable:** a private developer smoke test using synthetic text.

- Create an isolated `secondlook` Node.js 22/TypeScript project with configuration validation.
- Add the pinned MemWal SDK, a PostgreSQL client, a runtime JSON validator, and a small HTTP framework. Use native `fetch` for DeepSeek/Jev unless a library materially simplifies a tested need.
- Obtain a dedicated Mainnet account/delegate, Jev key, DeepSeek key, and Google OAuth client configuration through their official services. Keep secrets out of source control.
- Test DeepSeek extraction, Jev classification, MemWal `remember → done → recall`, and owner deletion on a synthetic case.
- Record SDK/relayer compatibility, returned model IDs, and actual network evidence.

**Exit:** all four provider connections work, or a concrete capability mismatch is recorded before application code assumes it. Health-only checks do not pass this milestone. Account creation/funding must follow the user's actual authorization; documenting the requirement does not authorize spending.

## Milestone 1 — reliable intake

**Deliverable:** Google sign-in, local sessions, consent, opportunity list/create, chat/detail workspace, and durable input jobs.

- Implement database migrations and tenant/case ownership constraints.
- Add supported Google authentication, CSRF/origin protection, idempotent requests, input limits, and encrypted temporary intake.
- Build worker leases/fencing, per-case sequencing, and structured redacted logs.
- Implement explicit case selection and persisted opportunity-bound progress states.

**Exit:** duplicate/forged requests and cross-user resource access pass tests; a restarted worker resumes a queued job; no model call occurs before consent and case authorization.

## Milestone 2 — sourced memory

**Deliverable:** a source event saved through MemWal with an inspectable citation.

- Extract claims with DeepSeek; validate exact quotes and schemas.
- Freeze event payload and stable idempotency key before submission.
- Persist provider job ID, poll resumably, and project only confirmed events.
- Add timeline and private source views from the encrypted projection.
- Capture recall provenance and reject mismatched/malformed envelopes.

**Exit:** the earlier message survives a restart; the interface never says “saved” before `done`; every projection points to a confirmed blob and hash.

## Milestone 3 — the defining comparison

**Deliverable:** a later request produces an evidence-backed explanation of what changed.

- Combine relevant MemWal recall with current active claims and corrections.
- Call Jev with bounded prior/current claim pairs.
- Validate comparisons; generate assessment JSON through DeepSeek.
- Enforce citations and permitted dispositions before rendering.
- Show one practical next check and outstanding uncertainty.

**Exit:** the no-fee/deposit case cites both sources after restart; the current-message-only baseline cannot cite the hidden earlier promise; provider failure gives an honest limited response.

## Milestone 4 — revision and removal

**Deliverable:** correction, verification, close/forget, and My memory work end to end.

- Implement immutable corrections and report-attributed verification records.
- Recompute active claims without overwriting original sources.
- Add private general-memory items with source dependencies, explicit preference confirmation, and per-user revision control.
- Add immediate case exclusion, dependent-item invalidation, and pending-write reconciliation.
- Implement the restricted owner deletion tool against an exact manifest.
- Add retention sweeps and backup/exclusion recovery behavior.

**Exit:** corrected interpretations stop driving advice; same-channel reassurance does not become independent verification; forgotten cases never resurface through either scope; remote deletion status is accurate.

## Milestone 5 — evaluation and deployment

**Deliverable:** a deployed pilot with documented strengths and limitations.

- Run the scenario pack, failure tests, and model comparisons.
- Fix grounding, isolation, correction, and persistence-honesty failures before inviting users.
- Deploy HTTP service, worker, and PostgreSQL; configure exact OAuth callback URLs and test production sign-in after readiness passes.
- Test restart recovery, log redaction, quotas, and global spend stop.
- Run a consenting pilot and collect actual usage evidence over elapsed time.
- Publish setup instructions and a truthful submission article if eligibility can be met.

**Exit:** release gates pass and the actual deployment is reproducible. Submission readiness also depends on real usage and the organizer's requirements; software completeness alone does not satisfy it.

## Priorities if time is short

Keep: text intake, one reliable comparison, MemWal confirmation/recall, citations, corrections, isolation, consent, and forget exclusion. Reduce: number of comparison categories, history styling, automatic reminders, and optional analytics. Defer: advanced dashboard analytics, OCR, Gmail import, Telegram integration, external searches, automatic entity merging, and user-owned wallets.

Do not save time by manufacturing usage, hiding incomplete writes, bypassing tenant checks, or claiming deletion that was not performed. A narrower working product is a better demonstration of the actual idea.

## Build handoff checklist

The first coding session should start with [the contracts](../contracts/memory-event.schema.json), [provider gates](06-integrations.md#integration-gates-before-real-data), and synthetic fixtures. Use a dedicated test case, not an existing user's private conversation.

Proposed package commands to implement:

| Command | Intended behavior |
|---|---|
| `npm run dev:http` | Local authenticated API and web frontend |
| `npm run dev:worker` | Local durable worker |
| `npm run db:migrate` | Apply reviewed local migrations |
| `npm run typecheck` | TypeScript contract checks |
| `npm test` | Domain, authorization, workflow, and fixture tests |
| `npm run test:integration` | Explicitly configured provider integration checks |
| `npm run eval` | Synthetic model comparison runs with recorded costs |
| `npm run build` | Frontend build and production server compilation |
| `npm run start:http` / `start:worker` | Production process roles |

Integration/evaluation commands must require an explicit environment selection and synthetic test namespace. They must not automatically delete production data or run paid calls during ordinary unit tests.
