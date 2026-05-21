import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';

export function SessionLogsPage() {
  const { data } = useQuery({ queryKey: ['session-logs'], queryFn: () => api.get('/session-logs').then((r) => r.data) });

  return (
    <>
      <Topbar title="Session logs" subtitle={`${data?.length || 0}`} />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>Date</th><th>Trainer</th><th>Client</th><th>Hours</th><th>Rate</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {(data || []).length === 0 ? <tr><td colSpan={7} className="text-center py-8 muted">No logs.</td></tr> :
              (data || []).map((l: any) => (
                <tr key={l.id}>
                  <td className="mono">{l.date}</td>
                  <td>{l.trainer.name}</td>
                  <td>{l.client?.name || '—'}</td>
                  <td className="mono">{l.hours}</td>
                  <td className="mono">₹{l.rateSnapshot} <span className="muted text-xs">{l.rateModel}</span></td>
                  <td className="mono">₹{l.amountInr}</td>
                  <td><Pill color={l.status === 'Paid' ? 'green' : l.status === 'PaymentApproved' ? 'blue' : l.status === 'ReadyForFinal' ? 'amber' : 'grey'}>{l.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
