# Member 3 — Implementation Evidence

## Commit 01 — Record the starting point and team contract

- Branch: feature/checkout-payments
- commit_id: 3fe7957227ae8b506f19cd4add937f215a0573ec


### Checks performed

| Check | Command or action | Actual result |
| --- | --- | --- |
| Start application | `docker compose up --build -d --wait` | Passed — application started successfully |
| Check services | `docker compose ps -a` | Passed — database, API and client healthy; setup exited with code 0 |
| Existing tests | `docker compose exec api npm test` | Passed — no test failures reported |
| Client build | `docker compose exec client npm run build` | Passed — build completed successfully |
| Smoke checks | `docker compose exec api npm run smoke` | Passed — all smoke checks completed |
| Customer login | Signed in using the supplied customer account | Passed — login succeeded |
| Order viewing | Opened the customer's order list and an order | Passed — existing order details displayed |


## Commit 02 — Build the rules and transaction tools

- Branch: feature/checkout-payments
- commit_id: 

### Checks performed

`docker compose exec api node --test server/test/checkout-domain.test.js`
Passed