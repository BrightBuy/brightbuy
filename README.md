# BrightBuy

Shared development foundation for the retail inventory and online order management project. React, Express and MySQL run in Docker Compose. The application includes a sample catalogue, customer order/address views, administrator customer/order views, real demo-account login and enforced order-status transitions.

Start with [the code walkthrough](docs/CODE_WALKTHROUGH.md) for a guided explanation of the folders, request flow, database setup and authentication.

The [Step 1 checklist](docs/STEP_ONE_CHECKLIST.md) records each foundation requirement and its verification evidence.

## Member development guides

Follow the [five-member guide index](docs/member-guides/README.md) for the remaining feature work, rebalanced against the project-description PDF and the group's ER diagram. Each member has a separate beginner guide with step-by-step milestones, file references, API contracts, database rules, tests and handoff checklists.

Everyone should first read [the shared setup guide](docs/member-guides/00_SHARED_START_HERE.md), [requirements and ER alignment](docs/member-guides/02_REQUIREMENTS_AND_ER_ALIGNMENT.md), and [the five-member team contracts](docs/member-guides/01_TEAM_PLAN.md). The alignment document identifies the required categories/variants, Texas delivery estimates, COD/card simulation, five reports, 40-product dataset and schema corrections. These are planned extensions to the implemented Step 1 foundation; the guides do not claim those features already exist.

## Start the application

Requires Docker Desktop with Linux containers and Docker Compose v2. Host Node.js and MySQL are not required.

1. Copy `.env.example` to `.env` only if `.env` does not already exist. Keep existing database credentials if a database volume already exists.
2. Set database passwords and a random `JWT_SECRET` of at least 32 characters. Keep `.env` private. `SEED_DEMO=true` enables the sample accounts listed below for local development only.
3. Run from the project root:

```sh
docker compose up --build -d
docker compose ps -a
docker compose logs setup api client
```

`db` becomes healthy, `setup` applies the schema and sample data, `api` becomes healthy, then `client` starts. The `setup` container exiting with code 0 is expected.

- Shop: http://localhost:5173
- Admin: http://localhost:5173/admin (sign in as administrator)
- API health: http://localhost:3000/api/health
- Host MySQL: `127.0.0.1:3307`; containers connect to `db:3306`.

Ports can be changed in `.env`. Compose stores database records in the named `brightbuy_mysql_data` volume. `docker compose down` stops the stack while retaining database records. Do not use `down -v` unless you intentionally want to delete the database.

## Sample accounts

All use password `BrightBuy123!` and fictional `.test` email addresses.

| Email              | Role     | Sample records                                     |
| ------------------ | -------- | -------------------------------------------------- |
| nimal@example.test | customer | Two addresses; pending and delivered orders        |
| asha@example.test  | customer | One address; order ready for pickup                |
| admin@example.test | admin    | Can view customers/all orders and advance statuses |

The dataset contains two customers plus one administrator, three products, five variants (including one out of stock), three addresses, three orders and four order lines. Currency is LKR; these are explicit sample defaults, not final business requirements.

Passwords are stored as salted hashes. The client keeps tokens only in memory, so refreshing the page requires signing in again.

## Development and validation

Source directories are mounted for React/Express live reload. Rebuild after dependency, Docker, Vite configuration, HTML entry or test changes. Dependencies are locked in `package-lock.json` and installed with `npm ci` during the image build.

```sh
docker compose run --rm --no-deps api npm test
docker compose run --rm --no-deps client npm run build
docker compose exec api npm run smoke
```

Client tests cover session races, cancellation and unreadable network responses. Setup tests cover rollback and cleanup after failures. Unit/API tests exercise password hashing, login, missing/expired tokens, authorization, ownership, malformed requests, error responses, database health failures, concurrent updates and status transitions using a database test double. The live smoke check uses the actual MySQL-backed API and the untouched sample dataset; it reads records without changing them. Run it before adding/removing sample records.

To verify setup is repeatable without losing data:

```sh
docker compose run --rm setup
docker compose exec api npm run smoke
```

If running checks with a host Node.js installation (22.12+), use `npm ci`, `npm test`, and `npm run build`. Host smoke checks need `SMOKE_BASE_URL=http://localhost:3000`.

## Shared files and team conventions

| Location                                   | Purpose                                                      |
| ------------------------------------------ | ------------------------------------------------------------ |
| `client/src/App.jsx`                       | Page routes and access boundaries                            |
| `client/src/pages/`                        | Individual customer/admin pages                              |
| `client/src/components/`                   | Layout, protected routes and loading/error display           |
| `client/src/auth/` and `client/src/hooks/` | Session state and data loading                               |
| `client/src/api.js`                        | Shared fetch helper and bearer authentication                |
| `server/src/app.js`                        | API assembly and common middleware                           |
| `server/src/routes/`                       | Authentication, catalogue, account and order routes          |
| `server/src/middleware/auth.js`            | Token validation and administrator authorization             |
| `server/src/db.js`                         | Shared MySQL connection pool                                 |
| `server/src/errors.js`                     | Common errors and response envelope                          |
| `server/db/001-foundation.sql`             | Versioned database schema                                    |
| `server/src/database/`                     | Migration runner, sample seed and setup cleanup              |
| `shared/index.js`                          | Currency and allowed order-status transitions                |
| `docs/API.md`                              | Implemented API inputs, outputs, auth and lifecycle contract |
| `docs/CODE_WALKTHROUGH.md`                 | Guided explanation of how the foundation works               |

Read [the shared API contract](docs/API.md) before dividing feature work. The foundation defines a proposed baseline for team agreement. Coordinate schema/contract changes before implementation; keep feature logic in separate modules as the project grows. Do not duplicate connection pools, authentication logic, or error formats.

Migrations run against existing volumes as well as fresh databases. Migration versions are recorded in `schema_migrations`; a database lock prevents concurrent setup. MySQL DDL commits implicitly, so the initial migration uses repeatable `CREATE TABLE IF NOT EXISTS` statements. Future changes require new numbered files such as `002-add-example.sql`, not edits to an already-applied migration. The runner discovers these files automatically. Use plain SQL statements; stored procedures and semicolons inside SQL strings are not supported. The demo seed runs once in a transaction and does not reset changed orders or overwrite passwords. It refuses to seed an existing populated customer table without a seed marker; an incompatible pre-existing schema needs manual reconciliation.

With host Node.js installed, use `npm run format` to apply consistent formatting and `npm run format:check` to verify it. Editor settings are included. Applied SQL migrations are intentionally excluded.

## Portable project files

Keep shared documentation and scripts relative to the repository root. Put machine-specific settings and credentials in ignored environment files; keep only placeholder values in `.env.example`. The `localhost` addresses above are default local development URLs, and host ports can be changed in `.env`.

Git, Docker build contexts and formatting exclude local environment files. `.env.example` remains shareable. Personal IDE workspaces and temporary tooling directories are excluded too. Commit only fictional sample accounts and addresses, never exports of real customer data.

## Scope

This is a local development foundation. Cart, checkout, payment, product editing, stock reservation and reports remain feature work. Status updates currently change only the order lifecycle. Demo credentials, no login rate limiter, and no token revocation make this unsuitable for public deployment without further work.
