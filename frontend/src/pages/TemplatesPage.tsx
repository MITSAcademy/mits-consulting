import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';

export function TemplatesPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data } = useQuery({ queryKey: ['templates'], queryFn: () => api.get('/templates').then((r) => r.data) });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ id: '', kind: 'Email', stage: '', name: '', subject: '', body: '' });
  const create = useMutation({
    mutationFn: () => api.post('/templates', { ...f, variables: extractVars(f.body + ' ' + f.subject) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); setOpen(false); showToast('Saved'); },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  return (
    <>
      <Topbar title="Email templates" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="primary">+ New template</Button></DialogTrigger>
          <DialogContent title="New template" className="max-w-3xl">
            <div className="grid md:grid-cols-2 gap-2.5">
              <div className="form-row"><Label>ID</Label><Input value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} placeholder="tpl-xyz" /></div>
              <div className="form-row"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
              <div className="form-row"><Label>Kind</Label><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option>Email</option><option>WhatsApp</option></Select></div>
              <div className="form-row"><Label>Stage</Label><Input value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} /></div>
              <div className="form-row md:col-span-2"><Label>Subject</Label><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
              <div className="form-row md:col-span-2"><Label>Body — use {`{{var}}`} placeholders</Label><Textarea rows={10} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!f.id || !f.name} onClick={() => create.mutate()}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Page>
        <div className="space-y-3">
          {(data || []).length === 0 && <div className="muted text-center py-8">No templates.</div>}
          {(data || []).map((t: any) => (
            <div key={t.id} className="card">
              <div className="card-h">
                <span>{t.name} <Pill color={t.kind === 'WhatsApp' ? 'green' : 'blue'}>{t.kind}</Pill> {t.stage && <Pill color="grey">{t.stage}</Pill>}</span>
                <Button size="sm" variant="danger" onClick={() => { if (confirm('Delete?')) del.mutate(t.id); }}>Delete</Button>
              </div>
              {t.subject && <div className="text-xs mb-1.5 muted"><strong>Subject:</strong> {t.subject}</div>}
              <pre className="text-xs whitespace-pre-wrap bg-bg-input p-3 rounded">{t.body}</pre>
              {t.variables?.length > 0 && (
                <div className="text-xs muted mt-2">Variables: {t.variables.join(', ')}</div>
              )}
            </div>
          ))}
        </div>
      </Page>
    </>
  );
}

function extractVars(s: string) {
  const set = new Set<string>();
  const re = /\{\{(\w+)\}\}/g;
  let m;
  while ((m = re.exec(s))) set.add(`{{${m[1]}}}`);
  return Array.from(set);
}
