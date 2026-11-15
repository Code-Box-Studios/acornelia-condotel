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
- Tasks 11–29 remain pending. Exact server pricing, approved policy resolution and accepted quote snapshots are next.

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
