# Adversarial testing and fixes

Verified on 2026-11-02 using a disposable local PostgreSQL instance. The configured cloud database and root `.env` were not modified. Each reproduced defect was assigned to a separate subagent, which reported its root cause before implementing its fix.

## Reproduced defects

| Failure | Root cause | Fix and regression evidence |
| --- | --- | --- |
| NaN/infinite numeric input returned HTTP 500 | Validation correctly rejected the number, but the default error handler echoed it into a JSON response that cannot serialize nonfinite numbers. | A scoped validation-error handler returns safe `type`, `loc`, and `msg` fields with HTTP 422. Tests include numeric literals, exponent overflow, and nested invalid input. |
| Unpaired Unicode input returned HTTP 500 | Validation error responses echoed an unpaired surrogate, then failed UTF-8 encoding. | Validation output omits raw input/context and sanitizes error text. Unicode values and keys now return structured 422 responses. |
| Offset timestamps near years 1/9999 returned HTTP 500 | Converting otherwise parsed aware timestamps to UTC could overflow Python's datetime range, in either schema validation or the service. | All three schedule timestamps validate UTC representability before entering the service. Unrepresentable values return 422; representable boundary timestamps remain accepted. |
| A detail response showed a bid and extension event with the old closing time/count | Read Committed isolation gives each SELECT its own snapshot. Bids could commit between auction, bid, and activity queries. | Public reads serialize a short Repeatable Read snapshot with a fresh session. Writes retain Read Committed and auction row locking. Five PostgreSQL regressions cover details at both query boundaries, listing, history, and reused identity maps. All five fail if snapshot protection is bypassed. |
| Slow requests left the UI loading forever | Every five-second poll aborted the previous request. An API response taking longer than five seconds could never finish. Older reads could also overwrite a successful mutation. | Background polls skip active requests; explicit retries supersede them. Mutation results invalidate older reads, while route changes and unmounts cancel obsolete work. Seven hook tests verify slow responses, ordering, mutations, navigation, cleanup, and React StrictMode. |

The validation error shape remains compatible with the React forms. Reads use their own short database transaction and release it after serialization; they do not lock auction rows or change write isolation.

## Stress and invariant checks

Three deterministic mixed-bid sequences independently calculate current supplier rankings and extension decisions for all triggers. Every step checks quote history counts, activity counts, strictly lower replacements, case-insensitive supplier identity, the current deadline, and the forced deadline. Rejected replacement bids leave state unchanged.

Twenty concurrent supplier submissions to one auction all persist with the correct final rankings, and cumulative extensions stop at the hard cap. Existing tests also verify concurrent revisions by one supplier and a request blocked on a row lock until the closing deadline.

## Verification results

- PostgreSQL backend suite: **92 passed**.
- Portable backend suite: **83 passed, 9 PostgreSQL-only skipped**.
- Frontend regression suite: **7 passed** (`cd frontend && npm test`).
- TypeScript and Vite production build: passed.
- Browser replay with an imposed 6.2-second GET delay: loading clears and auctions appear. Before the fix, each timer tick cancelled the pending request and no auctions appeared.
- The backend emits one existing third-party Starlette/httpx deprecation warning in tests.

Regression files: `tests/test_adversarial_inputs.py`, `tests/test_read_consistency.py`, `tests/test_auction_sequences.py`, and `frontend/src/lib/api.test.tsx`.
