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

  return (
    <>
      <Topbar title="Pipeline overview" />
      <Page>
        <div className="callout">
          Full client lifecycle: Lead → Intake → Sourcing → Verification → Demo → Sale close → Active.
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
          {LIFECYCLE.map((s) => {
            const clients = (data?.[s] || []) as any[];
            return (
              <div key={s} className="bg-bg-card border border-brand-border rounded-md p-2.5 min-h-[220px]">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-textSecondary mb-2 flex justify-between">
                  <span>{stageLabel(s)}</span>
                  <span className="bg-bg-input text-brand-textSecondary text-[10px] px-1.5 rounded-full font-semibold">
                    {clients.length}
                  </span>
                </div>
                {clients.length === 0 && (
                  <div className="muted text-[11px] text-center pt-3">Empty</div>
                )}
                {clients.slice(0, 8).map((c) => (
                  <Link
                    key={c.id}
                    to={`/clients/${c.id}`}
                    className="block bg-bg-input border border-brand-borderSoft rounded p-2 mb-1.5 hover:bg-bg-cardHover transition-colors"
                  >
                    <div className="font-medium text-xs mb-0.5">{c.name}</div>
                    <div className="text-[10px] muted mono">
                      {c.engagementType} · {c.source || '—'}
                    </div>
                  </Link>
                ))}
                {clients.length > 8 && (
                  <div className="muted text-[10px] text-center mt-1">+{clients.length - 8} more</div>
                )}
              </div>
            );
          })}
        </div>
      </Page>
    </>
  );
}
