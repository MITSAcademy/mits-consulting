import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { useState } from 'react';
import { useUI } from '@/store/ui';
import { todayISO } from '@/lib/utils';

export function FreshPaymentsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data: payments } = useQuery({ queryKey: ['payments'], queryFn: () => api.get('/payments').then((r) => r.data) });
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: () => api.get('/clients').then((r) => r.data) });
  const { data: banks } = useQuery({ queryKey: ['banks'], queryFn: () => api.get('/banks').then((r) => r.data) });

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ clientId: '', kind: 'Fresh', amount: 0, currency: 'USD', paymentDate: todayISO(), bankAccountId: '', paymentMode: 'Bank' });
  const create = useMutation({
    mutationFn: () => api.post('/payments', { ...f, amount: +f.amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['metrics/home'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      setOpen(false);
      showToast('Payment recorded');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <>
      <Topbar title="Fresh payments" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="primary">+ Record payment</Button></DialogTrigger>
          <DialogContent title="Record payment">
            <div className="grid md:grid-cols-2 gap-2.5">
              <div className="form-row md:col-span-2">
                <Label>Client</Label>
                <Select value={f.clientId} onChange={(e) => {
                  const c = (clients || []).find((x: any) => x.id === e.target.value);
                  setF({ ...f, clientId: e.target.value, currency: c?.currency || 'USD', amount: c?.cycleAmount || 0, bankAccountId: c?.bankAccountId || '' });
                }}>
                  <option value="">— Select —</option>
                  {(clients || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div className="form-row"><Label>Kind</Label><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option>Fresh</option><option>Renewal</option><option>Other</option></Select></div>
              <div className="form-row"><Label>Date</Label><Input type="date" value={f.paymentDate} onChange={(e) => setF({ ...f, paymentDate: e.target.value })} /></div>
              <div className="form-row"><Label>Amount</Label><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: +e.target.value })} /></div>
              <div className="form-row"><Label>Currency</Label><Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}><option>USD</option><option>CAD</option><option>INR</option><option>EUR</option><option>GBP</option><option>AUD</option></Select></div>
              <div className="form-row md:col-span-2"><Label>Bank account</Label><Select value={f.bankAccountId} onChange={(e) => setF({ ...f, bankAccountId: e.target.value })}><option value="">— Select —</option>{(banks || []).map((b: any) => <option key={b.id} value={b.id}>{b.label}</option>)}</Select></div>
              <div className="form-row md:col-span-2"><Label>Mode</Label><Select value={f.paymentMode} onChange={(e) => setF({ ...f, paymentMode: e.target.value })}><option>Bank</option><option>UPI</option><option>Zelle</option><option>Cash</option><option>Wire</option></Select></div>
            </div>
            <DialogFooter><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!f.clientId || !f.amount} onClick={() => create.mutate()}>Record</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>Date</th><th>Client</th><th>Kind</th><th>Amount</th><th>Bank</th><th>Received by</th></tr></thead>
            <tbody>
              {(payments || []).map((p: any) => (
                <tr key={p.id}>
                  <td className="mono">{p.paymentDate}</td>
                  <td>{p.client.name}</td>
                  <td>{p.kind}</td>
                  <td className="mono">{p.currency} {p.amount}</td>
                  <td>{p.bankAccount?.label || '—'}</td>
                  <td>{p.receivedBy?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
