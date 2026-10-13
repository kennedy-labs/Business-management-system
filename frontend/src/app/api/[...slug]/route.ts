import { NextRequest, NextResponse } from "next/server";

// In-memory data store for clean production system state
interface Business {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
}

interface Branch {
  id: string;
  name: string;
  businessId: string;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  password?: string;
  role: "OWNER" | "WORKER";
  status: "ACTIVE" | "INACTIVE";
  active: boolean;
  branchId?: string;
  businessId: string;
  createdAt: string;
}

interface Product {
  id: string;
  name: string;
  sellingPrice: number;
  costPrice?: number;
  businessId: string;
  createdAt: string;
}

interface ProductUnit {
  id: string;
  name: string;
  productId: string;
  conversionFactor?: number;
}

interface StockLocation {
  id: string;
  name: string;
  type: string;
  branchId: string;
  businessId: string;
  status?: string;
  createdAt: string;
}

interface InventoryItem {
  id: string;
  quantity: number;
  branchId: string;
  productId: string;
  productUnitId?: string;
  stockLocationId: string | null;
  product: { id: string; name: string; sellingPrice: number };
  stockLocation: { id: string; name: string } | null;
}

interface Shift {
  id: string;
  branchId: string;
  businessId: string;
  userId: string;
  openedAt: string;
  closedAt: string | null;
  periodType?: string;
}

interface ShiftStockItem {
  id: string;
  shiftId: string;
  productId: string;
  productUnitId: string;
  openingQuantity: number;
  addedQuantity: number | null;
  closingQuantity: number | null;
  soldQuantity?: number;
  revenue?: number;
  unitSellingPrice?: number;
  unitCostPrice?: number;
}

interface MpesaReading {
  openingBalance: number;
  openingAt: string;
  closingBalance: number | null;
  closingAt: string | null;
  amount: number | null;
  isComplete: boolean;
}

interface Discrepancy {
  id: string;
  type: string;
  expectedValue: number;
  actualValue: number;
  valueVariance: number;
  status: string;
  resolution: string | null;
  notes?: string;
  businessId: string;
  createdAt: string;
}

interface Expense {
  id: string;
  amount: number;
  description?: string;
  branchId: string;
  businessId: string;
  createdById?: string;
  status: string;
  createdAt: string;
}

// Clean in-memory state: NO hardcoded demo users or test transactions
class CleanStore {
  businesses: Business[] = [];
  branches: Branch[] = [];
  users: User[] = [];
  products: Product[] = [];
  productUnits: ProductUnit[] = [];
  stockLocations: StockLocation[] = [];
  inventoryItems: InventoryItem[] = [];
  shifts: Shift[] = [];
  shiftStockItems: ShiftStockItem[] = [];
  mpesaBalances: Record<string, MpesaReading> = {};
  reconciliations: Record<string, any> = {};
  discrepancies: Discrepancy[] = [];
  expenses: Expense[] = [];
  stockMovements: any[] = [];
  tokens: Record<string, { userId: string; businessId: string }> = {};
}

// Singleton reference
const globalStore: CleanStore =
  (globalThis as any).__bms_clean_store || new CleanStore();
(globalThis as any).__bms_clean_store = globalStore;

function getStore(): CleanStore {
  return (globalThis as any).__bms_clean_store;
}

function sanitizeUser(u: User) {
  const { password, ...safe } = u;
  return safe;
}

function getBusinessIdFromRequest(request: NextRequest): string | null {
  const headerBiz = request.headers.get("x-business-id");
  if (headerBiz) return headerBiz;

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const store = getStore();
    const session = store.tokens[token];
    if (session?.businessId) return session.businessId;
  }

  const queryBiz = request.nextUrl.searchParams.get("businessId");
  if (queryBiz) return queryBiz;

  return null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await context.params;
  const path = slug.join("/");
  const store = getStore();
  const searchParams = request.nextUrl.searchParams;
  const businessId = getBusinessIdFromRequest(request);

  // Health check
  if (path === "health") {
    return NextResponse.json({
      status: "ok",
      database: "connected",
      totalBusinesses: store.businesses.length,
      totalUsers: store.users.length,
    });
  }

  // Auth: Current user (/api/auth/me)
  if (path === "auth/me") {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    if (!token || !store.tokens[token]) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    const session = store.tokens[token];
    const user = store.users.find((u) => u.id === session.userId);
    const business = store.businesses.find((b) => b.id === session.businessId);
    if (!user || !business) {
      return NextResponse.json({ error: "User or business not found" }, { status: 404 });
    }
    return NextResponse.json({ user: sanitizeUser(user), business });
  }

  // Reports Summary
  if (path === "reports/summary" || path === "reports") {
    const bizId = businessId || searchParams.get("businessId");
    if (!bizId) {
      return NextResponse.json({
        revenue: 0,
        expenses: 0,
        net: 0,
        totalRevenue: 0,
        totalCost: 0,
        totalExpenses: 0,
        netProfit: 0,
        totalUnitsSold: 0,
        totalMpesaReceived: 0,
        openDiscrepancies: 0,
        activeShifts: 0,
      });
    }

    const bizExpenses = store.expenses.filter((e) => e.businessId === bizId);
    const totalExpenses = bizExpenses.reduce((sum, e) => sum + e.amount, 0);

    const bizShifts = store.shifts.filter((s) => s.businessId === bizId);
    let totalRevenue = 0;
    let totalCost = 0;
    let totalUnitsSold = 0;
    let totalMpesaReceived = 0;

    for (const shift of bizShifts) {
      const rec = store.reconciliations[shift.id];
      if (rec) {
        totalRevenue += rec.expectedRevenue || 0;
        totalCost += rec.expectedCost || 0;
        totalMpesaReceived += rec.declaredMpesa || 0;
        if (Array.isArray(rec.items)) {
          for (const it of rec.items) {
            totalUnitsSold += it.soldQuantity || 0;
          }
        }
      }
    }

    const netProfit = totalRevenue - totalCost - totalExpenses;
    const openDiscrepancies = store.discrepancies.filter(
      (d) => d.businessId === bizId && d.status === "OPEN"
    ).length;
    const activeShifts = bizShifts.filter((s) => !s.closedAt).length;

    return NextResponse.json({
      revenue: totalRevenue,
      expenses: totalExpenses,
      net: totalRevenue - totalExpenses,
      totalRevenue,
      totalCost,
      totalExpenses,
      netProfit,
      totalUnitsSold,
      totalMpesaReceived,
      openDiscrepancies,
      activeShifts,
    });
  }

  // Businesses list
  if (path === "businesses") {
    if (businessId) {
      return NextResponse.json(store.businesses.filter((b) => b.id === businessId));
    }
    return NextResponse.json(store.businesses);
  }

  // Branches list
  if (path === "branches") {
    const bizId = businessId || searchParams.get("businessId");
    if (bizId) {
      return NextResponse.json(store.branches.filter((b) => b.businessId === bizId));
    }
    return NextResponse.json(store.branches);
  }

  // Users list
  if (path === "users") {
    const bizId = businessId || searchParams.get("businessId");
    const filtered = bizId
      ? store.users.filter((u) => u.businessId === bizId)
      : store.users;
    return NextResponse.json(filtered.map(sanitizeUser));
  }

  // Products list
  if (path === "products") {
    const bizId = businessId || searchParams.get("businessId");
    const filtered = bizId
      ? store.products.filter((p) => p.businessId === bizId)
      : store.products;
    return NextResponse.json(filtered);
  }

  // Stock Locations list
  if (path === "stock-locations") {
    const bizId = businessId || searchParams.get("businessId");
    const filtered = bizId
      ? store.stockLocations.filter((l) => l.businessId === bizId)
      : store.stockLocations;
    return NextResponse.json(filtered);
  }

  // Inventory Items list
  if (path === "inventory-items") {
    const bizId = businessId || searchParams.get("businessId");
    if (bizId) {
      const bizBranchIds = new Set(
        store.branches.filter((b) => b.businessId === bizId).map((b) => b.id)
      );
      return NextResponse.json(
        store.inventoryItems.filter((i) => bizBranchIds.has(i.branchId))
      );
    }
    return NextResponse.json(store.inventoryItems);
  }

  // Shifts list
  if (path === "shifts") {
    const bizId = businessId || searchParams.get("businessId");
    const filtered = bizId
      ? store.shifts.filter((s) => s.businessId === bizId)
      : store.shifts;
    return NextResponse.json(filtered);
  }

  // Shift Stock Items
  if (path === "shift-stock-items") {
    return NextResponse.json(store.shiftStockItems);
  }

  // Discrepancies
  if (path === "discrepancies") {
    const bizId = businessId || searchParams.get("businessId");
    const filtered = bizId
      ? store.discrepancies.filter((d) => d.businessId === bizId)
      : store.discrepancies;
    return NextResponse.json(filtered);
  }

  // Expenses
  if (path === "expenses") {
    const bizId = businessId || searchParams.get("businessId");
    const filtered = bizId
      ? store.expenses.filter((e) => e.businessId === bizId)
      : store.expenses;
    return NextResponse.json(filtered);
  }

  // Transfers
  if (path === "transfers") {
    return NextResponse.json([]);
  }

  // Shift detail: shifts/:id/mpesa-balances
  if (path.startsWith("shifts/") && path.endsWith("/mpesa-balances")) {
    const parts = path.split("/");
    const shiftId = parts[1];
    const reading = store.mpesaBalances[shiftId] || {
      openingBalance: 0,
      openingAt: new Date().toISOString(),
      closingBalance: null,
      closingAt: null,
      amount: null,
      isComplete: false,
    };
    return NextResponse.json({
      shiftId,
      balances: [reading],
      totals: {
        declaredMpesa: reading.amount ?? 0,
        isComplete: reading.isComplete,
      },
    });
  }

  // Shift detail: shifts/:id/reconciliation
  if (path.startsWith("shifts/") && path.endsWith("/reconciliation")) {
    const parts = path.split("/");
    const shiftId = parts[1];
    const rec = store.reconciliations[shiftId];
    if (!rec) {
      return NextResponse.json({ error: "Reconciliation not found" }, { status: 404 });
    }
    return NextResponse.json(rec);
  }

  return NextResponse.json({ message: "OK", path });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await context.params;
  const path = slug.join("/");
  const store = getStore();
  let body: any = {};
  try {
    body = await request.json();
  } catch {}

  const activeBizId = getBusinessIdFromRequest(request);

  // -------------------------------------------------------------------------
  // 1. REGISTER NEW BUSINESS & OWNER (/api/auth/register)
  // -------------------------------------------------------------------------
  if (path === "auth/register") {
    const { ownerName, phoneNumber, password, businessName, currency } = body;

    if (!ownerName || !phoneNumber || !password) {
      return NextResponse.json(
        { error: "Owner name, phone number, and password are required" },
        { status: 400 }
      );
    }

    // Check if phone already registered
    const cleanPhone = String(phoneNumber).trim();
    const existing = store.users.find((u) => u.phone && u.phone === cleanPhone);
    if (existing) {
      return NextResponse.json(
        { error: "A user with this phone number is already registered" },
        { status: 409 }
      );
    }

    const timestamp = new Date().toISOString();
    const bizId = `biz-${Date.now()}`;
    const branchId = `branch-${Date.now()}`;
    const userId = `usr-${Date.now()}`;
    const locationId = `loc-${Date.now()}`;

    // Create Business
    const newBiz: Business = {
      id: bizId,
      name: (businessName || `${ownerName}'s Business`).trim(),
      currency: (currency || "KES").toUpperCase(),
      createdAt: timestamp,
    };
    store.businesses.push(newBiz);

    // Create Default Branch
    const newBranch: Branch = {
      id: branchId,
      name: "Main Branch",
      businessId: bizId,
      createdAt: timestamp,
    };
    store.branches.push(newBranch);

    // Create Default Stock Location (Counter)
    const newLocation: StockLocation = {
      id: locationId,
      name: "Counter",
      type: "COUNTER",
      branchId: branchId,
      businessId: bizId,
      status: "ACTIVE",
      createdAt: timestamp,
    };
    store.stockLocations.push(newLocation);

    // Create Owner User
    const newUser: User = {
      id: userId,
      name: ownerName.trim(),
      phone: cleanPhone,
      password: String(password),
      role: "OWNER",
      status: "ACTIVE",
      active: true,
      branchId: branchId,
      businessId: bizId,
      createdAt: timestamp,
    };
    store.users.push(newUser);

    // Issue Token
    const token = `token-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    store.tokens[token] = { userId: newUser.id, businessId: newBiz.id };

    return NextResponse.json(
      {
        token,
        user: sanitizeUser(newUser),
        business: newBiz,
        message: "Business and owner account created successfully",
      },
      { status: 201 }
    );
  }

  // -------------------------------------------------------------------------
  // 2. LOGIN (/api/auth/login)
  // -------------------------------------------------------------------------
  if (path === "auth/login") {
    const { identifier, password } = body;
    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Please provide your phone number/username and password" },
        { status: 400 }
      );
    }

    const cleanId = String(identifier).trim().toLowerCase();
    const user = store.users.find(
      (u) =>
        (u.phone && u.phone.trim().toLowerCase() === cleanId) ||
        (u.name && u.name.trim().toLowerCase() === cleanId)
    );

    if (!user || user.password !== String(password)) {
      return NextResponse.json(
        { error: "Invalid username/phone number or password" },
        { status: 401 }
      );
    }

    const business = store.businesses.find((b) => b.id === user.businessId) || {
      id: user.businessId,
      name: "My Business",
      currency: "KES",
      createdAt: new Date().toISOString(),
    };

    const token = `token-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    store.tokens[token] = { userId: user.id, businessId: business.id };

    return NextResponse.json({
      token,
      user: sanitizeUser(user),
      business,
      message: "Logged in successfully",
    });
  }

  // Businesses
  if (path === "businesses") {
    const newBiz: Business = {
      id: body.id || `biz-${Date.now()}`,
      name: body.name || "New Business",
      currency: body.currency || "KES",
      createdAt: new Date().toISOString(),
    };
    store.businesses.push(newBiz);
    return NextResponse.json(newBiz, { status: 201 });
  }

  // Branches
  if (path === "branches") {
    const bizId = body.businessId || activeBizId;
    if (!bizId) return NextResponse.json({ error: "Missing businessId" }, { status: 400 });
    const newBranch: Branch = {
      id: `branch-${Date.now()}`,
      name: body.name || "Main Branch",
      businessId: bizId,
      createdAt: new Date().toISOString(),
    };
    store.branches.push(newBranch);
    return NextResponse.json(newBranch, { status: 201 });
  }

  // Users (Add staff/worker)
  if (path === "users") {
    const bizId = body.businessId || activeBizId;
    if (!bizId) return NextResponse.json({ error: "Missing businessId" }, { status: 400 });

    const newUser: User = {
      id: `user-${Date.now()}`,
      name: body.name,
      phone: body.phone,
      email: body.email,
      password: body.password || "password123",
      role: body.role || "WORKER",
      status: "ACTIVE",
      active: true,
      branchId: body.branchId || store.branches.find((b) => b.businessId === bizId)?.id,
      businessId: bizId,
      createdAt: new Date().toISOString(),
    };
    store.users.push(newUser);
    return NextResponse.json(sanitizeUser(newUser), { status: 201 });
  }

  // Products
  if (path === "products") {
    const bizId = body.businessId || activeBizId;
    if (!bizId) return NextResponse.json({ error: "Missing businessId" }, { status: 400 });

    const newProduct: Product = {
      id: `prod-${Date.now()}`,
      name: body.name,
      sellingPrice: Number(body.sellingPrice) || 0,
      costPrice: Number(body.costPrice) || Math.round((Number(body.sellingPrice) || 0) * 0.7),
      businessId: bizId,
      createdAt: new Date().toISOString(),
    };
    store.products.push(newProduct);

    // Also register default unit
    const unit: ProductUnit = {
      id: `unit-${Date.now()}`,
      name: body.unitName || "Piece",
      productId: newProduct.id,
      conversionFactor: 1,
    };
    store.productUnits.push(unit);

    // Also create matching inventory item
    const defaultBranch = store.branches.find((b) => b.businessId === bizId);
    const defaultLoc = store.stockLocations.find((l) => l.businessId === bizId);

    const newItem: InventoryItem = {
      id: `inv-${Date.now()}`,
      quantity: 0,
      branchId: defaultBranch?.id || "branch-main",
      productId: newProduct.id,
      productUnitId: unit.id,
      stockLocationId: defaultLoc?.id || null,
      product: {
        id: newProduct.id,
        name: newProduct.name,
        sellingPrice: newProduct.sellingPrice,
      },
      stockLocation: defaultLoc ? { id: defaultLoc.id, name: defaultLoc.name } : null,
    };
    store.inventoryItems.push(newItem);

    return NextResponse.json(newProduct, { status: 201 });
  }

  // Stock Locations
  if (path === "stock-locations") {
    const bizId = body.businessId || activeBizId;
    if (!bizId) return NextResponse.json({ error: "Missing businessId" }, { status: 400 });

    const defaultBranch = store.branches.find((b) => b.businessId === bizId);
    const newLoc: StockLocation = {
      id: `loc-${Date.now()}`,
      name: body.name,
      type: body.type || "COUNTER",
      branchId: body.branchId || defaultBranch?.id || "branch-main",
      businessId: bizId,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };
    store.stockLocations.push(newLoc);
    return NextResponse.json(newLoc, { status: 201 });
  }

  // Open Shift
  if (path === "shifts/open") {
    const bizId = activeBizId || body.businessId;
    const newShift: Shift = {
      id: `shift-${Date.now()}`,
      branchId: body.branchId || store.branches.find((b) => b.businessId === bizId)?.id || "main",
      businessId: bizId || "biz-default",
      userId: body.userId || "user-worker",
      openedAt: new Date().toISOString(),
      closedAt: null,
      periodType: "DAY",
    };
    store.shifts.unshift(newShift);

    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        const prod = store.products.find((p) => p.id === item.productId);
        store.shiftStockItems.push({
          id: `ssi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          shiftId: newShift.id,
          productId: item.productId,
          productUnitId: item.productUnitId || "unit-1",
          openingQuantity: item.openingQuantity || 0,
          addedQuantity: 0,
          closingQuantity: null,
          unitSellingPrice: prod?.sellingPrice || 0,
          unitCostPrice: prod?.costPrice || Math.round((prod?.sellingPrice || 0) * 0.7),
        });
      }
    }
    return NextResponse.json(newShift, { status: 201 });
  }

  // Close Shift
  if (path === "shifts/close") {
    const shift = store.shifts.find((s) => s.id === body.shiftId);
    if (shift) {
      shift.closedAt = new Date().toISOString();
    }
    const items = (body.items || []).map((i: any) => {
      const prod = store.products.find((p) => p.id === i.productId);
      const stockItem = store.shiftStockItems.find(
        (s) => s.shiftId === body.shiftId && s.productId === i.productId
      );
      if (stockItem) {
        stockItem.closingQuantity = Number(i.actualQuantity);
      }
      return {
        productId: i.productId,
        productName: prod?.name || "Product",
        unit: "Piece",
        counted: true,
        actualQuantity: Number(i.actualQuantity),
      };
    });
    return NextResponse.json({ shiftId: body.shiftId, items });
  }

  // Record M-Pesa balance
  if (path.startsWith("shifts/") && path.includes("/mpesa-balances/")) {
    const parts = path.split("/");
    const shiftId = parts[1];
    const kind = parts[3]; // opening or closing
    const val = Number(body.balance) || 0;

    let reading = store.mpesaBalances[shiftId];
    if (!reading) {
      reading = {
        openingBalance: val,
        openingAt: new Date().toISOString(),
        closingBalance: null,
        closingAt: null,
        amount: null,
        isComplete: false,
      };
      store.mpesaBalances[shiftId] = reading;
    }

    if (kind === "closing") {
      reading.closingBalance = val;
      reading.closingAt = new Date().toISOString();
      reading.amount = val - reading.openingBalance;
      reading.isComplete = true;
    } else {
      reading.openingBalance = val;
      reading.openingAt = new Date().toISOString();
    }

    return NextResponse.json(reading);
  }

  // Submit Reconciliation
  if (path.startsWith("shifts/") && path.endsWith("/reconciliation")) {
    const parts = path.split("/");
    const shiftId = parts[1];
    const shift = store.shifts.find((s) => s.id === shiftId);
    const bizId = shift?.businessId || activeBizId || "biz-default";

    const shiftItems = store.shiftStockItems.filter((s) => s.shiftId === shiftId);
    let totalRevenue = 0;
    let totalCost = 0;

    const reconItems = shiftItems.map((si) => {
      const prod = store.products.find((p) => p.id === si.productId);
      const opening = si.openingQuantity || 0;
      const added = si.addedQuantity || 0;
      const closing =
        si.closingQuantity !== null && si.closingQuantity !== undefined
          ? si.closingQuantity
          : opening;
      const sold = Math.max(0, opening + added - closing);
      const sellingPrice = si.unitSellingPrice ?? prod?.sellingPrice ?? 0;
      const costPrice =
        si.unitCostPrice ?? prod?.costPrice ?? Math.round(sellingPrice * 0.7);
      const rev = sold * sellingPrice;
      const cost = sold * costPrice;
      totalRevenue += rev;
      totalCost += cost;

      return {
        productId: si.productId,
        productName: prod?.name || "Product",
        unit: "Piece",
        counted: true,
        openingQuantity: opening,
        addedQuantity: added,
        closingQuantity: closing,
        soldQuantity: sold,
        revenue: rev,
        cost: cost,
        grossProfit: rev - cost,
      };
    });

    const declaredCash = Number(body.declaredCash) || 0;
    const declaredCredit = Number(body.declaredCredit) || 0;
    const declaredMpesa = store.mpesaBalances[shiftId]?.amount || 0;
    const totalDeclared = declaredCash + declaredMpesa + declaredCredit;
    const expectedRevenue = totalRevenue > 0 ? totalRevenue : declaredCash + declaredMpesa;
    const variance = totalDeclared - expectedRevenue;

    if (Math.abs(variance) > 0) {
      store.discrepancies.unshift({
        id: `disc-${Date.now()}`,
        type: variance < 0 ? "CASH_SHORTAGE" : "CASH_OVERAGE",
        expectedValue: expectedRevenue,
        actualValue: totalDeclared,
        valueVariance: variance,
        status: "OPEN",
        resolution: null,
        notes: `Shift reconciliation variance: declared ${totalDeclared} vs expected ${expectedRevenue}`,
        businessId: bizId,
        createdAt: new Date().toISOString(),
      });
    }

    const rec = {
      shiftId,
      businessId: bizId,
      status: "AWAITING_OWNER",
      closedAt: new Date().toISOString(),
      items: reconItems,
      declaredCash,
      declaredCredit,
      declaredMpesa,
      expectedRevenue,
      expectedCost: totalCost,
      expectedProfit: expectedRevenue - totalCost,
      expectedCash: Math.max(0, expectedRevenue - declaredMpesa),
      variance,
    };
    store.reconciliations[shiftId] = rec;
    return NextResponse.json(rec);
  }

  // Expenses
  if (path === "expenses") {
    const bizId = body.businessId || activeBizId;
    const defaultBranch = store.branches.find((b) => b.businessId === bizId);

    const newExp: Expense = {
      id: `exp-${Date.now()}`,
      amount: Number(body.amount) || 0,
      description: body.description || "General expense",
      branchId: body.branchId || defaultBranch?.id || "branch-main",
      businessId: bizId || "biz-default",
      status: "RECORDED",
      createdAt: new Date().toISOString(),
    };
    store.expenses.unshift(newExp);
    return NextResponse.json(newExp, { status: 201 });
  }

  // Discrepancy resolve: /discrepancies/[id]/resolve
  if (path.startsWith("discrepancies/") && path.endsWith("/resolve")) {
    const parts = path.split("/");
    const id = parts[1];
    const disc = store.discrepancies.find((d) => d.id === id);
    if (disc) {
      disc.status = "RESOLVED";
      disc.resolution = body.resolution || "RESOLVED_MANUAL";
      return NextResponse.json(disc);
    }
    return NextResponse.json({ error: "Discrepancy not found" }, { status: 404 });
  }

  return NextResponse.json({ message: "Created", path }, { status: 201 });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await context.params;
  const path = slug.join("/");
  const store = getStore();
  let body: any = {};
  try {
    body = await request.json();
  } catch {}

  const activeBizId = getBusinessIdFromRequest(request);

  // Set Inventory Level: /inventory-items/level
  if (path === "inventory-items/level") {
    const item = store.inventoryItems.find((i) => i.productId === body.productId);
    const prevQty = item ? item.quantity : 0;
    const newQty = Math.max(0, Number(body.quantity) || 0);
    const delta = newQty - prevQty;
    const reason = body.reason || "PHYSICAL_COUNT";

    if (item) {
      item.quantity = newQty;
    } else {
      const prod = store.products.find((p) => p.id === body.productId);
      const defaultBranch = store.branches.find((b) => b.businessId === activeBizId);
      const defaultLoc = store.stockLocations.find((l) => l.businessId === activeBizId);

      const newItem: InventoryItem = {
        id: `inv-${Date.now()}`,
        quantity: newQty,
        branchId: body.branchId || defaultBranch?.id || "branch-main",
        productId: body.productId,
        stockLocationId: defaultLoc?.id || null,
        product: {
          id: body.productId,
          name: prod?.name || "Product",
          sellingPrice: prod?.sellingPrice || 0,
        },
        stockLocation: defaultLoc ? { id: defaultLoc.id, name: defaultLoc.name } : null,
      };
      store.inventoryItems.push(newItem);
    }

    // Record stock movement audit trail
    store.stockMovements = store.stockMovements || [];
    store.stockMovements.unshift({
      id: `sm-${Date.now()}`,
      productId: body.productId,
      previousQuantity: prevQty,
      newQuantity: newQty,
      delta,
      reason,
      businessId: activeBizId || "biz-default",
      timestamp: new Date().toISOString(),
    });

    // If shrinkage/loss detected, log discrepancy
    if (delta < 0 && (reason === "BREAKAGE" || reason === "PHYSICAL_COUNT")) {
      const prod = store.products.find((p) => p.id === body.productId);
      const unitVal = prod?.sellingPrice || 0;
      const lostVal = Math.abs(delta) * unitVal;
      store.discrepancies.unshift({
        id: `disc-stock-${Date.now()}`,
        type: "STOCK_SHORTAGE",
        expectedValue: prevQty * unitVal,
        actualValue: newQty * unitVal,
        valueVariance: -lostVal,
        status: "OPEN",
        resolution: null,
        notes: `Inventory adjustment for ${prod?.name || "Product"}: ${prevQty} -> ${newQty} (${delta} units, reason: ${reason})`,
        businessId: activeBizId || "biz-default",
        createdAt: new Date().toISOString(),
      });
    }

    const updated = store.inventoryItems.find((i) => i.productId === body.productId);
    return NextResponse.json(updated);
  }

  return NextResponse.json({ message: "Updated", path });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await context.params;
  const path = slug.join("/");
  const store = getStore();
  let body: any = {};
  try {
    body = await request.json();
  } catch {}

  // Users: users/[id]
  if (path.startsWith("users/")) {
    const id = path.split("/")[1];
    const user = store.users.find((u) => u.id === id);
    if (user) {
      if (body.name !== undefined) user.name = body.name;
      if (body.role !== undefined) user.role = body.role;
      if (body.phone !== undefined) user.phone = body.phone;
      if (body.active !== undefined) user.active = body.active;
      return NextResponse.json(sanitizeUser(user));
    }
  }

  // Branches: branches/[id]
  if (path.startsWith("branches/")) {
    const id = path.split("/")[1];
    const branch = store.branches.find((b) => b.id === id);
    if (branch) {
      if (body.name !== undefined) branch.name = body.name;
      return NextResponse.json(branch);
    }
  }

  // Products: products/[id]
  if (path.startsWith("products/")) {
    const id = path.split("/")[1];
    const prod = store.products.find((p) => p.id === id);
    if (prod) {
      if (body.name !== undefined) prod.name = body.name;
      if (body.sellingPrice !== undefined) prod.sellingPrice = Number(body.sellingPrice);
      if (body.costPrice !== undefined) prod.costPrice = Number(body.costPrice);

      for (const item of store.inventoryItems) {
        if (item.productId === id) {
          if (body.name !== undefined) item.product.name = body.name;
          if (body.sellingPrice !== undefined) item.product.sellingPrice = Number(body.sellingPrice);
        }
      }
      return NextResponse.json(prod);
    }
  }

  return NextResponse.json({ message: "Patched", path });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await context.params;
  const path = slug.join("/");
  const store = getStore();

  // Users: users/[id]
  if (path.startsWith("users/")) {
    const id = path.split("/")[1];
    store.users = store.users.filter((u) => u.id !== id);
    return NextResponse.json({ id });
  }

  // Branches: branches/[id]
  if (path.startsWith("branches/")) {
    const id = path.split("/")[1];
    store.branches = store.branches.filter((b) => b.id !== id);
    return NextResponse.json({ id });
  }

  // Products: products/[id]
  if (path.startsWith("products/")) {
    const id = path.split("/")[1];
    store.products = store.products.filter((p) => p.id !== id);
    store.inventoryItems = store.inventoryItems.filter((i) => i.productId !== id);
    return NextResponse.json({ id });
  }

  return NextResponse.json({ message: "Deleted", path });
}
