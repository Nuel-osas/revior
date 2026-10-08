# Product specification

## The problem

A developer receives an opportunity through Telegram. The first message is ordinary: a role, a rate, and a call. Over the following days, the sender changes the onboarding process, introduces another contact, or asks for a new payment or credential. The developer has to reconstruct what was promised and decide what needs checking.

SecondLook addresses that continuity problem. Its question is: **“Given what this person previously told me, what changed, and what should I verify next?”** The bot cannot establish a sender's identity merely by reading their messages. Persisting a statement proves neither that the statement is true nor that the sender is authentic.

The founder story should be grounded in actual interviews and experiences. Do not claim that the founder was scammed, that the community lost money, or that a particular frequency of incidents is known without evidence.

## Initial user and situation

The first audience is developers considering remote roles, contract work, or technical collaborations received through direct messages or email. They enter through a web app with Google sign-in. The initial recruiting opportunity is access to developer communities; actual tester recruitment remains to be done.

The user wants a private place to track opportunities. They paste an excerpt, enter details, or report a verification result inside the selected opportunity. The app maintains both each opportunity's history and the user's general memory. They do not need a wallet or knowledge of Walrus to use the first release. Google sign-in does not import email; inbox integration would be a separate feature.

The product should help legitimate opportunities too. A changed domain can be an authorized vendor. A fee can have been quoted incorrectly. A user's first interpretation can be wrong. A system that never updates its warning after a correction does not use memory well.

## Jobs to be done

| Situation | User need | Product behavior |
|---|---|---|
| An offer first arrives | Identify what is actually being claimed | Extract terms and open questions; explain the limits of the evidence |
| A new request arrives days later | Compare it with earlier conditions | Retrieve relevant claims and show any supported change |
| Another person joins the conversation | Track who claimed what | Preserve distinct claimed identities; ask before joining cases |
| The user checks independently | Carry the result into later advice | Record what they checked, how, when, and what they report finding |
| The bot misunderstood a message | Correct the record | Append an explicit correction and stop relying on the rejected interpretation |
| The user returns after a break | Resume without retelling everything | Present a short case summary and outstanding checks |
| The case becomes irrelevant | Stop using its information | Close the case or request removal with clear status |

## Why persistent memory is essential

The value comes from relationships between events. “Please complete onboarding” may mean little alone. It means something different after “All onboarding will be inside the existing careers portal” if the new message sends the applicant somewhere else.

Memory has four responsibilities:

1. **Continuity:** retain the earlier condition when the user signs in again or returns from another device.
2. **Attribution:** preserve the exact passage and who supplied it.
3. **Revision:** retain corrections without continuing to treat old interpretations as current.
4. **Uncertainty:** remember an unanswered check as unanswered, rather than converting it into reassurance.

A summary that says “recruiter seems suspicious” fails these responsibilities. The durable record should say “message S1 states no applicant fees; message S4 requests a deposit; independent confirmation is pending.”

## Product promise and language

The promise is: **“Send the next message. SecondLook remembers the earlier ones and helps you see what changed.”**

Allowed outputs include “This changes an earlier condition,” “I cannot establish whether these two contacts are related,” and “You reported confirming this through the company's public contact.” Avoid “100% scam,” “verified recruiter,” “safe to pay,” or invented numerical confidence in legitimacy.

The bot may recommend pausing a requested payment or sensitive action while a concrete discrepancy is unresolved. It must explain the evidence for that recommendation. It should never instruct the user to test an offer by sending money, sharing an OTP, connecting a wallet, or installing a file.

## MVP scope

| Included | Acceptance condition |
|---|---|
| Google sign-in and processing consent | Server verifies identity; processing destinations are disclosed before analysis |
| Opportunity workspace | A details card and timeline update from sourced contributions |
| Private general memory | Relevant information across the same user's opportunities is inspectable, attributable, and correctable |
| Multiple named cases | User chooses a case explicitly; each case has an isolated history |
| Pasted text and detail entry | Missing original sender/time remain explicitly unknown |
| Sourced claim extraction | Each extracted claim resolves to an exact passage |
| Cross-session recall | A fresh worker retrieves earlier case evidence from MemWal |
| Structured comparisons | Jev classifies bounded comparisons; application validates the evidence |
| A short second opinion | Response has an observation, cited evidence, an unknown, and a next check |
| History and corrections | User can inspect saved sources and supersede mistaken interpretations |
| Verification log | A reported verification is distinguished from independently established fact |
| Close, reopen, and forget | Closure preserves history; forgetting excludes immediately and reports deletion status |

Deferred: screenshots/OCR, voice, Gmail inbox integration, browser extensions, group monitoring, automatic inbox access, external website fetching, domain reputation feeds, public blacklists, community-wide identity matching, automated recruiter outreach, wallet transactions, Telegram integration, and user-owned MemWal accounts. The first web workspace needs only opportunity cards, per-opportunity chat, details/history, and a general-memory view.

## Success and differentiation

Existing products already analyze suspicious messages. SecondLook's hypothesis is that **remembering the evolution of one case improves the usefulness and grounding of the next answer**. It must demonstrate that hypothesis rather than claim to be the first scam assistant. [Example of an existing product: Norton Genie](https://support.norton.com/sp/en/au/home/current/solutions/v20230717145233467)

Track product outcomes without collecting unnecessary message content:

- Activation: a consenting user creates a case and completes one saved analysis.
- Memory use: they return with a later message in that case.
- Evidence usefulness: they rate whether the comparison surfaced a relevant earlier condition.
- Verification follow-through: they voluntarily report completing a suggested check.
- Correction quality: a corrected interpretation disappears from active advice.

Do not equate a warning count, registered account count, or blob count with prevented fraud. Real-world harm reduction requires evidence beyond this hackathon.

## Product test before expansion

Run five short interviews using consented or fictional examples: ask how users currently track promises, what makes them seek a second opinion, which messages they would share, and whether source citations affect their next action. Record negative answers too. If users only want a one-time message scanner, the longitudinal product assumption needs revision.

For the first pilot, ask participants to return to one case over time. Their histories can involve legitimate offers, unresolved questions, and corrections; no one needs to seek out a scam to test the product.
