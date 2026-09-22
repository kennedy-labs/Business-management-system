"use client";

/**
 * Closing count: "what are you handing back?"
 *
 * The mirror of the opening count. Each row is expected = opening + added;
 * the worker enters the physical count (blank = not counted, which the
 * backend records as `counted:false` rather than inventing a sale). The
 * handover posts the real close payload — counts, additions, per-item truth.
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Shift, ShiftStockItemRow } from "@/lib/api/worker";
import { closeShift } from "@/lib/api/worker";
import {
  BigButton,
  Card,
  CountRow,
  ErrorNote,
  WorkerShell,
} from "@/components/worker/ui";

export default function ClosingScreen({
  shift,
  items,
  products,
}: {
  shift: Shift;
  items: ShiftStockItemRow[];
  products: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? "Product";

  // counted: blank means "not counted" (honest absence, not a zero sale).
  const [counts, setCounts] = useState<Record<string, string>>({});
  // added: mid-shift deliveries the worker received for these products.
  const [added, setAdded] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Prefill "added" from what the period already knows; counted stays blank
  // so the worker must physically count rather than confirm a guess.
  useEffect(() => {
    const nextAdded: Record<string, string> = {};
    for (const item of items) {
      nextAdded[item.id] = String(item.addedQuantity ?? 0);
    }
    setAdded(nextAdded);
  }, [items]);

  const close = useMutation({
    mutationFn: () => {
      const payload = items
        .filter((i) => (counts[i.id] ?? "").trim() !== "")
        .map((i) => ({
          productId: i.productId,
          productUnitId: i.productUnitId,
          actualQuantity: Number(counts[i.id]),
          addedQuantity: Number(added[i.id] ?? 0) || undefined,
        }));
      if (payload.length === 0)
        throw new Error(
          "Count at least one product, or the period closes with nothing handed back.",
        );
      return closeShift(shift.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift"] });
      qc.invalidateQueries({ queryKey: ["reconciliation", shift.id] });
      qc.invalidateQueries({ queryKey: ["inventoryItems"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const countedRows = items.filter((i) => (counts[i.id] ?? "") !== "").length;

  return (
    <WorkerShell
      title="Hand back stock"
      subtitle={`Period · ${shift.id.slice(0, 8)}`}
      footer={
        <BigButton
          onClick={() => {
            setError(null);
            close.mutate();
          }}
          pending={close.isPending}
        >
          Submit handover ({countedRows} counted)
        </BigButton>
      }
    >
      <ErrorNote message={error} />

      <Card title="Closing count">
        {items.length === 0 ? (
          <p className="text-slate-500">
            This period has no stock rows. Nothing to hand back.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="space-y-1">
                <CountRow
                  name={productName(item.productId)}
                  expected={
                    item.openingQuantity + Number(added[item.id] ?? 0)
                  }
                  value={counts[item.id] ?? ""}
                  onChange={(next) => setCounts({ ...counts, [item.id]: next })}
                />
                <label className="flex items-center justify-end gap-2 text-xs text-slate-500">
                  Added during period:
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={added[item.id] ?? "0"}
                    onChange={(e) =>
                      setAdded({ ...added, [item.id]: e.target.value })
                    }
                    className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-right tabular-nums"
                  />
                </label>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-500">
        Leave a product blank if you were not able to count it — it will be
        marked “not counted” instead of being guessed as sold.
      </p>
    </WorkerShell>
  );
}
