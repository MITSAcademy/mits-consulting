import { useUI } from '@/store/ui';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useEffect } from 'react';

/**
 * Polished toast — slides in from bottom-right with a soft drop shadow.
 * Uses the academy palette: success = green, error = red. Iconography +
 * dismiss button on hover.
 *
 * The slide animation respects prefers-reduced-motion via the global CSS rule.
 */
export function Toaster() {
  const toast = useUI((s) => s.toast);
  const clearToast = useUI((s) => s.clearToast);

  // Auto-dismiss after 4 seconds (the store may already do this; this is a
  // safety net for any code path that sets toast directly without TTL).
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => clearToast?.(), 4500);
    return () => clearTimeout(id);
  }, [toast, clearToast]);

  if (!toast) return null;
  const isError = toast.kind === 'error';
  const Icon = isError ? AlertCircle : CheckCircle2;

  return (
    <>
      <div
        className="fixed bottom-5 right-5 z-[300] flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] font-medium max-w-[380px]"
        style={{
          background: 'var(--bg-card)',
          color: 'var(--brand-text)',
          border: `1px solid ${isError ? 'rgba(239,68,68,0.40)' : 'rgba(74,222,128,0.40)'}`,
          borderLeft: `3px solid ${isError ? 'var(--status-red)' : 'var(--status-green)'}`,
          boxShadow: '0 12px 32px rgba(0,0,0,0.30), 0 0 0 1px rgba(255,255,255,0.02)',
          animation: 'toastSlideIn 280ms cubic-bezier(0.18, 0.89, 0.32, 1.28) both',
        }}
        role="status"
      >
        <Icon
          size={16}
          style={{ color: isError ? 'var(--status-red)' : 'var(--status-green)', flexShrink: 0, marginTop: 1 }}
        />
        <div className="flex-1 leading-relaxed">{toast.message}</div>
        <button
          onClick={() => clearToast?.()}
          className="rounded p-0.5 transition-colors flex-shrink-0"
          style={{ color: 'var(--brand-textMuted)' }}
          title="Dismiss"
        >
          <X size={13} />
        </button>
      </div>
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(20px) scale(0.96); }
          to   { opacity: 1; transform: translateX(0)    scale(1); }
        }
      `}</style>
    </>
  );
}
