import { useEffect, useState } from 'react';
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
              <Button size="sm" onClick={() => {
                if (confirm('Clear your SMTP config? Outbound emails will fall back to the system sender.')) clear.mutate();
              }} disabled={clear.isPending}>
                <Trash2 size={12}/> Clear
              </Button>
            </>
          )}
        </div>
        {smtp?.configuredAt && (
          <div className="text-[11px] muted">Last saved: {new Date(smtp.configuredAt).toLocaleString()}</div>
        )}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  const isFounder = user?.role === 'founder';

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

  return (
    <>
      <Topbar title={isFounder ? 'Settings · Feature flags + My email' : 'Settings · My email'} />
      <Page>
        <div className="mb-4">
          <MyEmailSection />
        </div>

        <div className="card mb-4">
          <div className="card-h">Account</div>
          <div className="text-sm">
            <div><span className="muted">Name:</span> {user?.name}</div>
            <div><span className="muted">Login email:</span> {user?.email}</div>
            <div><span className="muted">Role:</span> <span className="capitalize">{user?.role.replace(/_/g, ' ')}</span></div>
          </div>
        </div>

        {isFounder && (
          <>
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
              <Button
                size="sm"
                onClick={() => {
                  if (confirm('Reset all feature flags to defaults?')) reset.mutate();
                }}
              >
                Reset flags to defaults
              </Button>
            </div>
          </>
        )}
      </Page>
    </>
  );
}
