# Member 2 — customer accounts, addresses and persistent cart

## Your outcome and boundaries

Let a new customer register, sign in with the existing login, maintain their profile and default address, and prepare a saved cart for checkout. You own these pages/routes/tables/tests. The foundation's JWT, password helper, session handling and login already exist: extend them rather than create another authentication system.

Read [shared workflow](00_SHARED_START_HERE.md), [alignment guide](02_REQUIREMENTS_AND_ER_ALIGNMENT.md) and [team plan](01_TEAM_PLAN.md), especially sections 6–7. Your requirements are R04–R06 and the CUSTOMER/ADMIN/ADDRESS/CART portions of the ER. M1 supplies catalogue/price data, M5 supplies supported cities, and M3 consumes your cart/address contract.

## 1. Start from the working foundation

| Existing file                        | Purpose                                     |
| ------------------------------------ | ------------------------------------------- |
| `server/src/routes/auth.js`          | Login and current-user response             |
| `server/src/password.js`             | Salted password hashing/verification        |
| `server/src/middleware/auth.js`      | Authenticated identity loaded from database |
| `server/src/routes/account.js`       | Address and admin-customer read routes      |
| `client/src/auth/AuthProvider.jsx`   | In-memory login/session data                |
| `client/src/pages/LoginPage.jsx`     | Existing form style                         |
| `client/src/pages/AddressesPage.jsx` | Existing read-only address screen           |

Proposed new files: `server/db/005-accounts-cart.mjs`, `server/src/routes/cart.js`, `server/src/services/cart.js`, `server/src/services/addresses.js`, `client/src/pages/RegisterPage.jsx`, `client/src/pages/ProfilePage.jsx`, `client/src/pages/CartPage.jsx`, and `server/test/customers-cart.test.js`. Use branch `feature/customers-cart`.

First demonstrate that the existing two customer accounts and admin can sign in and can only see appropriate data. Capture this baseline before changing profile fields.

## 2. Milestone A — safe profile/admin schema extension

1. Add first_name, last_name, phone_number and registered_at to customers without dropping the existing name/email/password/role fields. Preserve authentication IDs.
2. For legacy names, preserve the existing display name; do not claim that guessing a split recovers the real first/last name. Allow null new components for legacy profiles until edited. New registration requires both components.
3. Keep password_hash at least its current 200 characters; the diagram's50 is insufficient. Do not change the hashing algorithm or expose hashes in responses.
4. Create `admin_profiles(id PK/FK to customers.id, staff_role)` and backfill only principals already carrying role admin. This adapts the diagram's ADMIN entity without duplicating credentials. M4's admin actor FK uses this ID.
5. Registration cannot set role or staff_role. A future staff-management workflow is outside this package; provision only reviewed fixture admins.
6. Add nullable city_id to addresses referencing M5 cities, optional line2/line3 and is_default. Legacy unmapped LK addresses remain readable but are ineligible for new Texas checkout.
7. Create carts with generated ID, unique customer_id FK, unsigned version default 0 and created_at; cart_items with composite cart/variant key and quantity check 1–99. Only cart→cart_items deletion may cascade; do not cascade customer deletion into orders.
8. Apply guarded migration steps after M4 runner support and M5 locations schema. Test fresh/existing migration and repeated setup, inspecting foreign keys and existing user logins.

Supply M4 the idempotent admin-profile reconciliation step described in team section 3. On a fresh database, the old seed inserts its admin after migrations, so a migration-only profile backfill would miss that admin. Keep new customer fields nullable for legacy seeding, and verify the seeded admin can record stock after reconciliation.

## 3. Milestone B — registration and profile editing

Implement `POST /auth/register` using the exact team body:

```json
{
  "firstName": "Demo",
  "lastName": "Customer",
  "email": "demo.customer@example.test",
  "password": "DemoCustomer123!",
  "phoneNumber": "555-0100"
}
```

1. Reject null/array bodies, unknown role/customerId fields, invalid email, empty names and wrong types. Apply documented lengths and combined display-name≤100 rule.
2. Normalize email exactly as current login does. Do not trim the password. Hash using existing `hashPassword()` before acquiring database locks.
3. Insert role customer on the server and derive `name` from first/last. Use parameterized SQL and catch unique email conflicts as 409 `EMAIL_EXISTS`.
4. Return 201 user data with existing id/name/email/role and additive firstName/lastName/phoneNumber/registeredAt. Never include hash.
5. Add `/register` page with confirmation-password field used only by the browser; API receives only the defined fields. After success navigate to `/login`, not an invented token flow.
6. Implement authenticated `PATCH /account/profile` for exactly firstName/lastName/phoneNumber and only `req.user.id`. Email/password changes are not required here.
7. Add `/account/profile`; after saving, refresh the current-user data in AuthProvider so navigation shows the edited name without replacing the token. Preserve logout and expired-session behavior.

Keep existing demo-account password policy working: the new registration minimum applies to new registrations, not retroactive rejection of existing valid logins.

## 4. Milestone C — address book and defaults

Implement create/full edit/delete/default-selection from team section 6. Example:

```json
{
  "recipient": "Demo Customer",
  "line1": "10 Example Street",
  "line2": "",
  "line3": "",
  "cityId": 1,
  "postalCode": "75001",
  "isDefault": true
}
```

City IDs are examples; use returned supported city IDs. Country is US on new records, and displayed city text comes from the city lookup. The label is fictional; do not claim this address is verified for delivery.

For every address mutation:

1. Authenticate. Validate field types/lengths/ZIP format and city existence/active flag. Do not accept customerId or a free-text country override.
2. Start a transaction on one connection and lock the customer's row first. Checkout uses the same lock.
3. On edit/delete/default, look up by both address ID and owner ID. Return 404 for another customer's address without disclosing it.
4. First usable address automatically becomes default. Making another one default clears the previous flag and sets the selected flag atomically. A unique nullable generated owner key can enforce at most one default.
5. When deleting the default, choose the lowest-ID remaining usable address deterministically as the new default; when none remain, there is no default. Document this assumption in the UI.
6. Reject attempts to leave usable addresses without a default. Inactive-city/legacy addresses are not eligible defaults for new checkout; preserve them visibly with an edit-required explanation.
7. Preserve completed order address snapshots. Coordinate M3's delivery FK `ON DELETE SET NULL`; deleting an address must not erase an order's destination history.
8. Return the mapped address or JSON deleted result only after commit, and always release the connection.

Extend `AddressesPage.jsx` with labelled forms, a city dropdown from `/cities`, default badge/action and delete confirmation. Provide an empty state linking to add an address. No backend permission should depend on hiding a button.

If M5 later deactivates a city, an existing default may become unavailable without an address write. Keep its preference record, show that it cannot be used for checkout, and ask the customer to choose/edit another supported address. Do not secretly change database defaults during GET requests. Test this cross-feature case with M5.

## 5. Milestone D — versioned cart backend

### Read behavior

`GET /cart` is customer-only. If no cart exists, return version 0, currency USD, empty items, total 0.00, hasShortage false without inserting a row. Otherwise read header/version and joined items in one consistent database snapshot. The exact response is in the team plan.

Join current product/variant metadata; do not store authoritative prices or totals in cart_items. Use M1's money helper. Preserve saved inactive lines as available false, with a clear explanation; never silently remove them. A shortage is quantity>stock and is **allowed**, because the brief's estimate rule needs the backorder path.

### Write behavior

1. Authenticate, require customer role and validate URL variant ID. PUT requires exactly integer quantity 1–99; DELETE means remove and has no body.
2. Start a transaction and lock the customer's row. Find/create the single cart header lazily. Unique customer_id protects accidental duplicate headers.
3. PUT requires a current active USD product/variant. Return 409 `VARIANT_UNAVAILABLE` for inactive/unsupported data and 404 for nonexistent variant. Do not reject merely for insufficient stock.
4. Replace the line quantity; PUT is not an increment. Enforce max 100 distinct lines with 409 `CART_LIMIT_EXCEEDED`.
5. Increment version only for a real content change. A repeated unchanged PUT or deleting an absent line is harmless and does not increment. Check unsigned version overflow (`CART_VERSION_EXHAUSTED`) instead of wrapping.
6. Recompute the resulting cart using exact units; reject a total outside per-order range as 409 `CART_TOTAL_EXCEEDED`. Roll back contents/version together.
7. Keep an empty cart header with its version. Resetting version to 0 after deletion could make an old checkout payload appear current.
8. Return a consistent cart representation and commit/release. Cart writes never change inventory or payments.

Example shared API helper use:

```js
const updatedCart = await api(`/cart/items/${variantId}`, {
  method: 'PUT',
  body: JSON.stringify({ quantity: 2 }),
});
// The helper unwraps data. Render updatedCart, not updatedCart.data.
```

Quantity may exceed stock; UI should show “This order may be backordered.” M3 independently validates current prices, activity, ownership and stock at checkout. A changed catalogue price does not increment the cart's content version, so the UI must state that the final price is checked at submission.

## 6. Milestone E — cart/customer UI

1. Add `/cart` under the existing guard with a customer-only message for admin accounts; server still rejects admins.
2. Coordinate with M1 to add variant selection and Add to cart. Because PUT replaces quantity, either calculate/show the desired total quantity or label the operation as setting quantity; do not accidentally reset an existing line to 1.
3. Show name/variant, quantity, current unit/line totals, stock, shortage/unavailable indicators, update/remove actions and total.
4. Disable repeated mutation buttons while pending. For a conflict, refresh current state and explain it. A failed request must not look saved.
5. Link Checkout to M3's page after integration; don't ship a broken route as a working feature.
6. Sign out/sign back in to verify persistence. Browser local storage is not the cart database. Page refresh clears the foundation token but not saved MySQL rows.
7. Check narrow screens, keyboard labels, empty/loading/error states, and that no sensitive data appears in console logs/screenshots.

## 7. Tests and handoff

| Scenario                                    | Expected                                                             |
| ------------------------------------------- | -------------------------------------------------------------------- |
| Registration then original login            | Customer role; hash stored; login works                              |
| Duplicate email/role injection/bad password | 409 or 400; no unexpected user/admin                                 |
| Profile update                              | Current user and visible display name updated; token behavior intact |
| Another customer's address                  | 404 on read-modifying actions; no mutation                           |
| Concurrent default selection/deletion       | Exactly one usable default if any usable address remains             |
| Address deleted after order                 | Order snapshot unchanged                                             |
| GET without cart                            | Version 0; no inserted header                                        |
| Same PUT twice                              | One line and one content-version increment                           |
| Shortage quantity                           | Accepted with hasShortage true; no stock change                      |
| Inactive/legacy USD-incompatible variant    | Not newly addable; old saved line visibly unavailable                |
| Two cart writes / checkout racing edit      | Serialized consistent version/content                                |
| Failure during cart/address transaction     | No partial contents/default/version change                           |
| Logout/login or another customer            | Cart persists and ownership stays separate                           |

Use actual MySQL for FK/default/version concurrency tests. Follow shared rebuild/test/build/smoke/format instructions. Give M3 `readCart(connection,customerId)` and the precise lock/version/default rules; checkout must clear/increment using its existing connection, not call a separate HTTP cart endpoint after order creation.

Give M4 admin-profile ID mapping, M5 the new customer display fields, and M1 the cart button contract. Record your schema, constraints, representative parameterized queries, index rationale and fictional demo data in your PR/report section.

## 8. Completion checklist

- [ ] New users can register and use the existing login; admin creation is impossible publicly.
- [ ] Profile/admin subtype extensions preserve old identities and valid password hashes.
- [ ] Addresses are owned, Texas-city validated and have coherent default behavior.
- [ ] Cart is persistent, versioned and supports shortages without reserving stock.
- [ ] Exact totals, unavailable lines, limits and transaction failures are handled.
- [ ] M3 has integrated the cart/address helpers on one transaction connection.
- [ ] Tests, API docs, mobile states and report/presentation evidence are reviewed.

Be ready to explain identity versus authorization, parent-row locks, at-most-one versus exactly-one default constraints, and why a cart does not promise stock or a final price.
