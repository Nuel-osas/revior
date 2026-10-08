# Decisions, unresolved questions, and sources

## Architecture decisions

| ID | Decision | Reason and consequence |
|---|---|---|
| ADR-01 | Begin with developer job/collaboration offers | Gives the bot a specific recurring situation and an accessible initial audience; expansion requires evidence |
| ADR-02 (revised) | Web workspace with Google sign-in first | Founder requested account identity and database-backed opportunity flow; Gmail import remains separate |
| ADR-03 | One explicit opportunity record and private general memory per user | Keeps offer evidence distinct while carrying eligible sourced context forward |
| ADR-04 | Immutable sourced events with correction overlays | Preserves what was said while allowing current advice to change |
| ADR-05 | DeepSeek extracts/explains; Jev compares typed state | Gives each requested component a bounded role; measure the evaluator's actual benefit |
| ADR-06 | MemWal archive plus encrypted PostgreSQL projection | Combines persistent semantic recall with exact current-state control; both systems remain operational dependencies |
| ADR-07 | Operator-owned MemWal account for pilot | Avoids wallet onboarding; user cryptographic ownership is not promised |
| ADR-08 | Confirm writes before calling them saved | Prevents asynchronous storage acceptance being misrepresented as durability |
| ADR-09 | No automatic URL fetching or model tools | The MVP can compare statements without opening hostile resources |
| ADR-10 | No fraud probability or safety certificate | A language comparison cannot establish opportunity legitimacy |
| ADR-11 | Separate owner-authorized deletion | Keeps broad owner authority out of the bot process; removal needs tested operational support |
| ADR-12 | Web frontend, HTTP and worker roles, PostgreSQL queue | Supports authenticated interaction and durable processing |
| ADR-13 | General memory is a sourced item collection | Dependencies support correction/deletion; no shared cross-user memory by default |
| ADR-14 | One encrypted details column per opportunity | Current structured state is convenient to render while immutable events preserve changes |

## Questions to resolve during implementation

These are technical/product checks, not reasons to pause writing the specification.

| Question | Resolution path | Blocking scope |
|---|---|---|
| Does the chosen managed Mainnet deployment expose Security Delete? | Synthetic write/delete integration drill with owner authorization | Remote-deletion promise and sensitive live pilot |
| What are actual storage duration, funding, quotas, and charges? | Inspect account/network settings and provider terms; record measured usage | Production retention/cost commitments |
| Can exact remote plaintext retrieval/export be supported beyond semantic recall? | Check supported API or implement a reviewed direct decrypt path later | Full database-free recovery claim |
| How much does Jev improve this workload? | Held-out comparison and ablation | Claims of evaluator advantage |
| Which extraction mistakes occur in real forwarded messages? | Consented pilot and correction metrics | Broader launch and new input types |
| What retention/training policies apply to the selected provider accounts? | Review current account terms and privacy notices | Final onboarding disclosure |
| Which deadline and elapsed-usage interpretation applies? | Organizer clarification | Submission eligibility claims |

## Source register

Reviewed 8 October 2026. Provider documentation and event rules can change; recheck the relevant source at integration or submission time. A documentation check is not an authenticated integration test.

| Source | Used for |
|---|---|
| [DeepSurge event](https://www.deepsurge.xyz/hackathons/c0141a4a-21be-4009-bc63-7c168608c849) | Event brief, usage/article requirements |
| [DeepSurge event API](https://www.deepsurge.xyz/api/hackathons/c0141a4a-21be-4009-bc63-7c168608c849) | Structured event dates and text |
| [Official Walrus event rules](https://thewalrussessions.wal.app/chatbots/index.html) | Mainnet, submission, deadline, wallet and feedback requirements |
| [Typesafe official site](https://typesafe.ai) | Establishing the official Jev documentation/provider |
| [Jev API](https://docs.typesafe.ai/api) | Endpoint, authorization, request/response structure |
| [Jev quickstart](https://docs.typesafe.ai/introduction/quickstart) | Initial integration workflow |
| [Jev confidence](https://docs.typesafe.ai/confidence) | Limits of confidence interpretation |
| [DeepSeek model/pricing page](https://api-docs.deepseek.com/quick_start/pricing/) | Current model names and legacy alias behavior |
| [DeepSeek chat API](https://api-docs.deepseek.com/api/create-chat-completion/) | JSON mode, output limits, thinking configuration |
| [DeepSeek JSON guide](https://api-docs.deepseek.com/guides/json_mode/) | Structured output handling |
| [MemWal SDK reference](https://docs.wal.app/walrus-memory/sdk/api-reference) | Public SDK surface |
| [MemWal storage loop](https://docs.wal.app/walrus-memory/sdk/agent-storage-loop) | Asynchronous persistence and recall |
| [MemWal public relayer](https://docs.wal.app/walrus-memory/relayer/public-relayer) | Mainnet/Testnet endpoints |
| [MemWal tenancy](https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant) | Account/namespace organization |
| [MemWal security model](https://docs.wal.app/walrus-memory/fundamentals/architecture/data-flow-security-model) | Plaintext processing and encryption boundaries |
| [MemWal memory read API](https://docs.wal.app/walrus-memory/api/memory-read-api) | Metadata, cursors, tombstones, authentication |
| [MemWal programmatic deletion](https://docs.wal.app/walrus-memory/guides/delete-memories-programmatically) | Owner-authorized deletion workflow |
| [MemWal package registry](https://www.npmjs.com/package/@mysten-incubation/memwal) | Package/version cross-check |
| [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) | Supported Google identity and stable account subject |
| [Google scopes](https://developers.google.com/identity/protocols/oauth2/scopes) | Basic identity versus separate mailbox permissions |
| [Norton Genie documentation](https://support.norton.com/sp/en/au/home/current/solutions/v20230717145233467) | Existing product context; no novelty monopoly claim |

Local reference inspected: `../pantry/node_modules/@mysten-incubation/memwal/dist/memwal.d.ts`, `types.d.ts`, and package version 0.1.8. This is an adjacent project's installed SDK, not a dependency already installed for SecondLook. Its private configuration was not used.
