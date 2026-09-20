import { create } from 'zustand';

// Mock auth store that always returns default values when auth is disabled
const DEFAULT_USER = {
  id: 'default-user-id',
  name: 'Default User',
  role: 'OWNER',
  businessId: 'joypub',
  businessName: 'joypub',
};

interface AuthState {
  token: string | null;
  user: any | null;
  setAuth: (token: string, user: any) => void;
  logout: () => void;
}

// Create the store with default values (no auth required)
export const useAuthStore = create<AuthState>((set) => ({
  token: 'local-dev',
  user: DEFAULT_USER,
  setAuth: (token, user) => {
    set({ token, user });
  },
  logout: () => {
    set({ token: null, user: null });
  },
}));
