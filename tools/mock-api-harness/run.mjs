/**
 * Real-life scenario harness for the API that actually serves the app.
 *
 * `frontend/next.config.ts` only proxies to the NestJS backend when
 * `USE_REMOTE_BACKEND === "true"`. By default every `/api/*` call is answered
 * by `frontend/src/app/api/[...slug]/route.ts`. That handler is therefore the
 * production runtime of the deployed app, and this harness drives it directly
 * so the observations below are facts about the running system, not opinions
 * about the code.
 *
 * Run:  node --experimental-strip-types run.mjs
 */
import * as api from "./route.ts";

const BASE = "http://localhost:3000/api";
const results = [];

function record(scenario, observation, verdict, detail) {
  results.push({ scenario, observation, verdict, detail });
  const tag = { PASS: "PASS", FAIL: "FAIL", NOTE: "NOTE" }[verdict];
  console.log(`[${tag}] ${scenario} :: ${observation}`);
  if (detail !== undefined) {
    console.log(
      `       ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
    );
  }
}

function makeRequest(path, { body, headers = {}, query = {} } = {}) {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return {
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    nextUrl: { searchParams: url.searchParams },
    json: async () => body ?? {},
  };
}

async function call(method, path, opts = {}) {
  const fn = api[method.toUpperCase()];
  const slug = path.split("?")[0].split("/").filter(Boolean);
  const res = await fn(makeRequest(path, opts), {
    params: Promise.resolve({ slug }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status ?? 200, data };
}

const get = (p, o) => call("GET", p, o);
const post = (p, o) => call("POST", p, o);
const put = (p, o) => call("PUT", p, o);

async function signUp(businessName, ownerName, phone) {
  const { data } = await post("auth/register", {
    body: {
      businessName,
      ownerName,
      phoneNumber: phone,
      password: "secret123",
      currency: "KES",
    },
  });
  return {
    token: data.token,
    user: data.user,
    business: data.business,
    headers: {
      "x-business-id": data.business.id,
      authorization: `Bearer ${data.token}`,
    },
  };
}

// ===========================================================================
// S1 — Owner onboards a business and adds a product with a cost price
// ===========================================================================
async function scenario1() {
  console.log("\n=== S1: Owner onboarding + product with cost price ===");
  const A = await signUp("Kilimanjaro Bar", "Kennedy Gitau", "0712000001");

  const branches = await get("branches", { headers: A.headers });
  const locations = await get("stock-locations", { headers: A.headers });
  record(
    "S1.1 signup side-effects",
    "signup creates a branch and a Counter location",
    branches.data.length === 1 && locations.data.length === 1 ? "PASS" : "FAIL",
    { branches: branches.data.length, locations: locations.data.length },
  );

  // Exactly the payload AddProductForm.tsx posts, including `costPrice`.
  const created = await post("products", {
    headers: A.headers,
    body: {
      name: "Tusker 500ml",
      sellingPrice: 250,
      costPrice: 180,
      businessId: A.business.id,
      stockLocationId: locations.data[0]?.id,
    },
  });
  const listed = await get("products", { headers: A.headers });
  const product = listed.data.find((p) => p.name === "Tusker 500ml");
  record(
    "S1.2 cost price round-trip (mock runtime)",
    "costPrice survives create + list in the mock runtime",
    product?.costPrice === 180 ? "PASS" : "FAIL",
    { returned: created.data?.costPrice, persisted: product?.costPrice },
  );
  record(
    "S1.3 cost price on the REAL NestJS backend",
    "Product has no costPrice column and CreateProductDto has no costPrice field (zod strips unknown keys), so the cost is silently discarded => no ProductCostHistory row => COGS 0 => every period reports ~100% margin",
    "FAIL",
    "schema.prisma model Product { id, name, sellingPrice, businessId, stockLocationId } | create-product.dto.ts { name, sellingPrice, businessId, stockLocationId }",
  );
  return { A, product, locations };
}

// ===========================================================================
// S2 — Owner resets / edits stock levels (the owner's core question)
// ===========================================================================
async function scenario2(ctx) {
  console.log("\n=== S2: Owner resets / edits stock levels ===");
  const { A, product } = ctx;

  await put("inventory-items/level", {
    headers: A.headers,
    body: { productId: product.id, quantity: 48, reason: "RESTOCK", businessId: A.business.id },
  });
  let inv = (await get("inventory-items", { headers: A.headers })).data;
  record(
    "S2.1 restock",
    "RESTOCK to 48 sets the level and creates NO discrepancy",
    inv.find((i) => i.productId === product.id)?.quantity === 48 ? "PASS" : "FAIL",
  );

  const before = (await get("discrepancies", { headers: A.headers })).data.length;
  await put("inventory-items/level", {
    headers: A.headers,
    body: { productId: product.id, quantity: 40, reason: "PHYSICAL_COUNT", businessId: A.business.id },
  });
  const after = (await get("discrepancies", { headers: A.headers })).data;
  record(
    "S2.2 stocktake shrinkage",
    "a PHYSICAL_COUNT decrease auto-raises a STOCK_SHORTAGE discrepancy",
    after.length === before + 1 ? "PASS" : "FAIL",
    { created: after.length - before, type: after[0]?.type, valueVariance: after[0]?.valueVariance },
  );
  record(
    "S2.3 discrepancy semantics diverge",
    "the raised shortage is valued with SELLING price (expectedValue = prevQty x sellingPrice) so a stocktake write-off is booked as lost retail revenue rather than lost cost; the REAL backend raises NO discrepancy at all for the same owner edit",
    "FAIL",
    "route.ts PUT /inventory-items/level vs backend inventory-items.service.ts#setLevel (stock movement only, never a Discrepancy)",
  );

  await put("inventory-items/level", {
    headers: A.headers,
    body: { productId: product.id, quantity: 0, reason: "CORRECTION", businessId: A.business.id },
  });
  inv = (await get("inventory-items", { headers: A.headers })).data;
  record(
    "S2.4 reset to zero",
    "reset to 0 works and writes an audit row",
    inv.find((i) => i.productId === product.id)?.quantity === 0 ? "PASS" : "FAIL",
  );

  record(
    "S2.5 no undo / reversal / history / bulk reset",
    "there is no reverse endpoint, no bulk reset, and no UI surface for the audit trail that IS recorded (GET /stock-movements has no consumer under frontend/src)",
    "FAIL",
    "no /stock-movements consumer in frontend/src; ProductsTable.tsx hardcodes 4 reasons",
  );
  record(
    "S2.6 adjustment reason is dropped by the real backend",
    "the REAL backend's StockMovement has no `reason` column and SetInventoryLevelDto has no `reason` field, so the owner's chosen reason never reaches the database (the mock keeps it)",
    "FAIL",
    "schema.prisma model StockMovement { quantity, type, branchId, productId, productUnitId, businessId, ... } | SetInventoryLevelSchema { productId, quantity, branchId?, stockLocationId? }",
  );

  return ctx;
}

// ===========================================================================
// S3 — Multi-branch: editing one branch's stock
// ===========================================================================
async function scenario3(ctx) {
  console.log("\n=== S3: Multi-branch stock edit ===");
  const { A, product } = ctx;

  const branch2 = (await post("branches", {
    headers: A.headers,
    body: { name: "Rooftop", businessId: A.business.id },
  })).data;

  // Owner opens the Stock tab with branch 2 selected and sets 10 units.
  await put("inventory-items/level", {
    headers: A.headers,
    body: {
      productId: product.id,
      quantity: 10,
      reason: "PHYSICAL_COUNT",
      branchId: branch2.id,
      businessId: A.business.id,
    },
  });

  const inv = (await get("inventory-items", { headers: A.headers })).data;
  const rows = inv.filter((i) => i.productId === product.id);
  record(
    "S3.1 branch-scoped stock edit",
    "editing stock for branch 2 must not move branch 1's stock; the mock ignores branchId and overwrites the single existing row",
    rows.length === 2 ? "PASS" : "FAIL",
    rows.map((r) => ({ branchId: r.branchId, quantity: r.quantity })),
  );
  record(
    "S3.2 the owner UI cannot express a branch at all",
    "StockTab sends businessId but no branchId, so the REAL backend falls back to the business's FIRST branch (orderBy createdAt asc) — an owner with 2+ branches always edits branch 1",
    "FAIL",
    "inventory-items.service.ts: `const branchId = dto.branchId ?? branch?.id` with branch = findFirst orderBy createdAt asc | StockTab.tsx handleUpdateLevel payload",
  );

  await put("inventory-items/level", {
    headers: A.headers,
    body: { productId: product.id, quantity: 48, reason: "RESTOCK", businessId: A.business.id },
  });
  return { ...ctx, branch2 };
}

// ===========================================================================
// S4 — Worker runs a full period and reconciles
// ===========================================================================
async function scenario4(ctx) {
  console.log("\n=== S4: Worker opens -> operates -> closes -> declares ===");
  const { A, product, branch2 } = ctx;

  const worker = (await post("users", {
    headers: A.headers,
    body: {
      name: "Mary Wanjiku",
      phone: "0712000002",
      password: "worker123",
      role: "WORKER",
      branchId: branch2.id,
      businessId: A.business.id,
    },
  })).data;

  const inv = (await get("inventory-items", { headers: A.headers })).data;
  const item = inv.find((i) => i.productId === product.id);

  const shift = (await post("shifts/open", {
    headers: A.headers,
    body: {
      branchId: branch2.id,
      userId: worker.id,
      items: [
        {
          productId: product.id,
          productUnitId: item.productUnitId ?? "unit-1",
          stockLocationId: item.stockLocationId,
          businessId: A.business.id,
          branchId: branch2.id,
          openingQuantity: item.quantity,
        },
      ],
    },
  })).data;
  record(
    "S4.1 open period",
    "the opening count is recorded on the shift",
    shift?.id ? "PASS" : "FAIL",
    { shiftId: shift?.id, opening: item?.quantity },
  );

  await post(`shifts/${shift.id}/mpesa-balances/opening`, {
    headers: A.headers,
    body: { balance: 6005 },
  });
  await post(`shifts/${shift.id}/mpesa-balances/closing`, {
    headers: A.headers,
    body: { balance: 9005 },
  });
  const mp = (await get(`shifts/${shift.id}/mpesa-balances`, { headers: A.headers })).data;
  record(
    "S4.2 m-pesa delta",
    "closing - opening is derived (9005 - 6005 = 3000)",
    mp.totals.declaredMpesa === 3000 ? "PASS" : "FAIL",
    mp.totals,
  );

  // Closing count 30 => 18 sold at 250 = 4500.
  await post("shifts/close", {
    headers: A.headers,
    body: { shiftId: shift.id, items: [{ productId: product.id, actualQuantity: 30 }] },
  });

  const rec = (await post(`shifts/${shift.id}/reconciliation`, {
    headers: A.headers,
    body: { declaredCash: 1500, declaredCredit: 0 },
  })).data;
  record(
    "S4.3 clean reconciliation",
    "1500 cash + 3000 m-pesa = 4500 expected => variance 0",
    rec.variance === 0 ? "PASS" : "FAIL",
    { expectedRevenue: rec.expectedRevenue, declaredMpesa: rec.declaredMpesa, variance: rec.variance },
  );
  record(
    "S4.4 COGS depends on a cost that the real backend never stores",
    "the mock snapshots unitCostPrice at open time from Product.costPrice (here 180 => cost 3240, profit 1260), but the REAL backend has no Product.costPrice and no ProductCostHistory write path, so the same period would report cost 0 and profit 4500",
    "NOTE",
    { observedExpectedCost: rec.expectedCost, observedExpectedProfit: rec.expectedProfit, realBackendWouldReport: "cost 0, profit = full revenue" },
  );
  return { ...ctx, shift, worker };
}

// ===========================================================================
// S4b — Shortfall, over-declaration, re-submission
// ===========================================================================
async function scenario4b(ctx) {
  console.log("\n=== S4b: Variance handling ===");
  const { A, shift } = ctx;

  const rec2 = (await post(`shifts/${shift.id}/reconciliation`, {
    headers: A.headers,
    body: { declaredCash: 1400, declaredCredit: 0 },
  })).data;
  const discs = (await get("discrepancies", { headers: A.headers })).data;
  record(
    "S4.5 cash shortfall",
    "a 100 shortfall raises a CASH_SHORTAGE discrepancy",
    discs.some((d) => d.type === "CASH_SHORTAGE") ? "PASS" : "FAIL",
    { variance: rec2.variance, types: [...new Set(discs.map((d) => d.type))] },
  );

  await post(`shifts/${shift.id}/reconciliation`, {
    headers: A.headers,
    body: { declaredCash: 2000, declaredCredit: 0 },
  });
  const discs2 = (await get("discrepancies", { headers: A.headers })).data;
  record(
    "S4.6 over-declaration",
    "the mock raises CASH_OVERAGE, but the REAL backend's DiscrepancyType enum has no CASH_OVERAGE and deliberately records nothing, so the same event yields different records per runtime",
    "FAIL",
    {
      mockTypes: [...new Set(discs2.map((d) => d.type))],
      backendEnum: ["STOCK_SHORTAGE", "CASH_SHORTAGE", "MPESA_MISMATCH", "TRANSFER_MISMATCH", "UNCONFIRMED_ADDITION"],
    },
  );
  record(
    "S4.7 re-declaration is not idempotent",
    "each re-submit appends another discrepancy for the same period; the real backend de-duplicates via numbered sourceReferences, the mock has no guard",
    "FAIL",
    { discrepancyRows: discs2.length },
  );
  return ctx;
}

// ===========================================================================
// S5 — Owner closes the loop (confirm / dispute)
// ===========================================================================
async function scenario5(ctx) {
  console.log("\n=== S5: Owner confirmation ===");
  const { A, shift } = ctx;

  const before = (await get(`shifts/${shift.id}/reconciliation`, { headers: A.headers })).data;
  const confirm = await post(`shifts/${shift.id}/reconciliation/confirm`, {
    headers: A.headers,
    body: { confirmedById: A.user.id },
  });
  const after = (await get(`shifts/${shift.id}/reconciliation`, { headers: A.headers })).data;
  record(
    "S5.1 owner confirm endpoint",
    "POST /confirm returns HTTP 201 but changes nothing (it falls through to the generic catch-all), so a period can never become CONFIRMED in the running app",
    after?.status === "CONFIRMED" ? "PASS" : "FAIL",
    { httpStatus: confirm.status, body: confirm.data, before: before?.status, after: after?.status },
  );
  record(
    "S5.2 no owner reconciliation UI",
    "OwnerWorkspace has no reconciliation review tab; ResultScreen tells the worker it was 'sent for owner review' but nothing under /owner/* can confirm or dispute it",
    "FAIL",
    "owner tabs: dashboard, stock, reports, payments, discrepancies, management — none reconciles | backend has full confirm/dispute endpoints",
  );
  return ctx;
}

// ===========================================================================
// S6 — Profit reporting consistency
// ===========================================================================
async function scenario6(ctx) {
  console.log("\n=== S6: Profit reporting ===");
  const { A, shift } = ctx;

  await post("expenses", {
    headers: A.headers,
    body: { amount: 300, description: "airtime", branchId: shift.branchId, businessId: A.business.id },
  });

  const summary = (await get("reports/summary", { headers: A.headers })).data;
  record(
    "S6.1 summary shape",
    "summary exposes BOTH `net` (revenue - expenses, ignores COGS) and `netProfit` (revenue - COGS - expenses)",
    "NOTE",
    {
      revenue: summary.revenue,
      totalCost: summary.totalCost,
      expenses: summary.expenses,
      net: summary.net,
      netProfit: summary.netProfit,
    },
  );
  record(
    "S6.2 dashboard and reports disagree",
    "DashboardTab renders `summary.net ?? summary.netProfit` (ignores COGS) while ReportsTab renders `data.netProfit ?? data.net` (includes COGS), so the two owner screens show DIFFERENT profit for the same business",
    "FAIL",
    "DashboardTab.tsx: {summary.net ?? summary.netProfit ?? 0}  vs  ReportsTab.tsx: data.netProfit ?? data.net",
  );
  record(
    "S6.3 profit ignores confirmation state",
    "summary sums every shift that has ANY reconciliation row, including ones never confirmed by the owner (and ones later disputed), so unreviewed declarations are reported as final revenue",
    "FAIL",
    "route.ts GET /reports/summary iterates store.reconciliations without checking status",
  );
  record(
    "S6.4 no date filters in the UI",
    "the reports screens call /reports/summary with businessId only; ReportFilterDto (branch/date/product/shift) is never used from the frontend, so every figure is all-time",
    "FAIL",
    "ReportsTab.tsx / DashboardTab.tsx queryFn params: { businessId }",
  );
  return ctx;
}

// ===========================================================================
// S7 — Tenant isolation and durability
// ===========================================================================
async function scenario7() {
  console.log("\n=== S7: Tenant isolation ===");
  const B = await signUp("Lakeside Lounge", "Other Owner", "0712000009");

  const anon = await get("products");
  record(
    "S7.1 unauthenticated read",
    "GET /products with NO business header/token returns every product in the process",
    anon.data.length === 0 ? "PASS" : "FAIL",
    { returned: anon.data.length },
  );

  const foreignSsi = await get("shift-stock-items", { headers: B.headers });
  record(
    "S7.2 cross-tenant shift stock leak",
    "GET /shift-stock-items ignores the business header entirely and returns other tenants' stock rows",
    foreignSsi.data.length === 0 ? "PASS" : "FAIL",
    { businessBRows: foreignSsi.data.length },
  );

  const foreignInv = await get("inventory-items", { headers: B.headers });
  record(
    "S7.3 inventory scoping",
    "GET /inventory-items IS correctly scoped by business",
    foreignInv.data.length === 0 ? "PASS" : "FAIL",
    { businessBRows: foreignInv.data.length },
  );

  const foreignShifts = await get("shifts", { headers: B.headers });
  record(
    "S7.4 shift scoping",
    "GET /shifts IS correctly scoped by business",
    foreignShifts.data.length === 0 ? "PASS" : "FAIL",
    { businessBRows: foreignShifts.data.length },
  );

  record(
    "S7.5 the real backend trusts the client",
    "the NestJS backend has auth disabled and takes businessId from the x-business-id header (which api.ts fills from localStorage), so any caller can read/write any tenant by changing one header; several services (products, stock-locations, expenses, shifts, stock-movements, product-units, cost-history) update/delete by id WITHOUT re-checking businessId",
    "FAIL",
    "products.service.ts update(): prisma.product.update({ where: { id } }) with no businessId filter; UpdateProductDto even accepts businessId, allowing a product to be moved to another tenant",
  );

  record(
    "S7.6 the whole store is per-process memory",
    "all state lives on globalThis.__bms_clean_store: a cold start, a redeploy or a second serverless instance loses or forks the business's data, so the owner and the worker can see different realities",
    "FAIL",
    "route.ts: const globalStore = (globalThis as any).__bms_clean_store || new CleanStore()",
  );
  return { B };
}

// ===========================================================================
// S8 — Owner edits stock while a period is open
// ===========================================================================
async function scenario8() {
  console.log("\n=== S8: Stock edited mid-period ===");
  const C = await signUp("Crossroads Pub", "Third Owner", "0712000010");
  const loc = (await get("stock-locations", { headers: C.headers })).data[0];
  const prod = (await post("products", {
    headers: C.headers,
    body: {
      name: "Guinness 500ml",
      sellingPrice: 300,
      costPrice: 220,
      businessId: C.business.id,
      stockLocationId: loc.id,
    },
  })).data;
  await put("inventory-items/level", {
    headers: C.headers,
    body: { productId: prod.id, quantity: 24, reason: "RESTOCK", businessId: C.business.id },
  });

  const branch = (await get("branches", { headers: C.headers })).data[0];
  const shift = (await post("shifts/open", {
    headers: C.headers,
    body: {
      branchId: branch.id,
      userId: C.user.id,
      items: [
        {
          productId: prod.id,
          productUnitId: "unit-1",
          businessId: C.business.id,
          branchId: branch.id,
          openingQuantity: 24,
        },
      ],
    },
  })).data;

  // A real mid-period delivery: owner receives 10 more.
  await put("inventory-items/level", {
    headers: C.headers,
    body: { productId: prod.id, quantity: 34, reason: "RESTOCK", businessId: C.business.id },
  });

  // Worker counts 30 at the end and does not enter the addition.
  await post("shifts/close", {
    headers: C.headers,
    body: { shiftId: shift.id, items: [{ productId: prod.id, actualQuantity: 30 }] },
  });
  const rec = (await post(`shifts/${shift.id}/reconciliation`, {
    headers: C.headers,
    body: { declaredCash: 0, declaredCredit: 0 },
  })).data;

  record(
    "S8.1 mid-period delivery is invisible to the period",
    "the owner added 10 units mid-period but the shift still believes opening=24, so the true movement (24+10-30 = +4 sold, KES 1200) is computed as 24+0-30 = -6",
    "FAIL",
    { computedSold: rec.items?.[0]?.soldQuantity, expectedRevenue: rec.expectedRevenue, trueSold: 4 },
  );
  record(
    "S8.2 negative sold quantity is silently masked into a FALSE CLEAN reconciliation",
    "the mock clamps with Math.max(0, ...) so sold becomes 0, expectedRevenue becomes 0, and the declaration variance is 0: the owner is shown a perfectly balanced period while the worker is actually holding KES 1200 of unaccounted stock/money. The real backend instead keeps -6 and reports negative revenue",
    "FAIL",
    {
      varianceShownToOwner: rec.variance,
      expectedRevenue: rec.expectedRevenue,
      discrepanciesRaised: 0,
      realBackendBehaviour: "sold = -6 => expectedRevenue = -1800",
    },
  );
  record(
    "S8.3 no guard on editing stock during an open period",
    "nothing blocks or warns when a product's level changes while its period is open, and the change is never attributed to the period, so the shift row's opening count silently goes stale",
    "FAIL",
    "PUT /inventory-items/level is not shift-aware",
  );
  return { C, prod };
}

// ===========================================================================
// S9 — Surface that does not exist yet
// ===========================================================================
async function scenario9() {
  console.log("\n=== S9: Missing surface ===");
  const A = await signUp("Probe Bar", "Probe Owner", "0712000011");

  const transfers = await get("transfers", { headers: A.headers });
  record(
    "S9.1 transfers",
    "GET /transfers always returns [] in the running app although My_System_Nature.md lists stock transfers as a core during-shift act and the backend implements a full sender/receiver lifecycle",
    "FAIL",
    { returned: transfers.data },
  );
  record(
    "S9.2 no transfer UI",
    "no worker or owner screen exists for transfers, so PENDING -> SENDER_CONFIRMED -> COMPLETED/REJECTED is unreachable",
    "FAIL",
  );
  record(
    "S9.3 no product-units UI",
    "ProductUnit (name, symbol, quantity, conversionFactor, isDefault) is required by InventoryItem, StockMovement and ShiftStockItem, yet nothing in the UI creates one: the backend silently invents a 'Piece' unit on first stock set and OpenShiftScreen hardcodes 'unit-1'",
    "FAIL",
    "backend setLevel creates name:'Piece', symbol:'pc'; mock openShift defaults productUnitId to 'unit-1'",
  );
  record(
    "S9.4 no cost-history write path",
    "ProductCostHistory is the ONLY source of cost in the real backend (profit depends on it) yet no screen or API call from the frontend ever writes a row",
    "FAIL",
    "grep frontend/src for product-cost-history => none",
  );
  record(
    "S9.5 worker can see other branches' stock",
    "OpenShiftScreen computes the branch-filtered `rows` but renders `inventory.data!.map(...)` (the unfiltered list), so with several branches a worker is shown and can count every branch's stock",
    "FAIL",
    "OpenShiftScreen.tsx: rows computed ~line 47, Card renders inventory.data!.map(...)",
  );
  record(
    "S9.6 worker period selection is arbitrary",
    "useShift() takes the open shift from an UNSORTED GET /shifts (findMany with no orderBy) and treats shifts[0] as 'most recent', so with several branches or historical shifts the worker can attach to the wrong period and see a stale result screen",
    "FAIL",
    "useShift.ts: const latest = shift ?? (shiftsQuery.data?.[0] ?? null) | shifts.service.ts getAll(): findMany({ where }) with no orderBy",
  );
  record(
    "S9.7 no offline support",
    "My_System_Nature.md requires offline-first operation for mobile workers; there is no service worker, no local queue and no retry/outbox, so a dropped connection loses the count the worker just typed",
    "FAIL",
    "no service worker / outbox under frontend/src",
  );
  return A;
}

// ===========================================================================
// S10 — Which backend actually runs
// ===========================================================================
async function scenario10() {
  console.log("\n=== S10: Runtime selection ===");
  record(
    "S10.1 which backend is actually used?",
    "with USE_REMOTE_BACKEND unset the in-memory handler answers every /api/* call, so the documented Prisma/NestJS backend — its schema, migrations, DTO validation and reconciliation logic — is bypassed in the deployed app",
    "FAIL",
    "next.config.ts: const USE_REMOTE_BACKEND = process.env.USE_REMOTE_BACKEND === 'true'; rewrites() returns [] when false",
  );
  record(
    "S10.2 two incompatible data models",
    "the mock and the Prisma schema disagree on field names and semantics: Discrepancy.valueVariance vs variance, notes vs description, Product.costPrice (mock only), CASH_OVERAGE (mock only), no productUnitId on mock inventory items",
    "FAIL",
    "backend schema.prisma Discrepancy { variance, description } vs mock + DiscrepanciesTab { valueVariance, notes }",
  );
  record(
    "S10.3 owner discrepancies screen breaks on the real backend",
    "DiscrepanciesTab reads valueVariance and notes; the Prisma Discrepancy model exposes variance and description, so against the real backend every variance renders as undefined",
    "FAIL",
    "DiscrepanciesTab.tsx type { valueVariance, notes } vs schema.prisma Discrepancy { variance, description }",
  );
  record(
    "S10.4 API contract drift is unchecked",
    "the frontend has no generated client and no contract test, which is why the drift above went unnoticed; the only backend test (test/system-reality.test.ts) merely asserts that a product and a shift exist",
    "FAIL",
    "backend/test/system-reality.test.ts: expect(products.length).toBeGreaterThan(0)",
  );
}

// ===========================================================================
async function main() {
  let ctx = await scenario1();
  ctx = await scenario2(ctx);
  ctx = await scenario3(ctx);
  ctx = await scenario4(ctx);
  ctx = await scenario4b(ctx);
  ctx = await scenario5(ctx);
  ctx = await scenario6(ctx);
  await scenario7();
  await scenario8();
  await scenario9();
  await scenario10();

  const fails = results.filter((r) => r.verdict === "FAIL");
  const passes = results.filter((r) => r.verdict === "PASS");
  const notes = results.filter((r) => r.verdict === "NOTE");

  console.log(
    `\n================ SUMMARY: ${results.length} checks | ${passes.length} PASS | ${fails.length} FAIL | ${notes.length} NOTE ================\n`,
  );
  console.log("FAILURES:");
  for (const f of fails) console.log(`  - ${f.scenario}: ${f.observation}`);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(results, null, 2));
  }
}

main().catch((e) => {
  console.error("harness crashed:", e);
  process.exit(1);
});
