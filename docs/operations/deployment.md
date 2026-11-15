# Deployment and operations preparation

**Updated:** November 12, 2026 (customer-account coverage and recovery controls reviewed; production remains unverified).

**Status:** Preparation requirements for the selected stack. The production application, provider connections, and deployment have not been verified.  
**Related:** [Technology choices and costs](../architecture/technology-stack.md), [booking plan](../superpowers/plans/2026-11-05-acornelia-website-plan.md), and [documentation index](../README.md).

## Current evidence

The repository contains planning documents and design-review artifacts. The previews do not process real bookings, authenticate staff, take payment, or send emails. No verified Vercel deployment URL, Supabase project connection, Brevo sender, or production Maya activation is recorded for this project.

There is no production application configuration or verified application build/migration command to run yet. Add exact commands and their results here when the application is implemented. Do not treat preview HTML or a selected provider as a working service integration.

## Public design-review preview — November 12, 2026

The three-direction guest prototype is published at [ab73db76.ht-ml.app](https://ab73db76.ht-ml.app/) (site ID `ab73db76`). It is public: anyone with the link can read the fictional sample content. This static review share does not establish a Vercel production deployment, real availability, staff access, payment processing or email delivery.

The user encountered an ht-ml.app rejection requiring a request smaller than 6,291,456 bytes. Repeated room-image embeddings made the original export 7,478,852 bytes. Each room mood is now embedded once, retaining full image quality. The current export, including the prominent design picker and owner-post demonstration, is 2,830,649 bytes. Ordered scripts after body content let the standard Lavish Publish/Export path include every module. The renderer checks for three embedded room moods, no external scripts, and 512 KiB of request-size margin.

Rebuild with `python3 .lavish/render-acornelia-guest-export.py`. The browser Publish action and this portable output were byte-compared. Live HTTP 200, exact served HTML, twelve desktop/mobile mood/theme combinations and a sample mobile booking flow were verified. See the [redesign verification record](../design/2026-11-12-guest-redesign-verification.json).

The ht-ml.app update credential is stored outside the repository in the mode-0600 local state file `/home/jess/.local/state/acornelia-condotel/ht-ml-app-guest-share.json`. Do not copy its contents into documentation or the project archive. Use the existing site ID and protected credential when updating the same address; creating another share makes a new URL. The Notion mirror and remote archive attachments have not been refreshed. No production hosting subscription or cost assumption changed.

## Setup requirements

| Area | Required preparation and evidence |
| --- | --- |
| Vercel | Confirm the intended team and project, commercial plan, GitHub repository and `main` production branch, environment scopes, runtime region, domain, and spending controls. Record the deployment ID, source commit, READY status, and live URLs after a real deployment. |
| Supabase | Confirm the intended organization/project, plan, region, connection modes, connection limits, separate development/production data, and recovery requirements. Record nonsecret project identification and successful application connectivity when verified. |
| Brevo | Confirm account access, transactional sending readiness, authenticated sending domain, sender address/name, allowance, and any branding requirements. Verify guest confirmation, the required CC, password-reset delivery, and handling of rejected or delayed messages. |
| Maya | Verify merchant approval, Checkout activation, correct sandbox/production environment, enabled payment methods, webhook configuration/security, and actual refund capabilities. Follow the booking plan's payment and late-payment rules. |
| Photo storage | Select a persistent provider and compatible Payload adapter. Verify upload, delivery, replacement, access rules, and recovery. |
| Scheduled work | Select and configure an authenticated runner for durable payment reconciliation, hold expiry, and email retries. Verify restart recovery, duplicate execution, bounded retries, and alerts. |
| Customer accounts and offers | Configure optional Payload customer accounts, approved verification/recovery and booking-claim flows, private history, all-account offers, protected staff offer controls and customer access checks. Verify guest checkout and checkout login continuity. |

Choose compatible app/database regions after confirming available provider locations and expected guest/staff access. Measure application latency rather than assuming the default regions are appropriate.

## Retained hosting and database plan — November 11, 2026

The user chose to retain Vercel, Supabase PostgreSQL and Brevo after the [cost comparison](../architecture/2026-11-11-hosting-and-database-options.md). Vercel Pro and Supabase Pro remain the production budgeting reference; actual tiers, billing and accounts must be confirmed before provisioning. No replacement host, account or live configuration was selected or changed. Preserve the existing requirements for storage/jobs, region, recovery, alerts and an assigned operator. Supabase Free can still be used for development within its limits; it is not the approved production configuration merely because it is cheaper.

If GoDaddy is later chosen for the domain, the Client retains registrar ownership and grants authorized DNS access. Keep registration/renewal separate from app hosting. Apply the selected host's actual records at the registrar, retain existing mail records and verify HTTPS and Brevo authentication. No domain name, availability, checkout/renewal price, DNS record or certificate has been verified for this project.

## Maya integration access

Give the owner the [Maya access instructions](maya-owner-access-guide.md) or [printable PDF](../../deliverables/Acornelia-Maya-Access-Instructions.pdf) when arranging a separate developer login. The guide is dated November 6, 2026; it does not mean access has been granted. The shareable HTML was checked at a 320-pixel viewport with no horizontal overflow, and its support-request copy control worked. The exported HTML contains its local assets; the PDF was checked for the invitation email, all seven instruction sections, and the complete closing instructions. These are document checks, not verification of Acornelia’s Maya account or permissions.

**Guidance checked:** November 5, 2026. No Acornelia merchant access, production keys, or Checkout activation has been verified.

The developer does not need the owner's primary login to start development. Maya provides public sandbox credentials for exploration without Business Manager access. Those credentials are shared with other developers; prefer project-specific test access for controlled integration testing. See [Maya sandbox credentials](https://developers.maya.ph/reference/sandbox-credentials-and-cards).

Production requires Acornelia's approved merchant setup, activated Maya Checkout, and the correct production API credentials. The owner can complete dashboard steps and arrange secure application configuration with the developer. If direct dashboard access is needed, request a named, authorized user and only the permissions actually available and required. Confirm the account's available user roles rather than assuming a dedicated developer role exists. Maya documents [merchant setup and key generation](https://developers.maya.ph/reference/getting-started-in-maya-checkout-maya-business-manager) and [user access management](https://developers.maya.ph/docs/maya-manager-quick-links).

The owner retains merchant-account ownership and settlement/banking control. Do not share the owner's password, OTPs, or recovery credentials. Configure the production secret key in protected server-side environment settings; do not put it in the browser, repository, questionnaire, or chat. Owner cooperation for activation and configuration is required even when the developer does not have dashboard access.

## Configuration register

The following is a proposed application configuration contract. `DATABASE_URL` and `PAYLOAD_SECRET` follow Payload usage; other application variable names must be confirmed during implementation. This table does not mean those variables or integrations already exist.

| Name or configuration group | Purpose | Handling |
| --- | --- | --- |
| `DATABASE_URL` | Supabase PostgreSQL connection used by Payload at runtime. | Secret, server only. Configure a bounded connection pool appropriate to Vercel. |
| Migration database connection | Connection used for schema migrations and deployment setup. | Secret, server only. Select the supported connection mode and document the actual variable/command during implementation. |
| `PAYLOAD_SECRET` | Payload authentication and cryptographic secret. | Secret, server only; stable per environment. |
| `BREVO_API_KEY` | Proposed credential for Brevo's transactional HTTPS API if that transport is selected. | Secret, server only. If SMTP is selected instead, document its actual credential names and transport configuration. |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | Proposed verified transactional sender identity. | Confirm the domain/address in Brevo; do not substitute the CC inbox as the sender without verification. |
| `BOOKING_CONFIRMATION_CC` | Proposed setting for the required confirmation copy. | Current required value: `codeboxstudios.official@gmail.com`. Confirmations must include it. |
| `APP_URL` | Proposed canonical HTTPS origin for booking and password-reset links. | Use the correct origin for each environment and validate generated links. |
| Maya configuration | Environment, API credentials, callback URLs, and webhook security settings. | Store secrets server-side. Confirm exact application variable names and account requirements during implementation. |
| Job authentication | Credential protecting the selected scheduled-work endpoints. | Secret, server only. Choose the actual variable and verification mechanism with the runner. |
| Photo-storage configuration | Bucket/store identifier, delivery URL, and access credentials. | Document exact names after provider selection; keep write credentials server-side. |

Configure the required Development, Preview, and Production scopes deliberately. Preview builds must not charge real guests, send unintended real notifications, or write to the live booking database. Keep credentials and private connection strings out of Git, mockups, questionnaire exports, logs, and documentation.

## Payload and Supabase

Use Payload's official `@payloadcms/db-postgres` adapter for the selected PostgreSQL database. Payload is selected for customer, staff and developer authentication; Supabase is not replacing it or the application's permission checks. See [Payload's adapter documentation](https://payloadcms.com/docs/database/postgres).

Follow [Supabase's connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) when selecting runtime and migration connections. Verify transaction behavior, connection reuse, limits, and concurrent bookings with the actual adapter and Vercel runtime. A database login succeeding is not proof that booking concurrency is safe.

Payload Local API calls skip access controls by default. Customer- and staff-driven operations must carry the authenticated user and explicitly enforce collection/field permissions, including the documented `overrideAccess: false` setting where applicable. Keep trusted payment/system operations separate and narrowly authorized. Test anonymous guest, customer, staff and developer access through custom actions, generated endpoints, relationships, versions, exports and bulk operations; test that a failed transaction does not leave a successful staff change without its required log. See [Payload Local API access control](https://payloadcms.com/docs/local-api/access-control).

Keep private booking and action-log records accessible through authorized application paths. Review Supabase Data API exposure deliberately. Any exposed tables need appropriate grants and row-level access controls; a private-looking admin screen does not secure a public data endpoint. See [Supabase API security guidance](https://supabase.com/docs/guides/api/securing-your-api).

For the planned Payload-only database path, evaluate disabling the unused Supabase Data API or keeping internal objects outside exposed schemas. Verify the actual project settings and grants, rather than assuming new tables are private or that Payload users have Supabase Auth identities. Review callable database functions separately from table policies. No such setting has been verified or changed by this guide.

Run controlled production migrations with an appropriate backup and recovery plan. Document the actual migration command, schema version, and result once implemented. Keep migration access separate from routine application access where supported. Never solve a production failure by resetting the database or deleting booking records.

Pin the tested toolchain and record the intended target before a deployment. [Supabase CLI v3 changed default database-command targets and hosted-write confirmation behavior](https://supabase.com/changelog/supabase-cli-v3); consult the installed version's help and verify the actual project/environment before running a migration. This is version-selection guidance, not an instruction to upgrade or run an unverified command against a hosted database.

## Brevo integration and delivery

Configure one application delivery path that serves booking confirmations and Payload authentication emails. Payload supports SMTP through `@payloadcms/email-nodemailer`; a Brevo HTTPS implementation needs a compatible Payload email adapter. The transport is not yet selected or implemented. See [Payload email integration](https://payloadcms.com/docs/email/overview) and [Brevo transactional email](https://developers.brevo.com/docs/send-a-transactional-email).

The integration must:

- Use a verified sender and authenticated sending domain, with credentials available only to trusted server code.
- Include the booking code, stay/payment summary, secure booking-view link, and required CC in every booking confirmation.
- Persist confirmation work together with the confirmed booking. Do not lose the email when the process exits after payment.
- Deduplicate automatic confirmation work and track delivery attempts. Handle an unclear provider response without assuming a retry cannot duplicate a message.
- Record provider message references and delivery state. An API acceptance response does not prove inbox delivery; track delivery/bounce information where available.
- Keep a paid booking confirmed if delivery fails. Retry with bounded backoff, track pending work, and alert the responsible operator when delivery needs intervention.
- Test recipient accounting, daily quota exhaustion, delays, rejection, bounce handling, CC delivery, and password-reset links. Keep private access links and complete guest profiles out of operational logs.
- Verify the selected customer email-verification, password-reset and booking-claim messages, token expiry/reuse and login return paths. Authentication and claim tokens must not be sent to the booking-confirmation CC or included in public review artifacts. Promotional offer email remains a separate, unapproved delivery scope.

The free allowance currently includes 300 daily sends and branding. Treat quota pressure as an operational condition, not permission to discard a paid guest's confirmation. See [Brevo's current limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan). The application still needs its own durable retry records even when the provider queues messages.

## Scheduled work and payment recovery

Persist unfinished payment checks, room holds, and email work in the database. Use short, resumable operations that tolerate repeated execution and a process restart. The runner, schedule, maximum attempts, escalation timing, and responsible operator remain to be chosen.

The selected implementation must reconcile uncertain Maya outcomes, safely expire holds under the booking plan, retry email delivery, and surface unresolved cases to staff. A function continuing after an HTTP response or an in-memory timer is not sufficient evidence of durable recovery.

Authenticate scheduled endpoints and protect manual retry controls. Observe failures and avoid repeatedly processing completed tasks. Test duplicate runs, overlapping runs, lost responses, interrupted execution, and late payment notifications against the existing acceptance checks.

Define durable task claiming, bounded leases and stale-worker rejection before implementation. A reclaimed task must not allow an older worker to overwrite a newer result. Money-moving work with an uncertain external result must be reconciled before another external request; lease expiry is not proof that the provider did nothing. If Payload Jobs is selected on Vercel, configure the required external scheduling/running mechanism rather than relying on a persistent in-process worker. See [Payload Jobs](https://payloadcms.com/docs/jobs-queue/overview). Runner choice, cadence, claim timeouts and escalation remain unresolved launch requirements.

### Customer authentication and offer verification

Test customer registration and the selected verification/recovery flow separately from staff access. Cover customer-versus-staff/developer permissions, protected role/ownership fields, browser origin/CSRF controls, bounded login/reset attempts, session expiry and revocation, and logout/account switching. Private history and offer responses must not be shared across users by application, CDN or browser caches. Select actual session/token settings against the pinned Payload version; installing auth does not establish these checks.

Exercise old-booking claims, simultaneous conflicting claims, email changes and account deletion/recreation. Ownership remains tied to the immutable customer identity; a changed contact address does not reassign records. Verify the approved distinction between booker, contact recipient and staying guest. Keep all new account screens and failures compatible with guest checkout.

Before payment creation, verify login/offer repricing and explicit quote acceptance. During active or uncertain payment, test immutable attempt context across back navigation, another tab, logout/login and staff offer changes. Test final voucher use under concurrency, offer expiry/withdrawal during payment, late discounted success after release, unknown create results, and abandoned stay-change payments. Zero-total behavior is a business/design gate; no zero-total confirmation path is assumed.

### Payment authenticity and refund limits

Follow [Maya's current webhook verification](https://developers.maya.ph/reference/webhook-security): use its signing input, RSA-SHA256 signatures, environment-specific rotation keys and a defined timestamp tolerance. Reject failed verification before changing state. Retried notifications can carry a new timestamp; deduplicate the payment transition independently. Confirm actual sandbox/production delivery before launch.

Persist void/refund requests before the external call. Enforce the approved refundable amount and the remaining verified collected amount under concurrency, reserving in-flight or uncertain refund amounts until reconciled. Repeated clicks, simultaneous staff requests, retries and owner dashboard/manual refunds must not cause the same money to be returned twice. Apply the actual merchant/method capabilities and current Maya timing rules; an uncertain response is not permission to submit another refund. See [Maya voids and refunds](https://developers.maya.ph/reference/managing-voids-and-refunds-in-maya-checkout).

## Deployment verification

These are required future checks; none are marked complete by this guide.

- [ ] Record the application dependency versions, supported Node/package-manager versions, build command, migration command, and meaningful validation commands once implemented.
- [ ] Verify the intended provider resources, correct environment scopes, migration result, and application build.
- [ ] Confirm the Vercel project is linked to the intended Git repository and deploys `main` to production. Record the actual deployment ID, source commit, READY status, alias, and live URL.
- [ ] Check public pages on desktop and mobile and verify staff/developer sign-in and access boundaries against the deployed application.
- [ ] Verify optional customer accounts, private booking history, selected verification/recovery and claim flows, customer/staff separation, checkout login continuity and guest checkout. Prove that email changes, account recreation and cache reuse cannot reveal another customer's booking.
- [ ] Verify room-photo upload and persistent delivery through the selected storage provider.
- [ ] Test a booking and concurrent attempts for the last room. Verify exactly one valid allocation and accepted server-calculated pricing.
- [ ] Verify Maya payment handling, repeated/out-of-order events, redirects before webhooks, late/duplicate payments, and recovery after a restart.
- [ ] Verify immutable quote/attempt versions, same-room date extensions, abandoned change payments, account-offer use limits and late-success allocation. Record the approved zero-total and discount calculation rules before enabling affected offers.
- [ ] Verify signature/timestamp/key-rotation failures and valid retried webhooks; prove that duplicate/concurrent/uncertain refund requests cannot exceed the remaining permitted amount or duplicate a completed refund.
- [ ] Verify a Brevo confirmation reaches the guest and required CC, and a staff password reset completes. Exercise delivery failures and quota handling.
- [ ] Verify direct bookings, changes, cancellations, refunds, and developer-only action logs under the agreed policies.
- [ ] Restore a backup into an isolated environment and verify the agreed recovery objectives.
- [ ] Complete the booking plan's full acceptance checks, staff training, and the agreed controlled production-booking verification and cleanup/refund process.
- [ ] Reconcile the opening room calendar with existing phone/walk-in bookings and blocks; complete the approved cutover, fallback and rollback procedures. Test cleanup must preserve payment and audit history and use recorded cancellations/refunds where applicable.
- [ ] Record the owner's approval of public business identity, contact/price/policy disclosures, privacy arrangements and applicable registration requirements. The owner or Philippine counsel must confirm current RA 11967/DTI obligations, including the Trustmark requirements applicable to the business; never display an unissued compliance badge.

Store verification dates and nonsecret evidence here when checks are performed. Keep sensitive booking/payment evidence in an appropriate protected location.

## Recovery and maintenance

Before launch, assign operational ownership, an alert recipient, maximum acceptable data loss, maximum recovery time, data/log retention, and a backup schedule. Supabase's included plan backups must be checked against those needs; do not assume a plan name guarantees sufficient recovery coverage.

Back up database records and uploaded objects under their respective recovery requirements. Test restoration without overwriting live bookings. A code rollback must account for database migrations and external payments; never erase a valid booking or payment simply to match an older deployment.

Supabase database backups contain Storage metadata, not the stored object contents; independently cover uploaded photos and other objects under the selected storage provider's recovery plan. See [Supabase backups](https://supabase.com/docs/guides/platform/backups). A successful database restore is not a complete media restore.

If restoring an older database snapshot, reconcile Maya payments/refunds, recent bookings and room allocations against the recovery point before reopening checkout. Temporarily restrict affected booking operations where their state is uncertain. Preserve later verified financial events and record the reconciliation; do not assume the restored database is current merely because the app starts.

**Recovery quarantine:** Start a restored environment with authentication/private-booking access, booking/offer writes, staff money actions, scheduled workers and outbound payment/refund/email work fenced off before application startup can use them. Checkout closure alone is insufficient: restored pending tasks may already have completed externally, and restored credentials/private links may have been revoked since the backup. Preserve and authenticate incoming provider notifications in a safe durable intake or approved replay process while business transitions are paused. Reconcile external payments/refunds, valid post-backup bookings, room allocations and voucher usage before rebuilding/releasing safe tasks. A named operator must authorize resumption; stale workers must remain unable to commit.

Reconcile restored customer/staff credential versions, roles, deactivations, recovery contacts and booking claims as well as financial state. Invalidate restored sessions and outstanding recovery/claim/booking-view tokens through the tested recovery procedure; revoked links or old password hashes must not become accepted again merely because the backup contains them. If current security evidence cannot be reconstructed, keep affected authentication/private-link access blocked and use an approved recovery process with independently verified authority rather than trusting a restored password or contact address. Preserve valid paid stays even if customer account access needs recovery. The recovery rehearsal must demonstrate how post-backup stay details and redemption state are reconstructed under the approved maximum data-loss target; a provider payment amount alone does not reconstruct room/date/contact details. If required evidence is unavailable, keep affected operations restricted and escalate for an owner-approved resolution rather than reopening uncertain inventory.

During an outage, preserve payment and booking references, reconcile provider state, and resolve uncertain outcomes before asking a guest to pay again. Follow the booking plan for unavailable rooms, overpayments, cancellations, and refund handling. Record the incident, recovery evidence, and follow-up changes in the relevant project documentation.

Assign a named technical operator and backup contact to review provider usage, email delivery, reconciliation failures, application errors, security updates and backup status. The owner pays provider bills directly; that alone does not perform these tasks. The optional ₱3,000/month plan covers original-scope bugs only and does not automatically include proactive monitoring, recurring backup checks, general upgrades or 24-hour incident response. Agree any additional operational service separately, while preserving applicable incident/confidentiality duties. Update this guide whenever configuration, operational responsibility, recovery behavior, or verified deployment details change.

## Owner-post preview — November 12, 2026

The static public review share now includes guest stories/upcoming events and an Admin Posts & events editor. Demo drafts and publishing operate only in browser memory; local photos use temporary object URLs. Reloading restores the source samples. No Payload endpoint, uploaded media store, anonymous published-only read policy or real owner authorization is configured by this mockup. Configure and verify those with the production application; do not treat demo publishing as a CMS write. The preview supports an Updates navigation link and the `?section=updates` review deep link.


## Implementation started — November 13, 2026

The user authorized the reviewed implementation plan and commits/pushes on `main`. Follow [implementation progress](implementation-progress.md) for current commands and evidence. Root scripts now exist; `pnpm local:setup` creates a protected local `.env` without replacing existing configuration, and `docker compose up -d database` starts only the dedicated Acornelia PostgreSQL service. Do not interpret local foundation checks as proof of hosted providers, production readiness or approval of unresolved business rules.


## Local database proof — November 14, 2026

The two foundation migrations and the PostgreSQL rollback/concurrency/exclusion proof passed locally, with an optimized Next build. See [current implementation evidence](implementation-progress.md#database-proof--november-14-2026). Use `pnpm db:migrate`; it currently refuses hosted targets. `pnpm test` uses only a verified `acornelia*_test` database on the dedicated local port 55432 and creates/removes its own fresh-upgrade fixture database. This is not production migration approval or hosted pooler verification.


## Identity setup — November 14, 2026

See [identity boundary and bootstrap](implementation-progress.md#identity-boundary--november-14-2026). Anonymous first-register is blocked; the first local operator uses `pnpm staff:bootstrap` with protected `BOOTSTRAP_ADMIN_*` configuration. It refuses hosted databases and existing staff. `CUSTOMER_AUTH_METHOD` is a future production activation setting, not approval of a method. `EMAIL_TRANSPORT` remains unset until delivery is implemented/verified. No credential or real customer account was created on a hosted service.


## Protected action-log evidence — November 14, 2026

[Protected-log implementation evidence](implementation-progress.md#protected-logs--november-14-2026) records transactional rollback, developer-only API/page exports, append-only SQL protection, secret rejection and real browser denial tests. Incoming request URL logging is disabled. The registry that authorizes internal requests is shared across Next module instances, while authorization remains tied to server-owned request identity. Current checks pass locally; production deployment, retention and recovery verification remain pending.


### Local content and media — November 14, 2026

After local migrations, run `pnpm seed:development` to create the provisional Warm Boutique review content. It requires `APP_ENV=development`, `DEVELOPMENT_FIXTURES=true`, and the exact local `acornelia_dev` database on port 55432. Existing CMS content is preserved. If no staff exist, the command creates the first local developer in an audited transaction and stores generated access details in `.local/development-access.json` with mode 0600. It never promotes an existing account or prints a password. This file is ignored and excluded from server build traces.

Development images persist in `media/`; isolated tests use `.local/test-media/`. Preserve development images with the database during backup. Both locations are excluded from server build traces. Public media routes authorize each new request; withdrawing a file does not remove previously downloaded copies. Failed upload/delete records remain private and require repair or a deliberate new upload. Production local storage/uploads remain disabled pending the hosted media adapter decision and integration proof.

Verified local checks cover published versus draft projections, private media denial, sanitized copy, required provenance/descriptions, global edit rollback on audit failure, and failed-upload recovery. Chromium desktop/mobile requests proved known private image URLs return 403, public images load, and withdrawal returns 403 again. These checks do not prove hosted object-storage access, durability or deletion recovery.


### Public website preview — November 14, 2026

Run `pnpm dev` after migrations and development seeding, then open `http://localhost:3042`. The local review uses Warm Boutique provisionally; the production design choice remains unanswered. The existing three-design comparison is preserved. The public site has a visible theme control, persists the browser preference, respects reduced motion, and supports mobile navigation and Escape/focus return in dialogs. Public pages consume current published CMS projections; contacts, policies and missing photography have explicit empty states rather than fabricated details.

Search passes only room-type ID, arrival/departure calendar dates and adult/child counts into `/book`. This stage validates structure and a positive stay; configured commercial occupancy, availability and pricing belong to later domain commands. The current handoff explicitly says booking/payment is unavailable. It creates no reservation and displays no invented total. Account checkout continuity, live availability, prices and payment follow in subsequent tasks.

`INDEX_PUBLIC_SITE` defaults to false. Enable it only in an accepted production environment; previews are noindex and their robots file disallows crawling. The production sitemap includes public routes and published room types only. The dynamic room-detail route resolves existence before a loading boundary so missing rooms return HTTP 404. Catalog sections have their own loading surface. This follows the [Next.js status-code behavior](https://nextjs.org/docs/app/api-reference/file-conventions/not-found): a response already streaming cannot change to 404.


The lockfile and `patches/@payloadcms__drizzle@3.93.0.patch` are required release inputs. Use frozen-lockfile installation; do not deploy an unpatched adapter. Rerun `tests/integration/commit-acknowledgement.test.ts` and the full database suite on dependency changes and the verified isolated hosted target. The [transaction fix record](../architecture/2026-11-14-transaction-commit-fix.md) explains the commit-time failure and proof.


### Stories, Events and enquiry workflow — November 14, 2026

Public Stories/Events live at `/updates`, with All, Stories and Upcoming filters. `/updates/[slug]` reads the current published state on every request. Upcoming uses the configured property calendar date; local fixtures use the proposed Asia/Manila timezone. Dates are validated `YYYY-MM-DD` text, independent of the viewer timezone. Returning a post to draft with Payload's unpublish action removes public list/detail access immediately. Saving an editorial draft preserves the last published copy. Public native Posts API access is denied; public pages receive only sanitized DTOs. Staff-only preview lives at `/updates/preview/[id]` and is no-store/noindex.

`/events` explains the enquiry path without inventing venue facilities, capacity or package prices. The contact page supports general enquiries. Event enquiries snapshot the selected published title/date. A post withdrawal does not withdraw independently public/shared media; change the media access class separately. Private or incomplete media cannot be attached when publishing a post. Already downloaded copies cannot be retrieved.

Enquiries persist contact details, explicit privacy consent, an immutable contextual snapshot and one delivery-work reference in the same audited transaction. They allocate no room, create no booking and collect no money. The JSON body is bounded to 16 KiB. Nonce/fingerprint checks make an identical retry return its original result and reject a changed replay. A local technical limit of three submissions per email per hour is tested under concurrency; this is not approved production abuse/retention policy. Production submissions remain disabled until the approved policy includes enquiries. The privacy notice, recipient, retention, operational response owner and hosted abuse controls still require production verification.

Work is queued with an enquiry record ID only. Delivery execution and Brevo transport remain Tasks 13/20; a received enquiry is not an email-delivery claim. Staff can review saved enquiries in the protected CMS. Development seeding adds labeled sample stories/events, preserves existing records, and stores a synthetic flag. Production projections exclude sample posts and production publication rejects them.

The combined local suite has 68 passing automated checks and 32 Chromium desktop/mobile browser checks. Separate sessions proved draft preview, publication, reload persistence and immediate withdrawal. Direct private Posts requests failed, and contextual enquiries created no allocation/payment. A proposed property-midnight boundary was tested. These checks do not approve the production timezone, contact/retention policy, venue material or hosted providers.


### Customer access and checkout continuity — November 14, 2026

The local customer pages are `/account/login`, `/account/register`, `/account/activate`, `/account/recover` and `/account/reset`. The controlled POST routes live under `/api/identity/customer/[action]`. Native generated customer authentication endpoints are blocked to keep responses, expiry and recovery under the application's tested policy. Customer profile create/update remains denied on generated collection routes; narrow server actions use whitelisted data and verified token authority for the required privileged writes.

The candidate registers name/email, then asks the recipient to choose a password during activation. Passwords require 12–128 characters in this candidate. A verification grant lasts 60 minutes; a reset grant lasts 20 minutes. Both are one-use and bind the current account/email/security revision. Reset clears active sessions and invalidates other old grants; it does not log in automatically or reactivate an inactive account. Registration does not overwrite an existing verified account. The unused native verification token is cleared rather than retained as an alternate activation path. Signup/recovery acknowledgements remain generic under missing, existing, inactive and throttled addresses. Three email instructions per address/purpose/hour is a local technical cap, not an approved production abuse policy. Dummy password work reduces obvious differences in failure paths; it is not a measured constant-time claim.

Auth mail parameters are encrypted in `auth-deliveries`, with hashed grants in `auth-tokens`. Work refers only to the delivery ID. No auth links go into the booking-confirmation CC. The email worker/transport remains Task 20. Future templates must use `/account/activate#token=...` or `/account/reset#token=...`: fragments are read and removed by the browser, so the token does not enter the HTTP page URL or referrer. Redemption is an explicit POST. Private responses use no-store and no-referrer. Tests decrypt synthetic outbox records to capture mail; no real email was sent.

Checkout drafts last 30 minutes from creation and require both an opaque HttpOnly reference and a separate browser binding. Draft contact/state is encrypted with authenticated row scope. The application secret protects this short-lived state; rotating it invalidates those drafts and pending auth-delivery parameters. These are not retained financial records. Preserve the current secret for ordinary local restarts. A rotated/recovered environment must cancel/reissue pending auth instructions through the later recovery procedure rather than replay old links.

`POST /api/checkout/draft` accepts only validated stay/guest/contact fields. It rejects financial or ownership fields. Version checks reject a stale tab update. Starting a new selection can create a fresh draft after an expired reference; ordinary saves do not extend the server deadline. The cookie never appears in a return URL. Login, failure and cancellation preserve the guest draft; a successful customer save binds only that prospective draft to the authenticated customer ID. It does not attach past bookings or reprice an accepted attempt. A draft owned by another account cannot be resumed. Logout clears the browser's draft cookies, and identity transitions fetch a fresh document to discard the current page's private router state. Complete cross-tab lifecycle/visibility handling remains Task 25.

Return destinations are a fixed allowlist: `/book`, `/account`, `/account/bookings` and `/account/offers`. Account discovery by email is not a public API. A staff session must explicitly switch to a customer or guest session for personal website checkout; staff booking operations remain separate. The local neutral invitation copy still needs production approval.

Cookie-authenticated non-browser test clients must supply the configured Origin or an accepted Sec-Fetch-Site header. Payload's pinned extraction policy rejects cookie-only requests with neither header. Browser requests supply the metadata automatically. Tests explicitly verify an active session before asserting its revocation; an anonymous response from an incomplete test request is not revocation evidence.

Production access remains disabled until Decision 05, the approved policy sections, delivery credentials, privacy/retention terms and isolated provider checks are complete. Current generic acknowledgements do not prove email delivery, production account creation or permission to use mailbox control as historical-booking claim evidence.


### Isolated test database setup

After starting the dedicated local database, create the isolated test database once if it does not exist:

```sh
docker compose exec -T database psql -U acornelia -d postgres -c 'CREATE DATABASE acornelia_test'
```

PostgreSQL rejects an already existing name; this command does not reset it. The test harness verifies the exact local target before truncating its fixture tables. Development data remains in `acornelia_dev`. The test database is required for `pnpm test` and the Chromium browser suites.

Development seed images now live in tracked `fixtures/media/`, so a fresh clone does not depend on the separate `.lavish` review workspace. The two copies match the originals and are excluded from server build traces. Existing CMS records and design artifacts are preserved.


### Customer booking history and historical claims — November 15, 2026

Customers can open `/account/bookings` and its individual booking pages. `/api/customer/bookings` accepts only an optional opaque cursor; clients cannot choose an owner. Every lookup rechecks an active, verified customer and filters by the immutable customer UUID. Generated booking/payment endpoints and relationship expansion remain denied to customers. Responses are private, no-store, no-referrer and noindex on pages. History shows booking status, accepted totals when present, booking contact, staying guest and recorded payment states. Provider references, checkout URLs, private quote context and staff notes are excluded.

The history cursor is encrypted, customer-bound and valid for 30 minutes. Pages contain 20 bookings, ordered by arrival and ID. More than 1000 payment rows for the selected page fail closed for operator review instead of silently displaying incomplete activity. A database failure returns an unavailable response rather than an empty history. Account changes, reused/shared mailboxes and new registrations never bulk-import earlier bookings. Logout clears the current session; complete cross-tab and restored-state lifecycle guarantees remain Tasks 25/26.

Migration `20261115_182340_customer_history_claims` changes the existing owner column to a UUID relationship without replacing it. Existing values must be valid customer UUIDs; invalid legacy records stop the migration and need reviewed repair. Restrictive foreign keys preserve links, and a database trigger refuses changing or clearing an existing owner. Customer deletion must follow the later retention/tombstone procedure; hard deletion cannot orphan owned bookings. Keep these custom guards when generating future schema migrations.

Historical claims have no enabled customer HTTP/UI path. Decision 05 still needs independent historical evidence, shared/reassigned mailbox treatment, third-party authority, approved review records, delivery recipients and recovery ownership. A public booking code, current matching email, copied confirmation or booking-view link provides no claim authority. The internal protocol requires an explicitly approved `historical-claims` policy with method `staff-reviewed-original-evidence` and a 1–60 minute token lifetime. Only a developer reviewer can record the completed independent review reference and issue a grant. This protocol is a tested candidate, not evidence that a real review or production recovery route has been approved.

Claim grants store a purpose-specific token digest, target booking/customer, reviewer, review reference, policy revision and customer security revision. Explicit attachment consumes the grant and assigns only a still-unowned booking, with the action log in the same serializable transaction. Expired, used, conflicting and insufficient-evidence results remain distinct internally. Concurrent approved claimants produce one owner; audit failure rolls back both attachment and consumption. Conflict recovery does not reassign an owned booking.

Booking-view capabilities have a separate table, digest scope, verifier, expiry and revocation. They authorize a view of one booking and never grant account ownership or reveal the booker's internal customer ID. Creating and delivering guest view links during checkout remains Tasks 14/16/20. No claim or view secret is included in an audit entry or the booking-confirmation CC. Restore invalidation remains Task 26.

Validation on November 15: 92 automated checks and 46 Chromium desktop/mobile checks passed. The relationship upgrade preserved an existing text UUID owner and its accepted booking data. Claim races, one-use expiry/revocation, audit rollback, shared mailbox non-inheritance, direct relationship denial, foreign detail 404, private headers and post-logout denial were verified. Lint, TypeScript, the local development migration and optimized build passed. Local fixture screenshots were inspected in light and dark themes. Safari, actual devices, approved production recovery and provider delivery remain pending.

### Shared physical-room inventory — November 15, 2026

Physical `rooms` now reference marketing `room-types`. New availability requires a published, on-sale type with a configured whole-person capacity, and an on-sale physical unit of that type. Existing unmapped rooms are preserved and unavailable until explicitly classified. Removing a unit/type from sale does not release allocations or change existing bookings. Marketing publication and inventory sale state remain distinct.

The domain validates the approved `stay` snapshot before search or booking allocation: property timezone, minimum/maximum nights, lead/advance days, same-day cutoff and supported turnover. No production defaults are supplied. The current supported product is overnight stays with explicitly approved same-day turnover. Different cleaning buffers, day-use products, multiple rooms, age bands or special capacity rules require their approved implementation before use. Adults and children both count toward the configured total capacity in the current candidate.

A physical unit must be free for every night. Availability never combines different rooms across nights. It returns only room-type ID/name/slug/capacity and a free-unit count, without physical room numbers, guest records, booking identifiers or block reasons. Calendar intervals remain half-open, using canonical UTC-midnight markers for property dates. The existing PostgreSQL exclusion remains shared by holds, confirmed stays and maintenance/owner blocks. An expired deadline alone does not free a hold: reconciliation must complete the release transition.

`allocate` and `release` are internal, trusted-transaction helpers. A raced exclusion raises `InventoryConflict`; the calling booking command must roll back and retry the entire database-only preparation with fresh inventory within a bounded limit. It must not retry inside an aborted transaction or dispatch external requests there. New booking allocations validate their booking dates/status and reject a second active allocation. Holds require a future deadline. Confirmation, reconciliation and late-payment handlers must preserve the accepted policy/context rather than invent a new checkout.

Allocation room, booking and dates are immutable. Hold-to-booking conversion is allowed; released rows cannot become active again, and rows cannot be deleted. Replacement stays require new allocations. The current release helper requires a terminal booking state or an authorized block transition. Task 22 must add the verified replacement-allocation case for active stay changes. Email-only workers cannot mutate inventory. Review these custom database guards when generating later migrations.

Developer-authorized block commands create their allocation, private block record and action log atomically. Release records the block transition and frees the allocation in one transaction. Block reasons remain private. Raw generated block writes remain denied, including for ordinary staff API calls. Production block authority requires an approved `inventory-operations` section; delegated staff permissions remain part of the operational policy/workspace decisions.

Opening inventory has a server-side preview of up to 500 rows. It validates dates, references and configured physical units, reports existing and within-batch overlaps, and performs no inventory writes. The preview audit records only its outcome. It never resolves conflicts or overrides bookings. Import application, current-state revalidation, approved opening records and operator acceptance remain Tasks 21/24/27.

`GET /api/booking/availability` validates its query and returns private/no-store responses. It rejects owner, policy and unrelated query fields. The current request context has no approved stay snapshot, so valid public requests return an explicit 503 preparation response. Task 11 supplies approved policy resolution; no default sample inventory or prices are exposed as real availability.

Historical upgrade fixtures insert only the columns present at their selected migration boundary. They do not use the current Payload model against an earlier schema. The full migration sequence is then applied and existing records/overlap guards are checked. This avoids a false upgrade failure when the current application adds a later room column.

Task 10 validation: all 102 automated checks passed, including last-room concurrency, adjacent/leap/month/year boundaries, full-stay unit selection, maintenance/booking conflicts, off-sale preservation, audit-failure rollback, direct SQL guards and denied email-worker mutation. Two focused Chromium desktop/mobile HTTP checks proved the unavailable-policy response, invalid-calendar rejection, query allowlist and no-store header. Lint, TypeScript, the development migration and optimized build passed. The earlier 46 browser checks passed at Task 09; no new hosted-provider or production-inventory claim is made.

### Approved policy versions and exact quotes — November 15, 2026

`policy-versions` stores immutable numbered rule snapshots and approval references. A unique database index permits one active version. The active pointer may change; previous rule contents cannot be rewritten or deleted. Request context resolves the active approved record, and each business command validates its required sections. Missing, invalid or production-synthetic configuration returns an unconfigured context rather than a default business policy. Synthetic snapshots are usable only in isolated tests or development with `DEVELOPMENT_FIXTURES=true`. This does not approve their contents for production.

Rate plans are immutable versions tied to a room type and policy version, with an explicit stay-date window and approval reference. New quotes select the latest approved matching rate revision. Existing quotes retain their complete rate and policy snapshots. Native rate/policy writes remain denied; authorized publication/activation controls are part of Task 24. No production rate, fee, tax, cutoff, capacity or policy version was created in this implementation pass.

The current calculator supports PHP minor-unit strings, overnight nightly rates, configured weekend days, exact-date special-night overrides, included adults, per-night extra adults/children, fixed/per-night/percentage fees and noncompounding percentage taxes. An exact-date override takes precedence over the weekend rate; other dates use the normal rate. The configured discount applies to room/guest charges before fees. Percentage fees use that discounted subtotal independently. Tax basis explicitly selects the discounted room/guest subtotal or that subtotal plus fees. Each percentage line rounds half up to one minor unit. All amounts and multiplication/division use bigint; JavaScript floating point is not used for money. These are supported formulas, not selected Acornelia commercial or tax terms. Unsupported currency, turnover, rounding or formula products require their approved implementation before use.

Quote inputs contain the stay selection. Clients cannot supply a total, rate, fee, discount, policy snapshot or owner. Quotes include a complete breakdown and fixed policy/rate/offer version references. Offers are connected through the same calculator in Task 12; they cannot become a second price engine. Technical input bounds include 38 digits per configured amount, at most 365 calculated nights, 30 fee lines and 30 tax lines. Approved stay limits may be stricter.

`POST /api/booking/quotes` issues a private quote and sets the separate HttpOnly quote-browser cookie. The server stores only its scoped digest. A customer-owned quote also requires the same active verified customer; a different account cannot inherit it. Guest quote continuity uses the original browser. Staff personal website checkout still requires switching to a customer/guest session; authorized direct-booking operations remain separate. Quote issuance reserves no room and creates no payment attempt.

`POST /api/booking/quotes/accept` accepts only quote ID and presented version. The original browser/account binding is checked. Acceptance and its action log commit atomically; an identical retry returns the original accepted snapshot. An expired unaccepted quote needs a fresh presented price. Already accepted snapshots remain readable/idempotent after their presentation lifetime; this does not extend their validity for starting a new checkout. Task 14 must check freshness before a new preparation, while an existing payable/uncertain attempt retains its frozen context regardless of later public quote expiry.

The `pricing` section must explicitly configure the supported currency, a 1–60 minute presentation lifetime and either unavailable or approved no-payment handling for zero totals. Zero is unavailable unless explicitly approved. A zero quote is not a payment or booking confirmation; the atomic no-payment booking path belongs to Task 14. Negative totals fail. No provider success is fabricated.

Quote business fields and acceptance identity/time are protected by database triggers. A quote may be consumed by one booking and cannot be reassigned after consumption. Later rates, changed policy pointers, login attempts or client amounts cannot edit its financial context. Logout clears the quote-browser cookie. Private API responses use no-store/no-referrer, and public quote responses omit internal policy/rate snapshots. Recovery invalidation and complete cross-tab lifecycle handling remain Tasks 25/26.

Task 11 validation: 118 automated checks and all 50 Chromium desktop/mobile checks passed. These include exact large amounts, special/weekend dates, child/extra charges, fee/tax order, per-line rounding, immutable rate/quote SQL guards, original-price retention, browser/account switching, expiry, audit rollback, input tampering and explicit zero-total behavior. Fresh upgrades, lint, TypeScript, the local development migration and optimized build passed. Tests used isolated synthetic approvals and sent no payment/email request. Production terms, operator publication controls, provider delivery and release approval remain pending.

A follow-up HTTP regression verifies that missing or invalid server pricing approval returns 503 preparation, while invalid entered stay data returns 400. The corrected route passed four focused desktop/mobile quote checks and the 118-test suite.
