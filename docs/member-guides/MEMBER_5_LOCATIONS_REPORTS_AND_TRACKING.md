# Member 5 — locations, delivery estimates, five reports and order tracking

## Your outcome and boundaries

Provide the supported Texas cities and pickup stores, implement the shared estimate function, build **all five reports named in the brief**, and extend the existing customer order pages with meaningful tracking/payment/delivery information. You own these APIs/pages/schema/tests; every other member writes their own report/presentation section and tests.

Read [shared workflow](00_SHARED_START_HERE.md), [ER/requirements alignment](02_REQUIREMENTS_AND_ER_ALIGNMENT.md) and [team plan](01_TEAM_PLAN.md), especially sections 10–12. You own R10–R15 and the CITY/missing STORE design. M3 creates delivery/payment/history, M4 completes orders, and your report/tracking reads must not change those records.

Use branch `feature/locations-reports`. Your first deliverable is location fixtures and the estimate interface so M2/M3 can work independently; do not wait until every other feature is finished to start.

## 1. Inspect and reuse existing code

| Existing file                            | Use                                                     |
| ---------------------------------------- | ------------------------------------------------------- |
| `client/src/pages/OrdersPage.jsx`        | Existing customer/admin order lists                     |
| `client/src/pages/OrderDetailPage.jsx`   | Existing detail and status-control rendering            |
| `client/src/pages/AdminOverviewPage.jsx` | Entry point for report navigation                       |
| `server/src/routes/orders.js`            | Existing ownership query and presentation shape         |
| `client/src/hooks/useData.js`            | Cancel obsolete requests when filters/navigation change |
| `client/src/utils/format.js`             | Money/status presentation                               |

Proposed files: `server/db/003-locations.mjs`, `server/db/008-report-indexes.mjs`, `server/src/routes/locations.js`, `server/src/routes/reports.js`, `server/src/services/locations.js`, `server/src/services/reports.js`, `client/src/pages/AdminLocationsPage.jsx`, `client/src/pages/AdminReportsPage.jsx`, and `server/test/locations-reports.test.js`.

Coordinate shared order presenter edits with M3. Do not register a duplicate GET handler for the same path and hope Express chooses the intended one.

## 2. Milestone A — cities and the missing Store entity

The ER diagram references DELIVERY.store_id but does not draw STORE. Add it to the revised data model and explain the correction.

1. Define cities: generated unsigned ID, name max 100, is_main_city boolean, is_active boolean. All project cities are supported Texas locations; document that scope rather than accepting arbitrary international city names at checkout.
2. Define stores: generated ID, name max 100, city_id FK, address_line max 250, is_active. A store is a pickup destination; do not add independent store inventory.
3. Use unique normalized city names and a reviewed store uniqueness rule (for example city+name). Index city_id. No hard deletion of referenced rows; deactivate them instead.
4. Implement guarded 003 migration using M4's `.mjs` support. Preserve existing foundation data; do not map old Sri Lankan addresses to Texas city IDs automatically.
5. Create fictional location fixtures with both main/other city classifications and multiple active/inactive pickup stores. City classification is a project assumption; label it as such, not an externally verified business list.
6. Provide a stable fixture JSON response and returned IDs to M2/M3 immediately. Their tests can use it before your UI is finished.

Implement public GET cities/stores and admin create/update endpoints from team section 10. Validate exact body keys/types, trim text and check referenced active city. Only active stores whose city is also active are eligible for new pickup. Return 404/409 for invalid or inactive destinations; don't silently substitute another store.

Example admin store request:

```json
{ "name": "Demo North Pickup", "cityId": 1, "addressLine": "100 Example Road", "isActive": true }
```

Build `/admin/locations` with city and store sections, clear active/main-city toggles and forms. Do not expose database IDs as the only meaningful dropdown labels. Explain that deactivation affects new orders; existing order snapshots retain their original destination.

Add admin-only `GET /admin/cities` and `GET /admin/stores` returning inactive rows too; an administrator needs those rows to edit/reactivate them. Public location endpoints remain active-only. City deactivation may make a preferred saved address unavailable; coordinate M2's explicit select-another-address message instead of rewriting customer preferences silently.

## 3. Milestone B — deterministic delivery estimate function

Implement `fn_delivery_days(is_main_city,was_out_of_stock)` as a deterministic MySQL function returning integer days. Validate booleans/nulls in the calling service; a missing city must not silently become an “other city.” Submit its entire CREATE definition in one migration query, without DELIMITER.

| Main city? | Shortage at order time? | Expected days |
| ---------- | ----------------------- | ------------- |
| Yes        | No                      | 5             |
| No         | No                      | 7             |
| Yes        | Yes                     | 8             |
| No         | Yes                     | 10            |

1. Return `(isMain ? 5 : 7) + (wasOutOfStock ? 3 : 0)` with the documented boolean semantics.
2. Provide `deliveryDays(connection,isMain,wasOutOfStock)` wrapper and `getDestination(connection,mode,id,customerId)` helper. Both use M3's connection and never commit/release it.
3. Delivery resolves an address owned by that customer with active supported city; pickup resolves active store/city. Return a copied destination structure including city ID/name/main-city flag and address/store display fields.
4. M3 evaluates shortage under inventory locks, calls the function, and stores order UTC date plus days. Your helper does not infer shortage from stale browser stock.
5. The brief states delivery estimates; applying the same timing to pickup readiness is an explicit team assumption. Label pickup as estimated ready date.
6. On later backorder allocation or location edit, retain the original stored estimate. Tracking/report can show overdue. Do not display a rolling “five days from today” that changes every refresh.
7. Test all four cases, leap-day/month/year boundaries, and invalid destination/null inputs. Calendar days are used, not working days; holidays are outside this model.

Coordinate any MySQL function-creation privilege issue with M4's documented development configuration. Do not use root credentials in application code.

## 4. Milestone C — define reports before writing SQL

All five reports are admin-only, parameterized, USD project-order scoped and UTC based. Read the exact endpoint/output contracts in team section 10. Scope is new orders joined through successful checkout metadata, not old LKR sample rows.

Validate actual calendar dates, required query fields, nonrepeated parameters and max 366-day inclusive ranges. For year report use 2000–2100. Translate inclusive ranges to `>= start AND < dayAfterEnd`. Use exact decimal arithmetic and string output; report sums may exceed the per-order limit. Never display failed queries as valid zero totals.

### Report 1 — quarterly sales for a given year

Endpoint: `GET /admin/reports/quarterly-sales?year=2026`.

1. Filter project USD orders by `created_at` within that calendar year and exclude cancelled orders.
2. Group by calendar quarter, count orders and sum order total. Do not join order items before summing order totals.
3. Build exactly Q1–Q4 rows, filling zero quarters explicitly.
4. Label sales as noncancelled ordered value, including backorders, and state that it is not cash received. This interpretation fills a gap in the brief.
5. Test orders exactly on quarter/year boundaries and a cancelled order that must not count.

### Report 2 — top-selling products in a period

Endpoint: `GET /admin/reports/top-products?from=2026-01-01&to=2026-01-31&limit=10`.

1. Filter eligible noncancelled orders by created_at.
2. Join their items to variants/product identity and group all variants under product ID.
3. Sum quantities and historical item quantity×unit_price. Do not use today's variant price.
4. Rank quantity descending, then product ID ascending to break ties. Validate limit 1–50.
5. Display product name using the current catalogue label with a note that monetary amounts use order snapshots; historical identity remains the product ID.
6. Test two variants of one product, ties, later price edits, and cancelled rows.

### Report 3 — category-wise total orders

Endpoint: `GET /admin/reports/category-orders?from=2026-01-01&to=2026-01-31`.

1. Use `order_item_categories` snapshots from M3, not current product_categories, for historical membership.
2. Count DISTINCT order_id per category after filtering eligible orders. Multiple items in the same category still count as one order there.
3. Include categories with zero orders through a left join or explicit zero fill.
4. Explain that one multi-category order can count in multiple category rows; adding category totals does not equal the global number of orders.
5. Test two lines in one category, a product in two categories, and category reassignment after checkout.

### Report 4 — estimates for upcoming orders

Endpoint: `GET /admin/reports/upcoming-deliveries?from=2026-01-01&to=2026-01-31`.

1. Filter stored estimated_date within inclusive range and exclude delivered, collected and cancelled.
2. Include backordered, confirmed, processing, shipped and ready_for_pickup project orders.
3. Return order ID/mode/status, original estimated date, actual date (normally null), initial shortage and overdue flag based on today's UTC date.
4. Show “estimated ready date” for pickup, “estimated delivery date” for delivery. Backordered estimates do not mean inventory has been obtained.
5. An overdue unfinished order appears when its original date is included in the chosen range. Provide a date range control that allows past dates instead of hiding overdue orders automatically.

### Report 5 — customer-wise order summary and payment status

Endpoint: `GET /admin/reports/customer-orders?from=2026-01-01&to=2026-01-31` with optional customerId.

1. Select project orders created in range, including cancelled orders so their refund/void state remains visible.
2. Join the unique payment row once per order and group by customer. Never join multiple items before calculating payment sums.
3. Return orderCount (including cancelled), orderedAmount (noncancelled), current paidAmount and refundedAmount, and per-order ID/total/order status/payment status.
4. These monetary sums describe payments of orders created in the selected period, not receipts/refunds that occurred during that period. Put that definition beside the filters.
5. Include customers with orders in range; a selected customer with none gets an empty items array or explicit zero row, choose one and document it consistently. Use an empty array for the canonical first version.
6. Test pending COD, paid COD/card, refunded card, void COD and a customer with multiple orders.

## 5. Milestone D — hand-checkable report fixtures

Create isolated truthful fixture orders through M3's service, then use a dedicated test fixture mechanism for controlled dates. Do not add public “edit historical timestamp” endpoints. Use stable test IDs/keys and a fixed clock in tests.

One simple expected dataset:

| Order         | Created    | Lines/value                | State/payment           | Categories  |
| ------------- | ---------- | -------------------------- | ----------------------- | ----------- |
| A, customer 1 | January 10 | 2×Speaker 40 =80           | confirmed/paid card     | Audio       |
| B, customer 1 | January 11 | 1×Speaker 40 +1×Toy 20 =60 | backordered/pending COD | Audio; Toys |
| C, customer 2 | April 01   | 1×Toy 20 =20               | confirmed/pending COD   | Toys        |
| D, customer 2 | January 12 | 1×Toy 20 =20               | cancelled/refunded card | Toys        |

Expected full-year quarterly sales: Q1 count 2/value 140.00, Q2 count 1/value 20.00, Q3/Q4 zero. January top products: Speaker 3 units/120.00, Toy 1/20.00. January category order counts: Audio 2, Toys 1. Customer 1 January summary:2 orders, ordered 140.00, paid 80.00, refunded 0.00. Customer 2 January:1 cancelled order, ordered 0.00, paid 0.00, refunded 20.00.

Add a multi-category item and duplicate category lines in separate tests to prove DISTINCT behavior without confusing the base arithmetic. Give upcoming-orders fixtures all four estimate cases and a fixed “today” for deterministic overdue expectations.

For large-result queries, inspect EXPLAIN and propose only useful additional indexes in 008. Likely candidates include orders(currency,created_at), orders(customer_id,created_at), deliveries(estimated_date), and snapshot join keys; confirm existing indexes and the actual query plan first. Small fixture tables may legitimately use scans; explain limitations rather than claiming performance gains without evidence.

## 6. Milestone E — reports UI and customer tracking

### Admin reports

1. Add `/admin/reports` under existing admin guard with five named report sections/tabs. A generic dashboard total is not a substitute.
2. Add year/date/customer/limit inputs only where appropriate. Show active filters, UTC, USD and project-order scope visibly.
3. Use tables first, with clear columns and currency formatting. Optional charts must match tables; do not add chart dependencies before the tables work.
4. Show loading, empty, validation and API failure states. Cancel stale requests when filters change using existing data-loading patterns.
5. Keep report SQL in services and response mapping separate from React. Explain metric definitions near each report, particularly multi-category totals and ordered value versus paid amount.

### Customer order tracking

1. Extend existing `/account/orders` and `/account/orders/:id` views instead of rebuilding them. Coordinate M3's shared presenter and M4's action controls.
2. Show order/payment status, immutable item amounts, destination or pickup store, original estimated/actual date, shortage/backorder notice and chronological status history.
3. Display shipped as “Dispatched” to match ER terminology while retaining the agreed API value. Pickup uses ready/collected, not a delivery-only timeline.
4. A cancelled/refunded order has its own terminal display; don't render future steps as if it is still moving toward delivery.
5. Connect a cancellation button to M3's endpoint only when the shared lifecycle permits it; server still checks ownership and current state.
6. Existing legacy orders show available historical data and a clear “legacy sample; delivery/payment tracking unavailable” note rather than invented values. Preserve existing currency.
7. Backend GET order queries must check owner or admin before adding history/payment/delivery. Do not expose internal request keys, fingerprints, payment simulation tokens or unrelated admin data.

## 7. Test matrix and review

| Case                                                | Expected                                                 |
| --------------------------------------------------- | -------------------------------------------------------- |
| Active/inactive city/store reads                    | Only eligible destinations offered for new checkout      |
| Customer tries location/report admin mutation/read  | 403; visitor 401                                         |
| Wrong/private address in shared destination helper  | 404 without disclosure                                   |
| All estimate inputs and date boundaries             | 5/7/8/10 and correct calendar date                       |
| Location edited after checkout                      | Historical snapshot/estimate unchanged                   |
| Hand-calculated fixture reports                     | Exact expected rows/counts/amounts                       |
| Multiple items/payments joins                       | No multiplied totals                                     |
| Multi-category orders                               | Distinct per category, deliberate cross-category overlap |
| Zero quarters and empty ranges                      | Explicit zeros/empty arrays, not missing required rows   |
| Malformed/impossible/reversed/oversized date inputs | 400, no silently normalized query                        |
| Order tracking as another customer                  | 404                                                      |
| Backordered/pickup/cancelled/legacy tracking        | Correct distinct state labels and available data         |

Automate report SQL assertions against real MySQL fixture data. Use API tests for auth/validation and frontend checks for display/filter behavior. Run all shared checks after rebuilding tests. Save representative EXPLAIN output and explain each useful index.

## 8. Handoff and completion

Deliver city/store/function contracts early to M2/M3. Later collect truthful project-order fixtures from M3/M4, compare all report totals manually, and assemble the R01–R20 coverage table from every member's evidence. Other members still supply their own report sections and demos.

- [ ] Missing STORE entity and city relationships are reflected in migrations/revised ER.
- [ ] Locations UI/API and four-case estimate function work.
- [ ] All five named reports have exact contracts, correct SQL and clear definitions.
- [ ] Hand-calculated totals, date boundaries, duplicates and authorization tests pass.
- [ ] Tracking reuses existing pages and preserves historical/payment/delivery truth.
- [ ] New and legacy data are not mixed into misleading USD sales totals.
- [ ] Query/index rationale, screenshots, own written section and requirement evidence are reviewed.

Explain why five reports use different grouping/filter rules, why category counts overlap, why payment joins can multiply totals, and why storing a promised date is different from recalculating an estimate every day.
