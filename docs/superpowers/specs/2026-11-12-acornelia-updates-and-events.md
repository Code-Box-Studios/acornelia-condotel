# Acornelia Stories and Events specification

**Date:** November 12, 2026.  
**Status:** Requested design addition, demonstrated in the static guest/Admin prototype. Production CMS work is not implemented.

## Scope and design

The user requested a place where the owner can post what happened at Acornelia and upcoming events. The design adds an “At Acornelia” section to all three guest directions, with stories, event dates, optional photos and readable post details. Existing room imagery, booking behavior, prominent design comparison and hidden Developer choice remain.

The chosen implementation is a native content section rather than a social-media embed. It gives the owner control of the text, photos and publication state, and fits the existing Payload plan without introducing another provider. The guest can filter all posts, stories or upcoming events and open a detail dialog. Event enquiries use the existing enquiry flow; this content module does not add event ticketing, checkout, automatic room blocks or comments. Reading published posts does not require login. Optional booking-customer accounts are specified separately in the [website plan](../plans/2026-11-05-acornelia-website-plan.md#guest-checkout-and-optional-accounts--november-12-2026).

## Guest requirements

- **Navigation:** Updates in the guest navigation and footer reaches the home-page section from other guest screens. The review URL also supports `?section=updates`.
- **Lists:** All shows published stories and events, newest publication first. Stories includes stories only. Upcoming events includes events dated today or later in the approved property timezone. Show a result count, the selected filter and an empty state.
- **Cards:** Show post type, title, summary, relevant date and a Read story or Event details action. A photo is optional; posts without one retain a readable text or event-date treatment.
- **Reading:** Open full text and an optional described photo in a labeled dialog. Support keyboard access, Escape to close and focus return. Story details offer View rooms; event details offer Ask about this event and preserve the post title/date in the existing enquiry form.
- **Presentation:** Support all three review directions, Day/Night and narrow phones. Match the selected design's palette and card treatment without changing booking data or state.

## Owner editing and content fields

The planned **Posts & events** workspace supports New post, Save draft, Preview, Publish and editing an existing post. Saving a published post as draft withdraws it from public reading. Previewing a draft does not publish it. Production editing and publication require an authorized account.

| Field | Requirement |
| --- | --- |
| Type | Story or event; determines whether an event date is required. |
| Title | Required, including for saving a draft. |
| Summary and body | Required before publication; body supports the full readable post. |
| Event date | Required before publishing an event; use the property's approved calendar date. |
| Cover photo and alternative text | Photo is optional. An uploaded photo requires a meaningful description before publication. Validate permitted file types and size. |
| Status | Draft or published; only published content is publicly readable. |
| Slug and publication date | Production record fields for identifying posts and ordering public content. These are not editable fields in the static demonstration. |

## Production publication rules

Use the planned Payload Posts collection and media integration. Enforce read and write permissions on the server, including direct record requests. Drafts stay out of public lists and details. Publish, edit and return-to-draft actions must persist, with public views reflecting the resulting state across separate browsers.

Define public-cache invalidation for publishing, editing and returning to draft. Upcoming lists must refresh at the approved property-date boundary, not merely when an editor changes a post. Draft previews and draft-only uploads require appropriate permissions. Document the treatment of media shared with published content and the practical limit that withdrawing a post cannot retrieve copies already downloaded by visitors. Test public detail/list/cache access after unpublishing; do not infer media privacy from the visibility of its parent post.

An earlier event remains readable in All as a past event and is excluded from Upcoming. Resolve the property timezone before implementation; Asia/Manila is proposed, not yet an approved operating rule. Publishing an announcement or sending an enquiry does not create a booking, process a payment or allocate rooms.

Real content, media permissions, publication workflow approval, server access controls and integration checks remain required. Acceptance checks 19–24 in the [website and booking specification](../plans/2026-11-05-acornelia-website-plan.md) cover the design and this content addition.

## Static demonstration and limits

The Admin preview includes Posts & events, with title, type, event date, summary, body and an optional local photo/description. A draft stays out of the guest list. Publish in demo makes it visible within that browser preview. Editing and returning a post to draft removes it from the guest list. Changes and uploaded-photo object URLs are temporary and reset on reload; nothing is sent to a CMS or published to other viewers. All initial posts, dates and cover material are clearly sample content, not actual announcements or property photographs.

The current HTML role selector does not enforce real permissions. The prototype calculates today from the viewer's browser; property-timezone handling remains a production requirement. Its optional photo input accepts JPEG, PNG or WebP files up to 3 MB; final production upload limits remain to be configured.

This adds a requested content feature to the planning/design baseline. Detailed production acceptance and any scope, schedule or price implications must be reconciled in the versioned specifications; the commercial agreement is not silently amended.

## Sources and existing verification

Sources: `.lavish/acornelia-website-mockup.html`, `.lavish/acornelia-posts.js`, `.lavish/acornelia-posts.css`. The [portable comparison](../../../deliverables/Acornelia-Guest-Website-Three-Designs.html) and existing public review URL are refreshed after verification. See the [verification register](../../design/2026-11-12-guest-redesign-verification.json) for the checks performed.

**Verified:** thirty local and thirty hosted design/theme/viewport cases passed at 1920, 1440, 768, 390 and 320 px. Story/upcoming filters, detail reading with Escape/focus return, event enquiry prefill, draft visibility, demo publication/unpublication, local photo/alt validation, literal text rendering, past-event exclusion and reload reset were checked. A mobile room booking still reached the sample ₱9,600 confirmation after switching designs. Navigation/deep links passed at nine local and nine hosted widths. Blank titles and oversized photos were rejected, and the empty Upcoming state appeared correctly. The public share served the exact 2,830,649-byte portable HTML with zero unresolved assets. These are prototype checks, not production CMS or authorization verification.

**Specification consolidation — November 12, 2026:** The user's request to add the new design and Stories and Events to the specification is recorded here and in the main website plan. This update documents existing design behavior and future production requirements; it does not record a new browser run, production deployment or Client scope approval.


## Implemented local workflow — November 14, 2026

The application now persists Posts and Enquiries in PostgreSQL. Authorized staff use Payload drafts, publication and private previews; public `/updates` list/detail pages reflect the current publication state without a public data cache. Saving a draft preserves the published copy; unpublishing removes list/detail access. Full copy is projected as safe plain text. Events use validated property calendar-date strings; local Asia/Manila remains proposed for production.

All sorts by original publication time, with a stable ID tie-break and cursor continuation. Stories includes story posts only. Upcoming includes events today or later in the property timezone; past events remain in All. Missing results have a clear empty state. The homepage links to the same persisted content, and navigation works across pages.

Event enquiry forms save the published title/date and permitted contact details with explicit privacy consent. General forms appear on Contact and Events. Submission, delivery-work reference and required action log commit together. Identical nonce retries reuse the saved result; changed replays fail. Publication and enquiries create no room allocations, bookings or payments. Delivery is queued; actual email transport remains later work.

Production remains gated on approved timezone, enquiry privacy/retention/recipient policy, venue facts and provider verification. Local sample content is marked and excluded from production. Independent media access controls continue to apply after post withdrawal; changing a post does not retrieve already shared images. See [implementation progress](../../operations/implementation-progress.md) and the [operations guide](../../operations/deployment.md) for actual checks and limits. The earlier static demonstration records above remain historical evidence.
