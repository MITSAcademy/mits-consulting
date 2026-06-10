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
import { Plus } from 'lucide-react';

// WithRecruiters is intentionally excluded — once a client moves there,
// the work belongs to Aman/Kanchan (Team 1). Anjali/Taran see a count-only
// indicator but not the full column, to avoid confusion over ownership.
const STAGES = [
  { key: 'Lead', label: 'New leads' },
  { key: 'IntakeSent', label: 'Intake sent' },
  { key: 'IntakeReceived', label: 'Intake done' },
  { key: 'InternalSearch', label: 'Internal search' },
  { key: 'VerificationPending', label: 'Verify proposal' },
  { key: 'TrainerMatched', label: 'Trainer matched' },
  { key: 'DemoScheduled', label: 'Demo scheduled' },
  { key: 'DemoDone', label: 'Demo done' },
  { key: 'FeedbackPending', label: 'Feedback (Samita)' },
];

export function DemoIntakePage() {
  const user = useAuth((s) => s.user)!;
  const [openNew, setOpenNew] = useState(false);
  // Default to Mine for demo_intake (Anjali/Taran). Samita/founder/manager default to All.
  const [mineOnly, setMineOnly] = useState(user.role === 'demo_intake');

  const { data } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data),
  });

  const all = (data || []) as any[];
  const filtered = mineOnly ? all.filter((c) => c.intakeOwnerId === user.id) : all;
  const grouped: Record<string, any[]> = {};
  STAGES.forEach((s) => (grouped[s.key] = filtered.filter((c: any) => c.lifecycle === s.key)));
  // WithRecruiters count — shown as an info badge in the subtitle, not as a kanban column
  const withRecruitersCount = filtered.filter((c: any) => c.lifecycle === 'WithRecruiters').length;

  return (
    <>
      <Topbar
        title="Demo intake"
        subtitle={`${mineOnly ? `Mine · ${filtered.length} clients` : `All Team 2 · ${filtered.length} of ${all.length}`}${withRecruitersCount > 0 ? ` · ${withRecruitersCount} with recruiters (Team 1)` : ''}`}
        actions={
          <>
            <div className="flex gap-1.5">
              <Button size="sm" variant={mineOnly ? 'primary' : 'default'} onClick={() => setMineOnly(true)}>Mine</Button>
              <Button size="sm" variant={!mineOnly ? 'primary' : 'default'} onClick={() => setMineOnly(false)}>All Team 2</Button>
            </div>
            <Button variant="primary" onClick={() => setOpenNew(true)}><Plus size={14}/> New lead</Button>
          </>
        }
      />
      <Page>
        <div className="callout">
          Anyone punches in a lead. Team 2 takes it through:{' '}
          <strong>send 8-point intake → capture replies → search internal trainer pool → (if no match) push to recruiters → verify proposals → conduct demo</strong>.
          Once demo is done, lead goes to Roshni for sale closing.
        </div>

        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {STAGES.map((s) => {
            const items = grouped[s.key];
            const isEmpty = items.length === 0;
            return (
              <div
                key={s.key}
                className="rounded-xl p-3 min-h-[260px] transition-all"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--brand-border)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div className="flex justify-between items-center mb-2.5 pb-2" style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--brand-textSecondary)' }}>
                    {s.label}
                  </span>
                  <Pill color={stageColor(s.key) as any}>{items.length}</Pill>
                </div>
                {isEmpty && <div className="text-[10.5px] muted text-center py-4 italic">Empty</div>}
                {items.map((c: any) => {
                  const skill = (c.intakeData as any)?.detailed_skill_set || c.intakeSkillHint || c.engagementType;
                  return (
                    <Link
                      key={c.id}
                      to={`/clients/${c.id}`}
                      className="block rounded-lg p-2 mb-1.5 transition-all hover-lift"
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--brand-borderSoft)',
                      }}
                    >
                      <div className="font-semibold text-xs mb-0.5" style={{ color: 'var(--brand-text)' }}>{c.name}</div>
                      <div className="text-[10px] muted mono truncate" title={skill}>{skill}</div>
                      {c.intakeOwner && (
                        <div className="text-[10px] mt-1 font-medium" style={{ color: 'var(--status-blue)' }}>{c.intakeOwner.name}</div>
                      )}
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
