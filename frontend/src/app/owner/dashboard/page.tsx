"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import axios from "axios";
import api from "@/lib/api/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
  TrendingUp,
  Receipt,
  Boxes,
  Users,
  DollarSign,
  Smartphone,
  ArrowRight,
  PlusCircle,
  AlertCircle,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

type Summary = {
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

function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const payload = error.response?.data;
    if (status) {
      const detail =
        typeof payload === "string" ? payload : JSON.stringify(payload);
      return `HTTP ${status} — ${detail ?? "no response body"}`;
    }
    return `Network error — ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export default function OwnerDashboard() {
  const { user, business } = useAuthStore();
  const businessId = user?.businessId || business?.id;
  const currency = business?.currency || "KES";

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["businessSummary", businessId],
    queryFn: async () => {
      const response = await api.get<Summary>("/reports/summary", {
        params: { businessId },
      });
      return response.data;
    },
    enabled: typeof window !== "undefined" && !!businessId,
  });

  const { data: products } = useQuery({
    queryKey: ["products", businessId],
    queryFn: async () => {
      const res = await api.get<any[]>("/products", {
        params: { businessId },
      });
      return res.data;
    },
    enabled: !!businessId,
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading business summary...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Business Overview</h1>
        <div className="p-4 bg-red-950/60 border border-red-800 text-red-300 rounded-xl">
          <p className="font-semibold">Could not load the dashboard</p>
          <p className="text-sm mt-1 break-all">{describeError(error)}</p>
        </div>
      </section>
    );
  }

  const summary: Summary = data ?? {};
  const isBrandNew = !products || products.length === 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {business?.name || "Business Overview"}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time performance, stock balance, and financial reconciliation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/owner/stock"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/20 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Manage Stock</span>
          </Link>
          <Link
            href="/worker"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all"
          >
            <span>Worker Portal</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Clean state welcome banner for first day */}
      {isBrandNew && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-indigo-950/40 border border-indigo-500/30 text-white space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/30 grid place-items-center flex-shrink-0 text-indigo-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Welcome to your clean business instance, {user?.name || "Owner"}!
              </h2>
              <p className="text-sm text-slate-300 mt-1">
                Your business account is live. No test items or hardcoded demo data are present. Follow these 2 steps to begin operations today:
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <Link
              href="/owner/stock"
              className="p-4 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 transition-all flex items-center justify-between group"
            >
              <div>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Step 1</span>
                <div className="text-sm font-semibold text-white mt-0.5">Add Your Stock & Products</div>
                <div className="text-xs text-slate-400">Register drinks, prices, and opening counts.</div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
            </Link>

            <Link
              href="/owner/management"
              className="p-4 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 transition-all flex items-center justify-between group"
            >
              <div>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Step 2</span>
                <div className="text-sm font-semibold text-white mt-0.5">Staff & Counter Workers</div>
                <div className="text-xs text-slate-400">Create login credentials for shift workers.</div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
            </Link>
          </div>
        </div>
      )}

      {/* Main KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Total Revenue */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
            <span>Total Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 grid place-items-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-white">
              {currency} {(summary.revenue ?? summary.totalRevenue ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
              <span>Units sold:</span>
              <span className="font-semibold text-slate-200">{summary.totalUnitsSold ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Total Expenses */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
            <span>Operating Expenses</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 grid place-items-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-rose-400">
              {currency} {(summary.expenses ?? summary.totalExpenses ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
              <span>Recorded today & past shifts</span>
            </div>
          </div>
        </div>

        {/* Net Profit */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
            <span>Net Operating Profit</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 grid place-items-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-emerald-400">
              {currency} {(summary.net ?? summary.netProfit ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-2">
              <span>Revenue minus COGS and expenses</span>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 grid place-items-center flex-shrink-0">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">M-Pesa Received</div>
            <div className="text-xl font-bold text-white mt-0.5">
              {currency} {(summary.totalMpesaReceived ?? 0).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 grid place-items-center flex-shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Discrepancies</div>
            <div className="text-xl font-bold text-white mt-0.5">
              {summary.openDiscrepancies ?? 0} <span className="text-xs text-slate-400 font-normal">unresolved</span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 grid place-items-center flex-shrink-0">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Shifts</div>
            <div className="text-xl font-bold text-white mt-0.5">
              {summary.activeShifts ?? 0} <span className="text-xs text-slate-400 font-normal">in progress</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
