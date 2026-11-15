# Acornelia Website and Booking Specification

**Version:** 2.0 draft.

**Updated:** November 13, 2026.

**Purpose:** Define the complete guest website, customer accounts, room booking, staff administration and operating requirements for Acornelia Condotel & Events Place.

This is the current requirements document for review. Requested features and engineering safeguards are specified below; open business policies are listed in section 10. It does not establish Client acceptance, amend commercial terms or prove that an application has been implemented or deployed.

[Project index](../../README.md) · [Technology decisions and costs](../../architecture/technology-stack.md) · [Deployment and recovery](../../operations/deployment.md) · [November 12 review](../../architecture/2026-11-12-specification-review.md) · [Previous specification](2026-11-12-acornelia-website-plan-before-consolidation.md)

## 1. Scope and decision status

Acornelia needs a welcoming website where a customer can understand the property, compare rooms, check availability and complete a reservation. Staff need one shared system for website bookings, telephone reservations and walk-ins.

The supplied brand goal is to provide a staycation that feels like home through timeless sophistication in every detail.

### Confirmed user direction

- Guests can browse rooms, rates and availability and book online.
- A matching, verified successful online payment confirms an eligible booking automatically. Staff approval is not required for each paid reservation.
- Guest checkout remains available. Creating or using an account is optional.
- Payload is selected for customer registration and login, as well as staff/developer authentication. Supabase is selected for PostgreSQL, not Supabase Auth.
- Customer accounts belong to the person making a booking. They include private booking history and vouchers or special offers available to every customer with an account.
- Checkout invites a customer to log in when their entered email matches an existing account; login remains optional.
- Staff manage property operations privately. Protected action logs can be read or exported only by developers.
- Confirmed bookings receive a unique booking code. Booking confirmations copy **codeboxstudios.official@gmail.com** for now.
- Launch booking channels are the website and direct bookings. Other booking websites and channel-manager integrations are not included.
- Public Stories and Events let authorized staff publish happenings and event announcements. Event enquiries do not create reservations or change inventory.
- Three guest design directions are available for review: Warm boutique, Bright resort and Modern minimal. One production direction remains to be selected.
- The selected application stack is Next.js, TypeScript, Payload CMS, Vercel, Supabase PostgreSQL, Brevo and Maya Checkout.

These are recorded user decisions and requested features. The Client's final versioned scope, operating policies and acceptance still require agreement through the separate questionnaire and contract process.

### Proposed operating defaults

The starting proposal is one property, overnight stays, one room per online booking, room-type selection with internal physical-room allocation, full online payment, Philippine-peso pricing and Asia/Manila property time. Start with a property-staff role and a separately controlled developer role. Events are inquiry-only and requested changes/cancellations are staff-reviewed.

These defaults are not settled business policies. Resolve them under Decisions 01–04 before building affected rules. Deposits, pay-on-arrival, hourly/day-use packages and multi-room online checkout are not silently enabled by this document.

### Scope control

The [functionality questionnaire](../specs/2026-11-05-acornelia-owner-questionnaire.md) gathers and reconfirms functional decisions. The [content questionnaire](../specs/2026-11-05-acornelia-owner-content.md) gathers real copy, photos and design approval. Review both against this specification.

The [contract](../../proposal/contract-draft.md) governs commercial/legal terms and identifies the approved specification and acceptance checklist. Customer accounts and account offers are requested additions awaiting scope and commercial reconciliation. This rewrite does not change the fee, payment milestones, support terms or schedule. Conflicting older answers require reconciliation rather than automatically replacing current decisions.

## 2. People and shared records

### People and access

| Person or role | Purpose and permitted access |
| --- | --- |
| Visitor | Browse public property content, room information, published posts and the booking journey. |
| Booker | The person placing a reservation. They may use guest checkout or a customer account. |
| Customer account | An authenticated booker who can view their own bookings and account offers. This grants no staff, publishing or developer privileges. |
| Staying guest | A person occupying the room. They may differ from the booker only under the approved third-party booking policy. |
| Property staff/admin | Authorized people managing rooms, direct bookings, stays, content, offers and permitted financial actions. Exact staff authority is subject to Decision 08. |
| Developer | A separately authorized role with access to protected action logs and required technical tools. Property admins cannot grant this role. |

### Shared concepts

| Concept | Meaning |
| --- | --- |
| Room type | A category with capacity, beds, amenities, photos and pricing. |
| Physical room | The actual room allocated internally. Room types and physical rooms must not be conflated. |
| Quote | A server-calculated price/version for selected dates and occupancy. A quote alone does not hold inventory. |
| Allocation | Capacity protected for a confirmed reservation, active payment hold, maintenance or owner block. |
| Booking | The reservation record, accepted stay/price/policy context and its operational status. |
| Payment attempt | One persisted provider-payment operation bound to an immutable accepted quote, purpose and booking/change revision. |
| Account offer | A voucher or special offer available to every registered customer under its published booking conditions. |
| Offer allocation/redemption | Usage reserved or consumed under the approved promotion lifecycle. Exact consumption/release rules remain Decision 06. |
| Booking-view link | A private, hard-to-guess, revocable means to view one guest booking. It is not a public booking code or an account-claim token. |
| Action log | A protected history of staff/system actions. Corrections append entries; ordinary application screens cannot edit or delete old entries. |

Account owner, booking contact and staying guest are distinct. An email address entered for contact delivery is not an ownership key or proof of identity.

## 3. Guest website and public content

### Public pages and booking screens

| Page or area | Required experience |
| --- | --- |
| Home | Property introduction, verified imagery, date/guest search, room discovery, property story, Stories and Events, and reservation actions. |
| Rooms and room details | Compare room photos, beds, capacity, amenities, inclusions, sample/from rates where appropriate, and applicable policies. |
| Available rooms | Show rooms suitable for the entire requested stay and occupancy, with a complete price for the selected dates. |
| Checkout | Review the room/stay, enter contacts and requests, optionally log in, review applicable offers and accept the full amount before payment. |
| Booking result | Distinguish confirmed, still checking, failed/unpaid, expired and cancelled outcomes using authoritative server state. |
| View my booking | Access one reservation through an authorized private link; obtain approved help or request a change/cancellation. |
| Customer access | Register, log in/out and recover access using the selected method, while preserving an in-progress checkout. |
| My Bookings | View the authenticated customer's own upcoming, completed and cancelled bookings and current booking/payment information. |
| My Offers | View current account vouchers/special offers with benefit, applicability, validity and usage conditions. |
| Stories and Events | Read published happenings and event announcements through the home-page Updates section and post detail views. |
| Events enquiry | View verified venue information and submit an enquiry with date, contact details and relevant post context. An enquiry does not reserve a venue. |
| About, contact and policies | Find verified property identity, address/directions, contact details, approved house rules and booking terms. |

### Design and accessibility

Use the supplied logo and established olive/gold family, readable typography and real property content. Retain image-led room discovery. The [design specification](../specs/2026-11-12-acornelia-guest-redesign.md) records the three compositions and their imagery; the [design language](../specs/2026-11-05-acornelia-design-language.md) records component foundations.

Support readable Day/Night themes, desktop and narrow-phone layouts, keyboard navigation, visible focus, labeled controls, meaningful image alternatives, clear errors and dialogs that close with Escape and return focus. The contextual mobile booking action supports room discovery and is absent during checkout/payment and staff work. Respect reduced-motion preferences.

The three-way design picker and Guest/Admin role selector are review controls. Switching review designs preserves the route, room, dates, occupancy and checkout input. Developer is hidden in that client preview. Production permissions are enforced on the server.

The user requested removal of visible AI badges while retaining the design and room photographs in the preview. Keep concept/sample disclosures and internal image provenance during review. Replace sample property details, rates and concept imagery with approved facts and photos before launch; do not invent reviews, amenities or location claims.

### Stories and Events

Authorized editors can create, edit, save drafts, preview, publish and return posts to draft. A post contains title, story/event type, summary, body, optional photo with alternative text, publication status/date and a production identifier/slug. Events require an event date before publication.

Public lists/details expose published records only. Provide All, Stories and Upcoming filters, a result count and a clear empty state. All is ordered by publication date. Upcoming includes published events dated today or later in the approved property timezone; past events remain readable in All. Full details use an accessible reading view. Story details can lead to Rooms; event enquiries preserve the selected title/date.

Publication changes invalidate public lists/detail caches. Upcoming refreshes at the property-date boundary. Draft previews and draft-only media require appropriate authorization. Define the withdrawal limits for shared or previously public media: unpublishing cannot retrieve copies already downloaded.

Reading posts does not require a customer account. Customer registration does not grant publication rights. Posts, event enquiries, account offers and room allocation remain separate workflows. See the [Stories and Events specification](../specs/2026-11-12-acornelia-updates-and-events.md) for content fields and current prototype boundaries.

<a id="guest-checkout-and-optional-accounts--november-12-2026"></a>

## 4. Customer accounts and guest checkout

### Customer purpose and functions

Accounts give returning customers one place to review their stays and access account benefits. Customers can register, access their private account, log out and recover access using the approved login/verification method.

**My Bookings** shows only the customer's own upcoming reservations and booking history, including completed/cancelled records, stay details, accepted prices, booking code when available, and current booking/payment state. Empty history has a clear message. Older guest bookings are not automatically inherited because an email matches.

**My Offers** makes current vouchers/special offers available to every customer with an account. It shows relevant conditions and an empty state when no offer is available. This is not a promise of a signup gift, unlimited discounts, individual targeting, points, tiers or one benefit per human.

Saved contact details, repeat-booking shortcuts and account-based change/cancellation requests remain proposed conveniences. Email/password login is also a proposal rather than a selected login method. See Decision 05 and Decision 06.

Guest checkout provides the complete ordinary booking journey without registration or login. Authenticated eligibility is required to redeem account-only benefits. Merely entering an account holder's email or copying an offer code does not confer that eligibility. Account creation does not subscribe the customer to promotional mail/SMS.

### Checkout sign-in handoff

When an entered checkout email belongs to an existing account, invite the booker to log in or continue as a guest. Use exact matching under the authentication system's approved email normalization; never use spelling similarity to establish identity.

The proposed privacy-preserving presentation offers the same neutral choice after every email entry: “Have an Acornelia account? Log in to keep your bookings together, or continue as a guest.” This satisfies the invitation without announcing whether a particular account exists or showing a person's name/history. Exact wording remains a design choice. A public account-existence lookup is not required by this presentation.

Successful, failed or cancelled login preserves the selected room, dates, occupancy and entered checkout details. Show which account is associated when its details differ from the booking contact. Do not silently overwrite contact information or transfer ownership.

Apply login-related offer eligibility and obtain acceptance of any resulting price change before creating Maya Checkout. An active or uncertain payment attempt retains its accepted amount and offer context. Login cannot extend the hold, reprice that attempt or silently start another attempt. A new quote requires safe closure/reconciliation of the prior attempt and fresh acceptance.

### Customer ownership and account lifecycle

Bind authenticated bookings to an immutable customer identifier. Email changes, account deletion/recreation and a newly verified matching address never automatically transfer historical records. Keep the account owner, booking contact and staying guest distinct. Decision 05 defines third-party booking permission, confirmation recipients, change/recovery authority and retention.

Earlier guest bookings need an explicit, booking-specific claim with approved evidence. A candidate flow combines a verified matching account, a fresh purpose-bound token delivered to the original contact channel, explicit confirmation and atomic attachment of a still-unclaimed booking. Claim tokens expire, are single-use, are separate from booking-view links and are not copied to the booking-confirmation CC. Already-owned or conflicting claims require authorized recovery.

Current mailbox control is not historical identity proof when an address has been shared or reassigned. Decide whether a pre-existing booking-specific secret or staff-reviewed evidence is also needed. Do not enable historical attachment until Decision 05 resolves that risk. A public code, typed email, copied confirmation or general account alone cannot claim a booking.

Customer registration/profile writes cannot assign staff/developer roles, booking ownership or financial values. Apply authorization to direct/generated endpoints, custom actions, relationships and Payload Local API operations. Private history, account-specific offer responses and booking views must not leak through shared caches. Clear private browser state on logout/account switching.

Configure secure sessions, selected verification/recovery flows, browser origin/CSRF controls, bounded authentication attempts and revocation/deactivation behavior against the pinned Payload version. Removing an account must not cancel a valid paid stay or erase required financial/booking records. An account limit does not establish a one-person limit.

### Account offer rules and remaining decisions

Authorized staff manage offers for the registered-customer audience. Staff editing and publication do not bypass server eligibility checks, financial limits or action logging. Show each offer's benefit, conditions, validity dates and use limits.

Calculate discounts on the server in whole centavos. Save accepted base price, eligible components, discount, final amount, offer identifier/version and relevant terms. Later offer edits, withdrawal or expiry do not silently rewrite a still-payable attempt. New quotes use current eligibility/publication rules.

Reserve finite promotion usage consistently with room allocation and the payment attempt. Browser closure or a local timer alone does not prove payment failed. Follow provider reconciliation and the approved bounded uncertainty/release policy. Repeated requests, concurrent checkouts and duplicate payment notifications cannot exceed a use limit.

A late discounted payment can confirm only when the accepted context remains eligible and both the room and required offer capacity can be secured atomically. Otherwise record a paid exception for staff resolution; do not take capacity already used by another customer or silently reprice collected money.

Decision 06 must settle benefit values/types, eligible rooms/stay dates, booking windows, minimum spend, caps, rounding, fee/tax order, per-account/overall limits, stacking, new-account eligibility during checkout, changed stays and cancellation/refund/reinstatement. Negative totals are rejected. A zero-total offer requires an approved and tested no-payment confirmation path or a positive-payment restriction; never invent a successful Maya payment for a free booking. Promotional email/SMS beyond the account view requires a separate channel/preference decision.

## 5. Rooms prices and booking journey

### One inventory shared by all channels

Website bookings, phone reservations and walk-ins use the same records. Staff must record direct bookings before promising availability. Preserve the distinction between room types and actual rooms.

- A suitable physical room must be available for every night of the stay. Do not combine different rooms across nights without agreement.
- Allocate an actual room internally when payment starts. Guest selection of exact room numbers is not an approved launch promise.
- Confirmed reservations, active payment holds, maintenance and owner blocks reduce availability.
- The database rejects overlapping allocations. Staff actions and direct bookings cannot bypass this rule.
- Removing a room/type from sale preserves existing reservations and their history.
- Check-in/check-out boundaries use the approved property calendar and cleaning policy. For example, November 10–12 occupies the nights of November 10 and 11; another arrival on November 12 depends on approved turnover rules.

### Prices and accepted quotes

Calculate nightly prices, applicable fees/taxes, occupancy restrictions, minimum stays and booking cutoffs on the server. Show the difference between a general “from” rate and the total for selected dates. Use whole centavos internally and show the complete accepted breakdown.

Save the accepted quote/version and policy context. Later public rates, policies or promotion changes do not rewrite that booking. For a new quote after safe closure/reconciliation of the previous attempt, calculate current prices and obtain new agreement. Expiry never reprices an active/uncertain or late-paid attempt.

### Booking sequence

1. Select check-in, check-out and guest count.
2. See rooms suitable and available for the whole stay.
3. Read room photos, beds, capacity, amenities, inclusions and policies.
4. Review the complete server-calculated stay price.
5. Enter name, email, phone and optional requests; clarify that requests are not guaranteed.
6. Optionally log in, review eligible account offers and accept any revised quote before payment creation.
7. Recheck price/capacity/availability, then save the booking, room hold, required offer allocation and merchant reference together before calling Maya.
8. Open Maya Checkout with a visible deadline. Do not keep a database transaction open while waiting for the provider.
9. Show checking/pending until an authenticated, matching server result is verified. Returning from Maya or closing the browser does not decide the outcome.
10. Confirm an eligible paid booking once and persist confirmation email work with that transition. Show the booking code and accepted stay/payment details.

### Confirmation and check-in

Every confirmed reservation has a unique booking code. Booking confirmations include stay/payment details and a private booking-view link, and copy **codeboxstudios.official@gmail.com** for now. Failed email delivery does not invalidate a paid booking.

Staff must sign in to search or scan a booking, check name/dates/room/status and perform the approved arriving-guest identity checks before check-in. A code alone is neither identity proof nor public access to private details. If the code is unavailable, use authorized private search and the same checks.

A QR lookup is a proposed convenience. It carries a lookup code, not private guest data or a bearer link. A scan does not automatically check someone in. Record staff check-in in the protected action log.

## 6. Payments changes cancellations and refunds

### Separate booking payment and refund state

Keep booking status, payment attempts, stay-change requests, cancellation and refunds traceable separately. A card authorization alone is not completed collection. Cancellation can be effective while refund settlement is still pending. A provider-accepted refund does not prove the guest's bank/wallet has credited it.

Verified payment must match booking/attempt, purpose, revision, amount, currency and provider reference. Eligible success confirms automatically once. An explicitly cancelled or superseded operation is not reopened by later collection.

### Payment-attempt identity and quote boundary

Persist a unique merchant reference before requesting checkout. Bind each attempt to its accepted quote/version, booking/change revision, purpose, amount/currency and offer/customer-eligibility context. Reuse the existing attempt only for that unchanged context.

A timeout during checkout creation leaves an uncertain attempt to reconcile. It does not prove that no provider checkout exists. Inspect every result returned by merchant-reference lookup. A reference is not, by itself, a provider idempotency guarantee. Back navigation, another tab, login, staff changes and promotion edits cannot mutate a payable attempt. Late supplemental payment for an abandoned change cannot complete another revision.

### Holds payment window and exceptions

Align the room hold with the verified provider payment window. Maya's documented checkout window is one hour, rechecked November 13, 2026; the implementation must verify actual behavior before configuring release. Only shorten a hold if the older checkout is prevented from accepting payment. A new checkout after expiry requires a valid new hold, safe reconciliation and customer agreement. [Maya checkout flow](https://developers.maya.ph/reference/accept-one-time-payment-using-maya-checkout).

At the deadline, query authoritative state before release. Bound uncertain-payment checking, assign an escalation limit and alert staff; do not let holds last forever. Limit repeated holds and never restart the deadline on refresh.

| Situation | Required outcome |
| --- | --- |
| Last room requested concurrently | Exactly one valid hold/allocation; the other customer is told before payment. |
| Repeated Pay clicks or refresh | Reuse the saved attempt; do not collect twice because a page reloaded. |
| Unknown create/result or missed webhook | Reconcile saved references/provider status; do not request another payment while unclear. |
| Duplicate or older failure notification | Process safely once; do not undo a verified paid booking or duplicate confirmation work. |
| Redirect arrives before verification | Show checking, not confirmation or another pay request. |
| Definite failure/expiry | Release only when the provider window is safely closed under the approved rules; retry requires a valid hold and fresh agreement. |
| Late success after release | Confirm only with eligible unchanged accepted context and atomic room plus required offer allocation; otherwise create a paid exception. |
| Cancelled/superseded operation receives money | Keep it closed; record collected funds and route for resolution/refund. |
| Duplicate collection or overpayment | Keep the valid booking, record extra money and alert staff for authorized return. |
| Amount/currency/purpose mismatch or unavailable paid stay | Do not falsely confirm; preserve evidence and show a staff issue. |
| Email outage or process restart | Retain confirmed bookings and durable unfinished recovery/delivery tasks. |

Verify Maya's documented signature, exact signing input, timestamp tolerance and environment/rotation keys before state changes. Save valid notifications durably before acknowledging receipt; deduplicate business transitions independently of retry timestamps. Reject tampered, stale or wrong-environment input. Reconcile uncertain results through provider retrieval. [Maya webhook security](https://developers.maya.ph/reference/webhook-security).

### Stay changes and cancellations

Use controlled, permission-checked actions. Preserve the original stay until the replacement is secured and the change commits. Verify any extra payment before committing an increase. Commit a cheaper replacement first, then track its refund separately. Every completed room/date change must update the booking, secure the replacement allocation, release the original allocation and save its required staff log in one database transaction. On failure retain the original stay, release replacement holds and flag any extra collected amount for return. A refund delay must not undo a completed change.

Serialize changes/cancellation against booking/change revisions. A same-room extension must protect the existing allocation, reserve only additional capacity where appropriate, and atomically commit the new interval. It must not conflict with a duplicate of its own original stay or weaken overlap protection for other bookings. Ordinary changes do not promise atomic swaps between two occupied bookings.

When cancellation becomes effective, release inventory under the agreed policy and track refund progress independently. Customer self-service approval, forfeiture, deadlines, no-show treatment and reinstatement are Decision 04 decisions.

### Refund authorization and reconciliation

Persist an authorized void/refund before contacting Maya. Compute remaining authorization from verified collected funds minus completed refunds and reserved in-flight/uncertain refunds, deducting each exactly once, then apply stricter policy/provider limits. For example, ₱2,000 collected minus ₱500 refunded minus ₱500 reserved for an uncertain refund leaves at most ₱1,000 for another authorized refund.

Concurrent staff actions, retries and unclear responses cannot return the same money twice. Reconcile dashboard/manual refunds and follow the actual method/timing capabilities enabled for the merchant. Do not retry an unknown result blindly or equate submission with receipt by the guest. Save/query the refund result rather than relying on a separate refund webhook. [Maya voids and refunds](https://developers.maya.ph/reference/managing-voids-and-refunds-in-maya-checkout).

<a id="5-what-staff-can-do"></a>

## 7. Staff workspace and protected action logs

### Staff workspace

| Area | Required work |
| --- | --- |
| Today | Arrivals, departures, occupied rooms, upcoming stays and payment issues, with the date range behind totals. |
| Room calendar | Physical-room stays, holds, maintenance and owner blocks. |
| Reservations | Authorized search by guest/reference/dates, details, contact actions and staff notes. |
| Direct bookings | Phone/walk-in reservations with the same inventory/price checks, recorded payment method and approved unpaid deadline. Pay-on-arrival needs an agreed policy. |
| Stays | Check-in/out, no-shows and controlled date/room changes/cancellations. |
| Rooms and prices | Descriptions, photos, capacity, amenities, sale status and authorized rate changes. |
| Payments and refunds | Verified provider references, exceptions, permitted refund actions and uncertain-result follow-up. |
| Public content | Approved page copy, photos, contact/policy/search information and supported section visibility/order. |
| Posts and events | Draft, preview, publish and withdraw stories/event announcements. |
| Customer offers | Authorized offer creation/edit/publication under approved terms; no unrestricted edits to redemption or financial fields. |
| Event enquiries | Selected post/date/contact context, routing and follow-up status; no automatic venue allocation. |
| Business reports | Authorized booking/payment summaries and permitted exports. Protected action logs remain developer-only. |

Staff use controlled actions rather than typing over booking/payment state. Recheck inventory, permissions, accepted prices and provider rules for every change. Content editing is limited to configured Payload fields. Layout code, custom animations, reservation logic, payment verification and protected system labels remain developer-managed. See the [Payload editing scope](../specs/2026-11-05-acornelia-payload-editing.md).

### Protected action logs

Only a signed-in developer may read, search or export action logs. Property admins cannot grant developer access or bypass checks through direct requests, relationships, versions, search or exports. Ordinary business reports do not expose the protected log.

Record staff sign-in/out, failed/refused access, staff-created accounts, booking/stay changes, rate/room/block/content/offer edits, financial requests/results, sensitive record reads, exports and access-permission changes. Each entry records actor, time, action, affected record, safe before/after values where relevant, outcome and useful booking/payment references. Attribute automatic follow-up to System.

Trusted server code writes entries. A successful staff change and its required log commit together; failure to save the log must not silently apply the change. Record money-movement intent before the external request, then its known/uncertain result. Record refused/failed attempts separately. No app screen, including a developer screen, edits/deletes old entries; corrections append and retention follows the approved policy.

Never log passwords, secret keys, private access/claim/reset links, card details, complete payment payloads or full guest profiles. Keep booking records and protected logs separated so linked records cannot leak log access.

## 8. Architecture operations and recovery

### Application and service boundaries

Build the planned Next.js/TypeScript application with Payload content/authentication and custom booking/offer logic, hosted on Vercel with Supabase PostgreSQL. Brevo handles selected transactional delivery and Maya handles hosted payment collection. Exact versions, provider accounts/tiers, persistent photo storage and scheduled execution need implementation decisions. Costs and alternatives remain in the [technology document](../../architecture/technology-stack.md); setup variables, deployment evidence and recovery procedures remain in the [operations guide](../../operations/deployment.md).

Customer/staff requests pass through the application's authorization and reservation rules. Keep secrets server-side. Enforce access for Payload Local API calls as well as generated/custom endpoints, populated relationships, versions and exports. Trusted system/payment operations have a distinct, narrow authority. Deliberately control unused Supabase Data API exposure, grants, row policies and callable functions; Payload accounts do not become Supabase Auth identities automatically.

Protect guest booking views with revocable, hard-to-guess links. A name or public booking code cannot reveal private data. Require approved additional verification for changes/cancellations. Public availability never exposes another guest's identity or reservation. Let Maya handle card details. Keep private customer/history/offer responses out of shared public caches.

### Email and background work

Persist confirmation work with the confirmed booking. Deduplicate automatic messages, record provider references/delivery outcomes, retry with bounded backoff and alert the assigned operator on unresolved delivery/quota/bounce failures. API acceptance is not proof of inbox delivery. Include the required confirmation CC; authentication/recovery/claim tokens must never be copied to that address.

Configure and test the selected customer verification/recovery/claim and staff recovery messages. Promotional campaigns remain outside the selected transactional-email scope unless separately approved. Existing confirmation-copy purposes, recipients, safe fields and retention require the documented privacy decision; the copy does not grant marketing permission.

Persist payment checks, hold expiry, offer-usage follow-up and email tasks. The authenticated runner must survive restarts, tolerate duplicate/overlapping runs, reclaim crashed claims safely and reject stale-worker writes. Unknown external money outcomes require reconciliation before another request; an expired worker lease is not proof the provider did nothing. Define actual runner/cadence, lease limits, escalation and ownership under Decision 10.

### Deployment and recovery

Separate development, preview and production data/credentials. Preview must not charge real customers, send unintended real notifications or write to live bookings. Use controlled migrations/backups and record the tested commands, provider/project identities, environment scopes, source revision, migration result, build, production deployment ID, READY state, domain and live verification.

Recover databases and media separately. A database backup is not a complete uploaded-object backup. An isolated restore rehearsal must prove the approved data-loss/recovery-time targets and reconstruction of valid post-backup stays, payment/refund events, room/offer allocations and necessary access state. A payment amount alone cannot reconstruct room/date/contact details.

Start restored systems in recovery quarantine. Block authentication/private-booking access, writes, staff money actions, workers and outbound payment/refund/email effects before startup can use stale records. Preserve/authenticate incoming provider evidence safely. Reconcile financial and booking state before rebuilding safe work; reconcile credentials, roles, deactivations, recovery contacts and claims before resuming access.

Invalidate restored sessions and outstanding recovery/claim/booking-view tokens through the tested procedure. A revoked link or old password must not become valid again because it existed in a backup. If current security evidence is unavailable, use approved independently verified recovery, not blind trust in restored credentials/contact details. Fence stale workers and record a named operator's authorization to resume. Preserve valid paid stays throughout access recovery.

Before public launch reconcile existing direct bookings/blocks, verify all authorized customer/staff flows, perform a controlled production booking and agreed cleanup/refund, prove recovery, train staff, complete UAT/retesting and obtain scope/launch acceptance. The existing bugs-only maintenance option does not automatically supply proactive monitoring, backup checks, upgrades or 24-hour incident response; operational responsibilities must be assigned separately.

## 9. Checks the system must pass

The following 38 acceptance requirements retain their existing numbers so linked specifications and audit findings remain traceable. They are requirements to implement and exercise, not completed production tests. Record actual dates, environments and evidence in the operations guide.


1. A guest can find and book a suitable room from a phone without creating an account.
2. Two people trying to reserve the same room at once cannot both hold or book it.
3. A room must be free for the whole stay. Correctly allow one guest to check out on the next guest’s arrival date.
4. A phone or walk-in booking changes website availability immediately. Staff cannot bypass room rules.
5. Changing rates does not change an accepted booking’s saved price. A changed total needs fresh guest agreement.
6. Returning from Maya or closing the browser does not decide whether a booking is paid. Verified server-side payment does.
7. Repeated clicks, repeated Maya messages, and older failure messages do not duplicate or undo a paid booking.
8. Payment timing matches the room hold. Check an unclear result before asking for another payment.
9. A paid but unavailable, cancelled, mismatched, or overpaid booking creates a visible staff issue with a resolution path.
10. Failed date changes keep the original booking and flag any extra payment for return. A cheaper replacement is confirmed before its refund starts. Cancellation and refund progress are tracked separately.
11. Email failures and server restarts do not lose confirmed bookings or unfinished payment work.
12. Guests cannot read others’ bookings. Staff actions require permission. Backups can actually be restored.
13. Every confirmed booking has a unique code that signed-in staff can look up at check-in. A code alone cannot reveal private booking details or prove the arriving person’s identity.
14. Confirmation emails include the booking code and copy codeboxstudios.official@gmail.com. Failed delivery does not cancel a paid booking.
15. Admin actions create complete log entries. A direct request from an admin or guest cannot read or export those logs. Admins cannot grant themselves developer access, and no app screen can edit or delete old entries.
16. Repeated/concurrent/uncertain void or refund attempts cannot duplicate repayment or exceed the permitted remaining collected amount, including reconciliation of refunds made outside the app.
17. Tampered signatures, stale timestamps and incorrect environment keys cannot confirm a booking. Valid retried payment messages remain safe to process once despite a changed delivery timestamp.
18. Opening inventory includes existing direct bookings and blocks. An isolated recovery exercise reconciles post-backup payment/refund events and recent allocations before checkout is reopened; media restoration is verified separately from database restoration.
19. The selected guest design retains room imagery and the booking journey, works on phones and desktops in Day/Night, and supports keyboard navigation and dialog focus return. The comparison preview preserves booking state when switching between all three directions.
20. Updates navigation reaches At Acornelia from another guest screen. All, Stories and Upcoming filters show the correct published records; full details are readable and empty results have a clear message.
21. An authorized editor can save, preview, edit and publish a post. Production changes survive reloads and appear in a separate guest session; drafts remain private and returning a published post to draft removes public list and detail access.
22. Anonymous and unauthorized direct requests cannot read drafts or change publication state. Publication validates title, summary, body, event date when relevant, and descriptions for uploaded photos; submitted text cannot execute as page code.
23. Upcoming includes events dated today in the approved property timezone and excludes earlier events. A past event remains readable in All. Check the date boundary using that timezone.
24. Event enquiries preserve the selected post's title and date. Publishing, unpublishing or enquiring about an event does not create a reservation, collect payment or change room inventory. Room booking still completes under the existing rules.
25. A signed-in customer can view their own upcoming reservations and booking history, including completed/cancelled states and current booking/payment information. Another customer's records cannot be read, and typed email matches alone cannot attach earlier guest bookings.
26. Checkout offers Log in and Continue as guest after email entry, without disclosing another person's account details. Exact matching follows approved email normalization; similar-looking addresses never prove identity. Successful, failed or cancelled login preserves checkout state and does not bypass payment or room-hold rules.
27. Current account offers are available to every customer with an account under their stated booking conditions. An unauthenticated guest cannot redeem an account-only benefit by entering someone else's email or copying a code. Guest checkout remains fully usable without that benefit.
28. New-quote validation rejects expired, inapplicable or exhausted benefits and unauthorized discount amounts. Existing payment outcomes use their saved accepted offer/version and approved expiry terms rather than being repriced by current offer state. The accepted discount and total are saved. Concurrent checkouts, repeated payment messages, failed/expired payment and cancellation/refund cases obey the approved usage and reinstatement rules without duplicate redemption.
29. Only authorized staff can create, publish, change or withdraw customer offers. Customer accounts cannot edit offers, alter redemption records or grant themselves staff permissions. Staff changes are recorded in the protected action log.
30. Empty booking history and no-current-offer states are clear. Account creation does not silently enroll customers in promotional email/SMS; any promotional delivery follows a separately approved channel and preference workflow.
31. An active or uncertain payment attempt retains its quote, amount, currency, offer version, purpose and booking/change revision through login, back navigation and concurrent tabs. New pricing requires safe closure/reconciliation and fresh acceptance. Unknown checkout creation and multiple payments found for a reference cannot cause duplicate collection or misattribute a payment.
32. Email change, account deletion/recreation and a matching newly registered email never transfer booking ownership. Simultaneous claims cannot attach one booking to two accounts; expired/reused tokens, public booking codes and copied confirmations cannot claim it. Shared/reassigned mailbox cases satisfy the approved historical-evidence policy rather than assuming current mailbox control proves the original booker. The approved recovery path handles conflicts while preserving valid paid stays.
33. Checkout clearly distinguishes signed-in booker, booking contact and staying guest when their details differ. Confirmation/private-link recipients and change/recovery authority follow the approved third-party booking policy rather than an inferred email match.
34. Same-room extensions and overlapping date changes retain the original allocation while protecting only the additional capacity needed, then commit atomically. Competing cancellation/change requests and late payments for abandoned revisions cannot corrupt either allocation or complete the wrong operation.
35. Offer expiry/withdrawal during payment, the last available use, interrupted processing and late success after allocation release obey the accepted snapshot and approved usage rules. Room and required offer capacity are secured together for late confirmation. Negative totals are rejected. Zero totals follow the explicitly approved confirmation path; no successful payment is invented.
36. A restored environment cannot resume authentication/private-link access, staff writes, scheduled workers or outbound money/email actions before the corresponding reconciliation. Reconstruct valid post-backup bookings and voucher usage; reconcile credentials, roles, recovery contacts and deactivations; invalidate stale sessions and recovery/claim/booking-view tokens through the tested procedure; fence stale workers; and record operator authorization before resuming. Missing current security evidence requires approved verified recovery rather than trusting the restored state.
37. Customer permissions apply through generated endpoints and custom/Local API operations, including relationships and protected fields. Selected verification/reset/revocation flows work; shared caches, browser account switching and crafted requests cannot reveal another customer's data or grant staff access.
38. Post publication/unpublication changes reach public lists and details through the selected cache invalidation rules. Upcoming changes at the approved property-date boundary. Draft previews and draft-only media follow configured authorization; previously public or shared media has an explicitly documented withdrawal limit.


## 10. Decisions before we build

Resolve the following decisions before implementing the affected rule. Approved answers become part of the versioned scope; the proposed defaults in section 1 are not substitutes for those answers.

| Decision | Required answer | Affected work |
| --- | --- | --- |
| Decision 01 Property and booking model | Property count, overnight/day-use/hourly scope, one/multiple rooms, room-type/exact-unit selection and opening physical inventory. | Availability, allocation and booking UI. |
| Decision 02 Stay and price rules | Room counts/capacity, beds/amenities, normal/special rates, currency, fees/taxes, children/extras, minimum/maximum stays, cutoffs, check-in/out, cleaning and approved property timezone. | Search, totals, calendar boundaries and public policies. |
| Decision 03 Payment and hold policy | Full payment/deposit, enabled Maya methods, direct-booking payment/unpaid deadlines, any pay-on-arrival, hold window, bounded uncertainty/escalation and merchant capabilities. | Checkout, release, reconciliation and staff exceptions. |
| Decision 04 Changes and cancellations | Customer request/approval authority, deadlines, no-show treatment, price differences, cancellation effective time, refund/late-payment rules and responsibilities. | Stay changes, inventory release and refunds. |
| Decision 05 Customer identity and recovery | Login methods, verification/recovery, claim evidence and mailbox-reuse risk, token lifetime, third-party booking/contact authority, recipients, deactivation/deletion and retention. | Customer access, history claims, communications and privacy. |
| Decision 06 Vouchers and special offers | Value/type, eligible components, rounding and fee/tax order, cap, rooms/stay dates, booking window, minimum spend, limits/stacking, new-account eligibility, uncertain/late payments, changed stays, cancellation/refund/reissue and zero-total handling. | My Offers, discount calculation and usage allocation. |
| Decision 07 Communication preferences | Confirmation-copy purpose/fields/recipients/retention, delivery contacts, account messages and any separately approved promotional channel/preferences. | Transactional email, private links and any future marketing. |
| Decision 08 Staff authority and records | Named staff/developers, protected role assignment, refund/rate authority, alert recipients, required reports/exports, enquiry routing, log/data retention and recovery responsibility. | Admin actions, reports, audit and operating procedures. |
| Decision 09 Final public design and content | One production direction, verified photos/copy, address/map/contact details, rates/policies, accessibility facts, event/venue details and publication authority. | Public pages, CMS fields and launch content. |
| Decision 10 Infrastructure and recovery | Production resources/regions, domain/DNS, media storage/backups, scheduled runner/cadence/leases, operator/backup contact, alerts, recovery targets, reconstruction evidence, cutover and rollback. | Deployment, durable work, incidents and recovery. |
| Decision 11 Scope and acceptance | Reconcile account/offer additions, questionnaire answers, cost/schedule impact, versioned attachments, acceptance evidence, sign-off contact, training/UAT and handover duties. | Contract baseline, build authorization and release. |

Final offer rules remain open. Account visibility is requested; neither a universal discount on every booking nor automatic rewards or promotional subscriptions has been agreed.

## 11. Delivery and scope boundaries

### Delivery sequence

1. **Agree the baseline.** Resolve affected Decisions 01–11 policies, reconcile requested additions with the commercial scope, select the design and prepare real inventory/content and authorized provider access.
2. **Build the foundation.** Implement public pages, configured Payload content, customer/staff access, protected logs, physical inventory/rates/blocks and the agreed account/history/offer views.
3. **Build transactions.** Implement server pricing, immutable quotes, room/offer allocation, checkout login continuity, Maya attempts/verification, booking codes, durable confirmation/recovery work and controlled staff changes/refunds.
4. **Validate operations.** Exercise the acceptance requirements, direct bookings, permissions, concurrency, failure/restart/recovery, media, email and opening inventory. Train staff on the working beta, complete UAT and retest defects.
5. **Release and hand over.** Complete production readiness, controlled live verification and cleanup, approved public content and cutover, then record deployment/acceptance evidence and operational responsibilities.

This sequence is not a new effort estimate or date commitment. The contract/proposal retains the commercial schedule and its prerequisites; scope changes need explicit reconciliation.

### Separate or future scope

Multiple properties, multi-room online checkout, day-use/hourly products, deposits/balances, exact-room promises, OTA/channel-manager links, online event reservations/payments, unrestricted self-service booking changes, two-booking room swaps, public promo codes, points/tiers, SMS/marketing campaigns, extra languages and custom accounting integrations require separate scope approval where not already selected.

The requested optional customer accounts, booking history and all-account offers are included in this requirements draft, but are not silently added to the earlier priced baseline. Public Stories and Events remain content/enquiry features. Provider purchases, production setup and successful integrations require their own verified evidence.

### Supporting documents and revision record

- [Technology decisions and costs](../../architecture/technology-stack.md): selected providers, reasons, alternatives and dated cost assumptions.
- [Deployment and operations](../../operations/deployment.md): actual configuration, verification, cutover and recovery requirements.
- [Payload editing scope](../specs/2026-11-05-acornelia-payload-editing.md): permitted content and controlled operational actions.
- [Guest design](../specs/2026-11-12-acornelia-guest-redesign.md) and [Stories and Events](../specs/2026-11-12-acornelia-updates-and-events.md): visual/content details and prototype limits.
- [Functionality questionnaire](../specs/2026-11-05-acornelia-owner-questionnaire.md) and [content questionnaire](../specs/2026-11-05-acornelia-owner-content.md): pending Client answers and material.
- [November 12 technical review](../../architecture/2026-11-12-specification-review.md): historical findings and the reasoning behind the retained engineering safeguards.
- [Preserved November 12 specification](2026-11-12-acornelia-website-plan-before-consolidation.md): exact pre-consolidation source. Its historical verification hashes apply to that snapshot, not this rewrite.
- [November 13 consolidation verification](../../architecture/2026-11-13-specification-consolidation-verification.json): document, source-preservation, link and review-artifact checks for version 2.

Version 2 consolidates the existing requirements and technical review into one current specification. The 38 acceptance requirements and confirmed user choices are retained; open policies remain open. The repository contains design prototypes and documentation, not a verified production booking/account system. Historical PDFs, review snapshots, questionnaire exports, the documentation archive and Notion mirrors are not automatically refreshed by this rewrite.


### Durable work implementation clarification — November 15, 2026

Booking, authentication-delivery and enquiry commands persist typed outbox references in the same transaction as their state. Matching semantic intent reuses its durable record; changed payload cannot reuse that key. A worker's owner credential, lease deadline and increasing generation fence both job completion and its database effects. Provider requests run outside retryable transactions. Lease expiry or timeout after checkout/refund/mail dispatch requires reconciliation, never blind redispatch. Completed work cannot replay; authorized safe replay is logged. Tests must prove restart survival, competing claims, takeover, stale-effect rejection, bounded retries and audit-failure rollback.

The implementation supports policy-bounded leases, batches and retry backoff. Production values, scheduler/cadence, failure alerts and operator ownership remain Decision 10. Unconfigured transports do not claim work. Actual provider operation ownership, email deduplication and restore-wide external fencing remain separate required checks; generic queue tests do not establish those integrations.


### Atomic checkout implementation clarification — November 15, 2026

A fresh checkout requires explicit quote acceptance, browser/account binding, a fresh unconsumed quote and current approved checkout/hold/third-party terms. Its booking, quote consumption, physical room, account-offer usage, immutable payment attempt/reference, outbox work and action log commit together. Failure at any stage leaves none of those partial effects. Matching command/input retries reuse the original result; changed input conflicts. Public quote expiry and policy/offer changes cannot reprice an already payable/uncertain attempt.

Logging in after guest preparation preserves null ownership and the original amount. Logging in before preparing a new booking can bind that new booking to the verified account. Contact email is never an ownership key. Approved zero totals require atomic no-payment confirmation and permanent allocation, with no provider attempt; its result is explicitly `confirmed`. Actual payment/refund/notification handling and release gates remain the later implementation tasks.


### Maya transport implementation clarification — November 15, 2026

Task 16 guest checkout clarification: final submission requires name, email and phone, with separate optional staying-guest details and a non-guaranteed request. Optional login preserves partial drafts; guest checkout remains available. Review shows the accepted server price and frozen approved booking terms. Offer changes and repricing require renewed agreement. No approval of actual property terms, prices, payment deadlines or account-offer conditions is implied by synthetic fixtures.

A draft's immutable command key survives optional login and resumed tabs. Matching final submissions reuse the same preparation. After a lost response, private browser/account-bound recovery must find the original result before another payment is offered. Login after guest preparation does not attach that booking to the account. Private status requires a separate fixed-expiry, revocable capability, original browser binding and any issuing customer. Public booking identity and provider return outcomes grant no private access. Native handoff verifies access and atomically moves the original ready attempt to pending with reconciliation intent before redirect. Repeated handoff cannot issue another create. Confirmation requires canonical matching collection or separately approved zero-total confirmation. Polling pauses in hidden tabs and respects rate limits. Controlled resumption, mail delivery, lifecycle/recovery fencing and actual merchant verification remain later tasks.

The one-time Checkout boundary uses verified Maya environment/checkout hosts, separate public/secret key permissions, exact money serialization and one POST per operation. An unknown request result remains unknown; a merchant reference or general Processing Platform retransmission guide does not establish Checkout idempotency. Retain every actual payment returned for a reference, including duplicate collections. A browser return outcome cannot confirm money.

Void/refund transport requires explicit merchant capability/method approval plus fresh provider eligibility, amount and Philippine time-window checks. Unknown balances refuse dispatch. Task 23 must also serialize local refund reservations and reconcile independent merchant activity; HTTP preflight is not an atomic lock over that external account. A local hold deadline is not proof of the gateway's actual expiry. See the [current source-contract review and live verification requirements](../../architecture/2026-11-15-maya-contract.md).

### Payment inbox implementation clarification — November 15, 2026

Authenticate Maya deliveries against its documented Signature V1 and both environment-specific public keys before durable ingestion. Persist minimal normalized evidence with one semantic processing intent and required audit before acknowledgement. Delivery timestamps/signatures identify delivery attempts, while normalized payment facts identify semantic observations. Retries after lost acknowledgement or restart cannot create a second processing intent. Ingestion does not itself confirm bookings. Invalid/tampered messages, fabricated trusted objects and unsigned public transitions have no authority. Preserve semantic receipts through retention/recovery because the published signing input does not include the timestamp header. Actual subscription/key/ingress verification remains a launch gate.

### Canonical payment implementation clarification — November 16, 2026

Keep platform-signed delivery evidence separate from merchant ownership. Only an authenticated merchant read may fund the canonical transaction ledger. Store every distinct actual collection, including extras, and require exact original money/environment/reference/purpose/revision/context plus room and offer ownership before fulfillment. Authentication or authorization alone does not confirm a stay. One applied revision, booking code and semantic confirmation intent prevent duplicate fulfillment; older failures cannot undo them. Preserve reversals for separate reconciliation rather than erasing collected history.

Late automatic confirmation requires the original approved late policy and atomic reacquisition of both the physical room and any released offer use. Released usage remains historical; current capacity and a new stable allocation are required. Ineligible/changed/cancelled or unavailable paid stays become issues with preserved money. Recording money for an issue does not prove that it funded a reservation; private status checks the applied-revision marker. A known remote operation or merchant-read evidence must also prevent a fresh create call. Actual merchant scoping, provider outcomes and owner operating values remain release gates.
