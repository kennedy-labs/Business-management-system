"use client";

/**
 * Opening count: "what were you given?"
 *
 * The worker counts what physically sits on the counter and confirms it. Rows
 * come prefilled with the expected level, so the honest default is one tap and
 * a mismatch is the only thing that needs typing. This is the ritual that
 * makes the worker accountable for exactly this stock — nothing more.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import {
  getBranches,
  getInventoryItems,
  openShift,
} from "@/lib/api/worker";
import {
  BigButton,
  Card,
  CountRow,
  ErrorNote,
  WorkerShell,
} from "@/components/worker/ui";

export default function OpenShiftScreen() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId || "";
  const userId = user?.id || "";

  const inventory = useQuery({
    queryKey: ["inventoryItems"],
    queryFn: getInventoryItems,
    // A worker opening the period must not see a stale "no stock" claim from
    // an earlier failed request: refetch when the screen is focused.
    refetchOnMount: "always",
  });
  const branches = useQuery({ queryKey: ["branches"], queryFn: getBranches });

  const [counts, setCounts] = useState<Record<string, string>>({});
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Stock exists inside a branch: only the chosen branch's rows count.
  const rows = useMemo(
    () => (inventory.data ?? []).filter((i) => i.branchId === branchId),
    [inventory.data, branchId],
  );

  // Switching branches resets the count so one branch's numbers never
  // leak into another's.
  useEffect(() => {
    setCounts({});
  }, [branchId]);

  // Prefill every row with the expected level: the default is "as handed over".
  useEffect(() => {
    setCounts((prev) => {
      const next = { ...prev };
      for (const item of rows) {
        if (next[item.id] === undefined) next[item.id] = String(item.quantity);
      }
      return next;
    });
  }, [rows]);

  // Single branch: preselected, shown as a fact rather than a question.
  useEffect(() => {
    if (branches.data?.length === 1) setBranchId(branches.data[0].id);
  }, [branches.data]);

  const open = useMutation({
    mutationFn: () => {
      const items = rows
        .filter((i) => (counts[i.id] ?? "").trim() !== "")
        .map((i) => ({
          productId: i.productId,
          productUnitId: i.productUnitId,
          stockLocationId: i.stockLocationId ?? undefined,
          businessId,
          branchId,
          openingQuantity: Number(counts[i.id]),
        }));
      if (!branchId) throw new Error("Choose the branch you are working from.");
      if (items.length === 0)
        throw new Error("Count at least one product to open the period.");
      return openShift(branchId, userId, items);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift"] }),
    onError: (e: Error) => setError(e.message),
  });

  const countedRows = rows.filter((r) => (counts[r.id] ?? "").trim() !== "").length;

  return (
    <WorkerShell
      title="Open the period"
      subtitle="Count what you were given, then start"
      footer={
        <BigButton
          onClick={() => {
            setError(null);
            open.mutate();
          }}
          pending={open.isPending}
        >
          Open period ({countedRows} items)
        </BigButton>
      }
    >
      <ErrorNote message={error} />

      {branches.isLoading ? null : (branches.data?.length ?? 0) === 0 ? (
        <Card title="Branch">
          <p className="text-slate-500">
            No branches exist yet. Ask the owner to add one first.
          </p>
        </Card>
      ) : (branches.data?.length ?? 0) > 1 ? (
        <Card title="Branch">
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
          >
            <option value="">Choose branch…</option>
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Card>
      ) : (
        <p className="text-sm text-slate-500">📍 {branches.data![0].name}</p>
      )}

      <Card title="Opening count">
        {inventory.isError ? (
          <p className="text-rose-700">
            Could not reach the backend to load stock. Check that it is running,
            then pull to refresh.
          </p>
        ) : inventory.isLoading || branches.isLoading ? (
          <p className="text-slate-500">Loading stock…</p>
        ) : !branchId ? (
          <p className="text-slate-500">
            Choose your branch first — stock lives inside a branch.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-slate-500">
            No stock has been set for this branch yet. Ask the owner to set
            inventory levels first.
          </p>
        ) : (
          <div className="space-y-2">
            {inventory.data!.map((item) => (
              <CountRow
                key={item.id}
                name={item.product.name}
                expected={item.quantity}
                value={counts[item.id] ?? ""}
                onChange={(next) =>
                  setCounts({ ...counts, [item.id]: next })
                }
              />
            ))}
          </div>
        )}
      </Card>
    </WorkerShell>
  );
}
