# System Alignment & Fix Tracker

> **Purpose:** Persistent memory list to track progress on the system-doc → architecture → code
> alignment effort. Source of truth: `backend/docs/PROJECT_BLUEPRINT.md` +
> `frontend/docs/My_System_Nature.md`. Every fix here must bring **backend AND frontend**
> capabilities back in line with the intended system design.
>
> **Rule:** Update this file's checkboxes as we complete work. Do not let it go stale.

---

## Phase 0 — One backend, one truth *(NEW — see `SYSTEM_DIAGNOSIS_AND_POLISH_PLAN.md`)*

> Diagnosis run 2026-10-15: `tools/mock-api-harness` drove the real
> `/api/[...slug]` handler through 44 real-life checks → **11 PASS, 31 FAIL**.
> Full findings + phased polish plan in **`SYSTEM_DIAGNOSIS_AND_POLISH_PLAN.md`**.
> Phase 0 blocks every other phase: with `USE_REMOTE_BACKEND` unset the app runs
> on the non-persistent in-memory mock, so the real backend is never exercised.

- [ ] **P0-1** Make the NestJS/Prisma backend the only runtime
      (`USE_REMOTE_BACKEND=true`, `BACKEND_URL` set).
- [ ] **P0-2** Gate the mock behind `ENABLE_MOCK_API=true` and make its
      catch-all return **501** (today `POST .../reconciliation/confirm` returns
      `201 Created` while changing nothing).
- [ ] **P0-3** Run the real backend end-to-end against Postgres and re-run the
      harness against it.
- [ ] **P0-4** Delete `frontend/src/app/api/[...slug]/route.ts`.
- [ ] **P0-5** **Cost price is dropped by the real backend** (`Product` has no
      `costPrice`; `CreateProductDto`/`UpdateProductDto` lack it; no
      `ProductCostHistory` write path) ⇒ COGS 0 ⇒ every period reports ~100%
      margin. This is the highest-severity correctness bug found.
- [ ] **P0-6** Fix tenant isolation: `GET /products` is readable with no header,
      `GET /shift-stock-items` ignores the business, and several services
      `update`/`delete` by id without a business check.
- [ ] **P0-7** Remove `Math.max(0, …)` from reconciliation: it currently turns a
      real shortage into a **false clean** variance of 0.

---

## Phase 1 — Unblock the UI (highest impact, smallest, safe)

Goal: stop the `"property X should not exist"` failures and make owner CRUD forms work.

- [x] **P1-1 Backend:** Fix global validation pipe. `main.ts` uses Nest `ValidationPipe`
      (`class-validator`) but all DTOs use `createZodDto` (`nestjs-zod`). Switched to
      `ZodValidationPipe`. — _DONE, consumer-tested._
- [x] **P1-2 Backend:** Extend `User` model per `USERS_ARCHITECTURE`: added `branchId`,
      `phone`, `email`, `status`. Updated `CreateUserDto` + `UpdateUserDto` to accept
      `phone`, `password`, `role`, `status`. Migration added. — _DONE._
- [x] **P1-3 Backend:** `users.controller.getAll()` now filters by `businessId` query
      (was returning all users across every business). — _DONE._
- [x] **P1-4 Frontend:** Align Owner Management forms to the fixed backend contract —
      payloads (name/phone/role/password/businessId) match the new DTO; users list
      refreshes per selected business. — _DONE._
- [x] **P1-5 Frontend:** Stock page — Add Location folded **inside** Add Product (was
      independent + wrong); fields reconciled to `CreateStockLocationDto`. — _DONE._
- [x] **P1-6 Verify:** build + test the 4 forms (Business, User, Product, Stock Location)
      end-to-end. — _DONE: consumer confirmed success._

---

## Phase 2 — Close model/architecture drift (needs product decisions)

Design decisions that change data model + semantics. Each needs explicit sign-off.

- [x] **P2-1 StockLocation:** confirm `businessId` + `status` (+ `description`) per
      `STOCK-LOCATION_ARCHITECTURE`. Locations belong to Business, not Branch.
      Migration completed.
- [x] **P2-2 Shift price/cost fidelity:** **DECIDED** — ShiftStockItem includes `revenue`,
      `cost`, `grossProfit`, `addedQuantity`, `soldQuantity`. Values are system-calculated
      at shift close per blueprint immutability + "profit from recorded events" principle.
- [ ] **P2-3 Multi-business ownership:** **Decision required.** Options: - Join table `UserBusiness` (one owner, many businesses) - Per-business user records - Current assumption: one user belongs to one business only
- [x] **P2-4 Discrepancy model:** expanded backend to include financial discrepancy types
      (`CASH_SHORTAGE`, `MPESA_MISMATCH`, `TRANSFER_MISMATCH`) with `expectedValue`,
      `actualValue`, `valueVariance` fields — not just quantity-only.
- [x] **P2-5 Mpesa Account:** added `branchId` + `accountType` (PAYBILL, POCHI,
      BUY_GOODS_AND_SERVICES, SEND_MONEY) to match frontend architecture.
- [x] **P2-6 Mpesa Transaction:** added `branchId`, `transactionType`, `sender`, `receiver`,
      `reconciliationStatus`; renamed `externalTransactionId` → `transactionReference`.
- [x] **P2-7 Product Unit:** added `conversionFactor` field (e.g., 1 crate = 24 bottles).
- [x] **P2-8 Transfer:** added `senderLocationId` + `receiverLocationId` to track
      location-level transfers within/across branches.
- [x] **P2-9 Expense model:** removed approval gate. Expenses are immediately `RECORDED`
      and affect financial calculations. Owner `acknowledge` is read-only confirmation.
      Status enum: `RECORDED` → `ACKNOWLEDGED`.

---

## Phase 3 — Enforce accountability (toward production)

Only when you're ready to stop allowing any-user access.

- [ ] **P3-1 Backend security:** re-enable Authentication module + JWT guards on operational
      controllers; scope reads/writes by `businessId` from the token.
- [ ] **P3-2 Backend:** per-business filtering on `/reports/*` + operational reads.
      Stock locations are business-level; branches remain operational context.
- [ ] **P3-3 Frontend:** role-based route guards (workers blocked from `/owner/*`).

---

## Phase 4 — Guardrails & docs

- [ ] **P4-1** Add unit/integration/API tests for lifecycle transitions (your docs require
      this).
- [x] **P4-2** Update `PROJECT_BLUEPRINT.md` — remove `Manager` role to match
      `My_System_Nature.md` (Owner + Worker only). ~~Done.~~

---

## Design Decisions Log

| Decision                  | Outcome                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Roles                     | Owner + Worker only. No Manager. Owner performs management functions.                                                       |
| Discrepancies             | Quantity AND financial (cash, Mpesa, transfer mismatches).                                                                  |
| Mpesa account ownership   | Branch-specific. Each branch has its own Mpesa accounts.                                                                    |
| Mpesa transaction details | Capture sender phone, receiver phone, transaction type.                                                                     |
| Product units             | Convertible units supported (e.g., 1 crate = 24 bottles).                                                                   |
| Shift stock items         | Quantities + financial values (revenue, cost, gross profit).                                                                |
| Inventory uniqueness      | `[productId, productUnitId, stockLocationId]` — same product/unit can exist at different locations.                         |
| Stock location ownership  | Business-level (shared across branches), not branch-level.                                                                  |
| User record fields        | `branchId`, `phone`, `email`, `status` included.                                                                            |
| Transfers                 | Track both branch and location (`senderLocationId`, `receiverLocationId`).                                                  |
| Expense approval          | Automatically valid on record. Owner acknowledgment = read confirmation only.                                               |
| Stock location docs       | Kept `STOCK-LOCATIONS_DESIGN_ARCHITECTURE.md` (business-level); deleted duplicate `STOCK_LOCATIONS_DESIGN_ARCHITECTURE.md`. |

---

## Notes

- **Auth disabled** (on purpose) for any-user testing. See Phase 3 to restore.
- **CORS:** currently wide-open for testing. Tighten to your specific Vercel domain(s) at
  production.
- Last audit performed: system-docs vs architecture vs current code (see conversation).

_Authoritative: 2 source-of-truth docs. Everything else (architecture, code) must adjust to
them — not the other way around._
