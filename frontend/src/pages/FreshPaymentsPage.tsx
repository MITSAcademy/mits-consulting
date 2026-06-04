import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { useState, useMemo } from 'react';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { todayISO } from '@/lib/utils';

export function FreshPaymentsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;
  const [mineOnly, setMineOnly] = useState<boolean>(user.role === 'sales_closer');
  const { data: payments } = useQuery({ queryKey: ['payments'], queryFn: () => api.get('/payments').then((r) => r.data) });
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: () => api.get('/clients').then((r) => r.data) });
  const { data: banks } = useQuery({ queryKey: ['banks'], queryFn: () => api.get('/banks').then((r) => r.data) });

  // Roshni / any sales_closer sees only payments for clients she owns. Founder /
  // manager / accounts see everything by default; they can toggle "Mine only"
  // to filter to payments they themselves recorded.
  const filteredPayments = useMemo(() => {
    const list = payments || [];
    if (!mineOnly) return list;
    if (user.role === 'sales_closer') {
      return list.filter((p: any) => p.client?.salesOwnerId === user.id);
    }
    return list.filter((p: any) => p.receivedBy?.id === user.id);
  }, [payments, mineOnly, user]);
  // Same for the client picker in the Record modal — Roshni shouldn't have to
  // scroll past 50 clients she doesn't own to find hers.
  const filteredClients = useMemo(() => {
    const list = clients || [];
    if (user.role !== 'sales_closer') return list;
    return list.filter((c: any) => c.salesOwnerId === user.id);
  }, [clients, user]);

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
      <Topbar
        title="Fresh payments"
        subtitle={`${filteredPayments.length} payment${filteredPayments.length === 1 ? '' : 's'}${mineOnly ? ' · mine' : ''}`}
        actions={
        <>
          <Button
            size="sm"
            variant={mineOnly ? 'primary' : 'default'}
            onClick={() => setMineOnly(!mineOnly)}
            title={user.role === 'sales_closer' ? 'Show only payments for clients you own' : 'Show only payments you recorded'}
          >
            {mineOnly ? 'Mine only ✓' : 'Mine only'}
          </Button>
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
                  {filteredClients.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.cycleAmount ? ` · ${c.currency} ${c.cycleAmount}` : ''}{c.saleClosingSubStatus ? ` · ${c.saleClosingSubStatus}` : ''}</option>)}
                </Select>
                {user.role === 'sales_closer' && (
                  <div className="text-[10px] muted mt-1">Showing only your assigned clients ({filteredClients.length}). Names include amount + status to disambiguate.</div>
                )}
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
        </>
      } />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>Date</th><th>Client</th><th>Kind</th><th>Amount</th><th>Bank</th><th>Received by</th></tr></thead>
            <tbody>
              {filteredPayments.map((p: any) => (
                <tr key={p.id}>
                  <td className="mono">{p.paymentDate}</td>
                  <td>{p.client.name}</td>
                  <td>{p.kind}</td>
                  <td className="mono">{p.currency} {p.amount}</td>
                  <td>{p.bankAccount?.label || '—'}</td>
                  <td>{p.receivedBy?.name || '—'}</td>
                </tr>
              ))}
              {filteredPayments.length === 0 && (
                <tr><td colSpan={6} className="muted text-center py-6">
                  {mineOnly && user.role === 'sales_closer'
                    ? 'No payments recorded for your clients yet. Record one via the + Record payment button.'
                    : 'No payments recorded yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
