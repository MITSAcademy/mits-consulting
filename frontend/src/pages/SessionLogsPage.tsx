import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { ClipboardList, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useUI } from '@/store/ui';
import { todayISO } from '@/lib/utils';
import { useAuth } from '@/store/auth';

const LOG_ROLES = ['founder', 'manager', 'lead', 'account_manager', 'payment_processor'];
const DAY_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7];

function LogSessionForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [trainerId, setTrainerId] = useState('');
  const [clientId, setClientId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [days, setDays] = useState('1');
  const [notes, setNotes] = useState('');

  const { data: trainers } = useQuery({
    queryKey: ['trainers-active'],
    queryFn: () => api.get('/trainers').then((r) => r.data.filter((t: any) => t.active)),
  });
  const { data: clients } = useQuery({
    queryKey: ['clients-active'],
    queryFn: () =>
      api.get('/clients').then((r) =>
        r.data
          .filter((c: any) => c.lifecycle === 'Active')
          .sort((a: any, b: any) => a.name.localeCompare(b.name))
      ),
  });

  const selectedTrainer = (trainers || []).find((t: any) => t.id === trainerId);
  const rate = selectedTrainer?.defaultRateInr || 0;
  const total = Math.round((parseFloat(days) || 0) * rate);

  const create = useMutation({
    mutationFn: () => {
      if (!trainerId) throw new Error('Select a trainer');
      return api.post('/session-logs', {
        trainerId,
        clientId: clientId || undefined,
        date,
        hours: parseFloat(days) || 1,
        rateSnapshot: rate || 1200,
        rateModel: selectedTrainer?.rateModel || 'per_session',
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session-logs'] });
      showToast('Session logged');
      onDone();
    },
    onError: (e: any) => showToast(e.message || e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <div className="card mb-4">
      <div className="card-h mb-3">
        <Plus size={14} />
        <span className="font-bold">Log session</span>
        <button className="ml-auto muted hover:text-white" onClick={onDone}><X size={14} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label">Trainer *</label>
          <select className="input" value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
            <option value="">— select trainer —</option>
            {(trainers || []).map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.defaultRateInr ? ` · ₹${t.defaultRateInr}/session` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Client (optional)</label>
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— no specific client —</option>
            {(clients || []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Date *</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Days / sessions *</label>
          <select className="input" value={days} onChange={(e) => setDays(e.target.value)}>
            {DAY_OPTIONS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      {selectedTrainer && (
        <div className="callout mb-3 text-xs">
          Rate: <strong>₹{rate.toLocaleString()}</strong> per session ·
          Sessions: <strong>{days}</strong> ·
          Total this entry: <strong>₹{total.toLocaleString()}</strong>
        </div>
      )}
      <div className="mb-3">
        <label className="label">Notes (optional)</label>
        <input
          type="text"
          className="input"
          placeholder="e.g. mock interview, Java session"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!trainerId || create.isPending} onClick={() => create.mutate()}>
          Log session
        </Button>
      </div>
    </div>
  );
}

const STATUS_COLOR: Record<string, 'green' | 'blue' | 'amber' | 'grey'> = {
  Paid: 'green',
  PaymentApproved: 'blue',
  ReadyForFinal: 'amber',
  Logged: 'grey',
};

export function SessionLogsPage() {
  const user = useAuth((s) => s.user)!;
  const canLog = LOG_ROLES.includes(user.role);
  const [showForm, setShowForm] = useState(false);

  const { data } = useQuery({
    queryKey: ['session-logs'],
    queryFn: () => api.get('/session-logs').then((r) => r.data),
  });

  return (
    <>
      <Topbar
        title="Session logs"
        subtitle={`${data?.length || 0}`}
        actions={
          canLog && !showForm ? (
            <Button variant="primary" onClick={() => setShowForm(true)}>
              <Plus size={14} /> Log session
            </Button>
          ) : undefined
        }
      />
      <Page>
        {showForm && <LogSessionForm onDone={() => setShowForm(false)} />}
        {(data || []).length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            tone="grey"
            title="No session logs yet"
            description="Use the Log session button above to record a trainer's daily work."
          />
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Trainer</th>
                  <th>Client</th>
                  <th>Days</th>
                  <th>Rate</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(data || []).map((l: any) => (
                  <tr key={l.id}>
                    <td className="mono text-[12px]">{l.date}</td>
                    <td className="font-medium">{l.trainer.name}</td>
                    <td className="muted">{l.client?.name || '—'}</td>
                    <td className="mono">{l.hours}</td>
                    <td className="mono text-[12px]">₹{l.rateSnapshot.toLocaleString()}</td>
                    <td className="mono font-semibold">₹{l.amountInr.toLocaleString()}</td>
                    <td>
                      <Pill color={STATUS_COLOR[l.status] || 'grey'}>{l.status}</Pill>
                    </td>
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
