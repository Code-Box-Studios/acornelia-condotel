# User acceptance testing plan

**Created:** November 19, 2026. **Status:** proposed. The owner has not named participants, approved a schedule or started UAT.

UAT is where the owner's people use the beta on a preview with Maya's sandbox and confirm that it does what the [specification](../superpowers/plans/2026-11-05-acornelia-website-plan.md) promised. It does not replace the automated checks in the [requirements register](requirements.md), and a passing session is not commercial or legal sign-off. The [proposal schedule](../README.md#proposal-preparation) allows one week of staff training, one week of UAT, then two to five weeks of fixes and retesting.

## Before UAT starts

- Owner Decisions 01–11 are answered, and the approved policies, rates, content and scope are frozen as versioned records.
- The preview passes the Task 27 hosted checks: its own database and media storage, sandbox Maya, real email delivery to test inboxes, and the scheduled work runner.
- Staff accounts exist for each approved role, and staff have been trained with the [staff workspace guide](../operations/staff-workspace-guide.md).
- Participants use test inboxes and Maya test cards only. No real guest data enters the preview.

## Journeys

| Who | Journey | Covers |
| --- | --- | --- |
| Guest on a phone | Find a room, enter details, continue as a guest, pay with a test card, receive the confirmation and private link. | 1, 6, 14, 19, 26, 33 |
| Customer | Create an account, book while signed in, see the booking in history, redeem an account offer, recover a password. | 25, 27, 28, 30, 37 |
| Front desk | Look up an arriving guest by code, check in and out, record a no-show, add a note. | 13 |
| Front desk | Take a phone booking with an offline payment and see the website's availability change. | 4 |
| Payments staff | Find a paid booking that could not be confirmed, resolve the issue and refund a cancelled stay. | 9, 10, 16 |
| Editor | Draft, preview, publish and withdraw a story and an event; answer an event enquiry. | 20–24, 38 |
| Developer with the owner | Restore a backup into an isolated environment and resume service with the recovery runbook. | 12, 18, 36 |

## Sessions

Record each session here, then add a `staff-uat` or other row to [recorded evidence](evidence.md) that points to it. Use roles, not personal names.

| Date | Revision | Environment | Participant role | Journey | Outcome | Defects |
| --- | --- | --- | --- | --- | --- | --- |

## Defects and retests

List each defect found in UAT, the commit that fixed it and the retest outcome. Retest on the revision that will be accepted.
