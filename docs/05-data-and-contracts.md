# Data model and application contracts

## Database conventions

Use UUIDs for internal IDs and `timestamptz` in UTC. Existing contract `tenant_id` means the user UUID; `case_id` means the opportunity UUID. Apply tenant/case constraints in SQL as well as application checks. Use transactions for intake, state changes, and outbox creation; do not wrap remote calls in those transactions.

Content-bearing fields use authenticated encryption with a versioned server key and per-record nonce. Include tenant ID, case ID, row ID, and encryption version as authenticated associated data. Production keys come from a secret manager. Full-text indexing plaintext would defeat this protection; initial searches operate on decrypted, authorized case projections within bounded worker memory.

This is a migration blueprint, not already-applied SQL.

| Table | Principal columns and constraints |
|---|---|
| `users` | UUID, Google issuer/subject identity, encrypted profile, consent version/time, account status; unique validated `(issuer,sub)` |
| `sessions` | Hashed opaque session token, user ID, expiry, revocation; no Google tokens as app sessions |
| `opportunities` | UUID, user ID, encrypted label and `details_ciphertext`, details revision, lifecycle, sequence, namespace, activity/closure/exclusion timestamps |
| `intake_requests` | Unique `(user_id,idempotency_key)`, payload hash, opportunity ID, encrypted intake, received time, processing state/expiry |
| `jobs` | User/opportunity, sequence, kind, phase, attempts, availability, lease/fencing token, sanitized error, cancellation flag |
| `memory_events` | Event ID, tenant/case mapping, sequence, encrypted frozen envelope, hash, write key, provider job/blob IDs, archive status |
| `claims` | Claim ID, user/opportunity, source event, encrypted statement/quote, computed state, superseding event |
| `verification_checks` | User/opportunity, claim IDs, encrypted method/result, status, report event |
| `assessments` | User/opportunity, input event, evidence refs, encrypted output, completeness, versions, expiry |
| `conversation_entries` | User/opportunity, immutable entry ID, input/assessment ref, role, display state; idempotent projection |
| `general_memory_items` | User, stable item ID, kind, revision, encrypted statement, eligibility, confirmed archive event, source revision |
| `general_memory_dependencies` | Item/revision to originating opportunity, event, claim, or independent user-confirmation source |
| `user_memory_confirmations` | User, confirmation ID, encrypted explicit statement, acceptance time, removal state |
| `general_memory_events` | Frozen versioned payload, user/item/revision, provider job/blob, write key, archive state |
| `deletion_requests` | User and optional opportunity/item scope, exclusion time, exact manifest hash, provider batch/digest, status |
| `archive_manifest` | Scope, event/blob, owner/account/network, namespace, payload hash, deletion state |

Each case-bearing reference uses composite ownership constraints. For example, a claim's `(tenant_id,case_id,source_event_id)` must reference an event with that same triple. `case_id` alone is not an authorization check. Row-level security is useful defense in depth when implemented with a narrowly privileged runtime role; it does not replace checks around external provider calls.

## State machines

Application `archive_status`: `queued → submitted → confirmed`, with `retry_wait`, `failed`, or `cancelled` branches. Provider job status is retained separately as returned by MemWal. Do not conflate the two vocabularies.

Application job phase: `intake → extract → freeze_event → archive_submit → archive_poll → retrieve → compare → explain → deliver → complete`. Failure records include the phase and whether retrying may incur a duplicate provider operation. Re-enter a phase only through its persisted state.

Assessment disposition is one of:

- `change_detected`: supported difference worth checking; not a fraud finding.
- `needs_context`: comparison lacks a necessary detail.
- `no_supported_change`: selected evidence does not establish a relevant change; not a safety verdict.
- `comparison_unavailable`: infrastructure or evidence failure prevents comparison.

Evidence completeness is independently `complete_for_selected_claims`, `partial`, or `unavailable`. Never describe selected-claim completeness as exhaustive coverage of the entire opportunity.

## Application interfaces

These are proposed internal interfaces, **not provider SDK methods**:

```ts
interface CaseService {
  create(actor: Actor, label: string): Promise<CaseRef>;
  select(actor: Actor, caseId: string): Promise<void>;
  submitText(actor: Actor, input: CaseTextInput): Promise<JobRef>;
  correct(actor: Actor, input: CorrectionInput): Promise<JobRef>;
  recordVerification(actor: Actor, input: VerificationInput): Promise<JobRef>;
  history(actor: Actor, caseId: string, cursor?: string): Promise<HistoryPage>;
  forget(actor: Actor, caseId: string): Promise<DeletionRef>;
}

interface MemoryPort {
  submit(event: FrozenEvent, scope: CaseScope): Promise<AcceptedWrite>;
  poll(write: AcceptedWrite): Promise<ArchiveWriteStatus>;
  recall(query: string, scope: CaseScope): Promise<RecallEvidence>;
}

interface ComparisonPort {
  compare(input: BoundedClaimComparison): Promise<TypedComparison>;
}
```

`Actor` is created only from a validated server session. `CaseService` is the internal opportunity service; the existing contract names are retained until a versioned rename. `CaseScope` is constructed server-side after authorization and includes exact namespace, tenant, case, current revision, and exclusion state. The model cannot supply either type.

Every service returns domain errors (`CASE_NOT_OWNED`, `CONSENT_REQUIRED`, `CASE_EXCLUDED`, `EVIDENCE_MISSING`, `PROVIDER_UNAVAILABLE`) separately from display text. Avoid provider error payloads in user responses.

## HTTP surface

All `/api` data routes require the local session; all mutations additionally require CSRF/origin checks and idempotency where appropriate. Resource queries always include authenticated user ownership. Return an opaque not-found response for another user's resource.

| Route | Contract |
|---|---|
| `GET /auth/google` | Begin supported Google sign-in with state/nonce and allowlisted return path |
| `GET /auth/google/callback` | Validate auth response, create/rotate local session; no opportunity content processed |
| `POST /auth/logout` | Revoke local session |
| `GET /api/me` | Minimal current profile, consent status |
| `GET/POST /api/opportunities` | List owned opportunities or create one |
| `GET /api/opportunities/:id` | Current details, revisions, and processing state |
| `POST /api/opportunities/:id/messages` | Validate scope/text/key; enqueue atomically; return 202 and stable job ID |
| `POST /api/opportunities/:id/corrections` | Confirm explicit sourced correction; enqueue |
| `POST /api/opportunities/:id/verifications` | Record attributed user check |
| `POST /api/opportunities/:id/close` | Close without deleting history |
| `POST /api/opportunities/:id/reopen` | Reopen an owned closed opportunity |
| `POST /api/opportunities/:id/forget` | Immediately exclude and invalidate dependencies; return removal status |
| `GET /api/opportunities/:id/history` | Paginated owned sources and conversation entries |
| `GET /api/jobs/:id` | Owned job status; no secret provider payloads |
| `GET /api/memory` | Eligible private general-memory items and pending candidates |
| `POST /api/memory/:id/confirm` | Confirm a proposed account preference with a new user-statement source |
| `POST /api/memory/:id/correct` | Explicit general-memory revision |
| `POST /api/memory/:id/forget` | Exclude item and queue exact removal |
| `POST /api/account/forget` | Exclude all user content, revoke sessions, continue deletion out of band |
| `GET /healthz`, `GET /readyz` | Minimal process/readiness state, no private diagnostics |

The frontend initially polls owned job/conversation state; SSE can follow if needed. Refreshing or retrying the HTTP request must not create another logical event. Provider diagnostics and owner deletion signing stay outside public routes.

## Assessment contract and grounding

The [assessment schema](../contracts/assessment.schema.json) requires an input event ID, disposition, completeness, observations, unknowns, a next check, and a separate `general_context` list (empty when unused). Each opportunity observation includes source references: event ID, optional claim ID, and exact quote. General context instead identifies the eligible user-memory item, archive event, revision, exact statement, and purpose. The renderer keeps these categories visibly distinct; neither relies on a model-invented URL.

Post-schema domain checks must verify:

1. Every opportunity observation references events in the actor's opportunity. General context references eligible same-user memory items with valid, current dependencies; cross-opportunity context is explicitly labeled.
2. Every quote is an exact substring of retained source text.
3. Every comparison about a change references at least two relevant sources, unless explicitly a within-message contradiction.
4. A superseded claim cannot justify a current observation without an explicit historical label.
5. No new company identity, amount, date, domain, or verification outcome appears without supporting evidence.
6. Missing retrieval or Jev output leads to an appropriately limited disposition.
7. A next check is user-controlled and does not ask for payment, installation, credentials, or contact through an unverified link.

JSON Schema checks shape, not truth. Tests must exercise the domain rules independently.

## Versioning

Persist schema version, extraction prompt version, explanation prompt version, Jev question version, requested model identifier, returned model identifier, and deployment commit in appropriate events/evaluation records. Never silently rewrite old source events when a prompt changes.

Read supported schema versions explicitly. Unknown future versions are quarantined from prompts and shown as unavailable history until migrated. Migrations may regenerate projections from known source content, but must not fabricate new source evidence.


## General-memory contract

The [general-memory event schema](../contracts/general-memory-event.schema.json) is separate from opportunity evidence. Serialize accepted promotions per user and confirm their own MemWal writes. Validate that every dependency belongs to the same user, remains eligible, and matches the revision used to build the candidate. An `open_check_reference` must identify its originating opportunity; a `confirmed_preference` must have an independent confirmation record. The database constraint/policy layer enforces these relationships beyond JSON shape.

Extend the internal archive adapter with a discriminated `OpportunityScope | UserMemoryScope`; only the server constructs either after authorization. The user-memory branch accepts the general-memory envelope, not the opportunity envelope with an invented case ID. Preference confirmations create their own immutable user-statement source before promotion. Derived open-check items describe workflow state, not evidence that an offer is fraudulent.
