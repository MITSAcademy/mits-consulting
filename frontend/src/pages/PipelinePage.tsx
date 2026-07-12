import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { LIFECYCLE, stageLabel } from '@/lib/utils';
import { Link } from 'react-router-dom';

export function PipelinePage() {
  const { data } = useQuery({
    queryKey: ['metrics/pipeline'],
    queryFn: () => api.get('/metrics/pipeline').then((r) => r.data),
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  return (
    <>
      <Topbar title="Pipeline overview" />
      <Page>
        <div className="callout">
          Full client lifecycle: Lead → Intake → Sourcing → Verification → Demo → Sale close → Active.
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))' }}>
          {LIFECYCLE.map((s) => {
            const clients = (data?.[s] || []) as any[];
            const isExpanded = expanded.has(s);
            const visible = isExpanded ? clients : clients.slice(0, 8);
            return (
              <div
                key={s}
                className="card"
                style={{ padding: '12px 12px', minHeight: 200 }}
              >
                <div className="card-h">
                  <span>{stageLabel(s)}</span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: clients.length > 0 ? 'var(--accent-goldSoft)' : 'var(--bg-input)',
                      color: clients.length > 0 ? 'var(--accent-gold)' : 'var(--brand-textMuted)',
                      border: `1px solid ${clients.length > 0 ? 'rgba(229,178,76,0.25)' : 'var(--brand-borderSoft)'}`,
                    }}
                  >
                    {clients.length}
                  </span>
                </div>
                {clients.length === 0 && (
                  <div className="muted text-[11px] text-center pt-4 pb-2">Empty</div>
                )}
                {visible.map((c) => (
                  <Link
                    key={c.id}
                    to={`/clients/${c.id}`}
                    className="block rounded-lg p-2 mb-1 transition-colors"
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--brand-borderSoft)',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--accent-gold) 6%, var(--bg-input))'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--accent-gold) 20%, var(--brand-borderSoft))'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-input)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-borderSoft)'; }}
                  >
                    <div className="font-medium text-[12px] leading-snug">{c.name}</div>
                    <div className="text-[10px] muted mt-0.5 mono truncate">
                      {c.engagementType} · {c.source || '—'}
                    </div>
                  </Link>
                ))}
                {clients.length > 8 && (
                  <button
                    onClick={() => setExpanded(prev => {
                      const next = new Set(prev);
                      isExpanded ? next.delete(s) : next.add(s);
                      return next;
                    })}
                    className="w-full text-[10px] text-center mt-1.5 py-1.5 rounded-lg transition-colors font-medium"
                    style={{ color: 'var(--accent-gold)', background: 'var(--accent-goldSoft)', border: '1px solid rgba(229,178,76,0.20)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(229,178,76,0.18)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-goldSoft)'; }}
                  >
                    {isExpanded ? '▲ Show less' : `+${clients.length - 8} more`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Page>
    </>
  );
}
