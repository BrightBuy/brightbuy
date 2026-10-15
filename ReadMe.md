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
   - [Ajay J — Catalogue & Product Hierarchy](#-ajay-j--catalogue--product-hierarchy)
   - [Hettiarachchi U.O. — Accounts, Authentication & Cart](#-hettiarachchi-uo--accounts-authentication--cart)
   - [Abegunawardhana A.D. — Checkout, Payments & Cancellation](#-abegunawardhana-ad--checkout-payments--cancellation)
   - [Galagedara G.K.A.T — Inventory, Fulfilment & Migration Engine](#-galagedara-gkat--inventory-fulfilment--migration-engine)
   - [Madhushani V.P.O. — Locations, Delivery Days & Management Reports](#-madhushani-vpo--locations-delivery-days--management-reports)

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

### 📦 Ajay J — Catalogue & Product Hierarchy
* **Feature Branch:** `feature/catalogue-variants`
* **Contribution:** Designed and implemented the hierarchical product catalogue schema (categories, products, attributes, variants, and image mappings). Developed backend querying and filtering services with stock availability tracking, along with public browsing pages (`ProductsPage`, `ProductDetailPage`) and the administrative catalogue management interface.

---

### 👤 Hettiarachchi U.O. — Accounts, Authentication & Cart
* **Feature Branch:** `feature/customers-cart`
* **Contribution:** Built customer authentication and account management using bcrypt password hashing and JWT sessions. Implemented persistent database shopping carts with guest-to-customer cart merging upon sign-in, and created the customer multi-address shipping book integrated with Texas city validation.

---

### 💳 Abegunawardhana A.D. — Checkout, Payments & Cancellation
* **Feature Branch:** `feature/checkout-payments`
* **Contribution:** Engineered the atomic checkout transaction coordinator ensuring inventory deductions and order creation happen ACID-compliantly without overselling. Added idempotent checkout protection (`checkout_requests`) to prevent duplicate submissions, payment simulation (Card & COD), and the customer order tracking and cancellation lifecycle with automatic inventory restock.

---

### 🏭 Galagedara G.K.A.T — Inventory, Fulfilment & Migration Engine
* **Feature Branch:** `feature/inventory-fulfilment`
* **Contribution:** Developed the database migration runner supporting procedural `.mjs` scripts. Designed the audit-logged inventory engine with pessimistic row-locking (`sp_apply_stock_change`) and balance integrity triggers (`trg_stock_movement_apply`), whole-order backorder allocation with deadlock prevention, and administrative order fulfillment progression with COD cash collection verification.

---

### 📊 Madhushani V.P.O. — Locations, Delivery Days & Management Reports
* **Feature Branch:** `feature/locations-reports`
* **Contribution:** Modeled the Texas locations database (main cities, regional cities, pickup stores) and implemented the deterministic delivery calculation stored function `fn_delivery_days`. Designed composite performance indexes and implemented the 5 analytical business management reports (Quarterly Sales, Top Products, Category Demand, Delivery Timelines, Customer Summaries) with an interactive admin dashboard.

---

### 📋 Summary Matrix of Contributions

| Contributor | Functional Area | Core Responsibilities & Deliverables | Primary Files |
| :--- | :--- | :--- | :--- |
| **Ajay J** | Catalogue & Variants | Category tree, dynamic attributes, stock display | `server/src/services/catalogue.js`, `ProductsPage.jsx` |
| **Hettiarachchi U.O.** | Auth & Cart | JWT auth, persistent cart, guest merge, address book | `server/src/routes/auth.js`, `cart.js`, `CartPage.jsx` |
| **Abegunawardhana A.D.** | Checkout & Orders | Atomic checkout, idempotency, payments, cancellation | `server/src/services/checkout.js`, `CheckoutPage.jsx` |
| **Galagedara G.K.A.T** | Inventory & Fulfilment | Movement audit ledger, row locks, backorders, migrations | `migrate.js`, `inventory.js`, `fulfilment.js` |
| **Madhushani V.P.O.** | Locations & Reports | Delivery estimation function (`fn_delivery_days`), 5 SQL reports | `locations.js`, `reports.js`, `AdminReportsPage.jsx` |

---

