/**
 * Skeleton — soft pulsing placeholder for loading content.
 *
 * Drop in instead of "Loading…" strings on data-heavy pages so the layout
 * doesn't jump when the data arrives. Three pre-baked layouts cover most
 * pages; custom ones can use `<SkeletonBlock />` directly.
 */

/** Atomic skeleton — single shimmering bar. Width/height controlled by props. */
export function SkeletonBlock({
  w = '100%',
  h = 14,
  className = '',
  rounded = 6,
}: {
  w?: number | string;
  h?: number | string;
  className?: string;
  rounded?: number;
}) {
  return (
    <span
      className={`block ${className}`}
      style={{
        width: typeof w === 'number' ? `${w}px` : w,
        height: typeof h === 'number' ? `${h}px` : h,
        borderRadius: rounded,
        background:
          'linear-gradient(90deg, var(--bg-cardHover) 0%, color-mix(in srgb, var(--bg-cardHover) 60%, var(--accent-gold) 4%) 50%, var(--bg-cardHover) 100%)',
        backgroundSize: '200% 100%',
        animation: 'skeletonShimmer 1.4s ease-in-out infinite',
      }}
      aria-hidden
    />
  );
}

/** Row layout for tables — 5 columns of pulsing bars. */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-card">
      <table>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: cols }).map((_, j) => (
                <td key={j} style={{ padding: '12px 14px' }}>
                  <SkeletonBlock
                    w={j === 0 ? '60%' : j === cols - 1 ? 80 : '40%'}
                    h={12}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <style>{`
        @keyframes skeletonShimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

/** Grid of KPI-card skeletons — for dashboard-style pages. */
export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="kpi-card" style={{ minHeight: 84 }}>
          <SkeletonBlock w={90} h={10} className="mb-2.5" />
          <SkeletonBlock w={70} h={22} />
        </div>
      ))}
      <style>{`
        @keyframes skeletonShimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
