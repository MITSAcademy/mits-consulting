/**
 * CelebrationLayer — confetti burst on key wins.
 *
 * Mounted once at the app root. Listens for the custom `mits:celebrate`
 * window event. When fired, it spawns ~36 colored particles that float up
 * and out over ~1.6s, then unmounts itself. The whole thing is one
 * render — no library, no canvas, just CSS keyframes.
 *
 * Fire from anywhere with:
 *   window.dispatchEvent(new CustomEvent('mits:celebrate'))
 *
 * Use sparingly — once per genuine win (payment recorded, sale closed,
 * checklist completed). It's a delight, not a notification.
 */
import { useEffect, useState } from 'react';

const COLORS = [
  'var(--accent-gold)',
  '#E5B24C',
  '#FAF5E7',
  'var(--status-green)',
  'var(--status-blue)',
  '#FFC107',
];

function pieces(n: number) {
  return Array.from({ length: n }).map((_, i) => {
    const angle = (Math.PI * (0.85 + Math.random() * 0.30)) * -1; // mostly upward
    const speed = 80 + Math.random() * 140;
    const x = Math.cos(angle) * speed;
    const y = Math.sin(angle) * speed;
    const rot = (Math.random() - 0.5) * 720;
    const color = COLORS[i % COLORS.length];
    const size = 6 + Math.round(Math.random() * 6);
    const shape = Math.random() < 0.5 ? '50%' : '2px'; // dots vs squares
    const delay = Math.round(Math.random() * 80);
    return { x, y, rot, color, size, shape, delay, id: i };
  });
}

export function CelebrationLayer() {
  const [burst, setBurst] = useState<number | null>(null);

  useEffect(() => {
    function onCelebrate() {
      setBurst(Date.now());
      // Auto-clear after the animation completes
      window.setTimeout(() => setBurst(null), 1800);
    }
    window.addEventListener('mits:celebrate', onCelebrate);
    return () => window.removeEventListener('mits:celebrate', onCelebrate);
  }, []);

  if (!burst) return null;
  const ps = pieces(36);

  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none z-[400] overflow-hidden"
      // The burst origin is roughly center-bottom — feels like the action
      // they just clicked "shot up" celebratory color.
    >
      {ps.map((p) => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '15%',
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.shape,
            transformOrigin: 'center',
            // Animate to (x,y) then drift downward. Use translate + rotate.
            ['--tx' as any]: `${p.x}px`,
            ['--ty' as any]: `${p.y}px`,
            ['--rot' as any]: `${p.rot}deg`,
            animation: `mitsConfetti 1.6s cubic-bezier(0.18, 0.89, 0.32, 1.10) ${p.delay}ms both`,
            boxShadow: `0 0 4px ${p.color}`,
          }}
        />
      ))}
      <style>{`
        @keyframes mitsConfetti {
          0%   { opacity: 0; transform: translate(0, 0) rotate(0); }
          20%  { opacity: 1; }
          80%  { opacity: 1; transform: translate(var(--tx), var(--ty)) rotate(var(--rot)); }
          100% { opacity: 0; transform: translate(var(--tx), calc(var(--ty) + 120px)) rotate(var(--rot)); }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-hidden] > span { animation: none !important; opacity: 0 !important; }
        }
      `}</style>
    </div>
  );
}

/** Fire from anywhere — kept as a free function so callers don't need a hook. */
export function celebrate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mits:celebrate'));
  }
}
