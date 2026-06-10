import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  // impersonation: stored real founder identity while viewing as another user
  realUser: User | null;
  setUser: (u: User | null) => void;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string, role?: string) => Promise<User>;
  logout: () => Promise<void>;
  impersonate: (userId: string) => Promise<void>;
  exitImpersonation: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      realUser: null,
      loading: true,
      setUser: (u) => set({ user: u, loading: false }),
      refresh: async () => {
        try {
          const r = await api.get('/auth/me');
          set({ user: r.data.user, loading: false });
        } catch {
          set({ user: null, loading: false });
        }
      },
      login: async (email, password) => {
        const r = await api.post('/auth/login', { email, password });
        set({ user: r.data.user, loading: false });
        return r.data.user;
      },
      register: async (name, email, password, role = 'staff') => {
        const r = await api.post('/auth/register', { name, email, password, role });
        set({ user: r.data.user, loading: false });
        return r.data.user;
      },
      logout: async () => {
        try { await api.post('/auth/logout'); } catch {}
        set({ user: null, realUser: null });
      },
      impersonate: async (userId: string) => {
        const currentUser = get().user;
        const r = await api.post(`/auth/impersonate/${userId}`);
        // Store the real founder so we can restore later
        set({ realUser: currentUser, user: r.data.user });
      },
      exitImpersonation: () => {
        const real = get().realUser;
        if (real) set({ user: real, realUser: null });
      },
    }),
    {
      name: 'mits-auth',
      partialize: (s) => ({ user: s.user, realUser: s.realUser }),
      onRehydrateStorage: () => (state) => {
        if (state && state.user) state.loading = false;
      },
    },
  ),
);
