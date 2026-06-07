import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { Clock, Phone, MessageCircle, Check, RefreshCw } from 'lucide-react';
import { useUI } from '@/store/ui';
import { EmptyState } from '@/components/EmptyState';

interface RenewalItem {
  id: string;
  name: string;
  lifecycle: string;
  phoneCode: string | null;
  phoneDigits: string | null;
  email: string | null;
  whatsappGroupLink: string | null;
  nextRenewalDue: string | null;
  cycleAmount: number | null;
  currency: string | null;
  sessionsUsed: number | null;
  sessionsPerCycle: number | null;
  churnRisk: string | null;
  primaryTrainer?: { id: string; name: string } | null;
  salesOwner?: { id: string; name: string } | null;
  overdue: boolean;
  unscheduled: boolean;
  daysUntil: number;
}

interface RenewalsResponse {
  items: RenewalItem[];
  counts: { overdue: number; thisWeek: number; next7to14: number; unscheduled: number };
}

interface FollowUpItem {
  id: string;
  name: string;
  lifecycle: string;
  phoneCode: string | null;
  phoneDigits: string | null;
  email: string | null;
  whatsappGroupLink: string | null;
  saleClosingSubStatus: 'RP' | 'CP' | 'C' | null;
  roshniNextCallOn: string | null;
  roshniLastContactAt: string | null;
  roshniLastContactOutcome: string | null;
  salesOwner?: { id: string; name: string } | null;
  bucket: 'triage' | 'overdue' | 'today' | 'upcoming' | 'unscheduled';
  daysOverdue: number;
  cycleAmount?: number | null;
  currency?: string | null;
  saleClosingSubStatusAt?: string | null;
}

interface FollowUpsResponse {
  items: FollowUpItem[];
  counts: { triage: number; overdue: number; today: number; upcoming: number; unscheduled: number };
}

export function RoshniFollowUpsPage() {
  const { data } = useQuery<FollowUpsResponse>({
    queryKey: ['roshni-follow-ups'],
    queryFn: () => api.get('/clients/roshni/follow-ups').then((r) => r.data),
  });
  const { data: renewals } = useQuery<RenewalsResponse>({
    queryKey: ['roshni-renewals-approaching'],
    queryFn: () => api.get('/clients/roshni/renewals-approaching').then((r) => r.data),
  });

  const items = data?.items || [];
  const triage = items.filter((i) => i.bucket === 'triage');
  const overdue = items.filter((i) => i.bucket === 'overdue');
  const today = items.filter((i) => i.bucket === 'today');
  const upcoming = items.filter((i) => i.bucket === 'upcoming');
  const unscheduled = items.filter((i) => i.bucket === 'unscheduled');
  const renewalItems = renewals?.items || [];
  const renewalOverdue = renewalItems.filter((r) => r.overdue && !r.unscheduled);
  const renewalThisWeek = renewalItems.filter((r) => !r.overdue && !r.unscheduled && r.daysUntil <= 7);
  const renewalNext7to14 = renewalItems.filter((r) => !r.overdue && !r.unscheduled && r.daysUntil > 7 && r.daysUntil <= 14);
  const renewalUnscheduled = renewalItems.filter((r) => r.unscheduled);

  return (
    <>
      <Topbar
        title="My follow-ups"
        subtitle={`${items.length} client${items.length === 1 ? '' : 's'} · ${overdue.length} overdue · ${today.length} due today`}
      />
      <Page>
        <div className="callout mb-3">
          <Clock size={14} className="inline mr-1"/>
          New clients land at <strong>RP</strong> (Ready for Payment). Your job: call them and move to <strong>CP</strong> (silent), <strong>C</strong> (lost), <strong>JBT</strong> (employer pays later), or <strong>Training</strong> (paid). C / JBT / Training drop out of this queue.
        </div>

        {triage.length > 0 && (
          <Section title={`Needs status — unclassified · ${triage.length}`} tone="amber">
            {triage.map((c) => <Row key={c.id} c={c}/>)}
          </Section>
        )}

        {overdue.length > 0 && (
          <Section title={`Overdue · ${overdue.length}`} tone="red">
            {overdue.map((c) => <Row key={c.id} c={c}/>)}
          </Section>
        )}
        {today.length > 0 && (
          <Section title={`Due today · ${today.length}`} tone="amber">
            {today.map((c) => <Row key={c.id} c={c}/>)}
          </Section>
        )}
        {upcoming.length > 0 && (
          <Section title={`Upcoming · ${upcoming.length}`} tone="grey">
            {upcoming.map((c) => <Row key={c.id} c={c}/>)}
          </Section>
        )}
        {unscheduled.length > 0 && (
          <Section title={`No next-call date · ${unscheduled.length}`} tone="grey">
            {unscheduled.map((c) => <Row key={c.id} c={c}/>)}
          </Section>
        )}

        {/* Renewal watchlist — Active/LeverageGranted clients with renewal in next 14d */}
        {renewalItems.length > 0 && (
          <div className="mt-5">
            <div className="text-xs uppercase tracking-wider muted mb-2 flex items-center gap-2">
              <RefreshCw size={12}/> Renewals approaching · {renewalItems.length}
            </div>
            {renewalOverdue.length > 0 && (
              <Section title={`Renewal overdue · ${renewalOverdue.length}`} tone="red">
                {renewalOverdue.map((r) => <RenewalRow key={r.id} r={r}/>)}
              </Section>
            )}
            {renewalThisWeek.length > 0 && (
              <Section title={`Due this week · ${renewalThisWeek.length}`} tone="amber">
                {renewalThisWeek.map((r) => <RenewalRow key={r.id} r={r}/>)}
              </Section>
            )}
            {renewalNext7to14.length > 0 && (
              <Section title={`Due in 7-14 days · ${renewalNext7to14.length}`} tone="grey">
                {renewalNext7to14.map((r) => <RenewalRow key={r.id} r={r}/>)}
              </Section>
            )}
            {renewalUnscheduled.length > 0 && (
              <Section title={`Active clients without renewal date · ${renewalUnscheduled.length}`} tone="amber">
                {renewalUnscheduled.map((r) => <RenewalRow key={r.id} r={r}/>)}
              </Section>
            )}
          </div>
        )}

        {items.length === 0 && renewalItems.length === 0 && (
          <EmptyState
            icon={Phone}
            tone="green"
            title="You're all caught up"
            description="No clients waiting for a follow-up call. New SaleClosing clients land here automatically as Needs-triage so you can classify them. If you expected someone, check Sales close to confirm they're assigned to you."
          />
        )}
      </Page>
    </>
  );
}

function RenewalRow({ r }: { r: RenewalItem }) {
  // Roshni's ask: WhatsApp icon should open the client's PERSONAL chat,
  // not the project/group chat. Group link is only used as a last-resort
  // fallback when the client's personal number isn't on file.
  const waPhone = r.phoneCode && r.phoneDigits ? `${r.phoneCode}${r.phoneDigits}`.replace(/[^0-9]/g, '') : '';
  const waUrl = waPhone ? `https://wa.me/${waPhone}` : (r.whatsappGroupLink || '');
  const riskColor = r.churnRisk === 'Red' ? 'red' : r.churnRisk === 'Amber' ? 'amber' : 'green';

  return (
    <div
      className="rounded-xl p-3.5 flex justify-between items-start gap-3 flex-wrap hover-lift"
      style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
    >
      <div className="flex-1 min-w-[260px]">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/clients/${r.id}`} className="font-semibold text-sm hover:underline">{r.name}</Link>
          <span className="text-[11px] muted">· {r.lifecycle}</span>
          {r.churnRisk && <Pill color={riskColor}>{r.churnRisk}</Pill>}
          {r.salesOwner && <span className="text-[11px] muted">· {r.salesOwner.name}</span>}
        </div>
        <div className="text-xs muted mt-1">
          <strong>Next renewal:</strong> {r.nextRenewalDue}
          {r.overdue
            ? <span className="text-brand-red ml-2 font-medium">· overdue</span>
            : <span className="ml-2">· in {r.daysUntil}d</span>}
          {r.cycleAmount && <> · <strong>Cycle:</strong> {r.currency} {r.cycleAmount}</>}
          {r.sessionsPerCycle && <> · <strong>Sessions:</strong> {r.sessionsUsed ?? 0}/{r.sessionsPerCycle}</>}
          {r.primaryTrainer && <> · <strong>Trainer:</strong> {r.primaryTrainer.name}</>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noreferrer" title="Open WhatsApp">
            <Button size="sm" className="!px-3"
              style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}>
              <MessageCircle size={12}/> WhatsApp
            </Button>
          </a>
        )}
        <Link to={`/clients/${r.id}`}>
          <Button size="sm" variant="primary">Open client</Button>
        </Link>
      </div>
    </div>
  );
}

function Section({ title, tone, children }: { title: string; tone: 'red' | 'amber' | 'grey'; children: React.ReactNode }) {
  const accentColor = tone === 'red' ? 'var(--status-red)' : tone === 'amber' ? 'var(--status-amber)' : 'var(--brand-textMuted)';
  return (
    <div className="card mb-3" style={{ borderLeft: `3px solid ${accentColor}` }}>
      <div className="card-h" style={{ color: accentColor }}>
        <span className="flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}` }}
          />
          {title}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ c }: { c: FollowUpItem }) {
  const subColor = c.saleClosingSubStatus === 'RP' ? 'blue'
    : c.saleClosingSubStatus === 'CP' ? 'amber'
    : c.saleClosingSubStatus === null ? 'amber'
    : 'grey';
  const subLabel = c.saleClosingSubStatus || 'NO STATUS';
  // WhatsApp is the only contact channel — no tel: link (MITS comms are all WA).
  // Roshni's ask: always open the client's PERSONAL chat. Group link is only
  // used as a last-resort fallback when there's no personal number on file.
  const waPhone = c.phoneCode && c.phoneDigits ? `${c.phoneCode}${c.phoneDigits}`.replace(/[^0-9]/g, '') : '';
  const waUrl = waPhone ? `https://wa.me/${waPhone}` : (c.whatsappGroupLink || '');

  return (
    <div
      className="rounded-xl p-3.5 flex justify-between items-start gap-3 flex-wrap hover-lift"
      style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
    >
      <div className="flex-1 min-w-[260px]">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/clients/${c.id}`} className="font-semibold text-sm hover:underline">{c.name}</Link>
          <Pill color={subColor}>{subLabel}</Pill>
          <span className="text-[11px] muted">· {c.lifecycle}</span>
          {c.cycleAmount ? <span className="text-[11px] muted">· {c.currency || 'USD'} {c.cycleAmount}</span> : null}
          {c.salesOwner && <span className="text-[11px] muted">· {c.salesOwner.name}</span>}
        </div>
        <div className="text-xs muted mt-1">
          {c.roshniNextCallOn && (
            <>
              <strong>Next call:</strong> {c.roshniNextCallOn}
              {c.daysOverdue > 0 && <span className="text-brand-red ml-2 font-medium">· {c.daysOverdue}d overdue</span>}
            </>
          )}
          {c.roshniLastContactOutcome && (
            <> · <strong>Last:</strong> {c.roshniLastContactOutcome}{c.roshniLastContactAt ? ` on ${c.roshniLastContactAt}` : ''}</>
          )}
          {!c.saleClosingSubStatus && (
            <span className="text-brand-amber">
              <strong>No status set</strong> — open the client and default it to RP, or move directly to CP / C / JBT / Training.
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noreferrer" title="Open WhatsApp">
            <Button size="sm" className="!px-3"
              style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}>
              <MessageCircle size={12}/> WhatsApp
            </Button>
          </a>
        )}
        <Link to={`/clients/${c.id}`}>
          <Button size="sm" variant="primary"><Check size={12}/> Open client</Button>
        </Link>
      </div>
    </div>
  );
}
