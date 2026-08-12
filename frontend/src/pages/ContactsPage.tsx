import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { EmptyState } from '@/components/EmptyState';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { Users, Plus, Trash2, UserPlus, Pencil } from 'lucide-react';

type Contact = {
  id: string;
  name: string;
  email?: string | null;
  phoneCode?: string | null;
  phoneDigits?: string | null;
  company?: string | null;
  source?: string | null;
  notes?: string | null;
  convertedToClientId?: string | null;
  addedBy: { id: string; name: string };
  createdAt: string;
};

const SOURCE_OPTIONS = ['LinkedIn', 'Referral', 'Cold call', 'WhatsApp', 'Email', 'Walk-in', 'Conference', 'Other'];

function ContactForm({ initial, onSave, onCancel }: {
  initial?: Partial<Contact>;
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    email: initial?.email || '',
    phoneCode: initial?.phoneCode || '+91',
    phoneDigits: initial?.phoneDigits || '',
    company: initial?.company || '',
    source: initial?.source || '',
    notes: initial?.notes || '',
  });
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <div>
        <Label>Name *</Label>
        <Input value={form.name} onChange={f('name')} placeholder="Full name" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={f('email')} placeholder="email@example.com" />
        </div>
        <div>
          <Label>Phone</Label>
          <div className="flex gap-1">
            <Input value={form.phoneCode} onChange={f('phoneCode')} className="!w-16" placeholder="+91" />
            <Input value={form.phoneDigits} onChange={f('phoneDigits')} placeholder="9876543210" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Company</Label>
          <Input value={form.company} onChange={f('company')} placeholder="Where they work" />
        </div>
        <div>
          <Label>Source</Label>
          <select className="input" value={form.source} onChange={f('source')}>
            <option value="">— Select source —</option>
            {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={f('notes')} placeholder="Any context about this contact…" rows={3} />
      </div>
      <DialogFooter>
        <Button variant="default" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={!form.name.trim()} onClick={() => onSave(form)}>Save</Button>
      </DialogFooter>
    </div>
  );
}

export function ContactsPage() {
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  const { data, isLoading } = useQuery<Contact[]>({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts').then((r) => r.data),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');

  const create = useMutation({
    mutationFn: (d: any) => api.post('/contacts', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts'] }); setShowAdd(false); showToast('Contact added ✓'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const update = useMutation({
    mutationFn: (d: any) => api.patch(`/contacts/${editing!.id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts'] }); setEditing(null); showToast('Contact updated ✓'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/contacts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts'] }); showToast('Contact deleted'); },
    onError: () => showToast('Failed to delete', 'error'),
  });

  const convert = useMutation({
    mutationFn: (id: string) => api.post(`/contacts/${id}/convert`),
    onSuccess: (r, id) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      const clientId = r.data.client?.id;
      showToast('Converted to client ✓ — opening profile…');
      if (clientId) setTimeout(() => window.location.href = `/clients/${clientId}`, 800);
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to convert', 'error'),
  });

  const canEdit = ['founder', 'manager', 'sales_closer'].includes(user.role);

  const filtered = (data || []).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q)
      || c.email?.toLowerCase().includes(q)
      || c.company?.toLowerCase().includes(q)
      || c.phoneDigits?.includes(q);
  });

  const tdStyle = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--brand-borderSoft)', verticalAlign: 'middle' as const };

  return (
    <>
      <Topbar
        title="Contacts"
        subtitle={`${data?.length || 0} contacts`}
        actions={
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search name, email, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="!w-52"
            />
            {canEdit && (
              <Button variant="primary" onClick={() => setShowAdd(true)}>
                <Plus size={13} /> Add contact
              </Button>
            )}
          </div>
        }
      />
      <Page>
        {isLoading && <div className="muted text-sm p-6">Loading…</div>}
        {!isLoading && filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            tone="grey"
            title={search ? 'No contacts match' : 'No contacts yet'}
            description={search ? 'Try a different search.' : 'Add general contacts — people who reached out but aren\'t clients yet.'}
          />
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--brand-border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-card)' }}>
                  {['Name', 'Phone', 'Email', 'Company', 'Source', 'Notes', 'Added by', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--brand-textMuted)', borderBottom: '2px solid var(--brand-border)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} style={{ opacity: c.convertedToClientId ? 0.6 : 1 }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {c.name}
                      {c.convertedToClientId && (
                        <a href={`/clients/${c.convertedToClientId}`} style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent-gold)', textDecoration: 'none' }}>→ Client</a>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>
                      {c.phoneDigits ? `${c.phoneCode || ''} ${c.phoneDigits}` : '—'}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{c.email || '—'}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{c.company || '—'}</td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>
                      {c.source ? (
                        <span style={{ background: 'var(--bg-input)', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 600 }}>{c.source}</span>
                      ) : '—'}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12, maxWidth: 200, color: 'var(--brand-textMuted)' }}>
                      {c.notes ? <span title={c.notes}>{c.notes.length > 60 ? c.notes.slice(0, 60) + '…' : c.notes}</span> : '—'}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, color: 'var(--brand-textMuted)' }}>{c.addedBy.name}</td>
                    <td style={{ ...tdStyle }}>
                      {canEdit && !c.convertedToClientId && (
                        <div className="flex items-center gap-1">
                          <button
                            title="Edit"
                            onClick={() => setEditing(c)}
                            style={{ padding: '4px 6px', borderRadius: 5, border: '1px solid var(--brand-border)', background: 'transparent', cursor: 'pointer', color: 'var(--brand-textMuted)' }}
                          ><Pencil size={11} /></button>
                          <button
                            title="Convert to client"
                            onClick={() => { if (window.confirm(`Convert ${c.name} to a client?`)) convert.mutate(c.id); }}
                            style={{ padding: '4px 7px', borderRadius: 5, border: '1px solid #fbbf24', background: 'transparent', cursor: 'pointer', color: '#fbbf24', fontSize: 11, fontWeight: 600 }}
                          ><UserPlus size={11} /></button>
                          <button
                            title="Delete"
                            onClick={() => { if (window.confirm(`Delete ${c.name}?`)) remove.mutate(c.id); }}
                            style={{ padding: '4px 6px', borderRadius: 5, border: '1px solid #f87171', background: 'transparent', cursor: 'pointer', color: '#f87171' }}
                          ><Trash2 size={11} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Page>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={(v) => !v && setShowAdd(false)}>
        <DialogContent title="Add contact" description="Save a general contact who isn't a client yet.">
          <ContactForm onSave={(d) => create.mutate(d)} onCancel={() => setShowAdd(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent title={`Edit · ${editing?.name}`} description="Update contact details.">
          {editing && <ContactForm initial={editing} onSave={(d) => update.mutate(d)} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
