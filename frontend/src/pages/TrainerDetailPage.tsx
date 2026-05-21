import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { formatPhone } from '@/lib/utils';
import { useState } from 'react';
import { useUI } from '@/store/ui';
import { SendMessageModal, MessagesHistoryCard } from '@/components/SendMessageModal';
import { DemoHistoryCard } from '@/components/DemoHistoryCard';
import { Mail, MessageCircle } from 'lucide-react';

export function TrainerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data: t } = useQuery({
    queryKey: ['trainer', id],
    queryFn: () => api.get(`/trainers/${id}`).then((r) => r.data),
  });
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<any>({});
  const [sendOpen, setSendOpen] = useState<'Email' | 'WhatsApp' | null>(null);

  // Hooks must be called unconditionally — declare mutation BEFORE the early return
  // (was a Rules of Hooks violation that broke the page when data finished loading).
  const save = useMutation({
    mutationFn: () => api.patch(`/trainers/${id}`, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trainer', id] });
      setEdit(false);
      showToast('Saved');
    },
  });

  if (!t) return <Page><div className="muted">Loading…</div></Page>;

  return (
    <>
      <Topbar
        title={t.name}
        subtitle={`${t.skills || '—'}`}
        actions={
          edit ? (
            <>
              <Button onClick={() => setEdit(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => save.mutate()}>Save</Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={() => setSendOpen('Email')} disabled={!t.email}><Mail size={14}/> Email</Button>
              <Button size="sm" onClick={() => setSendOpen('WhatsApp')} disabled={!t.phoneDigits}
                style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}>
                <MessageCircle size={14}/> WhatsApp
              </Button>
              <Button onClick={() => { setForm({ ...t }); setEdit(true); }}>Edit</Button>
            </>
          )
        }
      />
      <Page>
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <div className="card">
            <div className="card-h">Profile</div>
            {edit ? (
              <div className="space-y-2">
                <div className="form-row"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="form-row"><Label>Email</Label><Input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="form-row"><Label>Skills</Label><Input value={form.skills || ''} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></div>
                <div className="form-row"><Label>Default rate ₹</Label><Input type="number" value={form.defaultRateInr || 0} onChange={(e) => setForm({ ...form, defaultRateInr: +e.target.value })} /></div>
              </div>
            ) : (
              <div className="text-sm space-y-1">
                <div><span className="muted">Email:</span> {t.email || '—'}</div>
                <div><span className="muted">Phone:</span> <span className="mono">{formatPhone(t.phoneCode, t.phoneDigits) || '—'}</span></div>
                <div><span className="muted">Rate:</span> <span className="mono">₹{t.defaultRateInr}</span> {t.rateModel}</div>
                <div><span className="muted">Experience:</span> {t.experienceYears}y</div>
                <div><span className="muted">Payment:</span> {t.paymentMethod} {t.upiId || t.bankAccount || ''}</div>
                <div><span className="muted">Recruiter:</span> {t.recruitedBy?.name || '—'}</div>
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-h">Active clients</div>
            {t.clients?.length ? (
              <ul className="space-y-1 text-sm">
                {t.clients.map((c: any) => (
                  <li key={c.id}><Link to={`/clients/${c.id}`} className="hover:underline">{c.name}</Link></li>
                ))}
              </ul>
            ) : (
              <div className="muted">No active engagements.</div>
            )}
          </div>
        </div>

        <div className="card mb-4">
          <div className="card-h">Recent session logs</div>
          <table className="w-full text-sm">
            <thead><tr className="text-brand-textMuted"><th className="text-left py-1">Date</th><th className="text-left py-1">Client</th><th className="text-right py-1">Hours</th><th className="text-right py-1">Amount</th><th className="text-right py-1">Status</th></tr></thead>
            <tbody>
              {(t.sessionLogs || []).slice(0, 20).map((l: any) => (
                <tr key={l.id}>
                  <td className="mono py-1">{l.date}</td>
                  <td>{l.client?.name || '—'}</td>
                  <td className="mono text-right">{l.hours}</td>
                  <td className="mono text-right">₹{l.amountInr}</td>
                  <td className="text-right"><Pill color={l.status === 'Paid' ? 'green' : 'grey'}>{l.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 space-y-3">
          <DemoHistoryCard trainerId={t.id} />
          <MessagesHistoryCard trainerId={t.id} />
        </div>

        {sendOpen && (
          <SendMessageModal
            recipient={{
              name: t.name,
              email: t.email || '',
              phone: t.phoneDigits ? `${t.phoneCode || ''}${t.phoneDigits}` : '',
            }}
            trainerId={t.id}
            stage="Trainer onboarding"
            defaultKind={sendOpen}
            onClose={() => setSendOpen(null)}
          />
        )}
      </Page>
    </>
  );
}
