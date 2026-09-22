/**
 * The worker's API surface.
 *
 * Every function maps 1:1 to an endpoint that already exists on the backend —
 * this layer translates business reality into calls, nothing more. Types mirror
 * the backend's own view types so a backend change that breaks the worker UI
 * becomes a compile error instead of a silent wrong number.
 */
import api from "./api";

// ---------------------------------------------------------------------------
// Types (mirrors of the backend views)
// ---------------------------------------------------------------------------

export type Shift = {
  id: string;
  branchId: string;
  userId: string;
  openedAt: string;
  closedAt: string | null;
  periodType?: string;
};

export type InventoryItemRow = {
  id: string;
  quantity: number;
  branchId: string;
  productId: string;
  productUnitId: string;
  stockLocationId: string | null;
  product: { id: string; name: string; sellingPrice: number };
  stockLocation: { id: string; name: string } | null;
};

export type ShiftStockItemRow = {
  id: string;
  shiftId: string;
  productId: string;
  productUnitId: string;
  openingQuantity: number;
  addedQuantity: number | null;
  closingQuantity: number | null;
};

export type ProductRow = {
  id: string;
  name: string;
  sellingPrice: number;
};

export type BranchRow = { id: string; name: string };

export type MpesaBalanceView = {
  openingBalance: number;
  openingAt: string;
  closingBalance: number | null;
  closingAt: string | null;
  /** closing − opening. Null until the closing reading exists. */
  amount: number | null;
  isComplete: boolean;
};

export type MpesaBalances = {
  shiftId: string;
  balances: MpesaBalanceView[];
  totals: { declaredMpesa: number; isComplete: boolean };
};

export type ReconciliationItem = {
  productId: string;
  productName: string;
  unit: string;
  counted: boolean;
  openingQuantity?: number;
  addedQuantity?: number;
  closingQuantity?: number;
  soldQuantity?: number;
  revenue?: number;
  cost?: number;
  grossProfit?: number;
};

export type ReconciliationView = {
  shiftId: string;
  status: string;
  closedAt: string | null;
  items: ReconciliationItem[];
  declaredCash: number;
  declaredCredit: number;
  declaredMpesa: number;
  expectedRevenue: number;
  expectedCost: number;
  expectedProfit: number;
  expectedCash: number;
  variance: number;
};

/** One row of the worker's opening count: what they were handed. */
export type OpenShiftItem = {
  productId: string;
  productUnitId: string;
  stockLocationId?: string;
  businessId: string;
  branchId: string;
  openingQuantity: number;
};

/** One row of the worker's closing count: what they are handing back. */
export type CloseShiftItem = {
  productId: string;
  productUnitId: string;
  actualQuantity: number;
  addedQuantity?: number;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getShifts() {
  return (await api.get<Shift[]>("/shifts")).data;
}

/** The one open period, or null when the day has not been opened yet. */
export function findOpenShift(shifts: Shift[]) {
  return shifts.find((s) => !s.closedAt) ?? null;
}

export async function getShiftStockItems() {
  return (await api.get<ShiftStockItemRow[]>("/shift-stock-items")).data;
}

export async function getInventoryItems() {
  return (await api.get<InventoryItemRow[]>("/inventory-items")).data;
}

export async function getProducts() {
  return (await api.get<ProductRow[]>("/products")).data;
}

export async function getBranches() {
  return (await api.get<BranchRow[]>("/branches")).data;
}

export async function getMpesaBalances(shiftId: string) {
  return (await api.get<MpesaBalances>(`/shifts/${shiftId}/mpesa-balances`))
    .data;
}

/** 404s before the worker submits — callers treat that as "no view yet". */
export async function getReconciliationView(shiftId: string) {
  try {
    return (await api.get<ReconciliationView>(`/shifts/${shiftId}/reconciliation`))
      .data;
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      (error as { response?: { status?: number } }).response?.status === 404
    ) {
      return null;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function openShift(branchId: string, userId: string, items: OpenShiftItem[]) {
  return (await api.post<Shift>("/shifts/open", { branchId, userId, items })).data;
}

export async function closeShift(shiftId: string, items: CloseShiftItem[]) {
  return (
    await api.post<{ shiftId: string; items: ReconciliationItem[] }>(
      "/shifts/close",
      { shiftId, items },
    )
  ).data;
}

export async function recordMpesaBalance(
  shiftId: string,
  kind: "opening" | "closing",
  balance: number,
) {
  return (
    await api.post<MpesaBalanceView>(
      `/shifts/${shiftId}/mpesa-balances/${kind}`,
      { balance },
    )
  ).data;
}

export async function submitReconciliation(
  shiftId: string,
  body: { declaredCash: number; declaredCredit?: number; notes?: string },
) {
  return (
    await api.post<ReconciliationView>(`/shifts/${shiftId}/reconciliation`, body)
  ).data;
}

export async function recordExpense(body: {
  amount: number;
  description?: string;
  branchId: string;
  createdById?: string;
}) {
  return (await api.post("/expenses", body)).data;
}

/** Mid-shift stock correction (delivery received, damage, spillage). */
export async function setInventoryLevel(body: {
  productId: string;
  quantity: number;
  branchId?: string;
}) {
  return (await api.put("/inventory-items/level", body)).data;
}
