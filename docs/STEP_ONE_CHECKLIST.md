# Step 1 requirements verification

## Result

All five technical foundation requirements are implemented and passed the checks below. No remaining Step 1 technical blocker was found in this audit. The API contract and lifecycle rules form a concrete team baseline; agreement by every team member is a human coordination step and is not claimed by these tests.

## Requirement-by-requirement evidence

| Requirement                                                     | Implementation                                                      | Verification                                                                                                                                                                                       | Result                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| React and Express running in Docker alongside MySQL             | `compose.yaml`, `Dockerfile`, workspace package files               | Built and started with a fresh MySQL volume; database, API and client became healthy; setup exited successfully. Restarted all services and reran live checks.                                     | Implemented and verified                                               |
| Shared database connection and error-response format            | `server/src/db.js`, `server/src/errors.js`, `server/src/app.js`     | Routes share the injected connection pool. Tests cover database failure, malformed JSON, unsupported encodings, oversized payloads, authentication/access errors and request IDs.                  | Implemented and verified                                               |
| Basic customer/admin page layouts and routing                   | `client/src/App.jsx`, `client/src/components/`, `client/src/pages/` | Browser checks exercised catalogue, login/logout, customer orders/details/addresses, admin overview/customers/orders, status controls and mobile layout.                                           | Implemented and verified                                               |
| Sample customers, products, variants, addresses and orders      | `server/db/001-foundation.sql`, `server/src/database/seed.js`       | Fresh setup and live checks verified two customers plus one admin, three products, five variants, three addresses, three orders and four order lines. Repeated setup preserved edited test orders. | Implemented and verified                                               |
| API inputs/outputs, authentication format and order transitions | `docs/API.md`, `server/src/middleware/auth.js`, `shared/index.js`   | Checked token/user format, response envelopes, money/timestamp types and ownership. An isolated MySQL database passed 108 transition cases and a forced concurrent-admin conflict.                 | Implemented and documented; team agreement remains a coordination step |

## Bugs corrected during this audit

1. Unsupported request charsets/content encodings returned `500 INTERNAL_ERROR`. They now return `415 UNSUPPORTED_ENCODING` using the shared error envelope. Corrupt compressed JSON returns `400 INVALID_JSON`.
2. Cancelling a request after response headers arrived was reported as an unreadable response. Cancellation during JSON-body reading now remains an `AbortError`.

Regression tests were added. The live smoke script now validates all sample-data categories, response types, current-user details, ownership and rejected status updates. It does not change records.

## Verification results

- **30 automated tests passed inside Docker:** seven client tests and 23 API/domain/database-setup tests.
- React production build passed. React Router's non-fatal `use client` warnings remain; they did not prevent the build.
- Formatting checks passed.
- Live API and sample-data checks passed before and after restarting the main stack.
- Desktop/mobile browser checks passed without browser exceptions or horizontal overflow in the exercised flows.
- Fresh isolated MySQL setup passed, including sample seeding and repeated setup preserving modified records.
- **108 real-database order-transition cases passed**, covering allowed transitions, forbidden transitions, terminal states and fulfillment-specific paths.
- A deliberately synchronized pair of administrator updates produced one successful update and one `409 ORDER_CHANGED`, preventing a lost update.
- Mutation tests used an isolated database; the main sample orders were not changed by the audit.

## Repeating the standard checks

Run these from the repository root:

```sh
docker compose up --build -d --wait
docker compose exec api npm test
docker compose exec client npm run build
docker compose exec api npm run smoke
docker compose exec api npm run format:check
```

The smoke script expects the documented demo dataset. The exhaustive mutation/concurrency checks were run using a separate disposable MySQL instance and a temporary audit harness; they are additional audit evidence, not part of the standard `npm test` command.

## Scope boundary

This completes the shared application foundation. Cart, checkout/order creation, payment processing, stock reservation, catalogue/address editing, reports and production deployment hardening remain later feature work. They were not included in Step 1's five requirements. Before dividing that work, the team should adopt or revise the concrete API and lifecycle baseline in `docs/API.md`.
