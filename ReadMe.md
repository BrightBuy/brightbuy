# 🛍️ BrightBuy — Retail Inventory and Online Order Management System

> **CS3043 / Database Systems Semester Project**  
> A digital commerce platform designed for retail inventory management, transactional checkout, and order fulfillment across Texas.

🌐 **Live Demo:** [https://brightbuy-seven.vercel.app/](https://brightbuy-seven.vercel.app/)  
☁️ **Cloud Deployment:**
* **Frontend:** Deployed on [Vercel](https://vercel.com/) (React 19 + Vite SPA)
* **Backend:** Deployed on [Vercel](https://vercel.com/) (Express 5 REST API Services)
* **Database:** Hosted on [Aiven.io](https://aiven.io/) (Managed Oracle MySQL 8.0 with SSL)

---

## 📖 Table of Contents
1. [Project Overview](#-project-overview)
2. [Cloud Architecture & Deployment](#-cloud-architecture--deployment)
3. [Technology Stack](#-technology-stack)
4. [Quick Start & Setup](#-quick-start--setup)
   - [Option A: Running with Docker (Recommended)](#option-a-running-with-docker-recommended)
   - [Option B: Running Locally (Node.js & MySQL)](#option-b-running-locally-nodejs--mysql)
   - [Sample Demo Accounts](#-sample-accounts)
5. [Database Migrations & Seeding](#-database-migrations--seeding)
6. [Testing & Verification](#-testing--verification)
   - [Running Standard Workspace Tests](#running-standard-workspace-tests)
   - [Running Opt-in MySQL Integration Tests](#running-opt-in-mysql-integration-tests)
7. [Team Contributions](#-team-contributions)
   - [Member 1 — Catalogue & Product Hierarchy](#-member-1--catalogue--product-hierarchy)
   - [Member 2 — Accounts, Authentication & Cart](#-member-2--accounts-authentication--cart)
   - [Member 3 — Checkout, Payments & Cancellation](#-member-3--checkout-payments--cancellation)
   - [Member 4 — Inventory, Fulfilment & Migration Engine](#-member-4--inventory-fulfilment--migration-engine)
   - [Member 5 — Locations, Delivery Days & Management Reports](#-member-5--locations-delivery-days--management-reports)

---

## 🎯 Project Overview

BrightBuy is a retail management system designed for consumer electronics and gadgets across Texas. The project focuses on relational database modeling, transaction management, automated inventory accounting, and multi-stage order fulfillment.

### Key System Features
* **Multi-Category & Variant Catalogue:** Hierarchical product classification with warehouse-level SKUs and attribute combinations (colour, storage, RAM, size).
* **Transactional Checkout:** Stock validation and decrement coordinated with order creation inside transactional database blocks to prevent overselling.
* **Whole-Order Backorders:** Orders containing out-of-stock items transition to `backordered` without partial shipments, awaiting restock allocation.
* **Order Fulfillment Lifecycle:** Dispatch progression (`confirmed` → `processing` → `shipped`/`ready_for_pickup` → `delivered`/`collected`).
* **Deterministic Delivery Estimates:** Algorithmic calculation via stored function `fn_delivery_days(is_main_city, was_out_of_stock)` based on Texas destination tiers (5 days for main cities, 7 days for regional cities, +3 days for backorders).
* **Management Intelligence Reports:** 5 analytical SQL queries covering quarterly revenue, top-selling items, category demand, upcoming delivery timelines, and customer order summaries.

---

## ☁️ Cloud Architecture & Deployment

The live deployment topology runs across modern cloud hosting platforms:

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
│  ├── InnoDB Engine (ACID Transactions) │
│  └── Stored Procedures, Triggers & DDL │
└────────────────────────────────────────┘
```

| Component | Platform | Configuration & Role |
| :--- | :--- | :--- |
| **Frontend** | [Vercel](https://vercel.com/) | React 19 Single Page Application bundled with Vite 7, deployed globally on Vercel CDN with client-side SPA routing. |
| **Backend API** | [Vercel](https://vercel.com/) | Express 5 REST API service mounted under `/api/*`, handling authentication, transactional cart operations, and admin workflows. |
| **Database** | [Aiven.io](https://aiven.io/) | Managed Oracle MySQL 8.0 instance running in the cloud with TLS/SSL encryption, providing native support for MySQL stored procedures, triggers, and foreign keys. |

---

## 🛠️ Technology Stack

| Layer | Technologies | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 19, Vite 7, Vanilla CSS, React Router 7 | Responsive user interface and administrative dashboards |
| **Backend API** | Node.js (v22+), Express 5 | RESTful services, transactional business logic |
| **Database** | Oracle MySQL 8.0 (InnoDB) on Aiven.io | Relational schema, stored procedures, triggers, views, and functions |
| **Containerization** | Docker, Docker Compose | Local development environment and containerized MySQL database |
| **Authentication** | JWT (JSON Web Tokens), bcrypt | Role-based authentication (Customer and Admin) |
| **Cloud Hosting** | Vercel (Frontend & API) + Aiven (MySQL 8) | Serverless production deployment |

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
   git clone https://github.com/BrightBuy/brightbuy.git
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
   * **MySQL Database Port:** `localhost:3307`

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

3. **Run database setup & migrations:**
   ```bash
   npm run db:setup
   ```

4. **Seed database tables:**
   ```bash
   # Seed 40+ products and category catalogue
   npm --workspace server run seed:project

   # Seed Texas destination cities and store pickup locations
   npm --workspace server run seed:locations
   ```

5. **Start the development servers:**
   Because the root `npm run dev` script starts the frontend client, launch the backend and frontend in separate terminals:

   * **Terminal 1 — Backend API Server:**
     ```bash
     npm run dev:server
     ```
     *(Runs `node --watch src/index.js` inside `@brightbuy/server` on port 3000).*

   * **Terminal 2 — Frontend Client:**
     ```bash
     npm run dev:client
     ```
     *(Runs Vite development server inside `@brightbuy/client` on port 5173).*

---

### 🔑 Sample Accounts

All pre-seeded demo accounts use the password **`BrightBuy123!`** and fictional `.test` email addresses:

| Email | Role | Sample Records / Access |
| :--- | :--- | :--- |
| `nimal@example.test` | customer | Two addresses; pending and delivered orders |
| `asha@example.test` | customer | One address; order ready for pickup |
| `admin@example.test` | admin | Can view customers/all orders and advance statuses |

---

## 🗄️ Database Migrations & Seeding

The database setup utilizes an automated migration runner supporting both `.sql` and `.mjs` modules:

* **Execute all pending migrations & foundation setup:**
  ```bash
  npm run db:setup
  ```
* **Populate product catalogue and attributes:**
  ```bash
  npm --workspace server run seed:project
  ```
* **Populate Texas cities and physical store branches:**
  ```bash
  npm --workspace server run seed:locations
  ```
* **Populate sample orders for testing checkout lifecycle:**
  ```bash
  npm run seed:checkout
  ```

---

## 🧪 Testing & Verification

### Running Standard Workspace Tests
The repository contains unit and mocked tests that execute without requiring a live MySQL instance:

```bash
# Run all unit/workspace tests across client and server
npm test

# Run backend unit tests only
npm --workspace server run test

# Run client tests only (if configured)
npm --workspace client run test
```

### Running Opt-in MySQL Integration Tests
Several test suites (`checkout.mysql.test.js`, `order-tracking.mysql.test.js`, `reports.mysql.test.js`, `locations-*.test.js`, and `delivery-days.test.js`) are opt-in integration tests designed to run against a disposable MySQL 8.x database. They are skipped during standard `npm test` runs unless their respective environment variables are provided:

* **Checkout Lifecycle Integration Tests (`checkout.mysql.test.js`):**
  Requires `M3_TEST_MYSQL_URL` pointing to an administrative MySQL connection with permissions to create and drop isolated test databases:
  ```bash
  M3_TEST_MYSQL_URL="mysql://root:password@127.0.0.1:3306" npm --workspace server test test/checkout.mysql.test.js
  ```

* **Management Reports Integration Tests (`reports.mysql.test.js`):**
  ```bash
  REPORTS_TEST_MYSQL=1 \
  MYSQL_TEST_HOST=127.0.0.1 \
  MYSQL_TEST_USER=brightbuy_app \
  MYSQL_TEST_PASSWORD=your_password \
  MYSQL_TEST_DATABASE=brightbuy \
  npm --workspace server test test/reports.mysql.test.js
  ```

* **Order Tracking & Locations Integration Tests:**
  ```bash
  TRACKING_TEST_MYSQL=1 LOCATIONS_TEST_MYSQL=1 DELIVERY_DAYS_TEST_MYSQL=1 \
  MYSQL_TEST_HOST=127.0.0.1 \
  MYSQL_TEST_USER=brightbuy_app \
  MYSQL_TEST_PASSWORD=your_password \
  MYSQL_TEST_DATABASE=brightbuy \
  npm --workspace server test
  ```

---

## 👥 Team Contributions

---

### 📦 Member 1 — Catalogue & Product Hierarchy
* **Student Name:** *[To be filled by Member 1]*
* **Feature Branch:** `feature/catalogue-variants`
* **SRS Requirements Owned:**
  * **R01:** Product hierarchy with category tree, attributes, and variant-level pricing and SKU assignments.
  * **R02:** Product search, multi-attribute filtering, and real-time catalogue availability display.

#### 1. Core Architectural Deliverables
* **Hierarchical Catalogue Schema (`server/db/004-catalogue.mjs`):**
  * Modeled `categories`, `products`, `product_categories`, `attributes`, `attribute_values`, and `variants`.
  * Designed many-to-many relationship structures allowing products to exist in multiple subcategories.
  * Configured cascading delete protections and foreign key constraints on product lines.
* **Variant & Image Management (`server/db/012-product-images.sql`, `013-variant-images.sql`):**
  * Added image metadata tables supporting primary and gallery visual assets per variant.
* **Catalogue Query Service (`server/src/services/catalogue.js`):**
  * Implemented optimized join queries to fetch product metadata, attribute matrices, and live stock levels.
  * Built admin services for creating, modifying, and deactivating categories, products, and SKUs.

#### 2. User Interfaces
* **Public Catalogue & Product Pages (`client/src/pages/ProductsPage.jsx`, `ProductDetailPage.jsx`):**
  * Responsive product grid with category, price range, and attribute filtering.
  * Dynamic variant selector updating product pricing, stock availability badges, and SKU dynamically.
* **Admin Catalogue Management (`client/src/pages/AdminCataloguePage.jsx`):**
  * Management dashboard for adding products, managing variants, and uploading image URLs.

#### 3. Summary of Files Created & Modified by Member 1
| File | Type | Description |
| :--- | :--- | :--- |
| `server/db/004-catalogue.mjs` | Migration | Schema definitions for categories, products, and variants |
| `server/src/services/catalogue.js` | Business Logic | Catalogue retrieval, filtering, and admin mutation services |
| `server/src/routes/catalogue.js` | API Route | Public `/api/catalogue` browsing endpoints |
| `server/src/routes/catalogue-admin.js` | API Route | `/admin/catalogue` category and product management endpoints |
| `client/src/pages/ProductsPage.jsx` | React UI | Public product browsing with search and category filters |
| `client/src/pages/ProductDetailPage.jsx` | React UI | Variant selection and dynamic stock/pricing display |
| `client/src/pages/AdminCataloguePage.jsx` | React UI | Category and product administration interface |
| `server/test/catalogue.test.js` | Test Suite | Unit tests for catalogue filtering and retrieval logic |

---

### 👤 Member 2 — Accounts, Authentication & Cart
* **Student Name:** *[To be filled by Member 2]*
* **Feature Branch:** `feature/customers-cart`
* **SRS Requirements Owned:**
  * **R03:** Customer account registration, profile management, and secure password hashing.
  * **R04:** Persistent shopping cart with guest-to-customer cart merge on login.
  * **R05:** Multi-address management for customer delivery destinations.

#### 1. Core Architectural Deliverables
* **Account & Authentication System (`server/src/routes/auth.js`):**
  * Password hashing utilizing `bcrypt` with salt rounds.
  * JWT generation with role payloads (`customer`, `admin`) and validation middleware (`requireAuth`, `requireAdmin`).
* **Cart Persistence & Merging (`server/db/005-accounts-cart.mjs`, `014-guest-cart-merges.sql`):**
  * Persistent database carts (`carts`, `cart_items`) tied to `customer_id`.
  * Optimistic version column (`version`) on carts to detect concurrent tab updates.
  * Automated migration merging guest local storage cart items into customer cart records upon sign-in.
* **Customer Address Book (`server/src/services/addresses.js`):**
  * Multiple shipping addresses per customer linked to Texas city records.

#### 2. User Interfaces
* **Authentication Screens (`client/src/pages/LoginPage.jsx`, `RegisterPage.jsx`):**
  * Registration and login forms with client-side validation and JWT session handling.
* **Cart & Profile Pages (`client/src/pages/CartPage.jsx`, `ProfilePage.jsx`, `AddressesPage.jsx`):**
  * Interactive cart with quantity adjustments, subtotal calculations, and out-of-stock item indicators.
  * Address management interface allowing customers to add, edit, and set default shipping locations.

#### 3. Summary of Files Created & Modified by Member 2
| File | Type | Description |
| :--- | :--- | :--- |
| `server/db/005-accounts-cart.mjs` | Migration | Schema for customers, addresses, carts, and cart items |
| `server/src/services/cart.js` | Business Logic | Cart CRUD operations and guest-cart merging logic |
| `server/src/services/addresses.js` | Business Logic | Customer address book management |
| `server/src/routes/auth.js` | API Route | `/api/auth/register` and `/api/auth/login` endpoints |
| `server/src/routes/cart.js` | API Route | `/api/cart` item manipulation endpoints |
| `client/src/pages/LoginPage.jsx` | React UI | Customer and administrator authentication interface |
| `client/src/pages/CartPage.jsx` | React UI | Persistent cart view with quantity selectors |
| `client/src/pages/AddressesPage.jsx` | React UI | Customer shipping address management |
| `server/test/customers-cart.test.js` | Test Suite | Unit tests for cart additions, limits, and authentication |

---

### 💳 Member 3 — Checkout, Payments & Cancellation
* **Student Name:** *[To be filled by Member 3]*
* **Feature Branch:** `feature/checkout-payments`
* **SRS Requirements Owned:**
  * **R06:** Multi-step checkout workflow with delivery and store pickup fulfillment options.
  * **R07:** Atomic order creation and inventory decrement coordination during checkout.
  * **R10:** Payment handling supporting Card payment simulation and Cash on Delivery (COD).
  * **R11:** Order lifecycle tracking, status history, and customer order cancellation.

#### 1. Core Architectural Deliverables
* **Checkout Transaction Engine (`server/src/services/checkout.js`):**
  * Orchestrates atomic checkout execution inside MySQL transactions (`BEGIN ... COMMIT`).
  * Integrates cart validation, destination verification, stock deduction, and order record creation.
* **Idempotent Checkout Protection (`checkout_requests` table in `007-checkout-fulfilment.mjs`):**
  * Stores unique `request_key` UUIDs to prevent double billing or duplicate order placement on client retry.
* **Order Cancellation & Status Workflow (`server/src/services/cancellation.js`):**
  * Enforces cancellation policies (orders can be cancelled only before entering `shipped` or `ready_for_pickup` status).
  * Automatically coordinates inventory restock via compensating movement records upon cancellation.

#### 2. User Interfaces
* **Checkout Interface (`client/src/pages/CheckoutPage.jsx`):**
  * Fulfillment selection (Delivery vs. Store Pickup) and address/store dropdowns.
  * Payment method selector (Credit Card simulation with modal vs. Cash on Delivery).
* **Order History & Tracking (`client/src/pages/OrdersPage.jsx`, `OrderDetailPage.jsx`):**
  * Customer order tracking with visual timeline, delivery date estimations, and cancellation button.

#### 3. Summary of Files Created & Modified by Member 3
| File | Type | Description |
| :--- | :--- | :--- |
| `server/db/007-checkout-fulfilment.mjs` | Migration | Schema for orders, order items, and checkout requests |
| `server/src/services/checkout.js` | Business Logic | Atomic checkout transaction coordinator |
| `server/src/services/cancellation.js` | Business Logic | Order cancellation and restock workflow |
| `server/src/routes/checkout.js` | API Route | `/api/checkout` submission endpoint |
| `server/src/routes/orders.js` | API Route | Customer order tracking and cancellation endpoints |
| `client/src/pages/CheckoutPage.jsx` | React UI | Multi-step checkout form with payment options |
| `client/src/pages/OrderDetailPage.jsx` | React UI | Order status progression view and cancellation actions |
| `server/test/checkout.mysql.test.js` | Test Suite | Opt-in MySQL integration tests for concurrent checkouts |

---

### 🏭 Member 4 — Inventory, Fulfilment & Migration Engine
* **Student Name:** **Galagedara G.K.A.T**
* **Feature Branch:** `feature/inventory-fulfilment`
* **SRS Requirements Owned:**
  * **R01:** Central warehouse inventory management and variant stock balance tracking.
  * **R07:** Concurrency control and atomic stock decrement without overselling.
  * **R08:** Order fulfillment completion workflows for both delivery and store pickup modes.
  * **R09:** Cash on Delivery (COD) physical cash collection verification.
  * **R16:** Primary/Foreign key constraints, indexing, and ACID transaction safety.
  * **R17:** Stored procedures, triggers, and automated database-level constraint enforcement.

#### 1. Core Architectural Deliverables
* **Upgraded Database Migration Runner (`server/src/database/migrate.js`):**
  * Extended the migration engine to support both traditional `.sql` scripts and dynamic `.mjs` modules.
  * Allows execution of multi-statement stored procedures and triggers without parser errors caused by semicolon splitters.
  * Implemented version tracking in `schema_migrations` with execution timestamps.
* **Audit-Logged Inventory Engine (`server/db/006-inventory.mjs`):**
  * **`inventory_movements` Table:** Immutable audit ledger recording every inventory change (`sale`, `adjustment`, `allocation`, `cancellation`) with admin ID, timestamp, and unique `reference_key`.
  * **Stored Procedure `sp_apply_stock_change`:**
    * Acquires row-level pessimistic locks (`SELECT stock FROM variants WHERE id = ... FOR UPDATE`) to serialize updates and mitigate race conditions during high concurrency.
    * Validates non-negative stock outcomes before inserting movement records; aborts if stock is insufficient.
    * Replay-safe via unique `reference_key` checks to prevent duplicate adjustments on network retries.
  * **Trigger `trg_stock_movement_apply`:**
    * Automatically fires `AFTER INSERT` on `inventory_movements` to update `variants.stock`.
    * Validates that the resulting stock balance is non-negative; raises a `SQLSTATE '45000'` exception if an invalid state occurs.
* **Whole-Order Backorder Allocation (`server/src/services/fulfilment.js`):**
  * Enforces an all-or-nothing allocation policy: backordered orders allocate only when all line items have available stock.
  * Sorts line items in ascending order of `variant_id` (`ORDER BY variant_id ASC`) prior to lock acquisition to reduce deadlock risk during concurrent allocations.
* **Order Fulfillment Progression & COD Verification (`POST /admin/orders/:id/complete`):**
  * Manages transition through fulfillment stages (`confirmed` → `processing` → `shipped`/`ready_for_pickup` → `delivered`/`collected`).
  * Enforces fulfillment mode rules: delivery orders complete as `delivered`; store pickup orders complete as `collected`.
  * Enforces cash verification: orders marked Cash on Delivery require explicit confirmation of cash collection before completing.

#### 2. User Interfaces
* **Admin Inventory Dashboard (`client/src/pages/AdminInventoryPage.jsx`):**
  * Live stock view for all variants with low-stock warnings.
  * Manual stock adjustment modal with required reason notes and client-generated UUID idempotency keys.
  * History drawer displaying the chronological audit ledger for any variant.
* **Admin Fulfilment Dashboard (`client/src/pages/AdminFulfilmentPage.jsx`):**
  * Queue filterable by fulfillment mode, order status, and stock allocation state.
  * Dispatch actions (`Mark Processing`, `Ship`, `Ready for Pickup`, `Allocate Stock`).
  * Order completion modal with mandatory Cash on Delivery confirmation checkbox.

#### 3. Summary of Files Created & Modified by Member 4
| File | Type | Description |
| :--- | :--- | :--- |
| `server/db/006-inventory.mjs` | Migration | Schema for `inventory_movements`, procedure `sp_apply_stock_change`, trigger `trg_stock_movement_apply` |
| `server/src/database/migrate.js` | Core Runner | Migration engine supporting both `.sql` and `.mjs` modules |
| `server/src/services/inventory.js` | Business Logic | Transactional stock adjustment and movement query service |
| `server/src/services/fulfilment.js` | Business Logic | Backorder stock allocation and order dispatch workflows |
| `server/src/routes/inventory.js` | API Route | `/admin/inventory` stock inspection and adjustment endpoints |
| `server/src/routes/fulfilment.js` | API Route | `/admin/fulfilment` order allocation and completion endpoints |
| `client/src/pages/AdminInventoryPage.jsx` | React UI | Real-time stock management and audit history interface |
| `client/src/pages/AdminFulfilmentPage.jsx` | React UI | Order queue, dispatch progression, and COD confirmation modal |
| `server/test/inventory-fulfilment.test.js` | Test Suite | Unit and concurrency tests for stock adjustments and allocations |

---

### 📊 Member 5 — Locations, Delivery Days & Management Reports
* **Student Name:** *[To be filled by Member 5]*
* **Feature Branch:** `feature/locations-reports`
* **SRS Requirements Owned:**
  * **R12:** Destination management covering Texas main cities, other regional cities, and physical store locations.
  * **R13:** Deterministic delivery time calculation stored function `fn_delivery_days(is_main_city, was_out_of_stock)`.
  * **R14/R15:** Five specialized analytical management SQL reports and administrative reporting dashboard.

#### 1. Core Architectural Deliverables
* **Locations Schema & Destinations (`server/db/003-locations.mjs`):**
  * Created `cities` table with `is_main_city` classification (Houston, Dallas, Austin, San Antonio classified as main cities).
  * Created `stores` table referencing cities for customer in-store pickup options.
* **Deterministic Delivery Stored Function (`server/db/009-delivery-days.mjs`):**
  * Implemented MySQL function `fn_delivery_days(is_main_city, was_out_of_stock)`:
    * Returns **5 days** for Main Cities and **7 days** for Regional Cities.
    * Adds **+3 days** if items were out of stock (backordered) at the time of order placement.
* **Analytical Management Reports Engine (`server/src/services/reports.js`, `server/db/008-report-indexes.mjs`):**
  * Created optimized composite indexes for grouping and aggregation queries.
  * Implemented the 5 required management SQL reports:
    1. **Quarterly Sales Report:** Aggregates revenue, order volume, and average order value grouped by quarter for a given year.
    2. **Top-Selling Products:** Identifies top items by units sold and revenue within a specified date range.
    3. **Category-Wise Demand:** Groups sales volume and revenue by product categories.
    4. **Delivery Time Estimates:** Analyzes pending orders, expected delivery dates, and delayed fulfillment trends.
    5. **Customer Order Summaries:** Summarizes order frequency, total spending, and payment completion status by customer.

#### 2. User Interfaces
* **Locations Management Interface (`client/src/pages/AdminLocationsPage.jsx`):**
  * Allows administrators to configure active delivery cities and maintain physical pickup store locations.
* **Management Reports Dashboard (`client/src/pages/AdminReportsPage.jsx`):**
  * Interactive reporting view with date filters, quarterly breakdowns, and summary data tables.

#### 3. Summary of Files Created & Modified by Member 5
| File | Type | Description |
| :--- | :--- | :--- |
| `server/db/003-locations.mjs` | Migration | Schema definitions for Texas cities and pickup stores |
| `server/db/009-delivery-days.mjs` | Migration | Stored function `fn_delivery_days(is_main_city, was_out_of_stock)` |
| `server/db/008-report-indexes.mjs` | Migration | Performance indexes for quarterly and category analytical reports |
| `server/src/services/locations.js` | Business Logic | City classification and delivery estimate service |
| `server/src/services/reports.js` | Business Logic | Analytical report query generation and data formatting |
| `server/src/routes/locations.js` | API Route | `/api/locations` city and pickup store endpoints |
| `server/src/routes/reports.js` | API Route | `/admin/reports` management reporting endpoints |
| `client/src/pages/AdminLocationsPage.jsx` | React UI | Administrative management of cities and pickup stores |
| `client/src/pages/AdminReportsPage.jsx` | React UI | Visual reporting dashboard for the 5 analytical business queries |
| `server/test/delivery-days.test.js` | Test Suite | Unit tests validating deterministic outputs of `fn_delivery_days` |
| `server/test/reports.test.js` | Test Suite | Unit tests for management reporting aggregations |

---
