# Recorded acceptance evidence

**Created:** November 19, 2026. This file holds only results that actually happened, each tied to the commit it checked and the environment it ran in. The [requirements register](requirements.md) says which evidence each requirement needs, and `pnpm verify:acceptance` compares the two. Keep guest, payment and provider details out of this file; refer to protected records instead.

## Results

`pnpm verify:acceptance` reads this table. Evidence is a test file path or a further-evidence key from the register. Result is `passed` or `failed`.

| Date | Revision | Environment | Evidence | Result | Detail |
| --- | --- | --- | --- | --- | --- |

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
