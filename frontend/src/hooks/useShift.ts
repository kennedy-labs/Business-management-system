"use client";

/**
 * The worker's single source of truth.
 *
 * The worker UI is a state machine, and this hook is its state: which period is
 * open, what stock the worker is accountable for, where the M-Pesa readings
 * stand. Screens never keep their own notion of "where am I" — they render
 * whatever this hook says, which is what makes the opening → active → closing →
 * declare → done transitions impossible to skip.
 */
import { useQuery } from "@tanstack/react-query";
import {
  findOpenShift,
  getMpesaBalances,
  getProducts,
  getReconciliationView,
  getShiftStockItems,
  getShifts,
  type MpesaBalances,
  type ProductRow,
  type ReconciliationView,
  type Shift,
  type ShiftStockItemRow,
} from "@/lib/api/worker";

export type ShiftPhase =
  | "loading"
  | "no-period" // nothing open yet → opening count
  | "active" // period open → record what happens
  | "closing-pending" // stock handed back, money not yet declared
  | "submitted"; // money declared → result / awaiting owner

export type ShiftState = {
  phase: ShiftPhase;
  /** The open period, or the period that was just closed. */
  shift: Shift | null;
  /** The worker's stock accountability rows for the current period. */
  items: ShiftStockItemRow[];
  products: ProductRow[];
  balances: MpesaBalances | null;
  view: ReconciliationView | null;
  isLoading: boolean;
  isError: boolean;
};

export function useShift(): ShiftState {
  // The open (or most recently closed) period. Every other read depends on it.
  const shiftsQuery = useQuery({
    queryKey: ["shift"],
    queryFn: getShifts,
  });

  const shift = shiftsQuery.data ? findOpenShift(shiftsQuery.data) : null;
  const latest = shift ?? (shiftsQuery.data?.[0] ?? null);

  const itemsQuery = useQuery({
    queryKey: ["shiftStockItems", latest?.id],
    queryFn: getShiftStockItems,
    enabled: !!latest,
    select: (rows: ShiftStockItemRow[]) =>
      latest ? rows.filter((r) => r.shiftId === latest.id) : [],
  });

  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
    enabled: !!latest,
  });

  const balancesQuery = useQuery({
    queryKey: ["mpesaBalances", latest?.id],
    queryFn: () => getMpesaBalances(latest!.id),
    enabled: !!latest,
  });

  const viewQuery = useQuery({
    queryKey: ["reconciliation", latest?.id],
    queryFn: () => getReconciliationView(latest!.id),
    enabled: !!latest,
  });

  const phase = derivePhase({
    isLoading: shiftsQuery.isLoading,
    isError: shiftsQuery.isError,
    shift,
    latestClosed: shift ? null : (latest?.closedAt ? latest : null),
    view: viewQuery.data ?? null,
    isViewLoaded: !viewQuery.isLoading,
  });

  return {
    phase,
    shift: latest,
    items: itemsQuery.data ?? [],
    products: productsQuery.data ?? [],
    balances: balancesQuery.data ?? null,
    view: viewQuery.data ?? null,
    isLoading:
      shiftsQuery.isLoading ||
      (!!latest && (itemsQuery.isLoading || balancesQuery.isLoading)),
    isError: shiftsQuery.isError,
  };
}

function derivePhase(input: {
  isLoading: boolean;
  isError: boolean;
  shift: Shift | null;
  latestClosed: Shift | null;
  view: ReconciliationView | null;
  isViewLoaded: boolean;
}): ShiftPhase {
  if (input.isLoading) return "loading";
  if (input.isError) return "no-period";

  // An open period is active until its stock has been handed back.
  if (input.shift) return "active";

  // A just-closed period: money declaration is the only thing left.
  if (input.latestClosed) {
    const status = input.view?.status;
    if (input.view && status && status !== "AWAITING_WORKER") return "submitted";
    return "closing-pending";
  }

  return "no-period";
}
