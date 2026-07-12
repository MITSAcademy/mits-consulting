import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { checkInStreak, type StreakData } from '@/lib/streak';

interface StreakBannerProps {
  userName: string;
}

export function StreakBanner({ userName }: StreakBannerProps) {
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<StreakData | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [progress, setProgress] = useState(100);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const result = checkInStreak();
    if (!result.isNew) return;
    setData(result.data);
    setIsNewBest(result.isNewBest);
    setVisible(true);

    // Progress bar countdown over 5 seconds
    const startTime = Date.now();
    const duration = 5000;
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(pct);
      if (elapsed >= duration) {
        clearInterval(timerRef.current!);
      }
    }, 50);

    dismissRef.current = setTimeout(() => {
      setVisible(false);
    }, duration);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (dismissRef.current) clearTimeout(dismissRef.current);
    };
  }, []);

  const dismiss = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (dismissRef.current) clearTimeout(dismissRef.current);
    setVisible(false);
  };

  if (!data) return null;

  const firstName = (userName || '').split(' ')[0] || 'you';
  const n = data.current;

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        top: '56px',
        left: '50%',
        transform: visible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(-120%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
        zIndex: 200,
        pointerEvents: visible ? 'auto' : 'none',
        minWidth: '300px',
        maxWidth: '480px',
        width: 'max-content',
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1.5px solid color-mix(in srgb, var(--accent-gold, #f5a623) 40%, transparent)',
          borderRadius: '14px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Main content */}
        <div style={{ padding: '14px 18px 10px 18px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          {/* Fire + crown */}
          <div style={{ fontSize: '28px', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>
            {isNewBest ? '👑' : '🔥'}
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--brand-text)' }}>
                {n > 1 ? `Day ${n} streak!` : 'Welcome back!'}
              </span>
              {/* Pill */}
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'color-mix(in srgb, var(--accent-gold, #f5a623) 18%, transparent)',
                  color: 'var(--accent-gold, #f5a623)',
                  border: '1px solid color-mix(in srgb, var(--accent-gold, #f5a623) 35%, transparent)',
                  whiteSpace: 'nowrap',
                }}
              >
                {n} {n === 1 ? 'day' : 'days'}
              </span>
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--brand-textSecondary)', marginTop: '2px' }}>
              {isNewBest
                ? '👑 New personal best!'
                : n > 1
                ? `Keep it up, ${firstName}!`
                : 'Streak started 🎉'}
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            style={{
              flexShrink: 0,
              padding: '4px',
              borderRadius: '6px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--brand-textMuted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '-2px',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-input)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={14} />
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: '3px', background: 'var(--bg-input)', position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${progress}%`,
              background: 'var(--accent-gold, #f5a623)',
              transition: 'width 0.05s linear',
              borderRadius: '0 2px 2px 0',
            }}
          />
        </div>
      </div>
    </div>
  );
}
