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
