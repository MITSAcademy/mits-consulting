import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { SkeletonKpis, SkeletonTable } from '@/components/ui/Skeleton';

export function MoneyFlowPage() {
  const { data: home } = useQuery({
    queryKey: ['metrics/home'],
    queryFn: () => api.get('/metrics/home').then((r) => r.data),
  });
  const { data: flow } = useQuery({
    queryKey: ['metrics/money-flow'],
    queryFn: () => api.get('/metrics/money-flow').then((r) => r.data),
  });

  if (!home) return (
    <>
      <Topbar title="Money flow" subtitle="MTD" />
      <Page>
        <SkeletonKpis count={4} />
        <SkeletonKpis count={4} />
        <SkeletonTable rows={6} cols={5} />
      </Page>
    </>
  );

  const m = home.money;
  return (
    <>
      <Topbar title="Money flow" subtitle="MTD" />
      <Page>
        <div className="callout gold">Indicative FX: USD = ₹83, CAD = ₹60.</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
          <div className="kpi-card" style={{ borderTop: '2px solid var(--status-green)' }}>
            <div className="kpi-label">USD in</div>
            <div className="kpi-value" style={{ color: 'var(--status-green)' }}>${m.usdIn.toLocaleString()}</div>
            <div className="kpi-sub">≈ ₹{m.usdInINR.toLocaleString()}</div>
          </div>
          <div className="kpi-card" style={{ borderTop: '2px solid var(--status-green)' }}>
            <div className="kpi-label">CAD in</div>
            <div className="kpi-value" style={{ color: 'var(--status-green)' }}>C${m.cadIn.toLocaleString()}</div>
            <div className="kpi-sub">≈ ₹{m.cadInINR.toLocaleString()}</div>
          </div>
          <div className="kpi-card" style={{ borderTop: '2px solid var(--accent-gold)' }}>
            <div className="kpi-label">Total in</div>
            <div className="kpi-value">₹{m.totalInINR.toLocaleString()}</div>
          </div>
          <div className="kpi-card" style={{ borderTop: '2px solid var(--status-red)' }}>
            <div className="kpi-label">Trainer out</div>
            <div className="kpi-value" style={{ color: 'var(--status-red)' }}>₹{m.trainerOut.toLocaleString()}</div>
            <div className="kpi-sub">₹{m.trainerPending.toLocaleString()} unpaid</div>
          </div>
        </div>
        {/* Net this month — hero stat */}
        <div
          className="card-hero text-center mb-4"
          style={{ padding: '28px 24px' }}
        >
          <div className="kpi-label mb-2">Net this month</div>
          <div
            className="kpi-value"
            style={{
              fontSize: 40,
              color: m.net > 0 ? 'var(--status-green)' : 'var(--status-red)',
              letterSpacing: '-0.025em',
              textShadow: m.net > 0
                ? '0 0 24px rgba(74,222,128,0.25)'
                : '0 0 24px rgba(239,68,68,0.25)',
            }}
          >
            ₹{m.net.toLocaleString()}
          </div>
        </div>
        <div className="divider">Bank-wise inflows this month</div>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Payments</th>
                <th>Total received</th>
              </tr>
            </thead>
            <tbody>
              {flow?.byBank?.length ? (
                flow.byBank.map((b: any) => (
                  <tr key={b.bank.id}>
                    <td>
                      <div className="font-medium">{b.bank.label}</div>
                    </td>
                    <td className="mono">{b.count}</td>
                    <td className="mono">
                      {b.usd > 0 && `$${b.usd}`}
                      {b.usd > 0 && b.cad > 0 && ' · '}
                      {b.cad > 0 && `C$${b.cad}`}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="muted text-center py-8">
                    No payments this month yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
