"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api/api";
import { useAuthStore } from "@/store/useAuthStore";
import { BarChart3, TrendingUp, DollarSign, Receipt, Smartphone, AlertCircle, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

type SummaryPayload = {
  revenue?: number;
  expenses?: number;
  net?: number;
  totalRevenue?: number;
  totalCost?: number;
  totalExpenses?: number;
  netProfit?: number;
  totalUnitsSold?: number;
  totalMpesaReceived?: number;
  openDiscrepancies?: number;
  activeShifts?: number;
};

export default function OwnerReports() {
  const { user, business } = useAuthStore();
  const businessId = user?.businessId || business?.id;
  const currency = business?.currency || "KES";

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["businessSummary", businessId],
    queryFn: async () => {
      const res = await api.get("/reports/summary", {
        params: { businessId },
      });
      return res.data as SummaryPayload;
    },
    enabled: !!businessId,
  });

  if (isError) {
    return (
      <div className="p-6 rounded-2xl bg-red-950/60 border border-red-800 text-red-300">
        <p className="font-semibold">Could not load reports</p>
        <p className="text-xs mt-1">{(error as Error)?.message || "Failed to fetch summary"}</p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
        <span>Loading financial reports...</span>
      </div>
    );
  }

  const revenue = data.revenue ?? data.totalRevenue ?? 0;
  const expenses = data.expenses ?? data.totalExpenses ?? 0;
  const cogs = data.totalCost ?? 0;
  const net = data.netProfit ?? data.net ?? 0;
  const unitsSold = data.totalUnitsSold ?? 0;
  const mpesa = data.totalMpesaReceived ?? 0;
  const discrepancies = data.openDiscrepancies ?? 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Financial & Operations Reports
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Aggregated revenue, cost of goods, and net profit for {business?.name || "your business"}.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-xl text-xs font-semibold text-slate-200 transition-colors self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <Tile
          label="Total Revenue"
          value={`${currency} ${revenue.toLocaleString()}`}
          subtitle={`${unitsSold} total units sold`}
          icon={DollarSign}
          iconColor="text-blue-400 bg-blue-500/10 border-blue-500/20"
        />
        <Tile
          label="Cost of Goods (COGS)"
          value={`${currency} ${cogs.toLocaleString()}`}
          subtitle="Inventory wholesale costs"
          icon={Receipt}
          iconColor="text-amber-400 bg-amber-500/10 border-amber-500/20"
        />
        <Tile
          label="Operating Expenses"
          value={`${currency} ${expenses.toLocaleString()}`}
          subtitle="Direct shift payouts & overhead"
          icon={Receipt}
          iconColor="text-rose-400 bg-rose-500/10 border-rose-500/20"
        />
        <Tile
          label="True Net Profit"
          value={`${currency} ${net.toLocaleString()}`}
          subtitle="Revenue minus COGS and expenses"
          icon={TrendingUp}
          valueColor={net >= 0 ? "text-emerald-400" : "text-rose-400"}
          iconColor="text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
        />
        <Tile
          label="Total M-Pesa Collected"
          value={`${currency} ${mpesa.toLocaleString()}`}
          subtitle="Shift till verified mobile money"
          icon={Smartphone}
          iconColor="text-indigo-400 bg-indigo-500/10 border-indigo-500/20"
        />
        <Tile
          label="Open Discrepancies"
          value={`${discrepancies}`}
          subtitle="Shift variances awaiting resolution"
          icon={AlertCircle}
          valueColor={discrepancies > 0 ? "text-amber-400" : "text-slate-300"}
          iconColor="text-amber-400 bg-amber-500/10 border-amber-500/20"
        />
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  subtitle,
  icon: Icon,
  valueColor = "text-white",
  iconColor,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  valueColor?: string;
  iconColor: string;
}) {
  return (
    <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
      <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
        <span>{label}</span>
        <div className={`w-8 h-8 rounded-lg border grid place-items-center ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <div className={`text-2xl sm:text-3xl font-extrabold ${valueColor}`}>{value}</div>
        {subtitle && <div className="text-xs text-slate-400 mt-2">{subtitle}</div>}
      </div>
    </div>
  );
}