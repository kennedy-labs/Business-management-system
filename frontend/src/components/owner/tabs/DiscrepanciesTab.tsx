"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useState } from "react";
import { Receipt, X } from "lucide-react";

type Discrepancy = {
  id: string;
  type:
    | "STOCK_SHORTAGE"
    | "CASH_SHORTAGE"
    | "CASH_OVERAGE"
    | "MPESA_MISMATCH"
    | "TRANSFER_MISMATCH"
    | "UNCONFIRMED_ADDITION";
  notes?: string;
  expectedValue: number | string;
  actualValue: number | string;
  valueVariance: number | string;
  status: "OPEN" | "RESOLVED";
  resolution?: string;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  STOCK_SHORTAGE: "Stock Shortage",
  CASH_SHORTAGE: "Cash Shortage",
  CASH_OVERAGE: "Cash Overage",
  MPESA_MISMATCH: "M-Pesa Mismatch",
  TRANSFER_MISMATCH: "Transfer Mismatch",
  UNCONFIRMED_ADDITION: "Unconfirmed Addition",
};

export default function DiscrepanciesTab() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId as string | undefined;
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "RESOLVED">("ALL");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState("");
  const enabled = !!businessId;

  const { data: items, isLoading } = useQuery({
    queryKey: ["discrepancies", businessId],
    queryFn: async () =>
      (await api.get("/discrepancies", { params: { businessId } }))
        .data as Discrepancy[],
    enabled,
  });

  const resolve = useMutation({
    mutationFn: async ({ id, resolution }: { id: string; resolution: string }) =>
      (
        await api.post(`/discrepancies/${id}/resolve`, { resolution }, {
          params: { businessId },
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discrepancies", businessId] });
      setResolvingId(null);
      setResolutionText("");
    },
  });

  const list = (items ?? []).filter((d) =>
    filter === "ALL" ? true : d.status === filter,
  );
  const openCount = (items ?? []).filter((d) => d.status === "OPEN").length;
  const resolvedCount = (items ?? []).filter((d) => d.status === "RESOLVED").length;

  if (!businessId) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
        <span>Loading discrepancies...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-100">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Discrepancies & Variances
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Review cash shortages, unrecorded stock differences, and shift reconciliation variances.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setFilter("ALL")}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            filter === "ALL"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800"
          }`}
        >
          All ({(items ?? []).length})
        </button>
        <button
          onClick={() => setFilter("OPEN")}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            filter === "OPEN"
              ? "bg-red-600 text-white shadow-md shadow-red-600/30"
              : "bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800"
          }`}
        >
          Open ({openCount})
        </button>
        <button
          onClick={() => setFilter("RESOLVED")}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            filter === "RESOLVED"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
              : "bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800"
          }`}
        >
          Resolved ({resolvedCount})
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !list.length ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400">
          <Receipt className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="font-medium text-white">
            {filter === "ALL"
              ? "No discrepancies recorded. Clean operations!"
              : `No ${filter.toLowerCase()} discrepancies.`}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
          <table className="min-w-full divide-y divide-slate-800 text-left">
            <thead className="bg-slate-900 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Notes / Details</th>
                <th className="px-6 py-4 text-right">Expected</th>
                <th className="px-6 py-4 text-right">Actual</th>
                <th className="px-6 py-4 text-right">Variance</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-sm text-slate-200">
              {list.map((d) => {
                const varianceNum = Number(d.valueVariance);
                return (
                  <tr key={d.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-semibold text-white">
                      {TYPE_LABELS[d.type] ?? d.type}
                    </td>
                    <td className="px-6 py-4 text-slate-300 max-w-xs truncate">
                      {d.notes || "—"}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-300 font-mono">
                      KES {Number(d.expectedValue).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-300 font-mono">
                      KES {Number(d.actualValue).toLocaleString()}
                    </td>
                    <td
                      className={`px-6 py-4 text-right font-bold font-mono ${
                        varianceNum < 0 ? "text-rose-400" : "text-emerald-400"
                      }`}
                    >
                      {varianceNum > 0 ? "+" : ""}
                      {varianceNum.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          d.status === "RESOLVED"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {d.status === "OPEN" && (
                        <button
                          onClick={() => {
                            setResolvingId(d.id);
                            setResolutionText("Acknowledged by owner");
                          }}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow transition-colors cursor-pointer"
                        >
                          Resolve
                        </button>
                      )}
                      {d.status === "RESOLVED" && d.resolution && (
                        <span className="text-xs text-slate-400 italic" title={d.resolution}>
                          {d.resolution}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {resolvingId && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Resolve Discrepancy</h3>
              <button
                onClick={() => setResolvingId(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Resolution Note / Reason *
                </label>
                <input
                  type="text"
                  autoFocus
                  value={resolutionText}
                  onChange={(e) => setResolutionText(e.target.value)}
                  placeholder="e.g. Approved write-off, Staff reimbursed cash"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResolvingId(null)}
                  className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (resolutionText.trim()) {
                      resolve.mutate({ id: resolvingId, resolution: resolutionText.trim() });
                    }
                  }}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Confirm Resolve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
