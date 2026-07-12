import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { todayISO, stageLabel, waLink } from '@/lib/utils';
import { HandMetal, MessageCircle, Play, Wallet, ArrowRight } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { EmptyState } from '@/components/EmptyState';

export function HoldClientsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;
  const isSalesCloser = user.role === 'sales_closer';
  const isManager = user.role === 'manager';
  const today = todayISO();

  // For sales_closer: CP+C clients from /clients (default)
  // For manager/lead/AM: explicitly fetch Hold lifecycle (backend default excludes it)
  const needsExplicitHold = !isSalesCloser;
  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients', needsExplicitHold ? 'hold' : 'default'],
    queryFn: () =>
      api.get(needsExplicitHold ? '/clients?lifecycle=Hold' : '/clients').then((r) => r.data),
  });

  // For sales_closer: CP + C clients in SaleClosing (called/engaged, following up)
  // For other roles: standard Hold lifecycle (post-demo "need time")
  const onHold = ((clients || []) as any[]).filter((c) =>
    isSalesCloser
      ? c.lifecycle === 'SaleClosing' && ['CP', 'C'].includes(c.saleClosingSubStatus) && c.salesOwnerId === user.id
      : c.lifecycle === 'Hold'
  );

  const overdue:  any[] = [];
  const dueToday: any[] = [];
  const later:    any[] = [];
  const noDate:   any[] = [];
  for (const c of onHold) {
    if (!c.holdCheckBackOn) noDate.push(c);
    else if (c.holdCheckBackOn < today) overdue.push(c);
    else if (c.holdCheckBackOn === today) dueToday.push(c);
    else later.push(c);
  }

  const sendToSale = useMutation({
    mutationFn: (id: string) => api.post(`/clients/${id}/stage`, { lifecycle: 'SaleClosing', reason: 'Resumed from Hold — client ready' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Moved to Sale closing');
    },
    onError: () => showToast('Failed to move client', 'error'),
  });

  const moveBackToActive = useMutation({
    mutationFn: (vars: { id: string; resumeStage: string }) =>
      api.post(`/clients/${vars.id}/stage`, { lifecycle: vars.resumeStage || 'Active', reason: 'Payment issue resolved — moved back from Hold' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Moved back to Active');
    },
    onError: () => showToast('Failed to move client back to Active', 'error'),
  });

  const markDormant = useMutation({
    mutationFn: (id: string) => api.post(`/clients/${id}/stage`, { lifecycle: 'Dormant', reason: 'Did not respond after Hold check-back', dormantSince: today }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Marked dormant');
    },
    onError: () => showToast('Failed to mark dormant', 'error'),
  });

  function row(c: any) {
    const phoneWA = c.phoneDigits ? waLink(c.phoneCode, c.phoneDigits) : '';
    const sinceDays = c.holdSince ? Math.floor((+new Date(today) - +new Date(c.holdSince)) / (1000 * 60 * 60 * 24)) : 0;
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
              {c.holdResumeFromStage && <Pill color="grey">Was: {stageLabel(c.holdResumeFromStage)}</Pill>}
              <span className="text-xs muted">· on hold {sinceDays}d</span>
              {c.holdCheckBackOn && (
                <span className={`text-xs mono ${c.holdCheckBackOn < today ? 'text-brand-red' : c.holdCheckBackOn === today ? 'text-brand-amber' : 'muted'}`}>
                  · check back: {c.holdCheckBackOn}
                  {c.holdCheckBackOn < today && ' (overdue)'}
                  {c.holdCheckBackOn === today && ' (today)'}
                </span>
              )}
            </div>
            {c.holdReason && (
              <div className="text-xs muted mt-1 italic">"{c.holdReason}"</div>
            )}
            <div className="text-xs muted mt-0.5">
              <strong>Owner:</strong> {c.salesOwner?.name || c.intakeOwner?.name || c.hostOwner?.name || '—'}
              {(c.intakeOwnerId === user.id || c.salesOwnerId === user.id || c.hostOwnerId === user.id) && <span className="text-brand-blue ml-1">(me)</span>}
            </div>
            {c.postDemoFeedbackNote && (
              <div className="text-xs muted mt-1"><strong>Samita's note:</strong> "{c.postDemoFeedbackNote}"</div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {phoneWA && (
              <a href={phoneWA} target="_blank" rel="noreferrer"
                className="btn btn-sm" style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}>
                <MessageCircle size={12}/> WA
              </a>
            )}
            {isManager ? (
              <Button size="sm" variant="success" disabled={moveBackToActive.isPending}
                onClick={() => moveBackToActive.mutate({ id: c.id, resumeStage: c.holdResumeFromStage || 'Active' })}>
                <ArrowRight size={12}/> Back to Active
              </Button>
            ) : (
              <Button size="sm" variant="success" disabled={sendToSale.isPending} onClick={() => sendToSale.mutate(c.id)}>
                <Wallet size={12}/> Client ready · close
              </Button>
            )}
            {!isSalesCloser && (
              <Button size="sm" disabled={markDormant.isPending} onClick={() => markDormant.mutate(c.id)}>
                <Play size={12}/> Mark dormant
              </Button>
            )}
            <Link to={`/clients/${c.id}`} className="btn btn-sm">Open</Link>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) return <Page><div className="muted text-sm p-6">Loading...</div></Page>;

  return (
    <>
      <Topbar
        title={isSalesCloser ? 'CP / C · Follow-ups' : 'On hold'}
        subtitle={`${onHold.length} on hold${overdue.length ? ` · ${overdue.length} overdue` : ''}${dueToday.length ? ` · ${dueToday.length} due today` : ''}`}
      />
      <Page>
        <div className="callout">
          {isSalesCloser
            ? <><strong>CP</strong> = called, went silent — follow up in 3 days and move to <strong>C</strong>. <strong>C</strong> = letter sent — follow up daily until payment or drop to <strong>DP</strong>.</>
            : isManager
            ? <>Active clients placed on hold due to payment issues. Follow up on the check-back date — if resolved, move <strong>Back to Active</strong>; if no response, mark <strong>Dormant</strong>.</>
            : <>Clients who said <strong>"need time"</strong> after their demo. Reach out on the check-back date — if ready, move to <em>Sale closing</em>; if silent, mark <em>Dormant</em>.</>}
        </div>

        {onHold.length === 0 && (
          <EmptyState
            icon={HandMetal}
            tone="green"
            title={isSalesCloser ? 'No CP / C clients' : 'Nothing on hold'}
            description={isSalesCloser ? 'No clients in CP or C stage right now.' : isManager ? 'All active clients are paying — nothing on hold right now.' : 'All post-demo clients have a decision — either they\'re moving forward or marked Churned.'}
          />
        )}

        {overdue.length > 0 && (
          <div className="card mb-3" style={{ borderLeft: '3px solid var(--status-red)' }}>
            <div className="card-h" style={{ color: 'var(--status-red)' }}>
              <span className="flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--status-red)', boxShadow: '0 0 8px var(--status-red)' }}/>
                Overdue · follow up now
              </span>
              <Pill color="red">{overdue.length}</Pill>
            </div>
            <div className="space-y-2">{overdue.map(row)}</div>
          </div>
        )}

        {dueToday.length > 0 && (
          <div className="card mb-3" style={{ borderColor: '#F59E0B' }}>
            <div className="card-h" style={{ color: '#F59E0B' }}>
              <span>Due today</span>
              <Pill color="amber">{dueToday.length}</Pill>
            </div>
            <div className="space-y-2">{dueToday.map(row)}</div>
          </div>
        )}

        {later.length > 0 && (
          <div className="card mb-3">
            <div className="card-h"><span>Coming up</span><Pill>{later.length}</Pill></div>
            <div className="space-y-2">{later.map(row)}</div>
          </div>
        )}

        {noDate.length > 0 && (
          <div className="card">
            <div className="card-h"><span>No check-back date</span><Pill color="amber">{noDate.length}</Pill></div>
            <div className="space-y-2">{noDate.map(row)}</div>
          </div>
        )}
      </Page>
    </>
  );
}
