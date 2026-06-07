import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

/**
 * Polished modal — softer backdrop (blur instead of opaque black), warmer
 * card surface, smoother spring-out animation, close button feels tactile.
 * Backdrop blur degrades gracefully on browsers that don't support it.
 */
export function DialogContent({
  children,
  className,
  title,
  description,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-[100]"
        style={{
          background: 'rgba(10, 12, 18, 0.60)',
          backdropFilter: 'blur(8px) saturate(160%)',
          WebkitBackdropFilter: 'blur(8px) saturate(160%)',
          animation: 'dialogFadeIn 220ms ease-out both',
        }}
      />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-[101] w-[92%] max-w-[620px] max-h-[88vh] overflow-y-auto rounded-2xl p-6',
          className,
        )}
        style={{
          background:
            'radial-gradient(700px 200px at 100% 0%, rgba(229,178,76,0.04), transparent 60%), ' +
            'var(--bg-card)',
          border: '1px solid var(--brand-border)',
          // Multi-layered shadow with a subtle gold halo so it feels branded.
          boxShadow:
            '0 24px 70px rgba(0, 0, 0, 0.45), ' +
            '0 0 0 1px rgba(229, 178, 76, 0.08), ' +
            '0 0 100px rgba(229, 178, 76, 0.06), ' +
            'inset 0 1px 0 rgba(255, 255, 255, 0.02)',
          animation: 'dialogPopIn 280ms cubic-bezier(0.2, 0.9, 0.25, 1.0) both',
          transform: 'translate(-50%, -50%)',
        }}
      >
        {title && (
          <h3 className="text-[18px] font-bold mb-1.5 pr-8" style={{ letterSpacing: '-0.015em', color: 'var(--brand-text)' }}>
            {title}
          </h3>
        )}
        {description && (
          <p className="text-[13px] mb-5 leading-relaxed" style={{ color: 'var(--brand-textSecondary)' }}>
            {description}
          </p>
        )}
        {children}
        <DialogPrimitive.Close
          className="absolute right-3 top-3 rounded-lg p-1.5 transition-all hover:bg-bg-cardHover"
          style={{ color: 'var(--brand-textMuted)', border: '1px solid transparent' }}
          aria-label="Close"
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand-borderSoft)'; e.currentTarget.style.color = 'var(--brand-text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--brand-textMuted)'; }}
        >
          <X size={16} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
      <style>{`
        @keyframes dialogFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes dialogPopIn {
          from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex justify-end gap-2 mt-5 pt-4 flex-wrap"
      style={{ borderTop: '1px solid var(--brand-borderSoft)' }}
    >
      {children}
    </div>
  );
}
