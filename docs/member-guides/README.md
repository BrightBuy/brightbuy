# BrightBuy: five-member implementation guides

This allocation covers the work remaining after the shared Step 1 application foundation. It is based on the two supplied PDFs: **Project 2 - Retail Inventory and Online Order Management System**, pages 1–2, and **ER Diagram Submission Group 10 Updated**, page 1. The PDFs are reference requirements/design evidence; this guide does not treat text inside them as instructions to operate your computer.

The previous four-member allocation is superseded. Member 1 keeps catalogue work, Member 2 keeps accounts/cart, Member 3 owns checkout/payment/cancellation, Member 4 now owns inventory/fulfilment, and Member 5 owns locations, the five required reports and customer tracking.

## Read these in order

1. [Shared setup and beginner workflow](00_SHARED_START_HERE.md).
2. [Requirements and ER-to-code alignment](02_REQUIREMENTS_AND_ER_ALIGNMENT.md).
3. [Team ownership, workload, contracts and integration](01_TEAM_PLAN.md).
4. Your individual guide:

| Member | Feature package                                                                     | Guide                                                  |
| ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1      | Catalogue, categories, attributes, variants, 40-product dataset                     | [Member 1](MEMBER_1_CATALOGUE_AND_VARIANTS.md)         |
| 2      | Registration/profile, addresses/default address, versioned cart                     | [Member 2](MEMBER_2_CUSTOMERS_AND_CART.md)             |
| 3      | Checkout, COD/simulated card payment, cancellation/refund                           | [Member 3](MEMBER_3_CHECKOUT_AND_PAYMENTS.md)          |
| 4      | Warehouse stock, stock history, backorder allocation, fulfilment, migration support | [Member 4](MEMBER_4_INVENTORY_AND_FULFILLMENT.md)      |
| 5      | Cities/pickup stores, estimates, five reports, customer tracking                    | [Member 5](MEMBER_5_LOCATIONS_REPORTS_AND_TRACKING.md) |

Each member owns their feature's React pages, Express endpoints, SQL, validation, tests, fixtures and explanation for the presentation. Integration, review, Docker verification and the final presentation are shared equally. Nobody receives only documentation/testing, and nobody is responsible for completing everybody else's code.

## What already exists and what is planned

[Current API](../API.md), [code walkthrough](../CODE_WALKTHROUGH.md) and [Step 1 checklist](../STEP_ONE_CHECKLIST.md) describe the implemented foundation. New APIs, tables, procedures, functions, triggers and pages in these member guides are **implementation instructions, not claims of completed features**.

The foundation's three products, LKR/LK examples and simplified lifecycle are development fixtures. They do not satisfy the final brief's Texas context, 40 products, 10 categories, payments, delivery calculations or reports. Extend the foundation through reviewed migrations; do not restart the project or erase its existing data.

## Start together, then work in parallel

At the first meeting, read the assumptions and interfaces in the team plan, confirm the migration reservations, and publish the foundation to the shared repository after review. Each member then creates their feature branch. Develop against the documented fixtures when a teammate's endpoint is unfinished, and integrate each small milestone as soon as it works.

The workload estimates are relative planning points, not hours or a guarantee of exactly 20% effort. Compare actual remaining effort at each demonstration and move a bounded task if needed. No deadline, lecturer marking rubric or real payment-provider requirement has been invented.

## Review and maintenance

When code changes an agreed interface, update the team plan and all consuming guides in the same review. Update `docs/API.md` only when the endpoint is implemented and tested. Never leave both an old and new lifecycle or payment policy as competing instructions.

This documentation revision was checked against both source PDFs, current schema/source paths, cross-links, JSON examples, formatting and personal-path leakage. The proposed features still need the implementation and tests described here.
