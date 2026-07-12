/**
 * EmptyState — friendly "nothing here yet" placeholder used across pages.
 *
 * Default look: centered icon in a soft gold circle, headline, optional sub-
 * text, optional action button. Pages drop one of these instead of a plain
 * "no data" string so empty screens feel intentional, not broken.
 */
import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Tone of the icon halo — defaults to gold for "soft empty"; use 'amber'
   *  for "needs attention" empties and 'green' for "all clear" empties. */
  tone?: 'gold' | 'amber' | 'green' | 'grey';
  className?: string;
}

const TONES: Record<NonNullable<Props['tone']>, { bg: string; color: string }> = {
  gold:  { bg: 'var(--accent-goldSoft)',          color: 'var(--accent-gold)'  },
  amber: { bg: 'rgba(245,158,11,0.12)',           color: 'var(--status-amber)' },
  green: { bg: 'rgba(74,222,128,0.12)',           color: 'var(--status-green)' },
  grey:  { bg: 'var(--bg-cardHover)',             color: 'var(--brand-textMuted)' },
};

export function EmptyState({ icon: Icon, title, description, action, tone = 'gold', className }: Props) {
  const t = TONES[tone];
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl ${className || ''}`}
      style={{
        animation: 'fadeUp 320ms cubic-bezier(0.2,0.9,0.25,1) both',
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg-card) 70%, transparent) 0%, transparent 100%)',
        border: '1px solid var(--brand-borderSoft)',
      }}
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3.5 relative"
        style={{
          background: `linear-gradient(135deg, ${t.bg} 0%, color-mix(in srgb, ${t.color} 4%, transparent) 100%)`,
          boxShadow: `0 8px 24px ${t.bg}, inset 0 1px 0 rgba(255,255,255,0.06)`,
          border: `1px solid color-mix(in srgb, ${t.color} 12%, transparent)`,
        }}
      >
        <Icon size={24} style={{ color: t.color }} />
        {/* Subtle outer halo ring */}
        <div
          className="absolute -inset-1 rounded-2xl pointer-events-none"
          style={{
            background: 'transparent',
            border: `1px solid color-mix(in srgb, ${t.color} 8%, transparent)`,
          }}
        />
      </div>
      <div className="text-[15px] font-bold mb-1" style={{ color: 'var(--brand-text)', letterSpacing: '-0.01em' }}>
        {title}
      </div>
      {description && (
        <div className="text-[12px] max-w-md mx-auto leading-relaxed muted">
          {description}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
