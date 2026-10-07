# BrightBuy Catalogue Subsystem Specification

This document details the architecture, relational data model, transaction contracts, and API endpoints for the BrightBuy product catalogue subsystem.

---

## 1. Domain Model & Relational Schema

The catalogue subsystem manages products, hierarchical categories, configurable variant attributes, and orderable SKUs.

### 1.1 Entities & Relational Design

1. **`products`**:
   - Represents the catalog-level product entity.
   - Key attributes: `id` (PK), `sku` (UNIQUE), `name`, `description`, `brand`, `currency`, `is_active`, `is_legacy`.
   - Inactive products (`is_active = 0`) act as drafts and are excluded from all public-facing endpoints.

2. **`categories`**:
   - Taxonomy groupings for search, faceted filtering, and navigation.
   - Key attributes: `id` (PK), `name` (UNIQUE), `description`.

3. **`product_categories`**:
   - Many-to-many junction table between products and categories.
   - Primary key: `(product_id, category_id)`.
   - Constraints: Foreign keys to `products` and `categories` with `ON DELETE RESTRICT` to preserve historical integrity.

4. **`attributes`**:
   - Dimension definitions for variant specifications (e.g. `Color`, `Storage`, `RAM`).
   - Key attributes: `id` (PK), `name` (UNIQUE).

5. **`variants`**:
   - Orderable stock-keeping units with unique combinations of attributes.
   - Key attributes: `id` (PK), `product_id` (FK), `sku` (UNIQUE), `name`, `price`, `stock`, `is_active`, `is_default`.
   - Initial variant creation always defaults `stock = 0`. Stock movements and reallocations are managed exclusively by the inventory subsystem.

6. **`variant_attribute_values`**:
   - Attribute assignments for individual variants.
   - Primary key: `(variant_id, attribute_id)`.
   - Foreign keys: Cascade deletion on `variants` (`ON DELETE CASCADE`), restrict on `attributes` (`ON DELETE RESTRICT`).

---

## 2. Concurrency & Integrity Constraints

### 2.1 Hierarchical Locking Order
To prevent deadlocks under high-concurrency administrative updates, transactions acquire database locks in a strict hierarchy:
1. Lock parent row in `products` first (`FOR UPDATE`).
2. Lock child rows in `variants` ordered strictly by ascending primary key (`ORDER BY id ASC FOR UPDATE`).
3. Never acquire locks on customer, cart, or order tables inside catalogue mutations.

### 2.2 Canonical Combination Keys
To prevent duplicate variant attribute combinations (e.g. two variants representing "Midnight Black / 128 GB" for the same product):
- Attribute key-value pairs are trimmed, converted to lowercase, sorted by ascending `attributeId`, and serialized as `attr:<id>=<normalized_value>|...`.
- Variants without attributes receive combination key `""` (allowing at most one default variant without options).
- Uniqueness is enforced at the database level:
  ```sql
  CONSTRAINT uq_variant_product_combination UNIQUE (product_id, combination_key)
  ```

### 2.3 At-Most-One Default Variant
A product must have at most one default variant. This is enforced via MySQL's handling of `NULL` in unique indexes using a virtual generated column:
```sql
ADD COLUMN default_key INT GENERATED ALWAYS AS (
  CASE WHEN is_default = 1 THEN 1 ELSE NULL END
) VIRTUAL,
ADD CONSTRAINT uq_variant_product_default UNIQUE (product_id, default_key)
```
Non-default variants evaluate to `NULL` (which do not conflict with each other in MySQL unique indexes), while multiple default variants evaluate to `1` and trigger a unique constraint collision.

---

## 3. Financial Exactness

All price arithmetic and database inputs use exact BigInt minor units:
- Parsing and validation via `parseMoney()` rejects floating-point numbers, exponent notation, negative values, and fractional cents.
- Conversions to minor units (e.g. `$49.99` -> `4999n`) ensure mathematical operations (multiplication by quantity, additions) prevent IEEE 754 precision issues.
- Formatting via `formatMoneyUnits()` converts minor units back to two-decimal strings for JSON responses.

---

## 4. API Endpoints

### Public Endpoints
- `GET /api/catalogue`: Paginated browse endpoint accepting `q` (substring search), `categoryId`, `page`, and `pageSize` (max 50).
- `GET /api/products/:id`: Full product detail including active variants, attributes, and category badges. Returns 404 for draft or missing products.
- `GET /api/categories`: Alphabetically sorted list of all taxonomy categories.

### Admin Endpoints (Requires Admin Token)
- `GET /api/admin/products`: Retrieves all products, including drafts and legacy items.
- `POST /api/admin/products`: Creates draft product (`is_active = 0`).
- `PATCH /api/admin/products/:id`: Updates metadata and replaces category associations.
- `PATCH /api/admin/products/:id/active`: Toggles product publication with readiness verification (requires category, active variant, and active default).
- `PUT /api/admin/products/:id/default-variant`: Atomically reassigns default variant under row locks.
- `POST /api/admin/products/:id/variants`: Adds variant with canonical combination key verification.
- `PATCH /api/admin/variants/:id`: Updates variant name or price.
- `PATCH /api/admin/variants/:id/active`: Toggles variant availability with safeguards preventing deactivation of default variants on active products.
