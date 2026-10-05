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

| `docker compose run --build --rm --no-deps api node --test server/test/checkout-domain.test.js` | Passed - 16 passed, 0 failed, 0 skipped |


## Commit 03 — Define trustworthy inputs and order responses

- feature/checkout-payments
- d121ec3b11fd02b5371cf3cc2e255d25879005fb

|`docker compose run --build --rm --no-deps api node --test server/test/checkout-domain.test.js server/test/checkout-regression.test.js server/test/checkout-lifecycle.test.js` | Passed - 45 passed, 0 failed, 0 skipped |


## Commit 04 — Turn a cart into an order

- feature/checkout-payments
- 4f3a57a5666fc0fd62e2dc084117a95584c00e54

| `docker compose run --build --rm --no-deps api node --test server/test/checkout-domain.test.js server/test/checkout-regression.test.js server/test/checkout-lifecycle.test.js server/test/checkout-workflow.test.js` | Passed -59 passed, 0 failed, 0 skipped |


## Commit 05 — Reverse an eligible order safely

- feature/checkout-payments
- 4c702bcda2f509d97d5dd01b44f56189b58b130b

| `docker compose run --build --rm --no-deps api node --test server/test/checkout-domain.test.js server/test/checkout-regression.test.js server/test/checkout-lifecycle.test.js server/test/checkout-workflow.test.js` | Passed -59 passed, 0 failed, 0 skipped |


## Commit 06 — Install and verify the database design

- feature/checkout-payments
- 

| `docker compose -f compose.yaml -f compose.m3-test.yaml run --rm --no-deps api node --test server/test/checkout-domain.test.js server/test/checkout-regression.test.js server/test/checkout-lifecycle.test.js server/test/checkout-workflow.test.js` | Passed — 59 passed, 0 failed, 0 skipped |

| `docker compose -f compose.yaml -f compose.m3-test.yaml run --rm --no-deps -e M3_TEST_MYSQL_URL api node --test server/test/checkout.mysql.test.js` | Passed — 12 passed, 0 failed, 0 skipped, using the isolated MySQL database and test-only teammate fixtures | `docker compose -f compose.yaml -f compose.m3-test.yaml rm --stop --force m3-test-db` - to stop and remove the test database |

| `docker compose -f compose.yaml -f compose.m3-test.yaml run --rm --no-deps api npm test` | Passed — client: 7 passed; server: 83 passed; 0 failed in both runs. MySQL suite execution was verified separately using the command above|