# BrightBuy shared API contract — v1 foundation

This is the proposed team baseline implemented in this repository. Team approval is still a human decision. Change this document and the shared contract module together before changing a public field or status.

## Conventions

- Base path: `/api`. Requests and responses use JSON. React uses relative URLs; Vite proxies `/api` to Express.
- Success: `{ "data": <object or array> }`. Lists are arrays, including empty results; pagination is future work.
- Failure: `{ "error": { "code": "VALIDATION_ERROR", "message": "Human-readable message.", "details": [], "requestId": "UUID" } }`.
- Every response has `X-Request-Id`. Unexpected server failures return a generic message; internal details stay in server logs.
- IDs are positive integers. Money is a fixed two-decimal string (example `"2500.00"`), with `LKR` as the sample currency. Timestamps use UTC ISO 8601. Country values are ISO two-letter codes.
- Roles: `customer`, `admin`. Customer-scoped endpoints always derive ownership from the authenticated user, never from client-supplied customer IDs. Other customers' order IDs return 404.

## Authentication

`POST /auth/login` takes `{ "email": "nimal@example.test", "password": "BrightBuy123!" }`.

Returns `{ "data": { "accessToken": "<JWT>", "tokenType": "Bearer", "expiresIn": 3600, "user": { "id": 1, "name": "Nimal Perera", "email": "nimal@example.test", "role": "customer" } } }`.

Send `Authorization: Bearer <accessToken>` on protected calls. JWT uses HS256, `sub` is the string user ID, `role` is informational, `iss` is `brightbuy`, `aud` is `brightbuy-web`, and expiry is one hour. The API validates a positive-integer subject and an expiry claim before database access, then loads the current role from the database. Authenticated responses use `Cache-Control: no-store`. Passwords use salted scrypt hashes. Tokens are kept in React memory; reload or sign out clears the local session. No refresh token is implemented. Existing issued tokens expire naturally; sign out does not revoke them server-side. Authentication uses real credential verification, not a role header or hard-coded bypass.

## Implemented endpoints

| Method | Path                       | Access         | Success data                         |
| ------ | -------------------------- | -------------- | ------------------------------------ |
| GET    | `/health`                  | Public         | `{status:"ok",database:"connected"}` |
| POST   | `/auth/login`              | Public         | Token and user, shown above          |
| GET    | `/auth/me`                 | Signed in      | User object                          |
| GET    | `/products`                | Public         | Product[] with nested variants       |
| GET    | `/addresses`               | Signed in      | Current user's Address[]             |
| GET    | `/orders`                  | Signed in      | Current user's Order[]               |
| GET    | `/orders/:id`              | Owner or admin | Order plus `items`                   |
| GET    | `/admin/customers`         | Admin          | User[] with customer role only       |
| GET    | `/admin/orders`            | Admin          | All Order[]                          |
| PATCH  | `/admin/orders/:id/status` | Admin          | Updated Order                        |

All successful endpoints currently return 200. Status updates accept exactly `{ "status": "confirmed" }`. Sending extra fields is rejected. Status updates use a compare-and-set write; concurrent edits return `409 ORDER_CHANGED`.

## Resource shapes

```json
{
  "id": 1,
  "name": "Everyday T-shirt",
  "description": "Comfortable cotton essentials.",
  "variants": [
    {
      "id": 1,
      "productId": 1,
      "sku": "TEE-NAVY-M",
      "name": "Navy / Medium",
      "price": "2500.00",
      "stock": 25
    }
  ]
}
```

Address: `{id, customerId, recipient, line1, city, postalCode, country}`.

Order: `{id, customerId, status, fulfillment, addressSnapshot, currency, total, createdAt, nextStatuses}`. `fulfillment` is `delivery` or `pickup`. `addressSnapshot` is `{recipient,line1,city,postalCode,country}` for delivery and `null` for pickup. Snapshot values preserve historical order details. `nextStatuses` is an array of allowed next status strings, shared with the UI. It does not grant permission to change status.

Order detail additionally contains `items: [{id, variantId, productName, variantName, quantity, unitPrice}]`. Product/variant names and unit price are historical snapshots. Sample order totals equal the sum of line quantities multiplied by unit prices; shipping, tax, discounts and payment are not yet implemented.

## Order lifecycle

```text
pending → confirmed → processing → shipped → delivered          (delivery)
                                → ready_for_pickup → collected (pickup)
pending or confirmed → cancelled
```

`delivered`, `collected`, and `cancelled` are terminal. Skipping states, returning to a previous state, and selecting a path for the wrong fulfillment method return `409 INVALID_STATUS_TRANSITION`. Its details are `[{"allowed":["confirmed","cancelled"]}]` as appropriate. No cancellation after processing in this baseline. Only admins may change status. Payment lifecycle is separate future work.

## Error codes

| HTTP | Codes                                        |
| ---- | -------------------------------------------- |
| 400  | `VALIDATION_ERROR`, `INVALID_JSON`           |
| 401  | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`     |
| 403  | `FORBIDDEN`                                  |
| 404  | `NOT_FOUND`                                  |
| 409  | `INVALID_STATUS_TRANSITION`, `ORDER_CHANGED` |
| 413  | `PAYLOAD_TOO_LARGE`                          |
| 415  | `UNSUPPORTED_ENCODING`                       |
| 500  | `INTERNAL_ERROR`                             |
| 503  | `DATABASE_UNAVAILABLE` (health check)        |

## Boundaries for later feature work

Cart, registration, catalogue editing, address editing, order creation, payment and reporting endpoints are not implemented or promised by this foundation. Define their contracts here before parallel implementation. Future checkout must validate ownership, compute money on the server, and reserve/decrement stock transactionally; current seeded orders and status updates do not perform inventory or payment side effects. Sample stock is a standalone browsing fixture, not a stock ledger.

Express error handling follows the [Express 5 documentation](https://expressjs.com/en/guide/error-handling/); frontend build setup follows the [Vite documentation](https://vite.dev/guide/).
