# Implementation progress

Started November 13, 2026, following the user's instruction to implement the reviewed full plan. The user permits commits and pushes directly to `main`. No feature branches or worktrees are used.

## Current state

- Task 01: application foundation implemented. Next.js 16.4.6, Payload 3.93.0, React 19.3.1, TypeScript 5.9.3 and pnpm 12.5.1 are locked.
- Foundation validation: 19 unit tests passed after five intended positive-path failures; lint and TypeScript checks passed. Application build remains part of Task 02 after migrations.
- Dedicated local PostgreSQL container and persistent volume created through `compose.yaml`; other containers were preserved. This is not a Supabase connection or production proof.
- Task 02: PostgreSQL transaction/exclusion proof implemented. Twelve integration checks pass, including six injected rollback stages, exact large amounts, direct SQL rejection, last-room concurrency, serializable retry, fresh migrations and preservation of existing records during upgrade. The optimized Next build, lint and TypeScript checks passed.
- Tasks 03–29 remain pending. Next is customer/staff authorization and protected action logging.

## Decision status

Implementation authorization approves work on the plan. It does not supply rates, cancellation terms, offer values, merchant credentials, real property content or recovery ownership. Those gates remain explicit. Design, booking baseline and customer-login preferences were requested while independent foundation work proceeds.

Native inline execution was chosen for this run. Shared types and transaction contracts stay under one implementer; the workflow requires an independent final review. The existing current-upstream Payload template used a viewport helper absent from pinned 3.93.0, so the scaffold uses standard Next viewport metadata with the installed official RootLayout.

## Local setup

Run `pnpm install`, `pnpm local:setup`, then `docker compose up -d database`. The setup command creates a protected local `.env` only when one does not exist. It never replaces existing settings. Database migrations, development seeding and the website startup are recorded here when verified. Local credentials are not stored in this document.

No Maya/Brevo/media provider, deployment, production database or customer flow has been verified yet. The original implementation-plan verification record remains a historical document-only check.

## Database proof — November 14, 2026

Migrations `20261114_030322_foundation` and `20261114_030640_reservation_guards` were generated/reviewed and applied to the dedicated local development and isolated test databases. Schema push remains disabled. Physical room allocations use UUID relationships, canonical UTC-midnight date markers and a PostgreSQL GiST exclusion on half-open property-date ranges. Every supported write path must carry the same Payload request transaction; the server capability cannot be supplied through JSON.

Canonical amount strings preserve values beyond JavaScript safe integers; SQL rejects fractional/negative/noncanonical amounts and invalid currency codes. Domain arithmetic uses bigint. The transaction wrapper retries only serialization/deadlock failures, at most four total attempts, and requires database-only callbacks.

The pinned adapter retains a startup pool lease and its destroy method does not terminate the pool. The isolated test driver tracks public acquire/release events for fixture shutdown. Runtime pool size is eight, with capacity reserved for the startup connection. Supabase's hosted pooler and Vercel connection behavior remain unverified and require Task 27.

Run `pnpm db:migrate` for the guarded local target, `pnpm test` for the current suite, `pnpm build` for the optimized build, and `pnpm dev` for the app on port 3042. The public page remains a foundation placeholder; the full website is not yet implemented.
