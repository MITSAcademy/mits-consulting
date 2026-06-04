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
  setUser: (u: User | null) => void;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string, role?: string) => Promise<User>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
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
        set({ user: null });
      },
    }),
    {
      name: 'mits-auth',
      partialize: (s) => ({ user: s.user }),
      // When persist rehydrates from localStorage, flip `loading` to false if
      // we already have a user. Without this every page reload shows the
      // "Loading…" splash for the duration of /auth/me, even though we already
      // know who the user is from last time. /auth/me still runs in the
      // background to refresh the user object — but we render the app
      // optimistically in the meantime.
      onRehydrateStorage: () => (state) => {
        if (state && state.user) state.loading = false;
      },
    },
  ),
);
