import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface UIState {
  toasts: ToastItem[];
  /** @deprecated use toasts[0] for read access */
  toast: { message: string; kind: ToastKind } | null;
  showToast: (message: string, kind?: ToastKind) => void;
  clearToast: (id?: number) => void;
}

let _id = 0;

export const useUI = create<UIState>((set, get) => ({
  toasts: [],
  get toast() { return get().toasts[0] ?? null; },
  showToast: (message, kind = 'success') => {
    const id = ++_id;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  clearToast: (id) => {
    if (id != null) set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    else set((s) => ({ toasts: s.toasts.slice(1) }));
  },
}));
