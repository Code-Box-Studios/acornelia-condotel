# Recorded acceptance evidence

**Created:** November 19, 2026. This file holds only results that actually happened, each tied to the commit it checked and the environment it ran in. The [requirements register](requirements.md) says which evidence each requirement needs, and `pnpm verify:acceptance` compares the two. Keep guest, payment and provider details out of this file; refer to protected records instead.

## Results

`pnpm verify:acceptance` reads this table. Evidence is a test file path or a further-evidence key from the register. Result is `passed` or `failed`.

| Date | Revision | Environment | Evidence | Result | Detail |
| --- | --- | --- | --- | --- | --- |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/contract/email-privacy.test.ts` | passed | 2 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/contract/maya-webhook.test.ts` | passed | 6 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/e2e/checkout.spec.ts` | passed | 20 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/e2e/customer-auth.spec.ts` | passed | 10 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/e2e/principal-switching.spec.ts` | passed | 8 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/e2e/public-site.spec.ts` | passed | 12 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/e2e/staff-workspace.spec.ts` | passed | 18 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/e2e/updates.spec.ts` | passed | 4 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/audit.test.ts` | passed | 9 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/authorization.test.ts` | passed | 11 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/checkout-atomicity.test.ts` | passed | 19 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/checkout-handoff.test.ts` | passed | 5 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/claims.test.ts` | passed | 6 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/customer-history.test.ts` | passed | 6 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/direct-booking.test.ts` | passed | 17 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/email-outbox.test.ts` | passed | 21 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/inventory.test.ts` | passed | 10 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/offer-usage.test.ts` | passed | 13 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/payment-observation.test.ts` | passed | 24 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/payment-reconciliation.test.ts` | passed | 21 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/publication.test.ts` | passed | 8 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/quotes.test.ts` | passed | 8 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/refund-capacity.test.ts` | passed | 29 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/stay-changes.test.ts` | passed | 24 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/integration/work-leases.test.ts` | passed | 11 passed |
| 2026-11-19 | cce6c3f93523 | local-isolated | `tests/recovery/restore.test.ts` | passed | 1 passed |

## Recording automated results

Run both suites with JSON reports on a clean checkout of the revision, then record one row per test file:

```sh
pnpm test:recovery --reporter=default --reporter=json --outputFile.json=vitest-report.json
PLAYWRIGHT_JSON_OUTPUT_FILE=playwright-report.json pnpm test:e2e --reporter=list,json
pnpm verify:acceptance record --revision "$(git rev-parse HEAD)" --environment local-isolated --date 2026-11-19 --vitest vitest-report.json --playwright playwright-report.json
```

Recording keeps only the test files the register names and replaces earlier rows for the same revision and environment. It lists any register file missing from the reports and then exits 1. A file passes only when it ran at least one test and none failed, timed out or passed only on retry. Record further evidence by hand, one row per key, with a pointer to its protected record or [UAT](uat.md) session in Detail.

## Acceptance check runs

Each run of the checker is summarized here with what it found. A failing run is a list of genuine gaps, not a defect in the checker.

### November 19, 2026 — commit `cce6c3f`, checked for `preview`

Both suites ran locally on `cce6c3f` (`local-isolated`): 414 automated checks in 47 files and 116 desktop/phone browser checks passed. The 26 test files the register names were recorded above, all passed. `pnpm verify:acceptance --revision cce6c3f93523f6557e1c13f559cffbf82fd52987 --environment preview` then exited 1 with 18 problems:

- 12 further-evidence results are missing in `preview`: `staff-uat` (9), `recovery-exercise` (12, 18, 36), `email-delivery` (14), `sandbox-maya` (16, 17), `opening-inventory` (18), `media-storage` (18, 38), `design-recheck` (19) and `browser-accessibility` (19). Each needs the hosted preview, a provider sandbox or a person.
- All 6 release blockers are open.

No automated evidence was missing. Two earlier local runs that day each failed one browser check because of test defects, not product defects. On `a0b29da` the test database reset lost a deadlock to a request still finishing from the previous test (fixed in `cbcb5f3`). On `cbcb5f3` the booking-history check read the list page before navigation finished (fixed in `cce6c3f`). Their results were not recorded because later commits replaced them.
