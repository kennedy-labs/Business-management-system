"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api/api";
import { useAuthStore } from "@/store/useAuthStore";
import { Smartphone } from "lucide-react";

type ShiftRow = {
  id: string;
  periodType: string;
  openedAt: string;
  closedAt: string | null;
};

export default function PaymentsTab() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId as string | undefined;
  const enabled = !!businessId;

  const { data: shifts, isLoading: ls } = useQuery({
    queryKey: ["shifts", businessId],
    queryFn: async () =>
      (await api.get("/shifts", { params: { businessId } })).data as ShiftRow[],
    enabled,
  });

  const recentShifts = (shifts ?? []).slice(0, 15);
  const balancesByShift = useQuery({
    queryKey: ["mpesaBalances", businessId, recentShifts.map((s) => s.id).join(",")],
    queryFn: async () => {
      const results: Record<string, any> = {};
      await Promise.all(
        recentShifts.map(async (s) => {
          try {
            const res = await api.get(`/shifts/${s.id}/mpesa-balances`);
            results[s.id] = res.data?.totals?.declaredMpesa ?? 0;
          } catch {
            results[s.id] = 0;
          }
        }),
      );
      return results;
    },
    enabled: enabled && recentShifts.length > 0,
  });

  if (!businessId) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
        <span>Loading payments...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-100">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Payments & Mobile Money Audit
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Review M-Pesa till balances and declared shift amounts.
        </p>
      </div>

      <section className="space-y-4">
        {ls ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !recentShifts.length ? (
          <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400">
            <Smartphone className="w-10 h-10 mx-auto mb-3 text-slate-600" />
            <p className="font-medium text-white">No shift periods recorded yet</p>
            <p className="text-xs text-slate-400 mt-1">
              When counter staff open and close shifts, their till balance delta appears here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
            <table className="min-w-full divide-y divide-slate-800 text-left">
              <thead className="bg-slate-900 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">Opened</th>
                  <th className="px-6 py-4">Shift Period</th>
                  <th className="px-6 py-4">Status / Closed</th>
                  <th className="px-6 py-4 text-right">Net M-Pesa Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm text-slate-200">
                {recentShifts.map((s) => {
                  const mpesaAmount = balancesByShift.data?.[s.id] ?? 0;
                  return (
                    <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-300">
                        {new Date(s.openedAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className="capitalize font-medium text-white">
                          {s.periodType?.toLowerCase() || "Day"} Shift
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {s.closedAt ? new Date(s.closedAt).toLocaleString() : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-400 font-mono">
                        KES {Number(mpesaAmount).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
