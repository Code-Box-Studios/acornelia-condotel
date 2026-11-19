# Recovery runbook

This runbook covers restoring the Acornelia database from a backup and safely returning to service. It describes the candidate procedure built on November 19, 2026. Decision 10 has not yet named the recovery operator, the backup provider or the approved recovery targets, so treat every value below as a proposal until it is approved.

## Why a restore is dangerous

A backup is an older copy of the system. After it was taken, guests may have paid, staff may have refunded money, people may have changed passwords, and links may have been revoked. If the restored copy simply starts working again, it could accept an old password, open a revoked link, charge or refund twice, or send emails again. The application therefore treats every restored database as untrusted until a named operator authorizes resumption.

## The fence

Two settings outside the database control the service:

| Setting | Values | Meaning |
| --- | --- | --- |
| `APP_OPERATION_MODE` | `quarantine` (default when unset), `reconcile`, `normal` | Which stage the service is in. |
| `APP_RECOVERY_GENERATION` | A short label, default `1` | The generation the database must have accepted before normal service. |

The database stores the generations it has accepted in the append-only `recovery_fences` table. Normal service needs both: the mode set to `normal` and the database's newest accepted generation equal to `APP_RECOVERY_GENERATION`. A restored copy carries an older generation, so it stays fenced even if someone sets the mode to `normal` too early.

| Stage | Allowed | Refused (HTTP 503 or worker refusal) |
| --- | --- | --- |
| `quarantine` | Public pages and storing authenticated Maya notifications. | Sign-in, private links, bookings and other writes, staff and admin screens, workers, payments, refunds and email. |
| `reconcile` | The above, plus the recovery operator's provider reads and evidence application. | Everything refused in quarantine. Checkout, refund, void and email calls are refused even for the operator. |
| `normal` with matching generation | Everything. | Nothing extra. |

The independent operator key `RECOVERY_OPERATOR_KEY` (at least 32 characters) authorizes resumption. Keep it in the protected operator store, never in the database, backups or chat. The operator does not need a staff login, which may itself be stale after a restore.

## Procedure

1. **Before starting the restored app**, set `APP_OPERATION_MODE=quarantine` and set `APP_RECOVERY_GENERATION` to a new label that has never been used, for example `restore-2026-12-01`. Record the backup time and when the restore began.
2. **Restore the database** from the chosen backup and start the application. All protected routes return 503. Maya notifications are still stored and wait for processing.
3. **Restore media separately.** Media files live outside the database (a local folder in development; the hosted storage choice is pending). Restore them from their own backup and confirm that unpublished photos are still private.
4. **Reconcile.** Set `APP_OPERATION_MODE=reconcile` and run `pnpm exec tsx scripts/recovery/reconcile.ts`. It reads Maya for every open checkout attempt and every Maya collection, applies only merchant-verified payments and refunds, and reports anything unresolved. It never charges, refunds, voids or emails.
5. **Review what happened after the backup.** Compare Maya's records, staff notes, emails and the guest's own confirmation with the restored bookings. A payment amount alone cannot rebuild a stay. Missing room, date or contact details must come from verified records, otherwise escalate to the owner. Do not reopen rooms whose status is uncertain.
6. **Authorize resumption.** Write an evidence file with `generation` (the new label), `operator` (your name), `backupTakenAt`, `restoredAt`, `providerReconciliation: "completed"`, `postBackupReview: "completed"`, `measuredRecoveryMinutes` and `approvedTargetMinutes`. Then run `RECOVERY_OPERATOR_KEY=… pnpm exec tsx scripts/recovery/authorize-resumption.ts evidence.json` while still in `reconcile` mode. This step:
   - gives every customer and staff account a new random password and security revision and ends every session;
   - voids every outstanding reset, verification and claim token and revokes every private booking or payment-status link;
   - marks unsent checkout and refund work uncertain so it is reconciled, and marks unsent email and enquiry work failed so a developer can replay it deliberately instead of repeating an external effect;
   - records the permit with the operator, the evidence, whether the measured time met the target, and a digest of the signature.
7. **Return to service.** Set `APP_OPERATION_MODE=normal`. Staff and customers sign in again through password recovery; their restored passwords no longer work. A developer reviews uncertain work in the developer work tools and replays only what is safe.
8. **Record the incident** in this repository: backup time, restore time, measured recovery time against the target, unresolved items and follow-up changes.

## Limits

- Notifications Maya sent while the old system was down and before the restore exist only at Maya; the reconcile step reads them back.
- Bookings made after the backup are not in the restored database. They must be rebuilt from verified evidence, and their guests contacted, before their rooms are offered again.
- Pending emails are not resent automatically. A developer decides what to replay.
- The recovery targets, operator, backup provider and rehearsal schedule await Decision 10. Run a full rehearsal on a non-production copy before launch.

## Evidence

The rehearsal test `tests/recovery/restore.test.ts` copies the test database as a backup, changes a password and revokes a link afterwards, then restores the copy. It shows that the restored service refuses sign-in and private links with 503 and sends no payment or email. After authorized resumption, the old password and link are refused (401), and no unsent outbound work remains queued. `tests/recovery/reconcile.test.ts` shows the reconcile stage reading Maya without sending money. Run them with `pnpm test:recovery`.
