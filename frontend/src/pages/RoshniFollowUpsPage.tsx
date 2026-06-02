import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { Clock, Phone } from 'lucide-react';

interface FollowUpItem {
  id: string;
  name: string;
  lifecycle: string;
  saleClosingSubStatus: 'RP' | 'CP' | 'C' | null;
  roshniNextCallOn: string | null;
  roshniLastContactAt: string | null;
  roshniLastContactOutcome: string | null;
  salesOwner?: { id: string; name: string } | null;
  bucket: 'overdue' | 'today' | 'upcoming' | 'unscheduled';
  daysOverdue: number;
}

interface FollowUpsResponse {
  items: FollowUpItem[];
  counts: { overdue: number; today: number; upcoming: number; unscheduled: number };
}

export function RoshniFollowUpsPage() {
  const { data } = useQuery<FollowUpsResponse>({
    queryKey: ['roshni-follow-ups'],
    queryFn: () => api.get('/clients/roshni/follow-ups').then((r) => r.data),
  });

  const items = data?.items || [];
  const overdue = items.filter((i) => i.bucket === 'overdue');
  const today = items.filter((i) => i.bucket === 'today');
  const upcoming = items.filter((i) => i.bucket === 'upcoming');
  const unscheduled = items.filter((i) => i.bucket === 'unscheduled');

  return (
    <>
      <Topbar
        title="My follow-ups"
        subtitle={`${items.length} client${items.length === 1 ? '' : 's'} · ${overdue.length} overdue · ${today.length} due today`}
      />
      <Page>
        <div className="callout mb-3">
          <Clock size={14} className="inline mr-1"/>
          RP = ready for payment · CP = closure pending (no pickup) · clients marked C (not starting) are hidden — they're closed.
        </div>

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

        {items.length === 0 && (
          <div className="text-center py-12 muted">
            <Phone size={28} className="inline-block mb-2 opacity-50"/>
            <div>No follow-ups in the queue.</div>
            <div className="text-xs mt-1">Set sub-status (RP/CP) + next-call-on date on a SaleClosing/SaleWon client to add it here.</div>
          </div>
        )}
      </Page>
    </>
  );
}

function Section({ title, tone, children }: { title: string; tone: 'red' | 'amber' | 'grey'; children: React.ReactNode }) {
  const borderColor = tone === 'red' ? '#EF4444' : tone === 'amber' ? '#F59E0B' : undefined;
  return (
    <div className="card mb-3" style={borderColor ? { borderColor } : undefined}>
      <div className="card-h" style={borderColor ? { color: borderColor } : undefined}>
        <span>{title}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ c }: { c: FollowUpItem }) {
  const subColor = c.saleClosingSubStatus === 'RP' ? 'blue' : c.saleClosingSubStatus === 'CP' ? 'amber' : 'grey';
  return (
    <div className="bg-bg-input rounded p-3 flex justify-between items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/clients/${c.id}`} className="font-medium text-sm hover:underline">{c.name}</Link>
          <Pill color={subColor}>{c.saleClosingSubStatus || '—'}</Pill>
          <span className="text-[11px] muted">· {c.lifecycle}</span>
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
        </div>
      </div>
    </div>
  );
}
