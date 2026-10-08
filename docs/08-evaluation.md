# Evaluation plan

## What we need to prove

The central hypothesis is that sourced persistent memory helps SecondLook identify meaningful changes across sessions while respecting corrections and uncertainty. A visually convincing answer is insufficient. The test must establish which earlier source affected the answer and whether the system would behave differently without it.

All numbers below are **proposed release targets**, not measured results. The [scenario pack](../fixtures/evaluation-cases.json) is synthetic and must never be counted as real user adoption or organic memories.

## Three comparison conditions

| Condition | Available information | Purpose |
|---|---|---|
| A: current message only | Latest message, same explanation model and policy | Establish what can be inferred without memory |
| B: naive memory | Retrieved prior text without correction/current-state reconciliation | Expose stale-memory and attribution failures |
| C: SecondLook | Sourced MemWal recall, active projection, corrections, Jev, grounding policy | Test the complete proposed product |

Use the same fixture, model settings, and output rubric. Record actual model IDs and prompt versions. Run each uncertain model case three times as an initial stability check; repeat only when changes or unresolved variability justify it. Save unsuccessful runs too.

Add an ablation of C without Jev once the pipeline works. This tests whether the extra evaluator improves consistency enough to justify latency and cost. Jev remains part of the requested implementation; evaluation should be honest about the contribution it actually makes.

## Scenario families

1. No-fee promise followed by an applicant deposit request.
2. Original onboarding channel followed by another domain.
3. A legitimate vendor explanation with a reported independent check.
4. A payment amount change with missing currency or period.
5. A user correcting the bot's reading of who pays.
6. Two unrelated cases mentioning the same company name.
7. A late-arriving older message that must not replace newer evidence.
8. Prompt injection inside a newly forwarded message and inside a recalled event.
9. Deleted/superseded evidence appearing in semantic results.
10. Partial recall or unavailable providers.
11. Duplicate browser submissions and a worker crash after write acceptance.
12. Forget during an in-flight archive operation.

The fixtures define expected properties rather than exact natural-language answers, so useful paraphrases can pass.

## Scoring rubric

| Metric | Definition | Initial target |
|---|---|---|
| Source grounding | Supported factual observations / all factual observations | 100% on release fixtures |
| Change precision | Correct flagged changes / all flagged changes | At least 90% on a separately labeled set |
| Change recall | Correctly surfaced labeled changes / all labeled changes | At least 85% on that set |
| Correction compliance | Cases where superseded interpretations stop driving current advice | 100% on correction fixtures |
| Isolation | Cases with unauthorized cross-case/user content | Zero |
| Persistence honesty | “Saved” messages backed by confirmed writes | 100% |
| Abstention correctness | Missing-evidence tests that disclose limits rather than conclude | 100% on release fixtures |
| Next-step usefulness | Human score: specific, feasible, independent, evidence-related | At least 4/5 median in pilot review |

A dozen scenarios cannot establish a reliable real-world accuracy rate. Before using percentage claims externally, create a larger held-out set with independently reviewed labels, report sample size and uncertainty, and separate development cases from evaluation cases. Do not tune thresholds against the same cases used for the final score.

## Persistence demonstration

1. In a dedicated synthetic test case, persist an early source event and wait for `done`.
2. Save its real blob ID and application event ID in a private test report.
3. Stop and restart the HTTP/worker processes, clearing process-local caches.
4. Send the later message through a newly authenticated browser session.
5. Instrument the MemWal adapter to show that recall returned the prior event's blob ID and valid envelope.
6. Assert the final observation cites both earlier and current sources.
7. Compare with condition A, which must not claim knowledge of the omitted earlier promise.
8. Add a correction, restart again, and confirm current advice respects it.

The database projection remains part of this test. This proves cross-session archived recall and correction behavior; it does **not** prove total recovery without the operational database. A separate recovery drill restores the database, reconciles exclusions, and verifies archived references.

## Failure and integration checks

- Replay one authenticated request with the same idempotency key: one logical event and one idempotency key.
- Drop the response after MemWal accepts a write: retry does not create a fresh key.
- Return `uploaded` for multiple polls: no “saved” confirmation yet.
- Return a recalled envelope from another case: no content reaches Jev or DeepSeek.
- Return an exact-looking citation with a wrong quote: renderer rejects it.
- Correct a claim while an earlier analysis is running: stale result is not delivered as current.
- Forget while storage is pending: case stays excluded, and any later blob joins the deletion manifest.
- Simulate partial recall: output completeness is partial and the limitation is visible.
- Simulate Jev failure: do not silently claim a Jev-classified result.
- Lose the HTTP acceptance response: retry resolves to the existing job and conversation entry.

## Human pilot

Recruit consenting users with genuine opportunities or clearly labeled fictional scenarios. Record which is which. Ask whether the earlier evidence was relevant, whether the bot misread anything, what they checked next, and whether they returned voluntarily. A user should never send money or engage with a suspicious person for the purpose of evaluation.

Publication requires explicit permission for any excerpt or screenshot. Redact contacts and identifying details; keep unredacted evidence private. A real user interacting with a fictional example is a real participant, but the case is still synthetic and must be described that way.

## Evaluation report template

For each run record: fixture/version; scenario category; run condition; model IDs; prompt/question versions; SDK/network; expected properties; actual disposition; cited event/blob references; grounding failures; correction handling; latency by phase; input/output token usage where provided; provider errors; reviewer score; pass/fail with explanation.

Do not include raw private conversations in CI artifacts. Public reports use synthetic fixtures and aggregate results.


## Web identity and general-memory checks

- Reject forged/expired Google identity, mismatched audience, login state/nonce failure, and revoked sessions.
- Same verified Google subject on another device opens the same account; an email-field change does not create or merge accounts by itself.
- Sign-in does not request Gmail permissions or import an inbox.
- Two tabs with different opportunities keep their messages and assessments separate.
- General memory for user A never appears for user B.
- A proposed preference is not an account-wide default until confirmed.
- An open-check reference clearly names its source opportunity and is not evidence against another offer.
- A corrected/forgotten source invalidates dependent general-memory items immediately.
- Two simultaneous opportunity updates both survive account-memory revision reconciliation.
- A general-memory write timeout does not change the opportunity's already-confirmed save status.
