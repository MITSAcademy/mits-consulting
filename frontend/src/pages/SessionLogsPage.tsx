import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { EmptyState } from '@/components/EmptyState';
import { ClipboardList } from 'lucide-react';

export function SessionLogsPage() {
  const { data } = useQuery({ queryKey: ['session-logs'], queryFn: () => api.get('/session-logs').then((r) => r.data) });

  return (
    <>
      <Topbar title="Session logs" subtitle={`${data?.length || 0}`} />
      <Page>
        {(data || []).length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            tone="grey"
            title="No session logs yet"
            description="Sessions logged during hosting will appear here for payroll processing."
          />
        ) : (
        <div className="table-card">
          <table>
            <thead><tr><th>Date</th><th>Trainer</th><th>Client</th><th>Hours</th><th>Rate</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {(data || []).map((l: any) => (
                <tr key={l.id} className="clickable">
                  <td className="mono text-[12px]">{l.date}</td>
                  <td className="font-medium">{l.trainer.name}</td>
                  <td className="muted">{l.client?.name || '—'}</td>
                  <td className="mono">{l.hours}h</td>
                  <td className="mono text-[12px]">₹{l.rateSnapshot} <span className="muted text-[11px]">{l.rateModel}</span></td>
                  <td className="mono font-semibold">₹{l.amountInr.toLocaleString()}</td>
                  <td><Pill color={l.status === 'Paid' ? 'green' : l.status === 'PaymentApproved' ? 'blue' : l.status === 'ReadyForFinal' ? 'amber' : 'grey'}>{l.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Page>
    </>
  );
}
