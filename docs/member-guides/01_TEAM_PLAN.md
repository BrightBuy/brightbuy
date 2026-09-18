# Five-member plan, shared contracts and integration

**Future feature specification.** The [current API](../API.md) is the implemented Step 1 baseline. These contracts replace the earlier four-person proposal. Read [requirements/ER alignment](02_REQUIREMENTS_AND_ER_ALIGNMENT.md) for source references and design corrections. Do not silently combine this plan with the old manual-bank-transfer/insufficient-stock-rejection plan.

## 1. Balanced allocation

| Member | Package                                                               | Database/business complexity | UI/API breadth | Data/testing/handoff | Relative points |
| ------ | --------------------------------------------------------------------- | ---------------------------- | -------------- | -------------------- | --------------- |
| 1      | Catalogue, categories, attributes, variants, 40-product dataset       | 7                            | 8              | 7                    | 22              |
| 2      | Customer profile/registration, address/default rules, persistent cart | 7                            | 8              | 6                    | 21              |
| 3      | Checkout, payments, cancellation/refund                               | 12                           | 4              | 6                    | 22              |
| 4      | Inventory, backorders, fulfilment, routine-capable migrations         | 12                           | 4              | 6                    | 22              |
| 5      | Locations, estimates, five reports, order tracking                    | 8                            | 8              | 6                    | 22              |

Points express relative expected effort, not measured hours or marks. M3/M4 have fewer screens because transactions and failure cases are harder. M5 reuses existing order pages instead of rebuilding them. All five additionally share integration/demo/report-writing work equally. Reassess after the first working demonstration: if M3 is overloaded, M5 can take order-confirmation UI; if M4 is overloaded, M1 can take inventory filter UI after catalogue APIs land. Transfer a bounded task with its tests, not the owner's transaction rules.

Use branches `feature/catalogue-variants`, `feature/customers-cart`, `feature/checkout-payments`, `feature/inventory-fulfilment`, and `feature/locations-reports` respectively. Shared-file edits are small reviewed changes: M2 coordinates auth; M3 and M4 jointly review lifecycle edits; M1 coordinates currency/money helpers; everyone supplies their own app/router/navigation additions. Rotate the merge coordinator at each integration milestone.

## 2. Agreed working assumptions

These decisions fill gaps in the brief; they are not quotations from it:

- New project data uses Texas/US locations and USD; legacy LK/LKR data is preserved and labelled as described in the alignment guide.
- Stock is centralized per variant; pickup stores have no independent stock balance.
- Both product and variant SKUs are unique within their own namespace. Products have at least one category and exactly one active default variant before activation. No category hierarchy in this first version.
- A customer may place a **whole-order backorder**. If any requested quantity is unavailable, allocate nothing yet; status backordered and stockState none. Once all lines are available, allocate all and confirm in one transaction. No partial shipment or negative stock.
- An allocated checkout is the confirmation event: it creates status confirmed and decrements stock in that same transaction. There is no later second deduction when processing begins.
- Standard-delivery estimate is order UTC date +5 main-city/+7 other-city calendar days, plus 3 if any shortage existed at order time. Pickup readiness uses the selected store's city and the same formula as a documented extension. Estimates are planning dates, not a guarantee that restocking has occurred.
- Store the original estimate and shortage flag. Do not recalculate a customer's original promise just because a city classification changes. Show overdue when still incomplete after that date. Revised promises are outside scope.
- No delivery fee, tax or discount in this first version; total is sum of immutable item amounts. Document this zero-fee assumption.
- COD is pending until delivery/collection, when the administrator confirms cash receipt. For pickup, COD means cash on collection. Card payment is a **clearly labelled deterministic classroom simulator**, not a real gateway. It may approve or decline; no card number/CVV is requested or stored.
- Approved card payment on a backorder is simulated prepayment. Cancelling before processing simulates a full refund; COD cancellation voids the pending payment. No partial refunds/returns or post-processing cancellation.
- Reports use UTC periods and identify them in the UI. Sales means noncancelled project orders by order creation date, shown separately from payment status. This is an explicit reporting definition, not cash accounting.

## 3. Database migration and fixture order

Reserve these only after confirming no new teammate migration already uses a number:

| Version/file (proposed)             | Owner              | Contains                                                                                                    |
| ----------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `002-routine-migration-support.sql` | M4                 | Optional harmless schema bookkeeping only if needed; runner capability itself is JavaScript source, not SQL |
| `003-locations.mjs`                 | M5                 | cities, stores, `fn_delivery_days`                                                                          |
| `004-catalogue.mjs`                 | M1                 | categories/attributes/joins; product and variant fields/default constraints                                 |
| `005-accounts-cart.mjs`             | M2                 | customer extensions/admin_profiles, address city/default fields, carts/items                                |
| `006-inventory.mjs`                 | M4                 | inventory movements, procedure, trigger                                                                     |
| `007-checkout-fulfilment.mjs`       | M3, reviewed by M4 | order extensions, checkout_requests, payment/delivery/history/category snapshots                            |
| `008-report-indexes.mjs`            | M5                 | Only additional indexes demonstrated useful by EXPLAIN                                                      |

Version 002 is reserved for M4's compatibility work; **do not create a no-op migration just to fill the number**. Missing numbers are allowed. All routine modules are proposed future files: the current runner recognizes only numbered `.sql`. M4 first adds `.mjs` support with exported `up(connection)` and a common basename version marker. SQL files retain existing behavior; modules submit each complete SQL definition in one `connection.query()` call. No `DELIMITER` directives. Reject duplicate basenames/number allocations and mark a version applied only after success.

For retry-safe ALTERs/routines, inspect `information_schema` for the named column/index/constraint/routine, apply only missing operations, and verify existing definitions match expected ones. Unexpected definitions stop setup for review. Never blindly drop existing data/routines, edit an applied migration, or assume MySQL DDL rolls back. Keep the existing setup database lock and pool cleanup.

**Fresh-database seed compatibility matters:** current setup applies migrations before running the old demo seed. A migration-only backfill therefore misses demo rows inserted afterward. New columns must initially permit the old seed's explicit column list (nullable or correct legacy defaults); for example legacy product SKU/combination keys can initially be null, not a shared empty unique value. M4 coordinates a repeatable post-demo-seed reconciliation hook, supplied/reviewed by M1/M2, before project seeding. It fills only missing legacy product identifiers and admin profiles and preserves existing user changes. Run it even when the original seed marker already exists. Do not invent Texas mappings or historical payments. Test both a genuinely empty database and an existing foundation volume to prove setup works in both orders.

When `.mjs` migrations are introduced, M4 also updates `.prettierignore` to protect applied module migrations, just as applied `.sql` files are protected. Format a new migration before applying it; do not let a later bulk formatter rewrite migration history.

Use InnoDB, matching unsigned FK types and explicit constraints. Do not run a fresh initial schema over the existing volume. Fixture program `server/src/database/seedProject.js` (proposed, M1 coordinates) runs **after all new migrations** on a test database with an explicit opt-in command. Each member supplies repeatable fixture functions. New project fixtures use stable unique keys and a separate marker; never delete `demo-v1` to rerun the original seed. M4's routine supplies initial stock movements for new zero-stock variants. M3 creates truthful order/payment/delivery fixtures through the shared transactional service, including card failure/backorder/COD cases. Failed attempts do not produce orders.

## 4. Shared conventions

- Base path `/api`; React `api()` receives paths without `/api`. Success stays `{data: ...}`, error stays `{error:{code,message,details,requestId}}`.
- Preserve existing login/JWT/in-memory token behavior. Backend reloads the role from the database. Never replace it with a client-selected role. Customer-only endpoints reject admins; admin endpoints use `requireAdmin`.
- New creates return 201, reads/updates/replays 200. Deletes return JSON `{data:{deleted:true}}` (cart deletion returns updated cart). A declined simulated payment uses 402 `PAYMENT_DECLINED`.
- IDs/quantities are positive JSON integers; versions may be zero. Write bodies are plain objects with exactly the allowed keys. Quantity limit 1–99 per line; at most 100 distinct cart lines. Unknown/private records return 404; missing login 401; wrong role 403.
- Money fields are strict nonnegative two-decimal strings with per-order maximum `9999999999.99`. Use integer minor units/BigInt helpers, bounds checks and string serialization; never trust browser totals. Report aggregate output can exceed a single-order maximum.
- Trim ordinary text, normalize email to lowercase and SKUs to uppercase. Do not trim passwords. Use parameterized SQL, sanitized errors and clear field-level validation.
- UUID request keys identify one action and are retained with the exact payload for uncertain retries. Same key/different normalized payload gives 409 `IDEMPOTENCY_CONFLICT`. Database uniqueness remains mandatory.
- All dates/timestamps use documented ISO UTC formatting; date-only values remain `YYYY-MM-DD`. Keep keys, raw hashes, internal database messages and secrets out of public responses.
- New endpoints use project data by default; writes against unmigrated legacy orders return 409 `LEGACY_ORDER_REQUIRES_MIGRATION`. Reports explicitly describe their project-only scope. Do not fake missing historical payment or inventory records.

## 5. Contracts: catalogue (M1)

All paths in tables are relative to `/api`. Admin metadata routes never accept stock fields.

| Method/path                                             | Input/query                                                       | Success data                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /products` (existing)                              | None                                                              | Product array with additive category/currency/default fields; document final active-project scope change |
| `GET /catalogue`                                        | `q`, `categoryId`, `page` default 1, `pageSize` default 12 max 50 | `{items,page,pageSize,total}`                                                                            |
| `GET /products/:id`                                     | None                                                              | Product plus variants/attribute values/categories                                                        |
| `GET /categories`, `GET /attributes`                    | None                                                              | Respective arrays                                                                                        |
| `POST /admin/products`                                  | `{sku,name,description,brand,categoryIds}`                        | Inactive draft product; currency USD chosen by server                                                    |
| `PATCH /admin/products/:id`                             | `{sku,name,description,brand,categoryIds}`                        | Product; preserve stock/history                                                                          |
| `POST /admin/products/:id/variants`                     | `{sku,name,price,attributeValues}`                                | Zero-stock variant; first becomes default                                                                |
| `PATCH /admin/variants/:id`                             | Same four fields                                                  | Updated variant                                                                                          |
| `PUT /admin/products/:id/default-variant`               | `{variantId}`                                                     | Product                                                                                                  |
| `PATCH /admin/products/:id/active`                      | `{isActive}`                                                      | Product; activation requires category/default/active variant                                             |
| `PATCH /admin/variants/:id/active`                      | `{isActive}`                                                      | Variant; cannot deactivate required default without replacement                                          |
| `POST /admin/categories`, `PATCH /admin/categories/:id` | `{name,description}`                                              | Category                                                                                                 |
| `POST /admin/attributes`, `PATCH /admin/attributes/:id` | `{name}`                                                          | Attribute                                                                                                |

Product name 150, description 5000, brand 100, product/variant SKU 60, variant name 100, category name 100/description 500, attribute name 50/value 100. `attributeValues` is an array of `{attributeId,value}` with distinct attribute IDs. Canonical normalized sorted combinations must be unique per product, including the empty/default-only combination. No hard deletion needed; category/attribute semantic reassignment must not corrupt history. Details in M1 guide.

Product responses preserve id/name/description/variants and add sku, brand, currency, isActive, isLegacy and categories `[{id,name}]`. Each variant preserves id/productId/sku/name/price/stock and adds isActive, isDefault and attributeValues `[{attributeId,name,value}]`. Public responses omit internal combination hashes; public catalogue includes active project variants only. Admin reads need inactive drafts/variants too: add admin-only `GET /admin/products` (array) and `GET /admin/products/:id` (full product). These reads are required for editing drafts that do not appear publicly.

## 6. Contracts: customers/addresses/cart (M2)

| Method/path                     | Input                                                       | Success data                                                              |
| ------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `POST /auth/register`           | `{firstName,lastName,email,password,phoneNumber}`           | Existing user shape with additive profile fields; then sign in separately |
| `PATCH /account/profile`        | `{firstName,lastName,phoneNumber}`                          | Updated user; refresh AuthProvider                                        |
| `POST /addresses`               | `{recipient,line1,line2,line3,cityId,postalCode,isDefault}` | Owned address with additive city/default fields                           |
| `PATCH /addresses/:id`          | Same full editable fields                                   | Owned address                                                             |
| `DELETE /addresses/:id`         | None                                                        | `{deleted:true}`                                                          |
| `PUT /addresses/:id/default`    | Empty object                                                | Selected address; exactly one usable default                              |
| `GET /cart`                     | None                                                        | Cart below                                                                |
| `PUT /cart/items/:variantId`    | `{quantity}`                                                | Updated cart; replaces quantity                                           |
| `DELETE /cart/items/:variantId` | None                                                        | Updated cart                                                              |

Keep existing `GET /addresses` owned array. Country is server-selected US for new project addresses and city text comes from city FK. Optional lines/phone use empty strings, not extra arbitrary fields. Require first/last name 1–50 each with combined display name ≤100; normalized email ≤254; password 12–128; phone≤20; recipient 100/line1 200/lines 2–3 250/postalCode 10. US ZIP syntax `12345` or `12345-6789` is an assumption for new addresses.

```json
{
  "data": {
    "version": 3,
    "currency": "USD",
    "items": [
      {
        "variantId": 101,
        "productId": 41,
        "productName": "Demo Speaker",
        "variantName": "Blue",
        "sku": "SPKR-BLUE",
        "quantity": 2,
        "unitPrice": "40.00",
        "stock": 1,
        "available": true,
        "lineTotal": "80.00"
      }
    ],
    "total": "80.00",
    "hasShortage": true
  }
}
```

`available` means product/variant is active and in the supported currency; shortage is separate. **Allow quantities above current stock** for future backordering. Inactive saved lines remain visible with available false and block checkout until removed. Do not reserve stock in cart. Missing cart returns version 0/empty lines without inserting. Lock customer row for cart/address writes, lazily create header, bump version only for changed contents and checkout clear. Consistent reads return matching version/items; prices/stock can change without a cart version change and are rechecked at checkout.

## 7. Contracts: checkout/payments/cancellation (M3)

`POST /orders` requires a customer. Delivery example:

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

Pickup uses `storeId` and omits addressId. COD uses paymentMethod `cod` and omits simulationToken. Card accepts only `demo-approved`/`demo-declined` on the explicitly labelled classroom simulator. Never accept prices, item arrays, total, customerId or requested status. A successful response is order detail with additive `payment`, `delivery`, `stockState`, `wasOutOfStock` fields; 201 new, 200 replay. It may be confirmed or backordered.

Create `checkout_requests(customer_id,request_key,fingerprint,payment_result,order_id nullable,created_at)` with composite primary key and unique non-null order_id. Fingerprint covers normalized mode, chosen address/store, payment method/token and cartVersion. Decline commits only a failed attempt record, returns 402 and leaves cart/stock/orders untouched. Retry of that key reproduces failure; changed input is 409. A deliberate new attempt uses a new key. Success stores the order ID so a retry after cart clear returns that order before checking the current cart.

`payment_result` is `approved`, `declined` or `not_required` (COD). A new order's public payment object is `{id,method,status,amount,currency,reference,paidAt,refundedAt}`; delivery is `{mode,destinationSnapshot,estimatedDate,actualDate}`; history is `[{fromStatus,toStatus,createdAt}]`. Amount stays the original full order amount after refund/void; status determines its reporting meaning. Preserve existing order/item field names. Date-only estimate/actual values serialize as `YYYY-MM-DD`, not a locale-shifted midnight timestamp.

Order extensions: `stock_state` none/allocated/released/consumed; `was_out_of_stock` boolean. `payments`: unique order FK, method cod/card, status pending/paid/refunded/void, amount/currency, simulator reference, paid/refunded timestamps, collection/refund operation keys and admin ID where applicable. `deliveries`: order ID PK/FK, mode, nullable address/store FK, copied destination JSON with city/classification, estimated_date, nullable actual_date. Exactly one row of each is created with new orders. `order_status_history`: ID, order, nullable from_status, to_status, actor principal ID, UTC timestamp. `order_item_categories`: composite order-item/category key for historical category counts.

A delivery-mode CHECK must require the destination snapshot and null store_id, but allow address_id to become null after address deletion (`ON DELETE SET NULL`). New delivery creation still requires a valid owned address in the API. Pickup requires a store_id, null address_id and a store destination snapshot. Preserve existing `orders.address_snapshot` too for existing API clients: address snapshot for delivery, null for pickup.

`POST /orders/:id/cancel` (owner) and `POST /admin/orders/:id/cancel` (admin) both accept `{requestKey,reason}` with reason 1–200. Same action key replays safely; different key after cancellation conflicts. Use an `order_cancellations` record keyed by order with unique request key, actor/reason for replay comparison. Cancellation is allowed only for backordered/confirmed project orders. Restore allocated stock once, refund simulated paid card or void pending COD, update status/history and mark stock state released (allocated) or none (never allocated), in one transaction.

## 8. Contracts: inventory/fulfilment (M4)

| Method/path (admin)                                   | Input/query                                          | Success data                                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /admin/inventory`                                | `lowStockOnly` boolean string, `threshold` default 5 | Variant/product IDs, names, SKU, stock, active flag                                               |
| `POST /admin/variants/:id/stock-adjustments`          | `{quantityDelta,reason,requestKey}`                  | Movement `{id,variantId,changeQty,stockAfter,referenceKey,createdAt}`                             |
| `GET /admin/variants/:id/stock-movements`             | None                                                 | Newest-first movement array                                                                       |
| `GET /admin/fulfilment`                               | Optional `status`, `fulfillment`                     | Project order summaries including stock/payment state                                             |
| `POST /admin/orders/:id/allocate`                     | `{requestKey}`                                       | Updated confirmed order; all lines allocated or no change                                         |
| `PATCH /admin/orders/:id/status` (existing, extended) | `{status}`                                           | Updated order for ordinary forward transitions; rejects cancellation here, directs to M3 endpoint |
| `POST /admin/orders/:id/complete`                     | `{requestKey,cashReceived}`                          | Delivered/collected order with actual date and payment                                            |

Delta must be nonzero integer with magnitude≤1,000,000 and leave stock within unsigned INT bounds. Procedure/trigger design is in M4 guide. Reference keys: `adjust:<UUID>`, `sale:<orderId>:<variantId>`, `allocate:<orderId>:<variantId>`, `cancel:<orderId>:<variantId>`. All stock changes have unique movements; do not emit a sale and allocation for the same order.

Allocation checks its operation key and current state, locks all variants ascending and only succeeds if every line can be supplied. Insufficient stock returns 409 `INSUFFICIENT_STOCK`; a prior matching key returns its current order. Store allocation/completion keys and actor in `order_operations(order_id,kind,request_key,actor_id,fingerprint)` with unique order/kind and global kind/key. Completion requires cashReceived true for pending COD and false for already-paid card; the boolean records the admin's confirmation, not a bank action. Do not mark cash paid at checkout.

## 9. Lifecycle and transaction ownership

| From                               | To               | Owner/side effects                                                |
| ---------------------------------- | ---------------- | ----------------------------------------------------------------- |
| New checkout, all stock sufficient | confirmed        | M3 deducts all stock; payment/delivery/items committed atomically |
| New checkout, any shortage         | backordered      | M3 no deduction; estimate includes +3                             |
| backordered                        | confirmed        | M4 explicit allocation; deduct all once                           |
| confirmed                          | processing       | M4; stock must already be allocated                               |
| processing delivery                | shipped          | M4; display label Dispatched                                      |
| processing pickup                  | ready_for_pickup | M4                                                                |
| shipped                            | delivered        | M4 completion; actual date/COD payment/stock consumed             |
| ready_for_pickup                   | collected        | M4 completion; actual date/COD payment/stock consumed             |
| backordered or confirmed           | cancelled        | M3 cancellation/refund/optional restock                           |
| delivered/collected/cancelled      | none             | Terminal                                                          |

Legacy pending stays readable; do not confirm it through the new workflow without real delivery/payment/checkout metadata. Update `shared/index.js` and tests together. `nextStatuses` expresses allowed lifecycle states, not permission to bypass the dedicated atomic cancellation/completion endpoints. UI dispatches to the correct endpoint for the chosen action.

Lock ordering: customer row first for cart/address/checkout; existing-order actions lock order first and never acquire customer afterward. Validate/lock destination rows before catalogue rows for checkout. Where catalogue metadata is needed, lock product parents in ascending ID order before their variants; then lock variants in ascending numeric order, followed by payment/history writes. Pure stock operations need variant locks only and must not acquire product locks afterward. Catalogue mutations must not acquire order/customer locks after variant locks. Each transaction's caller owns begin/commit/rollback/release. Helpers/procedures use the caller connection and never commit or close it. No HTTP calls/password hashing during locks. Deadlocks roll back the whole transaction and return a safe retryable conflict; retries reuse action keys.

Use a consistent read snapshot for multi-query report responses and order-detail assembly, so status/history/payment values are from one coherent database view. Check ownership before returning child records. Legacy presenters return nextStatuses empty and tracking fields null with an explicit legacy marker; do not show actions the new write services will reject.

Do not share a stock-writing HTTP endpoint between checkout and inventory. Share a function accepting the **same transaction connection**. Simulated payment decisions are local deterministic code, so there is no external settlement transaction to pretend can roll back.

## 10. Contracts: locations, tracking and five reports (M5)

| Method/path                                           | Input                                   | Success data                                                                                                                                              |
| ----------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /cities`, `GET /stores`                          | Optional cityId on stores               | Active supported Texas locations                                                                                                                          |
| `POST /admin/cities`, `PATCH /admin/cities/:id`       | `{name,isMainCity,isActive}`            | City                                                                                                                                                      |
| `POST /admin/stores`, `PATCH /admin/stores/:id`       | `{name,cityId,addressLine,isActive}`    | Store                                                                                                                                                     |
| `GET /orders` and `GET /orders/:id` (extend existing) | Ownership enforced                      | Existing fields plus payment/delivery/stock state and history                                                                                             |
| `GET /admin/reports/quarterly-sales`                  | Required year                           | `{year,currency,timezone,scope,quarters:[{quarter,orderCount,salesAmount}]}`                                                                              |
| `GET /admin/reports/top-products`                     | Required from/to, limit 1–50 default 10 | `{from,to,currency,timezone,scope,items:[{productId,name,quantity,salesAmount}]}`                                                                         |
| `GET /admin/reports/category-orders`                  | Required from/to                        | `{from,to,timezone,scope,items:[{categoryId,name,orderCount}]}`                                                                                           |
| `GET /admin/reports/upcoming-deliveries`              | Required from/to estimated dates        | `{from,to,timezone,scope,items:[{orderId,fulfillment,status,estimatedDate,actualDate,wasOutOfStock,isOverdue}]}`                                          |
| `GET /admin/reports/customer-orders`                  | Required from/to, optional customerId   | `{from,to,currency,timezone,scope,items:[{customerId,name,orderCount,orderedAmount,paidAmount,refundedAmount,orders:[{id,total,status,paymentStatus}]}]}` |

`scope` is `project-orders-usd`; timezone `UTC`. Quarterly year validated 2000–2100; dates real ISO calendar dates with inclusive from/to, max 366 days. Use timestamp >= start and < dayAfterEnd. Quarterly returns exactly four rows. Sales/top/category exclude cancelled orders and use created_at; customer report includes cancelled orders and identifies them. Customer orderedAmount sums noncancelled orders; paidAmount sums current paid payments, refundedAmount current refunded payments **for orders created in the range**, not receipt-date cash flow. Never mix currencies.

Top products sum line quantities and snapshot quantity×unitPrice, grouping all variants into product, tie-break quantity descending then product ID ascending. Categories count DISTINCT order_id using item-category snapshots; include zero categories. Upcoming includes nonterminal project orders whose stored estimate is in range; overdue is relative to today's UTC date, including backorders. Customer report returns one order/payment entry per order and correct aggregate counts without item-join multiplication. These five reports are required; do not substitute a generic dashboard summary.

## 11. Parallel milestones and contracts to hand off

Two supporting admin reads complete the location contract: `GET /admin/cities` and `GET /admin/stores` return all respective records, including inactive rows; authentication plus admin role is required. Public lists stay active-only. A city deactivation can invalidate a customer's preferred address for checkout; preserve the preference and require an explicit supported selection, not a hidden GET mutation.

1. **Common design review:** publish foundation, agree assumptions, migration numbers and response fixtures. No need to rebuild React/Express/Docker/auth from scratch.
2. **Early interfaces:** M4 upgrades migration runner; M5 supplies city/store fixtures and estimate function; M1 supplies product/variant/money helpers; M2 supplies cart/profile/address contracts; M3 supplies checkout/lifecycle fixtures and transaction outlines. Incomplete interfaces use explicit test fixtures, never live fake-success routes.
3. **Independent vertical slices:** each member gets one API+page working using seeded data. M5 reports can use reviewed fixture orders; M4 fulfils fixture project orders before checkout UI is ready.
4. **Integrate dependencies:** apply migrations in order; merge stock routine and cart/destination helpers; M3 integrates checkout and cancellations; M4 integrates backorder/completion and COD helper; M5 integrates tracking/report joins.
5. **Full verification:** every owner demonstrates their matrix and supplies schema/SQL explanation. Run fresh/existing database setup, all automated tests, build, updated smoke, formatting and cross-member scenarios. Rotate reviewer pairs M1→M2→M3→M4→M5→M1.

Before implementing shared services, agree these proposed names/interfaces: M1 `parseMoney`, `formatMoneyUnits`; M2 `readCart(connection,customerId)`; M4 `applyStockChange(connection,change)` wrapping procedure; M5 `getDestination(connection,mode,id,customerId)` and `deliveryDays(connection,isMain,wasOutOfStock)`; M3 `presentOrder(connection,id)` and `collectCod(connection,order,adminId,requestKey)`. A helper name is proposed, not an existing API. Consumers can test with matching doubles until its owner merges it.

## 12. Shared final demonstration

Use a fresh test stack and new fictional records:

1. Verify ≥40 active products, ≥10 categories, variants/defaults, cities/stores, PK/FK constraints and no plaintext passwords.
2. Guest browses; customer registers, chooses default address and puts two variants in cart.
3. In-stock main-city COD delivery checkout → confirmed, stock decreases, total exact, estimate +5, payment pending. Retry → same order.
4. Other-city in-stock card approval → +7, paid. Decline → failed attempt only, cart/stock unchanged.
5. Main-city and other-city shortage checkout → backordered, estimates +8/+10, no partial stock deduction. Restock through movement routine; allocate once; original estimate remains visible.
6. Delivery dispatch/completion and pickup readiness/collection use correct paths. COD becomes paid only with completion confirmation; actual date recorded.
7. Cancel allocated order → restore once; card refunded or COD void. Cancel backorder → no stock restoration. Repeat keys do not repeat side effects.
8. Two last-unit requests produce one confirmed order and one backorder, never negative stock. Force mid-checkout failure → no partial order or lost cart.
9. Customer cannot see/change another customer's cart/address/order/payment; customer cannot invoke admin reports/stock/routes.
10. Demonstrate all five reports with hand-calculated expected results, quarterly zero rows, category DISTINCT behavior and historical snapshots after edits.

Keep evidence in each member's PR and final report section. Check every requirement ID in the alignment guide. A successful build alone proves neither financial correctness nor transaction safety.
