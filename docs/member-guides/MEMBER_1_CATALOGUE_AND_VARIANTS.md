# Member 1 — catalogue, categories, attributes and variants

## Your outcome and boundaries

Make the catalogue useful to guests and maintainable by an administrator, with at least **40 new project products and 10 categories**. Each product must have a category and active default variant before publication. You own catalogue React pages, routes, schema, exact money helpers, fixture data and tests. M4 owns stock changes; do not put editable stock in your variant form.

Read [shared beginner workflow](00_SHARED_START_HERE.md), [requirements/ER alignment](02_REQUIREMENTS_AND_ER_ALIGNMENT.md) and [team contracts](01_TEAM_PLAN.md). Your requirement IDs are R01–R04, R18–R20, plus database reliability for your tables. This guide describes work to build after the foundation.

## 1. Learn the existing code

| Existing file                       | Read it for                                       |
| ----------------------------------- | ------------------------------------------------- |
| `server/src/routes/catalogue.js`    | Public product/variant query and JSON mapping     |
| `server/db/001-foundation.sql`      | Existing product/variant columns and foreign keys |
| `client/src/pages/ProductsPage.jsx` | Current display and loading/error states          |
| `client/src/utils/format.js`        | Display-only money formatter                      |
| `server/src/app.js`                 | Where a new route factory is registered           |
| `server/src/errors.js`              | Common validation errors                          |

Proposed files to create: `server/db/004-catalogue.mjs`, `server/src/routes/catalogue-admin.js`, `server/src/services/catalogue.js`, `server/src/utils/money.js`, `client/src/pages/ProductDetailPage.jsx`, `client/src/pages/AdminCataloguePage.jsx`, `server/src/database/seedProject.js`, and `server/test/catalogue.test.js`. These are not already implemented. Keep reusable form sections in small components instead of one very large page.

Use branch `feature/catalogue-variants`. First start the app, sign in as admin and inspect the current catalogue response in Developer Tools. Save a small response fixture for M2/M3 before changing its shape.

## 2. Milestone A — data dictionary and migration

1. Copy the relevant ER entities into your design notes: PRODUCT, CATEGORY, PRODUCT_CATEGORY, VARIANT, ATTRIBUTE and VARIANT_ATTRIBUTE_VALUE. List their primary keys and relationships.
2. Wait for M4's `.mjs` migration support or prepare your module for review while that support is being written. Never edit `001-foundation.sql` to add these features.
3. Extend products with unique product SKU, brand, currency, is_active and legacy marker. Existing rows keep LKR, are labelled legacy and start inactive. Generate distinct legacy product SKUs deterministically from existing IDs; do not overwrite existing variant SKUs.
4. Extend variants with is_active, is_default and a canonical attribute-combination key. Existing stock stays unchanged. Do not create fictional historical movements.
5. Create categories (ID, unique normalized name, description); product_categories composite product/category key; attributes (ID, unique normalized name); variant_attribute_values composite variant/attribute key with value max 100.
6. Add FK constraints and indexes for joins. Use the same `INT UNSIGNED` type as existing IDs. Preserve historical references; no cascading deletion into orders.
7. Enforce at most one default per product with a nullable generated key based on is_default plus a unique index, or another reviewed equivalent. Application transactions must additionally enforce that an active product has exactly one active default. Do not simply create UNIQUE(product_id,is_default), which would also allow only one nondefault variant.
8. Use a unique `(product_id,combination_key)` to prevent duplicate normalized attribute combinations. Specify a collision-resistant canonical encoding/hash and compare stored attribute values if needed. Empty attributes are a valid combination for one default-only variant, not unlimited duplicate variants.
9. Guard each ALTER/index operation by inspecting the schema, and verify unexpected existing definitions rather than ignoring them. Test migration on a fresh and an existing foundation database.

Coordinate the post-demo-seed reconciliation hook in team section 3. Legacy SKU/combination fields must not break the old seed on a fresh database; keep nullable/default legacy values until reconciliation, and explicitly populate required project values on new API writes. Admin product list/detail must include inactive drafts; public GET endpoints do not.

The brief's product SKU and diagram's variant SKU are both represented. Explain the two labels in your data dictionary. Draft products may temporarily have no variants while an admin fills forms; **active** products may not.

## 3. Milestone B — exact money helper

Create one shared backend helper, agreed with M2/M3/M5:

```js
// Proposed interfaces. Implement and test these before consumers depend on them.
parseMoney('40.00'); // returns 4000n, after syntax/range checks
formatMoneyUnits(4000n); // returns '40.00'
```

1. Accept only a string with digits, decimal point and exactly two decimal digits. Reject negative prices, exponent notation, commas, Infinity, fractional-cent values and silent Number coercion.
2. Parse into BigInt minor units. Enforce the per-price/per-order maximum at the caller boundary. Use a formatting function capable of larger report aggregate amounts; it must not automatically impose one-order limits.
3. Perform quantity multiplication and addition with integer units. Convert BigInt to decimal strings before JSON serialization.
4. Test zero, `0.01`, maximum amount, overflow, wrong types and `0.10 + 0.20 = 0.30`.
5. Keep `formatMoney()` in React for display, passing each record's currency. Do not silently show old LKR data as USD when the new default changes.

## 4. Milestone C — transactional admin catalogue API

Implement the exact endpoints/body fields in team-plan section 5. All writes require authenticated admin. Start with create category, create product draft, add variant, choose default, then activate.

Example draft-product request:

```json
{
  "sku": "DEMO-SPEAKER",
  "name": "Demo Speaker",
  "description": "Compact classroom sample speaker.",
  "brand": "DemoTech",
  "categoryIds": [1, 2]
}
```

Example variant request:

```json
{
  "sku": "DEMO-SPEAKER-BLUE",
  "name": "Blue / 32 GB",
  "price": "40.00",
  "attributeValues": [
    { "attributeId": 1, "value": "Blue" },
    { "attributeId": 2, "value": "32 GB" }
  ]
}
```

IDs above are illustrative; use actual created IDs. Every new variant starts stock 0. An initial stock balance is entered later through M4's adjustment feature/routine.

For each route:

1. Validate exact body keys/types/lengths before opening a transaction. Validate referenced IDs and reject duplicate category/attribute IDs.
2. Use parameterized SQL. Normalize SKU and names consistently with uniqueness rules, then rely on database unique constraints for races.
3. For related product/default/variant changes, lock the product parent first, then affected variants in ascending order. Never acquire customer/order locks afterward.
4. Replace category assignments atomically; reject removing the last category of an active product. Do not delete order-item category snapshots.
5. When selecting a default, verify it belongs to that product and is active, clear the prior default then set the new one inside the same transaction. Roll back on failure.
6. On variant metadata updates, update only metadata columns. An admin price edit must not overwrite a concurrently updated stock balance.
7. Reject stock, currency, role and unknown fields in metadata input. Currency USD is chosen by server for new project products.
8. Return mapped Product/Variant JSON through `{data:...}`. Map duplicate SKUs/combinations/names to documented 409 conflicts and missing records to 404; don't leak SQL.

Suggested codes to document: `SKU_EXISTS`, `VARIANT_COMBINATION_EXISTS`, `DEFAULT_VARIANT_REQUIRED`, `CATEGORY_REQUIRED`, `RESOURCE_IN_USE`. An inactive variant already in a saved cart must remain identifiable so M2 can show that it is unavailable; do not erase it.

## 5. Milestone D — customer browsing and administrator forms

### Customer catalogue

1. Retain the public route `/`; connect it to the paginated `GET /catalogue` contract. Keep `GET /products` array compatibility for existing consumers until they are updated deliberately.
2. Add query text, category filter, and next/previous controls. Validate positive page/pageSize server-side, use stable ID ordering, and parameterize filter values. Decide a documented name/brand substring search; do not accept arbitrary SQL sort expressions.
3. Add `/products/:id` with product description/brand/categories and variant selection. Default to the active default variant. Display its own price, SKU, attributes and current central stock.
4. Show zero stock as “Available to backorder” under the working policy; do not block the cart solely because of shortage. Inactive products/variants cannot be newly added.
5. Coordinate the Add to cart button with M2. Send variantId and desired quantity through their operation; it replaces quantity, so don't unexpectedly reset an existing line to 1.
6. Visitors may browse but are prompted to sign in for saved cart/checkout. Handle invalid ID, empty search, loading and network errors.

### Administrator catalogue

1. Add `/admin/products` using the existing guard and layout; do not expose admin editing controls on the public page.
2. Build category/attribute management, product draft editing and nested variant editing in small steps. Add labels, clear validation and cancel/save controls.
3. Explain draft versus active and provide a readiness checklist before activation: categories, variant, default and valid metadata. Zero stock is allowed because backordering exists.
4. Stock is displayed read-only with a link to M4's inventory page after it exists. Do not duplicate stock-adjustment logic here.
5. Preserve inputs on validation errors, disable submit while pending and refresh committed data after success. Reuse `api()`, `useData()` and `DataState`.

## 6. Milestone E — required 40-product dataset

1. Prepare at least 10 categories such as phones, tablets, laptops, headphones, speakers, cameras, gaming accessories, smart-home devices, educational toys and remote-control toys. These are fictional catalogue classifications, not current-market recommendations.
2. Create at least 40 **new active** electronic/toy products, excluding the old three legacy products. Give every one a unique product SKU, brand, description, category and default variant.
3. Include both default-only and multi-variant products, products in more than one category, and valid colour/capacity attributes. All variants need unique SKUs and explicit USD prices.
4. Include in-stock, low-stock and zero-stock cases. Insert new variants with zero stock and call M4's routine for seeded initial balances with deterministic references such as `seed-project:<variantSku>`.
5. Make the seed repeatable without overwriting user-edited prices/orders or duplicating records. Detect incompatible nonempty fixture state and stop rather than resetting it. Use a separate project seed marker, not the foundation marker.
6. Coordinate M5 city/store fixtures, M2 customer/address/cart fixtures and M3 order/payment fixtures under the final seed command. Each owner supplies their data; you coordinate catalogue counts and the entry point.
7. Add an explicit project-seed npm script and document that it requires the new migrations. The script is future work; don't tell teammates it exists before merging it.

Verify counts with SQL on the test database, including distinct active project product/category IDs and a query finding any active product without a category/default. Count products, not variants. At least 40 variants alone does not satisfy the requirement.

## 7. Tests and demonstration

| Case                                                   | Expected                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| Guest catalogue/detail/filter/page                     | Only active project data; consistent pagination/variant selection |
| Anonymous/customer admin mutation                      | 401/403; no writes                                                |
| Duplicate product/variant SKU or attribute combination | 409; original data preserved                                      |
| Activate product missing category/default              | 409; remains draft                                                |
| Two concurrent default changes                         | Exactly one committed default                                     |
| Variant metadata update races stock adjustment         | Metadata and stock both retained                                  |
| Edit product price/name after checkout                 | Old order snapshots unchanged                                     |
| Deactivate a saved-cart variant                        | Cart displays unavailable; checkout rejects until removed         |
| Seed twice                                             | No duplicates or overwrites; required counts still pass           |
| Invalid money / total overflow at consumer             | Validation/conflict, never rounded silently                       |

Use Node's existing test setup for route tests and real MySQL for uniqueness/concurrency. Rebuild after adding tests/scripts, then run the shared checks. Update the smoke fixture expectations deliberately for the expanded active catalogue and retain all security/error checks.

## 8. Handoff, comments and completion

Give M2/M3 a real variant response and money-helper tests; tell M4 which metadata routes lock product/variant rows; give M5 product/category mappings and stable fixture keys. Comment the reasons for default locks, canonical combinations and legacy currency handling, not every assignment.

- [ ] All catalogue entities and constraints are implemented and reflected in the revised ER/data dictionary.
- [ ] Guest and admin pages work with errors/empty/mobile states.
- [ ] Default/category/SKU/attribute rules hold under concurrent changes.
- [ ] M4 alone changes stock; old snapshots and legacy currencies are preserved.
- [ ] At least 40 active project products and 10 categories are reproducibly seeded.
- [ ] Tests, API documentation, query/index explanation and demo evidence are reviewed.

Explain in your presentation why products and variants differ, why categories are many-to-many, why variants use exact prices, and why default selection needs a transaction plus constraints.
