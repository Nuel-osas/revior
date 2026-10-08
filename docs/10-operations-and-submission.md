# Operations and hackathon submission

## Deployment topology

Deploy one HTTP service, one worker process, and managed PostgreSQL. Start with low worker concurrency and serialize each case. Serve the web frontend and API over HTTPS; use HTTPS for provider calls and production OAuth callbacks. Supply runtime credentials from a secret manager, not an image, source file, shell history, or public build log.

The HTTP service can remain available while a provider is degraded, accepting durable work within queue limits. Readiness checks database connectivity, compatible migrations, configuration, and worker heartbeat. Provider diagnostics run separately and do not perform a paid write on every health probe.

## Initial operational limits

These are application defaults to tune after measurements, not provider service guarantees.

| Control | Initial setting |
|---|---|
| Concurrent active cases/user | 5 |
| Source size per analysis | 8,000 Unicode code points across accepted text input |
| Analyses/user/day | 20 |
| Provider request timeout | 20 seconds where supported |
| DeepSeek output budget | 2,000 tokens per extraction/explanation call |
| Recall budget | 8 candidate memories and 6,000 estimated tokens |
| Jev comparison batch | Up to 5 relevant claim pairs per turn |
| Retry budget | At most 3 transient attempts with jitter; honor provider retry guidance |
| Model repair | One additional extraction/explanation repair attempt |
| User-visible pending update | Show pending status if storage/comparison exceeds normal interaction time |

Storage job polling has its own durable schedule; a provider HTTP timeout does not terminate a remote job. When a job exceeds the application's waiting budget, label it delayed and reconcile in the background rather than create another event. Quotas apply before paid calls and include queued work.

## Cost model

Measure actual provider usage before setting a monetary budget. Per analyzed turn, the base path is two DeepSeek calls, one Jev comparison request, one opportunity event write, and bounded recall. Relevant general-memory retrieval and accepted promotions add their own reads/writes; account preferences can also require a confirmation turn. Corrections and verification reports add meaningful writes; retries can add model calls.

Budget formula:

`total = DeepSeek input/output usage + Jev billed requests/questions + MemWal/storage/network charges + hosting/database`

Do not publish an invented “fraction of a cent per user” claim. Record current provider prices, units, cache effects, and actual requests in the private evaluation report. Add a configurable daily global stop and return a clear capacity message once it is reached.

## Observability and incident response

Track queue age, worker lease recovery, MemWal completion time, incomplete recall, schema/grounding rejections, Jev abstentions, delivery uncertainty, and deletion age. Track model names and versions without logging source messages.

If MemWal is unavailable, disclose that comparison history is unavailable and preserve queued write state. If Jev is unavailable, sources may be shown without a classified comparison. If credentials fail, stop retrying authentication errors and alert the operator privately. If the database fails, reject intake with a retryable response rather than acknowledge work that was not saved.

Back up the database encrypted, with seven-day retention as the initial policy. Test a restore into an isolated environment; reconcile the exclusion registry before enabling any analysis. Check the archive manifest against provider metadata. Do not describe MemWal `restore()` as a replacement for this recovery process.

## Submission evidence

Two published sources need to be considered together:

- The [DeepSurge event listing](https://www.deepsurge.xyz/hackathons/c0141a4a-21be-4009-bc63-7c168608c849) asks for deployed usage over at least a few days, three real users with at least ten memories each, public source/setup, and a roughly 500–800 word article showing before/after behavior and conversations.
- The [official Walrus session rules](https://thewalrussessions.wal.app/chatbots/index.html) require Mainnet usage, at least ten agent blobs, a dedicated wallet, public source, feedback, and the event submission process.

Conservative working target: **three real users, at least ten meaningful confirmed memories each, on Mainnet, with actual repeated use over multiple days**. Verify which blobs/memories meet the organizer's definition. Do not assume unrelated prior projects, synthetic fixtures, or imported historical text establish SecondLook's days of live usage.

The official page lists **9 October 2026 at 14:00 UTC (15:00 Lagos)**. The DeepSurge API lists **16:00 UTC (17:00 Lagos)**. Use the earlier cutoff for planning until organizers clarify. Starting on 8 October means the several-days usage requirement may not be achievable before that cutoff; do not claim compliance or an extension without confirmation.

The sources also differ in prize denomination language. Verify payout details with organizers rather than making them part of the product plan. DeepSeek appears to fit the alternative-model category, but final eligibility is the organizer's decision; no win is promised.

### Evidence checklist

| Item | Evidence to capture | Current status |
|---|---|---|
| Working product | Actual web app URL, Google sign-in, and deployment commit | Not implemented |
| Public code | Repository URL, setup steps, lockfile, configuration template | Not published |
| Mainnet archive | Dedicated account/wallet and confirmed blob manifest | Not provisioned for SecondLook |
| Three real users | Consented, distinct participants; aggregate counts only publicly | Not recruited for SecondLook |
| Meaningful memories | Confirmed event counts and distinct blob IDs per participant | None recorded here |
| Repeated usage | Real timestamps and returning-case interactions | Not yet available |
| Before/after | Same scenario without history and with sourced recall | Evaluation planned |
| Corrections | Demonstration that revised evidence changes advice | Evaluation planned |
| Feedback | At least one integration friction and a concrete improvement suggestion | Record during build |
| Article | 500–800 words, permitted screenshots, honest limitations | Outline below |
| Social/submission | Required public mention and submission form | Not posted/submitted |

The submission form linked by the event is [Walrus Session submission](https://airtable.com/appoDAKpC74UOqoDa/shro5iVzzjoWfZlPK). The listing calls for an X mention of `@WalrusProtocol` with `#WalrusMemory`; check the current event instructions and Discord requirements before posting. This documentation does not authorize public posting or sending messages.

### Article outline

1. **Problem:** an offer evolves across messages, and isolated analysis misses the earlier condition.
2. **Product:** show one consented, anonymized case or a clearly labeled synthetic illustration.
3. **Before/after:** compare message-only output with sourced recall; include the actual result, even if imperfect.
4. **Architecture:** explain DeepSeek extraction/explanation, Jev comparison, and MemWal persistence.
5. **Real usage:** report actual participant counts, meaningful memories, dates, and return interactions.
6. **What failed:** describe integration friction, false positives, or correction handling discovered in testing.
7. **Next:** outline the highest-priority improvement supported by user feedback.

Do not write a testimonial, performance result, prevented-loss estimate, or founder anecdote as fact until it is evidenced.
