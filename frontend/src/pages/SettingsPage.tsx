import { useEffect, useState } from 'react';

function useConfirm() {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const ask = (fn: () => void) => setPending(() => fn);
  const yes = () => { pending?.(); setPending(null); }
  const no = () => setPending(null);
  return { asking: pending !== null, ask, yes, no };
}
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { useAuth } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import { api } from '@/lib/api';
import { useUI } from '@/store/ui';
import { Mail, CheckCircle2, AlertTriangle, Trash2, Send } from 'lucide-react';

// Mirrors the source.html renderSettings sections + labels + descriptions exactly.
const FLAG_SECTIONS: Array<{ title: string; flags: Array<{ key: string; label: string; desc: string }> }> = [
  {
    title: 'Phase rollout',
    flags: [
      { key: 'phase_two_enabled', label: 'Phase 2 enabled', desc: 'Activate Mitali, client success team, accounts, and Malika. Once on, all roles can sign in.' },
    ],
  },
  {
    title: 'Modules',
    flags: [
      { key: 'whatsapp_integration', label: 'WhatsApp integration', desc: 'Show "Open in WhatsApp" buttons throughout (uses wa.me deep links). Off = copy-to-clipboard only.' },
      { key: 'daily_reporting', label: 'Daily reporting', desc: 'Every signed-in user can submit a daily end-of-day report. Founder/Samita see all reports.' },
      { key: 'verification_gate', label: 'Verification gate', desc: 'When ON, Anjali/Taran must Pass/Fail every recruiter proposal before demo can be scheduled. When OFF, proposed trainer is auto-accepted.' },
      { key: 'owner_assignment_by_lead', label: 'Owner assignment by lead', desc: 'When ON, only Samita (and Vaibhav) can assign or reassign intake owner. When OFF, Anjali/Taran can reassign too.' },
      { key: 'audit_log_visible', label: 'Audit log', desc: 'Show the audit log page (admin-only). Off hides the page but actions are still recorded internally.' },
    ],
  },
  {
    title: 'Capability gates',
    flags: [
      { key: 'payment_access_restricted', label: 'Payment access restricted', desc: 'When ON, only Vaibhav, Samita, Mitali, and Roshni can record client payments. When OFF, anyone with client access can.' },
    ],
  },
  {
    title: 'Sourcing & matching',
    flags: [
      { key: 'multi_trainer_proposals', label: 'Multi-trainer proposals', desc: 'Recruiters can propose 3–4 trainers per sourcing request instead of just one. Team 2 picks the best after verification.' },
      { key: 'smart_match_scoring', label: 'Smart match scoring', desc: 'Weighted match: 60% skill match · 25% past success · 10% recency · 5% verified by us. Off = pure skill match only.' },
    ],
  },
  {
    title: 'Bulk data & templates',
    flags: [
      { key: 'bulk_upload_structured', label: 'Bulk upload (structured)', desc: 'CSV-style paste for clients and trainers with strict headers. Skip duplicates by name.' },
      { key: 'bulk_upload_raw', label: 'Bulk upload (raw inbox)', desc: 'Free-form paste for messy lists. Queues into Raw leads inbox for manual processing into real leads.' },
      { key: 'email_templates', label: 'Email templates library', desc: 'Configurable email + WhatsApp templates per stage. Variable interpolation.' },
    ],
  },
  {
    title: 'Phone & contact',
    flags: [
      { key: 'phone_validation', label: 'Strict phone validation', desc: 'When ON, phone numbers are rejected if the digit count is wrong for the country (10 for US/India, 9 for AU/UAE, 8 for Singapore). Off = save anything.' },
      { key: 'whatsapp_group_preferred', label: 'Prefer WhatsApp group', desc: 'When ON, group invite link is the primary contact method, direct phone is backup. Off = direct phone first.' },
      { key: 'configurable_lead_sources', label: 'Configurable lead sources', desc: 'When ON, Vaibhav and Samita can add/edit/delete lead sources via the Lead sources page. Off = hardcoded list.' },
    ],
  },
  {
    title: 'Edit permissions & requests',
    flags: [
      { key: 'strict_edit_permissions', label: 'Strict edit permissions', desc: 'Master switch. When ON, the permission matrix controls who can edit what (see Edit permissions page). When OFF, any signed-in user can edit any field. Edits are always audit-logged either way.' },
      { key: 'edit_request_flow', label: 'Edit request flow', desc: 'When ON, users without edit permission see "Request edit" buttons that submit to an approval queue. Vaibhav/Samita/Mitali approve from the Edit requests page.' },
      { key: 'edit_request_auto_approve', label: 'Auto-approve edit requests', desc: 'When ON, edit requests apply immediately without waiting for approval (for high-trust teams). Still logged. Off = manual approval required.' },
    ],
  },
  {
    title: 'Future · deferred',
    flags: [
      { key: 'sso_mitssolution', label: 'SSO via mitssolution.com', desc: 'Google OAuth restricted to @mitssolution.com domain. Requires backend OAuth integration.' },
    ],
  },
];

interface SmtpStatus {
  gmailAddress: string | null;
  hasPassword: boolean;
  configuredAt: string | null;
}

function MyEmailSection() {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const clearConfirm = useConfirm();
  const { data: smtp } = useQuery<SmtpStatus>({
    queryKey: ['my-smtp'],
    queryFn: () => api.get('/users/me/smtp').then((r) => r.data),
  });

  const [gmailAddress, setGmailAddress] = useState('');
  const [appPassword, setAppPassword] = useState('');

  useEffect(() => {
    if (smtp?.gmailAddress) setGmailAddress(smtp.gmailAddress);
  }, [smtp?.gmailAddress]);

  const save = useMutation({
    mutationFn: () => api.post('/users/me/smtp', { gmailAddress: gmailAddress.trim(), appPassword: appPassword.replace(/\s+/g, '') }),
    onSuccess: () => {
      setAppPassword('');
      qc.invalidateQueries({ queryKey: ['my-smtp'] });
      showToast('Saved — your emails will now send from your address');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const clear = useMutation({
    mutationFn: () => api.delete('/users/me/smtp'),
    onSuccess: () => {
      setAppPassword('');
      qc.invalidateQueries({ queryKey: ['my-smtp'] });
      showToast('Cleared — emails will fall back to system sender');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const test = useMutation({
    mutationFn: () => api.post('/users/me/smtp/test'),
    onSuccess: (r) => showToast(`Test sent to ${r.data?.to || 'you'}`, 'success'),
    onError: (e: any) => showToast(e.response?.data?.error || 'Test failed', 'error'),
  });

  // Diagnostic for "I'm not receiving system notifications" reports (Aman / Kanchan).
  // Sends a SYSTEM-path test (no fromUser) to the user's own inbox so they can
  // self-verify whether the system SMTP pipeline is delivering. Doesn't depend
  // on having their own App Password configured.
  const testSystem = useMutation({
    mutationFn: () => api.post('/users/me/smtp/test-system'),
    onSuccess: (r) => showToast(`System notification test sent to ${r.data?.deliveredTo}`, 'success'),
    onError: (e: any) => showToast(e.response?.data?.error || 'System test failed', 'error'),
  });

  return (
    <div className="card">
      <div className="card-h">
        <span><Mail size={14} className="inline mr-1"/> My email (sender + calendar invites)</span>
        {smtp?.hasPassword ? (
          <span className="text-xs text-brand-green flex items-center gap-1">
            <CheckCircle2 size={12}/> configured
          </span>
        ) : (
          <span className="text-xs text-brand-amber flex items-center gap-1">
            <AlertTriangle size={12}/> not configured
          </span>
        )}
      </div>

      <div className="text-xs muted mb-3">
        Configure your <strong>@mitssolution.com</strong> Gmail App Password so demo invites
        and outbound emails are sent from your address. Generate one at{' '}
        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer"
           className="text-brand-blue hover:underline">myaccount.google.com/apppasswords</a> (label: "MITS Consulting Portal").
      </div>

      <div className="space-y-2">
        <div className="form-row">
          <Label>Gmail address</Label>
          <Input
            type="email"
            placeholder="firstname.lastname@mitssolution.com"
            value={gmailAddress}
            onChange={(e) => setGmailAddress(e.target.value)}
          />
        </div>
        <div className="form-row">
          <Label>App password (16 chars — spaces ok)</Label>
          <Input
            type="password"
            placeholder={smtp?.hasPassword ? '•••• •••• •••• ••••  (already saved — type to replace)' : 'wbta fhui ufoh ijlv'}
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="primary" size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending || !gmailAddress || !appPassword}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
          {smtp?.hasPassword && (
            <>
              <Button size="sm" onClick={() => test.mutate()} disabled={test.isPending}>
                <Send size={12}/> {test.isPending ? 'Sending…' : 'Send test'}
              </Button>
              {clearConfirm.asking ? (
                <span className="flex items-center gap-1 text-[11px]">
                  Clear SMTP?{' '}
                  <Button size="sm" variant="danger" onClick={clearConfirm.yes}>Yes</Button>
                  <Button size="sm" onClick={clearConfirm.no}>No</Button>
                </span>
              ) : (
                <Button size="sm" onClick={() => clearConfirm.ask(() => clear.mutate())} disabled={clear.isPending}>
                  <Trash2 size={12}/> Clear
                </Button>
              )}
            </>
          )}
        </div>
        {smtp?.configuredAt && (
          <div className="text-[11px] muted">Last saved: {new Date(smtp.configuredAt).toLocaleString()}</div>
        )}
        <div
          className="mt-4 rounded-lg p-3"
          style={{
            background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent-gold) 6%, var(--bg-input)) 0%, var(--bg-input) 60%)',
            border: '1px solid color-mix(in srgb, var(--accent-gold) 25%, var(--brand-borderSoft))',
            borderLeft: '3px solid var(--accent-gold)',
          }}
        >
          <div className="text-[12px] mb-2 leading-relaxed">
            <strong style={{ color: 'var(--brand-text)' }}>Not receiving system notifications?</strong>
            <span className="muted"> (sourcing assigned, handover task, payment confirmation, etc.) — fire a test to your own inbox to check whether the system SMTP pipeline is reaching you. No App Password needed.</span>
          </div>
          <Button size="sm" onClick={() => testSystem.mutate()} disabled={testSystem.isPending}>
            <Send size={12}/> {testSystem.isPending ? 'Sending…' : 'Send me a system notification test'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  const isFounder = user?.role === 'founder';
  const canFixKanban = ['founder', 'manager', 'lead'].includes(user?.role ?? '');

  const { data: flags } = useQuery({
    queryKey: ['flags'],
    queryFn: () => api.get('/flags').then((r) => r.data as Record<string, boolean>),
    enabled: isFounder,
  });

  const setFlag = useMutation({
    mutationFn: ({ key, value }: { key: string; value: boolean }) => api.put(`/flags/${key}`, { value }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['flags'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast(`${vars.key}: ${vars.value ? 'ON' : 'OFF'}`);
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const reset = useMutation({
    mutationFn: () => api.post('/flags/reset'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['flags'] }); showToast('Flags reset to defaults'); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const resetConfirm = useConfirm();

  return (
    <>
      <Topbar title={isFounder ? 'Settings · Feature flags + My email' : 'Settings · My email'} />
      <Page>
        <div className="mb-4">
          <MyEmailSection />
        </div>

        <div className="card mb-4">
          <div className="card-h">Account</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <InfoCell label="Name" value={user?.name} />
            <InfoCell label="Login email" value={user?.email} />
            <InfoCell label="Role" value={<span className="capitalize">{user?.role.replace(/_/g, ' ')}</span>} />
          </div>
        </div>

        {canFixKanban && !isFounder && (
          <div className="card mb-4">
            <div className="card-h">Team tools</div>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>Fix unassigned clients on Kanban</div>
                <div className="text-[11px] muted mt-0.5">Assigns each active client to their coordinator so no one shows as "Unassigned" on the team board.</div>
              </div>
              <FixKanbanButton />
            </div>
          </div>
        )}

        {isFounder && (
          <>
            {/* ── Data ops ── */}
            <div className="card mb-4">
              <div className="card-h">Data operations</div>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>Seed Kashish / Muskan sessions</div>
                  <div className="text-[11px] muted mt-0.5">Populates RegularTraining rows from the reference sheet. Safe to re-run — existing rows are updated, not duplicated.</div>
                </div>
                <SeedRegularTrainingsButton />
              </div>
              <div className="flex items-center justify-between gap-4 flex-wrap mt-4" style={{ borderTop: '1px solid var(--brand-borderSoft)', paddingTop: '12px' }}>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>Sync from PDF — retire clients not in active sheet</div>
                  <div className="text-[11px] muted mt-0.5">Compares all active RegularTraining rows against the PDF list. Clients NOT in the PDF are set inactive and logged to Retrospective. Run this first, then re-seed.</div>
                </div>
                <CleanupSeedButton />
              </div>
              <div className="flex items-center justify-between gap-4 flex-wrap mt-4" style={{ borderTop: '1px solid var(--brand-borderSoft)', paddingTop: '12px' }}>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>Fix duplicates &amp; wrong names</div>
                  <div className="text-[11px] muted mt-0.5">Removes duplicate session rows, renames Sathiya→Saiteja, merges Nikhil (Arun)→Nikhil. Run once after seeding.</div>
                </div>
                <DedupButton />
              </div>
              <div className="flex items-center justify-between gap-4 flex-wrap mt-4" style={{ borderTop: '1px solid var(--brand-borderSoft)', paddingTop: '12px' }}>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>Fix Priya (sourcing request)</div>
                  <div className="text-[11px] muted mt-0.5">Restores Priya (priyaananthula27@gmail.com) so Anjali + Aman can see her and send the proposal.</div>
                </div>
                <FixPriyaButton />
              </div>
              <div className="flex items-center justify-between gap-4 flex-wrap mt-4" style={{ borderTop: '1px solid var(--brand-borderSoft)', paddingTop: '12px' }}>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>Fix unassigned clients on Kanban</div>
                  <div className="text-[11px] muted mt-0.5">Assigns each active client to their coordinator so no one shows as "Unassigned" on the team board.</div>
                </div>
                <FixKanbanButton />
              </div>
              <div className="flex items-center justify-between gap-4 flex-wrap mt-4" style={{ borderTop: '1px solid var(--brand-borderSoft)', paddingTop: '12px' }}>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>Sync Mitali's payment sheet</div>
                  <div className="text-[11px] muted mt-0.5">Clears pay dates + notes for all active clients, then re-populates from Mitali's June/July 2026 sheet. Matches by phone → email → name.</div>
                </div>
                <SyncPaymentSheetButton />
              </div>
              <div className="flex items-center justify-between gap-4 flex-wrap mt-4" style={{ borderTop: '1px solid var(--brand-borderSoft)', paddingTop: '12px' }}>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--status-red)' }}>Purge session logs before today</div>
                  <div className="text-[11px] muted mt-0.5">Permanently deletes all session log entries before today. Cannot be undone. Payout history will be lost.</div>
                </div>
                <PurgeSessionLogsButton />
              </div>
              <div className="flex items-center justify-between gap-4 flex-wrap mt-4" style={{ borderTop: '1px solid var(--brand-borderSoft)', paddingTop: '12px' }}>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>Send Malika's status report now</div>
                  <div className="text-[11px] muted mt-0.5">Fires today's payments status report to malgup@mitssolution.com immediately (normally auto-sends at 5:30 PM IST).</div>
                </div>
                <MalikaReportButton />
              </div>
              <div className="flex items-center justify-between gap-4 flex-wrap mt-4" style={{ borderTop: '1px solid var(--brand-borderSoft)', paddingTop: '12px' }}>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>Send Mitali's daily activity report now</div>
                  <div className="text-[11px] muted mt-0.5">Fires today's activity summary to Mitali, Vaibhav and Samita immediately (normally auto-sends at 11:30 PM IST).</div>
                </div>
                <MitaliDailyReportButton />
              </div>
              <div className="flex items-center justify-between gap-4 flex-wrap mt-4" style={{ borderTop: '1px solid var(--brand-borderSoft)', paddingTop: '12px' }}>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>Send feedback survey emails now</div>
                  <div className="text-[11px] muted mt-0.5">Sends the client feedback survey email from Mitali to all clients whose payment is due in 2 days (auto-runs daily at 9 AM IST). Force mode — ignores the already-sent guard.</div>
                </div>
                <FeedbackSurveyButton />
              </div>
            </div>

            <div className="callout">
              Phase-1 launch. Mitali, Bhavneet, Kashish, Muskan, Areena, Ashok and Malika are disabled until you flip{' '}
              <strong>Phase 2 enabled</strong> on. Their data is preserved; their roles just can't sign in yet.
            </div>

            <div className="table-card" style={{ padding: 0 }}>
              {FLAG_SECTIONS.map((section, sIdx) => (
                <div key={section.title}>
                  <div
                    style={{
                      padding: '14px 14px 6px',
                      fontWeight: 600,
                      fontSize: 13,
                      color: '#6B6F78',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      borderTop: sIdx === 0 ? 'none' : '1px solid #2A2D33',
                    }}
                  >
                    {section.title}
                  </div>
                  {section.flags.map((f) => (
                    <div
                      key={f.key}
                      style={{
                        display: 'flex',
                        padding: 14,
                        borderBottom: '1px solid #2A2D33',
                        alignItems: 'flex-start',
                        gap: 14,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{f.label}</div>
                        <div style={{ fontSize: 12, color: '#6B6F78', marginTop: 3 }}>{f.desc}</div>
                      </div>
                      <Toggle
                        checked={!!flags?.[f.key]}
                        onChange={(v) => setFlag.mutate({ key: f.key, value: v })}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16 }}>
              {resetConfirm.asking ? (
                <span className="flex items-center gap-1 text-[11px]">
                  Reset all flags?{' '}
                  <Button size="sm" variant="danger" onClick={resetConfirm.yes}>Yes</Button>
                  <Button size="sm" onClick={resetConfirm.no}>No</Button>
                </span>
              ) : (
                <Button size="sm" onClick={() => resetConfirm.ask(() => reset.mutate())}>
                  Reset flags to defaults
                </Button>
              )}
            </div>
          </>
        )}
      </Page>
    </>
  );
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
    >
      <div className="text-[10px] uppercase tracking-[0.10em] font-bold muted mb-1">{label}</div>
      <div className="text-[13px] font-medium" style={{ color: 'var(--brand-text)' }}>{value || '—'}</div>
    </div>
  );
}

function CleanupSeedButton() {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const cleanupConfirm = useConfirm();
  const cleanup = useMutation({
    mutationFn: () => api.post('/seed/cleanup'),
    onSuccess: (r: any) => {
      const d = r.data;
      showToast(`Done — ${d.retired} clients retired to Retrospective, ${d.kept} kept`);
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['retrospective'] });
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Cleanup failed', 'error'),
  });
  if (cleanupConfirm.asking) {
    return (
      <span className="flex items-center gap-1 text-[11px]">
        Archive old clients?{' '}
        <Button size="sm" variant="danger" onClick={cleanupConfirm.yes}>Yes</Button>
        <Button size="sm" onClick={cleanupConfirm.no}>No</Button>
      </span>
    );
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={cleanup.isPending}
      onClick={() => cleanupConfirm.ask(() => cleanup.mutate())}
    >
      {cleanup.isPending ? 'Archiving…' : '🗂 Archive old seeded clients'}
    </Button>
  );
}

function DedupButton() {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const dedupConfirm = useConfirm();
  const dedup = useMutation({
    mutationFn: () => api.post('/seed/dedup'),
    onSuccess: (r: any) => {
      const d = r.data;
      showToast(`Done — ${d.deleted} duplicates removed, ${d.fixed} names fixed`);
      qc.invalidateQueries({ queryKey: ['my-sessions-sheet'] });
      qc.invalidateQueries({ queryKey: ['regular-trainings'] });
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Dedup failed', 'error'),
  });
  if (dedupConfirm.asking) {
    return (
      <span className="flex items-center gap-1 text-[11px]">
        Permanently fix duplicates?{' '}
        <Button size="sm" variant="danger" onClick={dedupConfirm.yes}>Yes</Button>
        <Button size="sm" onClick={dedupConfirm.no}>No</Button>
      </span>
    );
  }
  return (
    <Button
      size="sm"
      variant="danger"
      disabled={dedup.isPending}
      onClick={() => dedupConfirm.ask(() => dedup.mutate())}
    >
      {dedup.isPending ? 'Fixing…' : '🧹 Fix duplicates'}
    </Button>
  );
}

function FixPriyaButton() {
  const showToast = useUI((s) => s.showToast);
  const fix = useMutation({
    mutationFn: () => api.post('/seed/fix-priya'),
    onSuccess: (r: any) => showToast(`Priya fixed ✓ — ${r.data?.log?.join(' | ')}`),
    onError: (e: any) => showToast(e.response?.data?.error || 'Fix failed', 'error'),
  });
  return (
    <Button size="sm" variant="primary" disabled={fix.isPending} onClick={() => fix.mutate()}>
      {fix.isPending ? 'Fixing…' : '🔧 Fix Priya'}
    </Button>
  );
}

function FixKanbanButton() {
  const showToast = useUI((s) => s.showToast);
  const fix = useMutation({
    mutationFn: () => api.post('/seed/fix-kanban'),
    onSuccess: (r: any) => showToast(r.data?.fixed > 0 ? `Fixed ${r.data.fixed} clients ✓` : 'All clients already assigned ✓'),
    onError: (e: any) => showToast(e.response?.data?.error || 'Fix failed', 'error'),
  });
  return (
    <Button size="sm" variant="primary" disabled={fix.isPending} onClick={() => fix.mutate()}>
      {fix.isPending ? 'Fixing…' : '📋 Fix Kanban'}
    </Button>
  );
}

function MalikaReportButton() {
  const showToast = useUI((s) => s.showToast);
  const report = useMutation({
    mutationFn: () => api.post('/briefing/malika-status'),
    onSuccess: () => showToast('Malika status report sent ✓'),
    onError: (e: any) => showToast(e.response?.data?.error || 'Send failed', 'error'),
  });
  return (
    <Button size="sm" variant="primary" disabled={report.isPending} onClick={() => report.mutate()}>
      <Send size={12} /> {report.isPending ? 'Sending…' : 'Send now'}
    </Button>
  );
}

function MitaliDailyReportButton() {
  const showToast = useUI((s) => s.showToast);
  const report = useMutation({
    mutationFn: () => api.post('/briefing/mitali-daily'),
    onSuccess: () => showToast("Mitali's daily report sent ✓"),
    onError: (e: any) => showToast(e.response?.data?.error || 'Send failed', 'error'),
  });
  return (
    <Button size="sm" variant="primary" disabled={report.isPending} onClick={() => report.mutate()}>
      <Send size={12} /> {report.isPending ? 'Sending…' : 'Send now'}
    </Button>
  );
}

function FeedbackSurveyButton() {
  const showToast = useUI((s) => s.showToast);
  const sample = useMutation({
    mutationFn: () => api.post('/briefing/feedback-survey', { sample: true }),
    onSuccess: () => showToast('Sample email sent to Vaibhav, Samita & Mitali ✓'),
    onError: (e: any) => showToast(e.response?.data?.error || 'Send failed', 'error'),
  });
  const force = useMutation({
    mutationFn: () => api.post('/briefing/feedback-survey'),
    onSuccess: (res: any) => {
      const { sent, skipped, errors } = res.data || {};
      showToast(`Feedback emails: ${sent} sent, ${skipped} skipped, ${errors} errors`);
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Send failed', 'error'),
  });
  const busy = sample.isPending || force.isPending;
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="default" disabled={busy} onClick={() => sample.mutate()}>
        <Send size={12} /> {sample.isPending ? 'Sending…' : 'Send sample'}
      </Button>
      <Button size="sm" variant="primary" disabled={busy} onClick={() => force.mutate()}>
        <Send size={12} /> {force.isPending ? 'Sending…' : 'Send now (all clients)'}
      </Button>
    </div>
  );
}

function SyncPaymentSheetButton() {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const sync = useMutation({
    mutationFn: () => api.post('/seed/sync-payment-sheet'),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['follow-up-payments'] });
      const unmatched = r.data?.unmatched || [];
      showToast(`Synced ${r.data?.matched} clients ✓${unmatched.length ? ` · ${unmatched.length} unmatched` : ''}`);
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Sync failed', 'error'),
  });
  return (
    <Button size="sm" variant="primary" disabled={sync.isPending} onClick={() => sync.mutate()}>
      {sync.isPending ? 'Syncing…' : '📋 Sync payment sheet'}
    </Button>
  );
}

function PurgeSessionLogsButton() {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const purge = useMutation({
    mutationFn: () => {
      const today = new Date().toISOString().slice(0, 10);
      return api.delete(`/session-logs/purge-before?before=${today}`);
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['session-logs'] });
      showToast(`Deleted ${r.data.deleted} session log entries ✓`);
      setConfirmed(false);
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Purge failed', 'error'),
  });
  if (!confirmed) {
    return (
      <Button size="sm" variant="danger" onClick={() => setConfirmed(true)}>
        🗑 Purge old logs
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px]" style={{ color: 'var(--status-red)' }}>Are you sure? This cannot be undone.</span>
      <Button size="sm" onClick={() => setConfirmed(false)}>Cancel</Button>
      <Button size="sm" variant="danger" disabled={purge.isPending} onClick={() => purge.mutate()}>
        {purge.isPending ? 'Deleting…' : 'Yes, delete all'}
      </Button>
    </div>
  );
}

function SeedRegularTrainingsButton() {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const [preview, setPreview] = useState<string[] | null>(null);
  const seedConfirm = useConfirm();

  const dryRun = useMutation({
    mutationFn: () => api.post('/seed/regular-trainings?dry=true'),
    onSuccess: (r: any) => setPreview(r.data.log),
    onError: (e: any) => showToast(e.response?.data?.error || 'Preview failed', 'error'),
  });

  const seed = useMutation({
    mutationFn: () => api.post('/seed/regular-trainings'),
    onSuccess: (r: any) => {
      const d = r.data;
      showToast(`Seed done — ${d.created} created, ${d.updated} updated, ${d.skipped} skipped`);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ['my-sessions-sheet'] });
      qc.invalidateQueries({ queryKey: ['regular-trainings'] });
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Seed failed', 'error'),
  });

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex gap-2">
        <Button size="sm" variant="default" disabled={dryRun.isPending || seed.isPending} onClick={() => dryRun.mutate()}>
          {dryRun.isPending ? 'Previewing…' : '🔍 Preview changes'}
        </Button>
        {seedConfirm.asking ? (
          <span className="flex items-center gap-1 text-[11px]">
            Write to live DB?{' '}
            <Button size="sm" variant="danger" onClick={seedConfirm.yes}>Yes</Button>
            <Button size="sm" onClick={seedConfirm.no}>No</Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="primary"
            disabled={seed.isPending || dryRun.isPending}
            onClick={() => seedConfirm.ask(() => seed.mutate())}
          >
            {seed.isPending ? 'Seeding…' : '↺ Apply to database'}
          </Button>
        )}
      </div>
      {preview && (
        <div className="w-full mt-2 rounded border text-[11px] font-mono p-3 max-h-64 overflow-y-auto" style={{ background: 'var(--brand-surface)', borderColor: 'var(--brand-borderSoft)' }}>
          <div className="font-semibold text-xs mb-2" style={{ color: 'var(--brand-text)' }}>
            Preview — {preview.length} actions (nothing written yet)
          </div>
          {preview.map((line, i) => (
            <div key={i} className={line.includes('would CREATE') ? 'text-green-400' : line.includes('⚠') ? 'text-amber-400' : 'text-brand-textMuted'}>
              {line}
            </div>
          ))}
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setPreview(null)}>Dismiss</Button>
        </div>
      )}
    </div>
  );
}
