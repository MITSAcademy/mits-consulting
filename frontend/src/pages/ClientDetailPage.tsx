import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label, Select } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { formatPhone, waLink, todayISO, stageLabel, backStagesFor, addDays } from '@/lib/utils';
import { useUI } from '@/store/ui';
import { useState, useEffect } from 'react';
import { useAuth } from '@/store/auth';
import { ArrowLeft, Send, ClipboardCheck, Search, CalendarPlus, Check, FileCheck, ArrowRight, Wallet, Clock, HandMetal, Edit as EditIcon, MessageCircle, UserPlus, Mail, Undo2, Moon, Play } from 'lucide-react';
import { SendMessageModal, MessagesHistoryCard } from '@/components/SendMessageModal';
import { DemoHistoryCard } from '@/components/DemoHistoryCard';

const INTAKE_FIELDS = [
  { key: 'detailed_skill_set', label: 'Detailed skill set', required: true },
  { key: 'current_priority_task', label: 'Current priority task' },
  { key: 'client_email', label: 'Email' },
  { key: 'demo_timing_ist', label: 'Demo timing (IST)' },
  { key: 'session_timing_ist', label: 'Session timing (IST)' },
  { key: 'trainer_preference', label: 'Trainer preference' },
  { key: 'meeting_tool', label: 'Meeting tool' },
  { key: 'additional_notes', label: 'Additional notes' },
];

// Role gates that mirror source.html
const canIntake = (role: string) => ['founder', 'manager', 'demo_lead', 'demo_intake'].includes(role);
const canClose = (role: string) => ['founder', 'manager', 'sales_closer'].includes(role);
const canActivate = (role: string) => ['founder', 'manager'].includes(role);
// Only Samita (demo_lead) and Vaibhav (founder) may assign/reassign intake owners.
const canAssignOwner = (role: string) => ['founder', 'demo_lead'].includes(role);
const canRecordPayment = (role: string) => ['founder', 'demo_lead', 'manager', 'sales_closer'].includes(role);
// Only Samita (demo_lead), Vaibhav, and managers may record the post-demo feedback step.
const canPostDemoFeedback = (role: string) => ['founder', 'manager', 'demo_lead'].includes(role);
// Client cost / price visibility — restricted per Vaibhav: only founder (Vaibhav), demo_lead (Samita), sales_closer (Roshni).
// Anjali / Taran / Aman / Kanchan / accounts / payment_processor should never see the client cycleAmount.
const canSeeFinancial = (role: string) => ['founder', 'demo_lead', 'sales_closer'].includes(role);
function canEditClient(role: string, cat: 'identity' | 'contact' | 'engagement' | 'pipeline' | 'financial' | 'sensitive') {
  if (role === 'founder') return true;
  const m: Record<string, Record<string, boolean>> = {
    demo_lead:    { identity: true,  contact: true,  engagement: true,  pipeline: true,  financial: false, sensitive: false },
    manager:      { identity: true,  contact: true,  engagement: true,  pipeline: true,  financial: true,  sensitive: true },
    sales_closer: { identity: false, contact: false, engagement: true,  pipeline: false, financial: true,  sensitive: false },
    accounts:     { identity: false, contact: false, engagement: false, pipeline: false, financial: true,  sensitive: false },
  };
  return m[role]?.[cat] || false;
}

type ModalKind =
  | null | 'editContact' | 'editEngagement' | 'assignOwner'
  | 'sendIntake' | 'recordIntake' | 'internalSearch'
  | 'scheduleDemo' | 'demoDone' | 'freshPayment' | 'leverage' | 'hold' | 'renewal' | 'welcomeEmail' | 'postDemoFeedback' | 'sendSkillMatrix' | 'preDemoReminder'
  | 'engagementLetter' | 'handoverWelcome'
  | 'sendEmail' | 'sendWA' | 'moveBack' | 'dormant' | 'resume';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;
  const [modal, setModal] = useState<ModalKind>(null);

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: () => api.get(`/clients/${id}`).then((r) => r.data),
  });

  // Phase-2 flag — gates the Mitali-team flows (engagement letter, handover welcome, etc.)
  const { data: flags } = useQuery<Record<string, boolean>>({
    queryKey: ['flags'],
    queryFn: () => api.get('/flags').then((r) => r.data),
    staleTime: 60_000,
  });
  const phase2 = !!flags?.phase_two_enabled;

  const stageM = useMutation({
    mutationFn: (lifecycle: string) => api.post(`/clients/${id}/stage`, { lifecycle }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Stage updated');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const flagM = useMutation({
    mutationFn: (v: boolean) =>
      api.patch(`/clients/${id}`, {
        paymentPendingVaibhav: v,
        pendingVaibhavSince: v ? todayISO() : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', id] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Flag updated');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  if (isLoading || !client) return <Page><div className="muted">Loading…</div></Page>;

  const intake = (client.intakeData as any) || {};
  const hasIntake = Object.values(intake).some(Boolean);
  const isTraining = client.engagementType === 'Training' || client.engagementType === 'TaskBased';
  const showAmt = canSeeFinancial(user.role);

  // Stage-specific actions (mirrors source.html renderClientDetail).
  const actions: React.ReactNode[] = [];
  // Always-available messaging shortcuts — work at every stage
  actions.push(
    <Button key="email" size="sm" onClick={() => setModal('sendEmail')} title="Send email via SMTP">
      <Mail size={14}/> Email
    </Button>
  );
  // Pre-demo lifecycles use the WhatsApp GROUP (intake conversation happens there).
  // Post-demo (and any stage without a group link) falls back to a 1:1 wa.me message.
  const preDemoForWA = ['Lead', 'IntakeSent', 'IntakeReceived', 'InternalSearch', 'WithRecruiters', 'VerificationPending', 'TrainerMatched', 'DemoScheduled'].includes(client.lifecycle);
  const useGroupForWA = !!client.whatsappGroupLink && preDemoForWA;
  actions.push(
    <Button
      key="wa"
      size="sm"
      onClick={() => {
        if (useGroupForWA) window.open(client.whatsappGroupLink!, '_blank');
        else setModal('sendWA');
      }}
      title={useGroupForWA ? `Open WhatsApp group: ${client.whatsappGroupName || 'group'}` : 'Send WhatsApp via wa.me'}
      style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}
    >
      <MessageCircle size={14}/> {useGroupForWA ? 'WhatsApp group' : 'WhatsApp'}
    </Button>
  );
  // Assign-owner button: only Vaibhav + Samita, only in pre-demo stages, only when missing/reassignable
  const inPreDemo = ['Lead', 'IntakeSent', 'IntakeReceived', 'InternalSearch', 'WithRecruiters', 'VerificationPending', 'TrainerMatched'].includes(client.lifecycle);
  if (canAssignOwner(user.role) && inPreDemo) {
    actions.push(
      <Button key="assign" onClick={() => setModal('assignOwner')}>
        <UserPlus size={14}/> {client.intakeOwner ? `Reassign (${client.intakeOwner.name})` : 'Assign owner'}
      </Button>
    );
  }
  if (canIntake(user.role) && client.lifecycle === 'Lead') {
    actions.push(<Button key="send" variant="primary" onClick={() => setModal('sendIntake')}><Send size={14}/> Send intake</Button>);
  }
  if (canIntake(user.role) && client.lifecycle === 'IntakeSent') {
    actions.push(<Button key="rec" variant="primary" onClick={() => setModal('recordIntake')}><ClipboardCheck size={14}/> Record replies</Button>);
  }
  if (canIntake(user.role) && client.lifecycle === 'IntakeReceived') {
    actions.push(<Button key="srch" variant="primary" onClick={() => setModal('internalSearch')}><Search size={14}/> Internal search</Button>);
    actions.push(<Button key="erec" onClick={() => setModal('recordIntake')}><EditIcon size={14}/> Edit intake</Button>);
  }
  // Welcome email auto-fires when intake replies are recorded (via checkbox in RecordIntakeModal).
  // No standalone button — the email is part of the intake-received transition.
  if (canIntake(user.role) && client.lifecycle === 'InternalSearch') {
    actions.push(<Button key="re" variant="primary" onClick={() => setModal('internalSearch')}><Search size={14}/> Re-search</Button>);
  }
  // WithRecruiters → allow Anjali/Taran to pull back to InternalSearch (mind change / found someone)
  if (canIntake(user.role) && client.lifecycle === 'WithRecruiters') {
    actions.push(<Button key="back-int" onClick={() => setModal('internalSearch')}><Search size={14}/> Pull back · re-search internal</Button>);
  }
  // VerificationPending with NO pending proposals → orphan state: let Team 2 send it back
  const hasAnyProposal = (client.sourcingRequests || []).some((r: any) => (r.proposals || []).length > 0);
  if (canIntake(user.role) && client.lifecycle === 'VerificationPending' && !hasAnyProposal) {
    actions.push(<Button key="back-rec" variant="amber" onClick={() => stageM.mutate('WithRecruiters')}><ArrowLeft size={14}/> Back to recruiters</Button>);
    actions.push(<Button key="back-int2" onClick={() => stageM.mutate('InternalSearch')}><Search size={14}/> Back to internal search</Button>);
  }
  if (canIntake(user.role) && client.lifecycle === 'TrainerMatched') {
    const matrixSent = !!client.skillMatrixSentAt;
    if (!matrixSent) {
      // Compulsory: send skill matrix to client BEFORE scheduling demo
      actions.push(
        <Button key="matrix" variant="primary" onClick={() => setModal('sendSkillMatrix')} title="Send proposed trainer profiles to client (compulsory before scheduling)">
          <FileCheck size={14}/> Send skill matrix to client *
        </Button>
      );
      // Pre-demo reminder is locked until matrix is sent — show as disabled so Anjali knows it's coming.
      actions.push(
        <Button key="predemo-locked" size="sm" disabled title="Locked — send the skill matrix to the client first, then the pre-demo reminder unlocks">
          <Mail size={12}/> Pre-demo reminder (locked) 🔒
        </Button>
      );
      actions.push(
        <Button key="sched-locked" disabled title="Send the skill matrix first">
          <CalendarPlus size={14}/> Schedule demo (locked)
        </Button>
      );
    } else {
      actions.push(
        <Button key="sched" variant="primary" onClick={() => setModal('scheduleDemo')}>
          <CalendarPlus size={14}/> Schedule demo
        </Button>
      );
      // Pre-demo reminder unlocks once matrix is sent — Anjali can prep the trainer alongside scheduling.
      actions.push(
        <Button key="predemo-tm" size="sm" onClick={() => setModal('preDemoReminder')} title="Send the do's/don'ts reminder to the trainer (camera off, no CV, etc.)">
          <Mail size={12}/> Pre-demo reminder
        </Button>
      );
      actions.push(
        <Button key="matrix-resend" size="sm" onClick={() => setModal('sendSkillMatrix')} title="Re-send skill matrix">
          <FileCheck size={12}/> Re-send matrix
        </Button>
      );
    }
  }
  if (canIntake(user.role) && client.lifecycle === 'DemoScheduled') {
    actions.push(<Button key="resched" onClick={() => setModal('scheduleDemo')}><CalendarPlus size={14}/> Reschedule</Button>);
    actions.push(
      <Button key="predemo" size="sm" onClick={() => setModal('preDemoReminder')} title="Send the do's/don'ts reminder to the trainer just before the call">
        <Mail size={12}/> Pre-demo reminder
      </Button>
    );
    actions.push(<Button key="done" variant="success" onClick={() => setModal('demoDone')}><Check size={14}/> Demo done</Button>);
  }
  // Samita's post-demo feedback step — auto-routes to Roshni (positive), Anjali (negative), or Hold (need time)
  if (canPostDemoFeedback(user.role) && (client.lifecycle === 'FeedbackPending' || client.lifecycle === 'DemoDone')) {
    actions.push(
      <Button key="postdemo" variant="primary" onClick={() => setModal('postDemoFeedback')} title="Take post-demo feedback (Samita)">
        <MessageCircle size={14}/> Take post-demo feedback
      </Button>
    );
  }
  // Sales closer fallback (Roshni / sales_closer can also start closing directly without Samita's step)
  if (canClose(user.role) && (client.lifecycle === 'DemoDone' || client.lifecycle === 'FeedbackPending')) {
    actions.push(<Button key="close" variant="amber" onClick={() => stageM.mutate('SaleClosing')}><FileCheck size={14}/> Start closing</Button>);
  }
  if (canClose(user.role) && client.lifecycle === 'SaleClosing' && canRecordPayment(user.role)) {
    actions.push(<Button key="pay" variant="success" onClick={() => setModal('freshPayment')}><Wallet size={14}/> Fresh payment</Button>);
  }
  // Phase-2: Roshni sends engagement letter + triggers handover-to-Mitali on SaleClosing close-out
  if (phase2 && canClose(user.role) && (client.lifecycle === 'SaleClosing' || client.lifecycle === 'SaleWon')) {
    actions.push(
      <Button key="engage" variant="primary" onClick={() => setModal('engagementLetter')} title="Confirm engagement + create Mitali handover task">
        <Mail size={12}/> Engagement letter + handover
      </Button>
    );
  }
  if (canActivate(user.role) && client.lifecycle === 'SaleWon') {
    actions.push(<Button key="act" variant="primary" onClick={() => stageM.mutate('Active')}><ArrowRight size={14}/> {isTraining ? 'Start training' : 'Handover · activate'}</Button>);
  }
  // Phase-2: Mitali sends her welcome message (introducing her team + feedback rhythm)
  if (phase2 && canActivate(user.role) && (client.lifecycle === 'Active' || client.lifecycle === 'SaleWon' || client.lifecycle === 'LeverageGranted')) {
    actions.push(
      <Button key="handover-welcome" size="sm" onClick={() => setModal('handoverWelcome')} title="Send Mitali's handover welcome (intro to team + feedback rhythm)">
        <MessageCircle size={12}/> Send handover welcome
      </Button>
    );
  }
  if (canActivate(user.role) && (client.lifecycle === 'Active' || client.lifecycle === 'LeverageGranted')) {
    actions.push(<Button key="lev" variant="amber" onClick={() => setModal('leverage')}><Clock size={14}/> Leverage</Button>);
    actions.push(<Button key="hold" variant="danger" onClick={() => setModal('hold')}><HandMetal size={14}/> Hold</Button>);
    if (!isTraining && canRecordPayment(user.role)) {
      actions.push(<Button key="ren" variant="success" onClick={() => setModal('renewal')}><Wallet size={14}/> Renewal</Button>);
    } else if (isTraining) {
      actions.push(<Button key="cmpl" variant="success" onClick={() => stageM.mutate('Completed')}><Check size={14}/> Mark completed</Button>);
    }
  }
  if (canActivate(user.role)) {
    actions.push(
      <Button key="flag" size="sm" onClick={() => flagM.mutate(!client.paymentPendingVaibhav)}>
        {client.paymentPendingVaibhav ? 'Unflag Vaibhav' : 'Flag for Vaibhav'}
      </Button>
    );
  }

  // Backward-move button — only shows if the current stage has valid back-options
  const validBack = backStagesFor(client.lifecycle);
  if (validBack.length > 0 && client.lifecycle !== 'Dormant' && (canIntake(user.role) || canClose(user.role) || canActivate(user.role))) {
    actions.push(
      <Button key="back" size="sm" onClick={() => setModal('moveBack')} title="Move client to an earlier stage">
        <Undo2 size={14}/> Move back
      </Button>
    );
  }

  // Mark Dormant — available from most active stages
  const dormantEligible = ![
    'Dormant', 'Churned', 'Completed',
  ].includes(client.lifecycle);
  if (dormantEligible && (canIntake(user.role) || canClose(user.role) || canActivate(user.role))) {
    actions.push(
      <Button key="dormant" size="sm" onClick={() => setModal('dormant')} title="Client stopped responding — mark dormant">
        <Moon size={14}/> Mark dormant
      </Button>
    );
  }

  // Resume from Dormant
  if (client.lifecycle === 'Dormant' && (canIntake(user.role) || canClose(user.role) || canActivate(user.role))) {
    actions.push(
      <Button key="resume" size="sm" variant="success" onClick={() => setModal('resume')}>
        <Play size={14}/> Resume client
      </Button>
    );
  }

  // Identify the recruiter currently sourcing (if any) to show clearly in the header
  const activeSourcingRequest = (client.sourcingRequests || []).find((r: any) => r.status === 'Open' || r.status === 'Proposed');
  const currentRecruiter = activeSourcingRequest?.sentTo?.name;

  return (
    <>
      <Topbar
        title={client.name}
        subtitle={`${client.engagementType}${showAmt && client.cycleAmount ? ` · ${client.currency} ${client.cycleAmount}` : ''}${currentRecruiter ? ` · sourcing: ${currentRecruiter}` : ''}`}
        actions={
          <>
            <Button size="sm" onClick={() => navigate(-1)}><ArrowLeft size={14}/> Back</Button>
            {actions}
          </>
        }
      />
      <Page>
        {/* State-specific callouts */}
        {client.lifecycle === 'WithRecruiters' && (
          <div className="callout purple">
            <strong>With recruiters.</strong>{' '}
            {(() => {
              // Find the recruiter currently sourcing
              const openReq = (client.sourcingRequests || []).find((r: any) => r.status === 'Open' || r.status === 'Proposed');
              const recruiter = openReq?.sentTo?.name;
              return recruiter
                ? <span>Currently being sourced by <strong>{recruiter}</strong>. Ownership stays with {client.intakeOwner?.name || 'Team 2'} — they'll verify proposals when ready.</span>
                : <span>Aman/Kanchan are sourcing a trainer for this client.</span>;
            })()}
          </div>
        )}
        {client.lifecycle === 'VerificationPending' && hasAnyProposal && (
          <div className="callout">
            Verification pending — a recruiter proposed a trainer; Team 2 must Pass/Fail before scheduling demo.{' '}
            <Link to="/verifications" className="text-brand-amber underline">Go to verifications →</Link>
          </div>
        )}
        {client.lifecycle === 'VerificationPending' && !hasAnyProposal && (
          <div className="callout red">
            Stuck in <strong>Verify proposal</strong> with <strong>no proposals on file</strong> —
            move it back to <em>With recruiters</em> (ask Aman/Kanchan for proposals) or to
            <em> Internal search</em> (try the pool again). Use the buttons above.
          </div>
        )}
        {client.lifecycle === 'SaleWon' && (
          <div className="callout">Awaiting handover. Mitali: assign host, confirm trainer, set schedule.</div>
        )}
        {/* Demo outcome (visible once Demo Done was captured) */}
        {client.demoFeedback && (
          <div className={`callout ${client.demoOutcome === 'Positive' ? 'green' : client.demoOutcome === 'Negative' ? 'red' : ''}`}>
            <strong>Demo outcome:</strong> <Pill color={client.demoOutcome === 'Positive' ? 'green' : client.demoOutcome === 'Negative' ? 'red' : 'amber'}>{client.demoOutcome || 'Neutral'}</Pill>
            {client.demoActualDate && <span className="ml-2 mono text-xs">{client.demoActualDate}{client.demoActualTimeIst ? ' · ' + client.demoActualTimeIst + ' IST' : ''}</span>}
            <div className="text-xs mt-1"><strong>Feedback:</strong> {client.demoFeedback}</div>
            {client.demoNextSteps && <div className="text-xs mt-0.5"><strong>Next steps:</strong> {client.demoNextSteps}</div>}
          </div>
        )}
        {client.lifecycle === 'Hold' && (
          <div className="callout red">On hold. Resume from here when ready.</div>
        )}
        {client.lifecycle === 'Dormant' && (
          <div className="callout" style={{ borderLeftColor: '#6B6F78' }}>
            <strong>Dormant since {client.dormantSince || '—'}.</strong>{' '}
            {client.dormantReason && <span>Reason: <em>{client.dormantReason}</em>. </span>}
            {client.dormantCheckBackOn && (
              <span>
                Check back: <strong className={client.dormantCheckBackOn <= todayISO() ? 'text-brand-amber' : ''}>{client.dormantCheckBackOn}</strong>
                {client.dormantCheckBackOn <= todayISO() ? ' (due now — reach out)' : ''}.{' '}
              </span>
            )}
            {client.dormantResumeFromStage && <span className="muted">Was at: {stageLabel(client.dormantResumeFromStage)}.</span>}
          </div>
        )}
        {client.paymentPendingVaibhav && (
          <div className="callout">Pending on Vaibhav since {client.pendingVaibhavSince}. Vaibhav handles this payment personally.</div>
        )}

        <div className="grid lg:grid-cols-3 gap-3 mb-4">
          {/* LEFT 2 cols */}
          <div className="lg:col-span-2 space-y-3">
            {hasIntake && (
              <div className="card">
                <div className="card-h">8-point intake {client.intakeReceivedAt && <span className="muted normal-case font-normal">received {client.intakeReceivedAt}</span>}</div>
                <div className="grid md:grid-cols-2 gap-2">
                  {INTAKE_FIELDS.map((f) => (
                    <div key={f.key} className="bg-bg-input border-l-2 border-brand-blue rounded p-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-brand-textMuted font-semibold mb-1">{f.label}</div>
                      <div className={`text-sm ${intake[f.key] ? '' : 'text-brand-textMuted italic'}`}>
                        {intake[f.key] || 'not captured'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showAmt ? (
              <div className="card">
                <div className="card-h">
                  <span>{isTraining ? 'Training engagement' : 'Cycle · Package'}</span>
                  {canEditClient(user.role, 'engagement') && (
                    <Button size="sm" onClick={() => setModal('editEngagement')}><EditIcon size={12}/></Button>
                  )}
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td className="muted py-1 w-2/5">Engagement</td><td><Pill color={client.engagementType === 'Training' ? 'purple' : client.engagementType === 'TaskBased' ? 'pink' : 'grey'}>{client.engagementType}</Pill></td></tr>
                    <tr><td className="muted py-1">Package</td><td>{client.paymentModel || (isTraining ? 'fixed scope' : '—')}{showAmt && client.cycleAmount ? <> · <span className="mono">{client.currency} {client.cycleAmount}</span></> : null}</td></tr>
                    <tr><td className="muted py-1">Fresh payment</td><td>{client.freshPaymentReceived ? <><Pill color="green">Received {client.freshPaymentDate}</Pill>{showAmt && <span className="mono ml-1">{client.currency} {client.freshPaymentAmount}</span>}</> : <Pill color="amber">Not yet</Pill>}</td></tr>
                    {client.cycleStart && !isTraining && <tr><td className="muted py-1">Current cycle</td><td className="mono">{client.cycleStart} → {client.cycleEnd}</td></tr>}
                    {client.nextRenewalDue && !isTraining && <tr><td className="muted py-1">Next renewal</td><td className="mono text-brand-amber font-semibold">{client.nextRenewalDue}</td></tr>}
                    {client.sessionsPerCycle > 0 && !isTraining && <tr><td className="muted py-1">Sessions</td><td className="mono">{client.sessionsUsed} / {client.sessionsPerCycle}</td></tr>}
                    {client.bankAccount && <tr><td className="muted py-1">Routed to bank</td><td><Pill>{client.bankAccount.label}</Pill></td></tr>}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card">
                <div className="card-h">Engagement</div>
                <div className="text-sm space-y-1">
                  <div><span className="muted">Type:</span> <Pill>{client.engagementType}</Pill></div>
                  {client.cycleStart && <div><span className="muted">Cycle:</span> <span className="mono">{client.cycleStart} → {client.cycleEnd}</span></div>}
                </div>
                <div className="muted text-[11px] mt-2 p-2 bg-bg-page rounded">
                  Payment amounts are restricted to founder, demo_lead, manager, sales_closer, accounts.
                </div>
              </div>
            )}

            {showAmt && (
              <div className="card">
                <div className="card-h">Payment history · {client.payments?.length || 0}</div>
                {!client.payments?.length ? (
                  <div className="muted text-sm">No payments yet.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-brand-textMuted text-xs"><th className="text-left py-1">Date</th><th className="text-left py-1">Kind</th><th className="text-right py-1">Amount</th><th className="text-left py-1">Bank</th></tr></thead>
                    <tbody>
                      {client.payments.map((p: any) => (
                        <tr key={p.id}>
                          <td className="mono py-1">{p.paymentDate}</td>
                          <td><Pill color={p.kind === 'Fresh' ? 'blue' : 'green'}>{p.kind}</Pill></td>
                          <td className="mono text-right">{p.currency} {p.amount}</td>
                          <td className="text-xs">{p.bankAccount?.label || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* RIGHT col */}
          <div className="space-y-3">
            <div className="card">
              <div className="card-h">
                <span>Contact</span>
                {canEditClient(user.role, 'contact') ? (
                  <Button size="sm" onClick={() => setModal('editContact')}><EditIcon size={12}/></Button>
                ) : (
                  <span className="text-[10px] muted normal-case font-normal">read-only</span>
                )}
              </div>
              <div className="text-[11px] muted">WhatsApp group</div>
              <div className="mb-2.5 break-words">
                {client.whatsappGroupName ? <strong>{client.whatsappGroupName}</strong> : <span className="muted">Not set</span>}
                {client.whatsappGroupLink && (
                  <div className="text-[11px] mt-1"><a href={client.whatsappGroupLink} target="_blank" rel="noreferrer" style={{ color: '#25D366' }}>Open group →</a></div>
                )}
              </div>
              <div className="text-[11px] muted">Direct phone (backup)</div>
              <div className="mono mb-2 text-sm">
                {client.phoneDigits ? formatPhone(client.phoneCode, client.phoneDigits) : <span className="muted">—</span>}
                {client.phoneDigits && <a className="ml-1 text-xs" href={waLink(client.phoneCode, client.phoneDigits)} target="_blank" rel="noreferrer" style={{ color: '#25D366' }}>[WA]</a>}
              </div>
              <div className="text-[11px] muted">Email</div>
              <div className="mono text-xs break-all">{client.email || intake.client_email || '—'}</div>
            </div>

            <div className="card">
              <div className="card-h">Ownership chain</div>
              <Field label="Lead captured by">{client.leadOwner?.name || '—'}</Field>
              <Field label="Intake owner (Team 2)">{client.intakeOwner?.name || '—'}</Field>
              {currentRecruiter && (
                <Field label="Currently sourcing (Team 1)">
                  <span className="text-brand-pink">{currentRecruiter}</span>
                  <span className="muted text-[11px] ml-1">· temporary while sourcing</span>
                </Field>
              )}
              <Field label="Sales close (Roshni)">{client.salesOwner?.name || '—'}</Field>
              <Field label="Host (Team 5)">{client.hostOwner?.name || '—'}</Field>
              <Field label="Primary trainer">
                {client.primaryTrainer ? (
                  <Link to={`/trainers/${client.primaryTrainer.id}`} className="text-brand-blue">{client.primaryTrainer.name}</Link>
                ) : <span className="muted">Not assigned</span>}
                {client.engagementTrainerRateInr > 0 && <span className="muted"> · ₹{client.engagementTrainerRateInr}</span>}
              </Field>
            </div>

            <div className="card">
              <div className="card-h">
                <span>Engagement</span>
                {canEditClient(user.role, 'engagement') ? (
                  <Button size="sm" onClick={() => setModal('editEngagement')}><EditIcon size={12}/></Button>
                ) : (
                  <Button size="sm" onClick={() => showToast('Request edit flow — for now ask Vaibhav/Samita/Mitali', 'error')}><MessageCircle size={12}/> request</Button>
                )}
              </div>
              <Field label="Source">{client.source || '—'}</Field>
              {client.partner && <Field label="Partner">{client.partner.name}</Field>}
              {showAmt && <Field label="Currency · Amount"><span className="mono">{client.currency} {client.cycleAmount || 0}</span></Field>}
              <Field label="Verification">{client.requiresVerification ? <Pill color="green">Required</Pill> : <Pill>Disabled</Pill>}</Field>
              {client.notes && <Field label="Notes"><div className="whitespace-pre-wrap text-xs">{client.notes}</div></Field>}
            </div>

            <DemoHistoryCard clientId={client.id} />
            <MessagesHistoryCard clientId={client.id} />
          </div>
        </div>

        {/* MODALS */}
        {modal === 'sendEmail' && (
          <SendMessageModal
            recipient={{
              name: client.name,
              email: client.email || (client.intakeData as any)?.client_email || '',
              phone: client.phoneDigits ? `${client.phoneCode || ''}${client.phoneDigits}` : '',
            }}
            clientId={client.id}
            stage={client.lifecycle}
            defaultKind="Email"
            onClose={() => setModal(null)}
          />
        )}
        {modal === 'sendWA' && (
          <SendMessageModal
            recipient={{
              name: client.name,
              email: client.email || (client.intakeData as any)?.client_email || '',
              phone: client.phoneDigits ? `${client.phoneCode || ''}${client.phoneDigits}` : '',
            }}
            clientId={client.id}
            stage={client.lifecycle}
            defaultKind="WhatsApp"
            onClose={() => setModal(null)}
          />
        )}
        {modal === 'assignOwner' && <AssignOwnerModal client={client} onClose={() => setModal(null)} />}
        {modal === 'editContact' && <EditContactModal client={client} onClose={() => setModal(null)} />}
        {modal === 'editEngagement' && <EditEngagementModal client={client} onClose={() => setModal(null)} />}
        {modal === 'recordIntake' && <RecordIntakeModal client={client} onClose={() => setModal(null)} />}
        {modal === 'sendIntake' && <SendIntakeModal client={client} onClose={() => setModal(null)} />}
        {modal === 'internalSearch' && <InternalSearchModal client={client} onClose={() => setModal(null)} />}
        {modal === 'scheduleDemo' && <ScheduleDemoModal client={client} onClose={() => setModal(null)} />}
        {modal === 'demoDone' && <DemoDoneModal client={client} onClose={() => setModal(null)} />}
        {modal === 'freshPayment' && <PaymentModal client={client} kind="Fresh" onClose={() => setModal(null)} />}
        {modal === 'renewal' && <PaymentModal client={client} kind="Renewal" onClose={() => setModal(null)} />}
        {modal === 'leverage' && <LeverageModal client={client} onClose={() => setModal(null)} />}
        {modal === 'hold' && <HoldModal client={client} onClose={() => setModal(null)} />}
        {modal === 'moveBack' && <MoveBackwardsModal client={client} onClose={() => setModal(null)} />}
        {modal === 'dormant' && <DormantModal client={client} onClose={() => setModal(null)} />}
        {modal === 'resume' && <ResumeFromDormantModal client={client} onClose={() => setModal(null)} />}
        {modal === 'welcomeEmail' && <WelcomeEmailModal client={client} onClose={() => setModal(null)} />}
        {modal === 'postDemoFeedback' && <PostDemoFeedbackModal client={client} onClose={() => setModal(null)} />}
        {modal === 'sendSkillMatrix' && <SendSkillMatrixModal client={client} onClose={() => setModal(null)} />}
        {modal === 'preDemoReminder' && <PreDemoReminderModal client={client} onClose={() => setModal(null)} />}
        {modal === 'engagementLetter' && <EngagementLetterModal client={client} onClose={() => setModal(null)} />}
        {modal === 'handoverWelcome' && <HandoverWelcomeModal client={client} onClose={() => setModal(null)} />}
      </Page>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 text-sm">
      <div className="text-[11px] muted">{label}</div>
      <div>{children}</div>
    </div>
  );
}

// ----- MODALS -----

function EditContactModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const [f, setF] = useState({
    whatsappGroupName: client.whatsappGroupName || '',
    whatsappGroupLink: client.whatsappGroupLink || '',
    phoneCode: client.phoneCode || '+1',
    phoneDigits: client.phoneDigits || '',
    email: client.email || '',
  });
  const save = useMutation({
    mutationFn: () => api.patch(`/clients/${client.id}`, f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client', client.id] }); showToast('Saved'); onClose(); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Edit contact · ${client.name}`} description="WhatsApp group is primary. Direct phone is backup.">
        <div className="form-row"><Label>WhatsApp group name</Label><Input value={f.whatsappGroupName} onChange={(e) => setF({...f, whatsappGroupName: e.target.value})} /></div>
        <div className="form-row"><Label>WhatsApp group invite link</Label><Input value={f.whatsappGroupLink} onChange={(e) => setF({...f, whatsappGroupLink: e.target.value})} placeholder="https://chat.whatsapp.com/..." /></div>
        <div className="form-row"><Label>Direct phone (backup)</Label>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <Select value={f.phoneCode} onChange={(e) => setF({...f, phoneCode: e.target.value})}>
              <option>+1</option><option>+91</option><option>+44</option><option>+61</option><option>+971</option><option>+65</option>
            </Select>
            <Input value={f.phoneDigits} onChange={(e) => setF({...f, phoneDigits: e.target.value.replace(/\D/g,'')})} placeholder="10 digits" />
          </div>
        </div>
        <div className="form-row"><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({...f, email: e.target.value})} /></div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!f.whatsappGroupName && !f.phoneDigits} onClick={() => save.mutate()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEngagementModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const { data: sources } = useQuery({ queryKey: ['sources'], queryFn: () => api.get('/sources').then(r => r.data) });
  const { data: partners } = useQuery({ queryKey: ['partners'], queryFn: () => api.get('/partners').then(r => r.data) });
  const [f, setF] = useState({
    source: client.source || '',
    engagementType: client.engagementType || 'Support',
    funderType: client.funderType || 'Self',
    partnerId: client.partnerId || '',
    currency: client.currency || 'USD',
    cycleAmount: client.cycleAmount || 0,
  });
  const save = useMutation({
    mutationFn: () => api.patch(`/clients/${client.id}`, { ...f, cycleAmount: +f.cycleAmount, partnerId: f.partnerId || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client', client.id] }); showToast('Saved'); onClose(); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Edit engagement · ${client.name}`}>
        <div className="grid md:grid-cols-2 gap-2.5">
          <div className="form-row"><Label>Source</Label><Select value={f.source} onChange={(e) => setF({...f, source: e.target.value})}>{(sources || []).map((s: any) => <option key={s.id}>{s.name}</option>)}</Select></div>
          <div className="form-row"><Label>Engagement type</Label><Select value={f.engagementType} onChange={(e) => setF({...f, engagementType: e.target.value})}><option>Support</option><option>Training</option><option>TaskBased</option></Select></div>
          <div className="form-row"><Label>Funder</Label><Select value={f.funderType} onChange={(e) => setF({...f, funderType: e.target.value})}><option value="Self">Self</option><option value="Partner">Partner (B2B)</option></Select></div>
          <div className="form-row"><Label>Partner</Label><Select value={f.partnerId} onChange={(e) => setF({...f, partnerId: e.target.value})}><option value="">— none —</option>{(partners || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
          <div className="form-row"><Label>Currency</Label><Select value={f.currency} onChange={(e) => setF({...f, currency: e.target.value})}><option>USD</option><option>CAD</option><option>INR</option></Select></div>
          <div className="form-row"><Label>Cycle amount</Label><Input type="number" value={f.cycleAmount} onChange={(e) => setF({...f, cycleAmount: +e.target.value})} /></div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const INTAKE_TEMPLATE = `Hi Dear,
Greetings from MITS Solution
Thanks for showing interest with us !!
I would like some details from you to take up your demo to next steps:-
1) Detailed skill set:-
2) Any current priority task:-
3) Email id:-
4) Available timing for Demo call in IST ( Morning and Evening both):-
5) Preferred Session timing in IST (Once we get started):-
6) Specific Trainer Experience/Preference (if any):-
7) Open to connect with zoom/webex (if not,recommened?):-
8) Anything additional you want :-`;

function SendIntakeModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [groupName, setGroupName] = useState(client.whatsappGroupName || '');
  const [groupLink, setGroupLink] = useState(client.whatsappGroupLink || '');

  const saveGroup = useMutation({
    mutationFn: () => api.patch(`/clients/${client.id}`, { whatsappGroupName: groupName, whatsappGroupLink: groupLink }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client', client.id] }); showToast('Group saved'); setShowEditGroup(false); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const send = useMutation({
    mutationFn: async () => {
      // Auto-claim ownership for demo_intake/demo_lead
      if (!client.intakeOwnerId && ['demo_intake', 'demo_lead'].includes(user.role)) {
        try { await api.patch(`/clients/${client.id}`, { intakeOwnerId: user.id }); } catch {}
      }
      await api.post(`/clients/${client.id}/stage`, { lifecycle: 'IntakeSent' });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client', client.id] }); showToast('Marked intake sent'); onClose(); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const copy = () => { navigator.clipboard.writeText(INTAKE_TEMPLATE); showToast('Copied — paste into the group'); };
  const copyAndOpen = () => {
    navigator.clipboard.writeText(INTAKE_TEMPLATE);
    if (client.whatsappGroupLink) window.open(client.whatsappGroupLink, '_blank');
    showToast('Copied & group opened — paste in WhatsApp');
  };
  const directWA = () => {
    const phone = `${client.phoneCode || ''}${client.phoneDigits || ''}`.replace(/[^0-9]/g, '');
    if (!phone) { showToast('No phone on file', 'error'); return; }
    navigator.clipboard.writeText(INTAKE_TEMPLATE);
    window.open(`https://wa.me/${phone}`, '_blank');
    showToast('Direct WhatsApp opened + message copied (backup — group is preferred)');
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Send intake · ${client.name}`} description="MITS 8-point intake. Group is the primary channel; direct phone is backup." className="max-w-2xl">
        {client.whatsappGroupName && !showEditGroup ? (
          <div className="callout green" style={{ borderColor: '#25D366' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <strong>Group: {client.whatsappGroupName}</strong>
              {client.whatsappGroupLink ? (
                <span className="text-[11px] muted">· invite link saved</span>
              ) : (
                <span className="text-[11px]" style={{ color: '#F59E0B' }}>· no invite link — add one to enable 1-click open</span>
              )}
              <button onClick={() => setShowEditGroup(true)} className="text-[11px] underline ml-auto">edit</button>
            </div>
          </div>
        ) : (
          <div className="callout" style={{ borderColor: '#F59E0B' }}>
            <div className="text-[12px] mb-2">
              {client.whatsappGroupName ? 'Edit WhatsApp group:' : 'No WhatsApp group on file. Add one (recommended) or send to direct phone as backup.'}
            </div>
            <div className="grid md:grid-cols-2 gap-2">
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name e.g. Karthik · Java · MITS" />
              <Input value={groupLink} onChange={(e) => setGroupLink(e.target.value)} placeholder="https://chat.whatsapp.com/..." />
            </div>
            <div className="flex gap-1.5 mt-2">
              <Button size="sm" variant="primary" disabled={!groupName} onClick={() => saveGroup.mutate()}>Save group</Button>
              {client.whatsappGroupName && <Button size="sm" onClick={() => setShowEditGroup(false)}>Cancel</Button>}
            </div>
          </div>
        )}

        <div className="form-row">
          <Label>Intake message (8-point template)</Label>
          <Textarea readOnly rows={12} value={INTAKE_TEMPLATE} style={{ fontFamily: 'monospace', fontSize: 12 }} />
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={copy}>Copy message</Button>
          {client.whatsappGroupLink && (
            <Button onClick={copyAndOpen} style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}>
              <MessageCircle size={14}/> Copy & open group
            </Button>
          )}
          {!client.whatsappGroupLink && (client.phoneDigits) && (
            <Button onClick={directWA} title="Backup — group preferred">
              <MessageCircle size={14}/> Direct phone WA (backup)
            </Button>
          )}
          <Button variant="primary" onClick={() => send.mutate()}><Send size={14}/> Mark as sent</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Heuristic parser: takes free-form text (WhatsApp paste, email reply, etc.) and
 * extracts intake fields. Returns a partial map keyed by INTAKE_FIELDS keys.
 *
 * Strategy:
 *   1. Line-by-line "Label: value" scan, normalising labels to known aliases.
 *   2. Field-specific regex fallback for email + meeting tool detection.
 *   3. Anything not matched ends up in additional_notes if it's not empty.
 *
 * We never overwrite a field that is already non-empty in the existing data.
 */
function parseIntakeMessage(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text || !text.trim()) return out;

  // Map of normalised label → INTAKE_FIELDS key
  const labelMap: Record<string, string> = {
    'email': 'client_email', 'email id': 'client_email', 'email address': 'client_email', 'mail': 'client_email',
    'demo time': 'demo_timing_ist', 'demo timing': 'demo_timing_ist', 'demo': 'demo_timing_ist', 'demo slot': 'demo_timing_ist',
    'session time': 'session_timing_ist', 'session timing': 'session_timing_ist', 'session': 'session_timing_ist',
    'sessions': 'session_timing_ist', 'class timing': 'session_timing_ist', 'preferred timing': 'session_timing_ist',
    'trainer': 'trainer_preference', 'trainer preference': 'trainer_preference', 'preferred trainer': 'trainer_preference',
    'trainer pref': 'trainer_preference', 'tutor preference': 'trainer_preference',
    'meeting': 'meeting_tool', 'meeting tool': 'meeting_tool', 'platform': 'meeting_tool',
    'tool': 'meeting_tool', 'video tool': 'meeting_tool', 'app': 'meeting_tool',
    'skill': 'detailed_skill_set', 'skills': 'detailed_skill_set', 'skill set': 'detailed_skill_set',
    'tech': 'detailed_skill_set', 'tech stack': 'detailed_skill_set', 'technology': 'detailed_skill_set',
    'topic': 'detailed_skill_set', 'topics': 'detailed_skill_set', 'subject': 'detailed_skill_set',
    'priority': 'current_priority_task', 'priority task': 'current_priority_task', 'task': 'current_priority_task',
    'project': 'current_priority_task', 'current task': 'current_priority_task', 'work': 'current_priority_task',
    'note': 'additional_notes', 'notes': 'additional_notes', 'additional': 'additional_notes',
    'additional notes': 'additional_notes', 'other': 'additional_notes', 'comments': 'additional_notes',
  };

  const lines = text.split(/\r?\n/);
  const unmatched: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Match "Label: value" or "Label - value" or "Label = value"  (label is up to 30 chars, no colon inside)
    const m = line.match(/^([A-Za-z][A-Za-z _/-]{1,29})\s*[:\-=–—]\s*(.+)$/);
    if (m) {
      const labelNorm = m[1].trim().toLowerCase().replace(/[_]/g, ' ').replace(/\s+/g, ' ');
      const value = m[2].trim();
      const key = labelMap[labelNorm];
      if (key && !out[key]) {
        out[key] = value;
        continue;
      }
    }
    unmatched.push(line);
  }

  // Email regex fallback (anywhere in text)
  if (!out.client_email) {
    const e = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (e) out.client_email = e[0];
  }

  // Meeting-tool keyword fallback
  if (!out.meeting_tool) {
    const tools = ['Zoom', 'Google Meet', 'Meet', 'Microsoft Teams', 'Teams', 'Webex', 'Skype', 'GoToMeeting'];
    for (const t of tools) {
      const re = new RegExp(`\\b${t.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (re.test(text)) { out.meeting_tool = t; break; }
    }
  }

  // Whatever didn't match a label goes into additional_notes (if not already set)
  if (!out.additional_notes && unmatched.length) {
    const leftover = unmatched.join('\n').trim();
    // Only stash leftover if we actually parsed something else — otherwise the whole message is just notes
    if (Object.keys(out).length > 0) {
      out.additional_notes = leftover;
    } else {
      // Whole message is unstructured; put it as a note for Anjali to review
      out.additional_notes = leftover;
    }
  }

  return out;
}

function RecordIntakeModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const [data, setData] = useState<Record<string, string>>({ ...((client.intakeData as any) || {}) });
  const [raw, setRaw] = useState('');
  const [lastFilled, setLastFilled] = useState<string[]>([]);

  function applyAutoFill() {
    const parsed = parseIntakeMessage(raw);
    const filled: string[] = [];
    setData((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(parsed)) {
        // Only overwrite if the existing value is empty (Anjali's edits win)
        if (v && !next[k]?.trim()) {
          next[k] = v;
          filled.push(k);
        }
      }
      return next;
    });
    setLastFilled(filled);
    if (filled.length === 0) {
      showToast('Nothing new to fill — fields already populated or message unrecognised', 'error');
    } else {
      showToast(`Auto-filled ${filled.length} field${filled.length === 1 ? '' : 's'}`);
    }
  }

  function clearRaw() {
    setRaw('');
    setLastFilled([]);
  }

  // Welcome email fires automatically on the transition Lead/IntakeSent → IntakeReceived only.
  // Default checked; user can untick. Hidden if client has no email or we're just editing an existing intake.
  const isFirstReceive = client.lifecycle === 'Lead' || client.lifecycle === 'IntakeSent';
  const clientEmail = client.email || (client.intakeData as any)?.client_email || data.client_email || '';
  // Default checked when an email is on file; auto-uncheck as soon as the email is removed.
  const [sendWelcome, setSendWelcome] = useState<boolean>(!!clientEmail);
  useEffect(() => {
    setSendWelcome((prev) => (clientEmail ? prev : false));
  }, [clientEmail]);

  const save = useMutation({
    mutationFn: async () => {
      // 1. Save workflow fields via PATCH ("workflow" category — Anjali/Taran allowed)
      await api.patch(`/clients/${client.id}`, {
        intakeData: data,
        intakeReceivedAt: todayISO(),
        intakeSkillHint: data.detailed_skill_set || client.intakeSkillHint,
      });
      // 2. Stage transition via dedicated endpoint (its own role gate)
      if (isFirstReceive) {
        await api.post(`/clients/${client.id}/stage`, { lifecycle: 'IntakeReceived' });
      }
      // 3. Auto-send the branded welcome email (only on first move into IntakeReceived, when checked, when email present)
      let welcomeSent = false;
      if (isFirstReceive && sendWelcome && clientEmail) {
        try {
          await api.post(`/clients/${client.id}/welcome-email`);
          welcomeSent = true;
        } catch (e: any) {
          // Non-fatal: intake was saved, welcome email failed — surface the error but don't roll back
          showToast(`Intake saved · welcome email failed: ${e.response?.data?.error || 'unknown'}`, 'error');
        }
      }
      return { welcomeSent };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['messages'] });
      showToast(r?.welcomeSent ? 'Intake saved · welcome email sent ✓' : 'Saved');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Record intake replies · ${client.name}`} description="Paste the client's reply at the top and Auto-fill — or type each field manually." className="max-w-2xl">

        {/* Raw message paste + auto-fill */}
        <div className="bg-bg-input rounded p-3 mb-3 border border-brand-border">
          <Label>Paste client's reply (WhatsApp / email / form) — optional</Label>
          <Textarea
            rows={4}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={`Email: john@example.com\nDemo timing: 8 PM IST\nSession timing: 9-10 PM weekdays\nTrainer preference: Indian, female\nMeeting tool: Zoom\nSkills: React, Node.js, MongoDB\nPriority: deliver dashboard feature\nNotes: need to start within 2 weeks`}
            className="mono text-xs"
          />
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Button size="sm" variant="primary" onClick={applyAutoFill} disabled={!raw.trim()}>
              Auto-fill from message
            </Button>
            {raw && (
              <Button size="sm" onClick={clearRaw}>Clear</Button>
            )}
            <span className="text-[11px] muted">
              Recognises common labels (Email, Demo timing, Skills, …) and falls back to regex for emails/meeting tools.
              Anything unmatched lands in <em>Additional notes</em>. Existing values are never overwritten — edit any field below.
            </span>
          </div>
          {lastFilled.length > 0 && (
            <div className="text-[11px] text-brand-green mt-1">
              Filled: {lastFilled.map((k) => INTAKE_FIELDS.find((f) => f.key === k)?.label || k).join(' · ')}
            </div>
          )}
        </div>

        {INTAKE_FIELDS.map((f) => {
          const wasAutoFilled = lastFilled.includes(f.key);
          return (
            <div key={f.key} className="form-row">
              <Label>
                {f.label}{f.required ? ' *' : ''}
                {wasAutoFilled && <span className="ml-1.5 text-[10px] text-brand-green font-semibold uppercase">auto-filled — review</span>}
              </Label>
              <Textarea
                rows={f.key === 'detailed_skill_set' || f.key === 'current_priority_task' || f.key === 'additional_notes' ? 2 : 1}
                value={data[f.key] || ''}
                onChange={(e) => {
                  setData({ ...data, [f.key]: e.target.value });
                  // Once Anjali edits an auto-filled value, remove the badge
                  if (wasAutoFilled) setLastFilled((s) => s.filter((k) => k !== f.key));
                }}
                style={wasAutoFilled ? { borderColor: '#22C55E', background: 'rgba(34,197,94,0.05)' } : undefined}
              />
            </div>
          );
        })}

        {isFirstReceive && (
          <div className="mt-3 p-2.5 bg-bg-input rounded">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sendWelcome}
                onChange={(e) => setSendWelcome(e.target.checked)}
                className="mt-0.5"
                disabled={!clientEmail}
              />
              <div className="text-sm">
                <div className="font-medium">Send welcome email automatically</div>
                <div className="text-xs muted mt-0.5">
                  Sends the branded <em>"Introducing MITS Solution"</em> email to {clientEmail || '(client)'} with the Client Interest Document, team intro, and Samita's signature.
                  {!clientEmail && <span className="text-brand-amber"> · No client email on file — provide an email above to enable.</span>}
                </div>
              </div>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!data.detailed_skill_set || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save replies'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Weighted matching modal. Pulls /api/trainers/match?clientId=… which scores every
// active trainer across skill / cost / total sessions / Team-5 sessions / demo success / past clients.
// Weights live in URL params so the modal can tweak them on the fly.
// Default recruiter partner per intake person — same map as backend.
const DEFAULT_RECRUITER_FOR: Record<string, string> = {
  'u-anjali': 'u-aman',
  'u-taran':  'u-kanchan',
};

// Default weighting — heavy on skill match, cost as the secondary lever, rest small.
// Only founder/demo_lead can tune these; the demo intake team gets the result as-is.
const DEFAULT_MATCH_WEIGHTS = { skill: 55, cost: 18, demoSuccess: 10, pastClients: 8, sessionCount: 5, teamSessions: 4 };
const canTuneMatchWeights = (role: string) => ['founder', 'demo_lead'].includes(role);

function InternalSearchModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;
  const [rateById, setRateById] = useState<Record<string, number>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [weights, setWeights] = useState({ ...DEFAULT_MATCH_WEIGHTS });
  const [trainerSearch, setTrainerSearch] = useState('');
  const adminTune = canTuneMatchWeights(user.role);
  // Pre-fill recruiter based on the current user (Anjali→Aman, Taran→Kanchan),
  // falling back to the client's intake-owner's partner.
  const defaultRecruiter =
    DEFAULT_RECRUITER_FOR[user.id] ||
    DEFAULT_RECRUITER_FOR[client.intakeOwnerId || ''] ||
    'u-aman';
  const [selectedRecruiter, setSelectedRecruiter] = useState<string>(defaultRecruiter);

  const { data, isLoading } = useQuery({
    queryKey: ['match', client.id, weights],
    queryFn: () => api.get('/trainers/match', { params: { clientId: client.id, ...weights } }).then((r) => r.data),
  });

  // Pull the team so we can render the recruiter dropdown
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });
  const recruiters = (users || []).filter((u: any) => u.active && u.role === 'recruiter');

  const pick = useMutation({
    mutationFn: async ({ trainerId, rate }: any) => {
      await api.patch(`/clients/${client.id}`, { primaryTrainerId: trainerId, engagementTrainerRateInr: rate });
      await api.post(`/clients/${client.id}/stage`, { lifecycle: 'TrainerMatched' });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client', client.id] }); showToast('Trainer matched'); onClose(); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const toRecruiters = useMutation({
    mutationFn: () => api.post('/sourcing', { clientId: client.id, sentToId: selectedRecruiter }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['sourcing'] });
      const routedTo = r.data?.sentTo?.name || 'recruiter';
      showToast(`Sent to ${routedTo}`);
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const skillRaw = data?.client?.skills || (client.intakeData as any)?.detailed_skill_set || '';
  const results = data?.results || [];

  const showBudget = canSeeFinancial(user.role);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Trainer matching · ${client.name}`}
        description={`Required: ${skillRaw || '(none captured)'}${showBudget ? ` · Budget: ${client.currency} ${client.cycleAmount || '—'}` : ''}`}
        className="max-w-4xl"
      >
        {/* Search any trainer (always visible — direct pool allocation) */}
        <div className="mb-3">
          <Input
            placeholder="Search any trainer by name, skill, or phone…"
            value={trainerSearch}
            onChange={(e) => setTrainerSearch(e.target.value)}
          />
          <div className="text-[10px] muted mt-1">
            {trainerSearch
              ? 'Showing all trainers in the pool that match your search (sorted by score).'
              : 'Top matches ranked by current weighting. Type to search the full pool.'}
          </div>
        </div>

        {/* Weight tuning — admins only (founder + demo_lead). Anjali/Taran see the result, not the dials. */}
        {adminTune && (
          <div className="callout blue mb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs">
                <strong>Weighted score:</strong> skill {weights.skill} · cost {weights.cost} · sessions {weights.sessionCount} · Team-5 sessions {weights.teamSessions} · demo success {weights.demoSuccess} · past clients {weights.pastClients}
              </div>
              <Button size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
                {showAdvanced ? 'Hide weights' : 'Tune weights'}
              </Button>
            </div>
            {showAdvanced && (
              <div className="grid md:grid-cols-3 gap-2 mt-3">
                {Object.entries(weights).map(([k, v]) => (
                  <div key={k} className="bg-bg-input rounded p-2">
                    <Label>{k}</Label>
                    <Input type="number" min={0} max={100} value={v} onChange={(e) => setWeights({ ...weights, [k]: Math.max(0, Math.min(100, +e.target.value)) })} />
                  </div>
                ))}
                <Button size="sm" onClick={() => setWeights({ ...DEFAULT_MATCH_WEIGHTS })}>Reset defaults</Button>
              </div>
            )}
          </div>
        )}

        <div className="max-h-[460px] overflow-y-auto space-y-2">
          {isLoading && <div className="muted text-center py-4">Scoring…</div>}
          {!isLoading && results.length === 0 && <div className="muted text-center py-6">No active trainers in pool.</div>}
          {(() => {
            const q = trainerSearch.trim().toLowerCase();
            const filtered = q
              ? results.filter(({ trainer: t }: any) => {
                  const hay = `${t.name || ''} ${t.skills || ''} ${t.phoneDigits || ''} ${t.email || ''}`.toLowerCase();
                  return hay.includes(q);
                })
              : results.slice(0, 12);
            if (q && filtered.length === 0) return <div className="muted text-center py-6">No trainers match "{trainerSearch}".</div>;
            return filtered;
          })().map(({ trainer: t, total, breakdown }: any) => {
            const rate = rateById[t.id] ?? t.defaultRateInr;
            return (
              <div key={t.id} className={`border rounded-md p-3 ${total >= 60 ? 'border-brand-green bg-brand-green/5' : 'border-brand-border'}`}>
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{t.name}</span>
                      <span className="muted text-[11px]">{t.experienceYears}yrs · ₹{t.defaultRateInr} {t.rateModel === 'hourly' ? '/hr' : '/sess'}</span>
                      {t.phoneDigits && <span className="muted mono text-[11px]">· {t.phoneCode} {t.phoneDigits}</span>}
                    </div>
                    <div className="muted text-xs mt-0.5"><strong>Skills:</strong> {t.skills || '—'}</div>
                    <div className="grid grid-cols-6 gap-1 text-[10px] mt-2">
                      {[
                        { k: 'skill', label: 'Skill', v: breakdown.skill },
                        { k: 'cost', label: 'Cost', v: breakdown.cost },
                        { k: 'sessionCount', label: 'Sessions', v: breakdown.sessionCount },
                        { k: 'teamSessions', label: 'Team-5', v: breakdown.teamSessions },
                        { k: 'demoSuccess', label: 'Demo ✓', v: breakdown.demoSuccess },
                        { k: 'pastClients', label: 'Clients', v: breakdown.pastClients },
                      ].map(({ k, label, v }) => (
                        <div key={k} className="bg-bg-input rounded px-1.5 py-1 text-center">
                          <div className="muted">{label}</div>
                          <div className="font-bold" style={{ color: v >= 60 ? '#4ADE80' : v >= 30 ? '#F59E0B' : '#9CA0A8' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div className="muted text-[10px] mt-1">
                      {breakdown.raw.totalSessions} sessions · {breakdown.raw.team5Sessions} with Team-5 ·
                      {' '}{breakdown.raw.proposalsPassed}/{breakdown.raw.proposalsTotal} proposals passed ·
                      {' '}{breakdown.raw.pastClients} past clients
                    </div>
                  </div>
                  <div className="text-right min-w-[120px]">
                    <div className="text-2xl font-bold" style={{ color: total >= 60 ? '#4ADE80' : total >= 30 ? '#F59E0B' : '#6B6F78' }}>{total}</div>
                    <div className="muted text-[10px] mb-1">match score</div>
                    <Input type="number" className="!py-1 !text-xs my-1" value={rate} onChange={(e) => setRateById({ ...rateById, [t.id]: +e.target.value })} title="Negotiated rate" />
                    <Button size="sm" variant="success" onClick={() => pick.mutate({ trainerId: t.id, rate })}>Pick</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[11px] muted">Send to:</span>
            <Select
              value={selectedRecruiter}
              onChange={(e) => setSelectedRecruiter(e.target.value)}
              className="!w-auto !text-xs !py-1"
              title="Default routing: Anjali → Aman, Taran → Kanchan"
            >
              {recruiters.length === 0 && <option value="">— no recruiters —</option>}
              {recruiters.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.id === DEFAULT_RECRUITER_FOR[user.id] ? ' (your partner)' : ''}
                </option>
              ))}
            </Select>
            <Button variant="amber" onClick={() => toRecruiters.mutate()} disabled={!selectedRecruiter}>
              No match — send
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDemoModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const [date, setDate] = useState(client.demoDate || todayISO());
  const [time, setTime] = useState(client.demoTimeIst || '20:00');
  const [sendInvite, setSendInvite] = useState(true);
  const save = useMutation({
    mutationFn: async () => {
      // 1. Persist date/time (workflow PATCH — Anjali/Taran allowed)
      await api.patch(`/clients/${client.id}`, { demoDate: date, demoTimeIst: time });
      // 2. Move stage to DemoScheduled (only if not already) — pass sendInvite flag
      if (client.lifecycle !== 'DemoScheduled') {
        await api.post(`/clients/${client.id}/stage`, { lifecycle: 'DemoScheduled', sendInvite });
      } else if (sendInvite) {
        // Already in DemoScheduled — manually trigger a fresh invite for the new time
        await api.post(`/clients/${client.id}/demo-invite`).catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['my-calendar'] });
      showToast(`Demo scheduled ${date} ${time} IST${sendInvite ? ' · invite sent' : ''}`);
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const hasClientEmail = !!(client.email || client.intakeData?.client_email);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Schedule demo · ${client.name}`} description="Date + IST time get saved on the client. Shown on the Demo schedule page.">
        <div className="grid md:grid-cols-2 gap-2.5">
          <div className="form-row"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="form-row"><Label>Time (IST)</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
        <div className="mt-3 p-2.5 bg-bg-input rounded">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={(e) => setSendInvite(e.target.checked)}
              className="mt-0.5"
            />
            <div className="text-sm">
              <div className="font-medium">Send calendar invite (.ics) to client + trainer</div>
              <div className="text-xs muted mt-0.5">
                Email goes from your @mitssolution.com address (configure in Settings → My email).
                {!hasClientEmail && <span className="text-brand-amber"> · No client email on file — only trainer will receive.</span>}
              </div>
            </div>
          </label>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!date || !time} onClick={() => save.mutate()}>
            {client.lifecycle === 'DemoScheduled' ? 'Update demo time' : 'Schedule demo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentModal({ client, kind, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const { data: banks } = useQuery({ queryKey: ['banks'], queryFn: () => api.get('/banks').then(r => r.data) });
  const [f, setF] = useState({
    amount: client.cycleAmount || 0,
    currency: client.currency || 'USD',
    paymentDate: todayISO(),
    bankAccountId: client.bankAccountId || '',
    paymentMode: 'Bank',
  });
  const create = useMutation({
    mutationFn: () => api.post('/payments', { clientId: client.id, kind, ...f, amount: +f.amount }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client', client.id] }); qc.invalidateQueries({ queryKey: ['payments'] }); showToast(`${kind} payment recorded`); onClose(); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`${kind} payment · ${client.name}`}>
        <div className="grid md:grid-cols-2 gap-2.5">
          <div className="form-row"><Label>Date</Label><Input type="date" value={f.paymentDate} onChange={(e) => setF({...f, paymentDate: e.target.value})} /></div>
          <div className="form-row"><Label>Amount</Label><Input type="number" value={f.amount} onChange={(e) => setF({...f, amount: +e.target.value})} /></div>
          <div className="form-row"><Label>Currency</Label><Select value={f.currency} onChange={(e) => setF({...f, currency: e.target.value})}><option>USD</option><option>CAD</option><option>INR</option></Select></div>
          <div className="form-row"><Label>Mode</Label><Select value={f.paymentMode} onChange={(e) => setF({...f, paymentMode: e.target.value})}><option>Bank</option><option>UPI</option><option>Zelle</option><option>Wire</option><option>Cash</option></Select></div>
          <div className="form-row md:col-span-2"><Label>Bank account</Label><Select value={f.bankAccountId} onChange={(e) => setF({...f, bankAccountId: e.target.value})}><option value="">— select —</option>{(banks || []).map((b: any) => <option key={b.id} value={b.id}>{b.label}</option>)}</Select></div>
        </div>
        <DialogFooter><Button onClick={onClose}>Cancel</Button><Button variant="success" disabled={!f.amount} onClick={() => create.mutate()}>Record</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeverageModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const [f, setF] = useState({ daysRequested: 3, reasonStated: '', newCommittedDate: '' });
  const create = useMutation({
    mutationFn: () => api.post('/leverage', { clientId: client.id, ...f, daysRequested: +f.daysRequested }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client', client.id] }); qc.invalidateQueries({ queryKey: ['leverage'] }); showToast('Leverage requested'); onClose(); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Leverage · ${client.name}`} description="≤ 3 days auto-approves; longer needs Vaibhav.">
        <div className="form-row"><Label>Days requested</Label><Input type="number" value={f.daysRequested} onChange={(e) => setF({...f, daysRequested: +e.target.value})} /></div>
        <div className="form-row"><Label>New committed date</Label><Input type="date" value={f.newCommittedDate} onChange={(e) => setF({...f, newCommittedDate: e.target.value})} /></div>
        <div className="form-row"><Label>Reason</Label><Textarea value={f.reasonStated} onChange={(e) => setF({...f, reasonStated: e.target.value})} /></div>
        <DialogFooter><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => create.mutate()}>Submit</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignOwnerModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then(r => r.data) });
  const candidates = (users || []).filter((u: any) => u.active && (u.role === 'demo_intake' || u.role === 'demo_lead'));
  const [ownerId, setOwnerId] = useState(client.intakeOwnerId || '');
  const save = useMutation({
    mutationFn: () => api.patch(`/clients/${client.id}`, { intakeOwnerId: ownerId || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client', client.id] }); qc.invalidateQueries({ queryKey: ['clients'] }); showToast('Owner assigned'); onClose(); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Assign intake owner · ${client.name}`} description="Who from Team 2 will handle the intake?">
        <div className="form-row">
          <Label>Owner</Label>
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">— unassigned —</option>
            {candidates.map((u: any) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role.replace('_', ' ')})</option>
            ))}
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate()}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Demo Done — capture what actually happened on the call (mirrors source.html markDemoDone behaviour + adds feedback)
function DemoDoneModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const [f, setF] = useState({
    demoActualDate: client.demoActualDate || client.demoDate || todayISO(),
    demoActualTimeIst: client.demoActualTimeIst || client.demoTimeIst || '',
    demoOutcome: client.demoOutcome || 'Positive',
    demoFeedback: client.demoFeedback || '',
    demoNextSteps: client.demoNextSteps || '',
  });
  const save = useMutation({
    mutationFn: async () => {
      // 1. workflow PATCH (actuals + feedback) — Anjali/Taran allowed
      await api.patch(`/clients/${client.id}`, f);
      // 2. stage → DemoDone (skipped if already there)
      if (client.lifecycle !== 'DemoDone') {
        await api.post(`/clients/${client.id}/stage`, { lifecycle: 'DemoDone' });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Demo marked done → moved to sale closing queue');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const wasRescheduled = client.demoDate && f.demoActualDate !== client.demoDate;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Demo done · ${client.name}`}
        description="Capture what actually happened. Once saved, the client moves to Roshni for sale closing."
        className="max-w-2xl"
      >
        <div className="grid md:grid-cols-2 gap-2.5">
          <div className="form-row">
            <Label>Actual date</Label>
            <Input type="date" value={f.demoActualDate} onChange={(e) => setF({ ...f, demoActualDate: e.target.value })} />
            {client.demoDate && <div className="text-[10px] muted mt-0.5">Scheduled: {client.demoDate}</div>}
          </div>
          <div className="form-row">
            <Label>Actual time (IST)</Label>
            <Input type="time" value={f.demoActualTimeIst} onChange={(e) => setF({ ...f, demoActualTimeIst: e.target.value })} />
            {client.demoTimeIst && <div className="text-[10px] muted mt-0.5">Scheduled: {client.demoTimeIst} IST</div>}
          </div>
        </div>
        {wasRescheduled && (
          <div className="callout" style={{ borderColor: '#F59E0B' }}>
            <strong>Heads up:</strong> the actual date doesn't match the scheduled date — we'll log this as a reschedule in the audit trail.
          </div>
        )}
        <div className="form-row">
          <Label>Outcome</Label>
          <Select value={f.demoOutcome} onChange={(e) => setF({ ...f, demoOutcome: e.target.value })}>
            <option value="Positive">Positive — client interested, ready for sale close</option>
            <option value="Neutral">Neutral — needs another touch / different trainer</option>
            <option value="Negative">Negative — drop, won't convert</option>
          </Select>
        </div>
        <div className="form-row">
          <Label>Feedback from client *</Label>
          <Textarea rows={4} value={f.demoFeedback} onChange={(e) => setF({ ...f, demoFeedback: e.target.value })}
            placeholder="What did the client say? What worked? Any concerns about the trainer, the timing, or the package?" />
        </div>
        <div className="form-row">
          <Label>Next steps</Label>
          <Textarea rows={2} value={f.demoNextSteps} onChange={(e) => setF({ ...f, demoNextSteps: e.target.value })}
            placeholder="What's the follow-up? e.g. 'Roshni to send engagement letter by EOD', 'Trainer to share sample plan', etc." />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="success" disabled={!f.demoFeedback.trim()} onClick={() => save.mutate()}>
            <Check size={14}/> Save & mark done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HoldModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const m = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/stage`, { lifecycle: 'Hold' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client', client.id] }); showToast('On hold'); onClose(); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Put on hold" description="Pauses sessions. Resume later from the client page.">
        <DialogFooter><Button onClick={onClose}>Cancel</Button><Button variant="danger" onClick={() => m.mutate()}>Hold</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────── Backward transitions ────────────────

function MoveBackwardsModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const options = backStagesFor(client.lifecycle);
  const [target, setTarget] = useState(options[0] || '');
  const [reason, setReason] = useState('');

  const m = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/stage`, { lifecycle: target, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast(`Moved back to ${stageLabel(target)}`);
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Move back · ${client.name}`}
        description={`Currently at ${stageLabel(client.lifecycle)}. Pick an earlier stage to roll back to.`}
      >
        {options.length === 0 ? (
          <div className="muted">No valid back-options from this stage.</div>
        ) : (
          <>
            <div className="form-row">
              <Label>Move back to</Label>
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                {options.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
              </Select>
            </div>
            <div className="form-row">
              <Label>Reason (logged in audit trail) *</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Client rejected this trainer after demo, wants someone with banking-domain experience" />
            </div>
          </>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="amber" disabled={!target || !reason.trim() || m.isPending} onClick={() => m.mutate()}>
            <Undo2 size={14}/> Move back to {target ? stageLabel(target) : '—'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────── Dormant ────────────────

function DormantModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const [f, setF] = useState({
    dormantSince: todayISO(),
    dormantReason: '',
    dormantCheckBackOn: addDays(todayISO(), 14), // default: check back in 2 weeks
  });
  const m = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/stage`, {
      lifecycle: 'Dormant',
      reason: f.dormantReason,
      dormantSince: f.dormantSince,
      dormantReason: f.dormantReason,
      dormantCheckBackOn: f.dormantCheckBackOn,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Marked dormant');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Mark dormant · ${client.name}`}
        description="Client stopped responding. Different from Hold (will resume) and Churned (lost). Schedule a check-back date so they don't fall off the radar."
      >
        <div className="grid md:grid-cols-2 gap-2.5">
          <div className="form-row">
            <Label>Last contact / dormant since</Label>
            <Input type="date" value={f.dormantSince} onChange={(e) => setF({ ...f, dormantSince: e.target.value })} />
          </div>
          <div className="form-row">
            <Label>Check back on</Label>
            <Input type="date" value={f.dormantCheckBackOn} onChange={(e) => setF({ ...f, dormantCheckBackOn: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <Label>Reason / context *</Label>
          <Textarea rows={3} value={f.dormantReason} onChange={(e) => setF({ ...f, dormantReason: e.target.value })}
            placeholder="e.g. 'No reply since intake sent', 'Said busy this month — try again early next month', 'Group went silent after demo'" />
        </div>
        <div className="muted text-xs">
          Will resume from <strong>{stageLabel(client.lifecycle)}</strong> (saved automatically) when you click Resume later.
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="amber" disabled={!f.dormantReason.trim() || m.isPending} onClick={() => m.mutate()}>
            <Moon size={14}/> Mark dormant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResumeFromDormantModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const previous = client.dormantResumeFromStage || 'IntakeReceived';
  const [target, setTarget] = useState(previous);
  const [reason, setReason] = useState('Client responded');

  // Resume options: where they were + a few alternatives (in case the situation changed)
  const FORWARD = [
    'Lead', 'IntakeSent', 'IntakeReceived', 'InternalSearch', 'WithRecruiters',
    'VerificationPending', 'TrainerMatched', 'DemoScheduled', 'DemoDone',
    'FeedbackPending', 'SaleClosing', 'SaleWon', 'Active',
  ];

  const m = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/stage`, { lifecycle: target, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      showToast(`Resumed at ${stageLabel(target)}`);
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Resume · ${client.name}`} description={`They were last at ${stageLabel(previous)} before going dormant.`}>
        <div className="form-row">
          <Label>Resume at stage</Label>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            {FORWARD.map((s) => (
              <option key={s} value={s}>
                {stageLabel(s)}{s === previous ? ' (where they left off)' : ''}
              </option>
            ))}
          </Select>
        </div>
        <div className="form-row">
          <Label>What changed?</Label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="success" disabled={m.isPending} onClick={() => m.mutate()}>
            <Play size={14}/> Resume
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Welcome Email Modal ─────────────────────────────────────────────────
function WelcomeEmailModal({ client, onClose }: any) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const [cc, setCc] = useState('vaibhav.aggarwal@mitssolution.com');
  const toEmail = client.email || (client.intakeData as any)?.client_email || '';

  const send = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/welcome-email`, { cc }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['messages'] });
      showToast(`Welcome email sent to ${toEmail}`);
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Send welcome email · ${client.name}`}
        description='Branded "Introducing MITS Solution" email matching the official template (Client Interest Document linked, signature, MITS footer).'
      >
        <div className="space-y-2.5">
          <div className="form-row">
            <Label>To</Label>
            <Input value={toEmail} readOnly />
          </div>
          <div className="form-row">
            <Label>CC (optional)</Label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="vaibhav.aggarwal@mitssolution.com" />
          </div>
          <div className="text-xs muted bg-bg-input p-2.5 rounded">
            <div className="font-medium text-brand-text mb-1">Email contents (preview)</div>
            <div>Subject: <strong>Introducing MITS Solution - Your Partner for Success</strong></div>
            <div className="mt-1">Includes: Client Interest Document hyperlink · sales@mitssolution.com hyperlink · MITS signature block · footer.</div>
            <div className="mt-1">Sent from your @mitssolution.com address (if configured in Settings → My email), otherwise system sender.</div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={send.isPending || !toEmail} onClick={() => send.mutate()}>
            <Mail size={14}/> {send.isPending ? 'Sending…' : 'Send welcome email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pre-demo trainer reminder modal ───────────────────────────────────────
const DEFAULT_PRE_DEMO_TEXT = `Hi {{trainer}},

Quick reminder ahead of your upcoming demo call{{demoTimePart}}. Please keep the following guidelines in mind to ensure a smooth, professional experience for our client:

1. Camera off for the entire call.
   Please keep your camera turned OFF throughout the demo. We do not enable video on these calls.

2. CVs are never shared.
   We do not share your CV / résumé with the client. Please do not offer to share it during the call.

3. Personal details stay confidential.
   Please do not disclose your phone number, personal email, LinkedIn profile, or current/past company names to the client. All coordination goes via MITS.

4. Join from laptop only.
   Please join the meeting from a laptop / desktop — not from a mobile phone. This ensures a stable, professional setup.

5. Display name (optional).
   You may change your display name in the meeting if you prefer — this is optional.

The meeting link will be shared just before the call.

Thank you for partnering with MITS — looking forward to a great session.

Warm regards,
MITS Consulting`;

function PreDemoReminderModal({ client, onClose }: any) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const trainer = client.primaryTrainer;
  const hasEmail = !!trainer?.email;
  const hasPhone = !!trainer?.phoneDigits;
  const demoTimePart = client.demoTimeIst && client.demoDate
    ? ` at ${client.demoTimeIst} IST · ${client.demoDate}`
    : client.demoDate ? ` on ${client.demoDate}` : '';

  const [text, setText] = useState(
    DEFAULT_PRE_DEMO_TEXT
      .replace('{{trainer}}', trainer?.name || 'there')
      .replace('{{demoTimePart}}', demoTimePart),
  );
  const [joinLink, setJoinLink] = useState('');

  // Compulsory dual-send: email fires immediately and WhatsApp opens in a new tab. Both must complete.
  const sendBoth = useMutation({
    mutationFn: async () => {
      // 1. Email (server actually sends)
      const emailResp = await api.post(`/clients/${client.id}/pre-demo-reminder`, { channel: 'email', customText: text, joinLink });
      // 2. WhatsApp (server builds wa.me URL + logs; user must tap Send in WhatsApp)
      const waResp = await api.post(`/clients/${client.id}/pre-demo-reminder`, { channel: 'whatsapp', customText: text, joinLink });
      return { emailResp: emailResp.data, waResp: waResp.data };
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      // Open WhatsApp in a new tab so user can tap Send
      if (r.waResp?.url) window.open(r.waResp.url, '_blank', 'noopener');
      showToast(`Email sent · WhatsApp opened — tap Send in WhatsApp tab to complete`);
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Pre-demo reminder · ${trainer?.name || ''}`}
        description='Send cameras-off / no-CV-sharing / laptop-only reminder to the trainer. Default text shown below — edit freely.'
        className="max-w-2xl"
      >
        {!trainer && <div className="callout amber">No primary trainer assigned — assign one first.</div>}

        <div className="form-row">
          <Label>Meeting link (optional)</Label>
          <Input value={joinLink} onChange={(e) => setJoinLink(e.target.value)} placeholder="https://zoom.us/…" />
        </div>

        <div className="form-row">
          <Label>Message body (edit freely)</Label>
          <Textarea rows={18} value={text} onChange={(e) => setText(e.target.value)} className="mono text-xs" />
        </div>

        <DialogFooter>
          {(!hasEmail || !hasPhone) && (
            <div className="text-xs text-brand-amber mr-auto self-center">
              {!hasEmail && '⚠ No trainer email on file. '}
              {!hasPhone && '⚠ No trainer phone on file. '}
              Both are required to send.
            </div>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!hasEmail || !hasPhone || sendBoth.isPending}
            onClick={() => sendBoth.mutate()}
            title='Sends email AND opens WhatsApp — both are compulsory'
          >
            <Mail size={12}/><MessageCircle size={12}/>{' '}
            {sendBoth.isPending ? 'Sending…' : 'Send (Email + WhatsApp)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Skill Matrix modal (Anjali → client) ────────────────────────────
function SendSkillMatrixModal({ client, onClose }: any) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const toEmail = client.email || (client.intakeData as any)?.client_email || '';
  const hasPhone = !!client.phoneDigits;
  const [introNote, setIntroNote] = useState(
    `Dear ${client.name || 'Client'}, please find below the proposed trainer profiles for your review.`,
  );

  const { data: preview, isLoading } = useQuery({
    queryKey: ['skill-matrix-preview', client.id],
    queryFn: () => api.get(`/sourcing/clients/${client.id}/skill-matrix`).then((r) => r.data),
  });

  // Compulsory dual-send: email goes immediately + WhatsApp opens as a pre-filled tab for the client
  const send = useMutation({
    mutationFn: async () => {
      const e = await api.post(`/clients/${client.id}/send-skill-matrix`, { introNote });
      const w = await api.post(`/clients/${client.id}/send-skill-matrix-whatsapp`, {});
      return { email: e.data, wa: w.data };
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['messages'] });
      if (r.wa?.url) window.open(r.wa.url, '_blank', 'noopener');
      showToast(`Email sent · WhatsApp opened — tap Send in WhatsApp tab to complete`);
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Send skill matrix · ${client.name}`}
        description='Compulsory step before scheduling demo. Sends the side-by-side trainer profile matrix to the client.'
        className="max-w-3xl"
      >
        {!toEmail && (
          <div className="callout amber mb-2">No email on file for this client — please add one before sending.</div>
        )}

        <div className="form-row">
          <Label>To</Label>
          <Input value={toEmail} readOnly />
        </div>

        <div className="form-row">
          <Label>Intro note (editable)</Label>
          <Textarea rows={2} value={introNote} onChange={(e) => setIntroNote(e.target.value)} />
        </div>

        <div className="form-row">
          <Label>Preview ({preview?.candidates?.length || 0} candidates)</Label>
          <div className="bg-white rounded p-2 max-h-96 overflow-auto border border-brand-border">
            {isLoading && <div className="muted text-sm p-3">Loading preview…</div>}
            {preview?.html && (
              <iframe
                srcDoc={preview.html}
                title="Skill matrix preview"
                style={{ width: '100%', minHeight: 400, border: 0, background: 'white' }}
              />
            )}
            {preview && preview.candidates?.length === 0 && (
              <div className="muted text-sm p-3">No proposed trainers yet. Ask Aman/Kanchan to propose trainers first.</div>
            )}
          </div>
        </div>

        <DialogFooter>
          {(!toEmail || !hasPhone) && (
            <div className="text-xs text-brand-amber mr-auto self-center">
              {!toEmail && '⚠ No client email. '}
              {!hasPhone && '⚠ No client phone. '}
              Both required to send.
            </div>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!toEmail || !hasPhone || send.isPending || !preview?.candidates?.length}
            onClick={() => send.mutate()}
            title='Sends branded email matrix AND opens WhatsApp with the candidate summary — both are compulsory'
          >
            <Mail size={12}/><MessageCircle size={12}/>{' '}
            {send.isPending ? 'Sending…' : 'Send (Email + WhatsApp)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Post-demo feedback modal (Samita) ────────────────────────────────────
function PostDemoFeedbackModal({ client, onClose }: any) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<'Positive' | 'Negative' | 'NeedTime'>('Positive');
  const [note, setNote] = useState('');

  const submit = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/post-demo-feedback`, { outcome, note }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      const next = r.data?.lifecycle || '';
      const dest = next === 'SaleClosing' ? 'sent to Roshni for payment'
                 : next === 'WithRecruiters' ? 'reassigned back to recruiters'
                 : next === 'Hold' ? 'placed on Hold (3-day check-back)'
                 : 'updated';
      showToast(`Feedback recorded · ${dest}`);
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const outcomes: { key: typeof outcome; label: string; desc: string; tone: 'green' | 'red' | 'amber' }[] = [
    { key: 'Positive', label: 'Positive · move to payment',  desc: 'Demo went well, client is ready to proceed. Auto-routes to Roshni for payment closing.', tone: 'green' },
    { key: 'NeedTime', label: 'Need time · place on Hold',  desc: 'Client wants time to decide. Goes to Hold; Roshni gets a 3-day check-back reminder.', tone: 'amber' },
    { key: 'Negative', label: 'Negative · reassign back',   desc: 'Trainer did not match. Returns to recruiters (Anjali) for re-sourcing.', tone: 'red' },
  ];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Post-demo feedback · ${client.name}`}
        description='Record the conversation outcome after the demo. The client is auto-routed to the next correct stage.'
      >
        <div className="space-y-2">
          {outcomes.map((o) => (
            <label
              key={o.key}
              className={`flex items-start gap-2.5 p-2.5 rounded border cursor-pointer transition-colors ${
                outcome === o.key ? 'border-brand-amber bg-bg-input' : 'border-brand-border hover:bg-bg-input'
              }`}
            >
              <input
                type="radio"
                name="outcome"
                checked={outcome === o.key}
                onChange={() => setOutcome(o.key)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="text-sm font-medium">{o.label}</div>
                <div className="text-xs muted mt-0.5">{o.desc}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="form-row mt-3">
          <Label>Notes (optional)</Label>
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did the client say? Any blockers? Preferred follow-up time?"
          />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? 'Saving…' : 'Record feedback'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Engagement letter modal (Roshni → client) ─────────────────────────────
function EngagementLetterModal({ client, onClose }: any) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const toEmail = client.email || (client.intakeData as any)?.client_email || '';
  const hasPhone = !!client.phoneDigits;

  const send = useMutation({
    mutationFn: async () => {
      // 1. Email goes out immediately
      const e = await api.post(`/clients/${client.id}/engagement-letter`, { channel: 'email' });
      // 2. WhatsApp link built + logged + opens in new tab
      const w = await api.post(`/clients/${client.id}/engagement-letter`, { channel: 'whatsapp' });
      // 3. Trigger handover task for Mitali
      await api.post(`/clients/${client.id}/handover-to-mitali`).catch(() => null);
      return { email: e.data, wa: w.data };
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      if (r.wa?.url) window.open(r.wa.url, '_blank', 'noopener');
      showToast('Engagement letter sent · handover task created for Mitali');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Engagement letter · ${client.name}`}
        description='Confirms the engagement, CCs Mitali, and creates a handover task on her queue. Email + WhatsApp both go out.'
        className="max-w-xl"
      >
        <div className="space-y-2 text-sm">
          <div><strong>To (email):</strong> {toEmail || <span className="text-brand-amber">missing</span>}</div>
          <div><strong>To (WhatsApp):</strong> {hasPhone ? `${client.phoneCode || ''} ${client.phoneDigits}` : <span className="text-brand-amber">missing</span>}</div>
          <div className="text-xs muted bg-bg-input p-2 rounded mt-2">
            Subject: <strong>Engagement confirmed · Welcome aboard, {client.name}</strong><br/>
            Includes engagement type, payment model, cycle dates, trainer name, and next-steps with Mitali's team.
            Mitali is auto-CC'd on the email and gets a Task on her queue.
          </div>
        </div>

        <DialogFooter>
          {(!toEmail || !hasPhone) && (
            <div className="text-xs text-brand-amber mr-auto self-center">
              {!toEmail && '⚠ No client email. '}
              {!hasPhone && '⚠ No client phone. '}
              Both required.
            </div>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!toEmail || !hasPhone || send.isPending} onClick={() => send.mutate()}>
            <Mail size={12}/><MessageCircle size={12}/>{' '}
            {send.isPending ? 'Sending…' : 'Send (Email + WhatsApp) + Handover'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mitali handover welcome modal ─────────────────────────────────────────
function HandoverWelcomeModal({ client, onClose }: any) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const toEmail = client.email || (client.intakeData as any)?.client_email || '';
  const hasPhone = !!client.phoneDigits;

  const send = useMutation({
    mutationFn: async () => {
      const e = await api.post(`/clients/${client.id}/handover-welcome`, { channel: 'email' });
      const w = await api.post(`/clients/${client.id}/handover-welcome`, { channel: 'whatsapp' });
      return { email: e.data, wa: w.data };
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['messages'] });
      if (r.wa?.url) window.open(r.wa.url, '_blank', 'noopener');
      showToast('Handover welcome sent (Email + WhatsApp)');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Handover welcome · ${client.name}`}
        description="Mitali's introduction to her team (Bhavneet, Kashish, Muskan) + feedback rhythm + payment cadence."
        className="max-w-xl"
      >
        <div className="space-y-2 text-sm">
          <div><strong>To (email):</strong> {toEmail || <span className="text-brand-amber">missing</span>}</div>
          <div><strong>To (WhatsApp):</strong> {hasPhone ? `${client.phoneCode || ''} ${client.phoneDigits}` : <span className="text-brand-amber">missing</span>}</div>
          <div className="text-xs muted bg-bg-input p-2 rounded mt-2">
            Introduces the team, sets expectations: <em>Daily WhatsApp (Kashish/Muskan) · Weekly calls (Bhavneet) · Bi-weekly review (Mitali)</em>.
            Includes payment cadence reminder so cycles never slip.
          </div>
        </div>

        <DialogFooter>
          {(!toEmail || !hasPhone) && (
            <div className="text-xs text-brand-amber mr-auto self-center">
              {!toEmail && '⚠ No client email. '}
              {!hasPhone && '⚠ No client phone. '}
              Both required.
            </div>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!toEmail || !hasPhone || send.isPending} onClick={() => send.mutate()}>
            <Mail size={12}/><MessageCircle size={12}/>{' '}
            {send.isPending ? 'Sending…' : 'Send (Email + WhatsApp)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
