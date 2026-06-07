import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useState } from 'react';
import { useUI } from '@/store/ui';

const STAGES = ['New', 'Contacted', 'Vetting', 'Approved', 'Rejected'];

export function TrainerLeadsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data } = useQuery({ queryKey: ['trainer-leads'], queryFn: () => api.get('/trainer-leads').then((r) => r.data) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', skills: '', source: '', expectedRateInr: 0, stage: 'New', notes: '' });

  const create = useMutation({
    mutationFn: () => api.post('/trainer-leads', { ...form, expectedRateInr: +form.expectedRateInr }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trainer-leads'] });
      showToast('Lead added');
      setOpen(false);
    },
  });

  const setStage = useMutation({
    mutationFn: ({ id, stage }: any) => api.patch(`/trainer-leads/${id}`, { stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trainer-leads'] }),
  });

  return (
    <>
      <Topbar
        title="Trainer leads"
        subtitle={`${data?.length || 0}`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button variant="primary">+ Add lead</Button></DialogTrigger>
            <DialogContent title="New trainer lead">
              <div className="grid md:grid-cols-2 gap-2.5">
                <div className="form-row md:col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="form-row md:col-span-2"><Label>Skills</Label><Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></div>
                <div className="form-row"><Label>Source</Label><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
                <div className="form-row"><Label>Expected rate ₹</Label><Input type="number" value={form.expectedRateInr} onChange={(e) => setForm({ ...form, expectedRateInr: +e.target.value })} /></div>
                <div className="form-row md:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Cancel</Button>
                <Button variant="primary" disabled={!form.name} onClick={() => create.mutate()}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <Page>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {STAGES.map((s) => {
            const items = (data || []).filter((l: any) => l.stage === s);
            const stageColor = s === 'Approved' ? 'var(--status-green)' : s === 'Rejected' ? 'var(--status-red)' : s === 'Vetting' ? 'var(--status-amber)' : 'var(--brand-textMuted)';
            return (
              <div key={s} className="card min-h-[200px]" style={{ borderTop: `2px solid ${stageColor}` }}>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: stageColor }}>{s}</span>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--bg-input)', color: 'var(--brand-textMuted)' }}
                  >
                    {items.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {items.map((l: any) => (
                    <div
                      key={l.id}
                      className="rounded-xl p-2.5 text-xs hover-lift"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
                    >
                      <div className="font-semibold mb-0.5">{l.name}</div>
                      {l.skills && <div className="muted truncate mb-0.5">{l.skills}</div>}
                      <div className="muted mono text-[10.5px]">
                        {l.expectedRateInr > 0 && <>₹{l.expectedRateInr.toLocaleString()}</>}
                        {l.source && <> · {l.source}</>}
                      </div>
                      <Select className="!text-[11px] !py-0.5 mt-2" value={l.stage} onChange={(e) => setStage.mutate({ id: l.id, stage: e.target.value })}>
                        {STAGES.map((st) => <option key={st}>{st}</option>)}
                      </Select>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="text-center py-8 muted text-[11px]">None in {s.toLowerCase()}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Page>
    </>
  );
}
