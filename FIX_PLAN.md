# FIX_PLAN.md — AI-executable repair plan

> Companion to `SYSTEM_DIAGNOSIS_AND_POLISH_PLAN.md` (the *why*).
> This file is the *how*: ordered tasks, exact files, exact edits, exact
> verification, exact commit messages.
>
> **Audience:** any AI coding agent, with no prior context on this repo.
> **Rule of engagement:** do the tasks **in order**. Each task is independently
> verifiable and independently committable. Never start a task before its
> dependency is verified green.

---

## 0. Rules for the executing agent

1. **Read the file before you edit it.** Every task lists the files it touches.
2. **One task = one commit.** Use the commit message given in the task.
3. **Run the "Verify" step before committing.** If it does not match "Expected",
   stop and fix — do not commit a red task and do not "fix it later".
4. **Never skip a verification** because it "looks fine".
5. **Do not invent fields.** If a task needs a value you do not have, use the
   value the task specifies.
6. **Escalate, do not guess**, for anything in §3 marked `ESCALATE`. Ask the
   human owner in plain language and wait.
7. **Work on the branch `cline/r40ja374`** (already exists and is pushed).
8. **Keep the docs honest.** When you finish a task, tick its box in §9 and in
   `SYSTEM_ALIGNMENT_TODO.md`.

---

## 1. Environment setup (do this once)

```bash
# 1. Database
cd /workspace/backend
docker compose up -d db          # postgres:16 on host port 5433

# 2. Backend dependencies + schema
npm install
cat > .env <<'EOF'
DATABASE_URL="postgresql://postgres:mypassword@localhost:5433/bar_ops_dev"
JWT_SECRET="dev_secret_change_me"
PORT=4000
CORS_ORIGIN="http://localhost:3000,http://localhost:3001"
EOF
npx prisma generate
npx prisma migrate deploy
npx prisma db seed               # creates business 'joypub' + owner/worker users

# 3. Run the backend
npm run start:dev                # http://localhost:4000
```

```bash
# 4. Frontend (separate terminal)
cd /workspace/frontend
npm install
USE_REMOTE_BACKEND=true BACKEND_URL=http://localhost:4000 npm run dev
```

> **Port clash:** the backend and the frontend both default to 3000. This plan
> runs the **backend on 4000** and the **frontend on 3000**. Stay consistent.

**Health check (must pass before continuing):**

```bash
curl -s http://localhost:4000/health
# Expected: {"status":"ok", ...}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000/api
# Expected: 200 (Swagger UI)
```

---

## 2. Critical gotcha you must resolve first

`frontend/next.config.ts` proxies `/api/*` to the backend:

```ts
async rewrites() {
  if (!USE_REMOTE_BACKEND || !BACKEND_URL) return [];
  return [{ source: "/api/:path*", destination: `${BACKEND_URL}/:path*` }];
}
```

**Returning a bare array makes these `afterFiles` rewrites**, and Next.js matches
**filesystem routes before `afterFiles` rewrites**. The app has a filesystem route
at exactly that path — `frontend/src/app/api/[...slug]/route.ts` — so the in-memory
mock handler is very likely served **even with `USE_REMOTE_BACKEND=true`**.

**Therefore setting the env var alone does NOT switch backends.** T0.4 (retire the
mock route) is the real switch. T0.2 is the test that proves which handler answered.

---

## 3. Decisions already made (do not re-litigate)

| ID | Decision |
|----|----------|
| **D1** | Cost lives in `ProductCostHistory` (auditable). `Product` gets **no** `costPrice` column. Products are returned with a computed `currentCost`. |
| **D2** | A missing cost is **not** treated as zero-margin. Profit is reported with `costComplete: false` and the UI labels it "partial". |
| **D3** | `Math.max(0, …)` clamping is removed everywhere. A negative movement is a **discrepancy**, never a silent zero. |
| **D4** | Mid-period stock **increases** are attributed to the open period as `addedQuantity`. Mid-period **decreases** are recorded as a `StockMovement` on the period and are **not** silently netted off. |
| **D5** | Stock writes are **branch-explicit**. If a business has >1 branch and the request omits `branchId`, the API returns **400** (never guesses). |
| **D6** | Only `CONFIRMED` periods count as final revenue/profit. `AWAITING_OWNER`/`DISPUTED` go in a separate `provisional` bucket. |
| **D7** | The in-memory mock is **deleted**, not maintained. `tools/api-harness` (HTTP) replaces it as the regression net. |

### ESCALATE before doing these (ask the human, then record the answer here)

| ID | Question | Blocking task |
|----|----------|---------------|
| **E1** | Over-declarations: add `CASH_OVERAGE` to `DiscrepancyType` (honest record) **or** keep the enum and rely on `DISPUTED` + notes? | T3.3 |
| **E2** | M-Pesa: keep the single opening/closing balance pair (and update `My_System_Nature.md`), or build the documented accounts/transactions model? | T5.7 |
| **E3** | May the owner edit stock for a branch that has an open period, or only through that period's delivery flow? | T2.4 |

Default if the human does not answer: **E1 = add `CASH_OVERAGE`**,
**E2 = keep the balance pair**, **E3 = allow, with attribution**.

---

## 4. Task template

Every task has: **Goal**, **Depends on**, **Files**, **Steps**, **Verify**,
**Commit**. The `Verify` block is copy-pasteable and states the expected output.

---

## Phase 0 — Make the real backend the one that runs

### T0.1 — Bring up the stack
**Goal:** a running NestJS + Postgres backend answering HTTP.
**Depends on:** nothing.
**Files:** none (commands only).
**Steps:** run every command in §1. Create `backend/.env` if it does not exist.
**Verify:**
```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000/health
```
Expected: `200`.
**Commit:** none (no file changes).

### T0.2 — Prove which handler answers `/api/*`
**Goal:** determine whether the mock or the proxy serves requests.
**Depends on:** T0.1.
**Files:** `frontend/next.config.ts` (read only).
**Steps:**
1. Start the frontend with `USE_REMOTE_BACKEND=true BACKEND_URL=http://localhost:4000`.
2. `curl -s http://localhost:3000/api/health`
   - **Mock** replies with **four** keys:
     `{"status":"ok","database":"connected","totalBusinesses":N,"totalUsers":M}`
   - **Backend** replies with **exactly two** keys
     (`backend/src/health.controller.ts`):
     `{"status":"ok","database":"connected"}`
3. The discriminator is the presence of `totalBusinesses`/`totalUsers`.
**Expected:** record which one answered. If it is the mock, §2 is confirmed.
**Commit:** none.
**Note:** if the proxy *does* fire, say so in your report — T0.4 is then still
required for cleanliness but is not load-bearing.

### T0.3 — Build the HTTP regression harness
**Goal:** keep the 44-check safety net after the mock is deleted.
**Depends on:** nothing (can be done before T0.4).
**Files:**
- create `tools/api-harness/scenarios.mjs`
- create `tools/api-harness/http-client.mjs`
- create `tools/api-harness/run.mjs`

**Steps:**
1. Open `tools/mock-api-harness/run.mjs`. Move **every `scenario*` function and
   the `record()` helper verbatim** into `tools/api-harness/scenarios.mjs`.
2. Change them to take an injected client instead of closing over module-level
   helpers. Replace the module-level `get/post/put/patch` with `client.get` etc.:
   ```js
   export async function runScenarios(client, record) {
     let ctx = await scenario1(client, record);
     ctx = await scenario2(client, record, ctx);
     // ... scenario3..scenario10, in the same order as the original main()
   }
   ```
   Inside each scenario replace `get(p, o)` with `client.get(p, o)`, and make
   `signUp()` call `client.post("auth/register", …)`.
   **Keep every assertion and every observation string exactly as it is** — the
   point is that the same 44 checks run against the real backend.
3. Create `tools/api-harness/http-client.mjs`:
   ```js
   const BASE = process.env.BASE_URL ?? "http://localhost:4000";

   export function httpClient() {
     return {
       async request(method, path, { body, headers = {} } = {}) {
         const res = await fetch(`${BASE}/${path}`, {
           method,
           headers: { "content-type": "application/json", ...headers },
           body: body === undefined ? undefined : JSON.stringify(body),
         });
         let data = null;
         try { data = await res.json(); } catch {}
         return { status: res.status, data };
       },
       get(p, o) { return this.request("GET", p, o); },
       post(p, o) { return this.request("POST", p, o); },
       put(p, o) { return this.request("PUT", p, o); },
       patch(p, o) { return this.request("PATCH", p, o); },
     };
   }
   ```
4. Create `tools/api-harness/run.mjs`: import `runScenarios`, `httpClient`, reuse
   the original `record()`/summary/`--json` logic.
5. Leave `tools/mock-api-harness/` untouched for now.

**Verify:**
```bash
BASE_URL=http://localhost:4000 node tools/api-harness/run.mjs | tail -3
```
Expected: it runs to completion and prints a `SUMMARY: N checks | … PASS | … FAIL`
line. Failures are expected right now — the point is that it **executes** against
the real backend.
**Commit:** `test: add HTTP api-harness reusing the scenario suite`

### T0.4 — Retire the in-memory mock route
**Goal:** stop the mock from answering `/api/*` so the real backend is used.
**Depends on:** T0.2 (to know whether this is load-bearing), T0.3 (net in place).
**Files:**
- delete `frontend/src/app/api/[...slug]/route.ts`
- `frontend/next.config.ts`

**Steps:**
1. `git rm frontend/src/app/api/[...slug]/route.ts`.
   (The `[...slug]` directory becomes empty — remove it too.)
2. In `frontend/next.config.ts`, make the proxy **explicit and loud**:
   ```ts
   const USE_REMOTE_BACKEND = process.env.USE_REMOTE_BACKEND !== "false";
   const BACKEND_URL = rawBackend ?? "http://localhost:4000";
   ```
   i.e. default to proxying, and fail fast in development when `BACKEND_URL`
   is unset rather than silently serving nothing.
3. Because the route handler no longer exists, the `afterFiles` rewrite is now
   the only thing that can answer `/api/*` — this is the actual switch.
4. Add a guard so this cannot regress: in `frontend/next.config.ts`'s
   `redirects()` (or a small comment block), note that **no filesystem route may
   live under `src/app/api/`** while the proxy is in use.

**Verify:**
```bash
cd /workspace/frontend
USE_REMOTE_BACKEND=true BACKEND_URL=http://localhost:4000 npm run dev
# other terminal:
curl -s http://localhost:3000/api/health
```
Expected: **exactly two keys** — `{"status":"ok","database":"connected"}`.
If you still see `totalBusinesses`, the mock is still being served; investigate
before continuing.
**Commit:** `fix(frontend): serve the real backend by retiring the in-memory mock`

### T0.5 — Baseline the real backend
**Goal:** know exactly what the real backend gets wrong before changing it.
**Depends on:** T0.3, T0.4.
**Files:** `tools/api-harness/baseline.txt` (new).
**Steps:**
1. `BASE_URL=http://localhost:4000 node tools/api-harness/run.mjs > tools/api-harness/baseline.txt 2>&1`
2. Note in your report which of the 31 previously-failing checks now pass and
   which still fail. Expect C1 (cost), C6 (branch), C7 (tenancy), C9 (reason),
   C10 (valuation), C11 (profit), C12 (confirmation) to still fail — the
   following phases fix them.
**Verify:** `tools/api-harness/baseline.txt` exists and contains a `SUMMARY:` line.
**Commit:** `test: baseline the real backend against the scenario suite`

---

## Phase 1 — Make the money true

### T1.1 — Persist cost price when a product is created
**Goal:** the cost the owner types is actually stored (as cost history) and readable.
**Depends on:** T0.5.
**Files:**
- `backend/src/products/dto/create-product.dto.ts`
- `backend/src/products/products.service.ts`

**Steps:**
1. In `CreateProductSchema` add the field the UI already sends:
   ```ts
   costPrice: z.number().positive().optional(),
   ```
2. In `ProductsService.create`, write the first cost-history row in the same
   transaction as the product:
   ```ts
   async create(businessId: string, body: CreateProductDto) {
     const { costPrice, ...productData } = body;
     return this.prisma.$transaction(async (tx) => {
       const product = await tx.product.create({
         data: { ...productData, businessId },
       });
       if (costPrice !== undefined) {
         await tx.productCostHistory.create({
           data: { productId: product.id, costPrice },
         });
       }
       return product;
     });
   }
   ```
3. In `ProductsService.getAll`, stop returning raw rows; return `currentCost`
   (latest `ProductCostHistory.costPrice`, or `null`):
   ```ts
   async getAll(businessId: string) {
     const products = await this.prisma.product.findMany({
       where: { businessId },
       include: {
         stockLocation: true,
         costHistory: { orderBy: { effectiveAt: 'desc' }, take: 1 },
       },
       orderBy: { createdAt: 'asc' },
     });
     return products.map(({ costHistory, ...p }) => ({
       ...p,
       currentCost: costHistory[0]?.costPrice ?? null,
     }));
   }
   ```
4. Do the same `currentCost` projection in `getById`.

**Verify:**
```bash
curl -s -X POST http://localhost:4000/products \
  -H 'content-type: application/json' -H 'x-business-id: joypub' \
  -d '{"name":"VerifyCostLager","sellingPrice":250,"costPrice":180}' | head -c 300
curl -s http://localhost:4000/products -H 'x-business-id: joypub' \
  | python3 -c "import sys,json;print([p['currentCost'] for p in json.load(sys.stdin) if p['name']=='VerifyCostLager'])"
```
Expected: the second command prints `[180.0]` (not `[None]`).
**Commit:** `fix(products): persist cost price as product cost history`

### T1.2 — Editing a price appends cost history (never overwrites it)
**Goal:** a cost change is a new historical fact, and the old cost is preserved.
**Depends on:** T1.1.
**Files:**
- `backend/src/products/dto/update-product.dto.ts`
- `backend/src/products/products.service.ts`

**Steps:**
1. Add to `UpdateProductSchema`: `costPrice: z.number().positive().optional()`.
2. Rewrite `ProductsService.update`:
   ```ts
   async update(id: string, businessId: string, body: UpdateProductDto) {
     const existing = await this.prisma.product.findFirst({
       where: { id, businessId }, select: { id: true },
     });
     if (!existing) throw new NotFoundException('Product not found in this business');

     const { costPrice, ...productData } = body;
     return this.prisma.$transaction(async (tx) => {
       const product = Object.keys(productData).length
         ? await tx.product.update({ where: { id }, data: productData })
         : await tx.product.findUniqueOrThrow({ where: { id } });
       if (costPrice !== undefined) {
         await tx.productCostHistory.create({ data: { productId: id, costPrice } });
       }
       return product;
     });
   }
   ```
   Import `NotFoundException` from `@nestjs/common`.

**Verify:**
```bash
curl -s -X PATCH http://localhost:4000/products/<PRODUCT_ID> \
  -H 'content-type: application/json' -H 'x-business-id: joypub' \
  -d '{"costPrice":195}' > /dev/null
curl -s http://localhost:4000/products -H 'x-business-id: joypub' \
  | python3 -c "import sys,json;print([p['currentCost'] for p in json.load(sys.stdin) if p['name']=='VerifyCostLager'])"
```
Expected: `[195.0]`, and `ProductCostHistory` has **2** rows for that product
(180 then 195) — the 180 row is still there.
**Commit:** `fix(products): append cost history on cost edits instead of losing it`

### T1.3 — A missing cost must not read as 100% margin
**Goal:** "profit" is never silently computed with a zero cost.
**Depends on:** T1.1.
**Files:**
- `frontend/src/app/owner/stock/components/StockManagement/AddProductForm.tsx`
- `frontend/src/app/owner/stock/components/StockManagement/dataHooks.ts`
- `frontend/src/app/owner/stock/components/StockManagement/ProductsTable.tsx`
- `backend/src/shift-reconciliations/shift-reconciliations.service.ts`
- `backend/src/reports/reports.service.ts`

**Steps:**
1. `AddProductForm.tsx` — delete the fabricated cost. Replace
   ```ts
   const numCost = costPrice.trim() ? Number(costPrice) : Math.round(numPrice * 0.7);
   ```
   with
   ```ts
   const numCost = costPrice.trim() ? Number(costPrice) : undefined;
   ```
   and send `costPrice: numCost` (now optional in the DTO after T1.1). Relabel the
   field `Cost Price (needed for profit)`.
2. `dataHooks.ts` — change the `Product` type: `costPrice?: number` becomes
   `currentCost?: number | null`.
3. `ProductsTable.tsx` — replace every `product.costPrice` with
   `product.currentCost`; when it is `null`/absent render `—` with the title
   `"No cost recorded — profit will be partial"`.
4. `shift-reconciliations.service.ts` — in `getView`, add a completeness flag
   computed from the items:
   ```ts
   const costComplete = items.every((i) => i.unitCost > 0);
   ```
   and include `costComplete` in the returned object (next to `expectedCost`).
5. `reports.service.ts` — in `getSummary`, add
   `costComplete` = true only when every sold item had a cost-history row.

**Verify:**
```bash
curl -s 'http://localhost:4000/reports/summary' -H 'x-business-id: joypub' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('costComplete=',d.get('costComplete'))"
```
Expected: a boolean is printed. Then create a product **without** a cost, sell it
in a period, and confirm `costComplete` becomes `false`.
**Commit:** `fix(profit): stop treating a missing cost as zero margin`

### T1.4 — One canonical profit figure
**Goal:** the dashboard and the reports screen show the same number.
**Depends on:** T1.3.
**Files:**
- `backend/src/reports/reports.service.ts`
- `frontend/src/components/owner/tabs/DashboardTab.tsx`
- `frontend/src/components/owner/tabs/ReportsTab.tsx`

**Steps:**
1. `reports.service.ts` `getSummary` — **remove the `net` key** from the returned
   object entirely, so no consumer can pick the COGS-free number by accident.
   Keep `netProfit`, `totalRevenue`, `totalCost`, `totalExpenses`,
   `costComplete`, and add `provisional` (see T3.4).
2. `DashboardTab.tsx` — delete `net?: number` from the `Summary` type and render
   `summary.netProfit ?? 0`. Update the subtitle to
   `"Revenue − cost of goods − expenses"`.
3. `ReportsTab.tsx` — delete `net?: number` from `SummaryPayload` and render
   `data.netProfit ?? 0`.
4. Grep for any other consumer and fix it:
   ```bash
   grep -rn '\.net\b\|netProfit\|totalRevenue' frontend/src backend/src | grep -v node_modules
   ```

**Verify:**
```bash
curl -s 'http://localhost:4000/reports/summary' -H 'x-business-id: joypub' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('net' in d, d.get('netProfit'))"
grep -rn '"net"\|summary.net\b' frontend/src backend/src | grep -v node_modules
```
Expected: first line prints `False <number>`; the grep returns **nothing**.
**Commit:** `fix(reports): expose a single netProfit and remove the net alias`

### T1.5 — Value quantity discrepancies at cost, not retail
**Goal:** a write-off is costed at what the goods cost, not at the sale lost.
**Depends on:** T1.1.
**Files:**
- create `backend/src/common/valuation.ts`
- `backend/src/discrepancies/discrepancies.service.ts`

**Steps:**
1. Create the shared helper:
   ```ts
   import { PrismaService } from '../prisma/prisma.service';

   /** The effective cost of a product: latest ProductCostHistory row, else null. */
   export async function currentCost(
     prisma: PrismaService,
     productId: string,
   ): Promise<number | null> {
     const row = await prisma.productCostHistory.findFirst({
       where: { productId },
       orderBy: { effectiveAt: 'desc' },
     });
     return row ? Number(row.costPrice) : null;
   }
   ```
2. In `DiscrepanciesService.create`, for quantity-based types
   (`STOCK_SHORTAGE`, `UNCONFIRMED_ADDITION`) compute `expectedValue`/`actualValue`
   from the **cost** where the caller supplied quantities:
   ```ts
   // Quantity discrepancies are valued at cost so a write-off is not booked as
   // lost retail revenue. Money discrepancies (cash/mpesa/transfer) pass values
   // through unchanged.
   ```
   Use `currentCost(...)` when `body.expectedQuantity`/`body.actualQuantity` are
   present and the caller did not supply explicit values.
3. Document the rule in a comment above the method so it is not re-broken.

**Verify:**
Create a product with cost 180, raise a `STOCK_SHORTAGE` of 8 units, and confirm
`expectedValue - actualValue == 8 * 180 == 1440` (not `8 * sellingPrice`).
**Commit:** `fix(discrepancies): value quantity discrepancies at cost`

---

## Phase 2 — Make the counts true

### T2.1 — Remove the clamping that hides shortages
**Goal:** a movement the counts cannot explain becomes a visible discrepancy.
**Depends on:** T1.5.
**Files:** `backend/src/shifts/shifts.service.ts`

**Steps:**
1. In `ShiftsService.close`, keep `soldQuantity` unclamped (it already is — do not
   add `Math.max`), and when it is negative raise a discrepancy **inside the same
   transaction**:
   ```ts
   if (soldQuantity < 0) {
     await tx.discrepancy.create({
       data: {
         businessId,
         branchId: shift.branchId,
         shiftId: shift.id,
         productId: ssi.productId,
         stockMovementId: null,
         createdById: shift.userId,
         type: 'STOCK_SHORTAGE',
         status: 'OPEN',
         expectedQuantity: ssi.openingQuantity + addedQuantity,
         actualQuantity: closingQuantity,
         quantityDifference: soldQuantity, // negative
         expectedValue: 0,
         actualValue: 0,
         variance: 0,
         sourceReference: `shift-close:${shift.id}:${ssi.productId}`,
         description:
           `Counted ${closingQuantity} but was given ${ssi.openingQuantity + addedQuantity}. ` +
           `The period does not balance; check for an unrecorded delivery.`,
       },
     });
   }
   ```
   (`sourceReference` is `@unique`, so a re-close cannot double-raise.)
2. Note the deliberate choice in a comment: the discrepancy records the **quantity**
   problem; its money value is filled in by T1.5's costing rule if required.

**Verify:**
Reproduce scenario S8: open with 24, deliver 10 mid-period, close counting 30.
```bash
curl -s 'http://localhost:4000/discrepancies' -H 'x-business-id: joypub' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print([x['type'] for x in d])"
```
Expected: `STOCK_SHORTAGE` is present, and the reconciliation variance is **not**
a false `0`.
**Commit:** `fix(shifts): raise a discrepancy instead of clamping a negative count`

### T2.2 — An uncounted product must not be treated as fully sold
**Goal:** "I could not count it" must not become "I sold all of it".
**Depends on:** T2.1.
**Files:** `backend/src/shift-reconciliations/shift-reconciliations.service.ts`

**Steps:**
1. In `computeItems`, the current line
   ```ts
   const closing = ssi.closingQuantity ?? 0;
   const sold = opening + added - closing;
   ```
   charges the worker for the **entire opening stock** of any product they did not
   count. Replace it with:
   ```ts
   const counted = ssi.closingQuantity !== null && ssi.closingQuantity !== undefined;
   const closing = ssi.closingQuantity ?? 0;
   // A product the worker never counted is UNKNOWN, not fully sold. Its
   // quantities and revenue are excluded from the period's totals and it is
   // reported as uncounted so the owner can chase it.
   const sold = counted ? opening + added - closing : 0;
   ```
2. Add `counted` to each returned item (the `ReconciliationItemView` type and the
   `ReconciliationItem` type in `frontend/src/lib/api/worker.ts` already declare
   `counted?: boolean` — make it non-optional).
3. In `summarise`, add `uncountedCount` so the owner sees how many products are
   unaccounted for:
   ```ts
   const uncountedCount = items.filter((i) => !i.counted).length;
   ```
   Include it in the `getView` payload.

**Verify:**
Open a period with 2 products, close counting **only one** of them, then:
```bash
curl -s "http://localhost:4000/shifts/<SHIFT_ID>/reconciliation" \
  -H 'x-business-id: joypub' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('uncounted=',d['uncountedCount'],[ (i['productName'],i['counted'],i['soldQuantity']) for i in d['items']])"
```
Expected: `uncounted= 1` and the uncounted product shows `soldQuantity == 0`, and
`expectedRevenue` only includes the counted product.
**Commit:** `fix(reconciliation): treat an uncounted product as unknown, not sold`

### T2.3 — Store the owner's adjustment reason
**Goal:** the reason the owner picks survives to the database.
**Depends on:** T0.5.
**Files:**
- `backend/prisma/schema.prisma`
- `backend/src/inventory-items/dto/set-inventory-level.dto.ts`
- `backend/src/inventory-items/inventory-items.service.ts`

**Steps:**
1. Add to `model StockMovement`:
   ```prisma
   reason StockMovementReason @default(ADJUSTMENT)
   note   String?
   ```
   and a new enum:
   ```prisma
   enum StockMovementReason {
     PHYSICAL_COUNT
     RESTOCK
     BREAKAGE
     CORRECTION
     TRANSFER
     ADJUSTMENT
   }
   ```
2. `npx prisma migrate dev --name add_stock_movement_reason`.
3. In `SetInventoryLevelSchema` add:
   ```ts
   reason: z.enum(['PHYSICAL_COUNT','RESTOCK','BREAKAGE','CORRECTION','TRANSFER','ADJUSTMENT']).optional(),
   note: z.string().max(500).optional(),
   ```
4. In `setLevel`, pass them through when creating the `StockMovement`:
   ```ts
   reason: dto.reason ?? 'ADJUSTMENT',
   note: dto.note,
   ```
5. Add a read endpoint so the trail is usable:
   `GET /stock-movements?productId=&branchId=&from=&to=` in
   `stock-movements.service.ts` (`getAll` should also `orderBy: { createdAt: 'desc' }`
   and include `product`, `productUnit`, `stockLocation`).

**Verify:**
```bash
curl -s -X PUT http://localhost:4000/inventory-items/level \
  -H 'content-type: application/json' -H 'x-business-id: joypub' \
  -d '{"productId":"<ID>","quantity":40,"reason":"BREAKAGE","note":"dropped a crate"}' >/dev/null
curl -s 'http://localhost:4000/stock-movements' -H 'x-business-id: joypub' \
  | python3 -c "import sys,json;print([(m['reason'],m.get('note')) for m in json.load(sys.stdin)][:3])"
```
Expected: the newest row is `('BREAKAGE', 'dropped a crate')`.
**Commit:** `feat(stock): persist adjustment reason and note on stock movements`

### T2.4 — Make branch explicit on every stock write
**Goal:** an owner with several branches can never edit the wrong one silently.
**Depends on:** T2.3.
**Files:**
- `backend/src/inventory-items/inventory-items.service.ts`
- `frontend/src/components/owner/tabs/StockTab.tsx`

**Steps:**
1. Replace the "guess the first branch" block in `setLevel` with an explicit,
   validating lookup:
   ```ts
   const branches = await this.prisma.branch.findMany({
     where: { businessId },
     orderBy: { createdAt: 'asc' },
   });
   if (branches.length === 0) {
     throw new BadRequestException('This business has no branch that can hold stock');
   }
   if (dto.branchId && !branches.some((b) => b.id === dto.branchId)) {
     throw new BadRequestException('branchId does not belong to this business');
   }
   if (branches.length > 1 && !dto.branchId) {
     throw new BadRequestException(
       'This business has more than one branch; branchId is required so stock is not changed in the wrong branch',
     );
   }
   const branchId = dto.branchId ?? branches[0].id;
   ```
2. `StockTab.tsx`: add a branch `<select>` next to the header (same markup style as
   the existing selects), default to the first branch, and include `branchId` in the
   `PUT /inventory-items/level` payload:
   ```ts
   await api.put("/inventory-items/level", { productId, quantity, reason, branchId, businessId });
   ```
3. Also filter the rendered inventory rows by the selected branch so the table
   matches what will be written.

**Verify:**
```bash
# business with 2 branches, no branchId -> must fail
curl -s -o /dev/null -w '%{http_code}\n' -X PUT http://localhost:4000/inventory-items/level \
  -H 'content-type: application/json' -H 'x-business-id: joypub' \
  -d '{"productId":"<ID>","quantity":10}'
```
Expected: `400`. With a valid `branchId` it returns `200` and only that branch's
row changes.
**Commit:** `fix(stock): require an explicit branch for multi-branch stock writes`

### T2.5 — Attribute mid-period deliveries to the open period
**Goal:** a delivery during a shift is counted in that shift's maths automatically.
**Depends on:** T2.3, T2.4.
**Files:** `backend/src/inventory-items/inventory-items.service.ts`

**Steps:**
1. Inside the `setLevel` transaction, find the open period for that branch:
   ```ts
   const openShift = await tx.shift.findFirst({
     where: { branchId, closedAt: null },
     orderBy: { openedAt: 'desc' },
   });
   ```
2. Attach the movement to the period: pass `shiftId: openShift?.id` into the
   `tx.stockMovement.create(...)` call.
3. Per **D4**, attribute only **increases**:
   ```ts
   if (openShift && delta > 0) {
     const ssi = await tx.shiftStockItem.findFirst({
       where: { shiftId: openShift.id, productId: product.id },
     });
     if (ssi) {
       await tx.shiftStockItem.update({
         where: { id: ssi.id },
         data: { addedQuantity: { increment: delta } },
       });
     }
   }
   ```
4. A **decrease** during an open period must not silently reduce the worker's
   accountability: leave `addedQuantity` alone. The close-time check from T2.1
   surfaces the imbalance as a `STOCK_SHORTAGE`.

**Verify:**
Open a period with 24, `PUT /inventory-items/level` to 34 (reason `RESTOCK`),
then close counting 30:
```bash
curl -s "http://localhost:4000/shifts/<SHIFT_ID>/reconciliation" -H 'x-business-id: joypub' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);i=d['items'][0];print('added',i['addedQuantity'],'sold',i['soldQuantity'],'rev',i['revenue'])"
```
Expected: `added 10 sold 4 rev 1200` — the true movement, with **no** discrepancy.
**Commit:** `fix(stock): attribute mid-period deliveries to the open period`

### T2.6 — Remove the manual "Added during period" workaround
**Goal:** the worker no longer hand-types what the system already knows.
**Depends on:** T2.5.
**Files:** `frontend/src/components/worker/screens/ClosingScreen.tsx`

**Steps:**
1. Delete the `added` state and the "Added during period" `<input>`.
2. Stop sending `addedQuantity` in the close payload.
3. Show it read-only instead:
   ```tsx
   <p className="text-xs text-slate-500">
     Deliveries recorded this period: {item.addedQuantity ?? 0}
   </p>
   ```
4. `expected` on `CountRow` becomes
   `item.openingQuantity + Number(item.addedQuantity ?? 0)`.

**Verify:** close a period after a mid-period delivery; the screen shows the
recorded delivery and the submit payload contains no `addedQuantity`.
**Commit:** `refactor(worker): show recorded deliveries instead of asking for them`

### T2.7 — Worker opening screen must show only their branch
**Goal:** a worker cannot count another branch's stock.
**Depends on:** nothing.
**Files:** `frontend/src/components/worker/screens/OpenShiftScreen.tsx`

**Steps:**
1. The component computes `rows` (branch-filtered) but renders the **unfiltered**
   list. Change the render from `{inventory.data!.map((item) => (` to
   `{rows.map((item) => (`.

**Verify:** with two branches holding stock, select one branch and confirm only
that branch's products are listed.
**Commit:** `fix(worker): render only the selected branch's stock on the opening count`

### T2.8 — Deterministic worker period selection
**Goal:** the worker's screen always reflects the correct period.
**Depends on:** nothing.
**Files:**
- `backend/src/shifts/shifts.service.ts`
- `frontend/src/hooks/useShift.ts`

**Steps:**
1. `ShiftsService.getAll`: add `orderBy: { openedAt: 'desc' }`.
2. `useShift.ts`: scope to the worker's branch before picking a period:
   ```ts
   const user = useAuthStore((s) => s.user);
   const forBranch = (shiftsQuery.data ?? []).filter(
     (s) => !user?.branchId || s.branchId === user.branchId,
   );
   const shift = findOpenShift(forBranch);
   const latest = shift ?? (forBranch[0] ?? null);
   ```
   Import `useAuthStore`. Keep `derivePhase` unchanged.
3. Replace the `latest` usages in the dependent query keys with `forBranch`-derived
   `latest` (they already read `latest`).

**Verify:**
```bash
curl -s http://localhost:4000/shifts -H 'x-business-id: joypub' \
  | python3 -c "import sys,json;print([s['openedAt'] for s in json.load(sys.stdin)])"
```
Expected: timestamps in **descending** order.
**Commit:** `fix(shifts): order periods deterministically and scope them to the worker's branch`

---

## Phase 3 — Close the accountability loop

### T3.1 — Owner reconciliation review screen
**Goal:** the owner can finally confirm or dispute a period.
**Depends on:** Phase 0 (real backend serving `/shifts/:id/reconciliation`).
**Files:**
- create `frontend/src/components/owner/tabs/ReconciliationsTab.tsx`
- `frontend/src/components/owner/OwnerWorkspace.tsx`
- create `frontend/src/app/owner/reconciliations/page.tsx`

**Steps:**
1. Create the page (mirror an existing one, e.g. `owner/reports/page.tsx`, which is
   a 5-line wrapper rendering the workspace with `initialTab`).
2. Build `ReconciliationsTab`:
   - `useQuery(["shifts"], …)` → list periods with their status. Derive status by
     calling `GET /shifts/:id/reconciliation` per shift (it returns
     `status: 'AWAITING_WORKER'` when the worker has not submitted yet) — or add a
     `status` to `GET /shifts` if that proves chatty.
   - Filter buttons: `AWAITING_OWNER | CONFIRMED | DISPUTED | ALL`.
   - Selecting a period renders `view.items` as a stock table
     (opening / added / sold / closing / revenue / cost / profit), the money block
     (`declaredCash`, `declaredMpesa`, `declaredCredit`, `expectedCash`,
     `variance`), and `uncountedCount` from T2.2.
   - **Confirm** → `POST /shifts/:id/reconciliation/confirm` with
     `{ confirmedById: user.id, notes }`.
   - **Dispute** → `POST /shifts/:id/reconciliation/dispute` with
     `{ reason, disputedById: user.id }`.
   - On success, invalidate `["shifts"]` and `["reconciliation"]`.
3. Register the tab in `OwnerWorkspace.tsx`:
   - add `"reconciliations"` to the `TabId` union,
   - add a `NAV_ITEMS` entry `{ id: "reconciliations", href: "/owner/reconciliations", label: "Reconciliations", icon: ClipboardCheck }` (import from `lucide-react`),
   - add `if (path.includes("/reconciliations")) return "reconciliations";` to `getTabFromPath`,
   - add the keep-alive `<div>` block alongside the other tabs.

**Verify:**
```bash
# as owner, confirm a submitted period
curl -s -X POST http://localhost:4000/shifts/<SHIFT_ID>/reconciliation/confirm \
  -H 'content-type: application/json' -H 'x-business-id: joypub' \
  -d '{"confirmedById":"<OWNER_ID>"}' >/dev/null
curl -s http://localhost:4000/shifts/<SHIFT_ID>/reconciliation -H 'x-business-id: joypub' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])"
```
Expected: `CONFIRMED`. In the browser, the Reconciliations tab lists the period and
the buttons change its status.
**Commit:** `feat(owner): add reconciliation review tab with confirm and dispute`

### T3.2 — Enforce the reconciliation state machine
**Goal:** a period can only move through legal states, and re-declaring is safe.
**Depends on:** T3.1.
**Files:** `backend/src/shift-reconciliations/shift-reconciliations.service.ts`

**Steps:**
1. Implement exactly this transition table and nothing else:

   | From | Action | To | Allowed |
   |------|--------|----|---------|
   | *(none)* | submit | `AWAITING_OWNER` | yes |
   | `AWAITING_WORKER` | submit | `AWAITING_OWNER` | yes |
   | `AWAITING_OWNER` | submit (re-declare) | `AWAITING_OWNER` | yes — **updates the same row** (`shiftId` is `@unique`) |
   | `DISPUTED` | submit (re-declare) | `AWAITING_OWNER` | yes |
   | `CONFIRMED` | submit | — | **409 Conflict** |
   | `AWAITING_OWNER`/`DISPUTED` | confirm | `CONFIRMED` | yes |
   | `CONFIRMED` | confirm | — | **409 Conflict** |
   | `AWAITING_OWNER`/`DISPUTED` | dispute | `DISPUTED` | yes |
   | `CONFIRMED` | dispute | — | **409 Conflict** |
   | `AWAITING_WORKER` | confirm/dispute | — | **404/409** ("worker has not declared yet") |

2. In `submit`, replace any create-only path with an upsert on `shiftId`, and
   throw `ConflictException` when the existing row is `CONFIRMED`.
3. In `confirm`, set `confirmedById`, `confirmedAt: new Date()`, `status: 'CONFIRMED'`,
   and persist `notes`.
4. Do **not** delete historical discrepancies. Re-declaring is a normal event; the
   existing numbered `sourceReference` scheme already prevents collisions.

**Verify:**
```bash
# declare twice, then confirm twice
for i in 1 2; do curl -s -o /dev/null -w "declare$i:%{http_code} " -X POST \
  http://localhost:4000/shifts/<SHIFT_ID>/reconciliation \
  -H 'content-type: application/json' -H 'x-business-id: joypub' \
  -d '{"declaredCash":1500}'; done
curl -s -o /dev/null -w "confirm1:%{http_code} " -X POST \
  http://localhost:4000/shifts/<SHIFT_ID>/reconciliation/confirm \
  -H 'content-type: application/json' -H 'x-business-id: joypub' -d '{}'
curl -s -o /dev/null -w "confirm2:%{http_code}\n" -X POST \
  http://localhost:4000/shifts/<SHIFT_ID>/reconciliation/confirm \
  -H 'content-type: application/json' -H 'x-business-id: joypub' -d '{}'
```
Expected: `declare1:201 declare2:200 confirm1:200 confirm2:409`.
**Commit:** `fix(reconciliation): enforce the confirm/dispute state machine`

### T3.3 — One variance taxonomy (**ESCALATE E1**)
**Goal:** the same real event produces the same record everywhere.
**Depends on:** E1 answered.
**Files:** `backend/prisma/schema.prisma`, `backend/src/discrepancies/dto/create-discrepancy.dto.ts`

**Steps:**
1. If E1 = **add `CASH_OVERAGE`**: add it to `enum DiscrepancyType`, to the zod
   `type` enum in `CreateDiscrepancySchema`, and raise it in `dispute` when
   `declaredCash > summary.expectedCash`.
2. If E1 = **keep the enum**: do nothing to the schema; instead record the overage
   only through the `DISPUTED` status plus a note, and document that in
   `dispute`'s docblock so the omission is deliberate and visible.
3. Either way, add a comment listing the enum as the single source of truth for
   variance types.
4. `npx prisma migrate dev --name add_cash_overage` if the enum changed.

**Verify:**
```bash
grep -n 'CASH_OVERAGE' backend/prisma/schema.prisma backend/src/discrepancies/dto/create-discrepancy.dto.ts
```
Expected: either both files match, or neither mentions it (per the chosen option).
**Commit:** `fix(discrepancies): align the variance taxonomy with the schema`

### T3.4 — Report only confirmed periods as final
**Goal:** unreviewed or disputed money is not presented as realised.
**Depends on:** T3.1, T1.4.
**Files:** `backend/src/reports/reports.service.ts`, `frontend/src/components/owner/tabs/DashboardTab.tsx`, `frontend/src/components/owner/tabs/ReportsTab.tsx`

**Steps:**
1. In `getSummary`, join each shift's `reconciliation.status` and split the totals:
   ```ts
   // Only the owner confirming a period makes its money real. Everything else is
   // provisional and reported separately so the owner can see what is pending.
   const confirmed = shifts.filter((s) => s.reconciliation?.status === 'CONFIRMED');
   const pending   = shifts.filter((s) => s.reconciliation?.status !== 'CONFIRMED');
   ```
   Compute `totalRevenue`/`totalCost` from `confirmed` only, and add:
   ```ts
   provisional: { revenue: <pending revenue>, cost: <pending cost>, periods: pending.length }
   ```
2. Keep `totalExpenses` as is (expenses are not period-scoped), and note that in a
   comment.
3. Frontend: on both screens, add a small "includes KES X from N periods awaiting
   your confirmation" note driven by `provisional`.

**Verify:**
```bash
curl -s http://localhost:4000/reports/summary -H 'x-business-id: joypub' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['totalRevenue'],d['provisional'])"
```
Expected: a period that is `AWAITING_OWNER` contributes **0** to `totalRevenue` and
its value appears under `provisional`. Confirm it, re-run, and the revenue moves.
**Commit:** `fix(reports): count only owner-confirmed periods as final revenue`

---

## Phase 4 — Tenancy and trust

### T4.1 — Implement authentication
**Goal:** the caller's identity and business come from a token, not a header.
**Depends on:** T0.5.
**Files:**
- create `backend/src/auth/auth.module.ts`, `auth.service.ts`, `auth.controller.ts`,
  `jwt.strategy.ts`, `jwt-auth.guard.ts`, `roles.decorator.ts`, `roles.guard.ts`
- `backend/src/users/users.module.ts` (export `UsersService`)
- `backend/src/app.module.ts` (register `AuthModule`)

**Steps:**
1. **The frontend already defines the contract — do not change it.** Read
   `frontend/src/store/useAuthStore.ts` and match it exactly:
   - `POST /auth/register` body `{ ownerName, phoneNumber, password, businessName, currency }`
     → `201 { token, user, business }`
   - `POST /auth/login` body `{ identifier, password }` → `200 { token, user, business }`,
     where `identifier` matches `user.phone` **or** `user.name` (case-insensitive);
     `401 { error }` on failure
   - `GET /auth/me` → `{ user, business }`
   - `user` must include at least
     `{ id, name, phone, role, status, branchId, businessId }` with **no `password`**;
     `business` is `{ id, name, currency }`.
2. `register` creates, in one transaction: `Business`, a default `Branch` named
   `"Main Branch"`, a default `StockLocation` named `"Counter"` (type `COUNTER`),
   the owner `User` (bcrypt-hashed password, role `OWNER`), and the `UserBusiness`
   link — mirroring what the retired mock did.
3. `login` uses `bcrypt.compare`; sign a JWT with `JWT_SECRET`, payload
   `{ sub: user.id, businessId, role }`, 7-day expiry.
4. `JwtStrategy` validates the token and returns `{ userId, businessId, role }`
   on `request.user`.
5. `JwtAuthGuard` = `AuthGuard('jwt')`; `RolesGuard` reads a `@Roles('OWNER')`
   decorator.

**Verify:**
```bash
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H 'content-type: application/json' \
  -d '{"identifier":"Mwihaki","password":"mwihaki123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
echo "token=${TOKEN:0:20}..."
curl -s http://localhost:4000/auth/me -H "authorization: Bearer $TOKEN"
```
Expected: a JWT, then the seeded owner and their business. A wrong password → `401`.
**Commit:** `feat(auth): add JWT registration, login and me endpoints`

### T4.2 — Derive `businessId` from the token
**Depends on:** T4.1.
**Files:** every controller in `backend/src/*/` that reads `@Headers('x-business-id')`.

**Steps:**
1. Add `@UseGuards(JwtAuthGuard)` at class level on every operational controller.
2. Replace `@Headers('x-business-id') businessId: string` with a
   `@CurrentBusiness()` parameter decorator returning `req.user.businessId`
   (create `backend/src/auth/current-business.decorator.ts`).
3. Keep `x-business-id` **only** as a fallback when
   `process.env.AUTH_DISABLED === 'true'`, and log a warning when it is used.
4. `frontend/src/lib/api/api.ts`: keep sending the header (harmless); the
   `Authorization` interceptor already exists.

**Verify:**
```bash
curl -s -o /dev/null -w 'no-token:%{http_code}\n' http://localhost:4000/products
curl -s -o /dev/null -w 'with-token:%{http_code}\n' http://localhost:4000/products \
  -H "authorization: Bearer $TOKEN"
```
Expected: `401` then `200`. Changing `x-business-id` must **not** change the data.
**Commit:** `feat(auth): scope every request by the token's business`

### T4.3 — Ownership on every write; drop `businessId` from update DTOs
**Depends on:** T4.2.
**Files:** every `backend/src/*/dto/update-*.dto.ts`, and the services in
`products`, `stock-locations`, `expenses`, `shifts`, `stock-movements`,
`product-units`, `product-cost-history`, `inventory-items`.

**Steps:**
1. Remove `businessId` from **every** `Update*Schema` (it currently allows moving a
   record into another tenant).
2. Add the ownership assertion before any `update`/`delete`, copying the existing
   `inventory-items.service.ts#assertOwned` pattern:
   ```ts
   private async assertOwned(id: string, businessId: string) {
     const found = await this.prisma.<model>.findFirst({
       where: { id, businessId }, select: { id: true },
     });
     if (!found) throw new NotFoundException('<Entity> not found in this business');
   }
   ```
   For models reached through a relation (`ProductCostHistory` → `Product`,
   `Expense` → `Branch`, `ShiftStockItem` → `Shift` → `Branch`), use the relation
   filter that service's `getById` already uses.
3. Add a one-line comment at the top of each service:
   *every write first proves the row belongs to the caller's business.*

**Verify:**
```bash
grep -rn 'businessId' backend/src/*/dto/update-*.dto.ts
```
Expected: **no matches**.
```bash
# cross-tenant write must 404
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH \
  http://localhost:4000/products/<PRODUCT_ID_OF_OTHER_BUSINESS> \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"stolen"}'
```
Expected: `404`.
**Commit:** `fix(security): assert business ownership on every write`

### T4.4 — Role separation
**Depends on:** T4.2.
**Files:** `backend/src/auth/roles.guard.ts`, owner-only controllers,
`frontend/src/components/owner/OwnerWorkspace.tsx`.

**Steps:**
1. Backend `@Roles('OWNER')` on: business/branch/user management, `reports`,
   `analytics`, discrepancy resolution, transfer create/receive, and product
   create/update/delete.
   Workers keep: `shifts/open`, `shifts/close`, `inventory-items/level`,
   `mpesa-balances`, reconciliation submit, expense create.
2. Frontend: in `OwnerWorkspace`, if `user.role === "WORKER"` redirect to `/worker`.
3. Render a clear "not permitted" screen on 403 instead of a blank panel.

**Verify:** log in as `Nduta`/`nduta321`:
```bash
WT=$(curl -s -X POST http://localhost:4000/auth/login -H 'content-type: application/json' \
  -d '{"identifier":"Nduta","password":"nduta321"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -o /dev/null -w 'reports:%{http_code} ' http://localhost:4000/reports/summary -H "authorization: Bearer $WT"
curl -s -o /dev/null -w 'shifts:%{http_code}\n' http://localhost:4000/shifts -H "authorization: Bearer $WT"
```
Expected: `reports:403 shifts:200`.
**Commit:** `feat(auth): separate owner and worker permissions`

---

## Phase 5 — Build the documented flows that are missing

Each task is independent; do them in any order once Phase 4 is done.

### T5.1 — Stock transfers, end to end
**Backend:** already implemented (`backend/src/transfers/`). Only fix
`TransfersService.getItems`/`getDiscrepancies`/`getStockMovements` — they accept
`businessId` but ignore it; scope them through `transfer: { businessId }`.
**Frontend:**
- create `frontend/src/components/owner/tabs/TransfersTab.tsx` (list, create,
  dispatch, receive, reject, cancel) and register it in `OwnerWorkspace` exactly
  as T3.1 did.
- add a `TransferCard` to `frontend/src/components/worker/screens/ActiveCards.tsx`
  so a worker can send and receive during a shift.
- `frontend/src/lib/api/worker.ts`: add typed calls for
  `GET /transfers/by-branch/:branchId`, `POST /transfers`,
  `POST /transfers/:id/dispatch`, `POST /transfers/:id/receive`,
  `POST /transfers/:id/reject`.
**Verify:** create → dispatch → receive; the receiver's inventory increases and the
sender's decreases, with `StockMovement` rows of type `TRANSFER_OUT`/`TRANSFER_IN`.
**Commit:** `feat(transfers): add owner and worker transfer screens`

### T5.2 — Product units and conversion factors
**Files:** `backend/src/products/dto/create-product.dto.ts`,
`backend/src/products/products.service.ts`,
`frontend/src/app/owner/stock/components/StockManagement/AddProductForm.tsx`,
`frontend/src/components/worker/screens/OpenShiftScreen.tsx`.

**Steps:**
1. Accept an optional `units` array on product create:
   `[{ name, symbol, quantity, conversionFactor?, isDefault? }]` and create the
   `ProductUnit` rows in the same transaction. Always create at least one, named
   `Piece` / symbol `pc`, `isDefault: true`.
2. Stop relying on `inventory-items.service.ts` silently inventing a `Piece` unit;
   keep it only as a safety net and log when it fires.
3. Frontend: add a "Units" section to `AddProductForm` (name, symbol, how many base
   units it contains) with one default row.
4. `OpenShiftScreen`: send the real `productUnitId` from the inventory row instead
   of a placeholder.

**Verify:** create a product with units `Crate` (symbol `crt`, quantity 24) and
`Bottle` (symbol `btl`, `isDefault`); `GET /product-units` shows both.
**Commit:** `feat(products): support multiple units and conversion factors`

### T5.3 — Owner expenses screen
Create `frontend/src/components/owner/tabs/ExpensesTab.tsx`: list expenses (branch,
amount, description, who, status), let the owner record one, and an `Acknowledge`
action calling `POST /expenses/:id/acknowledge`. Register it in `OwnerWorkspace` as
in T3.1.
**Verify:** owner records an expense → status `RECORDED`; acknowledge → `ACKNOWLEDGED`.
**Commit:** `feat(owner): add expenses screen with acknowledgement`

### T5.4 — Stock movements ledger screen
Create `frontend/src/components/owner/tabs/StockLedgerTab.tsx` using the
`GET /stock-movements` endpoint extended in T2.3: filters by product, branch and
date; columns date, product, delta, resulting level, reason, note, user, linked
period. Register it as in T3.1.
**Verify:** a `BREAKAGE` adjustment appears with its reason and note.
**Commit:** `feat(owner): add stock movements ledger`

### T5.5 — Bulk stocktake
Add `PUT /inventory-items/levels` accepting
`{ branchId, reason, items: [{ productId, productUnitId, quantity }] }`, applying all
rows in **one** transaction (reuse the single-row logic).
Add a "Stocktake" mode to `StockTab` with one row per product and a single submit.
**Verify:** submit 3 counts at once → all 3 inventory rows and 3 `StockMovement` rows
land, or none do (test by including one invalid product).
**Commit:** `feat(stock): bulk stocktake in a single transaction`

### T5.6 — Report filters
Wire `ReportFilterDto` (`branchId`, `productId`, `shiftId`, `startDate`, `endDate`)
into the UI: add a date range + branch selector to `ReportsTab` and pass them as
query params. Default (no filter) stays all-time.
**Verify:** filtering to yesterday changes `totalRevenue` accordingly.
**Commit:** `feat(reports): wire date and branch filters into the reports screen`

### T5.7 — Resolve the M-Pesa contradiction (**ESCALATE E2**)
If E2 = keep the balance pair: update `frontend/docs/My_System_Nature.md` so the
M-Pesa section describes one opening and one closing reading per period, and note
per-channel attribution as a future capability.
If E2 = build accounts/transactions: that is a multi-week project — stop and get
explicit scope first.
**Verify:** the doc and `backend/prisma/schema.prisma` describe the same model.
**Commit:** `docs: align the m-pesa description with the balance-pair model`

---

## Phase 6 — Guardrails

### T6.1 — Generate frontend types from the backend contract
The backend already mounts Swagger at `/api`. Add an npm script:
```bash
npx openapi-typescript http://localhost:4000/api-json -o frontend/src/lib/api/schema.d.ts
```
plus a check that fails when the generated file differs from the committed one.
Migrate the hand-written types in `worker.ts` and `dataHooks.ts` to derive from the
generated ones.
**Verify:** change a DTO field, regenerate, and `tsc` fails where the UI still reads
the old field.
**Commit:** `chore(types): generate api types from the backend openapi document`

### T6.2 — Run the harness in CI
Add a workflow that starts Postgres, runs `prisma migrate deploy` + `prisma db seed`,
starts the API, then runs
`BASE_URL=http://localhost:4000 node tools/api-harness/run.mjs`
and **fails the job on any `FAIL`**.
**Verify:** the job runs on a push and reports the PASS/FAIL counts.
**Commit:** `ci: run the api scenario harness against a real postgres`

### T6.3 — Make dropped fields loud
Add `.strict()` to every request schema (`Create*Schema`, `Update*Schema`,
`Set*Schema`). This is what turns "the UI sent `costPrice` and the API silently threw
it away" into a `400`.
**Verify:** posting an unknown key returns `400`.
**Commit:** `fix(validation): reject unknown fields instead of silently dropping them`

### T6.4 — Lifecycle tests
Write service-level tests (Postgres in CI) for the transitions the docs call
mandatory — open → verify → active → close → declare → confirm — plus the negative
cases from T2.1, T2.2 and T3.2. Replace the placeholder
`backend/test/system-reality.test.ts`.
**Verify:** `npm run test:e2e` passes, and genuinely fails when you break a rule.
**Commit:** `test: cover the shift lifecycle and its guard rails`

### T6.5 — Remove unused libraries
Delete `class-validator`, `class-transformer`, `better-auth` from
`backend/package.json` (DTOs are `nestjs-zod`; the global pipe is
`ZodValidationPipe`). Keep `@nestjs/jwt`, `passport`, `passport-jwt`, `bcrypt` —
T4.1 uses them.
**Verify:** `npm run build` succeeds and
`grep -rn 'class-validator\|class-transformer\|better-auth' backend/src` returns nothing.
**Commit:** `chore: drop unused validation and auth libraries`

### T6.6 — Clean the repo
Delete committed scratch files: `backend/diag2.txt`, `diag3.txt`, `diag4.txt`,
`probe.txt`, `tsc_output.txt`, `tsc_errors.txt`, `build_log.txt`,
`frontend/build_log.txt`, `blueprint_dump.txt`. Keep one tracker
(`SYSTEM_ALIGNMENT_TODO.md`).
**Verify:** `git status` clean and the files are gone.
**Commit:** `chore: remove committed scratch and diagnostic files`

### T6.7 — Offline-first worker capture
**Do this last.** Add a service worker plus an outbox: counts, expenses and M-Pesa
readings are written to IndexedDB first and flushed when online; the UI shows
"pending sync". Depends on T3.2's idempotent writes to be safe to retry.
**Verify:** go offline, record a count, come back online, confirm it lands exactly
once.
**Commit:** `feat(worker): offline capture with a retryable outbox`

---

## 7. Definition of Done

The repair is complete when **all** of these hold:

1. `BASE_URL=http://localhost:4000 node tools/api-harness/run.mjs` reports **0 FAIL**.
2. `frontend/src/app/api/[...slug]/route.ts` **does not exist**.
3. `curl http://localhost:3000/api/health` returns exactly
   `{"status":"ok","database":"connected"}`.
4. A product with cost 180 / price 250, selling 18 units in a period the owner then
   confirms, yields on **both** the dashboard and the reports screen:
   `revenue 4500`, `cost 3240`, `profit 1260`.
5. An unauthenticated request to any operational endpoint returns `401`.
6. Changing `x-business-id` does not change the data returned.
7. A period containing an uncounted product reports that product as **not counted**
   and excludes it from revenue.
8. A period whose counts do not balance shows a **non-zero** variance and an open
   discrepancy.
9. Only `CONFIRMED` periods contribute to `totalRevenue`.
10. `SYSTEM_ALIGNMENT_TODO.md` has no unchecked boxes in Phase 0.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `/api/health` still returns `totalBusinesses` | The mock route still exists and wins over the `afterFiles` rewrite | T0.4 — delete the route file |
| `curl` to the backend hits the frontend | Both default to port 3000 | Run the API on `PORT=4000` (§1) |
| `prisma migrate deploy` cannot connect | Docker DB not up, or wrong port | `docker compose up -d db`; the host port is **5433** |
| `401` on everything after T4.2 | The frontend is not sending `Authorization` | Check the `api.ts` interceptor reads the token from the zustand store |
| `P2002` unique constraint on `sourceReference` | A discrepancy is raised twice for one event | Use the numbered `:${attempt}` suffix pattern already used in `dispute` |
| Totals look right but the period is wrong | The shift row's `openingQuantity` went stale | T2.5 must attribute mid-period changes; do not skip it |
| A worker sees another branch's stock | T2.7 not applied, or the worker has no `branchId` | Apply T2.7; ensure `User.branchId` is set |

---

## 9. Progress tracker

Tick these as you go, and mirror them into `SYSTEM_ALIGNMENT_TODO.md`.

**Phase 0** — [ ] T0.1 stack up · [ ] T0.2 identify handler · [ ] T0.3 HTTP harness ·
[ ] T0.4 retire mock · [ ] T0.5 baseline

**Phase 1** — [ ] T1.1 cost on create · [ ] T1.2 cost on edit ·
[ ] T1.3 missing-cost honesty · [ ] T1.4 single profit · [ ] T1.5 cost valuation

**Phase 2** — [ ] T2.1 no clamping · [ ] T2.2 uncounted ≠ sold · [ ] T2.3 reason+note ·
[ ] T2.4 explicit branch · [ ] T2.5 mid-period attribution · [ ] T2.6 closing screen ·
[ ] T2.7 branch rows · [ ] T2.8 deterministic period

**Phase 3** — [ ] T3.1 owner review screen · [ ] T3.2 state machine ·
[ ] T3.3 taxonomy (E1) · [ ] T3.4 confirmed-only reporting

**Phase 4** — [ ] T4.1 auth · [ ] T4.2 token scoping · [ ] T4.3 ownership on writes ·
[ ] T4.4 roles

**Phase 5** — [ ] T5.1 transfers · [ ] T5.2 units · [ ] T5.3 expenses ·
[ ] T5.4 ledger · [ ] T5.5 bulk stocktake · [ ] T5.6 report filters · [ ] T5.7 m-pesa (E2)

**Phase 6** — [ ] T6.1 generated types · [ ] T6.2 CI harness · [ ] T6.3 strict schemas ·
[ ] T6.4 lifecycle tests · [ ] T6.5 prune libs · [ ] T6.6 clean repo · [ ] T6.7 offline

---

## 10. Escalation log (fill in when the human answers)

| ID | Question | Answer | Date |
|----|----------|--------|------|
| E1 | Over-declaration record type | *(pending)* | |
| E2 | M-Pesa model | *(pending)* | |
| E3 | Owner stock edits during an open period | *(pending)* | |

---

## 11. Appendix — files created by this diagnosis

| Path | What it is |
|------|-----------|
| `SYSTEM_DIAGNOSIS_AND_POLISH_PLAN.md` | The findings: 12 cracks, 12 gaps, 7 structural issues, each with live evidence. |
| `FIX_PLAN.md` | This file — the executable task list. |
| `tools/mock-api-harness/` | Runnable harness for the retired mock API; source of the 44-check evidence. `node run.mjs`. |
| `tools/mock-api-harness/last-run.txt` | Saved run: `44 checks | 11 PASS | 31 FAIL | 2 NOTE`. |
| `tools/mock-api-harness/README.md` | What the harness is and why its `next/server` shim is committed. |
| `tools/api-harness/` | **To be created in T0.3** — the HTTP equivalent that tests the real backend. |

`tools/mock-api-harness/route.ts` is a copy of the file T0.4 deletes. Keep it: it is
the only remaining description of how the mock behaved.
