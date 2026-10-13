import { create } from "zustand";

export interface User {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: "OWNER" | "WORKER";
  status?: string;
  active?: boolean;
  branchId?: string;
  businessId: string;
  businessName?: string;
}

export interface Business {
  id: string;
  name: string;
  currency?: string;
}

export interface RegisterPayload {
  ownerName: string;
  phoneNumber: string;
  password: string;
  businessName: string;
  currency?: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  business: Business | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  setAuth: (token: string, user: User, business?: Business | null) => void;
  login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string; role?: string }>;
  register: (payload: RegisterPayload) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  initAuth: () => void;
}

const STORAGE_KEY = "bms_auth_session";

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  business: null,
  isAuthenticated: false,
  isInitialized: false,
  isLoading: false,
  error: null,

  setAuth: (token: string, user: User, business?: Business | null) => {
    const biz =
      business ||
      (user?.businessId
        ? { id: user.businessId, name: user.businessName || "My Business", currency: "KES" }
        : null);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user, business: biz }));
      } catch {}
    }
    set({
      token,
      user: { ...user, businessName: biz?.name || user?.businessName },
      business: biz,
      isAuthenticated: true,
      error: null,
    });
  },

  login: async (identifier: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.error || data.message || "Invalid credentials";
        set({ isLoading: false, error: errorMsg });
        return { success: false, error: errorMsg };
      }

      const { token, user, business } = data;
      get().setAuth(token, user, business);
      set({ isLoading: false, error: null });
      return { success: true, role: user.role };
    } catch (err: any) {
      const errorMsg = err.message || "Network error. Please try again.";
      set({ isLoading: false, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  },

  register: async (payload: RegisterPayload) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerName: payload.ownerName.trim(),
          phoneNumber: payload.phoneNumber.trim(),
          password: payload.password,
          businessName: payload.businessName.trim(),
          currency: payload.currency || "KES",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.error || data.message || "Registration failed";
        set({ isLoading: false, error: errorMsg });
        return { success: false, error: errorMsg };
      }

      const { token, user, business } = data;
      get().setAuth(token, user, business);
      set({ isLoading: false, error: null });
      return { success: true };
    } catch (err: any) {
      const errorMsg = err.message || "Network error. Please try again.";
      set({ isLoading: false, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  },

  logout: () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    set({
      token: null,
      user: null,
      business: null,
      isAuthenticated: false,
      error: null,
    });
  },

  initAuth: () => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.token && parsed?.user) {
            set({
              token: parsed.token,
              user: parsed.user,
              business: parsed.business || null,
              isAuthenticated: true,
              isInitialized: true,
            });
            return;
          }
        }
      } catch {}
    }
    set({ isInitialized: true });
  },
}));
