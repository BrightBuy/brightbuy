# Member 3 — Implementation Evidence

## Record the starting point and team contract

- feature/checkout-payments
- 3fe7957227ae8b506f19cd4add937f215a0573ec

| Start application | `docker compose up --build -d --wait` | Passed — application started successfully | \
| Check services | `docker compose ps -a` | Passed — database, API and client healthy; setup exited with code 0 | \
| Existing tests | `docker compose exec api npm test` | Passed — no test failures reported | \
| Client build | `docker compose exec client npm run build` | Passed — build completed successfully | \
| Smoke checks | `docker compose exec api npm run smoke` | Passed — all smoke checks completed | \
| Customer login | Signed in using the supplied customer account | Passed — login succeeded | \
| Order viewing | Opened the customer's order list and an order | Passed — existing order details displayed |


## Build the rules and transaction tools

- feature/checkout-payments
- 6a1778554e040f07649b8617cb5a6333a98339a4

| `docker compose run --build --rm --no-deps api node --test server/test/checkout-domain.test.js` | Passed - 16 passed, 0 failed, 0 skipped |


## Define trustworthy inputs and order responses

- feature/checkout-payments
- d121ec3b11fd02b5371cf3cc2e255d25879005fb

|`docker compose run --build --rm --no-deps api node --test server/test/checkout-domain.test.js server/test/checkout-regression.test.js server/test/checkout-lifecycle.test.js` | Passed - 45 passed, 0 failed, 0 skipped |


## Turn a cart into an order

- feature/checkout-payments
- 4f3a57a5666fc0fd62e2dc084117a95584c00e54

| `docker compose run --build --rm --no-deps api node --test server/test/checkout-domain.test.js server/test/checkout-regression.test.js server/test/checkout-lifecycle.test.js server/test/checkout-workflow.test.js` | Passed -59 passed, 0 failed, 0 skipped |


## Reverse an eligible order safely

- feature/checkout-payments
- 4c702bcda2f509d97d5dd01b44f56189b58b130b

| `docker compose run --build --rm --no-deps api node --test server/test/checkout-domain.test.js server/test/checkout-regression.test.js server/test/checkout-lifecycle.test.js server/test/checkout-workflow.test.js` | Passed -59 passed, 0 failed, 0 skipped |


## Install and verify the database design

- feature/checkout-payments
- 1fe01ef688568263b225326660e9234c153cd6c5

| `docker compose -f compose.yaml -f compose.m3-test.yaml up -d --wait --wait-timeout 300 m3-test-db` | Start the isolated MySQL test container |

| `docker compose -f compose.yaml -f compose.m3-test.yaml run --build --rm --no-deps -e "M3_TEST_MYSQL_URL=mysql://root:m3_test_only_password@m3-test-db:3306" api node --test server/test/checkout.mysql.test.js` | Passed - 12 passed, 0 failed, 0 skipped |

| `docker compose -f compose.yaml -f compose.m3-test.yaml rm --stop --force m3-test-db` | Stop and remove the isolated MySQL test container |


## Connect the backend to HTTP

- feature/checkout-payments
- 33d0607e718ff5985e35aae25a9d5efbdc598f2e

| `docker compose run --build --rm --no-deps api npm test` |


## Build the customer checkout screen

- feature/checkout-payments
- 608a777e29e9a6592f33ad3731636b277239c028

| `docker compose run --build --rm --no-deps client npm run build --workspace client` |


## Add cancellation to the order screen

- feature/checkout-payments
- 077433ed1b8d571b235794608794e5d4b8170d38

| `docker compose run --build --rm --no-deps api npm run build --workspace client` |