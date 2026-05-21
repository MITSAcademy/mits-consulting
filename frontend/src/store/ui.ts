import { create } from 'zustand';

interface UIState {
  toast: { message: string; kind: 'success' | 'error' } | null;
  showToast: (message: string, kind?: 'success' | 'error') => void;
  clearToast: () => void;
}

export const useUI = create<UIState>((set) => ({
  toast: null,
  showToast: (message, kind = 'success') => {
    set({ toast: { message, kind } });
    setTimeout(() => set({ toast: null }), 2500);
  },
  clearToast: () => set({ toast: null }),
}));
