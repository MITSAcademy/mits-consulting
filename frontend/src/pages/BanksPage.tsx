import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';

export function BanksPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data } = useQuery({ queryKey: ['banks'], queryFn: () => api.get('/banks').then((r) => r.data) });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ id: '', label: '', bank: '', last4: '' });
  const create = useMutation({
    mutationFn: () => api.post('/banks', f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['banks'] }); setOpen(false); showToast('Added'); },
  });

  return (
    <>
      <Topbar title="Bank accounts" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="primary">+ Add bank</Button></DialogTrigger>
          <DialogContent title="New bank account">
            <div className="form-row"><Label>ID (slug)</Label><Input value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} placeholder="b-hdfc-xyz" /></div>
            <div className="form-row"><Label>Label</Label><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
            <div className="form-row"><Label>Bank</Label><Input value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} /></div>
            <div className="form-row"><Label>Last 4</Label><Input value={f.last4} onChange={(e) => setF({ ...f, last4: e.target.value })} /></div>
            <DialogFooter><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!f.id || !f.label} onClick={() => create.mutate()}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>Label</th><th>Bank</th><th>Last 4</th><th>Status</th></tr></thead>
            <tbody>
              {(data || []).map((b: any) => (
                <tr key={b.id}>
                  <td className="font-medium">{b.label}</td>
                  <td>{b.bank}</td>
                  <td className="mono">{b.last4}</td>
                  <td>{b.active ? <Pill color="green">Active</Pill> : <Pill color="red">Inactive</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
