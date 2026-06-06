import { initials } from '@/lib/utils';

/**
 * Avatar — colored initials chip. Picks a stable color per-name so the same
 * user keeps the same color everywhere in the UI (Roshni is always teal,
 * Anjali is always amber, etc.). The 4-stop gradient keeps things warm,
 * not flat.
 *
 * Optional `ring` adds a soft gold halo — used on the active user's avatar
 * in the sidebar to make "this is me" obvious.
 */
const PALETTE = [
  ['#E5B24C', '#B8861B'],  // gold
  ['#5B8DEF', '#3B62C9'],  // blue
  ['#4ADE80', '#16A34A'],  // green
  ['#A78BFA', '#7C3AED'],  // purple
  ['#F59E0B', '#D97706'],  // amber
  ['#14B8A6', '#0D9488'],  // teal
  ['#EC4899', '#DB2777'],  // pink
  ['#F472B6', '#E879F9'],  // rose
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

export function Avatar({
  name,
  size = 30,
  ring = false,
}: {
  name?: string;
  size?: number;
  ring?: boolean;
}) {
  const [c1, c2] = PALETTE[hashName(name || 'x') % PALETTE.length];
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold flex-shrink-0 select-none"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
        color: 'white',
        boxShadow: ring
          ? `0 0 0 2px var(--bg-sidebar), 0 0 0 4px rgba(229,178,76,0.50), 0 2px 8px rgba(0,0,0,0.20)`
          : `0 1px 3px rgba(0,0,0,0.15)`,
        textShadow: '0 1px 1px rgba(0,0,0,0.15)',
        letterSpacing: '-0.02em',
      }}
      title={name}
    >
      {initials(name)}
    </div>
  );
}
