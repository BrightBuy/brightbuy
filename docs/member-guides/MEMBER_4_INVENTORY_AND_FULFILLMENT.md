# Member 4 — central inventory, backorders and fulfilment

## Your outcome and boundaries

Make central warehouse stock reliable, trace every feature-time stock change, allocate whole backorders when possible, and complete delivery/pickup correctly. You also provide the small migration-runner extension needed for database routines. M1 edits catalogue metadata, M3 creates/cancels orders and owns payment logic, M5 manages locations/reports. Everyone still owns their own tests and integration work.

Read [shared workflow](00_SHARED_START_HERE.md), [alignment](02_REQUIREMENTS_AND_ER_ALIGNMENT.md) and [team contracts](01_TEAM_PLAN.md), especially sections 3,8,9. Your requirements cover R01, R07–R10 fulfilment and R16–R17 reliability. Use `feature/inventory-fulfilment`.

## 1. Existing code and proposed additions

Read `server/src/database/migrate.js`, `server/src/database/setup.js`, `server/src/db.js`, `server/src/routes/orders.js`, `shared/index.js`, and `server/test/setup.test.js`. Notice that the setup lock already exists and the current SQL runner splits statements on semicolons.

Proposed files: `server/db/006-inventory.mjs`, `server/src/routes/inventory.js`, `server/src/routes/fulfilment.js`, `server/src/services/inventory.js`, `server/src/services/fulfilment.js`, `client/src/pages/AdminInventoryPage.jsx`, `client/src/pages/AdminFulfilmentPage.jsx`, and `server/test/inventory-fulfilment.test.js`. Coordinate order_operations schema inside M3's 007 migration rather than writing conflicting ALTERs.

## 2. Milestone A — enable complete SQL routines safely

1. Preserve current `.sql` migration behavior and recorded basename versions. Add discovery of numbered `.mjs` modules exporting `up(connection)`.
2. Sort migrations deterministically and reject duplicate basename/number allocations across formats. Do not let both 003-name.sql and 003-name.mjs run as separate versions.
3. Dynamically import a module using a proper file URL, validate its export and call `up()` with the existing setup connection. Mark applied only after success.
4. A module sends each full `CREATE PROCEDURE`, `CREATE FUNCTION` or `CREATE TRIGGER` as one query string. `DELIMITER` is a command-line client instruction, not SQL for mysql2.
5. Keep named setup locking and connection cleanup. Do not add request-time migrations or a second connection pool.
6. Guard column/index/routine creation through `information_schema`, verifying existing definitions. A partly applied DDL migration may persist even if later work fails; don't mark it complete or silently ignore mismatches.
7. Add tests for old SQL files, module success, module failure/no marker, duplicate versions, partial retry, malformed exports and lock/release cleanup. Do not “fix” module failure by resetting the database.
8. Confirm procedure/function/trigger privileges on the local development database. If MySQL reports function-creation error 1419 under binary logging, coordinate a development-only `log_bin_trust_function_creators` setting with explanation; do not change application credentials to root or broadly disable security to bypass errors. Test the exact development configuration and document it.

Reserve 002 for needed bookkeeping but do not create a fake migration just to fill a gap. Merge this runner change early so M1/M2/M3/M5 can apply their modules. Provide a tiny working migration example and explain how to check applied markers.

Also coordinate the post-demo-seed compatibility hook and `.mjs` formatting exclusion in team section 3. Test the actual setup ordering: empty database → migrations → original demo seed → reconciliation → explicit project seed. The hook fills missing legacy identifiers/admin profiles only; it must not rewrite business data on each startup.

Use the official MySQL references for [routine creation and transaction restrictions](https://dev.mysql.com/doc/refman/8.4/en/create-procedure.html) and [stored-program binary logging/privileges](https://dev.mysql.com/doc/refman/8.4/en/stored-programs-logging.html). Although a procedure can contain transaction statements, this project's composable stock procedure deliberately leaves transaction control to its caller; triggers cannot provide an independent commit boundary.

## 3. Milestone B — movement schema, procedure and trigger

Create `inventory_movements` with generated ID, variant FK, optional order/admin-profile FK, signed change_qty, unsigned stock_after, movement_type, reason max 200, unique reference_key max 100 and timestamp. Index variant/time/ID. Existing balances remain a legacy starting snapshot; the history records new changes only.

Use this division to avoid double stock updates:

- Procedure `sp_apply_stock_change` validates, locks the variant, handles a repeated reference and **inserts the movement**.
- Trigger `trg_stock_movement_apply`, invoked by that insertion, is the **sole feature-time UPDATE of variant stock**.
- Express helpers call the procedure; neither helpers nor checkout directly update stock again.

### Procedure steps

1. Receive variantId, signed delta, type, nullable order/admin ID, reference key and reason. Do not start/commit/roll back a transaction internally; the caller owns it.
2. Lock the variant row with FOR UPDATE. Multi-variant callers must invoke in ascending variant ID order.
3. Look up reference key. If a prior movement has exactly the same variant/delta/type/order/admin/reason, return that movement without insertion; otherwise raise an identifiable idempotency conflict.
4. Validate nonzero integer delta and resulting range. Stock adjustment API limits magnitude to 1,000,000; sale/allocation/cancellation quantities follow order limits. Use signed arithmetic explicitly so unsigned subtraction does not overflow before your check.
5. Calculate expected stock_after from the locked row and insert the movement. Let the trigger perform the stock mutation.
6. Return the movement including original stock_after. On a later replay, stock_after is historical, not the current variant balance.

### Trigger steps

1. On movement insertion, validate required fields/type and that the expected post-balance is nonnegative and within unsigned INT range.
2. Update the matching variant with a range-checked expression based on current stock and delta, and verify the expected post-balance. If invalid/missing, SIGNAL an error so both insertion and stock change roll back.
3. Do not insert another movement in the trigger and do not add another stock-updating trigger; this would recurse or double-deduct.
4. Keep it transactional under InnoDB. Explain that application validation improves messages while the routine/trigger centralizes consistency.

The application database user may technically have direct table privileges in local development. Document that the trigger guards the **movement insertion path**, not arbitrary direct stock UPDATEs by a privileged operator. Remove stock fields from all metadata APIs, review SQL call sites and record least-privilege deployment as later hardening; do not falsely claim the trigger intercepts every conceivable privileged write.

### JavaScript wrapper

Provide `applyStockChange(connection,change)` with clear input/result/error mapping. It calls the procedure on the caller's connection and never releases/commits it. Normalize procedure result sets into one movement object. Share a working example with M3 immediately. For multi-item changes the caller prelocks/sorts all variants, then invokes the helper; rollback covers all movements.

## 4. Milestone C — inventory API and page

Implement team section 8's inventory list, stock adjustment and history routes with admin authentication. New adjustment example:

```json
{
  "quantityDelta": 10,
  "reason": "Fictional classroom restock",
  "requestKey": "33333333-3333-4333-8333-333333333333"
}
```

1. Validate exact fields, UUID, reason 1–200, signed nonzero delta/range. Map expected stock and duplicate failures into documented 409 errors.
2. Start a transaction, call procedure with reference `adjust:<requestKey>`, admin profile ID and no order. Identical retry returns 200 original movement; new insert 201.
3. Handle global unique-reference races by rolling back and comparing the committed existing operation before returning replay/conflict. Do not commit a stock change without its movement.
4. List current variants with names/SKU/stock and optional low-stock threshold. Validate threshold integer 0–1,000,000 and boolean query syntax; use parameterized queries.
5. History is admin-only, newest first with ID tie-breaker. Show nullable order/admin IDs, type/reason/time and historical balance.
6. Build `/admin/inventory`: filter, stock display, adjustment form and history. Clearly distinguish positive restock and negative correction. Generate one key per deliberate action and retain it with payload for retries.
7. Explain that pickup stores share this central stock. Do not add per-store stock tables or duplicate balances.

## 5. Milestone D — allocate backorders

Restocking and allocation are separate deliberate admin actions in this version; a successful stock adjustment does not automatically confirm every waiting order. Show oldest backorders first and the quantities still missing.

1. Implement `POST /admin/orders/:id/allocate` with `{requestKey}`.
2. Begin transaction and lock the order first. Require new-project metadata. Check operation replay before rejecting today's state; a matching successful retry returns current order.
3. Require status backordered and stock_state none. Lock all item variants ascending and check **every** quantity.
4. If any shortage remains, return 409 `INSUFFICIENT_STOCK` and change nothing. Do not create partial movements or promise confirmation.
5. If sufficient, call the stock helper for all negative quantities using `allocate:<orderId>:<variantId>` references. No earlier sale movements should exist for that order.
6. Set confirmed and stock_state allocated, insert status history and operation key/actor. Commit together.
7. Keep payment state and stored original estimate unchanged. If already overdue, tracking must say so instead of silently moving the promise.

Allocation only changes stock/order state, not card payment collection. An approved simulated card backorder was already paid under the agreed assumption; COD remains pending.

## 6. Milestone E — processing, dispatch and completion

Coordinate the lifecycle table and `shared/index.js` with M3. Extend the existing generic status endpoint for confirmed→processing and mode-specific processing→shipped/ready_for_pickup. Reject cancellation/completion through that generic endpoint and route UI actions to dedicated services.

For ordinary status updates, lock order, validate current state/mode/allocated stock and write status/history on one connection. Concurrent/stale requests return 409; no inventory deduction happens again.

For completion:

1. `POST /admin/orders/:id/complete` takes `{requestKey,cashReceived}`. Validate role and body, begin transaction, lock order first.
2. Check the stored completion operation and compare fingerprint/actor. Exact retry returns current order without another collection; changed payload with reused key conflicts.
3. Delivery requires shipped; pickup requires ready_for_pickup. Reject attempts to finish a backorder or wrong-mode state.
4. For pending COD require cashReceived true and call M3's `collectCod` on this connection. For paid card require cashReceived false and preserve its payment. Other payment states require a conflict, not forced completion.
5. Set delivered/collected, actual_date to completion's UTC date, stock_state consumed, history and operation record; commit together.
6. A failure writing cash receipt or delivery date rolls back the entire completion. No new stock decrement is performed; allocation already did it.

Build `/admin/fulfilment` with status/mode filters, shortages, payment status, and allowed next action buttons. Show an explicit cash-received confirmation for COD completion. Call M3 cancellation endpoint where cancellation is allowed; do not implement another refund/restock path.

## 7. Test matrix and SQL evidence

| Test                                            | Expected                                                        |
| ----------------------------------------------- | --------------------------------------------------------------- |
| Direct movement insert via routine              | Exactly one stock update and one movement                       |
| Same reference replay / changed input           | Original movement /409; never another change                    |
| Negative or overflowing balance                 | Transaction fails; balance/history unchanged                    |
| Two last-unit checkout requests                 | One confirmation, one backorder through M3; no negative balance |
| Failure after first of multiple stock movements | All changes roll back                                           |
| Backorder has one unavailable line              | Allocation does nothing                                         |
| Restock then allocate/retry                     | Single whole-order deduction and confirmation                   |
| Concurrent cancel versus allocate/process       | One valid serialized outcome; no double restock/deduction       |
| Wrong-mode status or terminal reversal          | 409                                                             |
| COD completion without receipt confirmation     | Rejected, no partial completion                                 |
| COD/card completion retried                     | One actual date/history/payment effect                          |
| Trigger/procedure migration retry               | Definitions preserved, no duplicate objects/markers             |
| Restart after committed movement                | Data persists                                                   |

Verify with actual MySQL, not just database doubles. Show the procedure/trigger definitions and a deliberate rollback in your presentation. Retain baseline auth/transition coverage while updating expected dedicated endpoint behavior. Explain procedure result-set mapping and parameterization in code comments.

## 8. Completion and handoff

Deliver migration support first, stock helper second, then allocation/completion. Give M1 the seed-stock call, M3 the no-commit helper/error contract, M5 history/status/completion fields and fixture cases. Each PR includes new SQL objects, schema guards, real-database test evidence and a short reproducible demo.

- [ ] Existing SQL migrations still work; routine modules install/retry correctly.
- [ ] One stock-update path prevents duplicate deduction and records every new change.
- [ ] Inventory UI handles adjustments/history/low stock with admin security.
- [ ] Allocation is whole-order, atomic and replay-safe.
- [ ] Fulfilment uses correct mode/state; COD collection and actual date commit together.
- [ ] Legacy records are not given invented stock/payment history.
- [ ] Concurrency, rollback, persistence and routine evidence are reviewed.

Explain why a procedure has no COMMIT when called by checkout, why stock should not change twice on confirmation, and why a trigger does not by itself supply the full ACID guarantees.
