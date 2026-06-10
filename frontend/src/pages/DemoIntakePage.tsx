import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/ui/pill';
import { stageColor } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useState } from 'react';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { Plus, ChevronDown, ChevronUp, CheckCircle2, XCircle, CircleDot } from 'lucide-react';

// readOnly = true means cards are visible but not clickable (another team owns that stage)
const TEAM2_STAGES = [
  { key: 'Lead',               label: 'New leads',          readOnly: false },
  { key: 'IntakeSent',         label: 'Intake sent',        readOnly: false },
  { key: 'IntakeReceived',     label: 'Intake done',        readOnly: false },
  { key: 'InternalSearch',     label: 'Internal search',    readOnly: false },
  { key: 'WithRecruiters',     label: 'With recruiters',    readOnly: true  }, // Team 1 owns this
  { key: 'VerificationPending',label: 'Verify proposal',    readOnly: false },
  { key: 'TrainerMatched',     label: 'Trainer matched',    readOnly: false },
  { key: 'DemoScheduled',      label: 'Demo scheduled',     readOnly: false },
  { key: 'DemoDone',           label: 'Demo done',          readOnly: false },
  { key: 'FeedbackPending',    label: 'Feedback (Samita)',  readOnly: false },
];

// Aman/Kanchan see the full pipeline but can only open cards in their own stages
const TEAM1_STAGES = [
  { key: 'Lead',               label: 'New leads',          readOnly: true  },
  { key: 'IntakeSent',         label: 'Intake sent',        readOnly: true  },
  { key: 'IntakeReceived',     label: 'Intake done',        readOnly: true  },
  { key: 'InternalSearch',     label: 'Internal search',    readOnly: true  },
  { key: 'WithRecruiters',     label: 'With recruiters',    readOnly: false }, // Team 1 owns this
  { key: 'VerificationPending',label: 'Verify proposal',    readOnly: false }, // Team 1 owns this
  { key: 'TrainerMatched',     label: 'Trainer matched',    readOnly: true  },
  { key: 'DemoScheduled',      label: 'Demo scheduled',     readOnly: true  },
  { key: 'DemoDone',           label: 'Demo done',          readOnly: true  },
  { key: 'FeedbackPending',    label: 'Feedback (Samita)',  readOnly: true  },
];

function DemoFeedbackPanel({ demos }: { demos: any[] }) {
  const [open, setOpen] = useState(false);
  if (!demos || demos.length === 0) return null;
  return (
    <div className="mt-1.5" style={{ borderTop: '1px solid var(--brand-borderSoft)' }}>
      <button
        className="flex items-center gap-1 w-full pt-1.5 text-[10px] font-semibold"
        style={{ color: 'var(--brand-textSecondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0 2px' }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
      >
        {open ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
        {demos.length} demo{demos.length > 1 ? 's' : ''} done
      </button>
      {open && (
        <div className="space-y-1.5 mt-1">
          {demos.map((d: any) => {
            const outcomeColor = d.outcome === 'Positive'
              ? 'var(--status-green)' : d.outcome === 'Negative'
              ? 'var(--status-red)' : 'var(--status-amber)';
            return (
              <div key={d.id} className="rounded-lg p-2 text-[10px]" style={{ background: 'var(--bg-base)', border: '1px solid var(--brand-borderSoft)' }}>
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <CheckCircle2 size={11} style={{ color: 'var(--status-green)', flexShrink: 0 }} />
                  <span className="font-semibold" style={{ color: 'var(--brand-text)' }}>{d.trainer?.name || 'Unknown trainer'}</span>
                  {d.outcome && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" style={{ background: outcomeColor + '22', color: outcomeColor }}>
                      {d.outcome}
                    </span>
                  )}
                  {d.actualDate && <span className="muted">{d.actualDate}</span>}
                </div>
                {d.trainer?.skills && (
                  <div className="muted truncate mb-0.5">{d.trainer.skills.split(',').slice(0, 3).join(', ')}</div>
                )}
                {d.feedback && (
                  <div className="mt-0.5" style={{ color: 'var(--brand-textSecondary)' }}>
                    <span className="font-semibold">Feedback: </span>{d.feedback}
                  </div>
                )}
                {d.nextSteps && (
                  <div className="mt-0.5 muted">
                    <span className="font-semibold">Next: </span>{d.nextSteps}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DemoIntakePage() {
  const user = useAuth((s) => s.user)!;
  const [openNew, setOpenNew] = useState(false);

  const isRecruiter = user.role === 'recruiter';
  const STAGES = isRecruiter ? TEAM1_STAGES : TEAM2_STAGES;

  // Default to Mine for demo_intake (Anjali/Taran) and recruiter (Aman/Kanchan).
  // Samita/founder/manager default to All.
  const [mineOnly, setMineOnly] = useState(user.role === 'demo_intake' || isRecruiter);

  const { data } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data),
  });

  const all = (data || []) as any[];
  // For recruiters "mine" means clients where sentToId matches — fall back to intakeOwnerId for Team 2
  const filtered = mineOnly
    ? isRecruiter
      ? all // recruiters see all WithRecruiters regardless — they don't have intakeOwnerId
      : all.filter((c: any) => c.intakeOwnerId === user.id)
    : all;

  const grouped: Record<string, any[]> = {};
  STAGES.forEach((s) => (grouped[s.key] = filtered.filter((c: any) => c.lifecycle === s.key)));

  const title = isRecruiter ? 'Pipeline view' : 'Demo intake';
  const subtitle = isRecruiter
    ? `${grouped['WithRecruiters'].length} with recruiters · ${grouped['VerificationPending'].length} verify proposal`
    : mineOnly ? `Mine · ${filtered.length} clients` : `All Team 2 · ${filtered.length} of ${all.length}`;

  return (
    <>
      <Topbar
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {!isRecruiter && (
              <div className="flex gap-1.5">
                <Button size="sm" variant={mineOnly ? 'primary' : 'default'} onClick={() => setMineOnly(true)}>Mine</Button>
                <Button size="sm" variant={!mineOnly ? 'primary' : 'default'} onClick={() => setMineOnly(false)}>All Team 2</Button>
              </div>
            )}
            {!isRecruiter && <Button variant="primary" onClick={() => setOpenNew(true)}><Plus size={14}/> New lead</Button>}
          </>
        }
      />
      <Page>
        {!isRecruiter && (
          <div className="callout">
            Anyone punches in a lead. Team 2 takes it through:{' '}
            <strong>send 8-point intake → capture replies → search internal trainer pool → (if no match) push to recruiters → verify proposals → conduct demo</strong>.
            Once demo is done, lead goes to Roshni for sale closing.
          </div>
        )}
        {isRecruiter && (
          <div className="callout">
            Your active stages: <strong>With recruiters</strong> (find & propose trainer) → <strong>Verify proposal</strong> (Anjali/Taran verify after you notify). All other stages are view-only.
          </div>
        )}

        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {STAGES.map((s) => {
            const items = grouped[s.key];
            const isEmpty = items.length === 0;
            return (
              <div
                key={s.key}
                className="rounded-xl p-3 min-h-[260px] transition-all"
                style={{
                  background: s.readOnly ? 'var(--bg-input)' : 'var(--bg-card)',
                  border: `1px solid ${s.readOnly ? 'var(--brand-borderSoft)' : 'var(--brand-border)'}`,
                  boxShadow: s.readOnly ? 'none' : 'var(--shadow-sm)',
                  opacity: s.readOnly ? 0.75 : 1,
                }}
              >
                <div className="flex justify-between items-center mb-2.5 pb-2" style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: s.readOnly ? 'var(--brand-textMuted)' : 'var(--brand-textSecondary)' }}>
                    {s.label}
                    {s.readOnly && <span className="ml-1 normal-case font-normal" style={{ color: 'var(--brand-textMuted)' }}>· {isRecruiter ? 'Team 2' : 'Team 1'}</span>}
                  </span>
                  <Pill color={stageColor(s.key) as any}>{items.length}</Pill>
                </div>
                {isEmpty && <div className="text-[10.5px] muted text-center py-4 italic">Empty</div>}
                {items.map((c: any) => {
                  const skill = (c.intakeData as any)?.detailed_skill_set || c.intakeSkillHint || c.engagementType;
                  // For WithRecruiters, show the assigned recruiter (Aman/Kanchan) not the intake owner
                  const assignedRecruiter = c.sourcingRequests?.[0]?.sentTo?.name;
                  const ownerName = s.key === 'WithRecruiters'
                    ? (assignedRecruiter || 'Unassigned')
                    : c.intakeOwner?.name;
                  const ownerColor = s.key === 'WithRecruiters'
                    ? (assignedRecruiter ? 'var(--status-green)' : 'var(--status-amber)')
                    : s.readOnly ? 'var(--brand-textMuted)' : 'var(--status-blue)';

                  const cardContent = (
                    <>
                      <div className="font-semibold text-xs mb-0.5" style={{ color: 'var(--brand-text)' }}>{c.name}</div>
                      <div className="text-[10px] muted mono truncate" title={skill}>{skill}</div>
                      {ownerName && (
                        <div className="text-[10px] mt-1 font-medium" style={{ color: ownerColor }}>{ownerName}</div>
                      )}
                      {isRecruiter && c.demos?.length > 0 && (
                        <DemoFeedbackPanel demos={c.demos} />
                      )}
                    </>
                  );

                  return s.readOnly ? (
                    <div
                      key={c.id}
                      className="block rounded-lg p-2 mb-1.5"
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--brand-borderSoft)',
                        cursor: 'default',
                      }}
                      title={`Managed by ${isRecruiter ? 'Team 2 (Anjali/Taran)' : 'Team 1 (Aman/Kanchan)'} — view only`}
                    >
                      {cardContent}
                    </div>
                  ) : (
                    <Link
                      key={c.id}
                      to={`/clients/${c.id}`}
                      className="block rounded-lg p-2 mb-1.5 transition-all hover-lift"
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--brand-borderSoft)',
                      }}
                    >
                      {cardContent}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>

        {openNew && <NewLeadModal onClose={() => setOpenNew(false)} />}
      </Page>
    </>
  );
}

function NewLeadModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data: sources } = useQuery({ queryKey: ['sources'], queryFn: () => api.get('/sources').then((r) => r.data) });
  const [f, setF] = useState({
    name: '',
    whatsappGroupName: '',
    whatsappGroupLink: '',
    phoneCode: '+1',
    phoneDigits: '',
    engagementType: 'Support',
    source: '',
    funderType: 'Self',
    intakeSkillHint: '',
    notes: '',
  });

  const create = useMutation({
    mutationFn: () => api.post('/clients', { ...f, lifecycle: 'Lead', currency: 'USD' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Lead saved');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const ok = f.name && (f.whatsappGroupName || f.phoneDigits);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="New lead" description="Captures a new prospect. Team 2 (Anjali/Taran) will pick it up for intake.">
        <div className="form-row">
          <Label>Name</Label>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </div>
        <div className="form-row">
          <Label>WhatsApp group name <span className="text-brand-textMuted normal-case ml-1">(group OR phone required)</span></Label>
          <Input value={f.whatsappGroupName} onChange={(e) => setF({ ...f, whatsappGroupName: e.target.value })} placeholder="e.g. Acme - Salesforce - MITS" />
        </div>
        <div className="form-row">
          <Label>WhatsApp group invite link <span className="text-brand-textMuted normal-case ml-1">(optional)</span></Label>
          <Input value={f.whatsappGroupLink} onChange={(e) => setF({ ...f, whatsappGroupLink: e.target.value })} placeholder="https://chat.whatsapp.com/..." />
        </div>
        <div className="form-row">
          <Label>Direct phone <span className="text-brand-textMuted normal-case ml-1">(backup)</span></Label>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <Select value={f.phoneCode} onChange={(e) => setF({ ...f, phoneCode: e.target.value })}>
              <option>+1</option><option>+91</option><option>+44</option><option>+61</option><option>+971</option><option>+65</option>
            </Select>
            <Input value={f.phoneDigits} onChange={(e) => setF({ ...f, phoneDigits: e.target.value.replace(/\D/g, '') })} placeholder="10 digits" />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-2.5">
          <div className="form-row"><Label>Engagement</Label>
            <Select value={f.engagementType} onChange={(e) => setF({ ...f, engagementType: e.target.value })}>
              <option>Support</option><option>Training</option><option>TaskBased</option>
            </Select>
          </div>
          <div className="form-row"><Label>Source</Label>
            <Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
              <option value="">— select —</option>
              {(sources || []).map((s: any) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </Select>
          </div>
          <div className="form-row"><Label>Funder</Label>
            <Select value={f.funderType} onChange={(e) => setF({ ...f, funderType: e.target.value })}>
              <option value="Self">Self</option>
              <option value="Partner">Partner (B2B)</option>
            </Select>
          </div>
          <div className="form-row"><Label>Initial skill hint</Label>
            <Input value={f.intakeSkillHint} onChange={(e) => setF({ ...f, intakeSkillHint: e.target.value })} placeholder="Skills the lead mentioned" />
          </div>
        </div>
        <div className="form-row">
          <Label>Notes for intake team</Label>
          <Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok || create.isPending} onClick={() => create.mutate()}>Save lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
