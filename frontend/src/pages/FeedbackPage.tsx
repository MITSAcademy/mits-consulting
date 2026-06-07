import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useState } from 'react';
import { useUI } from '@/store/ui';
import { EmptyState } from '@/components/EmptyState';
import { MessageSquare } from 'lucide-react';
import { todayISO } from '@/lib/utils';

export function FeedbackPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data: fb } = useQuery({ queryKey: ['feedback'], queryFn: () => api.get('/feedback').then((r) => r.data) });
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: () => api.get('/clients').then((r) => r.data) });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ clientId: '', weekStart: todayISO(), rating: 5, notes: '' });
  const create = useMutation({
    mutationFn: () => api.post('/feedback', { ...f, rating: +f.rating }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feedback'] }); setOpen(false); showToast('Logged'); },
  });

  return (
    <>
      <Topbar title="Feedback" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="primary">+ Log feedback</Button></DialogTrigger>
          <DialogContent title="Weekly feedback">
            <div className="form-row"><Label>Client</Label><Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
              <option value="">— Select —</option>{(clients || []).filter((c: any) => c.lifecycle === 'Active').map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select></div>
            <div className="form-row"><Label>Week of</Label><Input type="date" value={f.weekStart} onChange={(e) => setF({ ...f, weekStart: e.target.value })} /></div>
            <div className="form-row"><Label>Rating (1-5)</Label><Input type="number" min={1} max={5} value={f.rating} onChange={(e) => setF({ ...f, rating: +e.target.value })} /></div>
            <div className="form-row"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            <DialogFooter><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!f.clientId} onClick={() => create.mutate()}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>Week</th><th>Client</th><th>Rating</th><th>Notes</th></tr></thead>
            <tbody>
              {(fb || []).length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={MessageSquare}
                      tone="gold"
                      title="No feedback yet"
                      description="Weekly feedback will show up here as you record it. Use the form on the client page to add the first entry."
                    />
                  </td>
                </tr>
              ) :
              (fb || []).map((x: any) => (
                <tr key={x.id} className="clickable">
                  <td className="mono text-[12px]">{x.weekStart}</td>
                  <td className="font-medium">{x.client.name}</td>
                  <td>
                    <span style={{ color: x.rating >= 4 ? 'var(--status-green)' : x.rating <= 2 ? 'var(--status-red)' : 'var(--status-amber)', letterSpacing: '2px' }}>
                      {'★'.repeat(x.rating)}
                    </span>
                    <span className="muted" style={{ letterSpacing: '2px' }}>{'☆'.repeat(5 - x.rating)}</span>
                  </td>
                  <td className="text-[12px] muted">{x.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
