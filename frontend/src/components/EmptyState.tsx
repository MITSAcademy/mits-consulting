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
      className={`flex flex-col items-center justify-center text-center py-10 px-6 ${className || ''}`}
      style={{ animation: 'fadeUp 280ms ease-out both' }}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
        style={{ background: t.bg }}
      >
        <Icon size={22} style={{ color: t.color }} />
      </div>
      <div className="text-[14px] font-semibold mb-1" style={{ color: 'var(--brand-text)' }}>
        {title}
      </div>
      {description && (
        <div className="text-[12px] max-w-md mx-auto leading-relaxed muted">
          {description}
        </div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
