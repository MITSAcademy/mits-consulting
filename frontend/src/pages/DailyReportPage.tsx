import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Textarea, Input, Label } from '@/components/ui/input';
import { useUI } from '@/store/ui';
import { todayISO } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { Sparkles, Plus } from 'lucide-react';

// Human labels for the audit-log action codes the backend emits.
const ACTION_LABEL: Record<string, string> = {
  LOGIN: 'Logged in',
  LOGOUT: 'Logged out',
  CLIENT_CREATE: 'Created lead',
  CLIENT_UPDATE: 'Updated client',
  CLIENT_DELETE: 'Deleted client',
  STAGE_CHANGE: 'Moved stage',
  PAYMENT_RECORD: 'Recorded payment',
  TRAINER_CREATE: 'Added trainer',
  TRAINER_UPDATE: 'Updated trainer',
  TRAINER_LEAD_CREATE: 'Added trainer lead',
  TRAINER_LEAD_UPDATE: 'Updated trainer lead',
  SOURCING_CREATE: 'Sent to recruiters',
  PROPOSALS_ADD: 'Submitted trainer proposals',
  PROPOSAL_UPDATE: 'Updated proposal',
  PROPOSAL_PASS: 'Verified (Pass) trainer proposal',
  TASK_CREATE: 'Created task',
  TASK_COMPLETE: 'Completed task',
  SESSION_LOG: 'Logged session',
  SESSION_BULK: 'Bulk-updated sessions',
  LEVERAGE_CREATE: 'Submitted leverage request',
  LEVERAGE_DECISION: 'Decided on leverage',
  PAYOUT_BATCH_CREATE: 'Created payout batch',
  PAYOUT_APPROVE: 'Approved payout',
  PAYOUT_PAID: 'Marked payout paid',
  FEEDBACK_CREATE: 'Logged feedback',
  DAILY_REPORT: 'Submitted daily report',
  PARTNER_CREATE: 'Added partner',
  PARTNER_UPDATE: 'Updated partner',
  BANK_CREATE: 'Added bank',
  RAW_LEAD_BULK: 'Imported raw leads',
  RAW_LEAD_PROMOTE: 'Promoted raw lead → client',
  EDIT_REQUEST: 'Submitted edit request',
  EDIT_APPROVE: 'Approved edit request',
  EDIT_REJECT: 'Rejected edit request',
};

function summarize(logs: any[]): string {
  if (!logs.length) return '';
  // Bucket by action, count + take a few sample details
  const buckets: Record<string, { count: number; samples: string[] }> = {};
  for (const l of logs) {
    if (!buckets[l.action]) buckets[l.action] = { count: 0, samples: [] };
    buckets[l.action].count += 1;
    if (l.details && buckets[l.action].samples.length < 3) {
      buckets[l.action].samples.push(l.details);
    }
  }
  const lines: string[] = [];
  for (const [action, b] of Object.entries(buckets).sort((a, b) => b[1].count - a[1].count)) {
    const label = ACTION_LABEL[action] || action;
    if (b.count === 1 && b.samples[0]) {
      lines.push(`• ${label}: ${b.samples[0]}`);
    } else {
      lines.push(`• ${label} ×${b.count}${b.samples.length ? ` (e.g. ${b.samples.slice(0, 2).join(' · ')}${b.count > 2 ? ' …' : ''})` : ''}`);
    }
  }
  return lines.join('\n');
}

export function DailyReportPage() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const showToast = useUI((s) => s.showToast);
  const [date, setDate] = useState(todayISO());
  const [content, setContent] = useState('');

  const { data: reports } = useQuery({
    queryKey: ['reports', user?.id],
    queryFn: () => api.get('/reports', { params: { userId: user?.id } }).then((r) => r.data),
  });

  const { data: todayLogs } = useQuery({
    queryKey: ['audit/mine', date],
    queryFn: () => api.get('/audit/mine', { params: { date } }).then((r) => r.data),
  });

  const submit = useMutation({
    mutationFn: () => api.post('/reports', { date, content }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reports'] }); setContent(''); showToast('Submitted'); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const generate = () => {
    const summary = summarize(todayLogs || []);
    if (!summary) {
      showToast('No activity recorded for that date yet', 'error');
      return;
    }
    // Prepend a heading + append to whatever the user has typed
    const header = `Today's activity (auto-pulled from system on ${date}):`;
    setContent((prev) => (prev ? `${prev}\n\n${header}\n${summary}` : `${header}\n${summary}`));
    showToast(`Pulled ${todayLogs?.length || 0} actions into the report`);
  };

  const appendBlocker = () => setContent((p) => (p ? `${p}\n\nBlocker: ` : 'Blocker: '));
  const appendPlan = () => setContent((p) => (p ? `${p}\n\nPlan for tomorrow:\n- ` : 'Plan for tomorrow:\n- '));

  return (
    <>
      <Topbar title="Daily report" subtitle={user?.name} />
      <Page>
        <div className="card mb-4">
          <div className="card-h">
            <span>Submit today's report</span>
            <span className="text-xs muted normal-case">{todayLogs?.length || 0} system actions today</span>
          </div>

          <div className="grid md:grid-cols-2 gap-2.5 mb-3">
            <div className="form-row"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>

          <div className="flex gap-1.5 mb-2 flex-wrap">
            <Button size="sm" variant="amber" onClick={generate} disabled={!todayLogs?.length}>
              <Sparkles size={12}/> Pull from today's activity
            </Button>
            <Button size="sm" onClick={appendBlocker}><Plus size={12}/> Add blocker</Button>
            <Button size="sm" onClick={appendPlan}><Plus size={12}/> Add plan for tomorrow</Button>
          </div>

          <div className="form-row">
            <Label>Summary</Label>
            <Textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)}
              placeholder="What did you ship/move today? Use the buttons above to auto-pull from system activity." />
          </div>

          <Button variant="primary" disabled={!content.trim()} onClick={() => submit.mutate()}>Submit</Button>
        </div>

        {/* Live audit-trail preview so users can see what's tracked */}
        <div className="card mb-4">
          <div className="card-h">
            <span>System activity log for {date}</span>
            <span className="text-xs muted normal-case">live · audit trail</span>
          </div>
          {(todayLogs || []).length === 0 ? (
            <div className="muted text-sm">No actions recorded yet for this date.</div>
          ) : (
            <div className="space-y-1 max-h-[260px] overflow-y-auto">
              {(todayLogs || []).map((l: any) => (
                <div key={l.id} className="bg-bg-input rounded p-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-medium">{ACTION_LABEL[l.action] || l.action}</span>
                    <span className="mono muted text-[11px]">{new Date(l.createdAt).toLocaleTimeString()}</span>
                  </div>
                  {l.details && <div className="muted mt-0.5">{l.details}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-h">My recent reports</div>
          {(reports || []).length === 0 ? <div className="muted">No reports yet.</div> : (
            <div className="space-y-2">
              {(reports || []).map((r: any) => (
                <div key={r.id} className="bg-bg-input p-3 rounded">
                  <div className="text-xs muted mono mb-1">{r.date}</div>
                  <div className="text-sm whitespace-pre-wrap">{r.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Page>
    </>
  );
}
