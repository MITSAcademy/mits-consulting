import { useEffect, useRef } from 'react';
import { useUI, ToastKind } from '@/store/ui';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { playPop, playError } from '@/lib/sounds';

const TOAST_STYLES: Record<ToastKind, { border: string; left: string; color: string; Icon: any }> = {
  success: { border: 'rgba(74,222,128,0.40)',  left: 'var(--status-green)',  color: 'var(--status-green)',  Icon: CheckCircle2 },
  error:   { border: 'rgba(239,68,68,0.40)',   left: 'var(--status-red)',    color: 'var(--status-red)',    Icon: AlertCircle },
  info:    { border: 'rgba(91,141,239,0.40)',  left: 'var(--status-blue)',   color: 'var(--status-blue)',   Icon: Info },
  warning: { border: 'rgba(245,158,11,0.40)',  left: 'var(--status-amber)',  color: 'var(--status-amber)',  Icon: AlertTriangle },
};

export function Toaster() {
  const toasts = useUI((s) => s.toasts);
  const clearToast = useUI((s) => s.clearToast);
  const prevLengthRef = useRef(toasts.length);

  useEffect(() => {
    if (toasts.length > prevLengthRef.current) {
      const newest = toasts[toasts.length - 1];
      if (newest?.kind === 'success') playPop();
      else if (newest?.kind === 'error') playError();
    }
    prevLengthRef.current = toasts.length;
  }, [toasts.length]);

  if (!toasts.length) return null;

  return (
    <>
      <div
        className="fixed bottom-5 right-5 z-[300] flex flex-col gap-2"
        style={{ pointerEvents: 'none' }}
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const s = TOAST_STYLES[toast.kind] ?? TOAST_STYLES.success;
          const { Icon } = s;
          return (
            <div
              key={toast.id}
              className="flex items-start gap-3 px-4 py-3 rounded-xl text-[13px] font-medium max-w-[400px]"
              style={{
                pointerEvents: 'auto',
                background: 'color-mix(in srgb, var(--bg-card) 94%, transparent)',
                backdropFilter: 'blur(12px) saturate(160%)',
                WebkitBackdropFilter: 'blur(12px) saturate(160%)',
                color: 'var(--brand-text)',
                border: `1px solid ${s.border}`,
                borderLeft: `3px solid ${s.left}`,
                boxShadow: `0 16px 40px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.04)`,
                animation: 'toastSlideIn 300ms cubic-bezier(0.18, 0.89, 0.32, 1.28) both',
              }}
              role="status"
            >
              <Icon size={16} style={{ color: s.color, flexShrink: 0, marginTop: 1 }} />
              <div className="flex-1 leading-relaxed">{toast.message}</div>
              <button
                onClick={() => clearToast(toast.id)}
                className="rounded p-0.5 transition-colors flex-shrink-0"
                style={{ color: 'var(--brand-textMuted)' }}
                title="Dismiss"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
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
