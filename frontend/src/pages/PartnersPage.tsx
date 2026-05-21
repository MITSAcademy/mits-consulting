import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { useState } from 'react';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';

export function PartnersPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data } = useQuery({ queryKey: ['partners'], queryFn: () => api.get('/partners').then((r) => r.data) });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', contact: '', email: '', phone: '', billingCycle: '', paymentTerms: '', notes: '' });
  const create = useMutation({
    mutationFn: () => api.post('/partners', f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['partners'] }); setOpen(false); showToast('Partner added'); },
  });

  return (
    <>
      <Topbar title="Partners" subtitle={`${data?.length || 0}`} actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="primary">+ Add partner</Button></DialogTrigger>
          <DialogContent title="New partner">
            <div className="grid md:grid-cols-2 gap-2.5">
              <div className="form-row md:col-span-2"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
              <div className="form-row"><Label>Contact</Label><Input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></div>
              <div className="form-row"><Label>Email</Label><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
              <div className="form-row"><Label>Phone</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
              <div className="form-row"><Label>Billing cycle</Label><Input value={f.billingCycle} onChange={(e) => setF({ ...f, billingCycle: e.target.value })} /></div>
              <div className="form-row md:col-span-2"><Label>Payment terms</Label><Input value={f.paymentTerms} onChange={(e) => setF({ ...f, paymentTerms: e.target.value })} /></div>
              <div className="form-row md:col-span-2"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!f.name} onClick={() => create.mutate()}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>Name</th><th>Contact</th><th>Billing</th><th>Terms</th><th>Status</th></tr></thead>
            <tbody>
              {(data || []).map((p: any) => (
                <tr key={p.id} className="clickable">
                  <td className="font-medium">{p.name}</td>
                  <td><div>{p.contact}</div><div className="muted text-[11px]">{p.email}</div></td>
                  <td>{p.billingCycle || '—'}</td>
                  <td>{p.paymentTerms || '—'}</td>
                  <td>{p.active ? <Pill color="green">Active</Pill> : <Pill color="red">Inactive</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
