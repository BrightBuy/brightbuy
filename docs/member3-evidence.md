# Member 3 — Implementation Evidence

## Baseline — Before Checkout Development

### Purpose
Check that the existing BrightBuy foundation works before I add
checkout, payments and cancellation.

### Environment
- Branch: feature/checkout-payments
- Starting commit: bf3170c927fbaee125e50b86bb75edc3da03054c


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