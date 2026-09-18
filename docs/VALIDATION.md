# Foundation review and validation — 18 September 2026

This report records checks performed on the shared BrightBuy foundation. React, Express and MySQL were healthy during validation, and existing application records and local settings were preserved. All project file references are relative to the repository root.

See [the Step 1 checklist](STEP_ONE_CHECKLIST.md) for the latest requirement-by-requirement verification.

## Issues fixed

- Unsupported request encodings now return HTTP 415, and corrupt compressed JSON returns HTTP 400 rather than internal-server errors.
- Cancellation while reading a response body remains an abort instead of an invalid-response error.
- Tokens with missing/invalid subjects or missing expiry are rejected before SQL access, avoiding database-binding errors and unintended acceptance. Bearer scheme matching is case-insensitive.
- A delayed 401 from an old session no longer signs out a newly established session. Concurrent expiry responses clear the current session once.
- Proxy HTML/empty responses and network failures show readable client errors. Aborted page requests stay cancelled.
- Data loading no longer renders a previous order's data under a newly selected order ID. Status conflicts reload the latest order.
- Malformed stored password hashes fail authentication instead of throwing an internal error.
- Invalid lifecycle inputs, including inherited object-property names, return no transitions. Shared transition arrays cannot be mutated.
- Database setup closes connections/pools even when connection acquisition or lock release fails. Failed sample seeding rolls back.
- Order amounts use the currency on the order. Authenticated responses are marked `Cache-Control: no-store`.

## Organization and explanations

The API is split into authentication middleware and authentication/catalogue/account/order route modules. React is split into routing, pages, shared components, session state, a data-loading hook and display helpers. Database setup is split into its lifecycle, numbered migration runner and one-time sample seed.

Comments explain ownership, token validation, request cancellation, concurrent order edits and cleanup. All source files have consistent formatting, with shared editor/formatter configuration. The code walkthrough explains where to start and traces a complete request through React, Express and MySQL.

## Checks completed after the review

- All **30 automated tests passed inside Docker**: seven client-request tests and 23 API/domain/setup tests. These use network/database doubles to exercise failure cases safely.
- The React production build passed inside Docker. React Router emits non-fatal `use client` directive warnings; the build completes successfully.
- The formatting check and Git whitespace check passed.
- Live smoke checks against the main MySQL-backed API passed without changing records.
- Live headless Edge checks passed for the catalogue, out-of-stock variants, customer login/order details/addresses, logout, administrator login/customers/orders/status controls and 390-pixel mobile layout. No browser exceptions or horizontal overflow occurred in the checked flows.
- A separate, temporary MySQL 8.4 container verified first-time migrations and sample seeding from an empty database. All smoke checks passed against it.
- All 108 real API transition cases passed on the isolated database. A forced concurrent-admin conflict produced one successful write and one `409 ORDER_CHANGED`.
- Setup was rerun on the isolated database after changing orders. Modified statuses were preserved and the migration/seed markers were not duplicated.
- The isolated test container was removed. The main BrightBuy services were healthy when the checks completed.

This verifies the shared development foundation. Checkout, payment, stock reservation, production authentication hardening and other later features remain outside this step. The README contains the recurring test/build/smoke commands; `CODE_WALKTHROUGH.md` explains the implementation.
