"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Building2,
  ArrowRight,
  ShieldCheck,
  BarChart3,
  Boxes,
  Receipt,
  Smartphone,
  Lock,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isInitialized, user, initAuth } = useAuthStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    if (isInitialized && isAuthenticated && user) {
      if (user.role === "WORKER") {
        router.replace("/worker");
      } else {
        router.replace("/owner/dashboard");
      }
    }
  }, [isInitialized, isAuthenticated, user, router]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Navigation header */}
      <header className="border-b border-slate-800/80 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 grid place-items-center text-white shadow-md shadow-indigo-600/30">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white">Bar Ops System</span>
              <span className="hidden sm:inline-block ml-2 text-xs text-indigo-400 font-medium px-2 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-800/60">
                Live & Production
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-300 hover:text-white px-3.5 py-2 rounded-lg hover:bg-slate-800/60 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-1.5"
            >
              <span>Register Business</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main hero section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-16 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300 mb-8 shadow-inner">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Clean state initialized — Register your business to start today</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-tight">
          Complete Business & Bar Operations Management
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-2xl leading-relaxed">
          Accurate shift handovers, inventory tracking, cash and M-Pesa reconciliation, and real-time profit analytics built for owners and staff.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Link
            href="/signup"
            className="flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-2xl shadow-xl shadow-indigo-600/30 transition-all text-base"
          >
            <span>Register New Business</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 px-8 py-4 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 font-semibold rounded-2xl transition-all text-base"
          >
            <span>Log In with Phone & Password</span>
          </Link>
        </div>

        {/* Core feature highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-20 text-left w-full max-w-4xl">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 grid place-items-center mb-4">
              <Boxes className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white mb-1.5">Stock & Inventory</h3>
            <p className="text-sm text-slate-400">
              Track products, count opening and closing stock, and eliminate unrecorded shrinkage.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 grid place-items-center mb-4">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white mb-1.5">M-Pesa & Cash Balancing</h3>
            <p className="text-sm text-slate-400">
              Shift-level balance recording comparing declared cash and mobile money with expected sales.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 grid place-items-center mb-4">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white mb-1.5">Owner Profit Reports</h3>
            <p className="text-sm text-slate-400">
              Instant revenue, cost of goods, overhead expenses, and true net profit insights.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <p>Bar Operations Reconciliation & Profit Management System &bull; Clean Production Instance</p>
      </footer>
    </div>
  );
}
