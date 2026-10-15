# BrightBuy — Retail Inventory and Online Order Management System

> **CS3043 / Database Systems Semester Project**
> A retail system for managing products, stock, customer orders, and fulfilment across Texas.

**Live Demo:** [https://brightbuy-seven.vercel.app/](https://brightbuy-seven.vercel.app/)

**Cloud Deployment:**

- **Frontend:** Deployed on [Vercel](https://vercel.com/) (React 19 + Vite SPA)
- **Backend:** Deployed on [Vercel](https://vercel.com/) (Express 5 REST API Services)
- **Database:** Hosted on [Aiven.io](https://aiven.io/) (Managed MySQL)

---

![BrightBuy home page](docs/images/brightbuy-home.png)

## Table of Contents

1. [Project Overview](#project-overview)
2. [Cloud Architecture & Deployment](#cloud-architecture--deployment)
3. [Technology Stack](#technology-stack)
4. [Quick Start & Setup](#quick-start--setup)
   - [Option A: Running with Docker (Recommended)](#option-a-running-with-docker-recommended)
   - [Option B: Running Locally (Node.js & MySQL)](#option-b-running-locally-nodejs--mysql)
   - [Email Service Setup (Brevo SMTP)](#email-service-setup-brevo-smtp)
   - [Sample Demo Accounts](#sample-accounts)
5. [Database Migrations & Seeding](#database-migrations--seeding)
6. [Testing & Verification](#testing--verification)
   - [Running Standard Workspace Tests](#running-standard-workspace-tests)
   - [Running Opt-in MySQL Integration Tests](#running-opt-in-mysql-integration-tests)
7. [Team Contributions](#team-contributions)
   - [Ajay J — Catalogue & Product Hierarchy](#ajay-j--catalogue--product-hierarchy)
   - [Hettiarachchi U.O. — Accounts, Authentication & Cart](#hettiarachchi-uo--accounts-authentication--cart)
   - [Abegunawardhana A.D. — Checkout, Payments & Cancellation](#abegunawardhana-ad--checkout-payments--cancellation)
   - [Galagedara G.K.A.T — Inventory, Fulfilment & Migration Engine](#galagedara-gkat--inventory-fulfilment--migration-engine)
   - [Madhushani V.P.O. — Locations, Delivery Days & Management Reports](#madhushani-vpo--locations-delivery-days--management-reports)

---

## Project Overview

BrightBuy is a retail management system for electronics, gadgets, and toys across Texas. The project focuses on relational database modeling, transaction management, automated inventory accounting, and multi-stage order fulfillment.

### Key System Features

- **Multi-Category & Variant Catalogue:** Hierarchical product classification with variant-level SKUs and attribute combinations (colour, storage, RAM, size).
- **Transactional Checkout:** Stock validation and decrement coordinated with order creation inside transactional database blocks to prevent overselling.
- **Whole-Order Backorders:** Orders containing out-of-stock items transition to `backordered` without partial shipments, awaiting restock allocation.
- **Order Fulfillment Lifecycle:** Dispatch progression (`confirmed` → `processing` → `shipped`/`ready_for_pickup` → `delivered`/`collected`).
- **Deterministic Delivery Estimates:** Calculated using the stored function `fn_delivery_days(is_main_city, was_out_of_stock)` based on Texas destination tiers (5 calendar days for main cities, 7 for regional cities, and 3 extra days for initial stock shortages).
- **Management Reports:** 5 analytical SQL queries covering quarterly revenue, top-selling items, category demand, upcoming delivery timelines, and customer order summaries.

Prices are in USD. Timestamps are stored in UTC, while business dates and displayed times use Texas Central Time (`America/Chicago`). Delivery estimates count calendar days, including weekends and holidays.

New customers verify their email before signing in. Admins manage the catalogue, customers, locations, reports, and fulfilment; warehouse users can view and adjust inventory. Eligible confirmed or backordered orders can be cancelled.

---

## Cloud Architecture & Deployment

The frontend and backend are configured as separate services in one Vercel project:

```text
Customer / Admin / Warehouse browser
                |
                v
Vercel
  Frontend: React + Vite, served as static files
  Backend: Express API on the Node.js runtime (/api/*)
                |
                v
Aiven MySQL
  Tables, transactions, stored procedures, triggers, and functions
```

| Component       | Platform                      | Configuration & Role                                                                                                            |
| :-------------- | :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| **Frontend**    | [Vercel](https://vercel.com/) | React 19 Single Page Application bundled with Vite 7, deployed globally on Vercel CDN with client-side SPA routing.             |
| **Backend API** | [Vercel](https://vercel.com/) | Express 5 REST API service mounted under `/api/*`, handling authentication, transactional cart operations, and admin workflows. |
| **Database**    | [Aiven.io](https://aiven.io/) | Managed MySQL database for application data, stored procedures, triggers, and foreign keys.                                     |

---

## Technology Stack

| Layer                | Technologies                                     | Purpose                                                        |
| :------------------- | :----------------------------------------------- | :------------------------------------------------------------- |
| **Frontend**         | React 19, Vite 7, Vanilla CSS, React Router 7    | Responsive user interface and administrative dashboards        |
| **Backend API**      | Node.js (v22+), Express 5                        | RESTful services, transactional business logic                 |
| **Database**         | MySQL (Aiven in production; MySQL 8.4 in Docker) | Relational schema, stored procedures, triggers, and functions  |
| **Containerization** | Docker, Docker Compose                           | Local development environment and containerized MySQL database |
| **Authentication**   | JWT (JSON Web Tokens), scrypt                    | Role-based authentication (customer, admin, and warehouse)     |
| **Cloud Hosting**    | Vercel (Frontend & API) + Aiven (MySQL 8)        | Serverless production deployment                               |

---

## Quick Start & Setup

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended)
- [Node.js](https://nodejs.org/) (v22.12.0 or higher)
- [Git](https://git-scm.com/)

---

### Option A: Running with Docker (Recommended)

1. **Clone the repository:**

   ```bash
   git clone https://github.com/BrightBuy/brightbuy.git
   cd brightbuy
   ```

2. **Configure Environment Variables:**
   Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

   Replace the password and JWT placeholders in `.env`. Use a JWT secret of at least 32 characters. Configure Brevo to test registration emails; the seeded demo accounts can sign in without email verification.

3. **Start the application containers:**

   ```bash
   docker compose up --build -d --wait
   ```

4. **Access the application:**
   - **Storefront Web UI:** [http://localhost:5173](http://localhost:5173)
   - **Backend API Health:** [http://localhost:3000/api/health](http://localhost:3000/api/health)
   - **MySQL Database Port:** `localhost:3307`

---

### Option B: Running Locally (Node.js & MySQL)

Run these commands from the repository root. You need an existing MySQL database and a user with permission to create the project tables, procedures, triggers, and functions.

1. Install the dependencies:

   ```bash
   npm install
   ```

2. Create a root `.env` file with your local connection details:

   ```env
   MYSQL_DATABASE=brightbuy
   MYSQL_USER=brightbuy_app
   MYSQL_PASSWORD=your_mysql_password
   DB_HOST=127.0.0.1
   DB_PORT=3306
   PORT=3000
   JWT_SECRET=replace-with-a-random-secret-of-at-least-32-characters
   SEED_DEMO=true
   SEED_PROJECT=true
   BREVO_SMTP_USER=your-brevo-smtp-login@smtp-brevo.com
   BREVO_SMTP_KEY=your-brevo-smtp-key
   EMAIL_FROM="BrightBuy Store <your-verified-email@example.com>"
   PUBLIC_APP_URL=http://localhost:5173
   ```

   Use `DB_PORT=3307` instead if you connect to the database exposed by the project's Docker Compose setup. Keep `.env` out of version control.

3. Apply migrations and load the default data:

   ```bash
   node --env-file=.env server/src/setup.js
   ```

   With both seed flags enabled, this creates the sample accounts, catalogue, locations, and sample orders. There is no need to run a separate project-seeding command afterward.

4. Start the backend in one terminal:

   ```bash
   node --env-file=.env --watch server/src/index.js
   ```

5. Start the frontend in a second terminal:

   ```bash
   npm run dev:client
   ```

The frontend runs at `http://localhost:5173` and the API at `http://localhost:3000`. The explicit `--env-file` option loads the root `.env` file for Node.js; the existing npm server scripts expect variables to be supplied by the shell or Docker. The root `npm run dev` command starts only the frontend.

---

### Email Service Setup (Brevo SMTP)

BrightBuy uses Brevo for order confirmations, email verification, and password-reset links.

1. In Brevo's SMTP settings, copy your SMTP login and generate an SMTP key. An SMTP key is different from an API key.
2. Add and verify the address you want to use as the sender.
3. Set the following variables in your local `.env` file or your backend's Vercel environment settings:

   ```env
   BREVO_SMTP_USER=your-brevo-smtp-login@smtp-brevo.com
   BREVO_SMTP_KEY=your-brevo-smtp-key
   EMAIL_FROM="BrightBuy Store <your-verified-email@example.com>"
   PUBLIC_APP_URL=http://localhost:5173
   ```

For production, set `PUBLIC_APP_URL` to the hosted frontend address, such as `https://brightbuy-seven.vercel.app`. Otherwise, emails will link to localhost. Redeploy after changing Vercel variables and request a new email to test the updated link.


New registrations require verification before sign-in. Verification links expire after 24 hours, and reset links after 30 minutes. Both are single-use. Registration, resend verification, and password-reset requests wait for the sending attempt before returning. If registration succeeds but email sending fails, the account remains available for a resend attempt.


---

### Sample Accounts

All pre-seeded demo accounts use the password **`BrightBuy123!`** and fictional `.test` email addresses:

| Email                | Role     | Sample Records / Access                            |
| :------------------- | :------- | :------------------------------------------------- |
| `nimal@example.test` | customer | Two addresses; confirmed and delivered orders      |
| `asha@example.test`  | customer | One address; order ready for pickup                |
| `admin@example.test` | admin    | Can view customers/all orders and advance statuses |

---

## Database Migrations & Seeding

The migration runner supports numbered `.sql` and `.mjs` files and records completed versions in `schema_migrations`.

From the repository root, using the `.env` file described above:

```bash
node --env-file=.env server/src/setup.js
```

- `SEED_DEMO=true` enables the default demo accounts and related records.
- `SEED_PROJECT=true` enables the project catalogue, locations, and sample orders.
- To apply migrations without seeding, set both flags to `false`.
- When environment variables are already supplied by the shell or container, `npm run db:setup` runs the same setup script.

To seed locations separately:

```bash
node --env-file=.env server/src/seed-locations.js
```

Additional checkout scenarios are optional and modify demo accounts and stock. On a demo database, add `SEED_CHECKOUT=true` to `.env`, then run:

```bash
node --env-file=.env scripts/seed-checkout.mjs
```

Remove that opt-in flag afterward. Setup is not a database reset: rerunning it does not delete accounts or orders created through the application. Use a separate empty database if you need a fresh set of default data.

---

## Testing & Verification

### Running Standard Workspace Tests

The repository contains unit and mocked tests that execute without requiring a live MySQL instance:

```bash
# Run all unit/workspace tests across client and server

npm test

# Run backend unit tests only

npm --workspace server run test

# Run client tests only

npm --workspace client run test
```

### Running Opt-in MySQL Integration Tests

The ordinary test run skips live MySQL tests unless their opt-in flags are set. Use disposable databases, not the database used by the hosted application. Run each suite separately because several suites require an empty database at the start.

| Test file in `server/test`       | Enable with                          | Database requirement                                                                   |
| :------------------------------- | :----------------------------------- | :------------------------------------------------------------------------------------- |
| `checkout.mysql.test.js`         | `M3_TEST_MYSQL_URL`                  | Administrative connection; the suite creates and drops isolated databases              |
| `account-recovery.mysql.test.js` | `M3_TEST_MYSQL_URL`                  | Administrative connection; the suite creates and drops an isolated database            |
| `reports.mysql.test.js`          | `REPORTS_TEST_MYSQL=1`               | Fresh database named `brightbuy_reports_test` or `brightbuy_reports_test_<suffix>`     |
| `order-tracking.mysql.test.js`   | `TRACKING_TEST_MYSQL=1`              | Fresh database named `brightbuy_tracking_test` or `brightbuy_tracking_test_<suffix>`   |
| `locations-migration.test.js`    | `LOCATIONS_TEST_MYSQL=1`             | Fresh database named `brightbuy_locations_test` or `brightbuy_locations_test_<suffix>` |
| `locations-api.test.js`          | `LOCATIONS_API_TEST_MYSQL=1`         | Fresh database using the locations naming pattern                                      |
| `locations-destination.test.js`  | `LOCATIONS_DESTINATION_TEST_MYSQL=1` | Fresh database using the locations naming pattern                                      |
| `delivery-days.test.js`          | `DELIVERY_DAYS_TEST_MYSQL=1`         | Fresh database using the locations naming pattern                                      |

Suffixes may contain lowercase letters and digits. The suites using a named test database read `MYSQL_TEST_HOST`, `MYSQL_TEST_USER`, `MYSQL_TEST_PASSWORD`, and `MYSQL_TEST_DATABASE`. Locations and delivery-day tests also accept `MYSQL_TEST_PORT`; reports and tracking currently use the MySQL default port, 3306.

For example, create an empty `brightbuy_reports_test` database and run this in PowerShell from the repository root:

```powershell
$env:REPORTS_TEST_MYSQL="1"
$env:MYSQL_TEST_HOST="127.0.0.1"
$env:MYSQL_TEST_USER="your_test_user"
$env:MYSQL_TEST_PASSWORD="your_test_password"
$env:MYSQL_TEST_DATABASE="brightbuy_reports_test"
node --test server/test/reports.mysql.test.js
Remove-Item Env:REPORTS_TEST_MYSQL
```

For checkout tests, the connection URL includes the port, so it can target the Docker database exposed on 3307. The user must have permission to create and drop test databases:

```powershell
$env:M3_TEST_MYSQL_URL="mysql://YOUR_TEST_USER:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:3307/mysql"
node --test server/test/checkout.mysql.test.js
Remove-Item Env:M3_TEST_MYSQL_URL
```

Replace the placeholders and URL-encode special characters in URL credentials. Running one named file avoids enabling unrelated suites with different database requirements.

---

## Team Contributions

---

### Ajay J — Catalogue & Product Hierarchy

- **Feature Branch:** `feature/catalogue-variants`
- **Contribution:** Designed and implemented the hierarchical product catalogue schema (categories, products, attributes, variants, and image mappings). Developed backend querying and filtering services with stock availability tracking, along with public browsing pages (`ProductsPage`, `ProductDetailPage`) and the administrative catalogue management interface.

---

### Hettiarachchi U.O. — Accounts, Authentication & Cart

- **Feature Branch:** `feature/customers-cart`
- **Contribution:** Built customer authentication and account management using salted scrypt password hashing and JWT sessions, including email verification, resend verification, and password reset. Implemented persistent database shopping carts with guest-to-customer cart merging upon sign-in, and created the customer multi-address shipping book integrated with Texas city validation.

---

### Abegunawardhana A.D. — Checkout, Payments & Cancellation

- **Feature Branch:** `feature/checkout-payments`
- **Contribution:** Implemented transactional checkout with stock checks and row locking to coordinate order creation and inventory deductions. Added idempotent checkout protection (`checkout_requests`) to prevent duplicate submissions, payment simulation (Card & COD), and the customer order tracking and cancellation lifecycle with stock restoration when a cancelled order had allocated inventory.

---

### Galagedara G.K.A.T — Inventory, Fulfilment & Migration Engine

- **Feature Branch:** `feature/inventory-fulfilment`
- **Contribution:** Developed the database migration runner supporting procedural `.mjs` scripts. Designed the audit-logged inventory engine with pessimistic row-locking (`sp_apply_stock_change`) and balance integrity triggers (`trg_stock_movement_apply`), whole-order backorder allocation using consistent row-lock ordering to reduce deadlock risk, and administrative order fulfillment progression with COD cash collection verification.

---

### Madhushani V.P.O. — Locations, Delivery Days & Management Reports

- **Feature Branch:** `feature/locations-reports`
- **Contribution:** Modeled the Texas locations database (main cities, regional cities, pickup stores) and implemented the deterministic delivery calculation stored function `fn_delivery_days`. Added composite database indexes and implemented the 5 analytical business management reports (Quarterly Sales, Top Products, Category Demand, Delivery Timelines, Customer Summaries) with an interactive admin dashboard.

---

### Summary Matrix of Contributions

| Contributor              | Functional Area        | Core Responsibilities & Deliverables                             | Primary Files                                          |
| :----------------------- | :--------------------- | :--------------------------------------------------------------- | :----------------------------------------------------- |
| **Ajay J**               | Catalogue & Variants   | Category tree, dynamic attributes, stock display                 | `server/src/services/catalogue.js`, `ProductsPage.jsx` |
| **Hettiarachchi U.O.**   | Auth & Cart            | JWT auth, persistent cart, guest merge, address book             | `server/src/routes/auth.js`, `cart.js`, `CartPage.jsx` |
| **Abegunawardhana A.D.** | Checkout & Orders      | Atomic checkout, idempotency, payments, cancellation             | `server/src/services/checkout.js`, `CheckoutPage.jsx`  |
| **Galagedara G.K.A.T**   | Inventory & Fulfilment | Movement audit ledger, row locks, backorders, migrations         | `migrate.js`, `inventory.js`, `fulfilment.js`          |
| **Madhushani V.P.O.**    | Locations & Reports    | Delivery estimation function (`fn_delivery_days`), 5 SQL reports | `locations.js`, `reports.js`, `AdminReportsPage.jsx`   |

---
