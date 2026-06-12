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
import { EmptyState } from '@/components/EmptyState';
import { Wallet, ChevronLeft, ChevronRight } from 'lucide-react';
import { celebrate } from '@/components/CelebrationLayer';

const PAGE_SIZE = 20;

export function FreshPaymentsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;
  const isSalesCloser = user.role === 'sales_closer';
  // sales_closer sees all payments (no filter needed — they record everything)
  // other roles can toggle Mine only
  const [mineOnly, setMineOnly] = useState<boolean>(false);
  const [page, setPage] = useState(0);

  const { data: payments } = useQuery({ queryKey: ['payments'], queryFn: () => api.get('/payments').then((r) => r.data) });
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: () => api.get('/clients').then((r) => r.data) });
  const { data: banks } = useQuery({ queryKey: ['banks'], queryFn: () => api.get('/banks').then((r) => r.data) });

  const filteredPayments = useMemo(() => {
    const list = [...((payments || []) as any[])].sort((a, b) =>
      (b.paymentDate || '').localeCompare(a.paymentDate || '')
    );
    if (isSalesCloser) return list;
    if (!mineOnly) return list;
    return list.filter((p: any) => p.receivedBy?.id === user.id);
  }, [payments, mineOnly, isSalesCloser, user]);

  const totalPages = Math.ceil(filteredPayments.length / PAGE_SIZE);
  const pagePayments = filteredPayments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset to page 0 when filter changes
  const handleMineOnly = () => { setMineOnly((v) => !v); setPage(0); };

  // Client picker: Roshni only sees her assigned clients
  const filteredClients = useMemo(() => {
    const list = (clients || []) as any[];
    const mine = isSalesCloser ? list.filter((c: any) => c.salesOwnerId === user.id) : list;
    // Exclude dummy/test clients
    return mine.filter((c: any) => !c.name?.startsWith('dummy_') && c.name !== 'vb');
  }, [clients, isSalesCloser, user]);

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ clientId: '', kind: 'Fresh', amount: 0, currency: 'USD', paymentDate: todayISO(), bankAccountId: '', paymentMode: 'Bank' });
  const create = useMutation({
    mutationFn: () => api.post('/payments', { ...f, amount: +f.amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['metrics/home'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      setOpen(false);
      setPage(0);
      showToast('🎉 Payment recorded — great work!');
      celebrate();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <>
      <Topbar
        title="Fresh payments"
        subtitle={`${filteredPayments.length} payment${filteredPayments.length === 1 ? '' : 's'}${!isSalesCloser && mineOnly ? ' · mine' : ''}`}
        actions={
        <>
          {!isSalesCloser && (
            <Button
              size="sm"
              variant={mineOnly ? 'primary' : 'default'}
              onClick={handleMineOnly}
              title="Show only payments you recorded"
            >
              {mineOnly ? 'Mine only ✓' : 'Mine only'}
            </Button>
          )}
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
                    {filteredClients.map((c: any) => {
                      const phone = c.phoneDigits ? `+${(c.phoneCode || '91').replace(/\D/g,'')} ${c.phoneDigits}` : '';
                      return <option key={c.id} value={c.id}>{c.name}{phone ? ` · ${phone}` : ''}</option>;
                    })}
                  </Select>
                  {isSalesCloser && (
                    <div className="text-[10px] muted mt-1">Showing your assigned clients ({filteredClients.length}) · name + phone number.</div>
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
              {pagePayments.map((p: any) => (
                <tr key={p.id} className="clickable">
                  <td className="mono">{p.paymentDate}</td>
                  <td className="font-medium">{p.client.name}</td>
                  <td><span className="text-[11px] muted">{p.kind}</span></td>
                  <td className="mono font-semibold">{p.currency} {p.amount}</td>
                  <td className="muted text-[12px]">{p.bankAccount?.label || '—'}</td>
                  <td className="muted text-[12px]">{p.receivedBy?.name || '—'}</td>
                </tr>
              ))}
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Wallet}
                      tone="gold"
                      title="No payments recorded yet"
                      description="Once a client pays, log it here so accounts can reconcile and the client moves to Sale Won."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 text-[13px]">
            <span className="muted">Page {page + 1} of {totalPages} · {filteredPayments.length} total</span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="default" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} /> Prev
              </Button>
              <Button size="sm" variant="default" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </Page>
    </>
  );
}
