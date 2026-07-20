import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { formatPhone, readAvailabilitySlots, formatAvailabilitySlots, fmtTrainerId, downloadVCard } from '@/lib/utils';
import { AvailabilitySlotsEditor } from '@/components/AvailabilitySlotsEditor';
import { useState } from 'react';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { SendMessageModal, MessagesHistoryCard } from '@/components/SendMessageModal';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { DemoHistoryCard } from '@/components/DemoHistoryCard';
import { CommentSection } from '@/components/CommentSection';
import { ActivityLog } from '@/components/ActivityLog';
import { Mail, MessageCircle, ArrowLeft, ExternalLink, UserPlus } from 'lucide-react';

export function TrainerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data: t } = useQuery({
    queryKey: ['trainer', id],
    queryFn: () => api.get(`/trainers/${id}`).then((r) => r.data),
  });
  const { user } = useAuth();
  const canEditFinance = ['founder', 'manager', 'lead'].includes(user?.role || '');
  const FINANCE_FIELDS = ['paymentMethod', 'upiId', 'bankAccount', 'bankHolderName', 'bankName', 'bankAccountNumber', 'bankIfscCode', 'bankBranchName', 'bankAccountType', 'bankChequeUrl'];
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
    onError: () => showToast('Failed to save trainer', 'error'),
  });

  if (!t) return (
    <Page>
      <div className="card">
        <SkeletonBlock w={200} h={22} className="mb-3" />
        <SkeletonBlock w="100%" h={12} className="mb-2" />
        <SkeletonBlock w="80%" h={12} className="mb-2" />
        <SkeletonBlock w="60%" h={12} />
      </div>
    </Page>
  );

  return (
    <>
      <Topbar
        title={`${t.name}${t.seqId ? ` · ${fmtTrainerId(t.seqId)}` : ''}`}
        subtitle={t.experienceYears ? `${t.experienceYears}y experience` : undefined}
        actions={
          edit ? (
            <>
              <Button onClick={() => setEdit(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => save.mutate()}>Save</Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                onClick={() => {
                  // Prefer history-back when there's a previous SPA entry (Trainer Match
                  // → Pick → Detail flow), fall back to the trainer-pool list.
                  if (window.history.length > 1) navigate(-1);
                  else navigate('/trainers');
                }}
                title="Return to the previous screen"
              >
                <ArrowLeft size={14}/> Back
              </Button>
              <Button size="sm" onClick={() => setSendOpen('Email')} disabled={!t.email}><Mail size={14}/> Email</Button>
              <Button size="sm" onClick={() => setSendOpen('WhatsApp')} disabled={!t.phoneDigits}
                style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}>
                <MessageCircle size={14}/> WhatsApp
              </Button>
              {t.phoneDigits && (
                <Button size="sm" onClick={() => downloadVCard(t.name, t.phoneCode, t.phoneDigits, t.email, t.skills)} title="Save to phone contacts">
                  <UserPlus size={14}/> Save contact
                </Button>
              )}
              <Button onClick={() => {
                const f = { ...t };
                if (!canEditFinance) FINANCE_FIELDS.forEach(k => delete f[k]);
                setForm(f);
                setEdit(true);
              }}>Edit</Button>
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
                <div className="form-row">
                  <Label>Phone</Label>
                  <div className="flex gap-1">
                    <select
                      className="rounded border px-2 py-1 text-sm bg-bg-input border-brand-border h-9 w-20"
                      value={form.phoneCode || '+91'}
                      onChange={(e) => setForm({ ...form, phoneCode: e.target.value })}
                    >
                      <option value="+91">+91</option>
                      <option value="+1">+1</option>
                      <option value="+44">+44</option>
                    </select>
                    <Input
                      value={form.phoneDigits || ''}
                      onChange={(e) => setForm({ ...form, phoneDigits: e.target.value.replace(/\D/g, '') })}
                      placeholder="10 digits"
                    />
                  </div>
                </div>
                <div className="form-row"><Label>Skills</Label><Input value={form.skills || ''} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="form-row">
                    <Label>Rate model</Label>
                    <select
                      className="rounded border px-2 py-1 text-sm bg-bg-input border-brand-border h-9 w-full"
                      value={form.rateModel || 'hourly'}
                      onChange={(e) => setForm({ ...form, rateModel: e.target.value })}
                    >
                      <option value="hourly">Hourly</option>
                      <option value="per_session">Per session</option>
                      <option value="training_one_shot">Training (one-shot)</option>
                      <option value="training_monthly">Training (monthly)</option>
                    </select>
                  </div>
                  <div className="form-row"><Label>Default rate ₹</Label><Input type="number" value={form.defaultRateInr || 0} onChange={(e) => setForm({ ...form, defaultRateInr: +e.target.value })} /></div>
                </div>
                <div className="form-row"><Label>Experience (years)</Label><Input type="number" value={form.experienceYears || 0} onChange={(e) => setForm({ ...form, experienceYears: +e.target.value })} /></div>
                {canEditFinance && <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="form-row"><Label>Payment method</Label><Input value={form.paymentMethod || ''} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} placeholder="UPI / Bank / …" /></div>
                    <div className="form-row"><Label>UPI ID</Label><Input value={form.upiId || ''} onChange={(e) => setForm({ ...form, upiId: e.target.value })} placeholder="name@bank" /></div>
                  </div>
                  <div className="form-row"><Label>Bank account (optional)</Label><Input value={form.bankAccount || ''} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} placeholder="A/c · IFSC" /></div>
                </>}
                <div className="form-row"><Label>WhatsApp group link</Label><Input value={form.whatsappGroupLink || ''} onChange={(e) => setForm({ ...form, whatsappGroupLink: e.target.value })} placeholder="https://chat.whatsapp.com/…" /></div>
                <div className="form-row">
                  <Label>Availability (IST)</Label>
                  <AvailabilitySlotsEditor
                    slots={readAvailabilitySlots(form)}
                    onChange={(slots) => setForm({ ...form, availabilitySlots: slots })}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Skills — primary field, shown prominently as pills */}
                <div className="rounded-lg p-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
                  <div className="text-[10px] uppercase tracking-[0.10em] font-bold muted mb-2">Skills</div>
                  {t.skills ? (
                    <div className="flex flex-wrap gap-1.5">
                      {t.skills.split(/[,|]+/).map((s: string) => s.trim()).filter(Boolean).map((skill: string) => (
                        <span
                          key={skill}
                          className="inline-block px-2 py-0.5 rounded text-[12px] font-medium"
                          style={{ background: 'color-mix(in srgb, var(--brand-accent) 12%, transparent)', color: 'var(--brand-accent)', border: '1px solid color-mix(in srgb, var(--brand-accent) 25%, transparent)' }}
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="muted text-[13px]">—</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <InfoCell label="Email" value={t.email} />
                  <InfoCell label="Phone" value={<span className="mono">{formatPhone(t.phoneCode, t.phoneDigits) || '—'}</span>} />
                  <InfoCell label="Rate" value={<><span className="mono">₹{t.defaultRateInr}</span> <span className="muted text-[11px]">{t.rateModel}</span></>} />
                  <InfoCell label="Experience" value={t.experienceYears ? `${t.experienceYears}y` : undefined} />
                  <InfoCell label="Payment" value={[t.paymentMethod, t.upiId || t.bankAccount].filter(Boolean).join(' · ') || undefined} />
                  <InfoCell label="Recruiter" value={t.recruitedBy?.name} />
                  <div className="col-span-2">
                    <InfoCell label="Availability (IST)" value={(() => {
                      const slots = readAvailabilitySlots(t);
                      return slots.length ? formatAvailabilitySlots(slots) : undefined;
                    })()} />
                  </div>
                  {t.whatsappGroupLink && (
                    <div className="col-span-2">
                      <div className="rounded-lg p-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
                        <div className="text-[10px] uppercase tracking-[0.10em] font-bold muted mb-1">WhatsApp Group</div>
                        <a href={t.whatsappGroupLink} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline"
                          style={{ color: '#25D366' }}>
                          <MessageCircle size={13}/> Open WhatsApp group <ExternalLink size={11}/>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-h">Active clients</div>
            {t.clients?.length ? (
              <div className="space-y-1">
                {t.clients.map((c: any) => (
                  <Link
                    key={c.id}
                    to={`/clients/${c.id}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium hover-lift"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
                  >
                    {c.name}
                    <span className="muted text-xs">→</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="muted text-sm py-2">No active engagements.</div>
            )}
          </div>
        </div>

        {/* Bank Details */}
        <div className="card mb-4">
          <div className="card-h">
            Bank details
            {!edit && canEditFinance && <Button size="sm" onClick={() => { setForm({ ...t }); setEdit(true); }} className="ml-auto">Edit</Button>}
          </div>
          {edit && canEditFinance ? (
            <div className="grid md:grid-cols-2 gap-2">
              <div className="form-row"><Label>Name (as per bank records)</Label><Input value={form.bankHolderName || ''} onChange={(e) => setForm({ ...form, bankHolderName: e.target.value })} placeholder="Full name on bank account" /></div>
              <div className="form-row"><Label>Bank name</Label><Input value={form.bankName || ''} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="e.g. HDFC Bank" /></div>
              <div className="form-row"><Label>Account number</Label><Input value={form.bankAccountNumber || ''} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} placeholder="Account number" /></div>
              <div className="form-row"><Label>IFSC code</Label><Input value={form.bankIfscCode || ''} onChange={(e) => setForm({ ...form, bankIfscCode: e.target.value })} placeholder="e.g. HDFC0001234" /></div>
              <div className="form-row"><Label>Branch name</Label><Input value={form.bankBranchName || ''} onChange={(e) => setForm({ ...form, bankBranchName: e.target.value })} placeholder="Branch name" /></div>
              <div className="form-row">
                <Label>Account type</Label>
                <select className="rounded border px-2 py-1 text-sm bg-bg-input border-brand-border h-9 w-full"
                  value={form.bankAccountType || ''} onChange={(e) => setForm({ ...form, bankAccountType: e.target.value })}>
                  <option value="">— Select —</option>
                  <option value="Savings">Savings</option>
                  <option value="Current">Current</option>
                </select>
              </div>
              <div className="form-row"><Label>UPI ID (optional)</Label><Input value={form.upiId || ''} onChange={(e) => setForm({ ...form, upiId: e.target.value })} placeholder="name@bank" /></div>
              <div className="form-row"><Label>Cancelled cheque / passbook URL (optional)</Label><Input value={form.bankChequeUrl || ''} onChange={(e) => setForm({ ...form, bankChequeUrl: e.target.value })} placeholder="https://…" /></div>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-2">
              <InfoCell label="Name (bank records)" value={t.bankHolderName} />
              <InfoCell label="Bank" value={t.bankName} />
              <InfoCell label="Account number" value={t.bankAccountNumber ? <span className="mono">{t.bankAccountNumber}</span> : undefined} />
              <InfoCell label="IFSC" value={t.bankIfscCode ? <span className="mono">{t.bankIfscCode}</span> : undefined} />
              <InfoCell label="Branch" value={t.bankBranchName} />
              <InfoCell label="Account type" value={t.bankAccountType} />
              <InfoCell label="UPI ID" value={t.upiId} />
              {t.bankChequeUrl && (
                <div className="col-span-2 rounded-lg p-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
                  <div className="text-[10px] uppercase tracking-[0.10em] font-bold muted mb-1">Cancelled cheque / passbook</div>
                  <a href={t.bankChequeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline" style={{ color: 'var(--brand-accent)' }}>
                    <ExternalLink size={12}/> View document
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card mb-4">
          <div className="card-h">Recent session logs</div>
          {(t.sessionLogs || []).length === 0 ? (
            <div className="muted text-sm py-4 text-center">No sessions logged yet.</div>
          ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-brand-textMuted text-[11px] uppercase tracking-[0.08em]"><th className="text-left py-2 pb-1.5">Date</th><th className="text-left py-2 pb-1.5">Client</th><th className="text-right py-2 pb-1.5">Hours</th><th className="text-right py-2 pb-1.5">Amount</th><th className="text-right py-2 pb-1.5">Status</th></tr></thead>
            <tbody>
              {(t.sessionLogs || []).slice(0, 20).map((l: any) => (
                <tr key={l.id} style={{ borderTop: '1px solid var(--brand-borderSoft)' }}>
                  <td className="mono py-2 text-xs">{l.date}</td>
                  <td className="py-2">{l.client?.name || '—'}</td>
                  <td className="mono text-right py-2">{l.hours}</td>
                  <td className="mono text-right py-2">₹{l.amountInr}</td>
                  <td className="text-right py-2"><Pill color={l.status === 'Paid' ? 'green' : 'grey'}>{l.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>

        <div className="mt-3 space-y-3">
          <CommentSection trainerId={t.id} />
          <ActivityLog trainerId={t.id} />
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

function InfoCell({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
      <div className="text-[10px] uppercase tracking-[0.10em] font-bold muted mb-1">{label}</div>
      <div className="text-[13px] font-medium" style={{ color: 'var(--brand-text)' }}>{value || <span className="muted">—</span>}</div>
    </div>
  );
}
