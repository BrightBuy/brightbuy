# Member 3 — Implementation Evidence

## Commit 01 — Record the starting point and team contract

- feature/checkout-payments
- 3fe7957227ae8b506f19cd4add937f215a0573ec

| Start application | `docker compose up --build -d --wait` | Passed — application started successfully | \
| Check services | `docker compose ps -a` | Passed — database, API and client healthy; setup exited with code 0 | \
| Existing tests | `docker compose exec api npm test` | Passed — no test failures reported | \
| Client build | `docker compose exec client npm run build` | Passed — build completed successfully | \
| Smoke checks | `docker compose exec api npm run smoke` | Passed — all smoke checks completed | \
| Customer login | Signed in using the supplied customer account | Passed — login succeeded | \
| Order viewing | Opened the customer's order list and an order | Passed — existing order details displayed |


## Commit 02 — Build the rules and transaction tools

- feature/checkout-payments
- 6a1778554e040f07649b8617cb5a6333a98339a4

| `docker compose exec api node --test server/test/checkout-domain.test.js` | Passed |


## Commit 03 — Define trustworthy inputs and order responses

- feature/checkout-payments
- 

|`docker compose exec api  node --test server/test/checkout-domain.test.js server/test/checkout-regression.test.js server/test/checkout-lifecycle.test.js` | Passed