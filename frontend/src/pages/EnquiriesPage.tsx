import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { Inbox, UserPlus, Trash2 } from 'lucide-react';

type Enquiry = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  course?: string | null;
  source: string;
  status: string;
  convertedToContactId?: string | null;
  createdAt: string;
};

const STATUS_OPTIONS = ['new', 'contacted', 'converted', 'dismissed'];

const STATUS_COLORS: Record<string, string> = {
  new: '#fbbf24',
  contacted: '#60a5fa',
  converted: '#4ade80',
  dismissed: '#9ca3af',
};

export function EnquiriesPage() {
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  const { data, isLoading } = useQuery<Enquiry[]>({
    queryKey: ['enquiries'],
    queryFn: () => api.get('/enquiries').then((r) => r.data),
  });

  const [search, setSearch] = useState('');

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/enquiries/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['enquiries'] }),
    onError: () => showToast('Failed to update status', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/enquiries/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['enquiries'] }); showToast('Enquiry deleted'); },
    onError: () => showToast('Failed to delete', 'error'),
  });

  const convert = useMutation({
    mutationFn: (id: string) => api.post(`/enquiries/${id}/convert`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['enquiries'] }); showToast('Converted to contact ✓'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to convert', 'error'),
  });

  const canEdit = ['founder', 'manager', 'demo_lead', 'sales_closer'].includes(user.role);

  const filtered = (data || []).filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.name.toLowerCase().includes(q)
      || e.email?.toLowerCase().includes(q)
      || e.phone?.includes(q)
      || e.course?.toLowerCase().includes(q);
  });

  const tdStyle = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--brand-borderSoft)', verticalAlign: 'middle' as const };

  return (
    <>
      <Topbar
        title="Enquiries"
        subtitle={`${data?.length || 0} enquiries from mitsedge.com`}
        actions={
          <input
            placeholder="Search name, email, phone, course…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
            style={{ width: 220 }}
          />
        }
      />
      <Page>
        {isLoading && <div className="muted text-sm p-6">Loading…</div>}
        {!isLoading && filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            tone="grey"
            title={search ? 'No enquiries match' : 'No enquiries yet'}
            description={search ? 'Try a different search.' : 'Submissions from the mitsedge.com enquiry form will show up here.'}
          />
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--brand-border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-card)' }}>
                  {['Name', 'Phone', 'Email', 'Course', 'Message', 'Status', 'Received', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--brand-textMuted)', borderBottom: '2px solid var(--brand-border)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} style={{ opacity: e.status === 'dismissed' ? 0.6 : 1 }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {e.name}
                      {e.convertedToContactId && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent-gold)' }}>→ Contact</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{e.phone || '—'}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{e.email || '—'}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{e.course || '—'}</td>
                    <td style={{ ...tdStyle, fontSize: 12, maxWidth: 220, color: 'var(--brand-textMuted)' }}>
                      {e.message ? <span title={e.message}>{e.message.length > 60 ? e.message.slice(0, 60) + '…' : e.message}</span> : '—'}
                    </td>
                    <td style={tdStyle}>
                      {canEdit ? (
                        <select
                          className="input"
                          value={e.status}
                          onChange={(ev) => setStatus.mutate({ id: e.id, status: ev.target.value })}
                          style={{ fontSize: 11, padding: '3px 6px', color: STATUS_COLORS[e.status], fontWeight: 600, borderColor: STATUS_COLORS[e.status] }}
                        >
                          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span style={{ background: 'var(--bg-input)', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 600, color: STATUS_COLORS[e.status] }}>{e.status}</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, color: 'var(--brand-textMuted)', whiteSpace: 'nowrap' }}>
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td style={tdStyle}>
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          {!e.convertedToContactId && (
                            <button
                              title="Convert to contact"
                              onClick={() => convert.mutate(e.id)}
                              style={{ padding: '4px 7px', borderRadius: 5, border: '1px solid #fbbf24', background: 'transparent', cursor: 'pointer', color: '#fbbf24', fontSize: 11, fontWeight: 600 }}
                            ><UserPlus size={11} /></button>
                          )}
                          <button
                            title="Delete"
                            onClick={() => { if (window.confirm(`Delete enquiry from ${e.name}?`)) remove.mutate(e.id); }}
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
    </>
  );
}
