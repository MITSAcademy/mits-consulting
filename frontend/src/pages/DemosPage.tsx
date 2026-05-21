import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/ui/pill';
import { todayISO, addDays, formatPhone, waLink } from '@/lib/utils';
import { Check, Calendar, MessageCircle } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useState } from 'react';

function dateBucket(date: string | null, today: string) {
  if (!date) return 'unscheduled';
  if (date < today) return 'overdue';
  if (date === today) return 'today';
  if (date === addDays(today, 1)) return 'tomorrow';
  const week = addDays(today, 7);
  if (date <= week) return 'thisweek';
  return 'later';
}

const BUCKETS: Array<{ key: string; label: string; color: 'amber' | 'red' | 'blue' | 'grey' }> = [
  { key: 'overdue',     label: 'Overdue · run them now or reschedule', color: 'red' },
  { key: 'today',       label: 'Today',         color: 'amber' },
  { key: 'tomorrow',    label: 'Tomorrow',      color: 'amber' },
  { key: 'thisweek',    label: 'This week',     color: 'blue' },
  { key: 'later',       label: 'Later',         color: 'grey' },
  { key: 'unscheduled', label: 'Missing date/time · fix on client page', color: 'red' },
];

export function DemosPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;
  const today = todayISO();
  const [mineOnly, setMineOnly] = useState(['demo_intake'].includes(user.role));

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data),
  });

  const all = (clients || []) as any[];
  const scheduled = all.filter((c) => c.lifecycle === 'DemoScheduled');
  const visible = mineOnly ? scheduled.filter((c) => c.intakeOwnerId === user.id) : scheduled;
  const recent = all.filter((c) => ['DemoDone', 'SaleClosing', 'SaleWon', 'Active'].includes(c.lifecycle)).slice(0, 10);

  const grouped: Record<string, any[]> = {};
  BUCKETS.forEach((b) => (grouped[b.key] = []));
  visible.forEach((c) => {
    const k = dateBucket(c.demoDate, today);
    (grouped[k] ||= []).push(c);
  });
  Object.values(grouped).forEach((arr) => arr.sort((a, b) =>
    (a.demoDate || '').localeCompare(b.demoDate || '') ||
    (a.demoTimeIst || '').localeCompare(b.demoTimeIst || '')
  ));

  const markDone = useMutation({
    mutationFn: (id: string) => api.post(`/clients/${id}/stage`, { lifecycle: 'DemoDone' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Demo done → moved to sale closing queue');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <>
      <Topbar
        title="Demo schedule"
        subtitle={`${visible.length} scheduled${mineOnly ? ' · mine' : ''}`}
        actions={
          <div className="flex gap-1.5">
            <Button size="sm" variant={mineOnly ? 'primary' : 'default'} onClick={() => setMineOnly(true)}>Mine</Button>
            <Button size="sm" variant={!mineOnly ? 'primary' : 'default'} onClick={() => setMineOnly(false)}>All Team 2</Button>
          </div>
        }
      />
      <Page>
        <div className="callout">
          Demos grouped by date. Use the inline buttons to <strong>open the client's WhatsApp group</strong>,
          <strong> message the trainer</strong>, or <strong>mark done</strong> after the call.
        </div>

        {BUCKETS.map((b) => {
          const items = grouped[b.key] || [];
          if (items.length === 0) return null;
          return (
            <div key={b.key} className="card mb-3">
              <div className="card-h">
                <span>{b.label}</span>
                <Pill color={b.color}>{items.length}</Pill>
              </div>
              <div className="space-y-2">
                {items.map((c: any) => {
                  const trainer = c.primaryTrainer;
                  const groupUrl = c.whatsappGroupLink;
                  const clientPhoneUrl = c.phoneDigits ? waLink(c.phoneCode, c.phoneDigits) : '';
                  const trainerPhoneUrl = trainer?.phoneDigits ? waLink(trainer.phoneCode, trainer.phoneDigits) : '';
                  const skill = (c.intakeData as any)?.detailed_skill_set || c.intakeSkillHint || '';
                  return (
                    <div key={c.id} className="bg-bg-input rounded p-3">
                      <div className="flex justify-between items-start gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link to={`/clients/${c.id}`} className="font-semibold text-sm hover:underline">{c.name}</Link>
                            {c.demoDate ? (
                              <span className="mono text-xs text-brand-amber">
                                <Calendar size={11} className="inline mr-1"/>
                                {c.demoDate}{c.demoTimeIst ? ` · ${c.demoTimeIst} IST` : ''}
                              </span>
                            ) : (
                              <span className="text-xs text-brand-red">no date/time saved</span>
                            )}
                            {c.engagementType !== 'Support' && <Pill color={c.engagementType === 'Training' ? 'purple' : 'pink'}>{c.engagementType}</Pill>}
                          </div>
                          <div className="muted text-xs mt-1"><strong>Skills:</strong> {skill || '—'}</div>
                          <div className="muted text-xs mt-0.5">
                            <strong>Trainer:</strong>{' '}
                            {trainer ? (
                              <>
                                {trainer.name} · ₹{c.engagementTrainerRateInr}
                                {trainer.phoneDigits && <> · <span className="mono">{formatPhone(trainer.phoneCode, trainer.phoneDigits)}</span></>}
                              </>
                            ) : <span className="text-brand-red">none assigned</span>}
                          </div>
                          {c.whatsappGroupName && (
                            <div className="muted text-[11px] mt-0.5"><strong>Group:</strong> {c.whatsappGroupName}</div>
                          )}
                          <div className="muted text-[11px] mt-0.5">
                            <strong>Owner:</strong> {c.intakeOwner?.name || '—'}
                            {c.intakeOwnerId === user.id && <span className="text-brand-blue ml-1">(me)</span>}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {groupUrl && (
                            <a href={groupUrl} target="_blank" rel="noreferrer"
                              className="btn btn-sm" style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}>
                              <MessageCircle size={12}/> Group
                            </a>
                          )}
                          {trainerPhoneUrl && (
                            <a href={trainerPhoneUrl} target="_blank" rel="noreferrer"
                              className="btn btn-sm" style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}>
                              <MessageCircle size={12}/> WA trainer
                            </a>
                          )}
                          {clientPhoneUrl && !groupUrl && (
                            <a href={clientPhoneUrl} target="_blank" rel="noreferrer" className="btn btn-sm">
                              <MessageCircle size={12}/> WA client
                            </a>
                          )}
                          <Link to={`/clients/${c.id}`} className="btn btn-sm">Open / Reschedule</Link>
                          <Button size="sm" variant="success" onClick={() => markDone.mutate(c.id)}>
                            <Check size={12}/> Demo done
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {visible.length === 0 && (
          <div className="text-center py-12 muted">
            <div className="text-base font-semibold text-brand-text mb-1">
              {mineOnly ? 'No demos assigned to you' : 'No demos scheduled'}
            </div>
            <div>Once Team 2 picks a trainer for a client, "Schedule demo" appears on the client page.</div>
          </div>
        )}

        <div className="divider">Recently completed · last {recent.length}</div>
        <div className="table-card">
          <table>
            <thead>
              <tr><th>Client</th><th>Stage</th><th>Trainer</th></tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr><td colSpan={3} className="muted text-center py-6">None yet.</td></tr>
              ) : recent.map((c: any) => (
                <tr key={c.id} className="clickable">
                  <td><Link to={`/clients/${c.id}`} className="font-medium">{c.name}</Link></td>
                  <td><Pill color={c.lifecycle === 'Active' ? 'green' : 'blue'}>{c.lifecycle}</Pill></td>
                  <td>{c.primaryTrainer?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
