# Transaction commit acknowledgement fix

Recorded November 14, 2026 during Task 07. This corrects a foundation issue before booking and payment commands are built.

The concurrent enquiry test reported four successful commands while only three rows existed. A PostgreSQL deferred constraint trigger then reproduced the failure at COMMIT: the command returned an ID for a row that had rolled back. Earlier transaction tests covered conflicts during the callback, which did not expose this later failure.

The pinned Payload Drizzle 3.93.0 adapter handled transaction rejection by rejecting a readiness promise that had already resolved. Its commit wrapper also caught a commit error without rethrowing it. The reviewed official sources are [beginTransaction](https://github.com/payloadcms/payload/blob/v3.93.0/packages/drizzle/src/transactions/beginTransaction.ts) and [commitTransaction](https://github.com/payloadcms/payload/blob/v3.93.0/packages/drizzle/src/transactions/commitTransaction.ts).

A reproducible pnpm patch retains the transaction rejection, propagates it from commit, preserves the original failure during cleanup, and rejects an explicit attempt to commit an already aborted transaction. It keeps the pinned dependency version and uses the normal adapter API. Application code does not inspect private adapter sessions or implement a second transaction manager. Stale source-map references are removed from the two patched distribution files.

Real PostgreSQL tests first failed, then passed for an already rolled-back transaction and a serialization error raised by a deferred trigger at COMMIT. The latter proves that the existing bounded retry reruns the callback and only returns a persisted result. Concurrent enquiry submissions now acknowledge exactly the three durable records allowed by the local technical limit.

The patch must remain in `patchedDependencies`, the lockfile and `patches/`. A dependency upgrade must rerun these checks before removing it. Hosted PostgreSQL/pooler verification remains a deployment requirement. No hosted database, merchant or customer data was involved in this proof.

A separate request-capability fix supports Payload's transparent permission-check proxy. A private, non-enumerable symbol identifies a token held in the process-wide WeakMap. The proxy can read the token; object spreads and JSON cannot inherit or forge it. This preserves query access for authorized commands without granting an external staff request the internal authority used by its audit write. A targeted unit test and the real enquiry queries cover this boundary.
