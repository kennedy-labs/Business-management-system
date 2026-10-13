"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  BarChart3,
  Boxes,
  Wallet,
  Receipt,
  Users,
  Menu,
  X,
  LogOut,
  Building2,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import api from "@/lib/api/api";

import DashboardTab from "./tabs/DashboardTab";
import StockTab from "./tabs/StockTab";
import ReportsTab from "./tabs/ReportsTab";
import PaymentsTab from "./tabs/PaymentsTab";
import DiscrepanciesTab from "./tabs/DiscrepanciesTab";
import ManagementTab from "./tabs/ManagementTab";

export type TabId =
  | "dashboard"
  | "reports"
  | "stock"
  | "payments"
  | "discrepancies"
  | "management";

type NavItem = {
  id: TabId;
  href: string;
  label: string;
  icon: any;
};

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", href: "/owner/dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "reports", href: "/owner/reports", label: "Reports", icon: BarChart3 },
  { id: "stock", href: "/owner/stock", label: "Stock", icon: Boxes },
  { id: "payments", href: "/owner/payments", label: "Payments", icon: Wallet },
  { id: "discrepancies", href: "/owner/discrepancies", label: "Discrepancies", icon: Receipt },
  { id: "management", href: "/owner/management", label: "Management", icon: Users },
];

function getTabFromPath(path: string): TabId {
  if (path.includes("/stock")) return "stock";
  if (path.includes("/reports")) return "reports";
  if (path.includes("/payments")) return "payments";
  if (path.includes("/discrepancies")) return "discrepancies";
  if (path.includes("/management")) return "management";
  return "dashboard";
}

export default function OwnerWorkspace({ initialTab }: { initialTab?: TabId }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, business, isAuthenticated, isInitialized, logout, initAuth } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (initialTab) return initialTab;
    if (typeof window !== "undefined") {
      return getTabFromPath(window.location.pathname);
    }
    return "dashboard";
  });

  // Keep visited tabs alive in DOM for zero-latency, instant switching without unmounting
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set([activeTab]));

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isInitialized, isAuthenticated, router]);

  // Synchronize only when initialTab prop changes from parent route navigation
  const prevInitialTabRef = useRef(initialTab);
  useEffect(() => {
    if (initialTab && initialTab !== prevInitialTabRef.current) {
      prevInitialTabRef.current = initialTab;
      setActiveTab(initialTab);
      setVisitedTabs((prev) => new Set(prev).add(initialTab));
    }
  }, [initialTab]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const tab = getTabFromPath(window.location.pathname);
      setActiveTab(tab);
      setVisitedTabs((prev) => new Set(prev).add(tab));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Background pre-fetch common owner queries so tabs load instantly on first click
  const businessId = user?.businessId || business?.id;
  useEffect(() => {
    if (!businessId) return;

    // Prefetch products, summary, and staff in background
    qc.prefetchQuery({
      queryKey: ["products", businessId],
      queryFn: async () => (await api.get("/products", { params: { businessId } })).data,
      staleTime: 60 * 1000,
    });
    qc.prefetchQuery({
      queryKey: ["businessSummary", businessId],
      queryFn: async () => (await api.get("/reports/summary", { params: { businessId } })).data,
      staleTime: 60 * 1000,
    });
    qc.prefetchQuery({
      queryKey: ["users", businessId],
      queryFn: async () => (await api.get("/users", { params: { businessId } })).data,
      staleTime: 60 * 1000,
    });
  }, [businessId, qc]);

  // Instant client-side tab selection
  const handleSelectTab = useCallback((id: TabId, href: string) => {
    setActiveTab(id);
    setVisitedTabs((prev) => new Set(prev).add(id));
    setMobileMenuOpen(false);
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", href);
    }
  }, []);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const businessDisplayName = business?.name || user?.businessName || "My Business";
  const userDisplayName = user?.name || "Owner";

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-slate-900 border-r border-slate-800 text-white flex-shrink-0">
        <div className="px-6 py-5 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 grid place-items-center text-white shadow-md shadow-indigo-600/30">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight truncate text-white">
                {businessDisplayName}
              </div>
              <div className="text-[11px] text-indigo-400 font-medium">Owner Portal</div>
            </div>
          </div>
        </div>

        {/* Instant tab navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id, item.href)}
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all cursor-pointer ${
                  active
                    ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/20"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User profile & logout */}
        <div className="p-3 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800/60">
            <div className="rounded-full bg-indigo-600 h-8 w-8 grid place-items-center text-white text-xs font-bold flex-shrink-0">
              {(userDisplayName[0] || "O").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-xs font-semibold text-white">{userDisplayName}</div>
              <div className="text-[10px] text-slate-400 truncate">{user?.phone || "Owner"}</div>
            </div>
            <span className="px-1.5 py-0.5 text-[9px] rounded font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              OWNER
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between bg-slate-900 border-b border-slate-800 text-white px-4 py-3 sticky top-0 z-20 w-full fixed">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 grid place-items-center text-white">
            <Building2 className="w-3.5 h-3.5" />
          </div>
          <div className="text-sm font-bold truncate max-w-[180px]">{businessDisplayName}</div>
        </div>
        <button
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
          aria-label="Toggle navigation"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/70 backdrop-blur-xs"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed left-0 top-0 h-full w-64 bg-slate-900 border-r border-slate-800 text-white z-40 shadow-2xl flex flex-col justify-between">
          <div>
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="text-sm font-bold truncate">{businessDisplayName}</div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="text-slate-400 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-1 px-3 py-3">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectTab(item.id, item.href)}
                    className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all cursor-pointer ${
                      active
                        ? "bg-indigo-600 text-white font-semibold"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-3 border-t border-slate-800 space-y-2">
            <div className="px-3 py-2 text-xs text-slate-400">
              Signed in as <span className="font-semibold text-white">{userDisplayName}</span>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 rounded-xl cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area: Instant Keep-Alive Tab Rendering */}
      <main className="flex-1 min-w-0 p-4 md:p-8 bg-slate-950 overflow-y-auto">
        <div className={activeTab === "dashboard" ? "block" : "hidden"}>
          <DashboardTab onNavigateTab={(t) => handleSelectTab(t as TabId, `/owner/${t}`)} />
        </div>
        <div className={activeTab === "stock" ? "block" : "hidden"}>
          {(visitedTabs.has("stock") || activeTab === "stock") && <StockTab />}
        </div>
        <div className={activeTab === "reports" ? "block" : "hidden"}>
          {(visitedTabs.has("reports") || activeTab === "reports") && <ReportsTab />}
        </div>
        <div className={activeTab === "payments" ? "block" : "hidden"}>
          {(visitedTabs.has("payments") || activeTab === "payments") && <PaymentsTab />}
        </div>
        <div className={activeTab === "discrepancies" ? "block" : "hidden"}>
          {(visitedTabs.has("discrepancies") || activeTab === "discrepancies") && <DiscrepanciesTab />}
        </div>
        <div className={activeTab === "management" ? "block" : "hidden"}>
          {(visitedTabs.has("management") || activeTab === "management") && <ManagementTab />}
        </div>
      </main>
    </div>
  );
}
