# Acornelia Full Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Acornelia guest website, optional customer accounts and offers, booking/payment system, staff workspace and operating safeguards.

**Architecture:** One Next.js/Payload application at this repository root, with Supabase PostgreSQL as the shared database. Domain commands own reservations, offers and money transitions; Payload manages configured content and identity. Short database transactions, durable work records and isolated provider adapters connect those commands to Maya and Brevo.

**Tech Stack:** Next.js, TypeScript, React, Payload, PostgreSQL, Vercel, Brevo and Maya; proposed test tools are Vitest and Playwright. The pinned planning baseline is listed below.

**Spec:** [Full website and booking specification v2](2026-11-05-acornelia-website-plan.md). Executors must read both documents and the [operations guide](../../operations/deployment.md).

**Status:** Complete implementation proposal for user review, November 13, 2026. No site scaffolding, package installation, database migration, provider provisioning or application build is authorized by this planning pass. Implementation starts only after the user reviews the plan and chooses how to execute it.

## Global Constraints

- Work directly on `main`; do not create branches/worktrees or discard existing changes. Existing documentation, `.lavish/` previews, exports and secrets/configuration remain intact.
- Guest checkout remains available. Payload customer accounts are optional and never grant staff/developer rights.
- Customer history is private. Account offers are available to every customer with an account, subject to approved conditions.
- Existing-email checkout invites optional login. Exact normalization establishes matching, not identity; fuzzy matching cannot link bookings.
- Automatic confirmation requires matching verified payment and a valid allocation. Redirects/screenshots/browser closure do not decide payment state.
- Website, phone and walk-in bookings share inventory; the database rejects overlapping physical-room allocations.
- Active/uncertain payment attempts retain accepted price, currency, purpose, revision and offer context.
- Admin action logs are developer-only, immutable through app screens and committed with successful staff changes.
- Confirmations copy `codeboxstudios.official@gmail.com` for now. Authentication/claim tokens never enter that CC or logs.
- Supabase is selected for PostgreSQL, not Supabase Auth. Brevo, Maya and Vercel remain selected. Storage and scheduled execution still require Decision 10.
- Financial/allocation/redemption collections have no public or ordinary staff CRUD bypass. Server commands enforce foreign keys, unique identities, exact money and allowed state/revision transitions.
- Every schema-owning task generates/reviews its migration and runs it on the isolated database before green checks; schema push stays disabled.
- Preserve all 38 specification acceptance requirements. A document/test fixture is not production evidence.
- Resolve the affected specification Decisions 01–11 before implementing their business behavior. Plan approval does not silently approve those answers, prices or commercial scope.

## Review Focus

1. Adjacent nights, property midnight and non-default timezones: correct occupancy and event filtering, never browser-local date assumptions. Tests: Tasks 07, 10, 11.
2. Same-browser staff/customer switching, reused/shared email and competing historical claims: no privilege or ownership transfer. Tests: Tasks 03, 08, 09, 25.
3. Two tabs, lost provider responses and duplicate/late callbacks: one valid booking, immutable payable context and visible money exceptions. Tests: Tasks 14–19, 23.
4. Last voucher use, offer withdrawal during payment and zero totals: limits hold, accepted context survives and undefined free-booking paths stay disabled. Tests: Tasks 12, 14, 18, 22.
5. Crashes, expired worker leases and database restore after a refund/password change: no repeated external effect or revived credential/link. Tests: Tasks 13, 23, 26.

---

## 1. Current repository and plan boundaries

The workspace currently contains documents, static design prototypes and review exports. A fresh inspection found no `package.json`, lockfile, `src/` application, Next configuration or Payload configuration. Node `24.22.1` and pnpm `12.5.1` are installed. The graft graph is empty; it does not establish an application foundation.

All application paths and commands below are proposed future deliverables. Task 01 creates their scripts; none of its application commands has been run in this planning pass. Existing mockups inform visual design but are not migrated wholesale as production logic. Do not deploy a design switcher, review role selector, sample prices or fictional property data as the finished site.

This is one master plan with linked workstreams. The public site/CMS can reach an independently testable preview after the shared foundation. Transactional booking, identity and offers share contracts and must be integrated in the dependency order rather than implemented as unrelated systems.

### Review and decision gates

| Gate | Required result | Tasks it blocks |
| --- | --- | --- |
| Plan review | User checks this plan and selects execution method. | Every implementation task. |
| Technical proof | Pinned Payload/PostgreSQL transaction, constraint, migration and pooling proof passes. | Financial/inventory feature construction after Task 02. |
| Booking policy | Decisions 01–04 approve the proposed property/stay model, prices, payment/hold and change/refund rules. | Tasks 10–11, 14, 18–19, 21–23. |
| Customer policy | Decision 05 approves login/recovery/claim evidence and third-party authority. | Production customer flows in Tasks 03, 08–09, 25. |
| Offer policy | Decision 06 approves calculation, limits, expiry, late/reinstatement and zero-total rules. | Production offers in Tasks 12, 14, 18, 22–23. |
| Content and operations | Decisions 07–10 approve recipients, staff powers, one production design, content, storage, runner and recovery ownership. | Relevant Tasks 04–07, 13, 20, 24–27. |
| Baseline and release | Decision 11 reconciles requested additions, cost/schedule, versioned acceptance and handover. Actual provider readiness and all acceptance evidence pass. | Production release in Tasks 28–29. |

The proposed starting product is single-property overnight stays, one room per online checkout and full payment. If the approved product differs, revise affected tasks and interfaces before execution; this plan is not an implicit multi-room/deposit/hourly implementation. Pure technical tests use explicitly synthetic policies and cannot supply live defaults.

### Proposed pinned technical baseline

Checked against official registry metadata and framework documentation on November 13, 2026. These are implementation proposals, not installed dependencies or a proven build.

| Component | Proposed version |
| --- | --- |
| Node / pnpm | `24.22.1` / `12.5.1`, matching the observed tools |
| Payload and `@payloadcms/next`, `db-postgres`, `richtext-lexical`, `email-nodemailer` | `3.93.0` together |
| Next.js | `16.4.6` |
| React / React DOM | `19.3.1` together |
| TypeScript / GraphQL | `5.9.3` / `16.11.0` |
| Vitest / Playwright | `5.1.0` / `1.65.0` |
| Zod | `4.6.7` |

Payload's published Node requirement is `^22.23.4 || >=24.22.1`; its current `@payloadcms/next` package permits the proposed Next release. Check the complete peer set, lock it and prove it in Task 01 rather than independently upgrading packages. TypeScript 5.9.3 is deliberately proposed instead of adopting the new TypeScript major without a compatibility proof. [Payload installation](https://payloadcms.com/docs/getting-started/installation), [Payload registry](https://registry.npmjs.org/payload/latest), [Next integration peers](https://registry.npmjs.org/@payloadcms%2fnext/latest).

Proposed email transport is the official Payload Nodemailer adapter through Brevo SMTP, serving selected auth messages and queued booking messages. This transport still needs approval/configuration; HTTPS requires a compatible adapter and a revised transport task. Storage is a gated adapter decision, not a selected new vendor. Vercel Cron calling a protected short runner is a proposed execution option; no persistent serverless worker or `autoRun` is assumed. [Payload Jobs](https://payloadcms.com/docs/jobs-queue/overview).

## 2. File ownership and shared contracts

### Proposed application structure

| Path | Responsibility |
| --- | --- |
| `src/app/(site)/` | Public/customer pages. No duplicate client pricing or authorization logic. |
| `src/app/(payload)/` | Official Payload admin/API integration; privileged views remain protected. |
| `src/app/api/booking/`, `api/webhooks/maya/`, `api/internal/work/` | Narrow custom HTTP boundaries; distinct from collection CRUD. |
| `src/payload/collections/`, `globals/`, `access/`, `hooks/` | Configured content/identity and protected record access. |
| `src/domain/shared/`, `policy/`, `db/` | IDs, dates, exact money, approved policy and one transaction adapter. |
| `src/domain/inventory/`, `quotes/`, `offers/`, `bookings/`, `payments/`, `changes/`, `refunds/` | Financial and reservation commands; no provider HTTP inside database transactions. |
| `src/domain/work/`, `audit/`, `claims/`, `privacy/` | Durable work, logs, ownership claims and controlled retention. |
| `src/content/`, `src/features/auth/`, `src/features/customer/` | Published projections, sessions/handoff and customer DTOs. |
| `src/integrations/maya/`, `src/email/`, `src/media/` | Provider interfaces and approved adapters. |
| `src/admin/`, `src/components/`, `src/styles/` | Staff views and presentation using the selected design. |
| `src/migrations/` | Payload-generated/reviewed schema migrations and explicit constraints. |
| `tests/unit/`, `integration/`, `contract/`, `e2e/`, `sandbox/`, `recovery/` | Distinct evidence classes with isolated fixtures. |
| `scripts/`, `docs/operations/` | Approved provisioning/import/verification tools and actual runbooks. |

Task file lists are authoritative proposed paths. Framework-generated Payload route/support files must be recorded exactly when generated. A migration timestamp is captured from the CLI output, not invented in advance. Configure/prove UUID identity in the adapter; revise the shared ID contract at the technical gate if unsupported rather than mixing numeric and UUID ownership keys. Application migrations are owned by Payload; do not run a competing Supabase migration history for the same tables.

### Types and interfaces

Task 01 defines `src/domain/shared/types.ts`, `money.ts`, `dates.ts`, and `src/domain/policy/types.ts`. Task 02 defines `src/domain/db/types.ts` and `tests/support/harness.ts`.

```ts
type Id = string; // proposed UUID identity, never an email ownership key
type PropertyDate = string; // validated YYYY-MM-DD in the approved property calendar
type Instant = string; // validated UTC instant
type Money = { minor: string; currency: string }; // canonical whole-centavo integer text

type Principal =
  | { kind: 'anonymous' }
  | { kind: 'customer'; collection: 'customers'; id: Id }
  | { kind: 'staff'; collection: 'staff-users'; id: Id; role: 'staff' | 'developer' }
  | { kind: 'system'; purpose: 'payments' | 'work' | 'email' | 'recovery' };

type Result<T, E extends string> = { ok: true; value: T } | { ok: false; code: E };
type PolicySnapshot = { id: Id; revision: number; approvedSections: string[]; sections: Record<string, unknown> };
interface Clock { now(): Instant; today(timezone: string): PropertyDate }
interface UnitOfWork { run<T>(actor: Principal, work: (tx: DbTx) => Promise<T>): Promise<T> }
type CommandContext = { actor: Principal; policy: PolicySnapshot; clock: Clock; uow: UnitOfWork; requestId: Id };
```

`DbTx` carries the documented Payload request/transaction context; repositories must propagate it. Task 02 proves the exact exported type for the pinned adapter. Do not assume unrelated `payload.db.drizzle` queries join that transaction. Domain calculation uses `bigint` internally and serializes minor units as strings; Payload fields/SQL checks must preserve canonical integer values. Prove the actual date and amount column mapping in Task 02 before retaining it. No floating-point multiplication decides money.

Each feature owns a `types.ts`: `QuoteSnapshot` includes version, stay, components, total, policy/offer snapshots and eligibility context; `CheckoutInput` includes quote/version acceptance, draft reference and idempotency key; `PaymentObservation` includes unique provider payment identity, environment/reference, semantic status and exact amount/currency; `WorkLease` includes job identity, generation and expiry. `BookingPage`, `PostPage`, `ClaimEvidence` and `RefundInput` are defined by their owning tasks below, not inferred from client fields.

`tests/support/harness.ts` supplies `createHarness(options): Promise<TestHarness>` with isolated migrated PostgreSQL, `seed(collection, values)`, `rows(collection, where)`, `ctx(actor)`, a controllable clock, fault injection and `close()`. `tests/support/policies.ts` supplies `syntheticPolicy(overrides)`; fixtures are never accepted as production approvals. Assertions below are the required test core; their test file sets up the specified fixtures through this harness. Provider fakes implement the same interfaces as real adapters.

### Transaction and schema rules

- Proposed initial isolation is SERIALIZABLE, with bounded retries of the entire database transition. Provider calls never run inside the retry body. Prove isolation/error propagation with the selected pool and adapter before depending on it.
- Use documented Payload begin/commit/rollback and propagated `req.transactionID` for core writes. Customer/staff Local API operations carry the actor and `overrideAccess: false`; narrowly authorized system repositories have a distinct capability. [Payload transactions](https://payloadcms.com/docs/database/transactions), [Local API controls](https://payloadcms.com/docs/local-api/access-control).
- One allocation table covers holds, confirmed stays and blocks with half-open room/date intervals. A migration installs overlap rejection with room equality plus interval intersection and explicitly unreleased state. Do not use `now()` in an index/constraint predicate; expiry safely changes allocation state.
- Verify `btree_gist`, real date/range mapping, integer checks and generated-schema compatibility. If the public adapter cannot satisfy them, stop at Task 02 with a concrete alternative for review; do not bypass constraints or use undocumented transaction internals. [PostgreSQL ranges](https://www.postgresql.org/docs/current/rangetypes.html), [Payload migrations](https://payloadcms.com/docs/database/migrations).
- Enforce unique command key plus request fingerprint, merchant attempt reference, provider payment identity, semantic confirmation task and claim attachment. Same key with different input is a conflict, not reuse.
- Payment attempts and actual payment transactions are separate: one merchant lookup can return multiple provider payments. Preserve every collection; apply booking confirmation once and flag extras.
- Successful staff mutation and audit commit together. Booking confirmation and its email intent commit together. Refund authorization reserves capacity before the network call.
- Keep schema push disabled on the constraint-managed database and apply reviewed migrations. Never run a reset/fresh command against shared or production data. [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

## 3. Commands to establish during implementation

Task 01 registers these scripts. They are planned commands and have not run here.

| Command | Planned contract |
| --- | --- |
| `pnpm dev` / `pnpm build` | `next dev` / `next build`; build does not charge, send messages or apply migrations. |
| `pnpm lint` | ESLint scoped to new app/test/script paths; preserve existing review artifacts. |
| `pnpm typecheck` | `tsc --noEmit` with generated Payload types. |
| `pnpm test:unit <file>` | Vitest unit config; no live database/provider network. |
| `pnpm test:integration <file>` | Vitest integration config against an explicitly approved isolated test database. |
| `pnpm test:contract <file>` | Provider fixtures/HTTP contract tests; no live charges. |
| `pnpm test:e2e <file>` | Playwright with controlled app/test services and synthetic data. |
| `pnpm test:sandbox <file>` | Opt-in authorized Maya/Brevo sandbox checks; fail on production environment. |
| `pnpm test:recovery <file>` | Isolated restore/fencing exercises; never overwrites live data. |
| `pnpm payload migrate:create <name>` | Generate migration; capture the real path/name, review SQL and constraints. |
| `pnpm db:migrate` | Payload migrate under a target-verification wrapper; separate from ordinary build. |
| `pnpm verify:acceptance` | Check all 38 requirements have recorded evidence for the release revision/environment. |

Every task uses a meaningful red/green cycle, reviews its scoped diff and commits only its own files and relevant documentation on `main`. Never stage unrelated existing work with `git add .`. Expected failures below are future test expectations, not results observed in this planning pass.

## 4. Workstreams and dependency order

| Workstream | Tasks | Independently reviewable result |
| --- | --- | --- |
| Foundation | 01–04 | Pinned app/test foundation, proven database transactions, roles and protected audit. |
| Public site and CMS | 05–07 | Selected responsive public design and persistent authorized publishing/enquiries. |
| Customer accounts | 08–09 | Optional access, checkout handoff, private history and approved claim workflow. |
| Reservation and finance | 10–23 | Inventory, quotes/offers, durable checkout, verified payments/email, direct bookings, changes/refunds. |
| Operations and release | 24–29 | Staff workspace, privacy/recovery, provider validation, UAT and controlled release. |

Public/content work can run alongside domain work after shared interfaces stabilize. Customer/offer financial writes share the same transaction engine. Do not parallelize competing edits to shared schemas, policies or contract types. Finish an interface-owning task before consumers assume its shape.

## 5. Implementation tasks

### Task 01 — Establish the application, tools and policy gates

**Depends on:** Plan review. **Files:** `package.json`, `pnpm-lock.yaml`, `.node-version`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `payload.config.ts`, `.env.example`, `vitest.*.config.ts`, `playwright.config.ts`; `src/domain/shared/{types,money,dates}.ts`, `src/domain/policy/{types,parse}.ts`, `src/config/env.ts`; `tests/unit/foundation.test.ts`.

**Interfaces:** Consumes process configuration as `Record<string, string | undefined>`. Produces `parseEnvironment(input: Record<string, string | undefined>): AppEnvironment`, `parseApprovedPolicy(input: unknown, requiredSections: string[]): PolicySnapshot`, `parseMoney(input: unknown): Money` and `parsePropertyDate(input: unknown): PropertyDate` in the listed files.

**Named red test:** `rejects unapproved live policy and preserves exact minor units`. Its core assertions (fixture setup is the case described below):

```ts
expect(() => parseApprovedPolicy(syntheticPolicy(), ["booking"])).toThrow(); expect(parseMoney({minor:"9007199254740993",currency:"PHP"}).minor).toBe("9007199254740993");
```

- [ ] Record the approved starting product and version choices. Create root manifests and the scripts in section 3; lock the complete compatible dependency set. Use the official Payload integration files; record generated paths. Preserve existing review files and ignore only regenerable caches/output and secrets.
- [ ] Write tests for `parseEnvironment(input): AppEnvironment`, `parseApprovedPolicy(input, requiredSections): PolicySnapshot`, `parseMoney(input): Money` and `parsePropertyDate(input): PropertyDate`. Assert malformed dates, fractional minor units, missing production policy approvals, synthetic production fixtures and mixed provider environments fail; large integer amounts round-trip exactly.
- [ ] Run `pnpm test:unit tests/unit/foundation.test.ts`; observe failures for missing validators. A dependency/runner error must be fixed before treating a test as red.
- [ ] Implement the small pure validators and framework skeleton. Missing policies disable affected modules with explicit readiness errors; do not populate fabricated business defaults. No provider calls, migrations or messages occur during imports/build.
- [ ] Run the same test, `pnpm lint` and `pnpm typecheck`; record actual compatible versions and required generated types. Defer database-connected build evidence until Task 02 supplies its isolated database.
- [ ] Update the technology/setup docs with approved versions and variable purposes. Review the scoped diff and commit `chore: establish Acornelia application foundation` on `main`.

### Task 02 — Prove the database and transaction boundary

**Depends on:** 01; approved isolated PostgreSQL access. **Files:** `src/domain/db/{types,unit-of-work}.ts`, `src/payload/collections/{Bookings,Allocations,OfferAllocations,PaymentAttempts,PaymentTransactions,AuditEntries,WorkItems}.ts`; `src/migrations/` generated migration; `scripts/migrate.ts`, `tests/support/{harness,policies}.ts`, `tests/integration/transaction-proof.test.ts`.

**Interfaces:** Consumes Task 01 `Principal` and policy/date/money types. Produces `runSerializable<T>(actor: Principal, work: (tx: DbTx) => Promise<T>): Promise<T>` and `createHarness(options: HarnessOptions): Promise<TestHarness>`; `UnitOfWork.run` delegates to that transaction boundary.

**Named red test:** `rolls back the complete reservation after an audit fault`. Its core assertions (fixture setup is the case described below):

```ts
expect(await h.rows("bookings", {})).toHaveLength(0); expect(await h.rows("allocations", {})).toHaveLength(0); expect(await h.rows("work-items", {})).toHaveLength(0);
```

- [ ] Define `runSerializable<T>(actor: Principal, work: (tx: DbTx) => Promise<T>): Promise<T>` behind `UnitOfWork`. Write integration fixtures for critical records and real PostgreSQL migrations, with explicit database identity checks before setup/cleanup.
- [ ] Assert overlap rejection through direct writes; adjacent stays succeed; canonical amounts and dates survive storage. Inject failure after each booking/allocation/offer/attempt/audit/work write and assert every write rolls back. Concurrent commands must serialize or retry without partial effects.
- [ ] Run `pnpm test:integration tests/integration/transaction-proof.test.ts`; record failures before adding the constraint/adapter. No in-memory database substitutes for this proof.
- [ ] Use documented transaction IDs and awaited Local API calls. Review generated SQL, install `btree_gist`, constrain unreleased half-open room ranges, disable schema push and add required unique/check indexes. Prove the actual generated column types and the chosen direct/session-pool connection. Bound retries of database-only work; surface exhausted conflicts safely.
- [ ] Run the suite on a fresh migrated database and an upgrade fixture; run `pnpm build`. Record rollback/isolation/pooling results and real migration filenames. If a public adapter cannot support these invariants, stop dependent construction and present a concrete revised boundary for review.
- [ ] Update the operations proof record and commit `feat: prove atomic reservation storage`. Financial tasks depend on this measured exit, not merely a migration file.

### Task 03 — Establish staff and customer authorization

**Depends on:** 02; Decisions 05 and 08 for final identity/role behavior. **Files:** `src/payload/collections/{StaffUsers,Customers}.ts`, `src/payload/access/`, `src/features/auth/{principal,authorization}.ts`; `tests/integration/authorization.test.ts`, `tests/e2e/principal-switching.spec.ts`.

**Interfaces:** Consumes Task 02 `UnitOfWork`. Produces `resolvePrincipal(request: Request): Promise<Principal>` and `authorize(actor: Principal, action: Action, resource: AccessResource): void` in `principal.ts`/`authorization.ts`; `Action` and `AccessResource` are the explicit permission-matrix types owned here.

**Named red test:** `refuses customer admin access through every API boundary`. Its core assertions (fixture setup is the case described below):

```ts
expect(() => authorize(customer, "admin:enter", adminResource)).toThrow(); expect(customerResponse.status).toBe(403);
```

- [ ] Define `resolvePrincipal(request): Promise<Principal>` and `authorize(actor, action, resource): void`. Propose separate auth collections and restrict Payload admin to `staff-users`; confirm selected login/verification methods before their production implementation.
- [ ] Write generated REST/GraphQL, custom endpoint and Local API tests: customer self-registration cannot set role/ownership/verification fields; customers cannot enter admin; staff cannot grant developer rights. Exercise populated relationships, versions, search and protected fields.
- [ ] Run `pnpm test:integration tests/integration/authorization.test.ts` and `pnpm test:e2e tests/e2e/principal-switching.spec.ts`; observe authorization/session failures before adding controls.
- [ ] Implement secure cookie/session settings, origin/CSRF checks, bounded authentication attempts and actor checks at all boundaries, explicit `overrideAccess: false` for user-context Local API calls and tightly scoped server capabilities. Test actual cookie/session behavior across collections. Proposed baseline is one active principal per browser; switching must clear prior private state. Concurrent staff/customer sessions require a separately reviewed design if requested.
- [ ] Repeat both suites; assert no stale principal or cached private response remains after logout/switch, and account IDs rather than email determine access.
- [ ] Document the verified session model and bootstrap procedure without credentials; commit `feat: enforce customer and staff access boundaries`.

### Task 04 — Make protected action logs part of successful changes

**Depends on:** 02–03; Decision 08. **Files:** `src/domain/audit/{types,append,read}.ts`, `src/payload/hooks/audit.ts`, `src/app/api/developer/audit/route.ts`; `tests/integration/audit.test.ts`.

**Interfaces:** Consumes Task 03 `authorize` and Task 02 `DbTx`. Produces `appendAudit(tx: DbTx, entry: AuditInput): Promise<Id>` and `readAudit(ctx: CommandContext, filter: AuditFilter): Promise<AuditPage>` in the audit module; audit input/page/filter types live in `audit/types.ts`.

**Named red test:** `rolls back a successful staff edit when its log cannot save`. Its core assertions (fixture setup is the case described below):

```ts
expect(after.title).toBe(before.title); expect(adminLogResponse.status).toBe(403);
```

- [ ] Define `appendAudit(tx: DbTx, entry: AuditInput): Promise<Id>` and `readAudit(ctx, filter): Promise<AuditPage>`; safe input includes actor/action/record/outcome and permitted before/after fields, never raw request bodies.
- [ ] Write tests denying guest/admin reads and exports through every endpoint/relationship. Inject log failure into staff account creation and a CMS update; assert the mutation also rolls back. Assert developer screens cannot edit/delete previous entries.
- [ ] Run `pnpm test:integration tests/integration/audit.test.ts`; establish failing access/atomicity assertions.
- [ ] Add awaited hooks carrying the same transaction context, trusted System attribution, append-only corrections, and a separate refused/failed-attempt recorder. Cover sign-in/out, role changes, sensitive reads/exports and financial intent/result; redact secrets and complete guest/payment payloads.
- [ ] Repeat the suite, including a direct unauthorized request and fault during the log write. Verify operational reports cannot join private logs into their output.
- [ ] Document permissions/retention gates and commit `feat: add protected transactional action logs`.

### Task 05 — Configure public content and durable media

**Depends on:** 03–04; Decisions 09–10. **Files:** `src/payload/globals/{Property,SitePages,Policies}.ts`, `src/payload/collections/{Rooms,Media}.ts`, `src/content/{catalog,public-property}.ts`, `src/media/{types,store}.ts`; `tests/integration/public-content.test.ts`.

**Interfaces:** Consumes authorized content and Task 04 audit hooks. Produces `readPublicProperty(): Promise<PublicProperty>`, `readRoomCatalog(): Promise<PublicRoom[]>` and `MediaStore` in the listed modules; public DTOs omit private configuration and draft fields.

**Named red test:** `keeps draft-only media private and persists approved content`. Its core assertions (fixture setup is the case described below):

```ts
expect(draftMediaResponse.status).toBe(403); expect(reloadedProperty.name).toBe(savedProperty.name);
```

- [ ] Define sanitized `readPublicProperty(): Promise<PublicProperty>` and `readRoomCatalog(): Promise<PublicRoom[]>`; define `MediaStore.put/read/remove` with authorized upload, durable object identity and access class. Select the approved storage adapter before connecting it.
- [ ] Write tests for unpublished fields/media denial, required image descriptions and source/license records, permitted owner fields, persistent reloads and sanitized rich text. Object keys cannot confer public access to draft-only files.
- [ ] Run `pnpm test:integration tests/integration/public-content.test.ts`; verify the projections/access rules fail before implementation.
- [ ] Add configured fields, public projections, authorized preview and durable uploads. Use verified property material for release; keep sample content and generated-image provenance distinct. State that withdrawal cannot erase copies of previously public/shared media.
- [ ] Repeat the suite against the selected isolated storage integration; verify failed upload/delete leaves a recoverable record and no misleading published asset reference.
- [ ] Update storage/configuration and editing-scope docs; commit `feat: configure property content and durable media`.

### Task 06 — Build the selected public website

**Depends on:** 05; Decision 09. **Files:** `src/app/(site)/{layout,page}.tsx`, `rooms/[slug]/page.tsx`, `about/page.tsx`, `contact/page.tsx`, `events/page.tsx`, `policies/[slug]/page.tsx`; `src/components/{SiteHeader,SiteFooter,RoomCard,BookingSearch,ThemeToggle}.tsx`, `src/styles/`; `tests/e2e/public-site.spec.ts`.

**Interfaces:** Consumes Task 05 `readPublicProperty`/`readRoomCatalog`; produces the public routes and `BookingSearch` handoff `{roomTypeId?: Id; arrival: PropertyDate; departure: PropertyDate; occupancy: Occupancy}`. `Occupancy` is defined in `shared/types.ts` here from approved adult/child/guest rules.

**Named red test:** `keeps mobile booking and keyboard theme controls usable`. Its core assertions (fixture setup is the case described below):

```ts
await expect(page.getByRole("button", {name:/theme/i})).toBeVisible(); expect(horizontalOverflow).toBe(false);
```

- [ ] Map the chosen D-06, D-07 or D-08 direction to the existing Acornelia tokens and real content. Specify shared navigation, room imagery, room detail, contact/map, amenities, policies, loading/empty/error views and search handoff. Keep the original comparison prototype as a review artifact.
- [ ] Write phone/desktop checks for room discovery, booking-search state, keyboard menus, Escape closure/dialog focus return, visible theme control, both themes, reduced motion, readable forms and no horizontal overflow at 320px.
- [ ] Run `pnpm test:e2e tests/e2e/public-site.spec.ts`; observe missing pages/interactions.
- [ ] Build reusable presentation using the public catalog. Search passes validated dates/occupancy to the booking flow; it never invents availability or calculates a client-authoritative price. Add verified venue information, metadata, sitemap/robots, accessible image alternatives and approved contact links. The contextual mobile booking action is absent during checkout/payment and staff work. Review-only design/role controls do not enter production.
- [ ] Repeat the suite in both themes and inspect actual screenshots at mobile/desktop widths; verify navigation and layout with real keyboard input.
- [ ] Record selected-design implementation limits and commit `feat: build Acornelia public website`.

### Task 07 — Deliver persistent Stories, Events and enquiries

**Depends on:** 04–06; approved timezone, publication and enquiry policies. **Files:** `src/payload/collections/{Posts,Enquiries}.ts`, `src/content/posts.ts`, `src/app/(site)/updates/{page,[slug]/page}.tsx`, `src/app/api/enquiries/route.ts`; `tests/integration/publication.test.ts`, `tests/e2e/updates.spec.ts`.

**Interfaces:** Consumes Task 03 authorization, Task 04 audit and Task 05 media. Produces `listPosts(filter: PostFilter, cursor: string | null, today: PropertyDate): Promise<PostPage>`, `readPublishedPost(slug: string): Promise<PublicPost | null>` and `submitEnquiry(ctx: CommandContext, input: EnquiryInput): Promise<Id>`; types owned in `content/posts.ts`.

**Named red test:** `withdraws public detail and uses the property date boundary`. Its core assertions (fixture setup is the case described below):

```ts
expect(await readPublishedPost(withdrawnSlug)).toBeNull(); expect(upcoming.items.map(p => p.id)).toContain(todayEvent.id);
```

- [ ] Define `listPosts(filter, cursor, today): Promise<PostPage>`, `readPublishedPost(slug): Promise<PublicPost | null>` and `submitEnquiry(ctx, input): Promise<Id>`. PostPage is a public DTO with cursor/empty state; enquiries snapshot selected post title/date and permitted contact details.
- [ ] Test draft/save/preview/publish/withdraw across separate sessions; direct draft/media denial; escaped script input; required fields; All/Stories/Upcoming, result count and publication-date ordering in All; property midnight and today/past boundaries. Assert enquiries/publication never change room/payment counts.
- [ ] Run `pnpm test:integration tests/integration/publication.test.ts` and `pnpm test:e2e tests/e2e/updates.spec.ts`; record failures.
- [ ] Implement persistent authorized actions and required logs. Use an uncached publication-state gate for list/detail/preview and date-sensitive results; do not rely on stale-while-revalidate to withdraw content immediately. If caching is introduced, prove its invalidation separately. Queue enquiry delivery through Task 13/20 when available.
- [ ] Repeat suites after reload and withdrawal, and across the approved timezone date boundary. Test full detail readability, cross-page Updates navigation and clear no-results messages.
- [ ] Document publication/cache/media limits and commit `feat: publish stories events and enquiry workflow`.

### Task 08 — Add optional customer access and checkout continuity

**Depends on:** 03, 06; Decision 05. **Files:** `src/app/(site)/account/{login,register,recover,reset}/page.tsx`, `src/features/auth/{actions,checkout-handoff}.ts`, `src/features/booking/draft.ts`; `tests/e2e/customer-auth.spec.ts`, `tests/integration/checkout-handoff.test.ts`.

**Interfaces:** Consumes Task 03 identity and Task 06 search state. Produces `saveCheckoutDraft(input: CheckoutDraft): Promise<DraftRef>` and `resumeCheckoutDraft(ref: DraftRef, actor: Principal): Promise<CheckoutDraft>`; types in `features/booking/draft.ts`. Drafts carry no editable accepted-payment fields.

**Named red test:** `preserves guest draft after cancelled login without repricing`. Its core assertions (fixture setup is the case described below):

```ts
expect(resumed.stay).toEqual(saved.stay); expect(attemptAfter.amount).toEqual(attemptBefore.amount);
```

- [ ] Define `saveCheckoutDraft(input): Promise<DraftRef>` and `resumeCheckoutDraft(ref, actor): Promise<CheckoutDraft>` with short-lived, bound access and safe return paths. Implement only the approved login/recovery methods; email/password remains a proposal until selected.
- [ ] Test valid/invalid/expired recovery, verification, throttled generic responses, return-URL injection and account switching. Successful, failed and cancelled login must preserve dates/room/occupancy and entered details; an existing attempt keeps its accepted financial context.
- [ ] Run `pnpm test:e2e tests/e2e/customer-auth.spec.ts` and `pnpm test:integration tests/integration/checkout-handoff.test.ts`; establish failing flows.
- [ ] Add registration/login/logout/recovery and the email-entry login/continue-guest invitation. Use approved normalization and privacy-preserving copy; similar addresses never establish identity. The proposed neutral invitation for all email entries needs copy approval. Guest checkout remains a complete path.
- [ ] Repeat both suites with two tabs, back navigation and staff/customer switching. Capture mail in tests; actual auth transport is proven in Task 20. Never log private draft/reset links.
- [ ] Document the selected identity method and handoff behavior; commit `feat: add optional customer access and checkout handoff`.

### Task 09 — Deliver private history and approved booking claims

**Depends on:** 03, 08; Decision 05 historical/third-party evidence policy. **Files:** `src/features/customer/{bookings,types}.ts`, `src/domain/claims/{types,issue,attach}.ts`, `src/app/(site)/account/bookings/`, `src/features/booking/view-access.ts`; `tests/integration/customer-history.test.ts`, `tests/integration/claims.test.ts`.

**Interfaces:** Consumes Task 03 actor, Task 08 session and Task 02 transactions. Produces `listOwnBookings(ctx: CommandContext, cursor: string | null): Promise<BookingPage>` and `attachClaim(ctx: CommandContext, evidence: ClaimEvidence): Promise<Result<Id, ClaimError>>`; `ClaimError` is the four-code union in this task. View capabilities have a separate verifier in `view-access.ts`.

**Named red test:** `allows one approved historical claimant and no email inheritance`. Its core assertions (fixture setup is the case described below):

```ts
expect(successfulClaims).toHaveLength(1); expect(recreatedAccountHistory.items).toHaveLength(0);
```

- [ ] Define `listOwnBookings(ctx, cursor): Promise<BookingPage>` and `attachClaim(ctx, evidence: ClaimEvidence): Promise<Result<Id, 'expired' | 'used' | 'conflict' | 'insufficient-evidence'>>`. ClaimEvidence records approved proof, purpose and one-use token digest; possession of a public booking code/current matching email is insufficient.
- [ ] Test all booking/payment states and empty history, owner filters through API/relationships, email change and account recreation, reused/shared mailbox, two claimants racing, expired/reused tokens and copied booking-view links. Assert only one immutable owner can attach.
- [ ] Run `pnpm test:integration tests/integration/customer-history.test.ts` and `pnpm test:integration tests/integration/claims.test.ts`; observe failing privacy/claim assertions.
- [ ] Implement stable customer-ID ownership, separate booker/contact/staying-guest DTOs, atomic unclaimed attachment and conflict recovery under the approved evidence policy. Use fresh purpose-bound claim evidence; booking-view capabilities are independently revocable, scoped and distinct from claim/reset tokens.
- [ ] Repeat suites; verify newly registering a matching email never bulk-imports guest history. If evidence policy is unresolved, keep claims unavailable with an approved staff recovery route; do not ship an email-only substitute.
- [ ] Record claim/recipient authority and commit `feat: protect customer history and historical booking claims`.

### Task 10 — Establish physical-room inventory and availability

**Depends on:** 02, 04–05; Decisions 01–03. **Files:** `src/domain/inventory/{types,availability,allocate,blocks}.ts`, `src/payload/collections/{RoomTypes,RoomBlocks}.ts`, `src/app/api/booking/availability/route.ts`; `tests/integration/inventory.test.ts`.

**Interfaces:** Consumes Task 02 `DbTx`, Task 06 `Occupancy` and approved stay policy. Produces `findAvailability(ctx: CommandContext, stay: StayRequest): Promise<AvailableRoomType[]>`, `allocate(tx: DbTx, request: AllocationRequest): Promise<Allocation>` and `release(tx: DbTx, allocationId: Id): Promise<void>`; types owned in `inventory/types.ts`.

**Named red test:** `allows adjacent nights but only one overlapping allocation`. Its core assertions (fixture setup is the case described below):

```ts
expect(adjacentAllocations).toHaveLength(2); expect(overlappingSuccesses).toHaveLength(1);
```

- [ ] Define `findAvailability(ctx, stay): Promise<AvailableRoomType[]>` and internal `allocate(tx, request): Promise<Allocation>`/`release(tx, allocationId): Promise<void>`. Public room-type availability maps to physical units; do not promise an exact room unless approved.
- [ ] Test full-stay availability, adjacent stays, leap/month/year boundaries, maintenance blocks, two contenders for the last unit and direct writes attempting overlap. Holds, confirmed stays and blocks must compete in the same exclusion invariant.
- [ ] Run `pnpm test:integration tests/integration/inventory.test.ts`; record missing allocation/search behavior.
- [ ] Implement approved stay/capacity/cutoff checks and short transactional allocation. Use validated property dates and approved timezone; remove allocation only through state transitions. Removing a room/type from sale preserves its existing reservations and history; never combine different rooms across nights without approved agreement. Import preview requires validated opening inventory and produces no silent overrides.
- [ ] Repeat the suite with real parallel connections. Confirm staff/direct bookings cannot bypass constraints and public responses disclose no guest identity.
- [ ] Document inventory/import rules and commit `feat: enforce shared physical room availability`.
### Task 11 — Build exact server pricing and accepted quotes

**Depends on:** 10; Decision 02. **Files:** `src/domain/quotes/{types,calculate,issue,accept}.ts`, `src/payload/collections/{RatePlans,Quotes,PolicyVersions}.ts`, `src/app/api/booking/quotes/route.ts`; `tests/unit/pricing.test.ts`, `tests/integration/quotes.test.ts`.

**Interfaces:** Consumes Task 10 `StayRequest` and approved rate policy. Produces `quoteStay(ctx: CommandContext, request: QuoteRequest): Promise<QuoteSnapshot>` and `acceptQuote(ctx: CommandContext, quoteId: Id, version: number): Promise<AcceptedQuote>`; types in `quotes/types.ts`.

**Named red test:** `retains accepted price after a rate change`. Its core assertions (fixture setup is the case described below):

```ts
expect(reloadedAccepted.total).toEqual(originalAccepted.total); expect(changedPriceWithoutAcceptance.ok).toBe(false);
```

- [ ] Define `quoteStay(ctx, request): Promise<QuoteSnapshot>` and `acceptQuote(ctx, quoteId, version): Promise<AcceptedQuote>`. Snapshot dates, occupancy, components, exact total, currency, policy/rate/offer versions and acceptance; expose breakdown rather than editable totals.
- [ ] Test approved normal/special nights, stay limits, children/extras, fee/tax order, rounding, cutoff and invalid amounts. Edit rates after acceptance and assert the saved quote does not change; altered client totals/versions must fail.
- [ ] Run `pnpm test:unit tests/unit/pricing.test.ts` and `pnpm test:integration tests/integration/quotes.test.ts`; observe failing calculations/immutability.
- [ ] Implement pure integer calculations and immutable versioned storage. Connect offers only through the single quote calculator in Task 12. A changed price requires a newly presented and accepted quote; it cannot rewrite an active attempt.
- [ ] Repeat suites with property-date and large-value fixtures. Assert negative totals fail and zero is routed only to an explicitly approved path rather than a fabricated provider success.
- [ ] Record the approved formulas and commit `feat: calculate and preserve accepted booking quotes`.

### Task 12 — Add all-account offers and controlled usage

**Depends on:** 03–04, 09, 11; Decision 06. **Files:** `src/domain/offers/{types,evaluate,reserve,release}.ts`, `src/payload/collections/{Offers,OfferVersions}.ts`, `src/app/(site)/account/offers/page.tsx`; `tests/unit/offers.test.ts`, `tests/integration/offer-usage.test.ts`.

**Interfaces:** Consumes Task 11 quote components and Task 03 customer identity. Produces `evaluateOffer(ctx: CommandContext, quoteInput: QuoteRequest, offerVersion: OfferVersion): OfferEvaluation` and `reserveOffer(tx: DbTx, acceptedContext: AcceptedQuote): Promise<OfferAllocation>`; types in `offers/types.ts`, allocation changes internal only.

**Named red test:** `rejects guest redemption and protects the last offer use`. Its core assertions (fixture setup is the case described below):

```ts
expect(guestRedemption.ok).toBe(false); expect(successfulReservations).toHaveLength(1);
```

- [ ] Define `evaluateOffer(ctx, quoteInput, offerVersion): OfferEvaluation` and internal `reserveOffer(tx, acceptedContext): Promise<OfferAllocation>`. Encode the approved value/components/date/limit/stacking/rounding/expiry rules in versioned policy; every customer account sees current applicable offers.
- [ ] Test guest/code impersonation, protected discount fields, expired/inapplicable/exhausted benefits, minimum spend and last-use races. Test every approved failure/cancellation/refund/reissue outcome and explicit negative/zero handling.
- [ ] Run `pnpm test:unit tests/unit/offers.test.ts` and `pnpm test:integration tests/integration/offer-usage.test.ts`; establish failing eligibility/usage assertions.
- [ ] Implement authorized staff publication with logs, clear My Offers/empty states and shared quote evaluation. Reservations are internal to the booking transaction, never a publicly editable redemption endpoint. Account eligibility does not imply unlimited discounts, signup rewards, points or per-human identification.
- [ ] Repeat suites, including concurrent use by the same account and competing accounts. Prove repeated processing cannot consume or reinstate usage twice; current withdrawal does not reprice a payable accepted context.
- [ ] Document actual offer terms and commit `feat: add account offers and atomic usage rules`.

### Task 13 — Establish durable work, leases and outbox execution

**Depends on:** 02, 04; Decision 10 runner/limits. **Files:** `src/domain/work/{types,enqueue,claim,complete}.ts`, `src/app/api/internal/work/route.ts`, `src/integrations/work-runner.ts`; `tests/integration/work-leases.test.ts`.

**Interfaces:** Consumes Task 02 `DbTx`/clock and Task 04 audit. Produces `enqueue(tx: DbTx, intent: WorkIntent): Promise<Id>`, `claimWork(ctx: CommandContext, kind: WorkKind): Promise<WorkLease | null>` and `completeWork(ctx: CommandContext, lease: WorkLease, result: WorkResult): Promise<void>`; types in `work/types.ts`.

**Named red test:** `fences a stale worker after lease takeover`. Its core assertions (fixture setup is the case described below):

```ts
await expect(completeWork(ctx, oldLease, successResult)).rejects.toThrow(); expect(currentWork.generation).toBe(newLease.generation);
```

- [ ] Define `enqueue(tx, intent): Promise<Id>`, `claimWork(ctx, kind): Promise<WorkLease | null>` and `completeWork(ctx, lease, result): Promise<void>`. Every lease carries a generation/fencing token; semantic keys deduplicate intent.
- [ ] Test process death after commit, two workers, expired-lease takeover, stale completion, bounded attempts, dead-letter visibility and replay. A timeout after an external request must become an uncertain operation for reconciliation, not an automatic second money request.
- [ ] Run `pnpm test:integration tests/integration/work-leases.test.ts`; observe failing durability/fencing.
- [ ] Implement durable queue records and protected runner authentication, bounded batches, retries/backoff and operator escalation. Workers recheck recovery mode and operation ownership before dispatch. Use approved external scheduling; do not depend on background work surviving a serverless response or Payload `autoRun`.
- [ ] Repeat the suite across app restarts and stale-worker simulations. Ensure database retries contain no provider/email network calls and that expired leases cannot overwrite newer work.
- [ ] Document runner cadence, alert thresholds and replay rules; commit `feat: add durable outbox and fenced work execution`.

### Task 14 — Prepare checkout as one atomic command

**Depends on:** 08–13; approved booking/offer/hold policies. **Files:** `src/domain/bookings/{types,start-checkout}.ts`, `src/app/api/booking/checkout/route.ts`; `tests/integration/checkout-atomicity.test.ts`.

**Interfaces:** Consumes Task 10 allocation, Task 11 acceptance, Task 12 offer reservation and Task 13 enqueue. Produces `startCheckout(ctx: CommandContext, input: CheckoutInput): Promise<CheckoutResult>` in `bookings/start-checkout.ts`; typed result owns preparation/rejection/status references, never a client-supplied total.

**Named red test:** `rolls back room and offer together after partial preparation`. Its core assertions (fixture setup is the case described below):

```ts
expect(await h.rows("allocations", {})).toHaveLength(0); expect(await h.rows("offer-allocations", {})).toHaveLength(0); expect(providerCreateCalls).toBe(0);
```

- [ ] Define `startCheckout(ctx, input: CheckoutInput): Promise<CheckoutResult>`; result is `preparing`, `ready`, `checking` or a typed rejection. Persist command key plus input fingerprint, accepted quote, booking revision, room/offer allocations, immutable attempt/reference and dispatch work.
- [ ] Test same-key same-input reuse versus changed-input conflict, two tabs, last room plus last offer, login during payment and failure injected after each write. Assert rollback leaves no partial booking, usage, reference or outbound work.
- [ ] Run `pnpm test:integration tests/integration/checkout-atomicity.test.ts`; record failures.
- [ ] Implement the database-only command. Save the merchant reference before external creation; the HTTP adapter runs later. Freeze amount/currency/offer/purpose/revision while payable or uncertain. Zero-total checkout is either an approved atomic no-payment confirmation or explicitly unavailable.
- [ ] Repeat with parallel connections and faults. Assert no provider request is dispatched from a rolled-back transaction and an accepted quote cannot be edited into a different payable attempt.
- [ ] Document idempotency/context ownership and commit `feat: prepare atomic booking checkout`.

### Task 15 — Implement the Maya provider boundary

**Depends on:** 13–14; approved merchant capabilities and sandbox access. **Files:** `src/integrations/maya/{types,http,checkout,transactions,refunds}.ts`, `tests/contract/maya-http.test.ts`, `tests/fixtures/maya/` sanitized fixtures.

**Interfaces:** Consumes immutable attempts from Task 14. Produces the `MayaGateway` interface in `integrations/maya/types.ts`: `createCheckout(attempt: CheckoutAttempt): Promise<CreateCheckoutResult>`, `retrievePayment(id: string): Promise<ProviderPayment>`, `findPaymentsByReference(reference: string): Promise<ProviderPayment[]>`, `voidPayment(request: ProviderMoneyRequest): Promise<ProviderMoneyResult>` and `refundPayment(request: ProviderMoneyRequest): Promise<ProviderMoneyResult>`.

**Named red test:** `retains multiple collections and never retries an unknown POST`. Its core assertions (fixture setup is the case described below):

```ts
expect(foundPayments).toHaveLength(2); expect(createHttpRequests).toHaveLength(1); expect(createResult.kind).toBe("unknown");
```

- [ ] Define `MayaGateway.createCheckout(attempt)`, `retrievePayment(id)`, `findPaymentsByReference(reference): Promise<ProviderPayment[]>`, `voidPayment(request)` and `refundPayment(request)`. Results distinguish verified response, known refusal and unknown external outcome; include environment and provider identities.
- [ ] Test exact cents/currency/reference mapping, timeout before/after submission, malformed responses, wrong keys/host, multiple payments for one reference and provider method/capability restrictions. Do not assume a lookup or merchant reference makes creation idempotent.
- [ ] Run `pnpm test:contract tests/contract/maya-http.test.ts`; observe adapter failures against local HTTP fixtures.
- [ ] Implement server-only authenticated transport, strict schemas, timeouts, redaction and allowlisted endpoints. Disable blind automatic POST retries; preserve every actual payment identity. Confirm supported API/signature semantics against current official Maya documentation before coding fixtures; real sandbox verification belongs to Task 27.
- [ ] Repeat the contract suite with duplicate/unknown responses and outbound-request counts. A provider unknown result must remain unknown, with enough non-secret reference data to reconcile.
- [ ] Record merchant-specific capabilities/limits and commit `feat: isolate Maya checkout and money operations`.

### Task 16 — Complete the guest checkout and provider handoff

**Depends on:** 06, 08, 11–15. **Files:** `src/features/booking/{Checkout,PaymentStatus,Summary}.tsx`, `src/app/(site)/book/`, `src/domain/payments/create-checkout.ts`, `src/app/api/booking/status/route.ts`; `tests/e2e/checkout.spec.ts`, `tests/integration/checkout-dispatch.test.ts`.

**Interfaces:** Consumes Task 14 `startCheckout`, Task 15 `MayaGateway` and Task 13 leases. Produces `dispatchCheckout(ctx: CommandContext, lease: WorkLease): Promise<DispatchResult>` and `readCheckoutStatus(capability: string): Promise<CheckoutStatus>`; the latter verifies scoped access before returning any private state.

**Named red test:** `keeps redirect return unconfirmed without verified server payment`. Its core assertions (fixture setup is the case described below):

```ts
await expect(page.getByText(/checking payment/i)).toBeVisible(); expect(booking.status).not.toBe("confirmed");
```

- [ ] Define `dispatchCheckout(ctx, lease): Promise<DispatchResult>` and a private `readCheckoutStatus(capability): Promise<CheckoutStatus>`. Display room/dates/occupancy, booker/contact/guest distinctions, accepted policies, offer/price breakdown and optional account invitation. Capture required name/email/phone and optional requests with clear non-guarantee copy; show the authoritative payment deadline.
- [ ] Test double submit, guest success, optional-login cancel/failure, unavailable room, changed quote, preparing/polling, redirect cancellation, browser closure and unknown creation. Assert no client redirect sets paid state and no public booking code authorizes private polling.
- [ ] Run `pnpm test:e2e tests/e2e/checkout.spec.ts` and `pnpm test:integration tests/integration/checkout-dispatch.test.ts`; record failures.
- [ ] Connect durable preparation to one provider create dispatch and persist known/unknown results. Redirect only to approved provider URLs; use scoped revocable status access, rate limits and uncached responses. Preserve accepted attempts through back navigation/login; show checking/escalation instead of inviting duplicate payment.
- [ ] Repeat suites with mobile/keyboard interactions and two tabs. Provider redirects/callback URLs contain no private guest profile or reusable auth token.
- [ ] Document checkout states and commit `feat: complete guest booking and payment handoff`.

### Task 17 — Authenticate and persist Maya webhook deliveries

**Depends on:** 13, 15. **Files:** `src/integrations/maya/signature.ts`, `src/payload/collections/PaymentInbox.ts`, `src/app/api/webhooks/maya/route.ts`; `tests/contract/maya-webhook.test.ts`, `tests/integration/payment-inbox.test.ts`.

**Interfaces:** Consumes Task 15 provider schema and Task 13 enqueue. Produces `verifyMayaDelivery(rawBody: Uint8Array, headers: Headers, config: MayaSignatureConfig, now: Instant): VerifiedDelivery` in `signature.ts`; it returns authenticated normalized facts or throws a typed verification rejection.

**Named red test:** `rejects tampering while deduplicating a freshly signed retry`. Its core assertions (fixture setup is the case described below):

```ts
expect(tamperedResponse.status).toBe(401); expect(semanticInboxCount).toBe(1);
```

- [ ] Define `verifyMayaDelivery(rawBody, headers, config, now): VerifiedDelivery` using the currently documented signing input, RSA verification, timestamp units/tolerance and key rotation. Semantic payment identity is distinct from delivery identity/timestamp.
- [ ] Test tampered bytes/signature, stale timestamps, wrong environment/keys, rotated keys, malformed payload, same payment delivered with fresh signed timestamps, and crash after inbox commit before acknowledgement.
- [ ] Run `pnpm test:contract tests/contract/maya-webhook.test.ts` and `pnpm test:integration tests/integration/payment-inbox.test.ts`; establish failing verification/durability.
- [ ] Authenticate raw requests, store minimal validated durable facts and enqueue processing before acknowledgement. Reject invalid messages without changing payment state. A public caller cannot directly invoke a trusted observation transition; trusted retrieval normalizes through the same processor.
- [ ] Repeat suites with acknowledgement retry and semantic deduplication. Redact headers/secrets and avoid storing complete card/payment payloads in logs.
- [ ] Document actual signing/key/tolerance configuration and commit `feat: verify and durably ingest payment webhooks`.

### Task 18 — Apply payment results and resolve late/extra collections

**Depends on:** 10–14, 17. **Files:** `src/domain/payments/{types,observe,confirm,exceptions}.ts`, `src/payload/collections/PaymentIssues.ts`; `tests/integration/payment-observation.test.ts`.

**Interfaces:** Consumes Task 17 verified inbox/Task 15 trusted retrieval, Task 10 allocation, Task 12 offer reservation and Task 13 enqueue. Produces `applyPaymentObservation(ctx: CommandContext, observation: PaymentObservation): Promise<PaymentApplyResult>` in `payments/observe.ts`; only authorized system callers can apply observations.

**Named red test:** `confirms once and records an extra actual collection as an issue`. Its core assertions (fixture setup is the case described below):

```ts
expect(confirmedBookings).toHaveLength(1); expect(actualCollections).toHaveLength(2); expect(openIssues).toHaveLength(1);
```

- [ ] Define `applyPaymentObservation(ctx, observation: PaymentObservation): Promise<PaymentApplyResult>`. Match environment, amount, currency, merchant reference, purpose and booking/change revision; record each actual provider transaction separately from attempts.
- [ ] Test authorization-only versus completed collection, duplicate/out-of-order success/failure, simultaneous webhook/retrieval, mismatched amount/currency, multiple reference payments, cancelled/abandoned revisions and late success after release. Race for both the last room and last offer use; confirmation must secure both or neither.
- [ ] Run `pnpm test:integration tests/integration/payment-observation.test.ts`; observe failing transitions.
- [ ] Implement monotonic verified outcomes, one booking confirmation/code, one semantic confirmation-email intent and required audit in the same transaction. Use accepted snapshots and approved late-payment policy. Incompatible/duplicate/overpaid collections become visible issues with preserved references and controlled resolution; never quietly discard money.
- [ ] Repeat fault/race tests, asserting no duplicate allocation/redemption/email intent and no old failure undoes confirmed payment. An already collected payment never triggers another create request.
- [ ] Document issue states/resolution authority and commit `feat: confirm verified payments and surface exceptions`.

### Task 19 — Reconcile uncertain payments and expire holds safely

**Depends on:** 13, 15, 18; Decision 03 timing/escalation. **Files:** `src/domain/payments/{reconcile,expire,close-attempt}.ts`, `tests/integration/payment-reconciliation.test.ts`.

**Interfaces:** Consumes Task 15 retrieval and Task 18 observation. Produces `reconcileAttempt(ctx: CommandContext, attemptId: Id): Promise<ReconcileResult>` and `closeAttempt(ctx: CommandContext, attemptId: Id): Promise<CloseResult>` in the reconciliation module.

**Named red test:** `does not refresh the deadline or retry an unknown creation`. Its core assertions (fixture setup is the case described below):

```ts
expect(after.holdDeadline).toBe(before.holdDeadline); expect(providerCreateCalls).toBe(1);
```

- [ ] Define `reconcileAttempt(ctx, attemptId): Promise<ReconcileResult>` and `closeAttempt(ctx, attemptId): Promise<CloseResult>`. Separate authoritative provider closure, bounded checking and unresolved exception states.
- [ ] Test unknown creation, delayed webhook, empty/multiple reference lookup results, expiry racing success and worker crash. Assert retries do not extend the original deadline; empty lookup alone cannot prove creation never occurred or permit another charge.
- [ ] Run `pnpm test:integration tests/integration/payment-reconciliation.test.ts`; establish failing expiry/reconciliation behavior.
- [ ] Implement approved hold timing aligned with actual Maya capability, bounded uncertainty and staff escalation. Maya currently documents a one-hour checkout window; shorten a hold only when the old checkout is prevented from taking payment. Verify the actual window in Task 27 before production configuration. Limit repeated holds under approved policy. [Maya checkout flow](https://developers.maya.ph/reference/accept-one-time-payment-using-maya-checkout). Reconcile every discovered provider payment through Task 18; release room/offer capacity together according to policy. Only safely closed/reconciled context permits a new quote/attempt with fresh acceptance.
- [ ] Repeat with controllable time and parallel expiry/success workers. Verify late success can reacquire all required capacity atomically or stays a paid exception, and no timeout is misrepresented as payment failure.
- [ ] Update the operating timeline/alerts and commit `feat: reconcile payment uncertainty and hold expiry`.

### Task 20 — Deliver transactional messages without losing bookings

**Depends on:** 07–09, 13, 18; Decisions 05 and 07. **Files:** `src/email/{types,transport,templates,deliver}.ts`, `src/payload/email.ts`, `tests/integration/email-outbox.test.ts`, `tests/contract/email-privacy.test.ts`.

**Interfaces:** Consumes Task 13 work leases and Task 18 committed confirmation intent. Produces `TransactionalMailer.send(message: TransactionalMessage): Promise<DeliveryResult>` in `email/types.ts` and `deliverEmail(ctx: CommandContext, lease: WorkLease): Promise<DeliveryResult>` in `email/deliver.ts`.

**Named red test:** `copies booking confirmation without copying reset or claim tokens`. Its core assertions (fixture setup is the case described below):

```ts
expect(confirmation.cc).toEqual(["codeboxstudios.official@gmail.com"]); expect(resetMessage.cc ?? []).toHaveLength(0); expect(claimMessage.cc ?? []).toHaveLength(0);
```

- [ ] Define `TransactionalMailer.send(message): Promise<DeliveryResult>` with known/unknown delivery and safe provider message identity. Confirm the approved Brevo transport and sender/domain readiness; prove selected Payload auth hooks support the required privacy and failure behavior.
- [ ] Test confirmation code/approved booking-view recipient and CC, auth/reset/claim messages without CC, escaped guest text, transient/permanent failures, quotas, crash/timeout after send and replay. Booking confirmation survives every mail failure.
- [ ] Run `pnpm test:integration tests/integration/email-outbox.test.ts` and `pnpm test:contract tests/contract/email-privacy.test.ts`; observe failing delivery/privacy assertions.
- [ ] Implement booking/enquiry outbox delivery, selected auth messages, retry/escalation and delivery status. Keep raw tokens out of audit/CC. Verify actual inbox receipt and bounce/quota handling in Task 27, not just API acceptance. The confirmation may contain an approved booking-view capability; it never doubles as account/claim evidence. Do not claim exactly-once external delivery if the transport lacks deduplication; surface uncertain sends and apply the approved retry rule.
- [ ] Repeat with captured messages and actual transport contract fixtures. Account creation does not subscribe to promotions; any later marketing requires its separately approved channel/preferences.
- [ ] Update sender/CC/bounce runbooks and commit `feat: deliver durable transactional email`.
### Task 21 — Add direct bookings and permitted offline collections

**Depends on:** 04, 10–14, 18, 20; Decisions 03 and 08. **Files:** `src/domain/bookings/direct.ts`, `src/domain/payments/offline.ts`, `src/admin/direct-booking/`; `tests/integration/direct-booking.test.ts`.

**Interfaces:** Consumes Tasks 10–14 shared reservation commands and Task 04 audit. Produces `createDirectBooking(ctx: CommandContext, input: DirectBookingInput): Promise<Booking>` and `recordOfflineCollection(ctx: CommandContext, evidence: OfflineCollectionEvidence): Promise<PaymentTransaction>`; types extend owning booking/payment modules.

**Named red test:** `makes walk-in and web contenders share the last room`. Its core assertions (fixture setup is the case described below):

```ts
expect(successfulBookings).toHaveLength(1); expect(overlappingAllocations).toHaveLength(1);
```

- [ ] Define `createDirectBooking(ctx, input): Promise<Booking>` and `recordOfflineCollection(ctx, evidence): Promise<PaymentTransaction>`. Approved cash/offline/pay-on-arrival methods have explicit permission, evidence and unpaid-deadline rules.
- [ ] Test walk-in/phone versus simultaneous website checkout, staff price tampering, unauthorized collection, duplicate receipt and unpaid expiry. A typed staff value must not create a verified Maya success.
- [ ] Run `pnpm test:integration tests/integration/direct-booking.test.ts`; record failures.
- [ ] Use shared inventory, quote, allocation and confirmation commands rather than bypass CRUD. Save direct-payment evidence, required log and email intent atomically. Implement only approved unpaid/pay-on-arrival behavior; otherwise leave it unavailable.
- [ ] Repeat races and log/outbox fault injection. Website availability must reflect the committed direct booking immediately through fresh availability reads.
- [ ] Document cash/offline reconciliation and commit `feat: add controlled phone and walk-in bookings`.

### Task 22 — Implement atomic stay changes and cancellations

**Depends on:** 10–14, 18–21; Decision 04 and related offer rules. **Files:** `src/domain/changes/{types,quote,request,complete,cancel}.ts`, `src/payload/collections/BookingChanges.ts`; `tests/integration/stay-changes.test.ts`.

**Interfaces:** Consumes shared quote/allocation/payment/offer commands. Produces `requestStayChange(ctx: CommandContext, bookingId: Id, expectedRevision: number, input: ChangeInput): Promise<ChangeResult>` and `cancelBooking(ctx: CommandContext, bookingId: Id, expectedRevision: number): Promise<CancellationResult>`; types in `changes/types.ts`.

**Named red test:** `keeps the original stay on failure and refuses an abandoned revision`. Its core assertions (fixture setup is the case described below):

```ts
expect(currentAllocation).toEqual(originalAllocation); expect(latePaymentResult.kind).toBe("issue");
```

- [ ] Define `requestStayChange(ctx, bookingId, expectedRevision, input): Promise<ChangeResult>` and `cancelBooking(ctx, bookingId, expectedRevision): Promise<CancellationResult>`. Every extra-payment attempt binds to its change purpose/revision and accepted delta quote.
- [ ] Test occupied replacements, same-room incremental extensions, overlapping date moves, concurrent cancel/change and two competing changes. Preserve the original allocation until the replacement transition commits; inject failure at replacement/release/audit stages.
- [ ] Run `pnpm test:integration tests/integration/stay-changes.test.ts`; observe failing allocation/revision assertions.
- [ ] Atomically acquire only required additional capacity, commit the replacement, release obsolete allocation and save the log. Verify increases first; commit a cheaper stay before authorizing its refund through Task 23. Serialize cancellation/revision transitions and approved offer adjustments. Two-booking swaps remain separate scope.
- [ ] Repeat with late extra payment for an abandoned revision; it becomes a return/resolution issue and cannot complete another change. Keep cancellation status separate from refund delivery; failing changes retain valid original stays.
- [ ] Record approved authority and lifecycle rules; commit `feat: add atomic booking changes and cancellation`.

### Task 23 — Authorize and reconcile bounded refunds and voids

**Depends on:** 13, 15, 18–19, 22; Decisions 03–04 and 08. **Files:** `src/domain/refunds/{types,authorize,dispatch,reconcile}.ts`, `src/payload/collections/RefundOperations.ts`; `tests/integration/refund-capacity.test.ts`, `tests/contract/maya-refunds.test.ts`.

**Interfaces:** Consumes verified collections, Task 15 money transport and Task 13 leases. Produces `authorizeRefund(ctx: CommandContext, input: RefundInput): Promise<RefundOperation>` in `refunds/authorize.ts`; dispatch/reconcile use the persisted operation ID and generation, never a fresh arbitrary amount.

**Named red test:** `counts uncertain refund capacity once and blocks duplicate repayment`. Its core assertions (fixture setup is the case described below):

```ts
expect(remaining.minor).toBe("100000"); await expect(authorizeRefund(ctx, overCapacityRequest)).rejects.toThrow(); expect(providerRefundCalls).toBe(1);
```

- [ ] Define `authorizeRefund(ctx, input: RefundInput): Promise<RefundOperation>` with actual collection identity, exact amount, reason, method and expected booking revision. Reserve capacity before provider dispatch; known refusal releases it, uncertainty retains it.
- [ ] Test concurrent/repeated refunds, pending/unknown/completed operations, manual-dashboard refunds, provider caps/method restrictions and process death after request. Remaining capacity equals verified collections minus completed and reserved in-flight/uncertain amounts, each counted once. The representative fixture collects 200,000 minor units, completes 50,000 and reserves an uncertain 50,000, leaving 100,000 available.
- [ ] Run `pnpm test:integration tests/integration/refund-capacity.test.ts` and `pnpm test:contract tests/contract/maya-refunds.test.ts`; establish failures.
- [ ] Implement per-payment and booking-level bounds, authorized void/refund selection, immutable money intent/result and safe reconciliation. A timed-out operation is investigated before another request. Offline reimbursement follows its own approved evidence path; app cancellation never invents a provider/bank receipt.
- [ ] Repeat with competing workers and manual external repayment imported before retry. Assert total repayment cannot exceed allowed remaining collection, and stale results cannot free a newer reservation.
- [ ] Document uncertain/manual resolution and commit `feat: bound and reconcile refunds and voids`.

### Task 24 — Build the operational staff workspace

**Depends on:** 04–07, 18–23; Decision 08. **Files:** `src/admin/{calendar,today,bookings,payments,reports,enquiries}/`, `src/domain/operations/{read,stay-actions,reports}.ts`; `tests/e2e/staff-workspace.spec.ts`, `tests/integration/reports.test.ts`.

**Interfaces:** Consumes domain commands and Task 03 permissions. Produces `readToday(ctx: CommandContext, propertyDate: PropertyDate): Promise<TodayView>`, `lookupBooking(ctx: CommandContext, code: string): Promise<StaffBookingView>` and `runReport(ctx: CommandContext, query: ReportQuery): Promise<ReportResult>`; types owned in `operations/read.ts`/`reports.ts`.

**Named red test:** `requires signed-in authorized staff for booking-code lookup`. Its core assertions (fixture setup is the case described below):

```ts
expect(anonymousLookup.status).toBe(403); expect(staffLookup.bookingCode).toBe(confirmedBooking.code);
```

- [ ] Define permission-filtered `readToday(ctx, propertyDate): Promise<TodayView>`, `lookupBooking(ctx, code): Promise<StaffBookingView>` and `runReport(ctx, query): Promise<ReportResult>`. Commands cover approved arrivals/departures, check-in/out, no-show and enquiry follow-up.
- [ ] Test calendar/direct booking, room/rate/block edits, issue resolution, code lookup, authorized exports and refused actions. Reports must distinguish booking/payment/refund status, use the property timezone and aggregate each currency separately.
- [ ] Run `pnpm test:e2e tests/e2e/staff-workspace.spec.ts` and `pnpm test:integration tests/integration/reports.test.ts`; establish failures.
- [ ] Build usable controlled actions on domain commands, clear pending/unknown/error states and approved reports/alerts. Include authorized guest/reference/date search, staff notes and contact actions. Protect CSV fields from spreadsheet formula execution. Code/optional approved QR only locates a booking for signed-in staff; it does not prove guest identity. Developer-only audit tools remain separately protected.
- [ ] Repeat with each role, keyboard/mobile staff use and direct endpoint probes. Verify read/export logs, totals and all relevant failures against seeded authoritative records.
- [ ] Update staff procedures/training screenshots and commit `feat: add property operations workspace`.

### Task 25 — Enforce account lifecycle, revocation and retention

**Depends on:** 03, 08–09, 20, 24; Decisions 05, 07–08. **Files:** `src/domain/privacy/{types,lifecycle,retention,revocation}.ts`, `src/features/auth/revocation.ts`, `tests/integration/account-lifecycle.test.ts`.

**Interfaces:** Consumes Task 03 authorization, Task 09 claim/view capabilities and Task 04 audit. Produces `applyAccountLifecycle(ctx: CommandContext, accountId: Id, expectedRevision: number, action: LifecycleAction): Promise<LifecycleResult>` and `revokeCapabilities(tx: DbTx, subject: RevocationSubject, reason: string): Promise<void>`.

**Named red test:** `revokes prior access without transferring booking ownership`. Its core assertions (fixture setup is the case described below):

```ts
expect(oldSessionResponse.status).toBe(401); expect(bookingAfter.ownerCustomerId).toBe(originalOwnerId);
```

- [ ] Define `applyAccountLifecycle(ctx, accountId, expectedRevision, action): Promise<LifecycleResult>` and `revokeCapabilities(tx, subject, reason): Promise<void>`. Separate profile/contact changes, credential/role revocation and immutable booking ownership.
- [ ] Test email change, delete/recreate, deactivation, staff removal, outstanding paid stays and unexpired sessions/reset/claim/booking-view links. Assert history never transfers by email and shared caches/account switching reveal no previous private data.
- [ ] Run `pnpm test:integration tests/integration/account-lifecycle.test.ts`; observe failures.
- [ ] Implement approved deletion/anonymization/retention and verified contact-recovery rules without deleting required financial/audit evidence through screens. Preserve valid booking obligations and approved third-party authority; append sensitive changes to logs and feed recovery reconstruction evidence.
- [ ] Repeat with concurrent claim/lifecycle operations and stale sessions. No lifecycle action silently creates promotional consent or restores a previous privileged role.
- [ ] Document retention/recovery limits and commit `feat: enforce customer lifecycle and credential revocation`.

### Task 26 — Prove quarantine, restoration and safe resumption

**Depends on:** 13, 18–25; Decision 10 recovery design/operator/targets. **Files:** `src/config/operation-mode.ts`, `src/domain/recovery/{fence,reconcile,resume}.ts`, `scripts/recovery/`; `tests/recovery/restore.test.ts`, `docs/operations/recovery-runbook.md`.

**Interfaces:** Consumes financial/security state from Tasks 18–25 and an external recovery fence. Produces `assertOperationAllowed(operation: OperationClass): void` and `authorizeResumption(ctx: CommandContext, evidence: RecoveryEvidence): Promise<ResumptionPermit>`; the permit binds verified generation, stages and operator.

**Named red test:** `fences old credentials money work and private links after restore`. Its core assertions (fixture setup is the case described below):

```ts
expect(restoredLogin.status).toBe(503); expect(restoredPrivateLink.status).toBe(503); expect(outboundMoneyCalls).toBe(0); expect(outboundEmailCalls).toBe(0);
```

- [ ] Define `assertOperationAllowed(operation): void` and `authorizeResumption(ctx, evidence): Promise<ResumptionPermit>`. Quarantine state/fence must be controlled outside the database being restored and applied before any restored app/worker starts; no startup fail-open. Operator resumption uses independently verified authority outside restored credentials/sessions; it cannot depend on reopening ordinary login first.
- [ ] Write an isolated backup fixture followed by new booking/payment/refund, voucher use, changed password/contact/role, deactivation and token revocation. Restore the old snapshot and assert authentication, private links, writes, workers and outbound money/email remain fenced.
- [ ] Run `pnpm test:recovery tests/recovery/restore.test.ts`; establish failed resumption/security checks without touching live resources.
- [ ] Implement approved reconstruction evidence and procedures: provider collections/refunds plus sufficient booking/quote/customer/allocation/offer context, security revisions and stale-worker fencing. Provider amount alone cannot reconstruct a valid stay. Missing current security evidence requires verified recovery, never trust in an old password or link.
- [ ] Repeat restoration and media recovery separately; reconcile all post-backup events, invalidate stale capabilities, then require named operator authorization before staged resumption. Preserve authenticated incoming provider evidence in an isolated durable channel while restored writers are fenced. Record measured recovery times against approved targets.
- [ ] Update the documentation index/runbook and commit `feat: enforce verified recovery quarantine and resumption`.

### Task 27 — Validate isolated deployments and real provider contracts

**Depends on:** 05, 13, 15, 17, 20, 26; Decision 10 and authorized sandbox operations. **Files:** `.github/workflows/verify.yml`, `vercel.json`, `scripts/{verify-target,release-evidence}.ts`, `tests/sandbox/{maya,email,media,runner}.test.ts`, `docs/operations/deployment.md`.

**Interfaces:** Consumes approved environment and Task 26 fence. Produces `verifyTarget(config: TargetConfig): VerifiedTarget` in `scripts/verify-target.ts` and recorded deployment/provider evidence; no new pricing or authorization behavior.

**Named red test:** `rejects preview configuration pointing at production resources`. Its core assertions (fixture setup is the case described below):

```ts
expect(() => verifyTarget(previewWithProductionDatabase)).toThrow(); expect(() => verifyTarget(previewWithProductionMaya)).toThrow();
```

- [ ] Define `verifyTarget(config): VerifiedTarget` with project/environment/database/provider identity checks. Configure CI lint/types/unit/integration/build/e2e and protected migration/release steps; test secrets stay in protected configuration. Disable unused Supabase Data API exposure or explicitly restrict grants, row policies and callable functions; Payload customers are not Supabase Auth identities. Capture baseline security-header, origin/CSRF and dependency checks before public exposure.
- [ ] Test environment swaps, preview access to production resources, missing runner authentication and migration target mismatch. Add opt-in sandbox assertions for real checkout/retrieval/webhook keys, actual expiry/methods, void/refund capability, email delivery, durable media and scheduled work.
- [ ] Run local contract/target tests first; confirm they reject wrong targets before giving them authorized isolated resources.
- [ ] Configure approved preview resources and apply reviewed migrations separately from build. Run `pnpm test:sandbox tests/sandbox/maya.test.ts`, then email/media/runner equivalents with authorized synthetic transactions and cleanup. Record provider/resource IDs safely, not keys or private transaction payloads.
- [ ] Verify source SHA, deployment ID, Git link, READY status, alias and browser behavior; verify real scheduler cadence, connection limits/pool behavior and logs/alerts. A configuration file or GitHub push is insufficient evidence.
- [ ] Record actual versions/limits, unresolved provider defects and rollback steps; commit `chore: verify isolated deployment and provider readiness`.

### Task 28 — Complete acceptance, UAT and the approved scope baseline

**Depends on:** 01–27 as applicable; all affected Decisions 01–11 resolved. **Files:** `docs/acceptance/{requirements,evidence,uat}.md`, `scripts/verify-acceptance.ts`, `tests/e2e/acceptance.spec.ts`, updated canonical specification and relevant proposal scope attachments.

**Interfaces:** Consumes the 38-ID crosswalk and evidence from all applicable tasks. Produces a versioned acceptance register; `verify-acceptance.ts` exits 0 only when every required evidence/gate passes for the selected revision/environment.

**Named red test:** `requires evidence for every unchanged acceptance ID`. Its core assertions (fixture setup is the case described below):

```ts
expect(requirementIds).toEqual(Array.from({length:38}, (_, i) => i + 1)); expect(exitCodeWithMissingEvidence).not.toBe(0);
```

- [ ] Freeze the approved versioned policies/content/scope and identify Client sign-off/training contacts. Resolve additions/cost/schedule before treating them as included commercial work; earlier policy gates already govern implementation, not a retrospective approval here.
- [ ] Make `verify:acceptance` fail for missing requirement IDs 1–38, wrong revision/environment, unresolved release blockers or unsupported evidence. Write end-to-end guest/customer/staff journeys using the approved rules, including accessible empty/error states.
- [ ] Run `pnpm verify:acceptance` and `pnpm test:e2e tests/e2e/acceptance.spec.ts`; record genuine gaps rather than inventing passes.
- [ ] Complete the crosswalk below with actual evidence, browser/accessibility checks and incident exercises. Train staff on the beta, collect UAT outcomes and retest corrected defects. Preserve any saved questionnaire answers when updating/exporting review forms; do not overwrite them to obtain fresh defaults.
- [ ] Repeat the failed checks and final acceptance completeness. Record exclusions, known limits and explicit Client acceptance against the exact revision, without presenting a test result as commercial/legal sign-off.
- [ ] Update contract attachment references where approved and commit `docs: record approved acceptance and UAT evidence`.

### Task 29 — Release, verify production and hand over

**Depends on:** 28, successful recovery rehearsal and explicit production release authorization. **Files:** `docs/operations/{deployment,launch-checklist,handover}.md`, `scripts/release-evidence.ts`; release configuration/content changes scoped to approved targets.

**Interfaces:** Consumes Task 28 accepted revision, Task 26 recovery permit/procedure and production release authorization. Produces a non-secret release/handover record tied to actual deployment ID, source SHA, alias, provider evidence and named operational owner.

**Named red test:** `blocks release until evidence and authorization are complete`. Its core assertions (fixture setup is the case described below):

```ts
expect(incompleteReadiness.exitCode).not.toBe(0); expect(verifiedRelease.sourceSha).toBe(acceptedRevision);
```

- [ ] Prepare the concrete release candidate: real content, opening room inventory/direct bookings/blocks, domains/DNS, sender, secrets, production Maya readiness, backups/media restore, scheduler, operator alerts, rollback and support responsibilities. Review actual cost assumptions in the technology document.
- [ ] Run the readiness validator and show a failing result if any prerequisite/evidence/authorization is missing. Obtain release approval only after the candidate and checks are concrete and reviewable; follow any existing authorization in the session.
- [ ] Apply approved migrations/cutover and deploy the exact accepted SHA. Keep writes fenced during opening import/reconciliation; never use reset/reseed commands on live content or inventory.
- [ ] Verify deployment/project IDs, Git link, READY status, alias, live desktop/mobile UI, permissions and authorized payment/email/scheduler flow. Any controlled real charge/refund requires its agreed amount, authority and reconciliation/cleanup; sandbox success alone does not prove production.
- [ ] Record fresh evidence, backup/recovery references and rollback decision. Confirm staff training, operating contacts, ownership, credential handover through protected channels and the agreed maintenance start. Assign proactive monitoring, backup checks, upgrades and incident response explicitly; bugs-only maintenance does not supply those services. Escalate unresolved money issues before declaring handover complete.
- [ ] Commit the scoped release/handover record on `main`. Report what actually passed and what remains pending; do not mark complete based solely on a deployed page or provider account creation.

## 6. Requirement-to-task acceptance crosswalk

The IDs below are the unchanged requirements in specification section 9. This table assigns future evidence; it does not report passes. Store actual command/browser/provider results against release revision and environment in Task 28, with private guest/provider data excluded.

| ID | Requirement focus | Primary task; supporting tasks | Required evidence owner/file |
| --- | --- | --- | --- |
| 1 | Phone booking with guest checkout | 16; 06, 08 | `tests/e2e/checkout.spec.ts` |
| 2 | Concurrent same-room exclusion | 10; 02, 14 | `tests/integration/inventory.test.ts` |
| 3 | Whole-stay and adjacent dates | 10; 11 | `tests/integration/inventory.test.ts` |
| 4 | Immediate shared direct-booking inventory | 21; 10 | `tests/integration/direct-booking.test.ts` |
| 5 | Accepted rates and fresh agreement | 11; 12, 14, 22 | `tests/integration/quotes.test.ts` |
| 6 | Verified payment, not redirect | 18; 16–17 | `tests/integration/payment-observation.test.ts` |
| 7 | Repeated/out-of-order messages and clicks | 18; 14, 17 | `tests/integration/payment-observation.test.ts` |
| 8 | Hold timing and unclear outcomes | 19; 15 | `tests/integration/payment-reconciliation.test.ts` |
| 9 | Visible paid exceptions/resolution | 18; 23–24 | `tests/integration/payment-observation.test.ts` and staff UAT |
| 10 | Safe changes and separate refunds | 22; 23 | `tests/integration/stay-changes.test.ts` |
| 11 | Durable booking/email/payment work | 13; 18–20 | `tests/integration/work-leases.test.ts`, `email-outbox.test.ts` |
| 12 | Privacy, staff authorization and restore | 03; 09, 26 | `authorization.test.ts`, `customer-history.test.ts`, recovery rehearsal |
| 13 | Unique code, authorized check-in lookup | 24; 18 | `tests/e2e/staff-workspace.spec.ts` |
| 14 | Confirmation code, approved CC, delivery failure | 20; 18 | `tests/integration/email-outbox.test.ts` |
| 15 | Complete atomic developer-only logs | 04; 03 | `tests/integration/audit.test.ts` |
| 16 | Repeated/concurrent/unknown/manual refunds | 23 | `tests/integration/refund-capacity.test.ts` |
| 17 | Signature/timestamp/environment/retry safety | 17; 18, 27 | `tests/contract/maya-webhook.test.ts` and sandbox evidence |
| 18 | Opening inventory and post-backup/media recovery | 26; 10, 29 | `tests/recovery/restore.test.ts` and opening inventory record |
| 19 | Selected responsive themed accessible design; preserved comparison | 06; 28 | `tests/e2e/public-site.spec.ts` and existing comparison recheck |
| 20 | Updates navigation/filters/detail/empty state | 07 | `tests/e2e/updates.spec.ts` |
| 21 | Persistent authorized publication/withdrawal | 07; 04 | `tests/integration/publication.test.ts` |
| 22 | Draft protection, validation and safe text | 07; 03, 05 | `tests/integration/publication.test.ts` |
| 23 | Approved property-date event boundary | 07 | `tests/integration/publication.test.ts` |
| 24 | Enquiry title/date; no reservation effects | 07; 20 | `tests/e2e/updates.spec.ts` and publication database assertions |
| 25 | Own history/current states; no email-only attach | 09 | `tests/integration/customer-history.test.ts` |
| 26 | Private optional login/guest handoff | 08; 16 | `tests/integration/checkout-handoff.test.ts` |
| 27 | All-account offers; authenticated redemption | 12; 14 | `tests/integration/offer-usage.test.ts` |
| 28 | Eligibility/snapshot/usage/reinstatement | 12; 14, 18–19, 22–23 | `offer-usage.test.ts`, `payment-observation.test.ts` |
| 29 | Authorized offer editing and logs | 12; 03–04 | `tests/integration/offer-usage.test.ts` |
| 30 | Empty account views; no silent marketing | 09; 12, 20, 25 | `customer-history.test.ts`, `email-privacy.test.ts` |
| 31 | Immutable attempts/unknown creation/multiple payments | 14; 15–19 | `checkout-atomicity.test.ts`, `payment-reconciliation.test.ts` |
| 32 | Immutable ownership; historical claim proof/races | 09; 25 | `tests/integration/claims.test.ts` |
| 33 | Distinct booker/contact/staying guest authority | 09; 16, 20 | `customer-history.test.ts`, `checkout.spec.ts`, `email-privacy.test.ts` |
| 34 | Incremental extension/revision/cancel safety | 22 | `tests/integration/stay-changes.test.ts` |
| 35 | Offer changes/late capacity/negative/zero total | 18; 11–12, 14, 19 | `payment-observation.test.ts`, `offer-usage.test.ts` |
| 36 | Restore quarantine/security/money/work resumption | 26; 25 | `tests/recovery/restore.test.ts` |
| 37 | All API/private-field/cache/session/auth boundaries | 03; 08–09, 25 | `authorization.test.ts`, `principal-switching.spec.ts`, `customer-auth.spec.ts` |
| 38 | Publication/date cache and preview/media limits | 07; 05 | `tests/integration/publication.test.ts` |

The canonical paths are those in the task definitions; short filenames in this table refer to those paths. Task 28 must expand any combined evidence into recorded individual outcomes rather than one blanket “system passed.”
## 7. Execution stages and review exits

This is dependency order, not a new calendar or fixed-price commitment. The existing proposal schedule remains 10–13 weeks under its prerequisites; customer-account/offer additions and the final approved rules require explicit commercial reconciliation in Decision 11. Do not infer a new estimate by counting tasks.

| Stage | Exit that can be reviewed | Required exit evidence |
| --- | --- | --- |
| Foundation: 01–04 | Compatible application shell, real atomic database proof, protected principals/logs | Fresh migrations/build; rollback/concurrency/access tests; approved technical boundary |
| Public preview: 05–07 | One production design, real configured content, persistent private drafts/public posts | Mobile/desktop/theme/keyboard checks; withdrawal/date/media tests |
| Customer preview: 08–09, 12 | Optional access/history/offers with guest continuity | Recovery/session/ownership/claim/offer tests under approved policy |
| Booking sandbox: 10–23 | Shared inventory and money lifecycle, including direct bookings and changes | Parallel room/offer/checkout/refund tests, lost-response and worker-restart exercises |
| Operational beta: 24–27 | Staff workspace and demonstrated provider/recovery operation | Isolated restore, real authorized sandbox provider checks, monitoring and scheduler evidence |
| Accepted release candidate: 28 | Versioned scope and completed UAT | Individual evidence for all 38 requirements, trained operators, accepted limits |
| Production and handover: 29 | Verified live deployment and reconciled opening inventory | Exact SHA/deployment/alias, live authorized checks, backup/rollback/support ownership |

Critical dependencies are **01 → 02 → 03/04 → shared content/inventory/quote contracts → 12/13/14 → 15/17/18/19 → 22/23 → 26/27 → 28/29**. Task numbers organize the plan but do not authorize ignoring a dependency. Task 16 can start with Task 18 observation fakes, but cannot pass payment acceptance until 17–19 are integrated. Task 22 may produce a pending-refund intent before 23, but cannot offer a working repayment action until 23 passes. Task 07 stores enquiry intent before 13/20 connect actual delivery.

Parallel work is limited to independent files after their contracts pass review: public UI and inventory calculations; account presentation and provider fixture development; staff read views and content preparation. One worker owns shared collections/types/migrations at a time. Integrate and review each contract change before dependents proceed. Keep drafts and synthetic financial flows isolated from production during intermediate stages.

## 8. Configuration, evidence and handover records

The following names are proposed unless already documented in the operations guide. Task 01 reconciles the final names with actual framework/provider configuration; no values or account secrets belong in this plan.

| Variable/configuration | Purpose and gate |
| --- | --- |
| `APP_ENV`, `APP_URL` | Explicit environment and approved canonical origin; never infer payment environment from hostname alone. |
| `DATABASE_URL`, `PAYLOAD_SECRET` | Protected database connection and Payload signing secret; isolated per environment. |
| `TEST_DATABASE_URL` | Explicit isolated test target; harness refuses shared/production resources. |
| `PROPERTY_TIMEZONE`, approved policy version reference | Property calendar and resolved Decisions 01–08; validate rather than silently default. |
| `MAYA_ENVIRONMENT`, Maya API/signing credential references | Environment-specific credentials, webhook verification keys/rotation; use the adapter's final documented names. |
| `BREVO_SMTP_*`, `EMAIL_FROM` | Proposed approved transactional transport and authenticated sender; HTTPS uses its selected alternative names. |
| `BOOKING_CONFIRMATION_CC` | Current approved booking-confirmation copy recipient; not an auth/claim transport default. |
| Approved media adapter variables | Durable storage connection/access settings after Decision 10 selects the adapter. |
| `WORK_RUNNER_SECRET` and runner schedule configuration | Protected externally scheduled batch execution with approved cadence and leases. |
| `APP_OPERATION_MODE`, external recovery generation/permit | Default-safe deployment/restore fencing before startup; production operation is explicitly authorized. |

Evidence records include timestamp, command/check, revision, environment/resource identity, observed result, limitation and follow-up owner. Keep provider financial/security reconstruction evidence in approved protected storage, with only safe references in this repository. Ordinary app logs are not a substitute for recoverable booking or credential state.

New documents created during implementation must be indexed. The technology document records selected versions/transports/storage and dated official cost assumptions; the operations guide records actual setup, migrations, access, targets, backup, alert, recovery and release procedures. Update the canonical specification when an approved policy changes behavior. Existing questionnaire exports, PDFs, Notion mirrors and static prototypes do not automatically become current or production evidence.

## 9. Plan review and execution handoff

**User review requested:** Check completeness, task sequence, production design, pending business decisions, commercial scope and evidence expectations. Approval of this implementation sequence is separate from resolving Decisions 01–11. No implementation has started in this planning pass.

Execution options after review:

- **Subagent-driven — recommended:** A fresh implementer and independent review gate per task, followed by integrated review. This costs more context but suits the financial, identity and recovery boundaries in this 29-task plan. Follow `superpowers:subagent-driven-development` while retaining the repository's `main`-only policy.
- **Native:** The primary agent implements the tasks in sequence, then a fresh reviewer checks the combined change. This uses less context; intermediate technical proofs and task tests remain mandatory. Follow `superpowers:executing-plans`, also on `main`.

The user may request changes before choosing an execution method. Do not treat unanswered review questions, an annotated checklist, a selected provider or an elapsed waiting period as permission to implement or release.

### Author self-review and actual validation

The plan author checked the complete specification against the workstreams and mapped all 38 acceptance IDs exactly once as primary entries, with supporting tasks for cross-cutting behavior. The five Review Focus cases each have owning tests. Task interfaces name their owners/consumers, and test assertions/commands describe future evidence rather than claiming existing application results. Decision gates were retained for unresolved identity, offer, financial and recovery rules instead of inventing production defaults.

This document contains signatures and representative assertions, not program bodies. Foundation/transaction proof precedes features that rely on it; remaining tasks produce independently reviewable increments under the shared contracts. The plan is longer than the narrative specification because it adds execution and evidence detail, but does not reproduce an implementation.

This planning pass validates document structure, local references, acceptance mapping, source preservation and the browser review artifact. The [review-page renderer](../../tools/render-implementation-plan.py) regenerates both HTML copies from this Markdown and the existing Acornelia assets. Its actual results are recorded in the [implementation-plan verification record](../../architecture/2026-11-13-implementation-plan-verification.json). No application installation, application tests, migration, build, provider integration or deployment was run. Those checks remain future tasks.
