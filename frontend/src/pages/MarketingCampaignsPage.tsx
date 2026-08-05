import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { useUI } from '@/store/ui';
import { useState, useMemo } from 'react';
import { Send, Mail, Trash2, Eye, Plus, CheckCircle2, Clock, AlertTriangle, Loader2, Users, Code2, Pencil } from 'lucide-react';

// ─── Brand helpers ────────────────────────────────────────────────────────────
const BLUE = '#1B5FAA';
const LIGHT_BLUE = '#4A90D9';

function mitsHeader() {
  return `<div style="background:${BLUE};padding:24px 36px;border-radius:10px 10px 0 0;">
    <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">MITS EDGE</span>
    <div style="font-size:10px;color:rgba(255,255,255,0.5);letter-spacing:2px;text-transform:uppercase;margin-top:2px;">Powered by MITS Group</div>
  </div>
  <div style="background:${LIGHT_BLUE};height:4px;"></div>`;
}

function mitsFooter() {
  return `<div style="background:${BLUE};padding:18px 36px;border-radius:0 0 10px 10px;text-align:center;">
    <p style="font-size:11px;color:rgba(255,255,255,0.5);margin:0 0 4px;">
      <a href="https://www.mitsedge.com" style="color:#fff;font-weight:600;text-decoration:none;">mitsedge.com</a> &nbsp;·&nbsp; sales.mc@mitssolution.com
    </p>
    <p style="font-size:10px;color:rgba(255,255,255,0.3);margin:0;">© 2026 MITS Group · You received this as a valued client.</p>
  </div>`;
}

function ctaBtn(text: string, url = 'https://www.mitsedge.com') {
  return `<div style="margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:${BLUE};color:#fff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:6px;text-decoration:none;">${text} →</a>
  </div>`;
}

function buildHtml(headline: string, body: string, cta: string, ctaUrl: string, badge?: string) {
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f6f9;">
  ${mitsHeader()}
  <div style="background:#fff;padding:36px 36px 28px;">
    <p style="font-size:15px;color:#444;margin:0 0 8px;">Hi {{name}},</p>
    ${badge ? `<div style="display:inline-block;background:rgba(27,95,170,0.1);color:${BLUE};font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;border:1px solid rgba(27,95,170,0.25);margin-bottom:12px;letter-spacing:0.5px;text-transform:uppercase;">${badge}</div>` : ''}
    <h2 style="font-size:22px;font-weight:800;color:${BLUE};margin:0 0 14px;line-height:1.35;">${headline}</h2>
    <div style="font-size:14px;color:#555;line-height:1.75;">${body}</div>
    ${ctaBtn(cta, ctaUrl)}
    <p style="font-size:14px;color:#444;margin:16px 0 0;">Warm regards,<br/><strong style="color:${BLUE};">The MITS Edge Team</strong></p>
  </div>
  ${mitsFooter()}
</div>`;
}

// ─── Stage-aware templates ────────────────────────────────────────────────────
type Template = {
  name: string;
  badge: string;
  lifecycle: string;   // maps to by_lifecycle preset
  subject: string;
  headline: string;
  body: string;
  cta: string;
  ctaUrl: string;
  recipientMode: string;
  lifecycles: string[];
};

const STAGE_TEMPLATES: Template[] = [
  {
    name: 'New Lead — Welcome',
    badge: 'Get Started',
    lifecycle: 'Lead',
    subject: 'Welcome to MITS Edge — Start Your Tech Journey Today',
    headline: 'Live Online Tech Training That Gets You Hired',
    body: `<p>We're thrilled you're exploring MITS Edge! We offer live, instructor-led courses in AI &amp; Data Science, Cloud, Cybersecurity, Full-Stack, and more — designed for working professionals.</p>
<p>Here's what makes us different:</p>
<ul style="padding-left:18px;margin:12px 0;">
  <li style="margin-bottom:6px;">✅ 100% live sessions — no pre-recorded content</li>
  <li style="margin-bottom:6px;">✅ Expert mentors with real industry experience</li>
  <li style="margin-bottom:6px;">✅ Dedicated placement support</li>
  <li style="margin-bottom:6px;">✅ 10,000+ learners · 200+ hiring partners</li>
</ul>
<p><strong>🎁 Special offer for new enquiries: Book a free demo session and get ₹2,000 off your first course!</strong></p>`,
    cta: 'Book a Free Demo',
    ctaUrl: 'https://www.mitsedge.com',
    recipientMode: 'by_lifecycle',
    lifecycles: ['Lead'],
  },
  {
    name: 'Demo Scheduled — Reminder',
    badge: 'Demo Reminder',
    lifecycle: 'DemoScheduled',
    subject: 'Your MITS Edge Demo is Coming Up — Here\'s What to Expect',
    headline: 'Your Demo Session is Almost Here!',
    body: `<p>We're looking forward to meeting you! Your demo session with MITS Edge is confirmed. Here's a quick look at what to expect:</p>
<ul style="padding-left:18px;margin:12px 0;">
  <li style="margin-bottom:6px;">🎯 A personalised walkthrough of courses that match your goals</li>
  <li style="margin-bottom:6px;">💬 Live Q&amp;A with our expert trainer</li>
  <li style="margin-bottom:6px;">📋 Career roadmap based on your background</li>
</ul>
<p>Come prepared with your questions — our trainers love a good conversation!</p>
<p><strong>💡 Tip:</strong> Enrol within 48 hours of your demo and save ₹3,000 on your course fee.</p>`,
    cta: 'View Course Catalog',
    ctaUrl: 'https://www.mitsedge.com',
    recipientMode: 'by_lifecycle',
    lifecycles: ['DemoScheduled'],
  },
  {
    name: 'Demo Done — Follow-Up Offer',
    badge: 'Limited Offer',
    lifecycle: 'DemoDone',
    subject: '48-Hour Offer: ₹3,000 Off — Just for You, {{name}}',
    headline: 'Loved the Demo? Lock In Your Spot Now',
    body: `<p>Thank you for attending your demo session! We hope it gave you a clear picture of what learning at MITS Edge looks like.</p>
<p>We'd love to welcome you as a student. As a special thank-you for attending:</p>
<div style="background:#f0f6ff;border-left:4px solid ${BLUE};padding:14px 18px;border-radius:0 8px 8px 0;margin:16px 0;">
  <strong style="color:${BLUE};font-size:15px;">🎉 ₹3,000 Enrolment Discount</strong><br/>
  <span style="font-size:13px;color:#555;">Valid for 48 hours from this email. Apply code <strong>DEMO3000</strong> at checkout.</span>
</div>
<p>Our team is also happy to answer any remaining questions — just reply to this email.</p>`,
    cta: 'Enrol Now & Save ₹3,000',
    ctaUrl: 'https://www.mitsedge.com',
    recipientMode: 'by_lifecycle',
    lifecycles: ['DemoDone'],
  },
  {
    name: 'Sale Closing — Last Push',
    badge: 'Closing Soon',
    lifecycle: 'SaleClosing',
    subject: 'Don\'t Miss Out, {{name}} — Your Offer Expires Soon',
    headline: 'Your Spot is Almost Gone — Secure It Today',
    body: `<p>We noticed you've been considering MITS Edge — and we don't want you to miss out on the current batch.</p>
<p><strong>Seats in our upcoming batch are filling up fast.</strong> Here's what you get when you enrol today:</p>
<ul style="padding-left:18px;margin:12px 0;">
  <li style="margin-bottom:6px;">🔒 Guaranteed seat in the next live batch</li>
  <li style="margin-bottom:6px;">💰 Current pricing — fees go up with next batch</li>
  <li style="margin-bottom:6px;">🎁 Free access to our recorded revision library (worth ₹5,000)</li>
</ul>
<div style="background:#fff3cd;border-left:4px solid #e6a817;padding:12px 16px;border-radius:0 8px 8px 0;margin:16px 0;">
  ⏰ <strong>Offer valid for the next 72 hours only.</strong>
</div>
<p>Reply to this email or call us — we'll get you enrolled in minutes.</p>`,
    cta: 'Secure My Seat Now',
    ctaUrl: 'https://www.mitsedge.com',
    recipientMode: 'by_lifecycle',
    lifecycles: ['SaleClosing'],
  },
  {
    name: 'Active — Monthly Check-In',
    badge: 'For Active Students',
    lifecycle: 'Active',
    subject: 'How is Your Training Going, {{name}}? Here\'s What\'s New',
    headline: 'Keep Up the Great Work!',
    body: `<p>We hope your sessions are going well and you're making great progress. We wanted to check in and share a few updates:</p>
<ul style="padding-left:18px;margin:12px 0;">
  <li style="margin-bottom:6px;">📚 New course modules added this month</li>
  <li style="margin-bottom:6px;">🏆 Student success stories — see what your peers achieved</li>
  <li style="margin-bottom:6px;">🔗 Placement drives happening this month — talk to your trainer</li>
</ul>
<p><strong>Refer a friend</strong> and earn ₹2,000 off your next course — just share your unique referral link!</p>
<p>As always, if you have any concerns or feedback about your sessions, reply to this email and we'll sort it out.</p>`,
    cta: 'Visit MITS Edge',
    ctaUrl: 'https://www.mitsedge.com',
    recipientMode: 'by_lifecycle',
    lifecycles: ['Active'],
  },
  {
    name: 'Hold — Re-engage',
    badge: 'We Miss You',
    lifecycle: 'Hold',
    subject: 'Ready to Resume? We\'ve Saved Your Progress, {{name}}',
    headline: 'Your Learning Journey is Waiting',
    body: `<p>Life gets busy — we completely understand. Your training has been on hold, and we just wanted to let you know that <strong>we're here whenever you're ready to pick up where you left off.</strong></p>
<p>To make your return easier:</p>
<ul style="padding-left:18px;margin:12px 0;">
  <li style="margin-bottom:6px;">📝 Your progress is saved — no need to restart</li>
  <li style="margin-bottom:6px;">🕒 Flexible session rescheduling available</li>
  <li style="margin-bottom:6px;">🎁 Resume this month and get 2 extra sessions free</li>
</ul>
<p>Just reply to this email or call us to reactivate your enrolment — it takes less than 5 minutes.</p>`,
    cta: 'Resume My Training',
    ctaUrl: 'https://www.mitsedge.com',
    recipientMode: 'by_lifecycle',
    lifecycles: ['Hold'],
  },
  {
    name: 'Dormant — Win Back',
    badge: 'Special Win-Back Offer',
    lifecycle: 'Dormant',
    subject: '{{name}}, We Have a Special Offer to Welcome You Back',
    headline: 'Come Back to MITS Edge — Exclusive Offer Inside',
    body: `<p>It's been a while since we last connected, and we miss having you as part of the MITS Edge community!</p>
<p>A lot has changed since you were with us — new courses, better tools, and an even stronger placement network. We'd love to have you back.</p>
<div style="background:#f0f6ff;border-left:4px solid ${BLUE};padding:14px 18px;border-radius:0 8px 8px 0;margin:16px 0;">
  <strong style="color:${BLUE};font-size:15px;">🎁 Exclusive Win-Back Offer</strong><br/>
  <span style="font-size:13px;color:#555;">Re-enrol in any course and get <strong>30% off</strong> + a free one-on-one career counselling session (worth ₹4,000).</span>
</div>
<p>This offer is exclusively for you and expires in 7 days. Don't let it slip away!</p>`,
    cta: 'Claim My 30% Discount',
    ctaUrl: 'https://www.mitsedge.com',
    recipientMode: 'by_lifecycle',
    lifecycles: ['Dormant'],
  },
  {
    name: 'Churned — Last Chance',
    badge: 'One Last Offer',
    lifecycle: 'Churned',
    subject: 'One Last Offer Before We Say Goodbye, {{name}}',
    headline: 'We\'d Love a Second Chance to Impress You',
    body: `<p>We know things didn't work out as expected, and we respect your decision. But before we part ways, we wanted to share one final offer — because we genuinely believe MITS Edge can make a difference for your career.</p>
<div style="background:#fff3cd;border-left:4px solid #e6a817;padding:14px 18px;border-radius:0 8px 8px 0;margin:16px 0;">
  <strong style="font-size:15px;">🌟 Comeback Offer — 40% Off Any Course</strong><br/>
  <span style="font-size:13px;color:#555;">Plus a dedicated success manager assigned to you for the first 30 days. No questions asked.</span>
</div>
<p>If there was anything specific that didn't meet your expectations, we'd genuinely love to hear it — just reply to this email.</p>
<p>Whatever you decide, we wish you all the best on your career journey.</p>`,
    cta: 'Give Us Another Chance',
    ctaUrl: 'https://www.mitsedge.com',
    recipientMode: 'by_lifecycle',
    lifecycles: ['Churned'],
  },
  {
    name: 'General Newsletter',
    badge: '',
    lifecycle: '',
    subject: 'Monthly Update from MITS Edge',
    headline: 'What\'s New at MITS Edge This Month',
    body: `<p>Here's a quick update from the MITS Edge team:</p>
<ul style="padding-left:18px;margin:12px 0;">
  <li style="margin-bottom:6px;">📣 [Update 1 — e.g. new course launched]</li>
  <li style="margin-bottom:6px;">🏆 [Update 2 — e.g. placement achievement]</li>
  <li style="margin-bottom:6px;">🎁 [Update 3 — e.g. referral offer]</li>
</ul>
<p>[Add your personalised message here.]</p>`,
    cta: 'Explore Programs',
    ctaUrl: 'https://www.mitsedge.com',
    recipientMode: 'all_clients',
    lifecycles: [],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────
type Campaign = {
  id: string; name: string; subject: string; htmlBody: string;
  fromName: string; fromEmail: string; recipientMode: string;
  lifecycles: string[]; clientIds: string[]; status: string;
  sentAt: string | null; totalRecipients: number; sentCount: number;
  failedCount: number; provider: string | null; createdAt: string;
  createdBy: { name: string } | null; sentBy: { name: string } | null;
};

type EditorFields = {
  name: string; subject: string; fromName: string; fromEmail: string;
  recipientMode: string; lifecycles: string[]; clientIds: string[];
  // visual editor
  headline: string; body: string; cta: string; ctaUrl: string; badge: string;
  // raw html override
  htmlBody: string; useRawHtml: boolean;
};

const LIFECYCLE_OPTIONS = [
  { value: 'Lead', label: 'Lead' },
  { value: 'DemoScheduled', label: 'Demo Scheduled' },
  { value: 'DemoDone', label: 'Demo Done' },
  { value: 'SaleClosing', label: 'Sale Closing' },
  { value: 'SaleWon', label: 'Sale Won' },
  { value: 'Active', label: 'Active' },
  { value: 'Hold', label: 'Hold' },
  { value: 'Dormant', label: 'Dormant' },
  { value: 'Churned', label: 'Churned' },
];

const STAGE_COLORS: Record<string, string> = {
  Lead: '#6366f1', DemoScheduled: '#f59e0b', DemoDone: '#10b981',
  SaleClosing: '#ef4444', Active: '#22c55e', Hold: '#f97316',
  Dormant: '#8b5cf6', Churned: '#64748b', '': '#1B5FAA',
};

function emptyEditor(t?: Template): EditorFields {
  return {
    name: '', subject: t?.subject || '', fromName: 'MITS Edge',
    fromEmail: 'sales.mc@mitssolution.com',
    recipientMode: t?.recipientMode || 'all_clients',
    lifecycles: t?.lifecycles || [], clientIds: [],
    headline: t?.headline || '', body: t?.body || '',
    cta: t?.cta || 'Learn More', ctaUrl: t?.ctaUrl || 'https://www.mitsedge.com',
    badge: t?.badge || '', htmlBody: '', useRawHtml: false,
  };
}

function compileHtml(f: EditorFields): string {
  if (f.useRawHtml) return f.htmlBody;
  return buildHtml(f.headline, f.body, f.cta, f.ctaUrl, f.badge || undefined);
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { color: string; icon: React.ReactNode }> = {
    Draft:   { color: 'var(--brand-textMuted)', icon: <Clock size={10} /> },
    Sending: { color: 'var(--status-amber)',     icon: <Loader2 size={10} className="animate-spin" /> },
    Sent:    { color: 'var(--status-green)',     icon: <CheckCircle2 size={10} /> },
    Failed:  { color: 'var(--status-red)',       icon: <AlertTriangle size={10} /> },
  };
  const c = cfg[status] || cfg.Draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: c.color, background: `color-mix(in srgb, ${c.color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${c.color} 22%, transparent)`, borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      {c.icon}{status}
    </span>
  );
}

// ─── Recipients modal ─────────────────────────────────────────────────────────
function RecipientPreviewModal({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ count: number; recipients: { id: string; name: string; email: string }[] }>({
    queryKey: ['campaign-recipients', campaignId],
    queryFn: () => api.post(`/marketing-campaigns/${campaignId}/preview-recipients`).then((r) => r.data),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="!max-w-[520px]">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
          <Users size={14} style={{ display: 'inline', marginRight: 6 }} />
          Recipients preview {data ? `(${data.count})` : ''}
        </div>
        {isLoading ? (
          <div className="muted text-[13px] py-8 text-center">Loading…</div>
        ) : !data?.count ? (
          <div className="muted text-[13px] py-8 text-center">No recipients with email addresses match this filter.</div>
        ) : (
          <div style={{ maxHeight: 320, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--brand-border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-tableHeader, var(--bg-card))' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--brand-textMuted)' }}>Name</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--brand-textMuted)' }}>Email</th>
                </tr>
              </thead>
              <tbody>
                {data.recipients.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--brand-borderSoft)' }}>
                    <td style={{ padding: '7px 10px' }}>{r.name}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--brand-textSecondary)' }}>{r.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter><Button onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function MarketingCampaignsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [emailPreview, setEmailPreview] = useState(false);
  const [sendConfirm, setSendConfirm] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [f, setF] = useState<EditorFields>(emptyEditor(STAGE_TEMPLATES[0]));

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ['marketing-campaigns'],
    queryFn: () => api.get('/marketing-campaigns').then((r) => r.data),
    refetchInterval: (q) => {
      const d = q.state.data as Campaign[] | undefined;
      return d?.some((c) => c.status === 'Sending') ? 4000 : false;
    },
  });

  const { data: clients = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['clients', 'id-name'],
    queryFn: () => api.get('/clients').then((r) => (r.data as any[]).map((c) => ({ id: c.id, name: c.name }))),
    enabled: f.recipientMode === 'individual',
  });

  const createCampaign = useMutation({
    mutationFn: (data: EditorFields) => api.post('/marketing-campaigns', { ...data, htmlBody: compileHtml(data) }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-campaigns'] }); showToast('Draft saved'); closeComposer(); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const updateCampaign = useMutation({
    mutationFn: (data: EditorFields) => api.patch(`/marketing-campaigns/${editingId}`, { ...data, htmlBody: compileHtml(data) }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-campaigns'] }); showToast('Draft updated'); closeComposer(); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const sendCampaign = useMutation({
    mutationFn: (id: string) => api.post(`/marketing-campaigns/${id}/send`).then((r) => r.data),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ['marketing-campaigns'] }); showToast(`Sending to ${d.totalRecipients} recipients…`); setSendConfirm(null); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to send', 'error'),
  });

  const deleteCampaign = useMutation({
    mutationFn: (id: string) => api.delete(`/marketing-campaigns/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-campaigns'] }); showToast('Deleted'); setDeleteConfirm(null); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  function closeComposer() { setComposerOpen(false); setEditingId(null); setEmailPreview(false); setF(emptyEditor(STAGE_TEMPLATES[0])); }

  function openNew(t: Template) {
    setF(emptyEditor(t));
    setEditingId(null);
    setComposerOpen(true);
  }

  function openEdit(c: Campaign) {
    setF({ name: c.name, subject: c.subject, fromName: c.fromName, fromEmail: c.fromEmail, recipientMode: c.recipientMode, lifecycles: c.lifecycles, clientIds: c.clientIds, headline: '', body: '', cta: 'Learn More', ctaUrl: 'https://www.mitsedge.com', badge: '', htmlBody: c.htmlBody, useRawHtml: true });
    setEditingId(c.id);
    setComposerOpen(true);
  }

  const sf = (patch: Partial<EditorFields>) => setF((p) => ({ ...p, ...patch }));
  const toggleLifecycle = (v: string) => sf({ lifecycles: f.lifecycles.includes(v) ? f.lifecycles.filter((x) => x !== v) : [...f.lifecycles, v] });
  const toggleClientId = (id: string) => sf({ clientIds: f.clientIds.includes(id) ? f.clientIds.filter((x) => x !== id) : [...f.clientIds, id] });

  const canSave = f.name.trim() && f.subject.trim() && (f.useRawHtml ? f.htmlBody.trim() : f.headline.trim() && f.body.trim());
  const sendTarget = useMemo(() => campaigns.find((c) => c.id === sendConfirm), [campaigns, sendConfirm]);

  const recipientLabel = (c: Campaign) => {
    if (c.recipientMode === 'all_clients') return '→ All clients';
    if (c.recipientMode === 'all_active') return '→ Active clients only';
    if (c.recipientMode === 'by_lifecycle') return `→ ${c.lifecycles.join(', ')}`;
    return `→ ${c.clientIds.length} individual client${c.clientIds.length !== 1 ? 's' : ''}`;
  };

  return (
    <>
      <Topbar
        title="Marketing Campaigns"
        subtitle={`${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}`}
        actions={<Button variant="primary" onClick={() => openNew(STAGE_TEMPLATES[0])}><Plus size={13} className="mr-1" />New Campaign</Button>}
      />
      <Page>
        <div className="callout">
          Send personalised MITS Edge emails to your clients. Use <code style={{ fontSize: 11, background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 4 }}>{'{{name}}'}</code> to personalise.
          Add <code style={{ fontSize: 11, background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 4 }}>BREVO_SMTP_USER</code> + <code style={{ fontSize: 11, background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 4 }}>BREVO_SMTP_PASS</code> in Render for 300 free emails/day.
        </div>

        {/* Stage template picker */}
        <div style={{ marginBottom: 24 }}>
          <div className="text-[11px] muted uppercase tracking-wider font-semibold mb-3">Choose a template by stage</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {STAGE_TEMPLATES.map((t) => {
              const color = STAGE_COLORS[t.lifecycle] || BLUE;
              return (
                <button
                  key={t.name}
                  onClick={() => openNew(t)}
                  style={{ padding: '12px 14px', border: `1px solid color-mix(in srgb, ${color} 25%, var(--brand-border))`, borderRadius: 10, background: 'var(--bg-card)', cursor: 'pointer', textAlign: 'left' }}
                >
                  {t.badge && (
                    <div style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, color, background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`, borderRadius: 20, padding: '2px 8px', marginBottom: 6, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{t.badge}</div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-text)', marginBottom: 2 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--brand-textMuted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subject}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Campaigns list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 muted text-[13px]">Loading…</div>
        ) : campaigns.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {campaigns.map((c) => (
              <div key={c.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)', borderRadius: 12, padding: '14px 18px' }}>
                <div className="flex items-start gap-3">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                      <StatusPill status={c.status} />
                      {c.provider && <span style={{ fontSize: 10, color: 'var(--brand-textMuted)', background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', borderRadius: 4, padding: '1px 5px' }}>{c.provider}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--brand-textSecondary)', marginBottom: 5 }}>Subject: {c.subject}</div>
                    <div className="flex flex-wrap gap-3 text-[11px] muted">
                      <span>{recipientLabel(c)}</span>
                      {c.status === 'Sent' && <span style={{ color: 'var(--status-green)' }}>✓ {c.sentCount} sent{c.failedCount > 0 ? ` · ${c.failedCount} failed` : ''}</span>}
                      {c.sentAt ? <span>Sent {new Date(c.sentAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span> : <span>Created {new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                      {c.createdBy && <span>by {c.createdBy.name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end" style={{ position: 'relative', zIndex: 2 }}>
                    {c.status !== 'Sending' && (
                      <button onClick={() => setPreviewId(c.id)} className="text-[11px] px-2.5 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--brand-textSecondary)', border: '1px solid var(--brand-borderSoft)', cursor: 'pointer' }}>
                        <Users size={11} style={{ display: 'inline', marginRight: 3 }} />Recipients
                      </button>
                    )}
                    {c.status === 'Draft' && (
                      <button onClick={() => openEdit(c)} className="text-[11px] px-2.5 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--brand-textSecondary)', border: '1px solid var(--brand-borderSoft)', cursor: 'pointer' }}>
                        <Pencil size={10} style={{ display: 'inline', marginRight: 3 }} />Edit
                      </button>
                    )}
                    {c.status === 'Draft' && (
                      <button onClick={() => setSendConfirm(c.id)} className="text-[11px] px-2.5 py-1 rounded font-semibold" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--status-green)', border: '1px solid rgba(34,197,94,0.3)', cursor: 'pointer', pointerEvents: 'all', position: 'relative', zIndex: 3 }}>
                        <Send size={10} style={{ display: 'inline', marginRight: 3 }} />Send
                      </button>
                    )}
                    {c.status !== 'Sending' && (
                      deleteConfirm === c.id ? (
                        <span className="flex items-center gap-1">
                          <span style={{ fontSize: 11, color: 'var(--status-red)' }}>Delete?</span>
                          <button onClick={() => deleteCampaign.mutate(c.id)} className="text-[11px] px-2 py-1 rounded" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--status-red)', border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer', fontWeight: 600 }}>Yes</button>
                          <button onClick={() => setDeleteConfirm(null)} className="text-[11px] px-2 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--brand-textMuted)', border: '1px solid var(--brand-borderSoft)', cursor: 'pointer' }}>No</button>
                        </span>
                      ) : (
                        <button onClick={() => setDeleteConfirm(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-textMuted)', padding: '4px' }}><Trash2 size={13} /></button>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Composer */}
        {composerOpen && (
          <Dialog open onOpenChange={(o) => { if (!o) closeComposer(); }}>
            <DialogContent className="!max-w-[820px]">
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
                <Mail size={15} style={{ display: 'inline', marginRight: 6 }} />
                {editingId ? 'Edit campaign' : 'New campaign'}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Meta fields */}
                <div className="form-row">
                  <Label>Campaign name *</Label>
                  <Input value={f.name} onChange={(e) => sf({ name: e.target.value })} placeholder="e.g. August win-back offer" />
                </div>
                <div className="flex gap-3">
                  <div className="form-row flex-1">
                    <Label>From name</Label>
                    <Input value={f.fromName} onChange={(e) => sf({ fromName: e.target.value })} />
                  </div>
                  <div className="form-row flex-1">
                    <Label>From email</Label>
                    <Input value={f.fromEmail} onChange={(e) => sf({ fromEmail: e.target.value })} />
                  </div>
                </div>
                <div className="form-row">
                  <Label>Subject line *</Label>
                  <Input value={f.subject} onChange={(e) => sf({ subject: e.target.value })} placeholder="Email subject…" />
                </div>

                {/* Recipients */}
                <div>
                  <Label>Recipients</Label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {[
                      { value: 'all_clients', label: 'All clients' },
                      { value: 'all_active', label: 'Active only' },
                      { value: 'by_lifecycle', label: 'By stage' },
                      { value: 'individual', label: 'Individual' },
                    ].map((opt) => (
                      <button key={opt.value} onClick={() => sf({ recipientMode: opt.value })} className="text-[12px] px-3 py-1.5 rounded-full"
                        style={{ background: f.recipientMode === opt.value ? 'rgba(27,95,170,0.15)' : 'var(--bg-input)', color: f.recipientMode === opt.value ? BLUE : 'var(--brand-textSecondary)', border: `1px solid ${f.recipientMode === opt.value ? 'rgba(27,95,170,0.35)' : 'var(--brand-borderSoft)'}`, cursor: 'pointer', fontWeight: f.recipientMode === opt.value ? 700 : 500 }}
                      >{opt.label}</button>
                    ))}
                  </div>
                  {f.recipientMode === 'by_lifecycle' && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {LIFECYCLE_OPTIONS.map((o) => {
                        const on = f.lifecycles.includes(o.value);
                        const col = STAGE_COLORS[o.value] || BLUE;
                        return (
                          <button key={o.value} onClick={() => toggleLifecycle(o.value)} className="text-[11px] px-2.5 py-1 rounded-full"
                            style={{ background: on ? `color-mix(in srgb, ${col} 15%, transparent)` : 'var(--bg-input)', color: on ? col : 'var(--brand-textMuted)', border: `1px solid ${on ? `color-mix(in srgb, ${col} 35%, transparent)` : 'var(--brand-borderSoft)'}`, cursor: 'pointer', fontWeight: on ? 700 : 400 }}
                          >{on ? '✓ ' : ''}{o.label}</button>
                        );
                      })}
                    </div>
                  )}
                  {f.recipientMode === 'individual' && (
                    <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--brand-borderSoft)', borderRadius: 8, marginTop: 8, padding: 8 }}>
                      {clients.map((c) => (
                        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 12 }}>
                          <input type="checkbox" checked={f.clientIds.includes(c.id)} onChange={() => toggleClientId(c.id)} />{c.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Visual / Raw toggle */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Email content *</Label>
                    <div className="flex items-center gap-1">
                      <button onClick={() => sf({ useRawHtml: false })} className="text-[11px] px-2.5 py-1 rounded-l-md"
                        style={{ background: !f.useRawHtml ? BLUE : 'var(--bg-input)', color: !f.useRawHtml ? '#fff' : 'var(--brand-textSecondary)', border: `1px solid ${!f.useRawHtml ? BLUE : 'var(--brand-borderSoft)'}`, cursor: 'pointer', fontWeight: !f.useRawHtml ? 700 : 400 }}>
                        <Pencil size={10} style={{ display: 'inline', marginRight: 3 }} />Visual editor
                      </button>
                      <button onClick={() => sf({ useRawHtml: true })} className="text-[11px] px-2.5 py-1 rounded-r-md"
                        style={{ background: f.useRawHtml ? BLUE : 'var(--bg-input)', color: f.useRawHtml ? '#fff' : 'var(--brand-textSecondary)', border: `1px solid ${f.useRawHtml ? BLUE : 'var(--brand-borderSoft)'}`, cursor: 'pointer', fontWeight: f.useRawHtml ? 700 : 400 }}>
                        <Code2 size={10} style={{ display: 'inline', marginRight: 3 }} />Raw HTML
                      </button>
                      <button onClick={() => setEmailPreview((p) => !p)} className="text-[11px] px-2.5 py-1 rounded ml-2"
                        style={{ background: emailPreview ? 'rgba(27,95,170,0.12)' : 'var(--bg-input)', color: emailPreview ? BLUE : 'var(--brand-textSecondary)', border: `1px solid ${emailPreview ? 'rgba(27,95,170,0.3)' : 'var(--brand-borderSoft)'}`, cursor: 'pointer' }}>
                        <Eye size={10} style={{ display: 'inline', marginRight: 3 }} />{emailPreview ? 'Close preview' : 'Preview email'}
                      </button>
                    </div>
                  </div>

                  {emailPreview ? (
                    <div style={{ border: '1px solid var(--brand-border)', borderRadius: 8, background: '#f4f6f9', overflow: 'hidden' }}>
                      <iframe
                        srcDoc={compileHtml(f).replace(/\{\{name\}\}/gi, 'John Doe').replace(/\{\{email\}\}/gi, 'john@example.com')}
                        style={{ width: '100%', height: 440, border: 'none', display: 'block' }}
                        title="Email preview"
                      />
                    </div>
                  ) : f.useRawHtml ? (
                    <Textarea value={f.htmlBody} onChange={(e) => sf({ htmlBody: e.target.value })} rows={14}
                      style={{ fontFamily: 'monospace', fontSize: 12 }} placeholder="Paste full HTML here. Use {{name}} to personalise." />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-input)', borderRadius: 10, padding: 14 }}>
                      <div className="flex gap-3">
                        <div className="form-row flex-1">
                          <Label>Badge label <span style={{ color: 'var(--brand-textMuted)', fontWeight: 400 }}>(optional)</span></Label>
                          <Input value={f.badge} onChange={(e) => sf({ badge: e.target.value })} placeholder="e.g. Limited Offer" />
                        </div>
                      </div>
                      <div className="form-row">
                        <Label>Headline *</Label>
                        <Input value={f.headline} onChange={(e) => sf({ headline: e.target.value })} placeholder="Main heading of the email" />
                      </div>
                      <div className="form-row">
                        <Label>Body <span style={{ color: 'var(--brand-textMuted)', fontWeight: 400 }}>(HTML supported)</span></Label>
                        <Textarea value={f.body} onChange={(e) => sf({ body: e.target.value })} rows={8}
                          placeholder="Write your email body here. You can use basic HTML like <p>, <strong>, <ul>, <li>. Use {{name}} to personalise." />
                      </div>
                      <div className="flex gap-3">
                        <div className="form-row flex-1">
                          <Label>CTA button text</Label>
                          <Input value={f.cta} onChange={(e) => sf({ cta: e.target.value })} placeholder="e.g. Enrol Now" />
                        </div>
                        <div className="form-row flex-1">
                          <Label>CTA link</Label>
                          <Input value={f.ctaUrl} onChange={(e) => sf({ ctaUrl: e.target.value })} />
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--brand-textMuted)' }}>
                        The MITS Edge header, footer, and brand styling are added automatically.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <div style={{ marginTop: 16 }} className="flex justify-end gap-2">
                  <Button onClick={closeComposer}>Cancel</Button>
                  <Button variant="primary" disabled={!canSave || createCampaign.isPending || updateCampaign.isPending}
                    onClick={() => editingId ? updateCampaign.mutate(f) : createCampaign.mutate(f)}>
                    {(createCampaign.isPending || updateCampaign.isPending) ? 'Saving…' : 'Save draft'}
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Send confirmation */}
        {sendConfirm && sendTarget && (
          <Dialog open onOpenChange={(o) => { if (!o) setSendConfirm(null); }}>
            <DialogContent className="!max-w-[440px]">
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
                <Send size={14} style={{ display: 'inline', marginRight: 6, color: 'var(--status-green)' }} />
                Send campaign?
              </div>
              <div style={{ fontSize: 13, color: 'var(--brand-textMuted)', lineHeight: 1.6 }}>
                You're about to send <strong>"{sendTarget.name}"</strong> to all matching recipients. This cannot be undone.
              </div>
              <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div><strong>Subject:</strong> {sendTarget.subject}</div>
                <div><strong>From:</strong> {sendTarget.fromName} &lt;{sendTarget.fromEmail}&gt;</div>
                <div><strong>Recipients:</strong> {recipientLabel(sendTarget)}</div>
              </div>
              <DialogFooter>
                <div style={{ marginTop: 16 }} className="flex justify-end gap-2">
                  <Button onClick={() => setSendConfirm(null)}>Cancel</Button>
                  <Button variant="primary" disabled={sendCampaign.isPending} onClick={() => sendCampaign.mutate(sendConfirm)}
                    style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--status-green)', border: '1px solid rgba(34,197,94,0.3)' }}>
                    {sendCampaign.isPending ? 'Starting…' : <><Send size={12} className="mr-1" />Yes, send now</>}
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {previewId && <RecipientPreviewModal campaignId={previewId} onClose={() => setPreviewId(null)} />}
      </Page>
    </>
  );
}
