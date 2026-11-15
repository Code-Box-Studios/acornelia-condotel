# Implementation progress

Started November 13, 2026, following the user's instruction to implement the reviewed full plan. The user permits commits and pushes directly to `main`. No feature branches or worktrees are used.

## Current state

- Task 01: application foundation implemented. Next.js 16.4.6, Payload 3.93.0, React 19.3.1, TypeScript 5.9.3 and pnpm 12.5.1 are locked.
- Foundation validation: 19 unit tests passed after five intended positive-path failures; lint and TypeScript checks passed. Application build remains part of Task 02 after migrations.
- Dedicated local PostgreSQL container and persistent volume created through `compose.yaml`; other containers were preserved. This is not a Supabase connection or production proof.
- Task 02: PostgreSQL transaction/exclusion proof implemented. Twelve integration checks pass, including six injected rollback stages, exact large amounts, direct SQL rejection, last-room concurrency, serializable retry, fresh migrations and preservation of existing records during upgrade. The optimized Next build, lint and TypeScript checks passed.
- Task 03: customer/staff identity boundaries implemented. The full current suite has 42 passing tests; eight Chromium browser checks pass across desktop and mobile. TypeScript, lint and optimized build pass.
- Task 04: protected transactional action logging implemented. The current suite has 51 passing tests and 14 passing Chromium desktop/mobile browser checks. TypeScript, lint, reviewed local migrations and the optimized build pass.
- Task 05: property/page/policy globals, published room-type projections and local durable media are implemented. The full suite has 57 passing tests, with 16 Chromium desktop/mobile browser checks. TypeScript, lint and the optimized build passed. Failed upload/delete recovery was tested against the isolated local filesystem; hosted storage remains gated.
- Task 06: the public Warm Boutique composition is implemented as a provisional local review. Home, room discovery/detail, about, contact, policy pages, image gallery, light/dark controls and validated search handoff are built. The full current suite has 57 passing tests and 28 Chromium desktop/mobile checks; lint, TypeScript and the optimized build passed. Key text/button contrast passes 4.5:1 in both themes. Desktop/mobile light and dark screenshots were inspected. Production design, real content and live booking remain gated.
- Task 07: persistent Stories/Events, staff-only draft previews, immediate public withdrawal, filters and contextual/general enquiries are implemented. The combined suite has 68 passing tests and 32 Chromium desktop/mobile checks; lint, TypeScript and peer checks pass. The optimized build passed.
- Task 08: optional customer access and private checkout continuity are implemented as a local email/password candidate. The combined suite has 80 passing tests and 42 Chromium desktop/mobile checks. Lint, TypeScript and the optimized build passed. The refreshed local account and checkout preview was inspected on desktop and mobile. Production login/recovery choices and actual email transport remain gated.
- Task 09: private booking history, immutable customer-ID ownership, separately scoped guest view capabilities and a policy-gated historical-claim protocol are implemented. The full suite has 92 passing tests and 46 passing Chromium desktop/mobile checks. Lint, TypeScript, development migration and the optimized build passed. Existing owner data survived migration; concurrency and audit-failure rollback were proved. Customer history/detail screenshots were inspected in both themes. Production claim evidence/recovery remains unapproved and disabled.
- Task 10: shared physical-room availability, explicit sale state, policy-validated allocation, maintenance/owner blocks and opening-import preview are implemented. All 102 automated checks passed. Two new Chromium HTTP checks passed on desktop/mobile, alongside the 46 browser checks from Task 09. Lint, TypeScript, local migration and optimized build passed. Approved production stay rules and opening inventory remain absent; the public availability endpoint fails closed.
- Task 11: exact pricing, immutable policy/rate versions, private quote issuance and explicit acceptance are implemented. All 118 automated checks and all 50 Chromium desktop/mobile checks passed. Lint, TypeScript, local migration and optimized build passed. New rate versions preserve previously accepted amounts; private binding, wrong versions, expiry, audit rollback and zero-total gates were verified. No real production rates, tax/fee rules or approval records were selected.
- Task 12: all-account offer publication/withdrawal, private My Offers, shared quote discounts and atomic usage caps/transitions are implemented. All 137 automated checks and all 58 Chromium desktop/mobile checks passed. Lint, TypeScript, local migration and optimized build passed. Tests cover guest denial, last-use/per-account races, offer/version scope, direct SQL overuse, withdrawal, retry/consumption/release idempotency, zero totals, wrong release reasons and audit rollback. Narrow theme screenshots were inspected. Real terms remain unselected; refund-triggered reinstatement stays gated until Task 23 verifies refunds.
- Task 13: durable outbox records, generation-fenced leases, protected runner entry and safe replay are implemented locally. Validation is recorded below. Live transports and scheduling remain gated.
- Task 14: atomic checkout preparation and command replay are implemented. All 165 automated checks and all 62 Chromium desktop/mobile checks passed. Lint, TypeScript, development migration and optimized build passed.
- Task 15: the Maya transport boundary is implemented and checked against official API/domain guides and the official Maya plugin. All 184 automated checks, including 19 provider contract cases, passed. Lint, TypeScript and optimized build passed. No real provider connection or merchant capability was verified.
- Task 16 now connects the checkout/contact review, frozen terms, offers, private status/recovery and controlled payment handoff to the durable backend. Final validation is recorded below. Actual Maya capability/setup and verified payment reconciliation remain later gates.
- Task 17 implements RSA-authenticated Maya delivery ingestion and a durable, immutable payment inbox. Validation is recorded below. Canonical outcomes remain Task 18; no real webhook subscription is claimed.
- Tasks 17–29 remain pending.

## Decision status

Implementation authorization approves work on the plan. It does not supply rates, cancellation terms, offer values, merchant credentials, real property content or recovery ownership. Those gates remain explicit. Design, booking baseline and customer-login preferences were requested while independent foundation work proceeds.

Native inline execution was chosen for this run. Shared types and transaction contracts stay under one implementer; the workflow requires an independent final review. The existing current-upstream Payload template used a viewport helper absent from pinned 3.93.0, so the scaffold uses standard Next viewport metadata with the installed official RootLayout.

## Local setup

Run `pnpm install`, `pnpm local:setup`, then `docker compose up -d database`. The setup command creates a protected local `.env` only when one does not exist. It never replaces existing settings. Database migrations, development seeding and the website startup are recorded here when verified. Local credentials are not stored in this document.

No Maya/Brevo/hosted-media provider, deployment, production database or hosted customer flow has been verified yet. The original implementation-plan verification record remains a historical document-only check.

## Database proof — November 14, 2026

Migrations `20261114_030322_foundation` and `20261114_030640_reservation_guards` were generated/reviewed and applied to the dedicated local development and isolated test databases. Schema push remains disabled. Physical room allocations use UUID relationships, canonical UTC-midnight date markers and a PostgreSQL GiST exclusion on half-open property-date ranges. Every supported write path must carry the same Payload request transaction; the server capability cannot be supplied through JSON.

Canonical amount strings preserve values beyond JavaScript safe integers; SQL rejects fractional/negative/noncanonical amounts and invalid currency codes. Domain arithmetic uses bigint. The transaction wrapper retries only serialization/deadlock failures, at most four total attempts, and requires database-only callbacks.

The pinned adapter retains a startup pool lease and its destroy method does not terminate the pool. The isolated test driver tracks public acquire/release events for fixture shutdown. Runtime pool size is eight, with capacity reserved for the startup connection. Supabase's hosted pooler and Vercel connection behavior remain unverified and require Task 27.

Run `pnpm db:migrate` for the guarded local target, `pnpm test` for the current suite, `pnpm build` for the optimized build, and `pnpm dev` for the app on port 3042. Task 02 originally exposed a foundation placeholder; Tasks 06–09 now provide the public pages and local customer-access/history flows. Booking checkout and external providers remain later work.

## Identity boundary — November 14, 2026

Staff and customer identities use separate Payload collections and immutable UUIDs. The same-browser cookie prefix is shared deliberately: signing in as a customer replaces the browser's staff identity. Actual browser tests prove the switch, HttpOnly cookie behavior, current principal lookup, private API caching, logout revocation and deactivation. Customer ownership checks also bind the collection, so matching UUIDs in different identity collections do not confer access.

Payload's native first-register endpoint can create a first user despite ordinary collection create permissions. The application gateway blocks first-register for both collections, including encoded paths, and blocks the initial-admin screen. Mutating browser API requests require the configured origin. Unused GraphQL access is disabled. These restrictions were checked against HTTP requests, not inferred from the collection configuration.

Staff bootstrap is a separate local operator command: configure `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` and a strong `BOOTSTRAP_ADMIN_PASSWORD` in protected local settings, then run `pnpm staff:bootstrap`. The default operator email is codeboxstudios.official@gmail.com, but no real account was created by this implementation pass. The command only permits the dedicated local target, refuses existing staff and atomically saves the first developer account with its audit entry. It does not print credentials or permit hosted bootstrap.

Email/password with verification is a local candidate, not a production-method selection. Production customer authentication remains disabled unless its method is explicitly configured after the decision. Task 08 added local registration and recovery candidates. Unrestricted profile writes, approved historical claims and actual transactional email remain gated or later work. An unconfigured email adapter now fails closed instead of printing private verification/reset links to console. Recovery is unavailable until a transport is configured.

Current browser coverage uses Chromium on desktop and Pixel 7 emulation. Safari/WebKit and actual devices remain release/UAT checks. Recovery quarantine defaults to blocking protected routes; the complete restoration/reconciliation procedure remains Task 26.

## Protected logs — November 14, 2026

Staff mutations and required action logs now use the same Payload transaction. Tests inject a real PostgreSQL audit-insert failure and prove that staff account creation and configured room-label edits roll back. Staff sign-in/out, sensitive reads, successful exports, failed/refused requests and gateway denials are recorded. Automatic events retain System attribution. Central collection validation rejects passwords, private tokens and guest contact profiles even through privileged Local API writes.

Only developers can read/search/export the action log. Generated endpoints, counts/versions, custom CSV access and attempted historical edits were checked through real HTTP requests. The database also rejects updates/deletes of old entries; corrections append. No maintenance/retention deletion policy was selected.

`GET /api/developer/audit` supports action/type filters and cursor pagination. `format=csv` exports the selected page, up to 100 entries; the filename identifies it as a page and `X-Next-Cursor` exposes continuation when present. Each export records a separate audit event. This is a protected API foundation; the final staff/developer workspace remains a later task.

Payload caches collection callbacks across Next bundles and development reloads. The in-process request capability registry therefore uses a process-wide WeakMap, shared by those callbacks; external JSON cannot supply its process-owned capability keys. The Task 07 correction below explains how permission-check proxies are supported. A real gateway test caught an earlier module-local registry mismatch, and the combined browser suite passed after the correction. Next incoming-request logging is disabled so private link URLs are not printed by the development server.

During migration development, an empty audit placeholder was applied to the isolated test database before its body was finalized. Its test-only migration marker was repaired with explicit database/trigger guards, then the real migration was applied and retested. No shared/production migration or guest data was reset. `20261114_035520_audit_immutability` is now applied to the local development/test targets with the append-only trigger.


## Commit acknowledgement correction — November 14, 2026

Task 07 concurrency testing exposed commit-time errors swallowed by the pinned database adapter. Two real PostgreSQL regressions now prove that aborted transactions are never acknowledged, and serialization failures raised at COMMIT retry to a durable result. The required pnpm patch and its limits are recorded in the [transaction fix](../architecture/2026-11-14-transaction-commit-fix.md). The earlier callback-conflict proof did not cover this later failure.


## Durable outbox and work leases — November 15, 2026

Task 13 connects authentication-delivery and enquiry producers to the typed transaction-owned enqueue function. Committed work survives a fresh application context; rolled-back producer commands leave no work. Matching semantic keys reuse intent, including concurrent producers, while changed payloads are refused. Lease credentials are random and stored only as digests. Completion checks the live owner/generation/deadline before executing database effects, then commits those effects, work status and audit together.

Expired undispatched work and repeatable reconciliation can be reclaimed. A possibly dispatched checkout/refund/mail request becomes uncertain and cannot be blindly replayed. Retry limits/backoff and failed/uncertain listings support operator escalation; only developer authority can replay safe work, and completed work is immutable. PostgreSQL guards protect identity, generations and terminal transitions independently of the application path. The protected HTTP runner rejects browser identity, unknown request fields and unconfigured transports.

Validation: all 148 automated checks and all 60 Chromium desktop/mobile checks passed, including 11 new queue integration cases and authenticated runner HTTP checks. Lint, TypeScript, development migration and optimized build passed. No provider or email request was sent. Decision 10 must still approve actual limits, cadence, external runner, alerts and an operator; subsequent tasks must register tested transports, and Task 26 must provide restore-wide external fencing. See the [operational rules and implementation bounds](deployment.md#scheduled-work-and-payment-recovery).


## Atomic booking preparation — November 15, 2026

The checkout command now commits the booking, accepted quote consumption, whole-stay physical allocation, optional account-offer reservation, immutable payment attempt/reference, creation work and required log together. Tests inject a database failure at each write and verify complete rollback with no provider dispatch. Concurrent matching keys reuse one result; changed input, foreign browsers and quote reconsumption are refused. Room/last-offer races remain atomic with either one or two available rooms.

Existing payable/unknown operations retain their original total, deadline and identity after quote expiry or changed active policy. Guest login after preparation preserves null ownership and its frozen attempt; verified login before creating a new booking may own that prospective booking. Approved zero totals confirm with permanent allocation, code, consumed offer when applicable and mail intent, without a payment attempt. Retrying a terminal zero-total booking cannot reconfirm it. PostgreSQL separately protects receipts, outstanding booking context and immutable attempt/provider associations.

Task 14 validation: all 165 automated checks, including 17 focused checkout cases, and all 62 Chromium desktop/mobile checks passed. Real HTTP checks cover guest preparation/replay, contact/reference privacy, financial tampering and foreign-browser refusal. Lint, TypeScript, local migration and optimized build passed. No Maya or mail request was sent. The full guest UI, registered transport, verified payment lifecycle, safe hold expiry, actual notifications and production policy approval remain subsequent work. See [checkout inputs, idempotency and operating limits](deployment.md#atomic-checkout-preparation--november-15-2026).


## Maya transport boundary — November 15, 2026

The server adapter isolates exact one-time Checkout creation, payment/reference retrieval, and capability-gated void/refund requests. It validates keys/environments/hosts, emits exact decimal money tokens, bounds response size/waits, preserves every payment from a reference lookup and never automatically retries a POST. Malformed/lost results retain uncertainty and the original reconciliation identity. Provider bodies and private checkout URLs are not exposed in operational errors.

Current official source review caught obsolete remembered production API/checkout hosts; regressions pin `pg.maya.ph` and the documented returned payment hosts. Two other red regressions exposed contradictory payment-specific fields and a refund just beyond the 180-day elapsed limit; both now fail closed. Void/refund preflight re-retrieves the payment, checks actual provider/method/time/amount eligibility and conservatively accounts for remote pending/successful refunds. Local reservation/concurrency and complete ownership/recovery fences remain the owning later tasks.

Task 15 validation: all 184 automated checks passed, including 19 contract cases and a real loopback native-fetch HTTP exchange. Lint, TypeScript and optimized build passed. These tests use synthetic local responses. There is no environment-configured gateway or registered provider handler yet; no real Maya, refund or email request was sent. Public/customer UI did not change in this task; its latest 62 desktop/mobile checks are the Task 14 run. [Source contracts and remaining merchant/release gates](../architecture/2026-11-15-maya-contract.md) distinguish current guides/plugin evidence, older supplementary API material and unverified live behavior.


## Checkout dispatch and private status backend checkpoint — November 15, 2026

Task 16 remains in progress. Its internal dispatch command now verifies the started work lease, current operational approval and frozen booking/quote/customer/contact/price/revision/deadline context before creation. It stores canonical uncertainty and a reconciliation intent before calling the gateway outside the database transaction. A ready association is applied only through live fenced completion. Lost or late results cannot dispatch another create or overwrite a newer worker; holds remain occupied pending a verified outcome.

Internal status helpers use a separate checkout-status capability, purpose-bound token digest, original browser and issuing customer checks, fixed approved lifetime, revocation and bounded polling. General booking-view credentials and public booking IDs do not grant status access. Nonzero confirmation also requires matching canonical collection evidence; a booking flag or redirect outcome alone is insufficient. A ready handoff atomically becomes pending with reconciliation/audit work, so only one of concurrent handoffs succeeds. Pending does not mean paid.

Migration `20261115_212448_checkout_status_dispatch` adds scoped view fields, a nullable immutable draft command key and a one-time provider environment association. Existing records retain their historical purpose; customer references restrict deletion and SQL guards prevent scope changes or unrevocation. The draft command key column is not yet connected to the draft UI/API. Status values use an explicit approved `checkoutStatus` policy section; the local fixture is not a production operating decision.

Checkpoint validation: all 195 automated checks passed, including 11 dispatch/status integration cases, real handoff concurrency, stale completions, browser/customer isolation, expiry/revocation, polling limits and SQL scope protection. Lint/typecheck, the local development migration and optimized build passed. No provider request was sent; injected gateways supplied synthetic outcomes. The latest public/customer browser run remains the 62 Task 14 checks because this checkpoint introduces no UI changes.

The subsequent Task 16 implementation supersedes the checkpoint's unfinished HTTP/UI wiring. It does not establish a live Maya integration.

## Checkout review, recovery and handoff — November 15, 2026

Guest checkout remains available alongside optional account login. Final contact requires name/email/phone; separate staying-guest details and requests are supported. New quotes freeze approved public terms. Review shows the exact server total and account/contact/guest distinctions, defaults offers to none, and resets agreement after repricing. Partial drafts remain permissive for login continuity.

One server-minted immutable draft key survives resumed tabs. Concurrent matching submissions reuse one booking. Private command recovery reopens the original receipt after a lost response; only opaque references are stored in browser continuity. Per-booking HttpOnly cookies grant fixed-expiry status access bound to the original browser and issuing account. The parent browser nonce lasts uniformly 24 hours to avoid later responses shortening another tab's access; child grants retain their own fixed approved expiry. Logout clears private continuity and notifies other tabs.

Environment/capability checks register the create-checkout worker only when configured. Outside isolated tests, missing configuration refuses fresh paid preparation; approved zero totals need no provider. Native handoff verifies access, marks the original ready attempt pending with reconciliation/audit intent and returns a validated no-referrer redirect. The payment document uses a same-origin referrer policy to retain the Origin on form submissions without disclosing a referrer to the provider. Return outcomes never mark money paid. Polling is bounded, pauses in hidden tabs and distinguishes preparation, ready, checking, closed and canonical confirmation.

The handoff browser test initially exposed a real null-Origin refusal and then a test interception defect: Playwright routing did not intercept a later external redirect hop. The corrected test inspects the real local 303 with redirects disabled, then supplies a synthetic page. Earlier runs opened a synthetic-ID sandbox payment page but sent no checkout-creation/payment request or guest profile. This is not real merchant verification.

Validation: all 202 automated checks in 24 files and all 76 Chromium desktop/mobile checks passed. Lint, TypeScript, diff whitespace and optimized build passed. Browser checks cover zero-total confirmation, required phone and terms, offer repricing, separate account/contact/guest details, lost rooms, concurrent tabs, lost-response recovery, private HTTP access, native handoff and unverified redirect returns. Desktop/320-pixel mobile review and confirmation screenshots were inspected in Day/Night themes, with reduced motion and keyboard agreement/confirmation. Local optimized runtime on port 3042 returned the guest contact form with private/no-store headers. This does not establish Safari/real-device behavior, email delivery, a payment collection, live merchant capabilities or production deployment. Tasks 17–29 remain.

## Authenticated durable Maya inbox — November 15, 2026

Task 17 adds Signature V1 verification against two distinct, environment-pinned RSA keys and a bounded timestamp window. It follows Maya's sorted flattened-object contract, rejects ambiguous/duplicate JSON, and stores only normalized payment facts with separate semantic/delivery digests. Canonicalization deliberately treats insignificant JSON whitespace alike. Timestamp headers are not part of Maya's published signed input; persistent semantic deduplication is essential to replay safety.

A valid delivery commits immutable evidence, one repeatable payment-observation work intent and the required audit in one transaction before acknowledgement. Invalid messages cannot mutate payments. Lost acknowledgement after commit, process/client restart and competing deliveries all reuse the original receipt/work. Fabricated in-process observations and anonymous ingestion are refused. SQL guards independently refuse evidence edits/deletion and changes to processed evidence. Processing and booking confirmation remain Task 18.

Validation: all 212 automated checks in 26 files passed, including six signature contracts and four durable-inbox cases. Lint, TypeScript, the development migration and optimized build passed. A real local HTTP request to the unconfigured endpoint returned private/no-store 503. The latest UI suite remains the 76 Task 16 browser checks; no UI changed here. Actual merchant key installation, inbound subscription/IP controls, rotation, signed delivery and quarantine recovery are not verified by these local tests. Source/configuration details are in the Maya contract and deployment guide.
