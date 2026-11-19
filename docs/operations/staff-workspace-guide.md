# Staff workspace guide

This guide explains the staff workspace for Acornelia's front desk and office team. It describes the version built on November 19, 2026. The owner has not yet approved which roles may use each part (Decision 08), so the workspace stays closed until an approved `operations` policy names those roles. Until then, every screen shows "This workspace is not available for your role."

## Signing in

Staff sign in with their staff account at `/admin/login`, then open `/staff`. Guest accounts can never open the workspace. Each page and each button checks your role again on the server, so a link or bookmark does not give extra access. Sign out when you leave a shared computer.

## Pages

| Page | Address | Use it to |
| --- | --- | --- |
| Today | `/staff` | See arrivals, departures, guests in house, upcoming arrivals and anything needing attention. Pick another date to plan ahead. |
| Calendar | `/staff/calendar` | See each room's nights for two weeks: stays, unpaid holds and blocks. |
| Bookings | `/staff/bookings` | Find a booking by code, guest name, email, phone or arrival dates. |
| Booking details | `/staff/bookings/…` | Check guests in or out, record a no-show, contact the guest, read payments and refunds, add internal notes and request a refund. |
| Payments | `/staff/payments` | Resolve payment issues, follow up uncertain refunds and handle cash or bank-transfer reimbursements. |
| Enquiries | `/staff/enquiries` | Follow up event and general enquiries and close them with an outcome. |
| Reports | `/staff/reports` | See bookings, collections and refunds for a date range, and download a spreadsheet if your role allows it. |
| Phone & walk-in | `/staff/direct` | Record a phone or walk-in booking (see the deployment guide's direct-booking section). |
| Content & rooms | `/admin` | Edit approved website content, rooms and photos in Payload. |

## Front desk

**Finding a booking.** Type the booking code (for example `ACN-…`) on the Bookings page. A code only finds the booking. It does not prove that the person in front of you is the guest. Check identity according to the house rules.

**Check-in.** Open the booking and press **Check in**. It is available from the arrival date until the night before departure, only for confirmed (paid) bookings. Each booking is checked in once. If two people press it at the same moment, only one check-in is recorded.

**Check-out.** Press **Check out** after check-in. This marks the booking completed. It does not release or refund anything.

**Cancelling.** Open **Cancel this booking**, enter where the guest's agreement is recorded and the reason, then press **Cancel booking**. This releases the room. Any refund is requested separately. Date or room changes cannot be made from the workspace yet; ask the developer.

**No-show.** **Record no-show** appears from the approved hour on the arrival date (the current candidate setting is 20:00 property time). Recording a no-show does not free the room or return money. If the guest arrives late, you can still check them in.

**If a button is missing**, the booking is not in a state that allows that action today. Reload the page; another staff member may have changed the booking. If the page says the booking changed, reload before trying again.

## Notes

Internal notes are visible to staff only. They are never shown to guests and their text is never copied into the action log. Do not write card numbers, passwords, private links or more personal detail than the stay needs. Notes cannot be edited or deleted. Add a new note to correct an old one.

## Payments and refunds

**Payment issues** are money events the system could not apply automatically, such as an extra or late payment. Choose the resolution that matches what happened and enter where the evidence is kept. Resolving an issue records a decision only. It never moves money.

**Check Maya first.** Before any refund of a Maya payment, including a cash or bank-transfer reimbursement of one, press **Check Maya for refunds** on the booking page. This imports refunds someone made in the Maya dashboard, so the same money is never returned twice. The system refuses a refund if the last check is more than 15 minutes old (the candidate setting).

**Requesting a refund.** On the booking page, open **Request a refund**. Choose the collection, amount, method and reason, and give the approval reference. The system refuses any amount above what is still refundable: money already returned and any refund still in progress are subtracted once. Maya voids are same-day and full-amount only. Maya refunds start the next day and end after 180 days.

**Uncertain refunds.** If Maya did not answer clearly, the refund stays "uncertain" and its amount stays reserved. **Do not send another refund for the same money.** The system keeps checking Maya. While anyone works on this payment in the Maya dashboard, do not request another app refund for it. After any dashboard action, press **Check Maya now** on the Payments page to import the result. Then a staff member who did not request the original refund can settle the uncertain request against it there.

**Withdrawing a request.** A refund request that has not been sent to Maya, or a cash/bank reimbursement with no payout recorded, can be withdrawn. This releases the reserved amount. A request already sent cannot be withdrawn; its outcome must be checked.

**Cash or bank-transfer reimbursements** need two people. The person who pays records the payout and its receipt reference. A different staff member then confirms or rejects the record. Until it is confirmed, the amount stays reserved. A receipt can be used for one reimbursement only.

## Enquiries

An enquiry never reserves a room or the venue. Contact the sender, then close the enquiry with an outcome and a short internal note. An enquiry can be closed only after its notification email has been delivered or has failed.

## Reports and spreadsheets

Reports count bookings by arrival date, collections by the date the money arrived, and completed refunds by the date they finished, all in the property's time zone. Each currency is shown separately. Open refund reservations are shown as they stand now. Only roles approved for exports see **Download CSV**. Spreadsheet cells that begin with `=`, `+`, `-` or `@` are prefixed with an apostrophe so a spreadsheet cannot run them as formulas. Each report view and download is recorded in the action log.

## Room blocks

Blocking a room for maintenance or owner use is currently limited to the developer role with the approved inventory policy. Front-desk staff see blocks on the calendar but cannot create or release them until Decision 08 widens that rule.

## Training screenshots

The browser tests save light and dark screenshots of the booking page for desktop and phone when run locally. Run `pnpm test:e2e tests/e2e/staff-workspace.spec.ts`, then open `.local/staff-booking-desktop-light.png`, `.local/staff-booking-desktop-dark.png`, `.local/staff-booking-mobile-light.png` and `.local/staff-booking-mobile-dark.png`. They use synthetic data and stay out of the repository.
