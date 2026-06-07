import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useUI } from '@/store/ui';
import { todayISO } from '@/lib/utils';
import { Pill } from '@/components/ui/pill';
import { EmptyState } from '@/components/EmptyState';
import { Wallet } from 'lucide-react';

function startOfWeek(iso: string) {
  const d = new Date(iso);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return d.toISOString().slice(0, 10);
}

export function TrainerPayPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [weekStart, setWeekStart] = useState(startOfWeek(todayISO()));
  const { data: logs } = useQuery({
    queryKey: ['session-logs', { weekStart }],
    queryFn: () => api.get('/session-logs', { params: { weekStart } }).then((r) => r.data),
  });
  const [selected, setSelected] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: () => api.post('/payouts', { weekStart, sessionIds: selected }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session-logs'] });
      qc.invalidateQueries({ queryKey: ['payouts'] });
      showToast('Batch created');
      setSelected([]);
    },
  });

  const eligible = (logs || []).filter((l: any) => l.status === 'Logged');
  const total = eligible.filter((l: any) => selected.includes(l.id)).reduce((s: number, l: any) => s + l.amountInr, 0);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const all = () => setSelected(eligible.map((l: any) => l.id));

  return (
    <>
      <Topbar title="Trainer payouts" subtitle={`Week of ${weekStart}`} actions={
        <>
          <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="input !w-auto" />
          <Button onClick={all}>Select all</Button>
          <Button variant="primary" disabled={selected.length === 0} onClick={() => create.mutate()}>
            Create batch · ₹{total.toLocaleString()}
          </Button>
        </>
      } />
      <Page>
        {selected.length > 0 && (
          <div
            className="callout mb-3 flex items-center justify-between gap-3"
            style={{ borderColor: 'var(--accent-gold)', background: 'var(--accent-goldSoft)' }}
          >
            <span><strong>{selected.length}</strong> sessions selected · total <strong className="mono">₹{total.toLocaleString()}</strong></span>
            <Button variant="primary" onClick={() => create.mutate()}>Create payout batch →</Button>
          </div>
        )}
        {(logs || []).length === 0 ? (
          <EmptyState
            icon={Wallet}
            tone="grey"
            title="No sessions this week"
            description="Change the week above to see other weeks, or log a session first."
          />
        ) : (
        <div className="table-card">
          <table>
            <thead>
              <tr><th></th><th>Date</th><th>Trainer</th><th>Client</th><th>Hours</th><th>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              {(logs || []).map((l: any) => (
                <tr
                  key={l.id}
                  className="clickable"
                  style={selected.includes(l.id) ? { background: 'var(--accent-goldSoft)' } : undefined}
                  onClick={() => l.status === 'Logged' && toggle(l.id)}
                >
                  <td>
                    {l.status === 'Logged' && (
                      <input type="checkbox" checked={selected.includes(l.id)} onChange={() => toggle(l.id)} onClick={(e) => e.stopPropagation()} />
                    )}
                  </td>
                  <td className="mono text-[12px]">{l.date}</td>
                  <td className="font-medium">{l.trainer.name}</td>
                  <td className="muted">{l.client?.name || '—'}</td>
                  <td className="mono">{l.hours}h</td>
                  <td className="mono font-semibold">₹{l.amountInr.toLocaleString()}</td>
                  <td><Pill color={l.status === 'Paid' ? 'green' : 'grey'}>{l.status}</Pill></td>
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
