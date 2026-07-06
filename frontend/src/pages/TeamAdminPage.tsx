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
import { Mail, ShieldCheck, RefreshCw, BellRing, FileText } from 'lucide-react';

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

  const [smtpHealth, setSmtpHealth] = useState<any[] | null>(null);
  const retriggerFreelance = useMutation({
    mutationFn: () => api.post('/internal/retrigger-freelance-notifications', {}),
    onSuccess: (r) => showToast(`Sent ${r.data.requirements} open requirement${r.data.requirements !== 1 ? 's' : ''} to ${r.data.sent} recruiter${r.data.sent !== 1 ? 's' : ''}`),
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const [stubResult, setStubResult] = useState<{ created: number; clients: string[] } | null>(null);
  const backfillStubs = useMutation({
    mutationFn: () => api.post('/internal/backfill-training-stubs', {}),
    onSuccess: (r) => { setStubResult(r.data); showToast(`Created ${r.data.created} missing training stubs`); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const sendAdvisory = useMutation({
    mutationFn: () => api.post('/internal/send-smtp-advisory', {}),
    onSuccess: (r) => showToast(`Advisory sent to: ${r.data.sent.join(', ')}`),
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const checkSmtp = useMutation({
    mutationFn: () => api.get('/internal/smtp-health'),
    onSuccess: (r) => setSmtpHealth(r.data.results),
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const sendPaymentReport = useMutation({
    mutationFn: () => api.post('/internal/send-payment-report', { force: true }),
    onSuccess: () => showToast('Payment follow-up report sent'),
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
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
                <tr key={u.id} className="clickable" style={u.active ? undefined : { opacity: 0.55 }}>
                  <td className="flex items-center gap-2 py-2"><Avatar name={u.name} size={24} /><span className="font-medium">{u.name}</span></td>
                  <td className="muted text-xs">{u.email}</td>
                  <td><Pill color="grey">{ROLE_LABELS[u.role] || u.role}</Pill></td>
                  <td className="muted">{(data || []).find((x: any) => x.id === u.reportsToId)?.name || '—'}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Pill color={u.active ? 'green' : 'red'}>{u.active ? 'Active' : 'Inactive'}</Pill>
                      <Button size="sm" variant={u.active ? 'default' : 'success'} onClick={() => setActive.mutate({ id: u.id, active: !u.active })}>
                        {u.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Admin actions */}
        <div className="table-card" style={{ marginTop: 24 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--brand-border)', fontWeight: 600, fontSize: 14 }}>Admin actions</div>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* SMTP advisory */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Send App Password advisory</div>
                <div style={{ fontSize: 13, color: 'var(--brand-textMuted)', maxWidth: 460 }}>
                  Emails all SMTP-configured team members reminding them to re-enter their App Password after any Google password change.
                </div>
              </div>
              <Button variant="default" onClick={() => sendAdvisory.mutate()} disabled={sendAdvisory.isPending}>
                <Mail size={14} style={{ marginRight: 6 }} />{sendAdvisory.isPending ? 'Sending…' : 'Send advisory'}
              </Button>
            </div>

            {/* SMTP health check */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Check SMTP health</div>
                <div style={{ fontSize: 13, color: 'var(--brand-textMuted)', maxWidth: 460 }}>
                  Live-tests every configured team member's Gmail App Password and shows who is broken.
                </div>
              </div>
              <Button variant="default" onClick={() => checkSmtp.mutate()} disabled={checkSmtp.isPending}>
                <ShieldCheck size={14} style={{ marginRight: 6 }} />{checkSmtp.isPending ? 'Checking…' : 'Check health'}
              </Button>
            </div>

            {/* Payment follow-up report */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Send payment follow-up report</div>
                <div style={{ fontSize: 13, color: 'var(--brand-textMuted)', maxWidth: 460 }}>
                  Sends the latest payment follow-up report to Vaibhav, Samita, Mitali and Areena right now (bypasses the daily lock).
                </div>
              </div>
              <Button variant="default" onClick={() => sendPaymentReport.mutate()} disabled={sendPaymentReport.isPending}>
                <FileText size={14} style={{ marginRight: 6 }} />{sendPaymentReport.isPending ? 'Sending…' : 'Send report now'}
              </Button>
            </div>

            {/* Retrigger freelance requirement notifications */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Re-notify recruiters of open requirements</div>
                <div style={{ fontSize: 13, color: 'var(--brand-textMuted)', maxWidth: 460 }}>
                  Sends all open (no trainer assigned) freelance requirements to Amandeep, Kanchan and any active recruiter.
                </div>
              </div>
              <Button variant="default" onClick={() => retriggerFreelance.mutate()} disabled={retriggerFreelance.isPending}>
                <BellRing size={14} style={{ marginRight: 6 }} />{retriggerFreelance.isPending ? 'Sending…' : 'Re-notify recruiters'}
              </Button>
            </div>

            {/* Backfill training stubs */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Fix missing training stubs</div>
                <div style={{ fontSize: 13, color: 'var(--brand-textMuted)', maxWidth: 460 }}>
                  Creates missing session stubs for all Active clients with no training record — fixes them appearing in Unassigned on the Team Board.
                </div>
                {stubResult && (
                  <div style={{ marginTop: 8, fontSize: 13, color: stubResult.created > 0 ? '#16a34a' : 'var(--brand-textMuted)' }}>
                    {stubResult.created === 0 ? 'All active clients already have stubs.' : `Created stubs for: ${stubResult.clients.join(', ')}`}
                  </div>
                )}
              </div>
              <Button variant="default" onClick={() => backfillStubs.mutate()} disabled={backfillStubs.isPending}>
                <RefreshCw size={14} style={{ marginRight: 6 }} />{backfillStubs.isPending ? 'Running…' : 'Fix stubs'}
              </Button>
            </div>

            {smtpHealth && (
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 4 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--brand-textMuted)', fontWeight: 500 }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--brand-textMuted)', fontWeight: 500 }}>Email</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--brand-textMuted)', fontWeight: 500 }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--brand-textMuted)', fontWeight: 500 }}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {smtpHealth.map((r: any) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                      <td style={{ padding: '8px 8px', fontWeight: 500 }}>{r.name}</td>
                      <td style={{ padding: '8px 8px', color: 'var(--brand-textMuted)' }}>{r.email}</td>
                      <td style={{ padding: '8px 8px' }}>
                        <Pill color={r.ok ? 'green' : 'red'}>{r.ok ? 'OK' : 'Broken'}</Pill>
                      </td>
                      <td style={{ padding: '8px 8px', color: '#ef4444', fontSize: 12 }}>{r.error || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Page>
    </>
  );
}
