# Acceptance requirements register

**Created:** November 19, 2026 (Task 28, local part). **Status:** register and checker only. No requirement has been accepted, and no row below reports a pass.

The 38 requirements in [section 9 of the specification](../superpowers/plans/2026-11-05-acornelia-website-plan.md#9-checks-the-system-must-pass) keep their numbers. This register names the evidence each one needs. [Recorded evidence](evidence.md) holds actual results, tied to a revision and an environment, and the [UAT plan](uat.md) describes the owner's acceptance sessions.

`pnpm verify:acceptance --revision <commit> --environment <name>` reads these three documents. It exits 0 only when every requirement has its evidence for that revision and every release blocker is resolved. It fails when:

- a requirement ID from 1 to 38 is missing or repeated;
- a named test file does not exist, or has no passing result recorded for the revision;
- further evidence has no passing result for that revision in that exact environment;
- a release blocker is still open;
- recorded evidence names an unknown test file or key, an invalid result, or a malformed revision.

Automated results may come from an isolated test environment (`ci-isolated` or `local-isolated`) or from the selected environment itself. Everything else must come from the selected environment. To record per-file automated results from JSON test reports, run `pnpm verify:acceptance record` (see [recorded evidence](evidence.md#recording-automated-results)).

## Requirements

Short labels follow the plan's crosswalk. The specification holds the full wording.

| ID | Requirement | Automated evidence | Further evidence |
| --- | --- | --- | --- |
| 1 | Phone booking with guest checkout | `tests/e2e/checkout.spec.ts` | — |
| 2 | Concurrent same-room exclusion | `tests/integration/inventory.test.ts` | — |
| 3 | Whole-stay and adjacent dates | `tests/integration/inventory.test.ts` | — |
| 4 | Immediate shared direct-booking inventory | `tests/integration/direct-booking.test.ts` | — |
| 5 | Accepted rates and fresh agreement | `tests/integration/quotes.test.ts` | — |
| 6 | Verified payment, not redirect | `tests/integration/payment-observation.test.ts` | — |
| 7 | Repeated or out-of-order messages and clicks | `tests/integration/payment-observation.test.ts` | — |
| 8 | Hold timing and unclear outcomes | `tests/integration/payment-reconciliation.test.ts` | — |
| 9 | Visible paid exceptions and resolution | `tests/integration/payment-observation.test.ts` | `staff-uat` |
| 10 | Safe changes and separate refunds | `tests/integration/stay-changes.test.ts` | — |
| 11 | Durable booking, email and payment work | `tests/integration/work-leases.test.ts`, `tests/integration/email-outbox.test.ts` | — |
| 12 | Privacy, staff authorization and restore | `tests/integration/authorization.test.ts`, `tests/integration/customer-history.test.ts`, `tests/recovery/restore.test.ts` | `recovery-exercise` |
| 13 | Unique code and authorized check-in lookup | `tests/e2e/staff-workspace.spec.ts` | — |
| 14 | Confirmation code, required copy and delivery failure | `tests/integration/email-outbox.test.ts` | `email-delivery` |
| 15 | Complete, atomic, developer-only logs | `tests/integration/audit.test.ts` | — |
| 16 | Repeated, concurrent, unknown and manual refunds | `tests/integration/refund-capacity.test.ts` | `sandbox-maya` |
| 17 | Signature, timestamp, environment and retry safety | `tests/contract/maya-webhook.test.ts` | `sandbox-maya` |
| 18 | Opening inventory and post-backup and media recovery | `tests/recovery/restore.test.ts` | `opening-inventory`, `recovery-exercise`, `media-storage` |
| 19 | Selected responsive, themed, accessible design and preserved comparison | `tests/e2e/public-site.spec.ts` | `design-recheck`, `browser-accessibility` |
| 20 | Updates navigation, filters, detail and empty state | `tests/e2e/updates.spec.ts` | — |
| 21 | Persistent authorized publication and withdrawal | `tests/integration/publication.test.ts` | — |
| 22 | Draft protection, validation and safe text | `tests/integration/publication.test.ts` | — |
| 23 | Approved property-date event boundary | `tests/integration/publication.test.ts` | — |
| 24 | Enquiry title and date with no reservation effects | `tests/e2e/updates.spec.ts`, `tests/integration/publication.test.ts` | — |
| 25 | Own history and current states with no email-only attachment | `tests/integration/customer-history.test.ts` | — |
| 26 | Private optional login and guest handoff | `tests/integration/checkout-handoff.test.ts` | — |
| 27 | Offers for every account and authenticated redemption | `tests/integration/offer-usage.test.ts` | — |
| 28 | Eligibility, snapshot, usage and reinstatement | `tests/integration/offer-usage.test.ts`, `tests/integration/payment-observation.test.ts` | — |
| 29 | Authorized offer editing and logs | `tests/integration/offer-usage.test.ts` | — |
| 30 | Empty account views and no silent marketing | `tests/integration/customer-history.test.ts`, `tests/contract/email-privacy.test.ts` | — |
| 31 | Immutable attempts, unknown creation and multiple payments | `tests/integration/checkout-atomicity.test.ts`, `tests/integration/payment-reconciliation.test.ts` | — |
| 32 | Immutable ownership, historical claim proof and races | `tests/integration/claims.test.ts` | — |
| 33 | Distinct booker, contact and staying-guest authority | `tests/integration/customer-history.test.ts`, `tests/e2e/checkout.spec.ts`, `tests/contract/email-privacy.test.ts` | — |
| 34 | Incremental extension, revision and cancellation safety | `tests/integration/stay-changes.test.ts` | — |
| 35 | Offer changes, late capacity, negative and zero totals | `tests/integration/payment-observation.test.ts`, `tests/integration/offer-usage.test.ts` | — |
| 36 | Restore quarantine, security, money and work resumption | `tests/recovery/restore.test.ts` | `recovery-exercise` |
| 37 | All API, private-field, cache, session and authentication boundaries | `tests/integration/authorization.test.ts`, `tests/e2e/principal-switching.spec.ts`, `tests/e2e/customer-auth.spec.ts` | — |
| 38 | Publication and date caching, previews and media limits | `tests/integration/publication.test.ts` | `media-storage` |

## Further evidence

Each key is recorded in [recorded evidence](evidence.md) with the revision and the environment it was checked in.

| Key | What counts |
| --- | --- |
| `staff-uat` | A staff UAT session on the revision that finds and resolves a paid booking exception through the workspace, recorded in the [UAT plan](uat.md). |
| `sandbox-maya` | `pnpm test:sandbox tests/sandbox/maya.test.ts` passing against the selected preview, including the paid void or refund check, plus an observed authenticated webhook. |
| `email-delivery` | A confirmation that reached the guest test inbox and the required copy address, with sender authentication (SPF and DKIM) confirmed. |
| `recovery-exercise` | A hosted restore exercise in an isolated environment that follows the [recovery runbook](../operations/recovery-runbook.md), reconstructs post-backup records and meets the approved recovery targets. |
| `opening-inventory` | The opening room calendar reconciled with existing phone and walk-in bookings and blocks (Task 29). |
| `media-storage` | Upload, persistence after redeploy, draft privacy and the documented withdrawal limit on the selected photo storage. |
| `design-recheck` | The preserved comparison preview rechecked against the selected guest design, keeping booking state across all three directions. |
| `browser-accessibility` | Keyboard navigation, focus return and screen-reader checks on phone and desktop browsers, including Safari. |

## Release blockers

Status is `open`, or `resolved <YYYY-MM-DD> by <role>`. Any other status counts as open.

| Blocker | Responsible | Status |
| --- | --- | --- |
| Owner Decisions 01–11 answered and recorded | Owner | open |
| Approved policy versions, content and scope frozen; Client sign-off and training contacts named | Owner | open |
| Task 27 hosted steps: preview resources, Data API disabled, reviewed migrations, sandbox checks and deployment evidence | Developer, with owner authorization | open |
| Staff trained on the beta | Owner and developer | open |
| UAT outcomes collected and corrected defects retested | Owner and developer | open |
| Explicit Client acceptance recorded against the exact revision | Owner | open |
