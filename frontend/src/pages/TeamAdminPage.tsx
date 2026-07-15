import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useState, useEffect } from 'react';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';
import { Avatar } from '@/components/ui/avatar';
import { ROLE_LABELS } from '@/lib/utils';
import { Mail, ShieldCheck, RefreshCw, BellRing, FileText, Activity, Send } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export function TeamAdminPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then((r) => r.data) });
  const [open, setOpen] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState<{ id: string; name: string; active: boolean } | null>(null);
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'staff', reportsToId: '' });
  useEffect(() => { if (!open) setF({ name: '', email: '', password: '', role: 'staff', reportsToId: '' }); }, [open]);
  const create = useMutation({
    mutationFn: () => api.post('/users', f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setOpen(false); showToast('Added'); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const setActive = useMutation({
    mutationFn: ({ id, active }: any) => api.patch(`/users/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: () => showToast('Failed to update user', 'error'),
  });

  const [smtpHealth, setSmtpHealth] = useState<any[] | null>(null);
  const [rbacHealth, setRbacHealth] = useState<{ summary: any[]; recentCount: number } | null>(null);
  const sendBriefing = useMutation({
    mutationFn: ({ team, shift }: { team: string; shift: string }) =>
      api.post('/briefing/trigger', { team, shift }),
    onSuccess: (_r, { team }) => showToast(`${team === 'team1' ? 'Team 1 (Aman/Kanchan)' : 'Team 2 (Anjali/Taran)'} briefing sent`),
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed to send briefing', 'error'),
  });
  const checkRbac = useMutation({
    mutationFn: () => api.get('/internal/rbac-health'),
    onSuccess: (r) => setRbacHealth(r.data),
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const retriggerFreelance = useMutation({
    mutationFn: () => api.post('/internal/retrigger-freelance-notifications', {}),
    onSuccess: (r) => showToast(`Sent ${r.data.requirements} open requirement${r.data.requirements !== 1 ? 's' : ''} to ${r.data.sent} recruiter${r.data.sent !== 1 ? 's' : ''}`),
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const [stubResult, setStubResult] = useState<{ created: number; reactivated: number; createdClients: string[]; reactivatedClients: string[] } | null>(null);
  const [debugStubs, setDebugStubs] = useState<{ total: number; nullClientStubs: any[]; wrongLifecycleStubs: any[]; okCount: number } | null>(null);
  const [clientLookupQ, setClientLookupQ] = useState('');
  const [clientLookupResult, setClientLookupResult] = useState<any[] | null>(null);
  const backfillStubs = useMutation({
    mutationFn: () => api.post('/internal/backfill-training-stubs', {}),
    onSuccess: (r) => { setStubResult(r.data); showToast(`Fixed ${r.data.created + r.data.reactivated} training stubs`); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const backfillFeedbackDates = useMutation({
    mutationFn: () => api.post('/internal/backfill-feedback-dates', {}),
    onSuccess: (r) => showToast(`Stamped lastFeedbackTakenAt on ${r.data.updated} clients`),
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const debugTrainingStubs = useMutation({
    mutationFn: () => api.get('/internal/debug-training-stubs'),
    onSuccess: (r) => { setDebugStubs(r.data); },
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
            <DialogFooter><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!f.name || !f.email || !f.password || create.isPending} onClick={() => create.mutate()}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Page>
        {isLoading && <div className="muted text-sm py-8 text-center">Loading users…</div>}
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
                      <Button
                        size="sm"
                        variant={u.active ? 'default' : 'success'}
                        onClick={() => u.active ? setDeactivateConfirm({ id: u.id, name: u.name, active: false }) : setActive.mutate({ id: u.id, active: true })}
                      >
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
                  <div style={{ marginTop: 8, fontSize: 13, color: (stubResult.created + stubResult.reactivated) > 0 ? '#16a34a' : 'var(--brand-textMuted)' }}>
                    {(stubResult.created + stubResult.reactivated) === 0
                      ? 'All active clients already have stubs.'
                      : [
                          stubResult.created > 0 ? `Created: ${stubResult.createdClients.join(', ')}` : '',
                          stubResult.reactivated > 0 ? `Reactivated: ${stubResult.reactivatedClients.join(', ')}` : '',
                        ].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="default" onClick={() => backfillStubs.mutate()} disabled={backfillStubs.isPending}>
                  <RefreshCw size={14} style={{ marginRight: 6 }} />{backfillStubs.isPending ? 'Running…' : 'Fix stubs'}
                </Button>
                <Button variant="default" onClick={() => debugTrainingStubs.mutate()} disabled={debugTrainingStubs.isPending}>
                  {debugTrainingStubs.isPending ? 'Checking…' : 'Diagnose'}
                </Button>
                <Button variant="default" onClick={() => backfillFeedbackDates.mutate()} disabled={backfillFeedbackDates.isPending}
                  title="Stamp lastFeedbackTakenAt on all clients that already have feedback activities logged">
                  {backfillFeedbackDates.isPending ? 'Backfilling…' : 'Fix feedback dates'}
                </Button>
              </div>
            </div>
            {debugStubs && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--brand-textMuted)', background: 'var(--bg-input)', borderRadius: 8, padding: '10px 14px' }}>
                <div><b>Total active stubs:</b> {debugStubs.total} (ok: {debugStubs.okCount})</div>
                {debugStubs.nullClientStubs.length > 0 && (
                  <div style={{ color: 'var(--status-red)', marginTop: 4 }}>
                    <b>Orphaned stubs (no client):</b> {debugStubs.nullClientStubs.map((t: any) => t.name).join(', ')}
                  </div>
                )}
                {debugStubs.wrongLifecycleStubs.length > 0 && (
                  <div style={{ color: 'var(--status-amber)', marginTop: 4 }}>
                    <b>Wrong lifecycle:</b> {debugStubs.wrongLifecycleStubs.map((t: any) => `${t.name} (${t.lifecycle})`).join(', ')}
                  </div>
                )}
                {debugStubs.nullClientStubs.length === 0 && debugStubs.wrongLifecycleStubs.length === 0 && (
                  <div style={{ color: '#16a34a', marginTop: 4 }}>All stubs look healthy.</div>
                )}
              </div>
            )}

            {/* Client lookup — check lifecycle + stub status by name */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand-textMuted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Client lookup (check lifecycle &amp; stub)
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  placeholder="e.g. Khushwant"
                  value={clientLookupQ}
                  onChange={(e) => setClientLookupQ(e.target.value)}
                  style={{ fontSize: 13, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--brand-border)', background: 'var(--bg-input)', color: 'var(--brand-text)', width: 220 }}
                />
                <Button variant="default" onClick={async () => {
                  if (!clientLookupQ.trim()) return;
                  try {
                    const r = await api.get('/internal/client-lookup', { params: { q: clientLookupQ.trim() } });
                    setClientLookupResult(r.data);
                  } catch (e: any) {
                    setClientLookupResult([{ _error: e.response?.data?.error || e.message || 'Network error' }]);
                  }
                }}>Lookup</Button>
              </div>
              {clientLookupResult && (
                <div style={{ marginTop: 8, fontSize: 12, background: 'var(--bg-input)', borderRadius: 8, padding: '10px 14px' }}>
                  {clientLookupResult[0]?._error
                    ? <span style={{ color: 'var(--status-red)' }}>Error: {clientLookupResult[0]._error}</span>
                    : clientLookupResult.length === 0
                    ? <span style={{ color: 'var(--status-red)' }}>No client found — try a shorter name (e.g. just first name or 3 letters).</span>
                    : clientLookupResult.map((c: any) => (
                      <div key={c.id} style={{ marginBottom: 4, display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: 'var(--brand-text)', minWidth: 140 }}>{c.name}</span>
                        <span style={{ color: ['Active','LeverageGranted','SaleWon','Hold'].includes(c.lifecycle) ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          {c.lifecycle}
                        </span>
                        <span style={{ color: c.activeStubs > 0 ? '#16a34a' : '#dc2626' }}>
                          {c.activeStubs > 0 ? `✓ ${c.activeStubs} stub(s)` : '✗ No active stub'}
                        </span>
                        {!['Active','LeverageGranted','SaleWon','Hold'].includes(c.lifecycle) && (
                          <span style={{ color: '#d97706', fontSize: 11 }}>→ Move to Active/SaleWon to appear on Team Board</span>
                        )}
                        {['Active','LeverageGranted','SaleWon','Hold'].includes(c.lifecycle) && c.activeStubs === 0 && (
                          <span style={{ color: '#d97706', fontSize: 11 }}>→ Click "Fix stubs" above to create stub</span>
                        )}
                      </div>
                    ))
                  }
                </div>
              )}
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

            {/* RBAC health check */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderTop: '1px solid var(--brand-border)', paddingTop: 20 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Permission error log (last 24h)</div>
                <div style={{ fontSize: 13, color: 'var(--brand-textMuted)', maxWidth: 460 }}>
                  Shows which roles are hitting 403 Forbidden errors — surfaces missing permissions before users report them.
                </div>
              </div>
              <Button variant="default" onClick={() => checkRbac.mutate()} disabled={checkRbac.isPending} loading={checkRbac.isPending}>
                <Activity size={14} style={{ marginRight: 6 }} />Check permission log
              </Button>
            </div>
            {rbacHealth && (
              <div style={{ marginTop: 4, fontSize: 12, background: 'var(--bg-input)', borderRadius: 8, padding: '12px 16px' }}>
                {rbacHealth.summary.length === 0 ? (
                  <div style={{ color: 'var(--status-green)', fontWeight: 600 }}>✓ No permission errors in the last 24 hours.</div>
                ) : (
                  <>
                    <div style={{ marginBottom: 8, color: 'var(--status-amber)', fontWeight: 600 }}>
                      {rbacHealth.summary.length} unique role/route combinations hit 403 in the last 24h ({rbacHealth.recentCount} in last hour):
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Count', 'Role', 'Method', 'Path', 'Last seen'].map((h) => (
                            <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--brand-textMuted)', fontWeight: 500, borderBottom: '1px solid var(--brand-border)', fontSize: 11 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rbacHealth.summary.map((row: any, i: number) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
                            <td style={{ padding: '5px 8px', fontWeight: 700, color: row.count > 5 ? 'var(--status-red)' : 'var(--status-amber)' }}>{row.count}</td>
                            <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 11 }}>{row.role}</td>
                            <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 11, color: 'var(--brand-textMuted)' }}>{row.method}</td>
                            <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 11 }}>{row.path}</td>
                            <td style={{ padding: '5px 8px', color: 'var(--brand-textMuted)', fontSize: 11 }}>{new Date(row.lastSeen).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </Page>
      <ConfirmDialog
        open={!!deactivateConfirm}
        onClose={() => setDeactivateConfirm(null)}
        onConfirm={() => { setActive.mutate({ id: deactivateConfirm!.id, active: false }); setDeactivateConfirm(null); }}
        title={`Deactivate ${deactivateConfirm?.name}?`}
        description="This will immediately block the user from logging in. You can reactivate them at any time from this page."
        confirmLabel="Deactivate"
        loading={setActive.isPending}
      />
    </>
  );
}
