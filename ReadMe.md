# 🛍️ BrightBuy — Retail Inventory and Online Order Management System

> **CS3043 / Database Systems Semester Project**  
> A high-reliability digital commerce platform designed for retail inventory, atomic checkout, and order fulfillment across Texas.

🌐 **Live Demo:** [https://brightbuy-seven.vercel.app/](https://brightbuy-seven.vercel.app/)  
☁️ **Cloud Deployment:**
* **Frontend:** Hosted on [Vercel](https://vercel.com/) (React 19 + Vite SPA)
* **Backend:** Hosted on [Vercel](https://vercel.com/) (Express 5 REST API Services)
* **Database:** Hosted on [Aiven.io](https://aiven.io/) (Managed Oracle MySQL 8.0 with SSL)

---

## 📖 Table of Contents
1. [Project Overview](#-project-overview)
2. [Cloud Architecture & Deployment](#-cloud-architecture--deployment)
3. [Technology Stack](#-technology-stack)
4. [Quick Start & Setup](#-quick-start--setup)
   - [Option A: Running with Docker (Recommended)](#option-a-running-with-docker-recommended)
   - [Option B: Running Locally (Node.js & MySQL)](#option-b-running-locally-nodejs--mysql)
5. [Database Migrations & Seeding](#-database-migrations--seeding)
6. [Testing & Verification](#-testing--verification)
7. [Team Contributions](#-team-contributions)
   - [Member 1 — Catalogue & Product Hierarchy](#-member-1--catalogue--product-hierarchy)
   - [Member 2 — Accounts, Authentication & Cart](#-member-2--accounts-authentication--cart)
   - [Member 3 — Checkout, Payments & Cancellation](#-member-3--checkout-payments--cancellation)
   - [Member 4 — Inventory, Fulfilment & Migration Engine (Completed)](#-member-4--inventory-fulfilment--migration-engine)
   - [Member 5 — Locations, Delivery Days & Management Reports](#-member-5--locations-delivery-days--management-reports)

---

## 🎯 Project Overview

BrightBuy is a consumer electronics and toys retail chain based in Texas. To respond to digital competition, this project establishes a resilient full-stack commerce engine emphasizing **database reliability, strict ACID guarantees, and automated stock keeping**.

### Key System Features
* **Multi-Category & Variant Catalogue:** Hierarchical product classification with warehouse-level SKUs and attribute combinations (colour, storage, size).
* **Atomic Checkout:** Real-time stock validation and deduction executed atomically with order creation to prevent overselling.
* **Whole-Order Backorders:** Orders with unavailable stock transition to `backordered` without partial shipments.
* **Order Fulfillment Lifecycle:** Full dispatch workflow (`confirmed` → `processing` → `shipped`/`ready_for_pickup` → `delivered`/`collected`).
* **Delivery Time Estimations:** Algorithmic calculation based on stock availability and destination tier (5 days for main cities, 7 for regional, +3 for backorders).
* **Management Intelligence:** 5 specialized analytical SQL reports covering quarterly revenue, top-selling items, category demand, upcoming delivery timelines, and customer order summaries.

---

## ☁️ Cloud Architecture & Deployment

The live production deployment is structured across modern, high-availability cloud platforms:

```
[ Customer / Admin Browser ]
            │
            ▼
┌────────────────────────────────────────┐
│             VERCEL EDGE                │
│  ├── Frontend: React 19 + Vite (SPA)   │
│  └── Backend: Express 5 REST API       │
└──────────────────┬─────────────────────┘
                   │
            (SSL Encrypted)
                   │
                   ▼
┌────────────────────────────────────────┐
│          AIVEN CLOUD MYSQL             │
│  ├── Managed Oracle MySQL 8.0          │
│  ├── ACID Transactions & Row Locks     │
│  └── Native Procedures, Triggers & DDL │
└────────────────────────────────────────┘
```

| Component | Platform | Role & Configuration |
| :--- | :--- | :--- |
| **Frontend** | [Vercel](https://vercel.com/) | React 19 Single Page Application bundled with Vite 7, deployed globally on Vercel's Edge CDN with client-side SPA routing. |
| **Backend API** | [Vercel](https://vercel.com/) | Express 5 REST API service mounted under `/api/*`, handling authentication, transactional cart operations, and admin workflows. |
| **Database** | [Aiven.io](https://aiven.io/) | Managed Oracle MySQL 8.0 instance running in the cloud with TLS/SSL encryption, providing 100% full compatibility for MySQL stored procedures, triggers, and foreign keys. |

---

## 🛠️ Technology Stack

| Layer | Technologies | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 19, Vite 7, Vanilla CSS, React Router 7 | Responsive, high-performance user interface |
| **Backend API** | Node.js (v22+), Express 5 | RESTful services, transactional business logic |
| **Database** | Oracle MySQL 8.0 (InnoDB) on Aiven.io | Relational schema, stored procedures, triggers, views, and functions |
| **Containerization** | Docker, Docker Compose | Consistent local development and database isolation |
| **Authentication** | JWT (JSON Web Tokens), bcrypt | Secure customer and administrative role separation |
| **Cloud Hosting** | Vercel (Frontend & API) + Aiven (MySQL 8) | High-availability serverless cloud deployment |

---

## 🚀 Quick Start & Setup

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended)
* [Node.js](https://nodejs.org/) (v22.12.0 or higher)
* [Git](https://git-scm.com/)

---

### Option A: Running with Docker (Recommended)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Kamithaakash/BrightBuy.git
   cd BrightBuy
   ```

2. **Configure Environment Variables:**
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   *(The default credentials in `.env.example` are pre-configured for Docker).*

3. **Start the application containers:**
   ```bash
   docker compose up --build -d --wait
   ```

4. **Access the application:**
   * **Storefront Web UI:** [http://localhost:5173](http://localhost:5173)
   * **Backend API Health:** [http://localhost:3000/api/health](http://localhost:3000/api/health)
   * **MySQL Database:** `localhost:3307`

---

### Option B: Running Locally (Node.js & MySQL)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure `.env` in the root folder:**
   ```env
   MYSQL_DATABASE=brightbuy
   MYSQL_USER=brightbuy_app
   MYSQL_PASSWORD=your_mysql_password
   DB_HOST=127.0.0.1
   DB_PORT=3306
   API_HOST_PORT=3000
   CLIENT_HOST_PORT=5173
   JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long
   SEED_DEMO=true
   SEED_PROJECT=true
   ```

3. **Run database setup & seed:**
   ```bash
   npm run db:setup
   ```

4. **Start the dev servers:**
   ```bash
   npm run dev
   ```

---

## 🗄️ Database Migrations & Seeding

The project features an automated, idempotent migration runner:

* **Apply all schema migrations & demo seeds:**
  ```bash
  npm run db:setup
  ```
* **Populate the 40+ products and 10 categories:**
  ```bash
  npm run seed:project
  ```
* **Seed destination cities & store pickup locations:**
  ```bash
  npm --prefix server run seed:locations
  ```

---

## 🧪 Testing & Verification

Run the comprehensive automated test suite (unit, integration, and concurrency tests):

```bash
# Run all workspace tests
npm test

# Run backend tests only
npm --prefix server test

# Run frontend tests only
npm --prefix client test
```

---

## 👥 Team Contributions

---

### 📦 Member 1 — Catalogue & Product Hierarchy
* **Student Name:** *[To be filled by Member 1]*
* **Feature Branch:** `feature/catalogue-variants`
* **Responsibilities:**
  * Multi-category schema design and product hierarchy.
  * Product variant attribute modeling (Color, Storage, Size, RAM) with individual SKUs.
  * Creation and population of the 40+ products across 10 categories.
  * Public catalogue browsing and admin catalogue management interfaces.
* **Detailed Contributions:**
  * *[To be filled by Member 1]*

---

### 👤 Member 2 — Accounts, Authentication & Cart
* **Student Name:** *[To be filled by Member 2]*
* **Feature Branch:** `feature/customers-cart`
* **Responsibilities:**
  * Customer account registration, password hashing (bcrypt), and role authentication.
  * Customer shipping address book.
  * Shopping cart persistence for guest and registered users.
  * Authentication middleware and token validation.
* **Detailed Contributions:**
  * *[To be filled by Member 2]*

---

### 💳 Member 3 — Checkout, Payments & Cancellation
* **Student Name:** *[To be filled by Member 3]*
* **Feature Branch:** `feature/checkout-payments`
* **Responsibilities:**
  * Order creation and atomic checkout transaction workflow.
  * Payment processing (Card Payment simulation & Cash on Delivery lifecycle).
  * Idempotent payment validation (`checkout_requests`).
  * Order cancellation and refund processing.
  * Customer checkout UI and cancellation interfaces.
* **Detailed Contributions:**
  * *[To be filled by Member 3]*

---

### 🏭 Member 4 — Inventory, Fulfilment & Migration Engine
* **Student Name:** **Galagedara G.K.A.T**
* **Feature Branch:** `feature/inventory-fulfilment`
* **SRS Requirements Owned:**
  * **R01:** Central warehouse stock management; variant determines final price and stock availability.
  * **R07:** Atomic stock decrement at checkout confirmation without overselling.
  * **R08:** Order fulfillment completion (delivery and store pickup modes).
  * **R09:** Cash on Delivery (COD) cash collection at the point of delivery.
  * **R16:** Primary/Foreign key constraints, indexes, and ACID guarantees.
  * **R17:** Stored procedures, triggers, and transactional safety demonstration.

#### 1. Core Architectural Deliverables
* **Upgraded Database Migration Engine (`server/src/database/migrate.js`):**
  * Extended the migration runner to dynamically discover, sort, and execute both legacy `.sql` scripts and modern `.mjs` modules.
  * Enabled execution of complex MySQL routines (stored procedures, triggers, and functions) that cannot be parsed by standard semicolon-delimited splitters.
  * Implemented duplicate-version detection, transactional execution, and execution ledger tracking (`schema_migrations`).

* **Audit-Logged Inventory Engine (`server/db/006-inventory.mjs`):**
  * **Table `inventory_movements`:** Immutable, comprehensive ledger recording every stock transition (`sale`, `adjustment`, `allocation`, `cancellation`) with admin accountability, order IDs, reasons, and UUID idempotency keys.
  * **Stored Procedure `sp_apply_stock_change`:**
    * Acquires row-level pessimistic locks (`SELECT ... FOR UPDATE`) in consistent order to eliminate race conditions.
    * Replay-safe idempotency via `reference_key` checks (returns existing movements on retry; raises errors on conflicting arguments).
    * Validates non-negative outcomes before inserting movement records.
    * Caller owns the transaction—ensuring atomic coordination with checkout and order creation.
  * **Trigger `trg_stock_movement_apply`:**
    * Automatically fires `AFTER INSERT` on `inventory_movements`.
    * Enforces that `variants.stock` is updated **exclusively** through audited movements.
    * Signals SQL state exceptions if unexpected discrepancies or negative balances occur, rolling back the entire transaction.
  * **JavaScript Bridge (`server/src/services/inventory.js`):**
    * Exposes `applyStockChange(connection, change)` helper utilized across the checkout and fulfillment domains.

* **Whole-Order Backorder Allocation (`POST /admin/orders/:id/allocate`):**
  * Built all-or-nothing allocation logic: orders only confirm when all line items have sufficient inventory.
  * Enforces **ascending variant ID row locking** to completely eliminate deadlock hazards during concurrent allocations.
  * Transitions order state from `backordered` to `confirmed` and updates `stock_state = 'allocated'`.

* **Order Dispatch & Fulfillment Completion (`POST /admin/orders/:id/complete`):**
  * Admin-driven progression through state boundaries (`confirmed` → `processing` → `shipped`/`ready_for_pickup` → `delivered`/`collected`).
  * Enforces fulfillment mode rules: delivery orders complete as `delivered`; store pickups complete as `collected`.
  * Integrates COD cash collection: verifies physical cash receipt before releasing orders.
  * Updates `actual_date = CURRENT_DATE` and sets `stock_state = 'consumed'`.

#### 2. Administrative User Interfaces
* **Admin Inventory Management (`client/src/pages/AdminInventoryPage.jsx`):**
  * Real-time stock visibility across all variants with low-stock filtering.
  * Manual stock adjustment forms with reason auditing and client-generated UUID request keys.
  * Historical stock movement drawer showing complete chronological audit trails.
* **Admin Fulfilment Management (`client/src/pages/AdminFulfilmentPage.jsx`):**
  * Filterable order queue displaying fulfillment modes, stock states, and payment statuses.
  * Contextual action buttons for advancing orders through dispatch stages.
  * Dedicated completion modal with mandatory Cash on Delivery confirmation checkbox.

#### 3. Summary of Files Created & Modified by Member 4

| File | Type | Description |
| :--- | :--- | :--- |
| `server/db/006-inventory.mjs` | Migration | Schema for `inventory_movements`, procedure `sp_apply_stock_change`, trigger `trg_stock_movement_apply` |
| `server/src/database/migrate.js` | Core Runner | Enhanced migration engine supporting `.mjs` routine modules |
| `server/src/services/inventory.js` | Business Logic | Transactional stock mutation service |
| `server/src/services/fulfilment.js` | Business Logic | Allocation, dispatch, and order completion workflows |
| `server/src/routes/inventory.js` | API Route | `/admin/inventory`, `/admin/variants/:id/stock-adjustments`, `/admin/variants/:id/stock-movements` |
| `server/src/routes/fulfilment.js` | API Route | `/admin/fulfilment`, `/admin/orders/:id/allocate`, `/admin/orders/:id/complete` |
| `client/src/pages/AdminInventoryPage.jsx` | React UI | Admin stock adjustment and movement history interface |
| `client/src/pages/AdminFulfilmentPage.jsx` | React UI | Admin order dispatch, backorder allocation, and completion interface |
| `server/test/inventory-fulfilment.test.js` | Test Suite | Deadlock prevention, and ACID verification tests |


---

### 📊 Member 5 — Locations, Delivery Days & Management Reports
* **Student Name:** *[To be filled by Member 5]*
* **Feature Branch:** `feature/locations-reports`
* **Responsibilities:**
  * Texas city classification (Main vs Other cities) and store pickup locations.
  * Deterministic delivery estimation stored function: `fn_delivery_days(city_id, in_stock)`.
  * Management reporting engine implementing the 5 required analytical queries:
    1. Quarterly sales report for a specified year.
    2. Top-selling products in a given timeframe.
    3. Category-wise total order distribution.
    4. Delivery time estimates for upcoming orders.
    5. Customer-wise order summary and payment status.
  * Admin reporting dashboard (`AdminReportsPage.jsx`).
* **Detailed Contributions:**
  * *[To be filled by Member 5]*

---


