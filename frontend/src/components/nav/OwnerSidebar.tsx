"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
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

type NavItem = {
  href: string;
  label: string;
  icon: any;
  built: boolean;
};

const ITEMS: NavItem[] = [
  { href: "/owner/dashboard", label: "Overview", icon: LayoutDashboard, built: true },
  { href: "/owner/reports", label: "Reports", icon: BarChart3, built: true },
  { href: "/owner/stock", label: "Stock", icon: Boxes, built: true },
  { href: "/owner/payments", label: "Payments", icon: Wallet, built: true },
  { href: "/owner/discrepancies", label: "Discrepancies", icon: Receipt, built: true },
  { href: "/owner/management", label: "Management", icon: Users, built: true },
];

export default function OwnerSidebar({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, business, isAuthenticated, isInitialized, logout, initAuth } = useAuthStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isInitialized, isAuthenticated, router]);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const businessDisplayName = business?.name || user?.businessName || "My Business";
  const userDisplayName = user?.name || "Owner";

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-slate-900 border-r border-slate-800 text-white">
        <div className="px-6 py-5 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 grid place-items-center text-white">
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

        <nav className="flex-1 space-y-1 px-3 py-4">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all ${
                    active
                      ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/20"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                </Link>
              </div>
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

      {/* Mobile top bar + drawer */}
      <div className="md:hidden flex items-center justify-between bg-slate-900 border-b border-slate-800 text-white px-4 py-3 sticky top-0 z-20 w-full">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 grid place-items-center text-white">
            <Building2 className="w-3.5 h-3.5" />
          </div>
          <div className="text-sm font-bold truncate max-w-[180px]">{businessDisplayName}</div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-white p-1 rounded-lg hover:bg-slate-800"
          aria-label="Toggle navigation"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/70 backdrop-blur-xs" onClick={() => setOpen(false)} />
      )}

      {open && (
        <div className="md:hidden fixed left-0 top-0 h-full w-64 bg-slate-900 border-r border-slate-800 text-white z-40 shadow-2xl flex flex-col justify-between">
          <div>
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="text-sm font-bold truncate">{businessDisplayName}</div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-1 px-3 py-3">
              {ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <div key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
                        active ? "bg-indigo-600 text-white font-semibold" : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  </div>
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
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 rounded-xl"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 p-4 md:p-8 bg-slate-950">{children}</main>
    </div>
  );
}