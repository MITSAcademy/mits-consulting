import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';
import { Avatar } from '@/components/ui/avatar';
import { ROLE_LABELS } from '@/lib/utils';

export function TeamAdminPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then((r) => r.data) });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'staff', reportsToId: '' });
  const create = useMutation({
    mutationFn: () => api.post('/users', f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setOpen(false); showToast('Added'); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const setActive = useMutation({
    mutationFn: ({ id, active }: any) => api.patch(`/users/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <>
      <Topbar title="Team" subtitle={`${data?.length || 0}`} actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="primary">+ Add user</Button></DialogTrigger>
          <DialogContent title="Add team member">
            <div className="grid md:grid-cols-2 gap-2.5">
              <div className="form-row"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
              <div className="form-row"><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
              <div className="form-row"><Label>Password</Label><Input type="password" minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
              <div className="form-row"><Label>Role</Label><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
              <div className="form-row md:col-span-2"><Label>Reports to</Label><Select value={f.reportsToId} onChange={(e) => setF({ ...f, reportsToId: e.target.value })}><option value="">— None —</option>{(data || []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></div>
            </div>
            <DialogFooter><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!f.name || !f.email || !f.password} onClick={() => create.mutate()}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Reports to</th><th>Active</th></tr></thead>
            <tbody>
              {(data || []).map((u: any) => (
                <tr key={u.id}>
                  <td className="flex items-center gap-2 py-2"><Avatar name={u.name} size={24} /><span className="font-medium">{u.name}</span></td>
                  <td className="muted text-xs">{u.email}</td>
                  <td><Pill color="grey">{ROLE_LABELS[u.role] || u.role}</Pill></td>
                  <td className="muted">{(data || []).find((x: any) => x.id === u.reportsToId)?.name || '—'}</td>
                  <td>
                    <Button size="sm" onClick={() => setActive.mutate({ id: u.id, active: !u.active })}>
                      {u.active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
