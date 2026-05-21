import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { todayISO, stageLabel, waLink } from '@/lib/utils';
import { HandMetal, MessageCircle, Play, Wallet } from 'lucide-react';
import { useAuth } from '@/store/auth';

/**
 * Hold clients = post-demo, client said "need time to decide".
 * Each has a 3-day check-back date for Roshni to follow up.
 */
export function HoldClientsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;
  const today = todayISO();

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data),
  });

  const onHold = ((clients || []) as any[]).filter((c) => c.lifecycle === 'Hold');

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
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const markDormant = useMutation({
    mutationFn: (id: string) => api.post(`/clients/${id}/stage`, { lifecycle: 'Dormant', reason: 'Did not respond after Hold check-back', dormantSince: today }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Marked dormant');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  function row(c: any) {
    const phoneWA = c.phoneDigits ? waLink(c.phoneCode, c.phoneDigits) : '';
    const sinceDays = c.holdSince ? Math.floor((+new Date(today) - +new Date(c.holdSince)) / (1000 * 60 * 60 * 24)) : 0;
    return (
      <div key={c.id} className="bg-bg-input rounded p-3">
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link to={`/clients/${c.id}`} className="font-semibold text-sm hover:underline">{c.name}</Link>
              {c.holdResumeFromStage && <Pill>Was: {stageLabel(c.holdResumeFromStage)}</Pill>}
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
            <Button size="sm" variant="success" onClick={() => sendToSale.mutate(c.id)}>
              <Wallet size={12}/> Client ready · close
            </Button>
            <Button size="sm" onClick={() => markDormant.mutate(c.id)}>
              <Play size={12}/> Mark dormant
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
        title="Hold · post-demo follow-ups"
        subtitle={`${onHold.length} on hold${overdue.length ? ` · ${overdue.length} overdue` : ''}${dueToday.length ? ` · ${dueToday.length} due today` : ''}`}
      />
      <Page>
        <div className="callout">
          Clients who said <strong>"need time"</strong> after their demo. Default 3-day check-back is set when Samita records "Need time" feedback.
          Reach out on the check-back date — if ready, move to <em>Sale closing</em>; if silent, mark <em>Dormant</em>.
        </div>

        {onHold.length === 0 && (
          <div className="text-center py-12 muted">
            <HandMetal size={32} className="inline-block mb-2 opacity-50"/>
            <div className="text-base font-semibold text-brand-text mb-1">Nothing on hold ✓</div>
            <div>All post-demo clients have a decision.</div>
          </div>
        )}

        {overdue.length > 0 && (
          <div className="card mb-3" style={{ borderColor: '#EF4444' }}>
            <div className="card-h" style={{ color: '#EF4444' }}>
              <span>Overdue · follow up now</span>
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
