# Acornelia project documentation

**Updated:** November 16, 2026.

Acornelia implementation has started from the reviewed plan. The repository also contains specifications, interactive mockups and owner questionnaires. See [implementation progress](operations/implementation-progress.md) for actual checks and pending work. Production deployment and provider connections have not been verified.

The selected stack is **Next.js, TypeScript, Payload CMS, Vercel, Supabase PostgreSQL, Brevo, and Maya Checkout**. Provider selection does not approve every business policy or select a paid subscription. Photo storage and scheduled-job execution still need final configuration decisions.

## Start here

| Document | What it records |
| --- | --- |
| [Full implementation plan — November 13](superpowers/plans/2026-11-13-acornelia-implementation-plan.md) · [Browser review](../.lavish/acornelia-implementation-plan.html) · [Portable HTML](../deliverables/Acornelia-Full-Implementation-Plan.html) | Review-first sequence: 29 tasks with files, interfaces, red/green checks, dependencies, policy gates, recovery and release. Maps all 38 requirements. User authorized implementation; follow the progress record for completed tasks. [Document verification](architecture/2026-11-13-implementation-plan-verification.json). |
| [Full website and booking specification v2](superpowers/plans/2026-11-05-acornelia-website-plan.md) · [Browser review](../.lavish/acornelia-system-specification.html) · [Portable HTML](../deliverables/Acornelia-Website-and-Booking-Specification.html) | November 13 consolidation: complete public/customer/staff workflows, payments, offers, ownership, recovery, 38 preserved acceptance checks and 11 open decision groups. Draft scope approval remains pending. |
| [November 12 specification review](architecture/2026-11-12-specification-review.md) · [Browser review](../.lavish/acornelia-spec-review.html) · [Portable report](../deliverables/Acornelia-Specification-Review-2026-11-12.html) | Historical eight-finding review of the [preserved November 12 specification](superpowers/plans/2026-11-12-acornelia-website-plan-before-consolidation.md). Its verification hashes apply to that snapshot. The safeguards are retained in v2. |
| [Hosting and database cost review — November 11](architecture/2026-11-11-hosting-and-database-options.md) | Historical alternatives, Supabase Free/Pro and domain guidance. The user retained the original Vercel/Supabase/Brevo plan. |
| [Implementation progress](operations/implementation-progress.md) | Completed implementation tasks, local validation evidence, pending owner decisions and provider/release gates. |
| [Stay changes and cancellation](operations/deployment.md#staff-reviewed-stay-changes-and-cancellation--november-16-2026) | Staff-reviewed agreement, revision binding, atomic room replacement, supplemental payment, separate refund review and approval gates. |
| [Staff direct-booking operating requirements](operations/deployment.md#staff-direct-bookings-and-offline-collections--november-16-2026) | Shared pricing and room capacity, staff-attested receipts, paid exceptions, safe lost-response recovery and owner approval gates. |
| [Transactional email operating requirements](operations/deployment.md#durable-transactional-email--november-16-2026) | Implemented gated SMTP candidate, encrypted outbox, guest-only private links, required confirmation copies, uncertainty and live-delivery gates. |
| [Maya transport contract — November 15](architecture/2026-11-15-maya-contract.md) | Official endpoint/key/money contracts, durable evidence, original-attempt reconciliation, local HTTP checks and merchant verification gates. |
| [Transaction commit acknowledgement fix — November 14](architecture/2026-11-14-transaction-commit-fix.md) | Real PostgreSQL commit-time failure proof, pinned adapter patch and permission-proxy fix. |
| [Technology stack and provider decisions](architecture/technology-stack.md) | Selected technologies, responsibilities, reasons, alternatives, dated cost estimates, and unresolved technical choices. |
| [Guest authentication decision — November 12](architecture/technology-stack.md#guest-account-authentication-comparison--november-12-2026) · [Browser review](../.lavish/acornelia-guest-auth-options.html) · [Portable copy](../deliverables/Acornelia-Guest-Authentication-Comparison.html) | Payload selected for optional guest accounts; guest checkout remains available. Supabase Auth remains an unselected alternative. |
| [Customer account requirements](superpowers/plans/2026-11-05-acornelia-website-plan.md#guest-checkout-and-optional-accounts--november-12-2026) | Private booking history, vouchers/special offers available to every customer with an account, checkout sign-in handoff and pending promotion rules. |
| [Specification v2 verification](architecture/2026-11-13-specification-consolidation-verification.json) | Preservation of the previous source and all 38 checks, link/anchor compatibility, independent coverage review and browser/portable artifact checks. Application behavior is not verified by this record. |
| [Deployment and operations guide](operations/deployment.md) | Provider setup, configuration requirements, email integration, scheduled work, verification, backups, and recovery. This is a preparation guide, not evidence of a deployment. |
| [Maya owner access instructions](operations/maya-owner-access-guide.md) | Owner steps for a separate developer invitation, Checkout readiness, appropriate permissions, and secure credential setup. [Printable PDF](../deliverables/Acornelia-Maya-Access-Instructions.pdf). |
| [Payload editing scope](superpowers/specs/2026-11-05-acornelia-payload-editing.md) | Staff-editable content, controlled booking actions, protected developer tools, and changes that require developer work. |
| [Owner functionality questionnaire](superpowers/specs/2026-11-05-acornelia-owner-questionnaire.md) | Phase 1: reconfirm requirements and settle booking logic, staff workflows, and operating rules. |
| [Owner content questionnaire](superpowers/specs/2026-11-05-acornelia-owner-content.md) | Phase 2: public copy, photos, galleries, branding, policies, and visual approval. |
| [Notion project notes export](../deliverables/Acornelia-Technology-and-Deployment-Notes.md) | Complete export of the stack decisions and deployment guide. Saved as a private Notion draft and verified by reading it back on November 5, 2026; see the destination below. |

## Proposal preparation

**Client-facing document:** [Website and booking system proposal](proposal/client-proposal.md) · [Shareable PDF](../deliverables/Acornelia-Website-and-Booking-Proposal.pdf) · [Portable HTML](../deliverables/Acornelia-Website-and-Booking-Proposal.html). Uses the retained original stack and current commercial terms. Detailed specifications and the Client questionnaire remain separate.

[Proposal verification record](proposal/2026-11-11-client-proposal-verification.json): six A4 pages; checked payment and budget figures, separate-document wording, delay provisions, offline rendering, mobile layout, print controls and light/dark themes. This verifies the document, not a live application or Client acceptance.

**Current schedule — November 7, 2026:** five weeks development, one week training, one week UAT, two to five weeks UAT fixes/retesting, and one week deployment/handover: **10–13 weeks total**, subject to the documented prerequisites and acceptance checks.

On November 11, 2026, the user revised the development payments to ₱30,000 at development start, ₱15,000 at the initial test release, and ₱15,000 at final production release and handover: ₱60,000 total, split 50% / 25% / 25%. This replaces the earlier equal installments. The user also selected one calendar month of free minor/bug maintenance after production release. After that the Client chooses optional ₱3,000/month bug maintenance for existing original-scope features only, or on-demand support quoted per request with no recurring maintenance fee. No monthly work-hour cap has been agreed. Minor requests after the free period and added features are separately quoted. The owner will pay operating-service bills directly. Client acceptance, the schedule and detailed support terms still require agreement.

Contract review copy v8 retains the revised payments, separate specification/questionnaire references, explicit delay procedures, and the approximate ₱5,000/month operating allowance with service/usage/pricing variation. The contract shows free-email and optional paid-email baselines plus unallocated budget. V8 is a November 12 presentation revision removing URLs and AI wording from the client reading copies; commercial terms are unchanged. Listed USD entry prices were rechecked November 11; PHP amounts retain the original reference basis. The allowance is not a fixed bill or spending cap. The November 9 audit retains the commercial terms reviewed on that date; its installment amounts are historical. The Notion mirror and its existing attachments have not been refreshed for this revision.

| Document | What it records |
| --- | --- |
| [November 9 legal and technical audit](proposal/2026-11-09-legal-technical-audit.md) · [HTML](../deliverables/Acornelia-Legal-Technical-Audit-2026-11-09.html) · [PDF](../deliverables/Acornelia-Legal-Technical-Audit-2026-11-09.pdf) | Cross-document findings, legal/signing decisions, technical launch gates, source verification and documentation clarifications. Not legal sign-off or production verification. |
| [PHP costing sheet](proposal/costing.md) | Suggested development fee, subscription scenarios, currency basis, milestones, optional maintenance, exclusions and first-year planning amounts. |
| [Detailed project summary](proposal/scope-summary.md) | Proposal-ready goals, scope, safeguards, deliverables, dependencies, acceptance and commercial assumptions. |
| [Development contract draft](proposal/contract-draft.md) | Full review agreement, fee milestones, support choices, scope/acceptance, ownership, privacy particulars, signatures and open terms. Not signed or professionally reviewed. |
| [Contract review record](proposal/contract-review.md) | Business, engineering, technical-analysis and Philippine legal drafting checks, resolved ambiguities, open signing details and verification evidence. |
| [Portable contract review](../deliverables/Acornelia-Development-Contract-Draft.html) | Standalone reading/printing copy of the Lavish contract. No electronic signing or automatic submission. |
| [Printable contract draft](../deliverables/Acornelia-Development-Contract-Draft.pdf) | PDF of the same maintained review draft, including unsigned schedules and review notes. |
| [Contract v8 verification](proposal/2026-11-12-contract-v8-verification.json) | Sixteen A4 pages, no URL annotations or excluded wording, complete text and unchanged commercial terms. |
| [Searchable owner questions](reference/owner-questionnaire-questions.md) | The portable questionnaire's text for lookup, including conditional questions; it does not contain owner responses. |

## Design review

| Document or artifact | What it records |
| --- | --- |
| [Public website implementation checks — November 14](design/2026-11-14-public-site-verification.json) | Local Warm Boutique composition, current test evidence, responsive/theme screenshots and remaining release gates. |
| [Design language](superpowers/specs/2026-11-05-acornelia-design-language.md) | Proposed colors, typography, themes, components, accessibility, and implementation guidance. |
| [Design tokens](design/acornelia-tokens.css) | CSS values supporting the proposed visual language. |
| [Website mockup guide](superpowers/specs/2026-11-05-acornelia-website-mockup.md) | Guest, staff, and developer preview screens and their review boundaries. |
| [Three guest redesign directions](superpowers/specs/2026-11-05-acornelia-design-options.md) | Prominent three-choice comparison with Day/Night and a next-design action; Developer hidden in the client preview. |
| [Stories and Events specification](superpowers/specs/2026-11-12-acornelia-updates-and-events.md) | At Acornelia guest reading/filtering, content fields, owner draft/publish workflow, production acceptance links and static-demo limits. |
| [November 12 guest redesign](superpowers/specs/2026-11-12-acornelia-guest-redesign.md) | User request for all three moods, compositions, booking journey, source files and remaining work. |
| [Public guest design preview](https://ab73db76.ht-ml.app/) | Published static comparison; HTTP and desktop/mobile interactions verified November 12. No production booking service. |
| [Portable three-design comparison](../deliverables/Acornelia-Guest-Website-Three-Designs.html) | Offline guest and staff preview with embedded images, fonts and interactions. |
| [Guest redesign verification](design/2026-11-12-guest-redesign-verification.json) | Responsive, theme, keyboard, booking, publication and room-image restoration / label-removal checks. |
| [Image provenance](design/acornelia-image-provenance.md) | Original and optimized image paths, full generation prompts and review-only concept use. |
| [Portable functionality questionnaire](../deliverables/Acornelia-Functionality-Decisions.html) | Phase 1 functional decisions and reconfirmations; local draft and text download, with no backend submission. |
| [Portable content questionnaire](../deliverables/Acornelia-Website-Content.html) | Phase 2 content and design answers, saved and downloaded separately. |

Interactive review artifacts live in `.lavish/`. They demonstrate proposed design and behavior. Follow the linked guides for their limitations; use verified property content before launch.

## Contract, specifications and Client questionnaire

The user confirmed separate documents on November 11, 2026. Use the [contract](proposal/contract-draft.md) for commercial and legal terms, the [website and booking plan](superpowers/plans/2026-11-05-acornelia-website-plan.md) as the starting app specification, and the [functionality questionnaire](superpowers/specs/2026-11-05-acornelia-owner-questionnaire.md) to gather Client requirements. Review the answers and approve a dated, versioned Project Specifications / Scope of Work and acceptance checklist. Contract Schedule A identifies the exact attachments. Form answers and future edits do not automatically change the agreed scope. The [content questionnaire](superpowers/specs/2026-11-05-acornelia-owner-content.md) continues to collect public copy and design material separately.

## Keeping documentation current

Follow [the project documentation instructions](../AGENTS.md). Keep approved decisions, proposed defaults, implementation status, and live verification evidence distinct. Update the relevant reference and this index alongside substantive changes. Never include credentials or guest records in documentation.

## Notion publication

The private [Acornelia documentation hub](https://app.notion.com/p/40f75c97f2fc81a6ba32cdbcfac031ae?pvs=204) organizes the complete documentation library into proposal preparation, booking/owner decisions, architecture/operations, design, and repository references. Each document page includes its source path, lookup keywords, a table of contents, and a route back to the hub. The earlier combined technical notes are preserved as a reference snapshot.

The library includes [PHP proposal costing](https://app.notion.com/p/40f75c97f2fc8171b683c3476cdabd82?pvs=204), the [detailed proposal summary](https://app.notion.com/p/40f75c97f2fc8163b787c10aa5462603?pvs=204), the [development contract draft](https://app.notion.com/p/40f75c97f2fc81ad9e66c2f6cab10509?pvs=204), the [contract review and signing checklist](https://app.notion.com/p/40f75c97f2fc81e38647eefc3ff02dc5?pvs=204), and the complete searchable questionnaire text. The [source-to-Notion register](notion-sync.json) records page IDs, URLs, grouping and verification status. The downloadable archive attached to the hub contains the repository documents, portable owner forms, contract reading/print copies and local review assets. Earlier archives remain historical snapshots.

The original page was created privately because no parent was specified and searches returned no existing Acornelia project. It is now reused as the hub; no sharing changes were made. This confirms documentation organization, not production application or provider readiness.

Keep the repository references current, refresh exports when those references change, and update the relevant Notion pages when requested. This is a manual documentation mirror, not an automatic live sync. Verification results are recorded in the register; record subsequent sync dates and destination changes there.
