# Acornelia: what staff can edit in Payload

**Status — November 14, 2026:** Payload now defines property/homepage, about/contact and public policy globals, room types, and media. These fields persist locally with drafts and explicit publication. Public pages consume sanitized projections. Booking operations and the remaining content workflows are tracked in [implementation progress](../../operations/implementation-progress.md). The Lavish files remain standalone design references.

The three November 12 guest redesigns share room data and booking behavior, with alternative homepage headlines and imagery for review. Any selected design can use the same Payload-managed information; separate room descriptions or prices are not required. The three-way switch is a review tool. Choosing one direction will determine final component styling and approved homepage copy. The [redesign specification](2026-11-12-acornelia-guest-redesign.md) records the proposals; earlier five-direction samples are archived.

## Website content

Authorized staff should be able to edit the following through the Payload admin area:

| Area | Planned editing controls |
| --- | --- |
| Homepage and other public pages | Headings, paragraphs, marketing button text and permitted destinations, featured rooms, and approved section content. |
| Photos and galleries | Upload and replace real property photos, set descriptive alternative text, choose a featured image, and arrange a gallery. |
| Rooms | Room-type name, descriptions, beds, amenities, guest capacity, inclusions, and published visibility. Changes that affect occupied rooms or existing reservations require validation. |
| Prices | Regular rates, date-specific prices, and configured fees. Price changes apply to new quotes; they do not rewrite a confirmed reservation’s saved price. |
| Property information | Logo, approved property name, address, map link, phone, email, social links, navigation, and footer content. |
| Events | Venue descriptions, verified capacity, inclusions, approved package information, and inquiry contact details. |
| Posts and happenings | Create and edit stories or event announcements with title, summary, body, optional photo/alt text, event date and draft/published state. Public lists include published posts only; Upcoming excludes past events. |
| Customer vouchers and offers | Authorized staff manage offers available to every customer with an account, including approved benefit, conditions, dates and use limits. Customers can view eligible offers but cannot edit them or redemption records. Detailed promotion rules still need approval. |
| Policies and search information | Approved house rules, check-in guidance, cancellation text, page titles, search descriptions, and social sharing images. |
| Approved page controls | Show or hide optional sections and arrange supported content blocks. Essential booking disclosures and payment steps remain present. Transaction labels and status messages keep their system-defined meaning. |

Payload only manages fields and actions that the application defines and connects to the website. The build must expose these controls explicitly; installing the CMS does not make every visible element editable automatically.

Single property settings fit Payload Globals; repeatable pages, room types, and media fit Collections. Approved reusable sections can use Blocks. This is the proposed implementation approach, not an existing configuration. See the official [Globals](https://payloadcms.com/docs/configuration/globals), [Collections](https://payloadcms.com/docs/configuration/collections), [Uploads](https://payloadcms.com/docs/upload/overview), and [Blocks](https://payloadcms.com/docs/fields/blocks) documentation.

## Booking operations

Staff manage room blocks, phone and walk-in reservations, check-in, requested changes, and cancellations through permitted actions in the admin area. These actions run the booking rules and availability checks. They are not unrestricted edits to raw booking records.

Verified payment status comes from the payment system. Staff cannot simply type “Paid” to confirm an online payment. Refund actions follow the configured process and verified result. Saved booking prices and accepted policies remain traceable; changing a public rate or policy does not silently change an existing reservation.

The user requested optional Payload customer accounts with booking history and vouchers/special offers available to all customers with accounts. Staff offer editing does not bypass server-side eligibility, discount calculation or redemption limits. Accepted discounts remain part of the booking's saved price. Resolve payment-hold, cancellation/refund and reinstatement rules before implementing redemption; customers cannot write raw discount or usage values. See the [customer account requirements](../plans/2026-11-05-acornelia-website-plan.md#guest-checkout-and-optional-accounts--november-12-2026).

Offer edits apply to new quotes; they do not rewrite an active payment attempt's accepted amount or offer version. Payment, change and redemption state transitions need controlled server actions rather than unrestricted record edits. Customer-originated Local API calls need the same explicit permission enforcement as staff actions. Customer registration/profile fields cannot assign roles, ownership or financial values.

Only developer accounts may view action logs. No app screen may edit or delete past log entries. Enforce permissions on the server for each read or action; hiding a menu alone is insufficient. Payload supports [role-based and document-level access rules](https://payloadcms.com/docs/access-control/overview), but the project must configure and test those rules.

## Design and technical changes

The owner can manage approved brand or appearance options that we deliberately expose. Custom layouts, typography rules, animation choreography, responsive behavior, new components, booking logic, and integrations remain developer work. Arbitrary CSS or JavaScript is not an ordinary staff content field.

Use one source of content with preview and publication controls. Payload can support [Live Preview](https://payloadcms.com/docs/live-preview/overview) and [drafts/version history](https://payloadcms.com/docs/versions/overview) when configured and integrated. Version history does not replace the separate developer-only action log.

## Posts and events design — November 12, 2026

The user requested owner posts about what happened at Acornelia and upcoming events. The [design and workflow](2026-11-12-acornelia-updates-and-events.md) are demonstrated in the guest page and Admin preview. Demo edits are browser-local and reset on reload; no Payload write occurs. The production Posts collection, server permissions, draft/public read rules, media validation and timezone handling remain to be configured and tested.


## Implemented content controls — November 14, 2026

Active staff can edit the configured public content through Payload. Property, page, policy and room-type history is staff-only. The public application explicitly projects published fields; private operations notes never appear in its DTOs. Page copy is plain text, with arbitrary markup removed before projection. Navigation destinations, layouts and essential booking labels remain controlled by code.

Media requires an alternative description, source and license record. JPEG, PNG and WebP files are accepted; source/license notes remain visible only to staff. Public file access checks both publication class and completed storage state on every new request. Knowing an object key does not grant draft access. Withdrawal blocks new requests but cannot erase copies someone already saved.

The implemented adapter is for the dedicated local development/test filesystem only. Upload intents are saved before file work; failures retain a private recovery record. Deletion is audited and a failed operation retains a private record for repair. Production uploads and local disk storage are disabled until Decision 10 selects and verifies durable hosted storage. Local media must not be mistaken for durable Vercel storage.

Development seeding creates labeled synthetic content only on the guarded local fixture target and preserves existing CMS records. The Warm Boutique composition is a provisional local preview, not a selected production design. Concept-photo provenance remains in the design records; verified property photos and owner-approved copy are still required for release.


The homepage heading and optional accent line are now configured property fields. Staff can change them with the same draft/publication and atomic audit protections. An absent capacity stays absent in the public projection; no guest limit is invented. Some supporting marketing section headings remain code-defined in this stage; the editor exposes only the controls listed above, and further supported blocks remain later work.
