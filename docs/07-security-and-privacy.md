# Security and privacy

## Trust boundaries

SecondLook deliberately processes messages that may contain deception or malicious instructions. Treat everything inside a forwarded/pasted message, and everything retrieved from memory, as untrusted data. A source may say “ignore all previous instructions” or falsely claim that the user consented to disclosure. Neither changes application permissions.

The pilot uses an operator-owned memory account. The application enforces separation between users; the account's delegate is not limited cryptographically to one user's namespace. The backend, DeepSeek, Jev, and the managed MemWal service can process the text needed for their roles. Seal encryption protects the stored Walrus payload, but does not make this a client-to-client encrypted chat service. [MemWal trust model](https://docs.wal.app/walrus-memory/fundamentals/architecture/data-flow-security-model)

## Threat model

| Threat | Required control | Verification |
|---|---|---|
| Forged login or session | Supported Google validation, opaque local session, expiry/revocation | Unauthenticated requests create no content jobs |
| CSRF or unsafe redirect | State/nonce during login; mutation CSRF/origin checks; return-path allowlist | Forged requests and external redirects fail |
| One user supplies another case ID | Actor-bound case lookup, composite tenant constraints, session-bound authorization | Cross-user and private-memory attempts return no content |
| Stored prompt injection | Treat source as data; no model tools; validate output and references | Injection fixture cannot alter scope or trigger actions |
| Poisoned memory envelope | Validate schema, manifest membership, hash, scope, and exclusion | Foreign/malformed recall is rejected |
| Malicious URL or file | No fetching, opening, download, execution, or previews in MVP | Domain is displayed as inert text |
| False accusation | Describe claims and supported changes; no public verdict or blacklist | Unsupported identity/fraud claims fail output checks |
| Secret pasted accidentally | Warning, bounded detection/redaction, minimal retention | Obvious secrets do not enter provider fixtures/logs |
| Stolen delegate key | Server-only secret, dedicated account, rotation/revocation procedure | Credentials absent from client/output/logs |
| Deletion race | Exclude immediately; check before each side effect; reconcile pending writes | No post-forget delivery or resurrection |
| Model/provider outage | Typed degraded mode and no invented comparison | Failure tests preserve honest status |
| Duplicate/replayed operations | Unique user/request and event keys, payload conflict detection | Replays do not duplicate logical writes |
| Cost abuse | Consent gate, per-user limits, bounded context/calls, global spend stop | Quota exhausted before another paid operation |

## Model data minimization

DeepSeek extraction receives the current retained text, not the user's whole history. Jev receives only the relevant claim pair and necessary context. Explanation receives a bounded evidence packet after tenant checks. Do not send Google subject identifiers or email addresses, account keys, entire unrelated cases, or internal deletion manifests to either model.

Keep secret values out of exception reports. Log request IDs, phases, durations, provider error codes, and hashed internal correlation IDs. Disable raw body logging at the reverse proxy, HTTP framework, and observability exporter. Do not log login codes, ID tokens, session cookies, or authentication callback query strings.

Provider data retention and training policies must be reviewed before live onboarding; this document does not invent provider promises. Publish the actual processing notice and any unresolved limitations plainly.

## Privacy controls

Users can inspect saved source excerpts, correct interpretations, close cases, and request forgetting. These controls cover opportunities and general memory. Removing a source invalidates its dependent items before another retrieval. Export is deferred until there is a tested private delivery mechanism; do not add a public blob browser.

Forget is immediately effective for application use. Remote removal has a separate visible status and may require the operator's owner-authorized tool. Do not say “permanently erased everywhere.” Provider logs, original messaging-service copies, recipient screenshots, and expired backups have distinct handling. The security deletion route itself must be tested on the selected deployment. [MemWal deletion documentation](https://docs.wal.app/walrus-memory/guides/delete-memories-programmatically)

A minimal opaque exclusion registry outlives content deletion so restoring a backup cannot reactivate a forgotten case. On any restore, reconcile exclusions before enabling workers. Owner deletion manifests contain only the selected case's blobs and pending-write reconciliation entries; validate account/network and selection before signing.

## Secrets and privileges

Runtime secrets: Google OAuth client secret and local session configuration; DeepSeek API key; Typesafe API key; MemWal delegate key; database credentials; content encryption key; namespace HMAC key. Use separate development and production values. Account IDs and public addresses are not secret credentials, but should not be confused between environments.

The owner Sui private key is used only in a separate provisioning/deletion environment. The bot runtime cannot sign arbitrary owner transactions. The deletion tool must inspect the prepared transaction against the requested manifest and expected account/network before requesting or using an owner signature. Do not blindly sign arbitrary bytes returned by an unexpected host.

If a credential leaks: disable the affected integration, revoke/rotate through the provider, assess what namespaces/data were accessible, replace runtime secrets, and notify affected users as warranted by actual impact. Never paste leaked secrets into a ticket or generated report.

## Release blockers

Do not invite real users until consent, authorization, prompt-injection handling, source grounding, persistence status, and forget exclusion have passed their tests. If remote deletion cannot be exercised, keep the pilot limited to clearly disclosed synthetic/non-sensitive cases until the limitation is resolved. No extra confirmation is needed to build and test these controls locally.


## General-memory privacy boundary

General means across one user's opportunities, not across all users. Never promote raw contact details or inferred personality traits by default. Account-wide preferences require an explicit user statement/confirmation. Cross-opportunity references preserve their originating source and cannot be silently attributed to the current opportunity. Invalidate dependencies on correction, exclusion, or retention expiry; check this registry even when MemWal returns stale content. Account deletion revokes sessions and excludes both scopes immediately.
