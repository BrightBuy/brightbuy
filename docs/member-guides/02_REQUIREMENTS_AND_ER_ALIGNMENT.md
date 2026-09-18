# Requirements and ER-to-code alignment

Read this before writing feature SQL. Sources reviewed: **Project 2 - Retail Inventory and Online Order Management System.pdf**, page 1 (business requirements), page 2 (estimates, reports and database task); **ER Diagram Submission Group 10 Updated.pdf**, page 1 (entities, attributes and relationships). These filenames deliberately contain no personal local folder path. Keep the PDFs in the team's shared reference location; do not assume they exist at one member's home-directory path.

## 1. Complete requirement coverage

| ID  | Requirement from brief                                           | Implementation owner                           | Verification/demonstration                                                             |
| --- | ---------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| R01 | Central warehouse; variant determines stock and price            | M4 stock; M1 catalogue                         | One warehouse stock quantity per variant, never separate stock per pickup store        |
| R02 | Product belongs to one or more categories                        | M1                                             | Many-to-many category assignments; cannot publish without a category                   |
| R03 | Variants, default-only products and unique warehouse SKU         | M1                                             | Single/default and multi-variant products; unique SKUs and valid default               |
| R04 | Guest browsing and customer registration                         | M1 browsing; M2 registration                   | Visitor reads catalogue; registration hashes password                                  |
| R05 | Only registered customers check out                              | M3 using M2 auth                               | Anonymous/admin checkout rejected                                                      |
| R06 | Orders have variant/quantity items, delivery and payment details | M3                                             | Every new committed order has all dependent rows and immutable price/address snapshots |
| R07 | Confirmation decrements stock; checkout/inventory atomic         | M3 calls M4 routine                            | Rollback and simultaneous last-unit tests; no double deduction                         |
| R08 | Store Pickup and Standard Delivery                               | M3 checkout; M5 locations; M4 completion       | Both paths and mode-specific required fields                                           |
| R09 | Cash on Delivery and Card Payment                                | M3 payment; M4 COD completion                  | COD pending→paid on completion; approved/declined simulated card scenarios             |
| R10 | Main city 5 days, other city 7, +3 when out of stock at order    | M5 function; M3 snapshot                       | All four cases: 5, 7, 8, 10 days                                                       |
| R11 | Quarterly sales report for given year                            | M5                                             | Four quarters including zeros; known totals                                            |
| R12 | Top-selling products in a period                                 | M5                                             | Aggregate variants to products; stable ranking                                         |
| R13 | Category-wise total number of orders                             | M5                                             | Distinct order count; no duplicate counting within category                            |
| R14 | Delivery estimates for upcoming orders                           | M5                                             | Stored dates, mode, backorder and overdue indicators                                   |
| R15 | Customer-wise order summary and payment status                   | M5                                             | Customer totals and one payment summary per order                                      |
| R16 | PKs/FKs, indexes and reliable database behavior/ACID             | Each schema owner; M4 routine support          | Constraint, rollback, isolation, restart and query-plan evidence                       |
| R17 | Identify uses of procedures, functions and triggers              | M4 procedure/trigger; M5 function; all explain | Implemented demonstration routines and rationale; no claim triggers alone provide ACID |
| R18 | At least 40 products with variants and 10 categories             | M1 dataset; all add feature fixtures           | Counts plus no uncategorized/variant-less active product                               |
| R19 | UI interface                                                     | All five                                       | Customer/admin flows available in React, not SQL-only demonstrations                   |
| R20 | Explicit assumptions for unspecified behavior                    | All adopt team plan                            | Backorders, currency, fees, SKU interpretation, reporting and simulator documented     |

## 2. Entity mapping and responsibilities

Use the existing plural table names and camelCase API fields. Do not rename existing tables merely to match the diagram's display labels. Keep a data dictionary mapping physical columns to conceptual entities.

| ER entity               | Current foundation                             | Planned extension and owner                                                                                                |
| ----------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| CUSTOMER                | `customers` also stores authenticated admins   | M2 adds first/last name, phone, registration timestamp, preserves existing `name`/role/login API                           |
| ADMIN                   | Role `admin` in `customers`                    | M2 adds `admin_profiles` with ID FK to authenticated principal and staff role; no second password store                    |
| ADDRESS                 | `addresses` has free-text city and one line    | M2 adds city FK, optional lines 2/3 and default flag; keeps legacy unmapped addresses readable                             |
| CITY                    | Missing                                        | M5 adds Texas city records and main-city classification                                                                    |
| PRODUCT                 | `products` name/description                    | M1 adds brand, product SKU, currency, active/legacy classification                                                         |
| CATEGORY                | Missing                                        | M1 creates categories                                                                                                      |
| PRODUCT_CATEGORY        | Missing                                        | M1 creates composite-key product/category join                                                                             |
| VARIANT                 | `variants` ID/product/SKU/name/price/stock     | M1 adds active/default flags and a canonical attribute-combination key; M4 owns stock writes                               |
| ATTRIBUTE               | Missing                                        | M1 creates reusable attribute definitions                                                                                  |
| VARIANT_ATTRIBUTE_VALUE | Missing                                        | M1 creates composite-key variant/attribute values                                                                          |
| CART                    | Missing                                        | M2 creates one current cart per customer, with ID, version and creation time                                               |
| CART_ITEM               | Missing                                        | M2 creates composite `(cart_id,variant_id)` key and quantity                                                               |
| ORDER                   | `orders` with legacy lifecycle                 | M3 extends status with backordered, adds stock state, checkout metadata and status history; M4 owns fulfilment transitions |
| ORDER_ITEM              | `order_items` has a surrogate ID and snapshots | Preserve ID; M3 adds unique `(order_id,variant_id)` after duplicate audit, plus category snapshots                         |
| PAYMENT                 | Missing                                        | M3 creates one logical payment per order with method/status/amount/reference/timestamps; simulator attempts separate       |
| DELIVERY                | Missing                                        | M3 creates one row per order; M5 owns cities/stores/estimate function; M4 sets actual completion date                      |
| STOCK_MOVEMENT          | Missing                                        | M4 creates append-only movements tied to variant, optional order/admin and unique operation reference                      |

The diagram shows **17 entities**. `DELIVERY.store_id` refers to a **STORE entity that is not drawn**. M5 must add `stores(id,name,city_id,address_line,is_active)` and its FK/relationship to the revised design. Store is a pickup location, not another stock warehouse.

### Preserve authentication without copying a design error

The diagram's customer password-hash length is 50, while the existing salted scrypt encoding needs more space. Keep the existing `VARCHAR(200)` capacity or widen it to 255; never truncate hashes. Admin credentials remain in the existing authenticated-principal table; `admin_profiles` is a subtype/profile extension. This is a documented physical-design adaptation of the separate CUSTOMER/ADMIN concepts, not a literal duplicate of the diagram. Show it in the final revised ER/data dictionary and explain it to the lecturer.

Add an admin profile for each existing admin during migration; public registration cannot create one. Inventory's `admin_id` references `admin_profiles.id`, which matches the login principal ID. Customer-triggered checkout movements use null admin ID and reference their order. Do not mislabel a customer as an admin actor.

## 3. Specific corrections and design decisions

1. **SKU ambiguity:** the brief says products have a unique warehouse SKU; the ER places SKU on VARIANT. Support both: unique product SKU and unique sellable variant SKU, with clear labels. Do not put the same SKU on every variant. If the lecturer clarifies that only variant SKU is needed, revise this documented decision consistently before implementation.
2. **Defaults:** exactly one default active variant per active product; one preferred saved address selected during address mutations when usable addresses exist. An address preference does not guarantee its city remains supported: if a city is later deactivated, checkout requires another usable address. Use parent-row locking plus a database at-most-one constraint where possible, then enforce the selection rule in transactional services.
3. **Money:** specify `DECIMAL(12,2)` rather than unspecified DECIMAL. Preserve order-item unit-price/name snapshots already implemented. Otherwise later price edits would change apparent historical totals.
4. **Cardinality:** new orders require at least one item, exactly one delivery and one payment record. FKs alone do not guarantee child existence; checkout creates all of them atomically.
5. **Payment history:** ER lists Pending/Paid/Failed but omits refunds and cancellation. Use lowercase API values `pending`, `paid`, `refunded`, `void`; record failed simulator attempts separately when checkout is declined and no order is placed. Explain this extension in the revised ER.
6. **Lifecycle:** ER lists Confirmed/Dispatched/Delivered/Cancelled. Preserve foundation's `shipped` API value as the label “Dispatched,” keep pickup-specific states, and add `backordered`. Existing `pending` remains a legacy state; new stock-allocated orders are created confirmed.
7. **Out-of-stock policy:** +3 days implies an order-time shortage must be represented. The plan accepts a whole-order backorder, deducts no partial stock, then confirms/deducts atomically once all lines can be supplied. This is an assumption, not a policy explicitly specified by the brief.
8. **Destination:** new delivery addresses must choose an active supported Texas city with country US; pickup chooses an active Texas store. Store ID is nullable for delivery; address ID is nullable for pickup. Apply a mode-specific check constraint.
9. **History:** copied address/store/city/classification and estimate preserve the promise made at order time even if an address, city or store is later edited. Address FK can use `ON DELETE SET NULL` while its snapshot remains.
10. **Spelling:** document physical fields as `registered_at`, `estimated_date`, `actual_date`; diagram typos such as `registerd_at` and `act_devlivery_date` need not be reproduced in code.
11. **Delete policy:** deactivate referenced catalogue/location records; do not erase order, payment, movement or status history. Addresses may be deleted with preserved snapshots. No cascade from a customer/product to completed orders.
12. **Category reporting:** snapshot category IDs on order items. Count an order once per category; the same order may correctly appear in several category totals. Category totals therefore need not sum to the total order count.

## 4. Foundation data versus assignment data

The existing seed has 3 products, 5 variants and LK/LKR examples. Keep those rows as legacy demonstration data; do not relabel LKR amounts as USD or invent Texas addresses for existing customers/orders.

M1 adds `products.currency` with LKR for old rows and USD for new project products, marks old examples inactive/legacy, and creates at least 40 new active electronics/toy products across at least 10 categories. Public catalogue/cart/checkout use active USD project products. Admin views may still display old records, labelled legacy with their actual currency. M3 sets new orders to USD explicitly; the shared default may change only alongside display/test updates so legacy amounts continue using their own currency.

M2 preserves legacy addresses with null city FK; they cannot be used for a new Texas checkout until the user edits them to a valid supported city. M3 does not backfill imaginary payments/deliveries/reservations for old sample orders. Legacy rows remain readable; new transactional write flows reject them with `LEGACY_ORDER_REQUIRES_MIGRATION` until explicitly and truthfully reconciled.

M5's final-project reports select new project orders identified by checkout metadata and currency USD, and state that scope in the response/UI. Old samples are not revenue or stock-allocation evidence. Existing fixed-sample smoke assertions must be deliberately revised when catalogue scope changes; retain their auth/error/ownership regression coverage and add final-dataset checks. Do not merely delete failing tests.

## 5. Database features and ACID evidence

| Feature                                  | Owner                          | Proposed use                                                                       | Evidence                                                            |
| ---------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Stored procedure `sp_apply_stock_change` | M4                             | Lock variant, validate/replay movement, insert movement in caller transaction      | Checkout and restock call the same routine; no internal commit      |
| Trigger `trg_stock_movement_apply`       | M4                             | Sole feature-time stock update on movement insertion                               | Exactly one decrement per movement; invalid delta rolls back        |
| Function `fn_delivery_days`              | M5                             | Return 5/7 plus optional 3 using boolean inputs                                    | Four deterministic cases and null rejection at application boundary |
| Transactions/row locks/constraints       | M2–M4                          | Cart versions, checkout, allocation, cancellation and completion                   | Last-unit race, stale cart, forced failure and restart checks       |
| Indexes and EXPLAIN                      | Each owner; M5 report evidence | Support FKs, catalogue search/filter, order dates/status/customer and report joins | Saved query plans with measured fixture size and explanation        |

The brief explicitly asks you to identify useful procedures/functions/triggers; implementing these focused examples gives a concrete demonstration. They do not replace transactions. Explain atomicity (all writes or none), consistency (constraints/invariants), isolation (concurrent stock correctness), and durability (committed data survives container restart).

Current migration runner splits SQL at semicolons and cannot install multi-statement routines. M4 must extend it before these routines are attempted. Follow the team plan; never paste `DELIMITER` commands into `mysql2.query()`.

## 6. Final submission evidence owned by everyone

Each member supplies their revised entity/relationship section, keys and functional dependencies, normalization rationale, column constraints, indexed queries, screenshots, negative tests and short demo script. M5 assembles the requirement coverage table from these contributions; that does not make M5 the sole report writer.

Before submission, check every R01–R20 row against actual implementation and tests. The source PDFs specify no deadline or additional written-report page count, so obtain those details separately if your lecturer provides them.
