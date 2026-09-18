# Understanding the BrightBuy foundation

This guide covers the shared preparation step. There is no cart, checkout, payment processing or inventory reservation yet.

## Read these files first

1. `compose.yaml`: starts MySQL, runs database setup, starts Express, then starts React.
2. `client/src/App.jsx`: lists every page URL and which routes require login/admin access.
3. `client/src/pages/OrdersPage.jsx`: a small example of requesting and displaying data.
4. `client/src/api.js`: sends requests and attaches the login token.
5. `server/src/app.js`: assembles the API middleware and feature routes.
6. `server/src/routes/orders.js`: checks access, reads orders and validates status updates.
7. `server/db/001-foundation.sql`: defines the tables and their relationships.

## Folder map

```text
brightbuy/
  compose.yaml                  Docker services, ports, startup order and volume
  Dockerfile                    Shared Node image and locked dependency install
  .env.example                  Names of local settings; real secrets go in .env
  client/
    src/
      main.jsx                  Mounts the React application
      App.jsx                   Public, customer and admin routes
      api.js                    HTTP requests, bearer token and readable errors
      auth/AuthProvider.jsx     Current user, login and logout
      components/
        MainLayout.jsx          Header, navigation, admin links and footer
        ProtectedRoute.jsx      Redirects visitors who cannot open a page
        DataState.jsx           Shared loading and error displays
      hooks/useData.js          Fetches data; cancels obsolete requests
      pages/                    One named component per page
      utils/format.js           Currency and status-label formatting
      style.css                 Shared styles, grouped into commented sections
    test/api.test.js            Client request and session-race regression tests
  server/
    db/001-foundation.sql       Initial schema; leave applied migrations unchanged
    src/
      index.js                  Starts/stops the HTTP server
      app.js                    Connects middleware and route modules
      db.js                     One shared MySQL connection pool
      errors.js                 API error class, validation and error responses
      password.js               Salted password hashing and verification
      middleware/auth.js        Verifies tokens and current database roles
      routes/
        auth.js                 Login and current-user endpoints
        catalogue.js            Products with their variants
        account.js              Owned addresses and admin customer list
        orders.js               Owned/admin orders and status updates
      setup.js                  Database setup command entry point
      database/
        setup.js                Lock, transaction and resource cleanup
        migrate.js              Applies pending numbered SQL migration files
        seed.js                 Adds the sample records once
    test/                       API, lifecycle and setup-failure tests
  shared/index.js              Currency and immutable order-transition rules
  scripts/smoke.mjs            Read-only checks against the running database/API
  docs/API.md                 Request/response contract and feature boundaries
```

## Example: opening My orders

1. React Router matches `/account/orders` in `App.jsx`.
2. `ProtectedRoute` checks whether the UI has a signed-in user. This is a convenience for navigation; the server performs the actual security checks.
3. `OrdersPage` calls `useData('/orders')`. `DataState` shows loading, an error with a retry button, or the resulting table.
4. `api.js` requests `/api/orders` with `Authorization: Bearer <token>`. Vite forwards the request to Express using the proxy in `client/vite.config.js`.
5. The server verifies the token, validates its subject/expiry, and loads the user's current role from MySQL.
6. The orders route queries with `WHERE customer_id = ?`, using the authenticated user's ID. The `?` placeholder keeps values separate from SQL syntax.
7. The server returns `{ "data": [...] }`. `api.js` unwraps `data`, and the page renders it.

The same ownership rule applies to addresses and order details. Changing a URL or hiding a button cannot grant access to another customer's records.

## Example: an administrator changes order status

The detail page sends `PATCH /api/admin/orders/:id/status` with a body such as `{ "status": "confirmed" }`.

The server checks login and administrator role, validates the input, reads the current order and calls `nextStatuses()` from `shared/index.js`. It then updates the row only if its old status still matches. This prevents a concurrent administrator's change from being silently overwritten. A conflict returns HTTP 409; the page reloads the current order before offering another action.

Delivery and pickup use different paths. `delivered`, `collected` and `cancelled` are final states. These rules are described in `API.md`. Changing status does not yet reserve stock or process a payment.

## Database setup and sample data

The `setup` service runs only after MySQL is healthy. A database lock prevents two setup processes from applying the same work simultaneously.

The migration runner reads numbered files such as `001-foundation.sql` and `002-add-example.sql` in order. `schema_migrations` records applied versions. Add a new file for a schema change; do not edit an already-applied file. The runner supports plain SQL statements separated by semicolons, not stored procedures or semicolons embedded inside SQL strings. MySQL schema changes commit implicitly, so migration statements must tolerate retries after partial failure.

The sample seed runs in a transaction and writes a `demo-v1` marker. Later runs skip it, preserving account passwords and edited orders. A failed seed rolls back. Pool and connection cleanup runs even if connection acquisition or lock release fails.

The `customers` table currently holds both customer and administrator accounts, distinguished by `role`. Products have variants; each variant has a SKU, price and stock count. Orders belong to customers and contain order items. Orders store address snapshots, and items store purchased names/prices so later catalogue/address edits do not rewrite order history.

Money is stored in MySQL `DECIMAL` columns and returned as strings. Formatting converts it to a number for display only; future checkout calculations need their own exact money-handling rules.

## Login and errors

Passwords are salted and hashed with scrypt. A successful login returns a signed token that expires after one hour. React stores it only in memory, so refreshing requires signing in again. Signing out clears the local session; server-side token revocation is future work.

An expired request clears the session only if it belongs to the current token. A late failure from a previous session cannot sign out a newly logged-in user. Page navigation cancels obsolete data requests.

Every API error has `code`, `message`, `details` and `requestId`. Server logs use the same request ID. Unexpected internal error details are not sent to the browser. Network failures or non-JSON proxy responses produce readable client messages.

## Making changes and checking them

Use one page file for each screen and the matching route module for its API work. Reuse the connection pool, authentication middleware, fetch helper and error format. Change `docs/API.md` before changing a shared input or output.

From the project root, with the Docker stack running:

```sh
docker compose exec api npm test
docker compose exec client npm run build
docker compose exec api npm run smoke
docker compose exec api npm run format:check
```

Tests use independent database/network doubles for failure cases; smoke checks use the real MySQL-backed API. Rebuild after changing dependencies or tests because those files are copied into the image. Source files are mounted for development reload.

With host Node.js installed, `npm ci` installs the locked tools, `npm run format` formats source files, and `npm run format:check` checks the style without changing files. `.editorconfig` and `.prettierrc.json` keep indentation, line endings and formatting consistent. Applied SQL migrations are excluded from formatting.
