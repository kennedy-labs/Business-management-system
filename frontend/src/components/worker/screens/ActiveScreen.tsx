"use client";

/**
 * Active period: record what happens.
 *
 * Three physical acts, three tiles — expenses, stock changes, M-Pesa readings —
 * plus the one exit that leads to the closing count. The context (which
 * period, which branch) is a fact shown at the top, never a question asked of
 * the worker, and the M-Pesa card is state-aware: opening reading first,
 * closing reading second, delta displayed once both exist.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MpesaBalances, Shift } from "@/lib/api/worker";
import { recordMpesaBalance } from "@/lib/api/worker";
import {
  BigButton,
  Card,
  ErrorNote,
  MoneyInput,
  fmt,
  timeOf,
} from "@/components/worker/ui";
import { ExpenseCard, StockCard } from "./ActiveCards";

export default function ActiveScreen({
  shift,
  items,
  balances,
  onCloseRequest,
}: {
  shift: Shift;
  items: { id: string }[];
  balances: MpesaBalances | null;
  onCloseRequest: () => void;
}) {
  return (
    <>
      {/* Context header facts: the worker never picks these. */}
      <div className="rounded-2xl bg-slate-900 text-white px-4 py-3 text-sm flex justify-between gap-2">
        <span>Period · {shift.id.slice(0, 8)}</span>
        <span>
          Opened {timeOf(shift.openedAt)} · {items.length} products
        </span>
      </div>

      <MpesaCard shiftId={shift.id} balances={balances} />
      <ExpenseCard shift={shift} />
      <StockCard shift={shift} />

      <Card>
        <p className="text-sm text-slate-500">
          Done for this period? Count the stock you are handing back, then
          declare the money.
        </p>
        <BigButton onClick={onCloseRequest}>Count &amp; close period</BigButton>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// M-Pesa: one reading pair per period. Opening → closing → derived delta.
// ---------------------------------------------------------------------------

function MpesaCard({
  shiftId,
  balances,
}: {
  shiftId: string;
  balances: MpesaBalances | null;
}) {
  const qc = useQueryClient();
  const reading = balances?.balances[0] ?? null;
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nextKind: "opening" | "closing" | null = !reading
    ? "opening"
    : !reading.isComplete
      ? "closing"
      : null;

  const record = useMutation({
    mutationFn: () => {
      if (!value.trim()) throw new Error("Enter the balance shown on your phone.");
      return recordMpesaBalance(shiftId, nextKind!, Number(value));
    },
    onSuccess: () => {
      setValue("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["mpesaBalances", shiftId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Card title="📱 M-Pesa">
      <ErrorNote message={error} />
      {!reading ? (
        <>
          <p className="text-sm text-slate-500">
            Check the M-Pesa balance on the shop phone and read it out here.
          </p>
          <MoneyInput
            label="Opening balance"
            value={value}
            onChange={setValue}
            placeholder="e.g. 6005"
          />
          <BigButton onClick={() => record.mutate()} pending={record.isPending}>
            Record opening balance
          </BigButton>
        </>
      ) : !reading.isComplete ? (
        <>
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
            Opening: <strong>{fmt(reading.openingBalance)}</strong> at{" "}
            {timeOf(reading.openingAt)}
          </div>
          <MoneyInput
            label="Closing balance"
            value={value}
            onChange={setValue}
            placeholder="e.g. 16005"
          />
          <BigButton onClick={() => record.mutate()} pending={record.isPending}>
            Record closing balance
          </BigButton>
        </>
      ) : (
        <div className="space-y-1">
          <p className="text-2xl font-bold text-emerald-700 tabular-nums">
            {fmt(reading.amount)}
          </p>
          <p className="text-xs text-slate-500">
            {fmt(reading.openingBalance)} → {fmt(reading.closingBalance)} · this
            is the M-Pesa money the owner will see.
          </p>
        </div>
      )}
    </Card>
  );
}
