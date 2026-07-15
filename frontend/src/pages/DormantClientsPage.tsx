import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/EmptyState';
import { useUI } from '@/store/ui';
import { todayISO, stageLabel, formatPhone, waLink } from '@/lib/utils';
import { Moon, MessageCircle, Play } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export function DormantClientsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;
  const isSalesCloser = user.role === 'sales_closer';
  const today = todayISO();
  const [resumeConfirm, setResumeConfirm] = useState<{ id: string; lifecycle: string } | null>(null);
  const [q, setQ] = useState('');

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data),
  });

  // For sales_closer: DP (dropped) clients in SaleClosing pipeline
  // For other roles: standard Dormant lifecycle
  const allDormant = ((clients || []) as any[]).filter((c) =>
    user.role === 'sales_closer'
      ? c.lifecycle === 'SaleClosing' && c.saleClosingSubStatus === 'DP' && c.salesOwnerId === user.id
      : c.lifecycle === 'Dormant'
  );
  const qLower = q.trim().toLowerCase();
  const dormant = qLower
    ? allDormant.filter((c) => {
        const hay = [
          c.name,
          c.email,
          c.phoneDigits,
          (c.intakeData as any)?.detailed_skill_set,
          c.intakeSkillHint,
          c.dormantReason,
          c.intakeOwner?.name,
          c.salesOwner?.name,
          c.hostOwner?.name,
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(qLower);
      })
    : allDormant;

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
    onError: () => showToast('Failed to resume client', 'error'),
  });

  if (isLoading) return <Page><div className="muted text-sm p-6">Loading...</div></Page>;

  function row(c: any) {
    const phoneWA = c.phoneDigits ? waLink(c.phoneCode, c.phoneDigits) : '';
    const sinceDays = c.dormantSince ? Math.floor((+new Date(today) - +new Date(c.dormantSince)) / (1000 * 60 * 60 * 24)) : 0;
    return (
      <div
        key={c.id}
        className="rounded-xl p-3 hover-lift"
        style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
      >
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link to={`/clients/${c.id}`} className="font-semibold text-sm hover:underline">{c.name}</Link>
              <Pill color="grey">Was: {stageLabel(c.dormantResumeFromStage || c.lifecycle)}</Pill>
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
            <Button size="sm" variant="success" disabled={resumePartial.isPending} onClick={() => setResumeConfirm({ id: c.id, lifecycle: c.dormantResumeFromStage || 'IntakeReceived' })}>
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
        title={isSalesCloser ? 'DP · Dropped clients' : 'Dormant clients'}
        subtitle={`${dormant.length} of ${allDormant.length}${overdue.length ? ` · ${overdue.length} overdue check-back` : ''}`}
        actions={
          <Input
            placeholder="Search name / phone / email / skill / owner / reason…"
            className="max-w-[340px]"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        }
      />
      <Page>
        <div className="callout">
          {isSalesCloser
            ? <><strong>DP</strong> = dropped — client stopped responding. They moved to DP from C/CP. If they come back, reopen to RP from their profile.</>
            : <>Clients who stopped responding. Different from <em>Hold</em> (will resume) and <em>Churned</em> (lost).</>}
          Each has a <strong>check-back date</strong> — reach out then to revive or move to Churned.
        </div>

        {dormant.length === 0 && allDormant.length === 0 && (
          <EmptyState
            icon={Moon}
            tone="green"
            title="All clients are responding"
            description="No-one's gone silent. Things are good — keep an eye on the renewals queue for what's next."
          />
        )}

        {dormant.length === 0 && allDormant.length > 0 && (
          <EmptyState
            icon={Moon}
            tone="grey"
            title={`No matches for "${q}"`}
            description="Try a shorter search term, or clear the filter to see every dormant client."
          />
        )}

        {overdue.length > 0 && (
          <div className="card mb-3" style={{ borderLeft: '3px solid var(--status-red)' }}>
            <div className="card-h" style={{ color: 'var(--status-red)' }}>
              <span className="flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--status-red)', boxShadow: '0 0 8px var(--status-red)' }}/>
                Overdue check-back · reach out now
              </span>
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
      <ConfirmDialog
        open={!!resumeConfirm}
        onClose={() => setResumeConfirm(null)}
        onConfirm={() => { resumePartial.mutate(resumeConfirm!); setResumeConfirm(null); }}
        title="Resume this client?"
        description={`This will move the client back into the active pipeline (${resumeConfirm?.lifecycle || 'IntakeReceived'} stage). Make sure they've confirmed re-engagement before proceeding.`}
        confirmLabel="Resume client"
        confirmVariant="success"
        loading={resumePartial.isPending}
      />
    </>
  );
}
