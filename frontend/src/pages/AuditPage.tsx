/**
 * Team activity log — read-only feed of all actions by team members.
 * Founder sees everything. Manager/lead see their team.
 * Filterable by member, date range, keyword. Not editable.
 */
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Activity, Filter, X } from 'lucide-react';

interface LogEntry {
  id: string;
  byId: string | null;
  byName: string;
  action: string;
  details: string | null;
  clientId: string | null;
  trainerId: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  CLIENT_CREATE:             'Client created',
  CLIENT_UPDATE:             'Details updated',
  CLIENT_DELETE:             'Client deleted',
  STAGE_CHANGE:              'Stage changed',
  PAYMENT_ADVANCED:          'Payment marked done',
  PAY_DATES_SET:             'Pay dates set',
  LEVERAGE_GRANTED:          'Leverage granted',
  FOLLOWUP_NOTE:             'Note added',
  FEEDBACK_TAKEN:            'Feedback logged',
  LEVERAGE_ASKED:            'Leverage asked',
  PENDING_VAIBHAV_ON:        'Flagged pending Vaibhav',
  PENDING_VAIBHAV_OFF:       'Unflagged pending Vaibhav',
  ENGAGEMENT_LETTER_EMAIL:   'Engagement letter (email)',
  ENGAGEMENT_LETTER_WA:      'Engagement letter (WA)',
  HANDOVER_TO_MITALI:        'Handover to Mitali',
  HANDOVER_WELCOME_EMAIL:    'Welcome email sent',
  HANDOVER_WELCOME_WA:       'Welcome WA sent',
  HANDOVER_WELCOME_WA_GROUP: 'Welcome sent to WA group',
  FEEDBACK_EMAIL:            'Feedback survey sent',
  PRE_DEMO_REMINDER_EMAIL:   'Pre-demo reminder (email)',
  PRE_DEMO_REMINDER_WA:      'Pre-demo reminder (WA)',
  SKILL_MATRIX_SENT:         'Skill matrix sent (email)',
  SKILL_MATRIX_SENT_WA:      'Skill matrix sent (WA)',
  SKILL_MATRIX_MARK_SENT:    'Skill matrix marked sent',
  WELCOME_EMAIL_SENT:        'Welcome email (Samita)',
  POST_DEMO_FEEDBACK:        'Post-demo feedback recorded',
  DEMO_INVITE_SENT:          'Demo invite sent',
  DEMO_RESCHEDULED:          'Demo rescheduled',
  DEMO_BACKFILL:             'Demo outcome recorded',
  ROSHNI_SUB_STATUS:         'Sub-status updated',
  ROSHNI_MARK_CONTACTED:     'Marked as contacted',
  PAYMENT_CHECKLIST_UPDATE:  'Payment checklist updated',
  PAYMENT_CONFIRMATION:      'Payment confirmed',
  PAYMENT_WA_SENT:           'Payment WA sent',
  WA_GROUP_RENAME:           'WA group renamed',
  SOURCING_AUTOCLOSE:        'Sourcing auto-closed',
  SOURCING_AUTOCREATE:       'Sourcing created',
  TRAINER_CREATE:            'Trainer created',
  TRAINER_UPDATE:            'Trainer updated',
};

function labelFor(action: string) {
  return ACTION_LABELS[action] || action.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
}

function dotColor(action: string): string {
  if (action.includes('PAYMENT') || action.includes('LEVERAGE')) return 'var(--status-green)';
  if (action.includes('STAGE') || action.includes('HANDOVER')) return 'var(--accent-gold)';
  if (action.includes('EMAIL') || action.includes('WA') || action.includes('REMINDER')) return '#60a5fa';
  if (action.includes('DELETE')) return 'var(--status-red)';
  return 'var(--brand-textMuted)';
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDateTime(iso);
}

function groupByDate(entries: LogEntry[]): { date: string; items: LogEntry[] }[] {
  const groups: Record<string, LogEntry[]> = {};
  for (const e of entries) {
    const d = e.createdAt.slice(0, 10);
    if (!groups[d]) groups[d] = [];
    groups[d].push(e);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}

function fmtGroupDate(d: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yest  = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (d === today) return 'Today';
  if (d === yest)  return 'Yesterday';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function AuditPage() {
  const [search, setSearch]     = useState('');
  const [byName, setByName]     = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate]     = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const qParams = new URLSearchParams({ limit: '500' });
  if (fromDate) qParams.set('from', fromDate);
  if (toDate)   qParams.set('to', toDate);

  const { data: raw = [], isLoading } = useQuery<LogEntry[]>({
    queryKey: ['audit-log', fromDate, toDate],
    queryFn: () => api.get(`/audit?${qParams}`).then(r => r.data),
  });

  const entries = useMemo(() => {
    let xs = raw;
    const q = search.trim().toLowerCase();
    if (q) xs = xs.filter(e =>
      e.details?.toLowerCase().includes(q) ||
      labelFor(e.action).toLowerCase().includes(q) ||
      e.byName.toLowerCase().includes(q)
    );
    if (byName) xs = xs.filter(e => e.byName === byName);
    return xs;
  }, [raw, search, byName]);

  const members = useMemo(() => [...new Set(raw.map(e => e.byName))].sort(), [raw]);
  const groups  = useMemo(() => groupByDate(entries), [entries]);
  const hasFilters = !!(byName || fromDate || toDate || search);

  return (
    <>
      <Topbar
        title="Activity log"
        subtitle={`${entries.length}${entries.length !== raw.length ? ` of ${raw.length}` : ''} events · read-only${raw.length >= 500 ? ' · showing latest 500 — narrow your date range to see older events' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-[200px]"
            />
            <button
              onClick={() => setShowFilters(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border transition-all"
              style={{
                background: showFilters ? 'var(--accent-goldSoft)' : 'var(--bg-card)',
                borderColor: showFilters ? 'var(--accent-gold)' : 'var(--brand-border)',
                color: showFilters ? 'var(--accent-gold)' : 'var(--brand-textSecondary)',
              }}>
              <Filter size={12}/> Filters {hasFilters && '·'}
            </button>
          </div>
        }
      />
      <Page>
        {/* Filter bar */}
        {showFilters && (
          <div className="card mb-4 flex flex-wrap gap-4 items-end">
            <div>
              <div className="text-[11px] muted mb-1">Team member</div>
              <select
                value={byName}
                onChange={e => setByName(e.target.value)}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                <option value="">All members</option>
                {members.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[11px] muted mb-1">From date</div>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}/>
            </div>
            <div>
              <div className="text-[11px] muted mb-1">To date</div>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}/>
            </div>
            {hasFilters && (
              <button onClick={() => { setByName(''); setFromDate(''); setToDate(''); setSearch(''); }}
                className="flex items-center gap-1 text-[12px] muted hover:underline self-end pb-1">
                <X size={11}/> Clear all
              </button>
            )}
          </div>
        )}

        {isLoading && <div className="muted text-sm py-4">Loading…</div>}

        {!isLoading && entries.length === 0 && (
          <div className="card text-center py-12">
            <Activity size={28} className="mx-auto mb-3 muted"/>
            <div className="font-semibold text-sm mb-1">No activity found</div>
            <div className="muted text-xs">Try adjusting your filters or date range.</div>
          </div>
        )}

        {groups.map(({ date, items }) => (
          <div key={date} className="mb-5">
            {/* Date divider */}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-widest shrink-0" style={{ color: 'var(--brand-textMuted)' }}>
                {fmtGroupDate(date)}
              </span>
              <div className="flex-1 h-px" style={{ background: 'var(--brand-borderSoft)' }}/>
              <span className="text-[10px] muted shrink-0">{items.length}</span>
            </div>

            <div className="card overflow-hidden p-0">
              {items.map((e, idx) => (
                <div key={e.id}
                  className="flex items-start gap-3 px-4 py-2.5"
                  style={{ borderBottom: idx < items.length - 1 ? '1px solid var(--brand-borderSoft)' : undefined }}>

                  {/* Color dot */}
                  <div className="mt-[6px] w-2 h-2 rounded-full shrink-0"
                    style={{ background: dotColor(e.action) }}/>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[12px] font-semibold" style={{ color: 'var(--brand-text)' }}>
                        {labelFor(e.action)}
                      </span>
                      {e.details && (
                        <span className="text-[11px] muted" style={{ maxWidth: 380 }} title={e.details}>
                          {e.details.length > 60 ? e.details.slice(0, 60) + '…' : e.details}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[11px] font-medium" style={{ color: 'var(--accent-gold)' }}>
                        {e.byName}
                      </span>
                      <span className="text-[10px] muted" title={fmtDateTime(e.createdAt)}>
                        {timeAgo(e.createdAt)}
                      </span>
                      {e.clientId && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa' }}>
                          client
                        </span>
                      )}
                      {e.trainerId && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>
                          trainer
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Time */}
                  <div className="text-[10px] muted tabular-nums shrink-0">
                    {new Date(e.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Page>
    </>
  );
}
