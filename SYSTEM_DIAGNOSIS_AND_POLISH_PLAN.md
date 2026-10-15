# System Diagnosis & Polish Plan

> **Status:** diagnosis complete, plan proposed (nothing in the product code changed yet)
> **Date:** 2026-10-15
> **Sources of truth read:** `frontend/docs/My_System_Nature.md`,
> `backend/docs/PROJECT_BLUEPRINT.md`, `frontend/docs/FRONTEND_IMPLIMENTATION.md`,
> `SYSTEM_ALIGNMENT_TODO.md`, `backend/prisma/schema.prisma`, and the full
> backend `src/` + frontend `src/` trees.
> **Evidence:** `tools/mock-api-harness/` — a runnable harness that drives the
> **real** `/api/[...slug]` handler. Output in `tools/mock-api-harness/last-run.txt`.
> **Result:** **44 checks — 11 PASS, 31 FAIL, 2 NOTE.**

---

## 0. How this was tested (and why it is trustworthy)

`frontend/next.config.ts` only proxies to the NestJS backend when
`USE_REMOTE_BACKEND === "true"`. Unset — as it is in this repo — **every
`/api/*` call is answered by the in-memory handler in
`frontend/src/app/api/[...slug]/route.ts`.** That handler, not the NestJS
server, is what a deployed user actually talks to.

So the harness:

1. copies that handler verbatim (`route.ts`),
2. shims `next/server` (the handler only needs `NextResponse.json`),
3. runs real-life scenarios through it with the exact payloads the UI sends,
4. and separately records where the **NestJS/Prisma backend would behave
   differently**, since that divergence is itself the defect.

The NestJS backend could not be booted here (no Postgres, no Docker, no
`node_modules`), so backend-side findings are static-but-exact: they cite the
schema line or DTO that causes them.

**The single most important diagnosis:** the project has **two different
backends with two different data models**, and the one that runs is the
undocumented, non-persistent one. Everything else on this list is downstream of
that.

---

## 1. Executive summary

The *thinking* in `My_System_Nature.md` is sound and the NestJS backend is
substantially built. The system still does not deliver its core promise —
"the owner sees the truth of the business" — because:

| # | Crack | Consequence in real life |
|---|-------|--------------------------|
| **C1** | Cost price is never stored on the real backend | Every period reports ~100% margin. Profit is fictional. |
| **C2** | The app runs on an in-memory mock, not the real backend | Data vanishes on redeploy; owner and worker can see different realities. |
| **C3** | The mock's data model ≠ the Prisma model | The Discrepancies screen renders `undefined` against the real backend. |
| **C4** | The owner can never confirm a period | The accountability loop that *is* the product cannot be closed. |
| **C5** | Bad counts are clamped, producing **false clean** reconciliations | A worker short by KES 1,200 is shown as perfectly balanced. |
| **C6** | Branch-scoped stock edits hit the wrong branch | Owner edits Rooftop, changes Main Bar's stock. |
| **C7** | Tenant isolation is absent | Any caller reads any business; unauthenticated `GET /products` returns everything. |

---

## 2. Cracks — things that are wrong or produce untrustworthy output

### C1. Cost price is silently discarded → profit is fiction (severity: critical)

**Observed:** `S1.3`, `S4.4`, `S6.1`.

`Product` has **no `costPrice` column**:

```prisma
model Product {
  id, name, sellingPrice, createdAt, updatedAt, businessId, stockLocationId
}
```

Cost lives only in `ProductCostHistory`. But:

- `AddProductForm.tsx` posts `costPrice` to `POST /products`; `CreateProductSchema`
  has no such key, and `nestjs-zod` strips unknown keys **silently** — no 400.
- `EditProductModal` PATCHes `costPrice`; `UpdateProductSchema` has the same gap.
- Nothing in `frontend/src` ever writes a `ProductCostHistory` row.

**Live proof:** the mock *does* store cost, so the demo looked right —
`expectedCost 3240`, `expectedProfit 1260`. On the real backend the same period
yields `cost 0`, `profit 4500` (the entire revenue booked as profit).

**Why it matters:** this is the number the owner is making decisions with.
`shifts.service.ts` reads `costHistory[0].costPrice` and falls back to `0`.

**Fix:** decide where cost lives (recommendation: `ProductCostHistory` is
correct — it is the auditable one) and then make the write path real:
- `POST /products` accepts `costPrice` and creates the first
  `ProductCostHistory` row in the same transaction.
- `PATCH /products/:id` with `costPrice` **appends** a new cost-history row
  (never overwrites history) and returns the effective cost.
- The products list exposes `currentCost` (latest history row) so the table can
  show it.
- Cost must never be defaulted to `price * 0.7`. If no cost exists, profit is
  reported as **unknown/partial**, not as 100% margin.

### C2. Two backends, and the running one is not persistent (severity: critical)

**Observed:** `S10.1`, `S7.6`.

```ts
const globalStore: CleanStore =
  (globalThis as any).__bms_clean_store || new CleanStore();
```

All businesses, users, stock, shifts and reconciliations live in one Node
process's memory. Consequences:

- A redeploy, a cold start, or a second serverless instance **starts empty**.
- Two instances = two divergent realities for the same business.
- The schema, migrations, DTO validation and reconciliation logic that were
  carefully built are **never executed** in the deployed app.

**Fix:** choose one. Recommendation — make the real backend the only backend:
1. Set `USE_REMOTE_BACKEND=true` and `BACKEND_URL` in the deployment env.
2. Move the in-memory handler behind an explicit `ENABLE_MOCK_API=true` flag so
   it cannot be reached by accident, and label it "local demo only".
3. Delete the mock once the real backend passes the harness (see §5, Phase 0).

### C3. Contract drift between the mock and Prisma (severity: high)

**Observed:** `S10.2`, `S10.3`.

| Concept | Mock / UI | Prisma |
|---|---|---|
| Discrepancy variance | `valueVariance` | `variance` |
| Discrepancy note | `notes` | `description` |
| Product cost | `costPrice` (exists) | *no column* |
| Cash overage | `CASH_OVERAGE` | *not in enum* |
| Inventory unit | *(absent)* | `productUnitId` (required) |

`DiscrepanciesTab.tsx` types `valueVariance`/`notes` and renders them, so against
the real backend **every variance shows as `undefined`** — the owner's core
"what's wrong" screen is blank.

**Fix:** single typed contract. Generate the frontend types from the backend
(`@nestjs/swagger` is already a dependency → `openapi-typescript`) and add a
contract test that fails the build when a field the UI reads disappears.

### C4. The accountability loop cannot be closed (severity: critical)

**Observed:** `S5.1`, `S5.2`.

`POST /shifts/:id/reconciliation/confirm` falls through the mock's
`if`-chain to the generic catch-all and returns:

```json
HTTP 201  { "message": "Created", "path": "shifts/.../reconciliation/confirm" }
```

Status before = `AWAITING_OWNER`, status after = `AWAITING_OWNER`. The endpoint
**reports success while doing nothing** — the worst failure mode.

There is also **no owner screen** to review a period. `OwnerWorkspace` has six
tabs (dashboard, reports, stock, payments, discrepancies, management) and none
reconciles. `ResultScreen` tells the worker "sent for owner review", and the
backend implements full confirm/dispute — but the owner has nowhere to do it.

**Fix:**
1. Implement `GET/POST /shifts/:id/reconciliation(/confirm|/dispute)` in the
   single chosen backend (the real one already has it).
2. Add an **owner "Reconciliations" tab**: list of periods by status
   (`AWAITING_OWNER`, `CONFIRMED`, `DISPUTED`), each opening the `getView`
   payload (stock table + money table + variance) with Confirm / Dispute.
3. Make the mock catch-all **fail loudly** (`501 Not Implemented`) instead of
   returning 201, so a missing endpoint can never masquerade as success.

### C5. Clamping creates *false clean* reconciliations (severity: critical)

**Observed:** `S8.1`, `S8.2`.

Real scenario: opening 24, owner delivers 10 mid-period, worker counts 30.

- True movement: `24 + 10 - 30 = +4 sold` (KES 1,200).
- The period never learned about the delivery, so it computes `24 + 0 - 30 = -6`.
- The mock then does `Math.max(0, ...)` → `sold = 0` → `expectedRevenue = 0` →
  `variance = 0` → **no discrepancy raised.**

The owner is shown a perfectly balanced period while KES 1,200 is unaccounted
for. The real backend instead keeps `-6` and reports negative revenue — also
wrong, differently.

**Fix:**
1. Never clamp. A negative `sold` is a **signal**, not a rounding error.
2. When `sold < 0` or `closing > opening + added`, raise
   `STOCK_SHORTAGE`/`UNCONFIRMED_ADDITION` and surface it on the owner screen
   instead of silently absorbing it.
3. Attribute mid-period stock changes to the open period (see C6/P3) so the
   arithmetic is correct in the first place.

### C6. Branch-scoped stock edits land on the wrong branch (severity: high)

**Observed:** `S3.1`, `S3.2`.

- The mock's `PUT /inventory-items/level` looks up
  `find(i => i.productId === body.productId)` — **`branchId` is ignored
  entirely**, so editing Rooftop's stock overwrote Main Bar's row.
- The real backend does honour `branchId`, but `StockTab.tsx` never sends one,
  so it falls back to `branch = findFirst({ orderBy: createdAt: 'asc' })` — the
  owner's edits **always** go to the first branch they ever created.

**Fix:** make branch an explicit, required part of every stock operation.
- `StockTab` gets a branch selector (default: current branch, remembered).
- `SetInventoryLevelDto` keeps `branchId` but the service must **reject** an
  ambiguous request (multiple branches + no `branchId`) rather than guessing.
- Owner stock list must be grouped/labelled by branch.

### C7. Tenant isolation is effectively absent (severity: critical)

**Observed:** `S7.1`, `S7.2`, `S7.5`.

- `GET /products` with **no** header/token returned another business's product.
- `GET /shift-stock-items` ignores the business header completely and returns
  other tenants' rows. (`/inventory-items` and `/shifts` are correctly scoped —
  so this is inconsistency, not a design choice.)
- On the real backend, `businessId` comes from the **client-supplied**
  `x-business-id` header, which `api.ts` fills from `localStorage`. Any caller
  can read or write any tenant by editing one header.
- Several services `update`/`delete` by `id` alone with **no business re-check**:
  `products`, `stock-locations`, `expenses`, `shifts`, `stock-movements`,
  `product-units`, `product-cost-history`. `UpdateProductDto` even accepts
  `businessId`, so a product can be **moved into another tenant**.

**Fix:**
1. Every read filters by `businessId`; every write re-asserts ownership
   (the `inventory-items.assertOwned` pattern already exists — make it the rule).
2. Remove `businessId` from all update DTOs.
3. Restore auth (Phase 3 in `SYSTEM_ALIGNMENT_TODO.md`): derive `businessId`
   from the JWT, not the header, and scope every query by it.

### C8. Declarations are not idempotent; variance semantics differ per runtime (severity: high)

**Observed:** `S4.6`, `S4.7`.

Re-submitting the same period three times produced **three** discrepancy rows for
one event (mock). The real backend de-duplicates with numbered
`sourceReference`s — so the guard exists in one runtime and not the other.

Worse, the two runtimes **disagree on what an over-declaration is**: the mock
records `CASH_OVERAGE` (a type that does not exist in the Prisma enum), the real
backend deliberately records nothing. Same real event → different records
depending on deployment.

**Fix:** one reconciliation service, one rule set. Re-declaring before owner
confirmation should **replace** the period's figures (or be rejected with a clear
409), and the variance taxonomy must be a single enum shared by schema and code.

### C9. The owner's chosen adjustment reason is thrown away (severity: medium)

**Observed:** `S2.6`.

`SetLevelModal` renders a reason selector
(`PHYSICAL_COUNT | RESTOCK | BREAKAGE | CORRECTION`) and `StockTab` sends it.
`StockMovement` has **no `reason` column** and `SetInventoryLevelDto` has **no
`reason` field** — zod strips it. The audit row the owner thinks they wrote is
generic. (`S2.5` also notes there is no UI at all for the audit trail that *is*
recorded.)

**Fix:** add `reason` (+ optional free-text `note`) to `StockMovement` and the
DTO, and build a read-only "Stock movements" ledger view for the owner.

### C10. Shrinkage is valued at retail, not at cost (severity: medium)

**Observed:** `S2.3` — a stocktake from 48 → 40 raised
`expectedValue: 12000, actualValue: 10000, valueVariance: -2000`
(i.e. 8 units × **selling** price 250).

A write-off costs the owner the **cost** of the goods, not the retail value of
the lost sale. Booking it at retail overstates loss and distorts the
discrepancy totals the owner acts on.

**Fix:** value quantity discrepancies at the effective `ProductCostHistory`
cost; keep revenue-at-risk as a separate, clearly labelled field if it is
wanted. Also decide the rule the two runtimes disagree on today: the mock raises
a `STOCK_SHORTAGE` on an owner stock edit, the real backend raises nothing —
pick one and document it.

### C11. Two owner screens show two different profits (severity: high)

**Observed:** `S6.1`, `S6.2`. Live payload:

```json
{ "revenue": 4500, "totalCost": 3240, "expenses": 300,
  "net": 4200, "netProfit": 960 }
```

- `DashboardTab` renders `summary.net ?? summary.netProfit` → **4,200**
- `ReportsTab` renders `data.netProfit ?? data.net` → **960**

Both are labelled "profit". The dashboard's number ignores cost of goods
entirely.

**Fix:** one canonical `profit` figure. The backend should return a single
`netProfit` (revenue − COGS − expenses) plus explicit components, and both
screens must render that same field. Remove the `net` alias.

### C12. Unreviewed and disputed periods count as final revenue (severity: high)

**Observed:** `S6.3`.

`GET /reports/summary` sums **every** shift that has any reconciliation row,
without checking `status`. A period the owner never confirmed — or actively
disputed — is reported as realised revenue and profit.

**Fix:** report only `CONFIRMED` periods in final figures; show
`AWAITING_OWNER`/`DISPUTED` amounts in a separate "provisional" bucket so the
owner can see what is pending. This is also the honest reading of
`My_System_Nature.md`: the owner *confirms* reality before it becomes the
business's record.

---

## 3. Incompleteness — flows the documents require that the system cannot perform

| # | Missing | Documented in | Evidence |
|---|---------|---------------|----------|
| **I1** | Owner reconciliation review / confirm / dispute screen | My_System_Nature (Close Shift → Reconcile → Owner Receives Information) | `S5.2` |
| **I2** | Stock transfers — no UI, and `GET /transfers` returns `[]` | My_System_Nature (during-shift "Stock transfers"), full `TRANSFERS_ARCHITECTURE.md` + backend lifecycle | `S9.1`, `S9.2` |
| **I3** | Product units & conversion factors — no UI, no DTO field | `P2-7` in `SYSTEM_ALIGNMENT_TODO.md`; "1 crate = 24 bottles" | `S9.3` |
| **I4** | Product cost history — no write path from the UI | `PRODUCT-COST-HISTORY_ARCHITECTURE.md` | `S9.4` |
| **I5** | Stock movement / audit ledger screen | My_System_Nature ("changes need to become traceable records") | `S2.5` |
| **I6** | Offline capability (worker counts stock on a phone) | My_System_Nature ("Offline operation is preferred") | `S9.7` |
| **I7** | Date / branch / product filters on reports | `ReportFilterDto` exists and is unused | `S6.4` |
| **I8** | Undo / reverse / bulk reset of stock levels | My_System_Nature (owner manages; truth over convenience) | `S2.5` |
| **I9** | Owner-side expense entry/visibility (owner can only see worker-recorded expenses) | My_System_Nature (Owner performs management actions) | owner tabs have no Expenses screen |
| **I10** | M-Pesa accounts / transactions / per-channel attribution | My_System_Nature (Paybill, Pochi, Send Money, Buy Goods) and `MPESA-ACCOUNTS.md`, `MPESA-TRANSACTIONS_ARCHITECTURE.md` exist, but **only `mpesa-period-balances` exists in `backend/src`** | `ls backend/src` |
| **I11** | Worker period selection is arbitrary | — | `S9.6`: `useShift` takes `shifts[0]` from an **unsorted** `findMany` |
| **I12** | Worker opening screen leaks other branches' stock | — | `S9.5`: branch-filtered `rows` computed but `inventory.data!.map(...)` rendered |

**Note on I10:** this is not simply "unbuilt" — it is a *contradiction*. The
blueprint documents a rich M-Pesa model; the schema deliberately replaced it
with a single opening/closing balance pair ("v1 source of truth"), and
`My_System_Nature.md` was never updated. Per the project's own rule
("documentation becomes the authority"), one of the two must change. Decide,
then align docs, schema and UI.

---

## 4. Poor setups — structural things that will keep producing bugs

### P1. Two implementations of every feature, and they are already out of sync
Every endpoint must be written twice (mock + NestJS) and the mock is what users
hit. C3, C8 and C10 are all direct consequences. This is the root cause, not a
symptom. **Fix first.**

### P2. Tests cannot run and assert almost nothing
- `backend/test/system-reality.test.ts` asserts only that a product and a shift
  exist: `expect(products.length).toBeGreaterThan(0)`.
- There is no test for the lifecycle transitions the docs call mandatory
  ("Transitions must never be skipped"), and `P4-1` is still unchecked.
- The suite needs Postgres, which no one has locally, so it is skipped.
**Fix:** the harness in `tools/mock-api-harness/` is a starting point — turn it
into a CI job; add a Postgres service container (or `prisma` + `pg-mem`) so the
real service tests actually run.

### P3. Mid-period stock changes are not attributed to the period
`PUT /inventory-items/level` is not shift-aware (C5, C6). The worker's
`ClosingScreen` has a manual "Added during period" box as a workaround — which
is exactly the kind of manual bookkeeping the system exists to remove, and it is
easy to forget (as scenario S8 shows).

### P4. Auth is disabled *and* the code pretends it is not
`My_System_Nature.md` gives Owner and Worker different powers; there is no auth
module in `backend/src` at all (`ls src` — no `auth/`), yet `package.json`
carries `passport`, `passport-jwt`, `@nestjs/jwt`, `bcrypt` and `better-auth`.
Four auth libraries, zero enforcement. `P3-1`/`P3-3` unchecked.
**Fix:** implement one (JWT + bcrypt guard is the smallest) and delete the rest.

### P5. Validation library ambiguity already caused one bug
`P1-1` records that the global pipe was `class-validator`'s while every DTO used
`createZodDto` — every owner form failed. Both libraries are still dependencies,
so the trap is still armed. **Fix:** keep `nestjs-zod`, remove
`class-validator`/`class-transformer` from `package.json`.

### P6. Silent-drop validation
zod strips unknown keys by default, which is why C1 and C9 produced **no error
at all**. Use `.strict()` on request schemas so a field the UI sends and the API
does not accept is a loud 400, not a silent data loss.

### P7. Documentation sprawl and a stale tracker
`My_System_Nature.md`, `FRONTEND_IMPLIMENTATION.md`, `PROJECT_BLUEPRINT.md`,
`SYSTEM_ALIGNMENT_TODO.md`, `BACKEND_IMPLEMENTATION.md`, `AI_CONTEXT.md`,
`ENTITY_GRAPH.md`, `CLAUDE.md`, `AGENTS.md`, ~30 architecture docs, plus stray
`diag2/3/4.txt`, `probe.txt`, `tsc_errors.txt`, `build_log.txt` committed to the
repo. `SYSTEM_ALIGNMENT_TODO.md` is the declared tracker but `P2-3`
(multi-business ownership) is still undecided while the code already has
`UserBusiness` and `transfers.service.assertUserInBusiness` depends on it.
**Fix:** one tracker, keep it current, delete scratch files, and resolve the open
decisions in writing before coding them.

---

## 5. The owner's specific question: "what happens when I reset or edit stock levels?"

**Today, in the running app (measured, scenarios S2/S3/S8):**

| What the owner does | What actually happens |
|---|---|
| Adds a product with a cost price | Cost is kept by the mock, **dropped** by the real backend (C1) |
| Sets opening stock 48 (`RESTOCK`) | Works; writes an audit row; no discrepancy ✅ |
| Recounts and finds 40 (`PHYSICAL_COUNT`) | Level set to 40; a `STOCK_SHORTAGE` of **KES 2,000 at retail** is raised (C10); the real backend raises nothing |
| Resets to 0 (`CORRECTION`) | Works ✅ |
| Edits stock for a second branch | Mock: silently edits the **first** branch's row. Real backend: silently edits the **first** branch. (C6) |
| Picks a reason | Reason is discarded by the real backend (C9) |
| Looks for what they changed earlier | No screen exists; the audit rows are recorded but unreadable (I5) |
| Wants to undo a mistake | No reverse/bulk-reset endpoint (I8) |
| Edits stock while a shift is open | Allowed, unattributed, and it silently corrupts that period's arithmetic (C5/P3) |
| Wants a stocktake across all products | No bulk entry; one product at a time |

**What it should be (target behaviour):**

1. **Every stock change is an event, never an overwrite.** The UI writes
   `{productId, branchId, productUnitId, newQuantity, reason, note?}`; the API
   computes the delta, writes an immutable `StockMovement` with the reason and
   the acting user, and updates the level in one transaction.
2. **Reasons are real.** `PHYSICAL_COUNT` (stocktake), `RESTOCK` (delivery),
   `BREAKAGE`, `CORRECTION`, `TRANSFER_IN/OUT` — stored, displayed, filterable.
3. **A stocktake is not a shortage by default.** It produces an *adjustment*; a
   shortage discrepancy is raised only when the owner confirms the difference is
   a loss — and then it is valued at **cost**, not retail.
4. **Branch is explicit.** A branch selector on the Stock screen; the API
   rejects an ambiguous multi-branch write instead of guessing.
5. **Bulk stocktake.** One screen, all products for the branch, enter counts,
   submit once.
6. **Open periods are protected.** Editing a product that belongs to an open
   period either (a) records the change as `addedQuantity` on that period, or
   (b) is blocked with a clear message. No silent corruption.
7. **History is visible.** A "Stock movements" ledger (date, product, delta,
   reason, user, resulting level, linked period) with the ability to open the
   period it belongs to.
8. **Corrections are corrections.** Reversing a mistaken entry creates a
   compensating movement with a reason — the original is never deleted, so the
   record stays truthful.

---

## 6. Polish plan

Ordered by dependency, not by effort. Each phase has an exit test. Phases 0–2
make the numbers trustworthy; 3–4 close the documented loop; 5–6 are the polish.

### Phase 0 — One backend, one truth *(blocks everything else)*
- [ ] **0.1** Pick the real NestJS/Prisma backend as the only runtime. Set
      `USE_REMOTE_BACKEND=true` + `BACKEND_URL` in the deployment env.
- [ ] **0.2** Gate the in-memory handler behind `ENABLE_MOCK_API=true`, relabel
      it "local demo only", and make its catch-all return **501** (C4).
- [ ] **0.3** Prove the real backend runs the full loop: stand up Postgres
      (`docker-compose.yml` already exists), `prisma migrate deploy`,
      `prisma db seed`, then run the harness against it.
- [ ] **0.4** Delete `frontend/src/app/api/[...slug]/route.ts` once (0.3) is green.
- **Exit test:** the 44 harness checks run against the NestJS backend and the
  mock file no longer exists.

### Phase 1 — Make the money true
- [ ] **1.1** `POST /products` accepts `costPrice` → creates the first
      `ProductCostHistory` row in the same transaction (C1, I4).
- [ ] **1.2** `PATCH /products/:id` with `costPrice` **appends** a cost-history
      row; `GET /products` exposes `currentCost` (C1).
- [ ] **1.3** Remove the `price * 0.7` fallback everywhere. Missing cost ⇒ profit
      reported as **partial/unknown**, never as full margin (C1).
- [ ] **1.4** One canonical profit: the backend returns `netProfit`
      (revenue − COGS − expenses) plus explicit components; both screens render
      it; delete the `net` alias (C11).
- [ ] **1.5** Value quantity discrepancies at **cost**; keep "revenue at risk" as
      a separately named field if wanted (C10).
- **Exit test:** product cost 180 / price 250, sell 18 ⇒ assert `COGS = 3240` and
  `profit = 1260` on **both** the dashboard and reports, from the real backend.

### Phase 2 — Make the counts true
- [ ] **2.1** Remove `Math.max(0, …)`; a negative movement raises a discrepancy
      and is shown to the owner (C5).
- [ ] **2.2** Add `reason` + `note` to `StockMovement` and
      `SetInventoryLevelDto`; add a migration (C9).
- [ ] **2.3** Branch-explicit stock writes: `branchId` required when the business
      has >1 branch; add the selector to `StockTab` (C6).
- [ ] **2.4** Mid-period protection: stock changes for products on an open period
      are recorded as that period's `addedQuantity`, or blocked (C5, P3).
- [ ] **2.5** `ClosingScreen`: drop the manual "Added during period" box once
      (2.4) makes it unnecessary (P3).
- [ ] **2.6** Fix `OpenShiftScreen` to render the branch-filtered `rows` (I12).
- [ ] **2.7** Sort `GET /shifts` by `openedAt desc` and scope the worker's open
      period to their branch (I11).
- **Exit test:** reproduce scenario S8 and assert the period reports the **true**
  `+4 sold` with the delivery attributed — not a false clean zero.

### Phase 3 — Close the accountability loop
- [ ] **3.1** Owner **Reconciliations** tab: list by status, open a period, see
      stock table + money table + variance, Confirm / Dispute (C4, I1).
- [ ] **3.2** Re-declaration before confirmation replaces the figures (or 409s);
      no duplicate discrepancies (C8).
- [ ] **3.3** One variance taxonomy shared by schema, backend and UI (add
      `CASH_OVERAGE` or remove it — but decide once) (C8).
- [ ] **3.4** Reports count only `CONFIRMED` periods as final, with a
      "provisional" bucket for pending/disputed (C12).
- **Exit test:** worker closes and declares → owner confirms → period becomes
  `CONFIRMED` → only then does it appear in reported revenue.

### Phase 4 — Tenancy and trust
- [ ] **4.1** Implement auth (JWT + bcrypt) and delete the unused auth libraries
      (`passport`, `better-auth`, …) (P4).
- [ ] **4.2** Derive `businessId` from the token, not the header (C7).
- [ ] **4.3** Every read filters by `businessId`; every write re-asserts
      ownership; remove `businessId` from all update DTOs (C7).
- [ ] **4.4** Role guards: workers cannot reach `/owner/*` (P3-3).
- **Exit test:** the harness's S7 checks pass — no anonymous read, no cross-tenant
  row, no cross-tenant write.

### Phase 5 — The missing documented flows
- [ ] **5.1** Transfers end-to-end: sender/receiver screens over the existing
      backend lifecycle, and a real `GET /transfers` (I2).
- [ ] **5.2** Product units + conversion factors in the product form
      (1 crate = 24 bottles) (I3).
- [ ] **5.3** Owner Expenses screen (I9).
- [ ] **5.4** Stock movements ledger view (I5, C9).
- [ ] **5.5** Bulk stocktake screen (I8).
- [ ] **5.6** Report filters (date range, branch, product) wired to
      `ReportFilterDto` (I7).
- [ ] **5.7** Resolve the M-Pesa contradiction in writing: either update
      `My_System_Nature.md` to the balance-pair model, or build accounts +
      transactions (I10).

### Phase 6 — Guardrails (so this does not happen again)
- [ ] **6.1** Generate frontend types from the backend OpenAPI document; add a
      contract test that fails on drift (C3, S10.4).
- [ ] **6.2** Turn `tools/mock-api-harness` into CI so it runs on every push (P2).
- [ ] **6.3** `.strict()` on all request schemas so dropped fields become 400s (P6).
- [ ] **6.4** Service tests for the lifecycle transitions the docs call mandatory
      (open → verify → active → close → declare → confirm), with Postgres in CI
      (P2, `P4-1`).
- [ ] **6.5** Remove `class-validator`/`class-transformer` (P5).
- [ ] **6.6** Delete committed scratch files; keep one tracker (P7).
- [ ] **6.7** Offline-first for the worker (service worker + outbox) — last,
      because it is only worth building once the online path is correct (I6).

---

## 7. Recommended immediate next step

Do **Phase 0.1–0.3** first. Until the real backend is the one being tested, every
other fix is a fix to the wrong program, and C1/C3/C8/C10 will keep looking
"fixed" in the demo while being broken in production.

Then **Phase 1** — because an owner acting on a 100%-margin profit number is
worse off than an owner with no system at all.

---

## Appendix — reproducing the evidence

```bash
cd tools/mock-api-harness
node run.mjs            # prints every check with observed values
node run.mjs --json     # machine-readable results
cat last-run.txt        # saved run: 44 checks | 11 PASS | 31 FAIL | 2 NOTE
```

The harness imports `route.ts`, a byte-for-byte copy of
`frontend/src/app/api/[...slug]/route.ts`, behind a minimal `next/server` shim,
so it exercises the exact handler that serves the deployed app. Any fix should
flip the corresponding check to PASS; that is the regression net for this plan.
