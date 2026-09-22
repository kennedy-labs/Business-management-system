"use client";

/**
 * Result: the truth, rendered.
 *
 * This screen exists because the blueprint's chain ends with "Automatic
 * Calculations → Owner receives business information". No JSON dumps — the
 * period's numbers, formatted, with the variance the owner will act on.
 */
import type { ReconciliationView } from "@/lib/api/worker";
import { Card, Stat, fmt, timeOf } from "@/components/worker/ui";

export default function ResultScreen({ view }: { view: ReconciliationView }) {
  const notCounted = view.items.filter((i) => !i.counted);
  const variance = view.variance;

  return (
    <>
      <div className="rounded-2xl bg-emerald-600 text-white px-4 py-5 text-center">
        <div className="text-3xl font-bold">Period complete ✓</div>
        <div className="text-sm text-emerald-100 mt-1">
          Closed {timeOf(view.closedAt)} · sent for owner review
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Revenue" value={fmt(view.expectedRevenue)} />
        <Stat label="Cost" value={fmt(view.expectedCost)} />
        <Stat label="Gross profit" value={fmt(view.expectedProfit)} tone="good" />
        <Stat label="M-Pesa taken" value={fmt(view.declaredMpesa)} />
      </div>

      <Card title="Money declaration">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Cash declared</span>
            <strong className="tabular-nums">{fmt(view.declaredCash)}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Credit declared</span>
            <strong className="tabular-nums">{fmt(view.declaredCredit)}</strong>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1">
            <span className="text-slate-500">Variance</span>
            <strong
              className={`tabular-nums ${variance < 0 ? "text-rose-700" : variance > 0 ? "text-emerald-700" : ""}`}
            >
              {fmt(variance)}
            </strong>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          {variance === 0
            ? "Money matches the stock. The owner just confirms."
            : variance < 0
              ? "Less money than the stock says you sold — the owner will see this."
              : "More money than the stock says you sold — the owner will see this."}
        </p>
      </Card>

      {notCounted.length > 0 ? (
        <Card title="Not counted">
          <ul className="text-sm text-slate-600 list-disc pl-5 space-y-0.5">
            {notCounted.map((i) => (
              <li key={i.productId}>{i.productName}</li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">
            These were marked “not counted”, not guessed as sold.
          </p>
        </Card>
      ) : null}
    </>
  );
}
