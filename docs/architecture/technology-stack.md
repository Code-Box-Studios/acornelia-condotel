# Technology stack and provider decisions

**Updated:** November 12, 2026 (Payload selected for optional guest accounts; other provider selections retained). Full infrastructure pricing comparison dated November 5; limited entry-price rechecks recorded below.

**Architecture review:** November 9, 2026. Core provider entry-price/allowance spot-checks remain consistent with the dated figures below; alternative-provider prices and the PHP exchange basis were not refreshed. See the [legal and technical audit](../proposal/2026-11-09-legal-technical-audit.md).  
**Limited entry-price recheck — November 11, 2026:** [Vercel Pro](https://vercel.com/pricing) remains $20/month, [Supabase Pro](https://supabase.com/pricing) starts at $25/month, and [Brevo](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans) lists Free at $0, Starter from $9 and Standard from $18/month. The [costing sheet](../proposal/costing.md#what-the-5000-monthly-allowance-represents) now shows the subscription baseline and unallocated room within the ₱5,000 allowance. PHP conversions, other provider alternatives and unresolved service quotes were not refreshed. A paid Brevo tier is still unselected.  
**Status:** Stack selected for the planned application. Provider accounts, paid plans, integrations, and production deployment have not been verified for this project.  
**Related:** [Booking plan](../superpowers/plans/2026-11-05-acornelia-website-plan.md), [deployment guide](../operations/deployment.md), and [documentation index](../README.md).

## Selected stack

| Technology | Responsibility | Decision and reason |
| --- | --- | --- |
| Next.js + TypeScript | Public pages, booking screens, and server endpoints. | Retain the existing intended application stack. |
| Payload CMS | Staff administration, content, room information, guest/staff/developer authentication, and access control. | User selected Payload for optional guest accounts on November 12. Guest checkout remains available. Keep one application with custom booking logic and separate customer/staff permissions. |
| Vercel | Host the Next.js + Payload application. | Preferred for deployment convenience and low infrastructure maintenance. Compare total costs if usage or team size grows. |
| Supabase PostgreSQL | Managed database for Payload and custom booking records. | Explicitly selected by the user instead of Neon. PostgreSQL supports the transactional booking rules required by the plan. |
| Brevo | Transactional booking confirmations and staff password resets. | Explicitly selected by the user instead of Resend. Delivery must include the required booking-confirmation CC and support recovery from failures. |
| Maya Checkout | Hosted payment collection and server-side payment verification. | Retain the payment provider in the booking plan. Production merchant activation and enabled methods require verification. |

The application remains one Next.js + Payload deployment with one shared reservation system. The database must enforce the booking plan's no-overlap rule. Payment, cancellation, refund, and email-delivery status remain separate concerns. See [the complete business rules and acceptance checks](../superpowers/plans/2026-11-05-acornelia-website-plan.md).

Payload supports deployment on Vercel and integration with PostgreSQL. These capabilities provide a foundation; they do not implement the reservation rules automatically. See [Payload deployment](https://payloadcms.com/docs/production/deployment) and [its PostgreSQL adapter](https://payloadcms.com/docs/database/postgres).

## Service boundaries

- **Supabase is selected for PostgreSQL.** Payload is selected for optional guest accounts as well as staff/developer sign-in and application permissions. Supabase Auth remains an unselected alternative; Storage, Realtime and Edge Functions are not automatically part of the selected scope.
- **Guest and staff actions pass through the application.** Keep database credentials on the server. Public availability responses must not expose guest records or protected action logs.
- **Payload does not replace the booking module.** Custom code must handle prices, room allocation, holds, payment attempts, verified Maya events, controlled staff actions, and recovery.
- **Brevo handles transactional delivery.** Marketing email campaigns remain outside the selected launch email scope. Customer account offers do not by themselves enable promotional mail or SMS. A paid booking stays confirmed when an email fails; persist the email task and retry it.
- **Maya handles the payment page.** A browser redirect or screenshot does not confirm payment. Apply the server-side checks in the booking plan.
- **Photo storage remains open.** Cloudflare R2 was recommended during comparison; Supabase Storage is another candidate. No storage provider has been selected or configured. Production uploads need persistent object storage.
- **Scheduled-job execution remains open.** Expired holds, payment reconciliation, and email retries are required. Select an authenticated runner that can process durable work after a restart.

## Why these choices

Vercel fits the intended Next.js deployment and reduces server administration. The choice favors deployment convenience; it is not a claim that every workload will be cheapest there.

Supabase replaces the earlier Neon recommendation because the user selected it. Its additional services can be evaluated separately if they reduce complexity. Replacing Payload authentication or adding a second account system requires a separate architectural decision.

Brevo replaces the earlier Resend recommendation because the user selected it. Its current free allowance offers more daily sends than Resend's free allowance, with daily limits and branding to consider. The integration still needs sender verification, a Payload-compatible delivery adapter, and testing.

## Guest account authentication comparison — November 12, 2026

**Confirmed user decisions:** Guest checkout remains available, and the user selected Payload for optional guest registration and login after comparing it with Supabase Auth. Registration and login must not become prerequisites for booking. Existing staff/developer authentication also stays assigned to Payload. Supabase Auth was considered and was not selected.

The user clarified that the optional accounts are **customer accounts belonging to the person making a room booking**. They do not grant access to the property's staff administration or publishing tools. A customer may still book without an account through guest checkout.

The [November 12 specification review](2026-11-12-specification-review.md) adds requirements for immutable customer ownership, explicit historical-booking claims, account-versus-contact identity, session/private-cache checks, frozen payment quotes and consistent offer allocation. These clarify the selected architecture; they do not approve login methods, promotion values or third-party booking policies. Review the linked questionnaire supplement and operational checks before implementation.

**Requested customer benefits:** The user requested booking history plus vouchers or special offers available to **every customer with an account**. The user also requested a checkout prompt inviting a customer to log in when their email matches an existing account. The [booking specification](../superpowers/plans/2026-11-05-acornelia-website-plan.md#guest-checkout-and-optional-accounts--november-12-2026) records private history, member offer eligibility, the proposed neutral sign-in prompt, checkout-state preservation, safeguards and unresolved promotion rules. Matching an email does not authenticate a customer or authorize access to their bookings.

**Reason for the selected provider:** Booking and content already pass through the planned Next.js + Payload application, so native customer authentication avoids adding another guest identity/session integration. A separate Payload customer collection is the recommended implementation approach. Email/password login and saved contact details remain proposed implementation/convenience choices; booking history and account offers are now user-requested requirements. Configure customer permissions separately from staff and developer access. Offer management, discount validation and safe redemption remain custom application work; selecting Payload does not provide a completed promotion system.

| Consideration | Payload accounts | Supabase Auth |
| --- | --- | --- |
| Email/password, verification and recovery | Built-in account operations and configurable email verification/reset flows. Guest screens and delivery integration still need to be built. | Managed authentication with password, email-link/OTP and social sign-in options. Guest screens and application permissions still need to be built. |
| Google/Apple login and passwordless options | Additional integration through custom authentication strategies or a deliberately selected integration. | Documented social and passwordless flows; provider setup, callbacks and account linking still require work. |
| Fit with this application | Customer identity can be used directly in Payload access rules and booking relationships. The application team runs authentication with the app. | Guest identity must be validated and mapped to the application's customer/booking permissions. If staff remain on Payload, two authentication systems must be configured and tested. A Supabase token does not automatically authorize Payload records. |
| Mobile or direct Supabase services | Can serve mobile clients through application APIs. | Worth considering when a mobile client, social login or direct Supabase data/storage access is a committed requirement. Direct data access needs its own authorization design and must not bypass booking rules. |
| Authentication charges | No separate hosted-auth subscription or per-active-user fee for the native Payload approach; existing hosting, database, email, operations and usage costs still apply. | Auth is included within the selected Supabase project's plan allowances. Using Auth on that same project does not automatically add a second Pro subscription. Extra usage, email, SMS and optional features can add cost. |

**Official sources checked November 12, 2026:** [Payload authentication](https://payloadcms.com/docs/authentication/overview), [Payload custom strategies](https://payloadcms.com/docs/authentication/custom-strategies), [Payload access control](https://payloadcms.com/docs/access-control/overview), [Supabase Auth](https://supabase.com/docs/guides/auth), [Supabase pricing](https://supabase.com/pricing) and [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

**Cost assumptions:** Supabase currently lists 50,000 monthly active users on Free and 100,000 on Pro, then $0.00325 per additional monthly active user on Pro. Pro starts at $25/month; that is the existing project's plan baseline, not an additional guest-login bill. These are standard Auth allowances, not a total operating quote or a statement that a paid plan has been purchased. Email delivery and other usage remain separate. For production Supabase email flows, configure custom SMTP; Brevo is explicitly listed as compatible. The built-in test sender is restricted and is not the production email solution. Payload would also need its configured email adapter and delivery verification.

Both approaches require server-enforced booking ownership, a safe process to claim earlier bookings, verification and recovery flows, and regression checks for guest checkout. Guest checkout should create an ordinary guest reservation; a Supabase anonymous-auth account is not required. Existing Maya verification, room allocation and owner-only posting rules continue to apply.

Revisit this choice if Google/Apple login, passwordless access or a mobile application makes another approach preferable. No authentication packages, account collections, provider settings or production flows were created or verified by this decision. Scope, schedule and development-price implications remain to be agreed. The [browser review](../../.lavish/acornelia-guest-auth-options.html) uses the existing Acornelia design tokens and records Payload as the selected provider, with Supabase Auth retained for comparison.

## Cost assumptions

For the proposed PHP development quote, current currency conversion, email-plan comparisons and first-year planning amounts, use [the proposal costing sheet](../proposal/costing.md). The USD figures below remain provider baseline comparisons rather than an accepted client quote.

These are planning figures in USD, not an invoice, a fixed total, or approval to purchase subscriptions. Refresh provider prices before provisioning or changing plans.

| Service | Current entry pricing and limits | Project implication |
| --- | --- | --- |
| Vercel | Pro starts at $20 per developer per month, with additional usage charges possible. Hobby is restricted to personal, noncommercial use. | Budget for Pro for the commercial website. Existing team billing may change the incremental cost of this project. [Pricing](https://vercel.com/pricing), [Hobby rules](https://vercel.com/docs/plans/hobby). |
| Supabase | Free includes a 500 MB database and pauses projects after one week of inactivity. Pro starts at $25/month and includes compute credit covering one Micro instance and daily backups with seven-day retention. | Free can support evaluation within its limits. The production recommendation is Pro plus a tested recovery process. The subscription tier is still unselected. [Pricing](https://supabase.com/pricing). |
| Brevo | Free includes 300 sends/day, with no carryover, and Brevo branding. When the daily limit is reached, transactional messages may queue; excess beyond the provider's documented queue can be lost. | Confirm the expected recipient volume and branding requirement. Preserve application delivery tasks and alert on failures or quota exhaustion. Select a paid tier if needed. [Free-plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan). |
| Maya | The applicable merchant fees and settlement terms have not been verified. | Obtain the merchant's actual terms. Do not assume a percentage or settlement schedule. |
| Photo storage and scheduled work | Provider and configuration remain open. | Add storage, request, transfer, image-processing, and job costs to the estimate when selected. |

Two useful baseline scenarios:

- **$20/month:** one Vercel Pro developer, Supabase Free, and Brevo Free, within their allowances. This is an evaluation or limited-usage scenario, not a completed production-readiness assessment.
- **$45/month:** one Vercel Pro developer, Supabase Pro with one Micro database covered by its included compute credit, and Brevo Free, within included allowances. This is the recommended production budgeting baseline, subject to actual capacity and recovery requirements.

Both exclude applicable taxes, domain charges, Maya fees, overages, additional environments/projects, larger compute, storage choices, job execution, optional recovery add-ons, and maintenance. Adding Supabase Pro changes the earlier Neon-based $20 estimate; do not reuse that estimate as the full production budget for this stack.

The required CC to `codeboxstudios.official@gmail.com` is part of email capacity planning. Measure the provider's recipient accounting for guest messages, CC copies, password resets, and retries during integration; do not equate one booking with one send.

## Original plan retained — November 11, 2026

After reviewing lower-cost hosts and Supabase tiers, the user chose to retain the original plan: **Next.js + TypeScript + Payload CMS on Vercel, Supabase PostgreSQL, Brevo and Maya Checkout**. The production budgeting reference remains Vercel Pro plus Supabase Pro, with Brevo Free or a separately approved paid email tier. The approximate ₱5,000/month allowance and original commercial terms remain. This is a provider/planning decision, not a purchase or verification of paid tiers, accounts or a deployment.

The [hosting and database comparison](2026-11-11-hosting-and-database-options.md) is retained as a historical comparison. Its DigitalOcean testing suggestion was not adopted. Photo storage, scheduled jobs, the domain/registrar and exact account/tier configuration still need confirmation. The [client-facing proposal](../proposal/client-proposal.md) presents the retained plan without the abandoned alternatives.

## Alternatives discussed

These are comparison options, not additional selected services. Prices are the dated snapshot above and need refreshing before a switch.

| Area | Alternative | Why it remains an alternative |
| --- | --- | --- |
| Hosting | Railway | $5/month minimum usage, with resource charges above the included credit. Convenient deployment, but the minimum is not a fixed production bill. [Pricing](https://railway.com/pricing). |
| Hosting | Render | A 512 MB app instance starts at $7/month; the 2 GB tier is $25/month. Payload memory requirements need validation, and database/jobs can add cost. [Pricing](https://render.com/pricing). |
| Hosting | Cloudflare Workers | Paid plan starts at $5/month. Payload documents Workers deployment; adapters, database access, image processing, and jobs still need validation for this application. [Pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Payload deployment](https://payloadcms.com/docs/production/deployment). |
| Hosting | DigitalOcean VPS | Example sizes are $12/month for 2 GB RAM and $24/month for 4 GB. App and PostgreSQL can share a server, subject to sizing tests; the team owns server maintenance and recovery. [Pricing](https://www.digitalocean.com/pricing/droplets). |
| Database | Neon | Earlier low-usage PostgreSQL recommendation; replaced by the user's Supabase selection. Autoscaling, active compute, and recovery affect the eventual bill. [Pricing](https://neon.com/pricing). |
| Database | PostgreSQL on Railway or a VPS | Can consolidate infrastructure, but database resources, backups, and operational ownership still need budgeting. [Railway pricing](https://railway.com/pricing), [DigitalOcean pricing](https://www.digitalocean.com/pricing/droplets). |
| Email | Resend | Earlier recommendation; replaced by Brevo. Free currently offers 3,000 emails/month and 100/day; Pro starts at $20/month for 50,000. [Pricing](https://resend.com/pricing). |
| Email | Amazon SES | Base outbound pricing is $0.10 per 1,000 emails, with additional applicable charges. More AWS setup and operational work; revisit if email volume makes it worthwhile. [Pricing](https://aws.amazon.com/ses/pricing/). |
| Email | Postmark | Basic starts at $15/month for 10,000 emails. Another transactional provider, with a different allowance and feature set. [Pricing](https://postmarkapp.com/pricing). |
| Photo storage | Cloudflare R2 | Free allowance includes 10 GB-months plus request allowances; no egress charges. A candidate for persistent room photos, with integration and total usage still to be assessed. [Pricing](https://developers.cloudflare.com/r2/pricing/). |

## Decisions still needed

- Production subscription tiers, budget owner, provider accounts, regions, and resource sizing.
- Persistent photo-storage provider and its Payload adapter.
- Scheduled-job runner, frequency, authentication, retry limits, alerts, and recovery ownership.
- Brevo integration transport, authenticated sending domain/address, branding decision, and sending allowance.
- Database recovery objectives, retention, restore testing, and any additional backup coverage.
- Domain, launch date, maintenance responsibility, and business policies listed in the booking plan.

Record future changes here with their date, reason, cost consequences, and setup status. Update the linked operational requirements and booking plan when a change affects them.

## Design-review distribution — November 12, 2026

The guest prototype was shared publicly on [ht-ml.app](https://ab73db76.ht-ml.app/) after the user reported a failed publish. This is static review distribution only. It does not replace Vercel or alter the selected production stack, paid tiers or cost assumptions. The [operations guide](../operations/deployment.md#public-design-review-preview--november-12-2026) records the observed request-size limit, optimization, publication evidence and protected update-credential handling.


## Implementation baseline — November 13, 2026

The user authorized implementation and pushes on `main`. The root application now locks Next.js 16.4.6, Payload and official adapters 3.93.0, React 19.3.1, TypeScript 5.9.3, Vitest 5.1.0 and Playwright 1.65.0. Installed Node 24.22.1 and pnpm 12.5.1 match the toolchain. Foundation unit, lint and type checks passed; database/build/provider proofs remain separate.

A dedicated local PostgreSQL 17 container supports isolated development and transaction testing. It does not replace the selected Supabase production database. Production media storage and scheduled runner remain unresolved. No paid tier, new provider, subscription or price change was selected. See [implementation progress](../operations/implementation-progress.md).


The November 14 database proof pins direct `pg` and `@types/pg` to 8.20.0, matching the Payload adapter, rather than retaining independently newer driver/types. Payload uses UUID keys, explicit serializable transaction contexts, disabled schema push and reviewed PostgreSQL exclusions/checks. Local proof and build pass; hosted Supabase/Vercel behavior remains a separate integration gate. No provider pricing or subscriptions changed.


### Local media implementation — November 14, 2026

A local Payload filesystem adapter is implemented for development and isolated testing. This adds no hosted storage subscription and makes no production cost claim. Media metadata records source, license, description, synthetic status, access class and storage state. Production uploads and local disk storage are disabled until Decision 10 approves a durable adapter; no storage provider was provisioned. The public catalog has separate room types, leaving physical-room allocation records under controlled booking commands.


### Pinned database-adapter correction — November 14, 2026

The Payload Drizzle 3.93.0 dependency has a versioned pnpm patch for commit-error propagation. A real PostgreSQL test caught false success after a commit-time rollback; the patched adapter passes deferred-error and concurrent-submission proofs. See the [cause, patch and upgrade requirements](2026-11-14-transaction-commit-fix.md). This changes no provider selection or subscription.


The test toolchain now pins Vite 8.3.8 and esbuild 0.28.2 explicitly. The prior lockfile bound one Vite instance to an incompatible esbuild peer through another dependency. Explicit compatible test dependencies corrected that binding; `pnpm peers check` reports no peer issues. Existing deprecated transitive CLI packages remain upstream dependencies.


### Customer authentication candidate — November 14, 2026

The user selected Payload for customer accounts. The exact login/recovery method remains an unanswered Decision 05. The local candidate is email/password with email-first activation: registration sends a one-use link; the email recipient then chooses the password. A random unknown placeholder prevents an attacker from choosing a future account holder's initial password through pre-registration. Existing verified accounts are not overwritten by registration.

Payload remains the credential/session authority. The application calls its public authentication operations and emits its standard HttpOnly cookie; tokens do not enter the JSON response. Controlled routes replace generated customer login/verification/recovery/reset/refresh/logout HTTP surfaces. Customer accounts remain separate from staff accounts. Registration and recovery return generic acknowledgements, and checkout shows the same neutral login/guest invitation for all valid email addresses. Similar addresses never establish identity.

Activation/reset grants are hashed, expire, bind account/email/security revision, and are consumed in the same transaction as the protected change and action log. Delivery parameters are encrypted in a private outbox; actual transport remains Task 20. Production requires the selected method plus approved `customer-auth` policy; recovery additionally requires approved `customer-recovery` policy. This implements a candidate without declaring those decisions approved. No Supabase Auth integration or additional subscription was introduced.


Customer history uses Payload customer UUID relationships and PostgreSQL owner-immutability guards. It does not use email as an ownership key. The November 15 implementation includes a synthetic-tested operator-review claim protocol and separately revocable view capabilities. Production historical evidence and recovery authority remain Decision 05; no mailbox-only attachment or provider delivery has been enabled.

Physical inventory now shares PostgreSQL exclusion guards across all allocation purposes. Published marketing types and physical units have separate sale state. November 15 local tests use synthetic stay/operations policy snapshots; production rules and opening inventory are still unapproved. The public availability endpoint therefore fails closed until approved policy resolution is configured.
