import * as React from 'react';
import { cn } from '@/lib/utils';
import { useUI } from '@/store/ui';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'success' | 'amber' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  /**
   * Optional human-readable reason explaining why this button can't be clicked yet
   * (e.g. "Pick a target stage" / "Fill the Reason field").
   * Pattern: pass it INSTEAD of `disabled={true}` whenever the disabled-state is
   * driven by missing user input. When set, the button still looks disabled but:
   *   - click → fires a toast with the reason instead of being silently ignored
   *   - hover → tooltip with the reason
   *   - actual onClick handler is NOT called
   * This makes "why is this greyed out?" instantly answerable everywhere it's used.
   * If you also pass `disabled={true}` explicitly the button is hard-disabled
   * (no toast) — use that for "still loading" / "mutation in flight" states.
   */
  disabledReason?: string | null;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', disabledReason, onClick, title, disabled, ...props }, ref) => {
    const showToast = useUI((s) => s.showToast);
    const blocked = !disabled && !!disabledReason;
    const hardDisabled = disabled === true;
    return (
      <button
        ref={ref}
        // Hard disabled (e.g. loading) → real disabled. Soft-blocked → looks disabled
        // but stays clickable so the toast can fire.
        disabled={hardDisabled}
        aria-disabled={hardDisabled || blocked || undefined}
        title={blocked ? disabledReason || undefined : title}
        onClick={(e) => {
          if (blocked) {
            e.preventDefault();
            e.stopPropagation();
            showToast(disabledReason!, 'error');
            return;
          }
          onClick?.(e);
        }}
        className={cn(
          'btn',
          variant === 'primary' && 'btn-primary',
          variant === 'success' && 'btn-success',
          variant === 'amber' && 'btn-amber',
          variant === 'danger' && 'btn-danger',
          variant === 'ghost' && 'bg-transparent border-transparent hover:bg-bg-cardHover',
          size === 'sm' && 'btn-sm',
          // Soft-blocked styling — visually matches disabled but stays interactive
          blocked && 'opacity-50 cursor-not-allowed',
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
