# Member 3 — checkout, payments and cancellation

## Your outcome and boundaries

Turn a customer's saved cart into a complete order with items, delivery, payment and inventory effects committed together. Support both delivery modes, COD and clearly labelled simulated card payment, whole-order backorders, safe retries and cancellation/refund. Your package has fewer screens because its transaction correctness is demanding.

Read [shared workflow](00_SHARED_START_HERE.md), [ER alignment](02_REQUIREMENTS_AND_ER_ALIGNMENT.md) and [team plan](01_TEAM_PLAN.md), especially sections 7–9. You own R05–R10's checkout side and order/payment integrity. M4 owns reusable stock routines, later allocation and fulfilment; M5 owns location data/estimate function and customer tracking.

## 1. Read and prepare interfaces

| Existing file                          | What to understand                                       |
| -------------------------------------- | -------------------------------------------------------- |
| `server/src/routes/orders.js`          | Order mapping, ownership and existing status endpoint    |
| `shared/index.js`                      | Single lifecycle source; you and M4 extend it together   |
| `server/db/001-foundation.sql`         | Existing order/item columns and snapshots                |
| `client/src/pages/OrderDetailPage.jsx` | Reusable detail view; M5 maintains tracking presentation |
| `server/test/app.test.js`              | Existing ownership/lifecycle assertions                  |

Proposed new files: `server/db/007-checkout-fulfilment.mjs`, `server/src/routes/checkout.js`, `server/src/services/checkout.js`, `server/src/services/payments.js`, `server/src/services/cancellation.js`, `client/src/pages/CheckoutPage.jsx`, and `server/test/checkout-payments.test.js`. Use branch `feature/checkout-payments`.

Request actual agreed interfaces early: M1 exact money helper, M2 consistent `readCart(connection,customerId)`, M4 stock routine wrapper accepting your connection, M5 destination/estimate helpers. Prepare test doubles matching their contracts while they work. Do not put fixture-only success in live endpoints.

## 2. Milestone A — order schema and lifecycle extension

1. Extend orders through a guarded migration, preserving legacy rows and values. Add `backordered` to status, stock_state none/allocated/released/consumed, and was_out_of_stock boolean. New data must satisfy mode/status checks.
2. Audit duplicate `(order_id,variant_id)` rows before adding a unique index. Do not silently delete/merge conflicting historical prices. The foundation's surrogate item ID remains because snapshots/report joins use it.
3. Create checkout_requests, payments, deliveries, order_status_history, order_item_categories and order_cancellations using fields/keys in team section 7. Include payment amount/currency despite their absence in the diagram so reporting has an explicit monetary record.
4. One delivery/payment row per order is enforced with unique order FK. Address and store are nullable according to mode; preserve destination JSON if an address is deleted. Store actual_date as nullable until real completion in the simulated workflow.
5. M4's order_operations table may live in this shared migration; have M4 supply/review its definition before merge. Do not create two migrations racing to define it differently.
6. Extend `shared/index.js` and lifecycle tests with M4: new checkout returns confirmed if allocated, backordered otherwise. No stock is deducted later merely because processing begins.
7. Keep legacy sample orders readable. They lack truthful stock/payment/delivery history; writes through the new feature return `LEGACY_ORDER_REQUIRES_MIGRATION`. Never infer a paid receipt or prior deduction from their status.
8. Test both fresh and existing schema. Routines are installed by M4/M5 migrations first; preserve named setup locking and history markers.

## 3. Milestone B — validate checkout and simulate payment honestly

Delivery card request:

```json
{
  "fulfillment": "delivery",
  "addressId": 11,
  "paymentMethod": "card",
  "simulationToken": "demo-approved",
  "cartVersion": 3,
  "requestKey": "11111111-1111-4111-8111-111111111111"
}
```

Pickup COD request:

```json
{
  "fulfillment": "pickup",
  "storeId": 1,
  "paymentMethod": "cod",
  "cartVersion": 3,
  "requestKey": "22222222-2222-4222-8222-222222222222"
}
```

Validate a plain object with exactly mode-specific fields: positive address/store ID, integer cartVersion≥0, UUID, allowed mode/method. Pickup omits addressId entirely; delivery omits storeId. COD omits simulationToken. Card accepts only `demo-approved` or `demo-declined` on the labelled classroom simulator. Do not ask for, store or log real card numbers/CVV.

Use deterministic local simulation; no external gateway call occurs during a transaction. An approved simulation produces paid; COD pending. Declined card stores a failed checkout attempt but no order/payment/delivery/item/stock writes. Its response is 402 `PAYMENT_DECLINED`. This failed attempt fulfills failure auditing without fabricating an order containing a failed payment.

Compute a SHA-256 fingerprint from a canonical normalized payload covering fulfillment, address/store (unused value null), paymentMethod, simulator value (null for COD) and cartVersion. Do not include volatile current prices in the request fingerprint; checkout retrieves those separately. Do not expose the key/fingerprint in customer order JSON.

## 4. Milestone C — implement the single checkout transaction

Use the following order, on **one connection**:

1. Begin transaction and lock the current customer row. Require customer role before proceeding.
2. Check `(customer_id,request_key)` first. Matching fingerprint and placed order → return current order with 200. Matching declined attempt → repeat 402. Different fingerprint →409 `IDEMPOTENCY_CONFLICT`. End transaction cleanly without rewriting anything.
3. Read cart consistently. Reject empty cart (`EMPTY_CART`), stale version (`CART_CHANGED`), invalid limits or unavailable/inactive/non-USD items (`VARIANT_UNAVAILABLE`). Recheck current metadata; do not trust browser items/prices.
4. Resolve owned active Texas address or active pickup store using M5's helper. Lock destination rows appropriately while copying line/city/classification details. Invalid/private address is 404; unsupported destination is a documented 409.
5. Resolve the immutable product IDs for cart variants, lock product parents ascending, then lock all variant rows ascending. Read current stock/prices and product/variant names/categories under those locks so catalogue edits cannot produce a mixed snapshot. Confirm metadata still active after locks. Do not read stale values from an earlier ordinary snapshot after acquiring a current locking read.
6. Calculate exact line totals and order total with M1's integer helper; reject overflow. Determine shortage if **any** quantity exceeds stock.
7. Evaluate simulator. For decline, insert checkout_requests with declined payment_result/order_id null, commit only this attempt and return 402. Cart and inventory are untouched. For unexpected failure, roll everything back.
8. Insert order as backordered/stock_state none if shortage; otherwise confirmed/allocated. Set was_out_of_stock according to the initial shortage, currency USD and total from server.
9. Insert all order items with historical names/unit prices and category snapshot joins. There must be at least one item.
10. For a fully stocked order, call M4's procedure wrapper for negative quantities using `sale:<orderId>:<variantId>` references. Do not issue another direct UPDATE to stock. For shortage, do not deduct any line, even those currently available.
11. Call M5's `fn_delivery_days` with copied city classification and initial shortage. Store order UTC date plus resulting calendar days as estimated_date. Pickup uses store city under the explicit assumption. Actual_date remains null.
12. Insert delivery with correct nullable address/store keys and immutable destination snapshot. Insert payment with pending COD or paid simulated card, order amount/currency and simulation reference/time.
13. Insert initial history from null to status and successful checkout request→order mapping. Clear cart items, increment cart version and check overflow.
14. Prepare the mapped detail response, commit, release and send 201. Any error before commit rolls back order/items/payment/delivery/category snapshots/stock/movements/cart changes together.

Never use pool queries inside a transaction after acquiring a connection. Never send success before commit. No helper may commit the caller's transaction. If the response is lost after commit, a same-key retry returns the existing order before inspecting the now-empty cart.

### Worked examples

Two units at 40.00 plus one at 15.00 yield 95.00. If both lines are available and the city is main, create confirmed, deduct 2 and 1, estimate +5. If the second line has zero stock, create backordered, deduct neither line, estimate +8. Other-city equivalents are +7 and+10. Do not reduce only the first line of a backorder.

The estimate is stored even though replenishment is not guaranteed; tracking can show it overdue. Do not pretend that adding three days automatically makes inventory exist.

## 5. Milestone D — cancellation/refund transaction

Implement customer-owner and admin cancellation endpoints from the team plan. Both accept `{requestKey,reason}`. Do not leave the old generic status endpoint able to set cancelled without this service.

1. Validate input/actor, begin transaction and lock order row first. For customer callers, enforce ownership before revealing metadata.
2. Check existing cancellation operation. Same key/actor/reason returns current order; reused key with changed inputs conflicts; a different cancellation after cancellation conflicts without side effects.
3. Require project metadata and current state backordered or confirmed. Processing/shipped/ready/completed cannot cancel under this assumption.
4. If stock_state allocated, aggregate item quantities by variant, lock ascending and call M4's helper with positive deltas and `cancel:<orderId>:<variantId>` references. Set stock_state released.
5. If none, restore no stock and retain none. Do not turn a backorder into extra warehouse stock.
6. Lock payment record consistently. Paid simulated card → refunded with full original amount and refund reference/timestamp; pending COD → void. Retain original amount/paid timestamp for reporting. No actual bank money moves.
7. Set cancelled, insert history and cancellation operation; commit all changes together. Any stock overflow/refund inconsistency rolls back cancellation too.
8. Return mapped order with payment/delivery status; never delete rows to represent cancellation.

Provide M4 a transaction-aware `collectCod(connection,order,adminId,requestKey)` helper: validate pending COD, set paid with amount/order currency, receipt reference and paid time inside M4's completion transaction. It never starts/commits/releases a transaction. M4 controls completion idempotency, actual date and order status.

## 6. Milestone E — checkout page

1. Add `/checkout` under a customer guard and connect from M2's cart.
2. Fetch current cart, owned usable addresses and active stores. Show line quantities/current total, shortage warning and unavailable-line error.
3. Delivery requires address selection; pickup requires store. Show links to manage addresses and clear radio/select labels.
4. Offer COD or “Simulated card payment.” For simulator, provide explicit approve/decline test choices; no real card form. Display that no money is charged.
5. Explain server rechecks final prices and stock; the committed order may be backordered. Provide consent wording for the demonstrated backorder policy rather than silently claiming immediate fulfilment.
6. On deliberate submit, freeze payload with cartVersion and one UUID. Disable repeated clicks while pending.
7. On success navigate to existing order detail using returned ID; M5 renders payment, estimated date and tracking. Do not create a second incompatible order-detail screen.
8. On uncertain network error, retry the exact same payload/key. Retain pending attempt in memory. On refresh, the current app loses this memory and token: tell users to check orders after signing in before starting another attempt; don't promise refresh-proof recovery.
9. On definitive stale-cart/unavailable conflict, reload cart and let a revised deliberate action use a new key. On decline, keep cart and offer a new payment attempt with a fresh key after the customer changes their choice.

## 7. Tests required for this package

| Case                                              | Expected                                                  |
| ------------------------------------------------- | --------------------------------------------------------- |
| COD/card approved delivery and pickup             | Complete order rows, exact total, correct payment/mode    |
| Four city/shortage combinations                   | 5/7/8/10 days; deterministic stored date                  |
| Any shortage                                      | Whole order backordered; zero partial stock deduction     |
| Declined simulator                                | Failed attempt only;402; cart/stock preserved             |
| Same key success/failure replay                   | Same order or same decline; no extra effects              |
| Same key changed payload                          | 409                                                       |
| Another customer's address / guest/admin checkout | 404 /401/403                                              |
| Client injects total/price/status/customerId      | 400                                                       |
| Force failure after first movement or cart clear  | Full rollback across every table                          |
| Two last-unit checkouts                           | One confirmed, one backordered; stock 0                   |
| Allocated cancellation repeated                   | One restoration and refund/void only                      |
| Backorder cancellation                            | No stock restoration                                      |
| Catalogue/address edited later                    | Order snapshots unchanged                                 |
| Legacy sample write                               | Explicit migration-required conflict; no invented records |

Use real MySQL for concurrency and triggers; mocked calls cannot prove atomicity. Write meaningful service/API tests using existing patterns, and run shared checks after rebuilding. Check every acquired connection releases even on rollback failure. Remove deliberate failure injection from production routes; use test dependencies/wrappers.

## 8. Handoff and completion

Give M4 checkout-created confirmed/backordered/COD/card fixtures, stock states and COD helper; give M5 the exact presentation shape and snapshot/report fields. Comment why replay lookup precedes cart inspection, why no partial allocation occurs, and why simulation is not real settlement.

- [ ] New orders include items/payment/delivery atomically.
- [ ] Confirmation and stock deduction happen once; backorders allocate nothing initially.
- [ ] Both delivery/payment modes and all estimate cases work.
- [ ] Idempotency covers success, decline, cancellation and uncertain response.
- [ ] Cancellation restocks only allocated project orders and performs simulated refund/COD void atomically.
- [ ] M4 completion and M5 tracking consume compatible contracts.
- [ ] Failure/concurrency evidence, updated ER/data dictionary and presentation explanation are complete.

Explain ACID using one real checkout failure, distinguish requestKey from cartVersion, and explain why a simulated card decision can participate locally while a real gateway would require a separate payment design.
