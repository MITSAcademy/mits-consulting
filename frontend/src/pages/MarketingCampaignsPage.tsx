import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { useState, useMemo } from 'react';
import { Send, Mail, Trash2, Eye, Plus, CheckCircle2, Clock, AlertTriangle, Loader2, Users } from 'lucide-react';

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

const TEMPLATES = [
  {
    name: 'Newsletter',
    subject: 'Monthly Update from MITS Edge',
    html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f6f9;">
  <!-- Header -->
  <div style="background:#1B5FAA;padding:28px 36px;border-radius:10px 10px 0 0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">MITS <span style="color:#1B5FAA;">EDGE</span></span>
          <div style="font-size:10px;color:rgba(255,255,255,0.45);letter-spacing:2px;text-transform:uppercase;margin-top:2px;">Powered by MITS Group</div>
        </td>
        <td align="right">
          <span style="font-size:10px;color:rgba(255,255,255,0.4);letter-spacing:1px;text-transform:uppercase;">Live Online Tech Training</span>
        </td>
      </tr>
    </table>
  </div>
  <!-- Gold accent bar -->
  <div style="background:#4A90D9;height:4px;"></div>
  <!-- Hero -->
  <div style="background:#ffffff;padding:36px 36px 28px;">
    <p style="font-size:15px;color:#444;margin:0 0 6px;">Hi {{name}},</p>
    <h2 style="font-size:24px;font-weight:800;color:#1B5FAA;margin:0 0 16px;line-height:1.3;">[Your headline here]</h2>
    <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 20px;">[Your message here. MITS Edge delivers live, instructor-led online courses with expert mentors, hands-on projects, and dedicated placement support.]</p>
    <!-- CTA button -->
    <div style="margin:24px 0;">
      <a href="https://www.mitsedge.com" style="display:inline-block;background:#1B5FAA;color:#ffffff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:6px;text-decoration:none;letter-spacing:0.3px;">Explore Programs →</a>
    </div>
  </div>
  <!-- Stats bar -->
  <div style="background:#f8f9fb;border-top:1px solid #e8eaf0;border-bottom:1px solid #e8eaf0;padding:20px 36px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="border-right:1px solid #e0e3eb;padding:0 12px;">
          <div style="font-size:20px;font-weight:800;color:#1B5FAA;">10,000+</div>
          <div style="font-size:10px;color:#888;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">Learners</div>
        </td>
        <td align="center" style="border-right:1px solid #e0e3eb;padding:0 12px;">
          <div style="font-size:20px;font-weight:800;color:#1B5FAA;">200+</div>
          <div style="font-size:10px;color:#888;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">Hiring Partners</div>
        </td>
        <td align="center" style="padding:0 12px;">
          <div style="font-size:20px;font-weight:800;color:#1B5FAA;">22+</div>
          <div style="font-size:10px;color:#888;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">Programs</div>
        </td>
      </tr>
    </table>
  </div>
  <!-- Body -->
  <div style="background:#ffffff;padding:28px 36px 36px;">
    <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 24px;">[Additional content goes here — course updates, announcements, tips, etc.]</p>
    <p style="font-size:14px;color:#444;margin:0;">Warm regards,<br/><strong style="color:#1B5FAA;">The MITS Edge Team</strong></p>
  </div>
  <!-- Footer -->
  <div style="background:#1B5FAA;padding:20px 36px;border-radius:0 0 10px 10px;text-align:center;">
    <p style="font-size:11px;color:rgba(255,255,255,0.45);margin:0 0 6px;">
      <a href="https://www.mitsedge.com" style="color:#ffffff;text-decoration:none;font-weight:600;">mitsedge.com</a> &nbsp;·&nbsp; sales.mc@mitssolution.com
    </p>
    <p style="font-size:10px;color:rgba(255,255,255,0.3);margin:0;">You received this because you are a valued client of MITS. © 2026 MITS Group.</p>
  </div>
</div>`,
  },
  {
    name: 'Follow-up',
    subject: 'Checking in — How is your training going?',
    html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f6f9;">
  <div style="background:#1B5FAA;padding:24px 36px;border-radius:10px 10px 0 0;">
    <span style="font-size:20px;font-weight:800;color:#ffffff;">MITS <span style="color:#1B5FAA;">EDGE</span></span>
  </div>
  <div style="background:#4A90D9;height:4px;"></div>
  <div style="background:#ffffff;padding:36px;border-radius:0 0 10px 10px;">
    <p style="font-size:15px;color:#444;margin:0 0 16px;">Hi {{name}},</p>
    <p style="font-size:14px;color:#555;line-height:1.7;">We wanted to check in and see how your training sessions are going.</p>
    <p style="font-size:14px;color:#555;line-height:1.7;">Your progress matters a lot to us, and we'd love to hear your feedback. Please feel free to reply to this email if you need anything or have suggestions.</p>
    <div style="margin:28px 0;">
      <a href="https://www.mitsedge.com" style="display:inline-block;background:#1B5FAA;color:#ffffff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:6px;text-decoration:none;">Visit MITS Edge →</a>
    </div>
    <p style="font-size:14px;color:#444;margin:0;">Best regards,<br/><strong style="color:#1B5FAA;">MITS Edge Team</strong></p>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f0f0f0;font-size:11px;color:#aaa;text-align:center;">
      <a href="https://www.mitsedge.com" style="color:#1B5FAA;text-decoration:none;">mitsedge.com</a> · sales.mc@mitssolution.com · © 2026 MITS Group
    </div>
  </div>
</div>`,
  },
  {
    name: 'Blank',
    subject: '',
    html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f6f9;">
  <div style="background:#1B5FAA;padding:24px 36px;border-radius:10px 10px 0 0;">
    <span style="font-size:20px;font-weight:800;color:#ffffff;">MITS <span style="color:#1B5FAA;">EDGE</span></span>
  </div>
  <div style="background:#4A90D9;height:4px;"></div>
  <div style="background:#ffffff;padding:36px;border-radius:0 0 10px 10px;">
    <p style="font-size:15px;color:#444;">Dear {{name}},</p>
    <p style="font-size:14px;color:#555;line-height:1.7;">[Your message here]</p>
    <p style="font-size:14px;color:#444;margin-top:32px;">Best regards,<br/><strong style="color:#1B5FAA;">MITS Edge Team</strong></p>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f0f0f0;font-size:11px;color:#aaa;text-align:center;">
      <a href="https://www.mitsedge.com" style="color:#1B5FAA;text-decoration:none;">mitsedge.com</a> · sales.mc@mitssolution.com · © 2026 MITS Group
    </div>
  </div>
</div>`,
  },
];

type Campaign = {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  fromName: string;
  fromEmail: string;
  recipientMode: string;
  lifecycles: string[];
  clientIds: string[];
  status: string;
  sentAt: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  provider: string | null;
  createdAt: string;
  createdBy: { name: string } | null;
  sentBy: { name: string } | null;
};

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { color: string; icon: React.ReactNode }> = {
    Draft:   { color: 'var(--brand-textMuted)',  icon: <Clock size={10} /> },
    Sending: { color: 'var(--status-amber)',      icon: <Loader2 size={10} className="animate-spin" /> },
    Sent:    { color: 'var(--status-green)',      icon: <CheckCircle2 size={10} /> },
    Failed:  { color: 'var(--status-red)',        icon: <AlertTriangle size={10} /> },
  };
  const c = cfg[status] || cfg.Draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: c.color, background: `color-mix(in srgb, ${c.color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${c.color} 22%, transparent)`, borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      {c.icon}{status}
    </span>
  );
}

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
          <div className="muted text-[13px] py-8 text-center">No recipients match the current filter.</div>
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

const EMPTY_DRAFT = { name: '', subject: '', htmlBody: TEMPLATES[0].html, fromName: 'MITS Consulting', fromEmail: 'sales.mc@mitssolution.com', recipientMode: 'all_active', lifecycles: [] as string[], clientIds: [] as string[] };

export function MarketingCampaignsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [htmlPreview, setHtmlPreview] = useState(false);
  const [sendConfirm, setSendConfirm] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [f, setF] = useState({ ...EMPTY_DRAFT });

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
    mutationFn: (data: typeof f) => api.post('/marketing-campaigns', data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-campaigns'] }); showToast('Draft saved'); setComposerOpen(false); setEditingId(null); setF({ ...EMPTY_DRAFT }); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const updateCampaign = useMutation({
    mutationFn: (data: typeof f) => api.patch(`/marketing-campaigns/${editingId}`, data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-campaigns'] }); showToast('Draft updated'); setComposerOpen(false); setEditingId(null); setF({ ...EMPTY_DRAFT }); },
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

  function openNew(templateIdx = 0) {
    const t = TEMPLATES[templateIdx];
    setF({ ...EMPTY_DRAFT, htmlBody: t.html, subject: t.subject });
    setEditingId(null);
    setComposerOpen(true);
  }

  function openEdit(c: Campaign) {
    setF({ name: c.name, subject: c.subject, htmlBody: c.htmlBody, fromName: c.fromName, fromEmail: c.fromEmail, recipientMode: c.recipientMode, lifecycles: c.lifecycles, clientIds: c.clientIds });
    setEditingId(c.id);
    setComposerOpen(true);
  }

  const toggleLifecycle = (v: string) => setF((p) => ({ ...p, lifecycles: p.lifecycles.includes(v) ? p.lifecycles.filter((x) => x !== v) : [...p.lifecycles, v] }));
  const toggleClientId = (id: string) => setF((p) => ({ ...p, clientIds: p.clientIds.includes(id) ? p.clientIds.filter((x) => x !== id) : [...p.clientIds, id] }));

  const canSave = f.name.trim() && f.subject.trim() && f.htmlBody.trim();

  const sendTarget = useMemo(() => campaigns.find((c) => c.id === sendConfirm), [campaigns, sendConfirm]);

  return (
    <>
      <Topbar
        title="Marketing Campaigns"
        subtitle={`${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => openNew(0)}><Plus size={13} className="mr-1" />New Campaign</Button>
          </div>
        }
      />
      <Page>
        <div className="callout">
          Design and send marketing emails from <strong>sales.mc@mitssolution.com</strong> to your clients.
          Use <code style={{ fontSize: 11, background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 4 }}>{'{{name}}'}</code> in the body to personalise each email.
          Connect Brevo SMTP in Render env vars (<code style={{ fontSize: 11, background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 4 }}>BREVO_SMTP_USER</code> + <code style={{ fontSize: 11, background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 4 }}>BREVO_SMTP_PASS</code>) for 300 free emails/day with open tracking.
        </div>

        {/* Template quick-start */}
        {campaigns.length === 0 && !isLoading && (
          <div style={{ marginBottom: 24 }}>
            <div className="text-[12px] muted uppercase tracking-wider font-semibold mb-3">Start from a template</div>
            <div className="flex flex-wrap gap-3">
              {TEMPLATES.map((t, i) => (
                <button
                  key={t.name}
                  onClick={() => openNew(i)}
                  style={{ padding: '14px 20px', border: '1px dashed var(--brand-border)', borderRadius: 10, background: 'var(--bg-card)', cursor: 'pointer', textAlign: 'left', minWidth: 160 }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-text)', marginBottom: 4 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--brand-textMuted)' }}>{t.subject || 'Blank canvas'}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Campaigns list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 muted text-[13px]">Loading…</div>
        ) : campaigns.length === 0 ? null : (
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
                    <div style={{ fontSize: 12, color: 'var(--brand-textSecondary)', marginBottom: 6 }}>Subject: {c.subject}</div>
                    <div className="flex flex-wrap gap-3 text-[11px] muted">
                      <span>
                        {c.recipientMode === 'all_clients' ? '→ All clients (any stage)' :
                         c.recipientMode === 'all_active' ? '→ Active clients only' :
                         c.recipientMode === 'by_lifecycle' ? `→ ${c.lifecycles.join(', ')}` :
                         `→ ${c.clientIds.length} individual client${c.clientIds.length !== 1 ? 's' : ''}`}
                      </span>
                      {c.status === 'Sent' && (
                        <span style={{ color: 'var(--status-green)' }}>✓ {c.sentCount} sent{c.failedCount > 0 ? ` · ${c.failedCount} failed` : ''}</span>
                      )}
                      {c.sentAt && <span>Sent {new Date(c.sentAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                      {!c.sentAt && <span>Created {new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                      {c.createdBy && <span>by {c.createdBy.name}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {/* Preview recipients */}
                    {c.status !== 'Sending' && (
                      <button
                        onClick={() => setPreviewId(c.id)}
                        className="text-[11px] px-2.5 py-1 rounded"
                        style={{ background: 'var(--bg-input)', color: 'var(--brand-textSecondary)', border: '1px solid var(--brand-borderSoft)', cursor: 'pointer' }}
                        title="Preview recipients"
                      ><Users size={11} style={{ display: 'inline', marginRight: 3 }} />Recipients</button>
                    )}

                    {/* Edit (draft only) */}
                    {c.status === 'Draft' && (
                      <button
                        onClick={() => openEdit(c)}
                        className="text-[11px] px-2.5 py-1 rounded"
                        style={{ background: 'var(--bg-input)', color: 'var(--brand-textSecondary)', border: '1px solid var(--brand-borderSoft)', cursor: 'pointer' }}
                      >Edit</button>
                    )}

                    {/* Send */}
                    {c.status === 'Draft' && (
                      <button
                        onClick={() => setSendConfirm(c.id)}
                        className="text-[11px] px-2.5 py-1 rounded font-semibold"
                        style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--status-green)', border: '1px solid rgba(34,197,94,0.3)', cursor: 'pointer' }}
                      ><Send size={10} style={{ display: 'inline', marginRight: 3 }} />Send</button>
                    )}

                    {/* Delete */}
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

        {/* Composer dialog */}
        {composerOpen && (
          <Dialog open onOpenChange={(o) => { if (!o) { setComposerOpen(false); setEditingId(null); setF({ ...EMPTY_DRAFT }); } }}>
            <DialogContent className="!max-w-[780px]">
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
                <Mail size={15} style={{ display: 'inline', marginRight: 6 }} />
                {editingId ? 'Edit campaign' : 'New campaign'}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Template selector (new only) */}
                {!editingId && (
                  <div>
                    <Label>Template</Label>
                    <div className="flex gap-2 mt-1">
                      {TEMPLATES.map((t, i) => (
                        <button
                          key={t.name}
                          onClick={() => setF((p) => ({ ...p, htmlBody: t.html, subject: t.subject || p.subject }))}
                          className="text-[11px] px-3 py-1 rounded-full"
                          style={{ background: f.htmlBody === t.html ? 'var(--accent-gold)' : 'var(--bg-input)', color: f.htmlBody === t.html ? '#0a0c12' : 'var(--brand-textSecondary)', border: '1px solid var(--brand-borderSoft)', cursor: 'pointer', fontWeight: f.htmlBody === t.html ? 700 : 500 }}
                        >{t.name}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="form-row">
                  <Label>Campaign name <span style={{ color: 'var(--status-red)' }}>*</span></Label>
                  <Input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. August newsletter" />
                </div>

                <div className="flex gap-3">
                  <div className="form-row flex-1">
                    <Label>From name</Label>
                    <Input value={f.fromName} onChange={(e) => setF((p) => ({ ...p, fromName: e.target.value }))} />
                  </div>
                  <div className="form-row flex-1">
                    <Label>From email</Label>
                    <Input value={f.fromEmail} onChange={(e) => setF((p) => ({ ...p, fromEmail: e.target.value }))} />
                  </div>
                </div>

                <div className="form-row">
                  <Label>Subject line <span style={{ color: 'var(--status-red)' }}>*</span></Label>
                  <Input value={f.subject} onChange={(e) => setF((p) => ({ ...p, subject: e.target.value }))} placeholder="Email subject…" />
                </div>

                {/* Recipients */}
                <div>
                  <Label>Recipients</Label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {[
                      { value: 'all_clients', label: 'All clients (any stage)' },
                      { value: 'all_active', label: 'Active clients only' },
                      { value: 'by_lifecycle', label: 'By lifecycle stage' },
                      { value: 'individual', label: 'Individual clients' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setF((p) => ({ ...p, recipientMode: opt.value }))}
                        className="text-[12px] px-3 py-1.5 rounded-full"
                        style={{ background: f.recipientMode === opt.value ? 'rgba(99,102,241,0.15)' : 'var(--bg-input)', color: f.recipientMode === opt.value ? '#818cf8' : 'var(--brand-textSecondary)', border: `1px solid ${f.recipientMode === opt.value ? 'rgba(99,102,241,0.35)' : 'var(--brand-borderSoft)'}`, cursor: 'pointer', fontWeight: f.recipientMode === opt.value ? 700 : 500 }}
                      >{opt.label}</button>
                    ))}
                  </div>

                  {f.recipientMode === 'by_lifecycle' && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {LIFECYCLE_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          onClick={() => toggleLifecycle(o.value)}
                          className="text-[11px] px-2.5 py-1 rounded-full"
                          style={{ background: f.lifecycles.includes(o.value) ? 'rgba(234,179,8,0.15)' : 'var(--bg-input)', color: f.lifecycles.includes(o.value) ? '#ca8a04' : 'var(--brand-textMuted)', border: `1px solid ${f.lifecycles.includes(o.value) ? 'rgba(234,179,8,0.35)' : 'var(--brand-borderSoft)'}`, cursor: 'pointer', fontWeight: f.lifecycles.includes(o.value) ? 700 : 400 }}
                        >{f.lifecycles.includes(o.value) ? '✓ ' : ''}{o.label}</button>
                      ))}
                    </div>
                  )}

                  {f.recipientMode === 'individual' && (
                    <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--brand-borderSoft)', borderRadius: 8, marginTop: 8, padding: 8 }}>
                      {clients.map((c) => (
                        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 12 }}>
                          <input type="checkbox" checked={f.clientIds.includes(c.id)} onChange={() => toggleClientId(c.id)} />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* HTML body */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Email body (HTML) <span style={{ color: 'var(--status-red)' }}>*</span></Label>
                    <button
                      onClick={() => setHtmlPreview((p) => !p)}
                      style={{ fontSize: 11, color: 'var(--brand-textSecondary)', background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
                    ><Eye size={10} style={{ display: 'inline', marginRight: 3 }} />{htmlPreview ? 'Edit HTML' : 'Preview'}</button>
                  </div>
                  {htmlPreview ? (
                    <div style={{ border: '1px solid var(--brand-border)', borderRadius: 8, padding: 16, background: '#fff', minHeight: 300, maxHeight: 400, overflowY: 'auto' }}>
                      <iframe
                        srcDoc={f.htmlBody.replace(/\{\{name\}\}/gi, 'John Doe').replace(/\{\{email\}\}/gi, 'john@example.com')}
                        style={{ width: '100%', minHeight: 280, border: 'none' }}
                        title="Email preview"
                      />
                    </div>
                  ) : (
                    <Textarea
                      value={f.htmlBody}
                      onChange={(e) => setF((p) => ({ ...p, htmlBody: e.target.value }))}
                      rows={14}
                      style={{ fontFamily: 'monospace', fontSize: 12 }}
                      placeholder="Paste or write HTML here. Use {{name}} to personalise."
                    />
                  )}
                  <div style={{ fontSize: 11, color: 'var(--brand-textMuted)', marginTop: 4 }}>
                    Use <code style={{ background: 'var(--bg-input)', padding: '1px 4px', borderRadius: 3 }}>{'{{name}}'}</code> to insert each recipient's name automatically.
                  </div>
                </div>
              </div>

              <DialogFooter>
                <div style={{ marginTop: 20 }} className="flex justify-end gap-2">
                <Button onClick={() => { setComposerOpen(false); setEditingId(null); setF({ ...EMPTY_DRAFT }); }}>Cancel</Button>
                <Button
                  variant="primary"
                  disabled={!canSave || createCampaign.isPending || updateCampaign.isPending}
                  onClick={() => editingId ? updateCampaign.mutate(f) : createCampaign.mutate(f)}
                >
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
              <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8, fontSize: 12 }}>
                <div><strong>Subject:</strong> {sendTarget.subject}</div>
                <div><strong>From:</strong> {sendTarget.fromName} &lt;{sendTarget.fromEmail}&gt;</div>
                <div><strong>Recipients:</strong> {sendTarget.recipientMode === 'all_clients' ? 'All clients (any stage)' : sendTarget.recipientMode === 'all_active' ? 'Active clients only' : sendTarget.recipientMode === 'by_lifecycle' ? sendTarget.lifecycles.join(', ') : `${sendTarget.clientIds.length} individual`}</div>
              </div>
              <DialogFooter>
                <div style={{ marginTop: 16 }} className="flex justify-end gap-2">
                <Button onClick={() => setSendConfirm(null)}>Cancel</Button>
                <Button
                  variant="primary"
                  disabled={sendCampaign.isPending}
                  onClick={() => sendCampaign.mutate(sendConfirm)}
                  style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--status-green)', border: '1px solid rgba(34,197,94,0.3)' }}
                >
                  {sendCampaign.isPending ? 'Starting…' : <><Send size={12} className="mr-1" />Yes, send now</>}
                </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Recipients preview modal */}
        {previewId && <RecipientPreviewModal campaignId={previewId} onClose={() => setPreviewId(null)} />}
      </Page>
    </>
  );
}
