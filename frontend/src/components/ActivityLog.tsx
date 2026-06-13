/**
 * Activity log — read-only feed of all audit events for a client or trainer.
 * Used on ClientDetailPage and TrainerDetailPage.
 * Not editable. Founder/manager/lead/account_manager can view.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Activity } from 'lucide-react';

interface LogEntry {
  id: string;
  byName: string;
  action: string;
  details: string | null;
  createdAt: string;
}

// Human-readable labels for audit action codes
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
  ENGAGEMENT_LETTER_EMAIL:   'Engagement letter sent (email)',
  ENGAGEMENT_LETTER_WA:      'Engagement letter sent (WhatsApp)',
  HANDOVER_TO_MITALI:        'Handed over to Mitali',
  HANDOVER_WELCOME_EMAIL:    'Welcome email sent',
  HANDOVER_WELCOME_WA:       'Welcome WhatsApp sent',
  HANDOVER_WELCOME_WA_GROUP: 'Welcome sent to WA group',
  FEEDBACK_EMAIL:            'Feedback survey email sent',
  PRE_DEMO_REMINDER_EMAIL:   'Pre-demo reminder sent (email)',
  PRE_DEMO_REMINDER_WA:      'Pre-demo reminder sent (WhatsApp)',
  SKILL_MATRIX_SENT:         'Skill matrix sent (email)',
  SKILL_MATRIX_SENT_WA:      'Skill matrix sent (WhatsApp)',
  SKILL_MATRIX_MARK_SENT:    'Skill matrix marked as sent',
  WELCOME_EMAIL_SENT:        'Welcome email sent (Samita)',
  POST_DEMO_FEEDBACK:        'Post-demo feedback recorded',
  DEMO_INVITE_SENT:          'Demo invite sent',
  DEMO_RESCHEDULED:          'Demo rescheduled',
  DEMO_BACKFILL:             'Demo outcome recorded',
  ROSHNI_SUB_STATUS:         'Sub-status updated',
  ROSHNI_MARK_CONTACTED:     'Marked as contacted',
  PAYMENT_CHECKLIST_UPDATE:  'Payment checklist updated',
  PAYMENT_CONFIRMATION:      'Payment confirmation updated',
  PAYMENT_WA_SENT:           'Payment WA sent',
  WA_GROUP_RENAME:           'WA group renamed',
  SOURCING_AUTOCLOSE:        'Sourcing request auto-closed',
  SOURCING_AUTOCREATE:       'Sourcing request created',
  TRAINER_CREATE:            'Trainer created',
  TRAINER_UPDATE:            'Trainer details updated',
};

function labelFor(action: string): string {
  return ACTION_LABELS[action] || action.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
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
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Color per action category
function dotColor(action: string): string {
  if (action.includes('PAYMENT') || action.includes('LEVERAGE')) return 'var(--status-green)';
  if (action.includes('STAGE') || action.includes('HANDOVER')) return 'var(--accent-gold)';
  if (action.includes('EMAIL') || action.includes('WA') || action.includes('REMINDER')) return '#60a5fa';
  if (action.includes('DELETE') || action.includes('CHURN')) return 'var(--status-red)';
  return 'var(--brand-textMuted)';
}

export function ActivityLog({ clientId, trainerId }: { clientId?: string; trainerId?: string }) {
  const param = clientId ? `clientId=${clientId}` : `trainerId=${trainerId}`;

  const { data: entries = [], isLoading } = useQuery<LogEntry[]>({
    queryKey: ['activity', clientId || trainerId],
    queryFn: () => api.get(`/audit/entity?${param}`).then(r => r.data),
    enabled: !!(clientId || trainerId),
  });

  return (
    <div className="card">
      <div className="card-h">
        <span className="flex items-center gap-2">
          <Activity size={14} style={{ color: 'var(--accent-gold)' }}/>
          Activity log
        </span>
        <span className="text-[11px] muted">{entries.length} events</span>
      </div>

      {isLoading && <div className="text-xs muted py-3">Loading…</div>}

      {!isLoading && entries.length === 0 && (
        <div className="text-xs muted italic py-3 text-center">No activity recorded yet.</div>
      )}

      {!isLoading && entries.length > 0 && (
        <div className="relative" style={{ paddingLeft: 20 }}>
          {/* Vertical timeline line */}
          <div className="absolute left-[7px] top-0 bottom-0 w-px" style={{ background: 'var(--brand-borderSoft)' }}/>

          {entries.map((e, i) => (
            <div key={e.id} className="relative mb-3 last:mb-0" style={{ paddingLeft: 14 }}>
              {/* Dot */}
              <div className="absolute left-[-13px] top-[5px] w-2 h-2 rounded-full border-2"
                style={{
                  background: dotColor(e.action),
                  borderColor: 'var(--bg-card)',
                  boxShadow: `0 0 0 1px ${dotColor(e.action)}`,
                }}/>

              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold leading-tight" style={{ color: 'var(--brand-text)' }}>
                    {labelFor(e.action)}
                  </div>
                  {e.details && (
                    <div className="text-[11px] muted mt-0.5 leading-snug">{e.details}</div>
                  )}
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--brand-textMuted)' }}>
                    <span className="font-medium" style={{ color: 'var(--accent-gold)' }}>{e.byName}</span>
                    {' · '}
                    <span title={fmtDate(e.createdAt)}>{timeAgo(e.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
