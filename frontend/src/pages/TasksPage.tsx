import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';
import { Link } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { todayISO, addDays } from '@/lib/utils';

type WorkRow = {
  key: string;
  href: string;
  title: string;
  subtitle?: string;
  priority: 'high' | 'normal' | 'low';
  bucket: string;
};

// Derive workflow tasks for the current user from clients + their lifecycle + ownership.
function deriveWorkflowTasks(clients: any[], user: { id: string; role: string }, today: string): WorkRow[] {
  const rows: WorkRow[] = [];
  const isLeader = user.role === 'founder' || user.role === 'manager';
  for (const c of clients) {
    const mineIntake = c.intakeOwnerId === user.id;
    const mineSales = c.salesOwnerId === user.id;
    const mineHost = c.hostOwnerId === user.id;

    // Team-2 intake tasks
    if (user.role === 'demo_intake' || user.role === 'demo_lead' || isLeader) {
      const include = mineIntake || user.role !== 'demo_intake';
      if (c.lifecycle === 'Lead' && include) {
        rows.push({
          key: `lead-${c.id}`, href: `/clients/${c.id}`,
          title: `Send intake to ${c.name}`,
          subtitle: c.intakeSkillHint ? `Skill hint: ${c.intakeSkillHint}` : 'Open client to send 8-point intake',
          priority: 'high', bucket: 'Send intake',
        });
      }
      if (c.lifecycle === 'IntakeSent' && include) {
        rows.push({
          key: `intsent-${c.id}`, href: `/clients/${c.id}`,
          title: `Record reply from ${c.name}`,
          subtitle: 'Intake message was sent — capture the 8-point reply when client responds',
          priority: 'normal', bucket: 'Awaiting reply',
        });
      }
      if (c.lifecycle === 'IntakeReceived' && include) {
        rows.push({
          key: `intrcv-${c.id}`, href: `/clients/${c.id}`,
          title: `Search internal pool for ${c.name}`,
          subtitle: (c.intakeData as any)?.detailed_skill_set || c.intakeSkillHint || '',
          priority: 'high', bucket: 'Internal search',
        });
      }
      if (c.lifecycle === 'VerificationPending' && include) {
        const hasProposals = (c.sourcingRequests || []).some((r: any) => (r.proposals || []).length > 0);
        rows.push({
          key: `ver-${c.id}`, href: hasProposals ? '/verifications' : `/clients/${c.id}`,
          title: hasProposals ? `Verify recruiter proposals for ${c.name}` : `Resolve ${c.name} (orphan — no proposals)`,
          subtitle: hasProposals ? 'Pass / Fail each proposal' : 'Send back to recruiters or internal search',
          priority: 'high', bucket: 'Verify proposals',
        });
      }
      if (c.lifecycle === 'TrainerMatched' && include) {
        rows.push({
          key: `tm-${c.id}`, href: `/clients/${c.id}`,
          title: `Schedule demo for ${c.name}`,
          subtitle: c.primaryTrainer ? `Trainer: ${c.primaryTrainer.name}` : 'Trainer assigned — pick date/time',
          priority: 'high', bucket: 'Schedule demo',
        });
      }
      if (c.lifecycle === 'DemoScheduled' && include) {
        const isToday = c.demoDate === today;
        const isOverdue = c.demoDate && c.demoDate < today;
        rows.push({
          key: `ds-${c.id}`, href: `/clients/${c.id}`,
          title: `${isOverdue ? 'OVERDUE: ' : isToday ? 'TODAY: ' : ''}Conduct demo for ${c.name}`,
          subtitle: c.demoDate ? `${c.demoDate}${c.demoTimeIst ? ' · ' + c.demoTimeIst + ' IST' : ''}` : 'No date/time saved',
          priority: isToday || isOverdue ? 'high' : 'normal',
          bucket: isOverdue ? 'Overdue demos' : isToday ? 'Demos today' : 'Demos upcoming',
        });
      }
    }

    // Recruiter tasks
    if (user.role === 'recruiter' || isLeader) {
      (c.sourcingRequests || []).forEach((r: any) => {
        if (user.role === 'recruiter' && r.sentToId !== user.id) return;
        if (r.status === 'Open') {
          rows.push({
            key: `srch-${r.id}`, href: '/sourcing',
            title: `Source trainer for ${c.name}`,
            subtitle: (c.intakeData as any)?.detailed_skill_set || c.intakeSkillHint || '',
            priority: 'high', bucket: 'Sourcing — open',
          });
        }
      });
    }

    // Sales-closer tasks
    if (user.role === 'sales_closer' || isLeader) {
      if (c.lifecycle === 'DemoDone') {
        rows.push({
          key: `dd-${c.id}`, href: `/clients/${c.id}`,
          title: `Close ${c.name}`,
          subtitle: 'Send engagement letter and collect fresh payment',
          priority: 'high', bucket: 'Sales closing',
        });
      }
      if (c.lifecycle === 'SaleClosing' && (mineSales || user.role !== 'sales_closer')) {
        rows.push({
          key: `sc-${c.id}`, href: `/clients/${c.id}`,
          title: `Record fresh payment for ${c.name}`,
          subtitle: `${c.currency} ${c.cycleAmount || 0}`,
          priority: 'high', bucket: 'Awaiting payment',
        });
      }
    }

    // Team-5 host tasks (sessions today)
    if (user.role === 'staff' || user.role === 'lead' || isLeader) {
      if (c.lifecycle === 'Active' && (mineHost || user.role === 'lead' || isLeader)) {
        rows.push({
          key: `act-${c.id}`, href: `/clients/${c.id}`,
          title: `Host session for ${c.name}`,
          subtitle: `Trainer: ${c.primaryTrainer?.name || '—'} · ${c.sessionsUsed}/${c.sessionsPerCycle} done`,
          priority: 'normal', bucket: "Today's hosting",
        });
      }
    }

    // Renewal reminders for managers
    if (isLeader && c.lifecycle === 'Active') {
      if (c.nextRenewalDue && c.nextRenewalDue <= addDays(today, 2)) {
        rows.push({
          key: `ren-${c.id}`, href: `/clients/${c.id}`,
          title: `${c.nextRenewalDue === today ? 'TODAY: ' : ''}Renew ${c.name}`,
          subtitle: `Due ${c.nextRenewalDue} · ${c.currency} ${c.cycleAmount}`,
          priority: 'high', bucket: 'Renewals',
        });
      }
    }
  }
  return rows;
}

export function TasksPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;
  const today = todayISO();

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data),
  });

  const { data: rawTasks } = useQuery({
    queryKey: ['tasks', 'mine'],
    queryFn: () => api.get('/tasks', { params: { mine: 1 } }).then((r) => r.data),
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.post(`/tasks/${id}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['session-logs'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      showToast('Done');
    },
  });

  const workflow = deriveWorkflowTasks(clients || [], user, today);
  const byBucket: Record<string, WorkRow[]> = {};
  for (const r of workflow) (byBucket[r.bucket] ||= []).push(r);

  const sessionsPending = (rawTasks || []).filter((t: any) => t.status === 'Pending');

  return (
    <>
      <Topbar title="My tasks" subtitle={`${workflow.length} workflow · ${sessionsPending.length} session tasks`} />
      <Page>
        <div className="callout">
          Real-time list of what's on your plate — derived from clients you own at each lifecycle stage.
          Sessions you host are listed at the bottom.
        </div>

        {workflow.length === 0 && sessionsPending.length === 0 && (
          <div className="text-center py-12 muted">
            <div className="text-base font-semibold text-brand-text mb-1">All clear ✓</div>
            <div>Nothing pending on clients you own.</div>
          </div>
        )}

        {Object.entries(byBucket).map(([bucket, items]) => (
          <div key={bucket} className="card mb-3">
            <div className="card-h">
              <span>{bucket}</span>
              <Pill color={items.some((i) => i.priority === 'high') ? 'red' : 'amber'}>{items.length}</Pill>
            </div>
            <div className="space-y-1.5">
              {items.map((row) => (
                <Link key={row.key} to={row.href} className="block bg-bg-input rounded p-2.5 hover:bg-bg-cardHover transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{row.title}</div>
                      {row.subtitle && <div className="muted text-xs mt-0.5 truncate">{row.subtitle}</div>}
                    </div>
                    {row.priority === 'high' && <Pill color="red">priority</Pill>}
                    <span className="text-brand-textMuted">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {sessionsPending.length > 0 && (
          <div className="card">
            <div className="card-h"><span>Sessions you're hosting</span><Pill color="blue">{sessionsPending.length}</Pill></div>
            <table className="w-full">
              <thead><tr className="text-brand-textMuted text-xs"><th className="text-left py-1">Due</th><th className="text-left py-1">Client</th><th className="text-left py-1">Trainer</th><th className="text-left py-1">Priority</th><th></th></tr></thead>
              <tbody>
                {sessionsPending.map((t: any) => (
                  <tr key={t.id} className="border-t border-brand-borderSoft">
                    <td className="mono text-xs py-1.5">{t.dueDate || '—'}</td>
                    <td>{t.client?.name || '—'}</td>
                    <td>{t.trainer?.name || '—'}</td>
                    <td><Pill color={t.priority === 'High' ? 'red' : 'grey'}>{t.priority}</Pill></td>
                    <td><Button size="sm" variant="success" onClick={() => complete.mutate(t.id)}>Complete</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Page>
    </>
  );
}
