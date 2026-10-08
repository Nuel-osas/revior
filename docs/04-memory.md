# Memory design

## The memory unit

Persist a versioned **case event envelope** as JSON text through `memwal.remember()`. An envelope contains one meaningful user contribution: its retained source excerpt, proposed claims, or an explicit correction/verification result. Several related claims can share one source event. Do not split sentences into artificial memories to increase a submission count.

The [memory-event schema](../contracts/memory-event.schema.json) is the machine-readable starting contract. Domain validation adds rules that JSON Schema alone cannot enforce.

| Field | Meaning |
|---|---|
| `event_id` | Stable application UUID, generated before any provider write |
| `case_id`, `tenant_id` | Opaque internal identifiers: local user UUID and opportunity UUID, never email addresses |
| `case_sequence` | Server-assigned order of accepted operations |
| `kind` | `source_message`, `user_correction`, or `verification_report` |
| `recorded_at` | Server ingestion time |
| `occurred_at` | Original message/event time if known; otherwise null |
| `source` | Retained text, origin type, and original sender claim if available |
| `claims` | Source-grounded interpretations, each with an exact supporting quote |
| `correction` | Target claim IDs, explanation, and replacement interpretation, when applicable |
| `verification` | What the user reports checking, method, result, and unresolved limits |
| `provenance` | Extractor model identifier and prompt/schema versions |

Blob IDs and provider job IDs live in the application archive manifest after persistence succeeds. An envelope cannot contain its own not-yet-created blob ID.

## Evidence is not truth

Distinguish these layers in storage and wording:

1. **Source text:** “Applicants pay no fees.” This is what the retained message says.
2. **Interpretation:** the sender claims an applicant fee is not required.
3. **Relationship:** a later requested deposit may contradict that claim.
4. **User report:** the user says they confirmed the deposit through an independently found contact.
5. **Assistant analysis:** a recommendation to pause and verify.

Only the first four can become case evidence, with their proper attribution. Assistant analysis is stored as an expiring operational assessment with references, not as a factual memory eligible to justify itself on a later turn.

A message forwarded from a contact is still a **claim by a purported sender**. Storage encryption and blockchain references establish neither message authenticity nor the truth of its content.

## Source handling

Retain the excerpt needed to support the claim. Before model processing, warn about sensitive secrets and apply bounded detection/redaction for obvious private keys, OTPs, passwords, or access tokens. Detection is imperfect; the product must not promise universal secret removal.

For a redacted message, `source.text` is the redacted retained text, `source.redacted` is true, and quotes must match that retained version. Never claim to retain a byte-perfect original when redaction occurred. Discard the unredacted intake after processing.

For the initial schema, `quote` plus zero-based `start` and `end` uses **Unicode code-point offsets**, with end exclusive. Convert deliberately in JavaScript: `Array.from(text).slice(start, end).join('')`. A plain `String.slice()` uses UTF-16 code units and will mis-handle some emoji. Validate exact equality and reject hallucinated quotations. The extractor supplies candidate offsets; the application may locate an unambiguous exact quote deterministically.

Do not normalize, lowercase, or rewrite retained evidence. Normalize structured values separately. A domain may have a lowercase/punycode comparison representation; retain its original spelling for display. Do not fetch URLs, follow redirects, or infer common ownership from similar domain names in the MVP.

## Claim lifecycle and corrections

Claims are immutable interpretations attached to a source. The current projection computes their state:

| State | Meaning |
|---|---|
| `active` | Eligible for comparison, with its original attribution |
| `disputed` | An unresolved conflict affects its interpretation |
| `superseded` | An explicit accepted correction replaces this interpretation |
| `withdrawn` | The user withdraws the interpretation without a replacement |

A later conflicting message does **not** silently overwrite an earlier condition. Preserve both and add a comparison. “Most recent wins” would erase exactly the change the product exists to explain.

Corrections refer to existing claim IDs in the same case and specify `replace` or `withdraw`. A replacement adds new claims supported by either the retained original passage or the correction message, with accurate attribution. Reject a correction targeting another tenant/case or already forgotten content. Asking the user to confirm a correction is a product action confirmation, not a requirement to approve ordinary analysis.

The user can correct the bot's reading without asserting that the recruiter changed the underlying agreement. Keep these distinct in the timeline.

## Verification records

A verification report records a claim/question being checked, the user's stated method, the result, and whether the issue remains open. Suggested outcomes are `reported_confirmed`, `reported_denied`, and `inconclusive`. The prefix is intentional: the application has not independently performed the check.

“They told me again in the same chat” does not satisfy a suggested independent-contact check. Preserve the report, mark the method as same-channel, and keep independent confirmation open. A report about one domain does not clear payment, identity, contract, or credential requests by association.

## Retrieval pipeline

1. Authenticate user and load the selected, non-excluded case.
2. Derive the exact namespace from internal identifiers; never accept one from a prompt or callback.
3. Load confirmed active claims, corrections, and unresolved checks from the encrypted projection.
4. Create a bounded search query from extracted topics such as applicant fees, onboarding channel, claimed contact, or requested credentials.
5. Query MemWal in that exact namespace; initial tuning values: `limit: 8`, `maxTokens: 6000`.
6. Parse returned envelopes and verify schema, tenant, case, event ID, blob manifest membership, and payload hash. Reject unknown, malformed, deleted, or mismatched results.
7. Combine semantic results with deterministic active-state evidence. Preserve provenance indicating whether each source came from recall or the projection.
8. Apply correction and exclusion state **after** retrieval. A highly relevant old interpretation remains superseded.
9. Prioritize directly relevant prior conditions and unresolved checks; disclose missing or truncated evidence. If exact prior sources cannot be loaded, do not manufacture a comparison.
10. Pass only selected sources and bounded claim pairs to Jev and DeepSeek.

Semantic search retrieves candidates; it is not an exhaustive case listing. The current SDK has no general `getMemory(blobId)` method. The documented owner memory read API returns metadata, not full source content. Deterministic source views therefore use the encrypted projection backed by confirmed archive events. Full remote-only replay is an unresolved capability, not a promised fallback. [MemWal SDK](https://docs.wal.app/walrus-memory/sdk/api-reference), [read API](https://docs.wal.app/walrus-memory/api/memory-read-api)

For large cases, do not stuff the whole history into the model's context. Cap the active selection, display that a comparison covered only selected evidence, and ask a targeted question when required context is missing. Raw MemWal distance and Jev confidence are not interchangeable scores.

## Namespace and ownership

Use a namespace like `sl1_<tenant-hmac>_<case-uuid>` with a stable server-side HMAC secret and a versioned derivation. Namespace matching is exact. Rotating that secret requires a migration map; an unplanned rotation would orphan retrieval routes.

For the pilot, one dedicated operator-owned MemWal account serves the application. Its delegate can access that account's namespaces. Namespace separation is application organization, **not cryptographic isolation between application users**. Authorization checks and database tenant constraints must enforce separation. Future user-owned accounts require explicit wallet ownership, recovery, funding, and delegate revocation designs. [MemWal tenancy guidance](https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant)

## Persistence and idempotency

Before sending to MemWal, freeze the envelope bytes and store their SHA-256 with an outbox intent. The idempotency key identifies the logical event, for example `sl1:<event-uuid>`. Persist it before the network call and reuse it after timeouts and process restarts. Never change the payload under the same key.

MemWal acceptance returns a provider job ID. Only a terminal `done` response with a blob reference confirms the archive entry. `uploaded` is an intermediate state. Persist failures and timeouts separately: a local timeout does not prove the remote write failed. [MemWal storage loop](https://docs.wal.app/walrus-memory/sdk/agent-storage-loop)

Project the content after confirmation, with its blob reference and content hash. A pending correction can immediately suppress the disputed interpretation for safety, but is labeled pending until archived; a pending write is not counted as a saved memory.

## Forgetting and retention

On confirmed forget, atomically mark the case excluded, invalidate case actions and dependent general-memory items, cancel/suppress deliveries, and create a deletion manifest from confirmed and in-flight event references. All retrieval paths consult the exclusion registry before passing content to models. Retain minimal opaque exclusion metadata so restoring an old backup cannot resurrect forgotten cases.

Purge encrypted application content and caches. The separate owner-authorized deletion tool submits only the case's reviewed blob IDs to the documented Security Delete API. Reconcile writes that finished after the request and append them to the manifest. If a submission outcome is uncertain, query the existing deletion batch before preparing another. SDK 0.1.8 has no public `forget()` convenience method. [Programmatic deletion guide](https://docs.wal.app/walrus-memory/guides/delete-memories-programmatically)

Initial application retention policy, to implement and disclose: abandoned intake one hour; successful raw intake removed after event creation; operational assessment text seven days; case content expires after 90 days without case activity; encrypted backups seven days. Retention expiry invokes the same exclusion/deletion workflow. Provider logging/retention and Walrus storage epochs are separate constraints; verify them before promising a deletion schedule.

Do not equate forgotten, deletion pending, and deleted. Storage deletion cannot erase copies already exported by a user or retained by the original messaging service. Never write unencrypted sensitive content directly to Walrus.


## General memory across opportunities

The user has a separate private general namespace. The [account flow](12-account-and-opportunity-flow.md) defines promotion and the current-details column. The first implementation promotes confirmed user preferences and sourced open-check references; it does not pool information across users or infer that one company's claim applies to another opportunity.

Use the [general-memory schema](../contracts/general-memory-event.schema.json) for these archive events. Each version has an item ID, revision, user ID, kind, statement, and explicit source dependencies. An independently confirmed preference uses the confirmation as its own source; an open-check pointer retains opportunity/event/claim IDs. The opportunity schema stays unchanged and is not used to fake an account-wide event with an invented case ID.

Retrieval first authorizes the user, then loads relevant eligible general-memory items in a separate request. Check the local dependency/exclusion registry even when an old item appears in semantic recall. Tag all general context as preference or a reference to a different opportunity. It cannot silently justify a factual conclusion about the current offer.

Corrections and forgetting invalidate dependent items immediately, with asynchronous archival revision/removal after that. Never keep deleted opportunity information alive in a derived summary. A general-memory write has its own stable key and confirmation state; it does not inherit durability from its source event.
