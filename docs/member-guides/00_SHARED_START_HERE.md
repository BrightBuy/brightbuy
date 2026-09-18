# BrightBuy: shared beginner guide

Read this guide first, then follow your individual member guide. Commands below run from the **repository root**: the folder containing `compose.yaml` and `package.json`. File paths are relative to that folder unless a link states otherwise.

This shared workflow now accompanies the [five-member plan](01_TEAM_PLAN.md) and [PDF/ER alignment](02_REQUIREMENTS_AND_ER_ALIGNMENT.md). Keep the current foundation behavior distinct from the future assignment features: the new plan supports backorders, COD/simulated card payments, Texas locations and five specified reports. It supersedes the earlier four-member feature assumptions.

## 1. Understand the starting point

BrightBuy already has a working shared foundation:

- React displays the catalogue, customer orders/addresses, and administrator pages.
- Express provides the API, login, authorization and order-status updates.
- MySQL stores sample customers, products, variants, addresses and orders.
- Docker Compose runs the application without requiring Node.js or MySQL on your computer.
- Shared helpers define database access, error responses and allowed order-status transitions.

Read the [code walkthrough](../CODE_WALKTHROUGH.md), [current API contract](../API.md), and [Step 1 checklist](../STEP_ONE_CHECKLIST.md). The walkthrough explains the files. The contract describes what requests and responses mean. The checklist records what is already implemented and verified.

Cart, checkout/order creation, catalogue/address editing, payment, inventory reservation and reports are **not implemented yet**. A guide describing one of these features is a plan for work, not evidence that the feature already exists. Follow the team allocation to decide which person owns each feature.

## 2. Before the team starts

The coordinator must ensure the working foundation has been committed and pushed to the shared repository. Files that exist only on one computer will not appear when other members clone the project. In particular, confirm the remote repository contains `client/`, `server/`, `shared/`, the lockfile, Docker configuration and these guides.

Before writing feature code, record:

1. Each member's feature, deliverables and branch name.
2. Which member coordinates edits to shared files such as `App.jsx`, `app.js`, `shared/index.js` and `docs/API.md`.
3. Who owns each new database migration number. Two members must not independently choose the same number.
4. The request/response formats needed between features.
5. The next small integration milestone and how it will be demonstrated.

Members may develop against fixtures while another feature is unfinished, but those fixtures must match the agreed contract. Each member owns the frontend, backend or database work assigned to them; do not silently assume another person will complete missing layers.

## 3. Install the tools

Install Git, a code editor, and Docker Desktop. Configure Docker Desktop to run Linux containers. Windows users may need to complete Docker Desktop's WSL setup and restart their computer. Follow the installer's instructions.

Open a terminal and check:

```sh
git --version
docker version
docker compose version
```

`docker version` should show both client and server information. A missing server connection usually means Docker Desktop is not running. Node.js on the host is optional; the containers already include it. If you choose a host Node.js workflow, use a version supported by the root `package.json`.

## 4. Get your own working copy

If you do not already have a copy, ask the coordinator for the repository URL. Replace `REPOSITORY_URL` below with that URL before running the command:

```sh
git clone REPOSITORY_URL brightbuy
cd brightbuy
```

If you already have a working copy, open its terminal instead of cloning over it. Check your situation:

```sh
git status
git branch --show-current
```

Do not discard existing changes to make these commands look clean. Ask their author about changes you do not recognize. Each person should normally use their own clone and local MySQL data.

## 5. Configure and start the application

1. In your editor, copy `.env.example` to a new file called `.env` **only if `.env` does not exist**.
2. Choose local database passwords and a random `JWT_SECRET` of at least 32 characters. Replace the example placeholders. A password manager can generate the secret.
3. Keep `SEED_DEMO=true` for the documented sample accounts.
4. Do not commit `.env` or send your real passwords in chat or screenshots.
5. Start the application:

```sh
docker compose up --build -d --wait
docker compose ps -a
```

Expected outcome:

| Service  | Expected state     | Purpose                                      |
| -------- | ------------------ | -------------------------------------------- |
| `db`     | Healthy            | MySQL database                               |
| `setup`  | Exited with code 0 | Applies migrations and adds sample data once |
| `api`    | Healthy            | Express API                                  |
| `client` | Healthy            | React development server                     |

Open [the shop](http://localhost:5173) and [the API health check](http://localhost:3000/api/health). These are the default ports; if you change host ports in `.env`, adjust the browser addresses accordingly.

Sign in using one of the fictional demo accounts. All use `BrightBuy123!`:

| Account              | Role                                       |
| -------------------- | ------------------------------------------ |
| `nimal@example.test` | Customer with two addresses and two orders |
| `asha@example.test`  | Another customer with a pickup order       |
| `admin@example.test` | Administrator                              |

Refreshing the page clears the in-memory login token. Sign in again; this is intentional in the foundation.

Run the baseline checks before changing anything:

```sh
docker compose exec api npm test
docker compose exec client npm run build
docker compose exec api npm run smoke
```

Stop and investigate baseline failures before mixing them with feature work. The smoke command expects the documented sample dataset. It does not modify records, but deleting sample records or changing their passwords may make its expectations fail.

## 6. Create your feature branch

A branch is a separate line of changes in Git. `main` is the team's integrated version; your feature branch holds your unfinished work.

With a clean working copy, start from the current shared version:

```sh
git switch main
git pull --ff-only origin main
git switch -c feature/your-task
```

Replace `your-task` with the unique branch name assigned to you. Do not create the same literal branch name for every member. If your branch already exists locally, use `git switch` with its actual name instead of `git switch -c`.

If Git says local changes would be overwritten or the update cannot fast-forward, stop and inspect `git status`. Do not use reset, force push or blanket file deletion as a shortcut.

## 7. Build one small working part at a time

Use this sequence for each feature:

1. Describe one user action and the expected result.
2. Check whether a suitable API endpoint or table already exists.
3. Agree the new input/output fields with any member who will use them.
4. Add a database migration if required.
5. Implement server validation, access checks and database work.
6. Test the endpoint independently of the page.
7. Connect a simple React page to it.
8. Add loading, empty, success and error states.
9. Check invalid input and unauthorized access.
10. Demonstrate the working part before starting another large part.

Do not begin with all screens and leave the database/API integration until the end. A small complete flow is easier to debug and share.

## 8. Reuse the existing code

| Need                                     | Start here                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| Add a page URL                           | `client/src/App.jsx`                                                    |
| Build a customer or admin page           | `client/src/pages/` and `client/src/components/MainLayout.jsx`          |
| Read data with loading/error support     | `client/src/hooks/useData.js` and `client/src/components/DataState.jsx` |
| Make an API request                      | `client/src/api.js`                                                     |
| Read the signed-in user                  | `client/src/auth/AuthProvider.jsx`                                      |
| Add a group of Express routes            | `server/src/routes/`                                                    |
| Register the route group                 | `server/src/app.js`                                                     |
| Verify login or require an administrator | `server/src/middleware/auth.js`                                         |
| Return a standard error                  | `server/src/errors.js`                                                  |
| Query MySQL                              | The `db` pool passed into the route factory                             |
| Change the schema                        | A new numbered file in `server/db/`                                     |
| Understand sample data                   | `server/src/database/seed.js`                                           |
| Understand order status                  | `shared/index.js`                                                       |

### Backend rules

- Keep routes for a feature in its own module. Follow existing route-factory functions rather than opening another database connection pool.
- Use parameterized SQL: write `WHERE id = ?` and pass `[id]` separately. Do not concatenate request values into SQL.
- Use `req.user.id` to identify the current customer. Do not trust a client-supplied `customerId` as proof of ownership.
- Authentication verifies who the user is. Authorization decides whether that user may perform the action. Both matter.
- A hidden button does not secure an API. Apply server-side checks to every protected read or write.
- Return success as `{ data: ... }`. Throw `ApiError` for expected validation, permission or business-rule failures.
- Express 5 forwards rejected promises from async route handlers to the common error handler. Do not send a response and then try to send a second response.
- Never include password hashes, credentials or SQL errors in response data.
- Add comments where the reason is not obvious: transaction ownership, lock order, retry handling and compatibility with old sample data. Use descriptive function/variable names instead of commenting every assignment. Keep validation, database work and response mapping in small functions when a route becomes difficult to follow.

### Frontend rules

- Use the shared `api()` helper; pass `/orders`, not `/api/orders`, because the helper supplies the prefix.
- The helper already unwraps `data`: `await api('/orders')` returns the array, not `{ data: [...] }`.
- With a JSON request body, use `JSON.stringify(...)`. The helper adds the content type and current bearer token.
- Use controlled form fields or `FormData` consistently. Validate for usability in the browser, then validate again on the server.
- Disable a submit button while its request is in progress. Show a useful error and permit retry.
- Keep money strings unchanged when sending API data. `formatMoney()` is for display, not financial calculations.
- Customer pages and admin pages should use the existing layouts and route guards.

## 9. Add database changes safely

The initial migration is `server/db/001-foundation.sql`. Do not edit it after it has been applied. The migration runner records applied filenames in `schema_migrations`.

The steps below describe the **current SQL-only runner**. Member 4 will add reviewed `.mjs` migrations for complete routine definitions and guarded ALTERs; the team plan reserves those files. They will not run until that support is merged. Do not split stored procedures/functions/triggers at their internal semicolons or send `DELIMITER` through mysql2.

1. Ask the migration coordinator for the next unused three-digit number.
2. Create a file such as `002-add-example.sql`. This is a naming example, not a reserved number.
3. Use lowercase letters and hyphens in the name. The current runner recognizes `NNN-description.sql`.
4. Write plain SQL statements separated by semicolons. The current runner does not support stored procedures or semicolons embedded in SQL strings/comments.
5. Design for retries: MySQL schema statements commit implicitly, so a partly failed migration may have changed the schema even though its marker was not recorded. Ask for review if a migration cannot safely run again.
6. Keep existing customer/order records valid. Plan defaults, backfills and foreign keys before adding required columns.
7. Run setup and inspect its output:

```sh
docker compose run --rm setup
docker compose logs api
```

8. Test on a fresh disposable database and on an existing database before merging a significant schema change. Coordinate that test rather than deleting the team's working database.

The original demo seed runs once. Editing its JavaScript does not update a database that already has the `demo-v1` marker. Add a reviewed, repeatable feature-data setup approach if your feature needs new fixtures; never remove the marker just to force the old seed to run again.

To inspect local MySQL interactively:

```sh
docker compose exec db sh
```

Then, **inside the container shell**, run:

```sh
mysql --user="$MYSQL_USER" --password "$MYSQL_DATABASE"
```

Enter your local application database password when prompted. Use `SHOW TABLES;` to inspect the schema. Type `exit` to leave MySQL and `exit` again to leave the container. Do not paste real passwords into commands or screenshots.

## 10. Use transactions for work that must succeed together

A transaction groups related database writes. Either all changes commit, or they roll back. Checkout, stock changes, cancellation/restocking and payment-record updates will require coordinated rules across members.

When a transaction is necessary:

1. Obtain one connection with `await db.getConnection()`.
2. Start a transaction on that connection.
3. Perform **all** relevant queries on that same connection, not on the pool.
4. Lock or conditionally update rows when concurrent requests could change the same stock/order.
5. Commit only after all required operations succeed.
6. Roll back on failure and release the connection in `finally`.

Do not call `db.end()` in a request handler; that would close the shared pool for other requests. Read `server/src/database/setup.js` for cleanup ideas, but remember that its command-line setup process closes its own pool when it exits.

Agree transaction ownership across features. Two members must not independently deduct stock, create separate payment records for the same action, or restock the same cancellation twice.

## 11. Know when Docker needs a rebuild

| Change                                                                                                       | What to do                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Existing/new files in `client/src/`, `server/src/` or `shared/`                                              | Development reload normally handles them; inspect logs if it does not                                                               |
| A migration in `server/db/`                                                                                  | Run the setup service; saving the file alone does not apply it                                                                      |
| Tests, scripts, package files, lockfile, Vite configuration, HTML entry, Dockerfile or Compose configuration | Rebuild with the command below                                                                                                      |
| `.env` settings                                                                                              | Run Compose again so affected containers use updated settings; database passwords in an existing volume do not automatically change |

```sh
docker compose up --build -d --wait
```

Only the directories listed under `volumes` in `compose.yaml` are live-mounted. Running a formatter inside a container may change mounted source files, while changes to image-only files disappear with that container. Use your editor's formatter for repository files. If you have host Node.js installed, `npm ci` followed by `npm run format` formats the working copy.

Avoid adding dependencies unless needed. If a dependency is necessary, coordinate the package and lockfile change. With host Node.js installed, run the appropriate npm install command from the repository root. If using Docker only, ask the coordinator to help update the repository manifests and lockfile; installing into a running container alone does not update all repository files.

## 12. Test before every handoff

After rebuilding when required:

```sh
docker compose exec api npm test
docker compose exec client npm run build
docker compose exec api npm run smoke
docker compose exec api npm run format:check
```

The first command runs the existing client and server automated tests. It does not automatically test your new feature unless you add meaningful tests. Test files under `client/test/` and `server/test/` use Node's built-in test runner.

For each feature, test:

- The normal successful action.
- Empty results and missing records.
- Missing, malformed and out-of-range input.
- A visitor without a token.
- A customer attempting an admin action.
- One customer attempting to read/change another customer's records.
- Repeated submissions and concurrent updates when relevant.
- Database rollback when an operation fails halfway through.
- A narrow mobile layout and visible loading/error feedback.

Use separate test data for mutation tests. Avoid changing the shared baseline fixtures to make a test pass. Do not claim the feature is finished based only on a successful production build; a build verifies compilation, not business behavior.

### Inspect an API response without building a page first

The browser's Developer Tools → Network panel shows each request's URL, status, JSON body and response. Open it, sign in, and inspect the login request and a subsequent protected request. Do not share screenshots containing passwords or bearer tokens.

For a direct request in **PowerShell**, this example uses only existing foundation endpoints and fictional credentials:

```powershell
$brightbuyApi = 'http://localhost:3000/api'
$brightbuyLoginBody = @{
  email = 'nimal@example.test'
  password = 'BrightBuy123!'
} | ConvertTo-Json
$brightbuySession = Invoke-RestMethod -Method Post -Uri "$brightbuyApi/auth/login" -ContentType 'application/json' -Body $brightbuyLoginBody
$brightbuyHeaders = @{ Authorization = "Bearer $($brightbuySession.data.accessToken)" }
$brightbuyOrders = Invoke-RestMethod -Method Get -Uri "$brightbuyApi/orders" -Headers $brightbuyHeaders
$brightbuyOrders.data | ConvertTo-Json -Depth 10
```

Adjust the port if configured differently. Sign in again when the token expires. For future endpoints, change the URI/method and send the documented body using `ConvertTo-Json`; do not type JavaScript syntax directly into PowerShell. Unlike the React `api()` helper, this raw HTTP tool keeps the outer `.data` envelope. A rejected HTTP status may be displayed as a PowerShell error; inspect its response rather than assuming the API crashed.

### Write a meaningful automated test

Open an existing test in `server/test/` before adding your own. The project uses Node's built-in `node:test` and strict assertions. Organize each case as: arrange a known fixture, perform one action, assert both the response and resulting state. Reuse the existing HTTP-test setup/cleanup patterns. Give the case a name describing behavior, such as “rejects another customer's address without writing changes.”

A database double can verify validation, parameters and error handling. It cannot prove that MySQL locks, foreign keys or transaction rollback behave correctly. For these cases, use a separate local test stack and two independent clients for concurrency. Do not point mutation tests at real data.

### Run a separate disposable test stack

Copy `.env.example` into `.env.test` in your editor, set local test passwords and a test JWT secret, and use different host ports, for example `MYSQL_HOST_PORT=3308`, `API_HOST_PORT=3001`, and `CLIENT_HOST_PORT=5174`. Keep `SEED_DEMO=true`. The existing ignore rules exclude local environment files; still check `git status` before committing.

```sh
docker compose --env-file .env.test -p brightbuy-test up --build -d --wait
docker compose --env-file .env.test -p brightbuy-test exec api npm test
docker compose --env-file .env.test -p brightbuy-test exec api npm run smoke
```

The explicit project name creates separate containers and a separate database volume, and the alternative ports avoid the normal stack. Always include the same `--env-file` and `-p` options for this test stack's commands. Open its shop at port 5174 and API at port 3001. It uses the same working source code but separate database data. Run smoke before destructive fixture experiments. Then create new fictional records for your feature tests.

To test concurrent checkout, sign in as two separate test customers, give each a cart containing the same variant with only one unit left, and dispatch both documented checkout requests concurrently (for example, from a small Node integration test using `Promise.allSettled`). Under the five-member plan's whole-order backorder policy, assert one confirmed order, one backordered order, two successful order creations, only one stock deduction and zero remaining stock. Implement this test only once the future checkout route exists. Sequential clicks are insufficient evidence of concurrency safety.

Stop the separate stack with:

```sh
docker compose --env-file .env.test -p brightbuy-test down
```

This preserves its test data. For a truly fresh-schema test, choose another unused project name after stopping the old test stack, so its same test ports are available. Inspect and deliberately manage old test volumes through Docker Desktop when no longer needed; do not delete the normal development database to obtain a clean test.

## 13. Save and share your work with Git

Review your changes:

```sh
git status
git diff
git diff --check
```

Stage only the intended files using your editor's Source Control panel, or `git add` followed by their actual paths. Review the staged changes with:

```sh
git diff --cached
```

Confirm there are no environment secrets, local folder paths, generated dependencies or unrelated changes. Then commit with a short description of the completed behavior and push your branch:

```sh
git commit -m "Describe the completed change"
git push -u origin HEAD
```

Replace the example commit message. A commit saves a local checkpoint. A push sends commits to the remote repository. Neither automatically merges your feature into `main`.

Open a pull request from your feature branch to `main`. Include the user-visible behavior, affected endpoints/tables, migrations, test evidence and any integration dependency. Ask another member to review it.

## 14. Bring in teammates' changes

Finish or commit your current coherent work before updating. From your feature branch:

```sh
git fetch origin
git merge origin/main
```

If Git reports conflicts, inspect `git status`, open each conflicted file, discuss overlapping behavior with its owner, and combine the intended changes. Remove conflict markers, stage resolved files, and complete the merge commit. Rebuild and rerun checks. Do not resolve conflicts by accepting an entire side without understanding it.

Migrations, route registration, navigation and API contracts need special attention because several features may touch them. Coordinate those changes in small pull requests.

## 15. Troubleshooting

| Symptom                                             | What to check                                                                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Docker cannot connect to the engine                 | Start Docker Desktop and check that Linux containers are enabled                                                            |
| `setup` exits with code 0                           | Expected; it is a one-time setup command                                                                                    |
| `setup` exits with another code                     | Read `docker compose logs setup`; investigate the first error before retrying                                               |
| A host port is already in use                       | Adjust the appropriate host port in `.env`, then run Compose again                                                          |
| Database authentication fails after changing `.env` | Existing database credentials remain in the volume; restore the correct values or coordinate a deliberate credential change |
| A page redirects to sign-in after refreshing        | Expected with memory-only tokens; sign in again                                                                             |
| API returns 401                                     | Check login, token expiry and bearer-token attachment                                                                       |
| API returns 403                                     | Check the user's role; do not remove authorization to bypass the error                                                      |
| API returns 404 for an order                        | Check the ID and ownership; another customer's order intentionally appears missing                                          |
| API returns 409                                     | Refresh the affected record and check business rules/current status                                                         |
| API returns 500                                     | Find the matching request ID in `docker compose logs api`; do not expose internal error details in the UI                   |
| UI shows an unreadable response                     | Check API/container health and the Vite proxy target                                                                        |
| A newly added test or script is not running         | Rebuild; tests and scripts are copied into the image                                                                        |
| A migration seems ignored                           | Check its filename and whether its version is already recorded; never rewrite an applied migration to force it to run       |
| Sample-data smoke check fails after manual edits    | Compare the documented fixture expectations; use separate test data instead of resetting the database                       |

Useful logs:

```sh
docker compose logs --tail=100 setup api client
docker compose logs --tail=100 db
```

To stop the application while preserving its data:

```sh
docker compose down
```

Do not add `-v` unless the team has intentionally approved deleting that local database volume and you understand the consequences.

## 16. Definition of done for each member

- The assigned user flow works through the relevant UI, API and database layers.
- The contract documents the implemented fields, permissions and failure cases.
- New migrations are coordinated and tested without editing applied migrations.
- Expected success, validation, authorization and failure cases are covered.
- Existing foundation tests and applicable smoke checks still pass.
- Where the agreed feature contract intentionally changes sample counts, catalogue scope or lifecycle actions, update those assertions with review and retain their original auth/error/ownership regression coverage. See the alignment guide; never delete a failing check merely to hide a bug.
- A teammate can run the feature from the documentation without guessing missing setup steps.
- The member can explain the request's path through the code and the reason for each important design decision.
- The pull request identifies any work that still belongs to another member.
- The feature is reviewed and integrated before it is presented as complete.
