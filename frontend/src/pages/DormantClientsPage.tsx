import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { todayISO, stageLabel, formatPhone, waLink } from '@/lib/utils';
import { Moon, MessageCircle, Play } from 'lucide-react';
import { useAuth } from '@/store/auth';

export function DormantClientsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;
  const today = todayISO();

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data),
  });

  const dormant = ((clients || []) as any[]).filter((c) => c.lifecycle === 'Dormant');

  // Bucket: Overdue check-back / Due this week / Later / No check-back date
  const overdue:    any[] = [];
  const thisWeek:   any[] = [];
  const later:      any[] = [];
  const noDate:     any[] = [];
  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const weekISO = weekFromNow.toISOString().slice(0, 10);
  for (const c of dormant) {
    if (!c.dormantCheckBackOn) noDate.push(c);
    else if (c.dormantCheckBackOn <= today) overdue.push(c);
    else if (c.dormantCheckBackOn <= weekISO) thisWeek.push(c);
    else later.push(c);
  }

  const resumePartial = useMutation({
    mutationFn: ({ id, lifecycle }: any) => api.post(`/clients/${id}/stage`, { lifecycle, reason: 'Resumed from dormant via list' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Resumed');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  function row(c: any) {
    const phoneWA = c.phoneDigits ? waLink(c.phoneCode, c.phoneDigits) : '';
    const sinceDays = c.dormantSince ? Math.floor((+new Date(today) - +new Date(c.dormantSince)) / (1000 * 60 * 60 * 24)) : 0;
    return (
      <div key={c.id} className="bg-bg-input rounded p-3">
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link to={`/clients/${c.id}`} className="font-semibold text-sm hover:underline">{c.name}</Link>
              <Pill>Was: {stageLabel(c.dormantResumeFromStage || c.lifecycle)}</Pill>
              <span className="text-xs muted">· dormant {sinceDays}d</span>
              {c.dormantCheckBackOn && (
                <span className={`text-xs mono ${c.dormantCheckBackOn <= today ? 'text-brand-red' : 'text-brand-amber'}`}>
                  · check back: {c.dormantCheckBackOn}
                  {c.dormantCheckBackOn <= today && ' (overdue)'}
                </span>
              )}
            </div>
            {c.dormantReason && (
              <div className="text-xs muted mt-1 italic">"{c.dormantReason}"</div>
            )}
            <div className="text-xs muted mt-0.5">
              <strong>Owner:</strong> {c.intakeOwner?.name || c.salesOwner?.name || c.hostOwner?.name || '—'}
              {(c.intakeOwnerId === user.id || c.salesOwnerId === user.id || c.hostOwnerId === user.id) && <span className="text-brand-blue ml-1">(me)</span>}
              {' · '}
              <strong>Skills:</strong> {(c.intakeData as any)?.detailed_skill_set || c.intakeSkillHint || '—'}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {c.whatsappGroupLink && (
              <a href={c.whatsappGroupLink} target="_blank" rel="noreferrer"
                className="btn btn-sm" style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}>
                <MessageCircle size={12}/> Group
              </a>
            )}
            {phoneWA && (
              <a href={phoneWA} target="_blank" rel="noreferrer"
                className="btn btn-sm" style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}>
                <MessageCircle size={12}/> WA
              </a>
            )}
            <Button size="sm" variant="success" onClick={() => resumePartial.mutate({ id: c.id, lifecycle: c.dormantResumeFromStage || 'IntakeReceived' })}>
              <Play size={12}/> Resume
            </Button>
            <Link to={`/clients/${c.id}`} className="btn btn-sm">Open</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Topbar
        title="Dormant clients"
        subtitle={`${dormant.length} dormant${overdue.length ? ` · ${overdue.length} overdue check-back` : ''}`}
      />
      <Page>
        <div className="callout">
          Clients who stopped responding. Different from <em>Hold</em> (will resume) and <em>Churned</em> (lost).
          Each has a <strong>check-back date</strong> — reach out then to revive or move to Churned.
        </div>

        {dormant.length === 0 && (
          <div className="text-center py-12 muted">
            <Moon size={32} className="inline-block mb-2 opacity-50"/>
            <div className="text-base font-semibold text-brand-text mb-1">All clients are responding ✓</div>
            <div>No-one's gone silent. Things are good.</div>
          </div>
        )}

        {overdue.length > 0 && (
          <div className="card mb-3" style={{ borderColor: '#EF4444' }}>
            <div className="card-h" style={{ color: '#EF4444' }}>
              <span>Overdue check-back · reach out now</span>
              <Pill color="red">{overdue.length}</Pill>
            </div>
            <div className="space-y-2">{overdue.map(row)}</div>
          </div>
        )}

        {thisWeek.length > 0 && (
          <div className="card mb-3">
            <div className="card-h"><span>Due this week</span><Pill color="amber">{thisWeek.length}</Pill></div>
            <div className="space-y-2">{thisWeek.map(row)}</div>
          </div>
        )}

        {later.length > 0 && (
          <div className="card mb-3">
            <div className="card-h"><span>Later</span><Pill>{later.length}</Pill></div>
            <div className="space-y-2">{later.map(row)}</div>
          </div>
        )}

        {noDate.length > 0 && (
          <div className="card">
            <div className="card-h"><span>No check-back date — set one</span><Pill color="amber">{noDate.length}</Pill></div>
            <div className="space-y-2">{noDate.map(row)}</div>
          </div>
        )}
      </Page>
    </>
  );
}
