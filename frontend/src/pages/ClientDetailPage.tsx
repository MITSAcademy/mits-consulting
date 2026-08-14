import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl, uploadFile, API_BASE } from '@/lib/api';
import { readAvailabilitySlots, formatAvailabilitySlots, to12h } from '@/lib/utils';
import { Time12h } from '@/components/Time12h';
import { celebrate } from '@/components/CelebrationLayer';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label, Select } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { formatPhone, waLink, todayISO, stageLabel, backStagesFor, addDays, fmtClientId, minPastDate, maxTodayDate, minFutureDate } from '@/lib/utils';
import { useUI } from '@/store/ui';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/store/auth';
import { ArrowLeft, Send, ClipboardCheck, Search, CalendarPlus, Check, FileCheck, ArrowRight, Wallet, Clock, HandMetal, Edit as EditIcon, MessageCircle, UserPlus, Mail, Undo2, Moon, Play, X, Download, Users, FileText, CheckCircle2, AtSign } from 'lucide-react';
import { SendMessageModal, MessagesHistoryCard } from '@/components/SendMessageModal';
import { DemoHistoryCard } from '@/components/DemoHistoryCard';
import { CallHistoryCard } from '@/components/CallHistoryCard';
import { CommentSection } from '@/components/CommentSection';
import { ActivityLog } from '@/components/ActivityLog';
import { FeedbackActivityLog } from '@/components/FeedbackActivityLog';
import { AMScheduleDialog } from '@/pages/MySessionsPage';

const INTAKE_FIELDS = [
  { key: 'detailed_skill_set', label: 'Detailed skill set', required: true },
  { key: 'current_priority_task', label: 'Current priority task' },
  { key: 'client_email', label: 'Email' },
  { key: 'client_timezone', label: 'Client time zone' },
  { key: 'demo_timing_ist', label: 'Demo timing (IST)' },
  { key: 'session_timing_ist', label: 'Session timing (IST)' },
  { key: 'trainer_preference', label: 'Trainer preference' },
  { key: 'meeting_tool', label: 'Meeting tool' },
  { key: 'additional_notes', label: 'Additional notes' },
];

// Role gates that mirror source.html
const canIntake = (role: string) => ['founder', 'manager', 'demo_lead', 'demo_intake'].includes(role);
const canClose = (role: string) => ['founder', 'manager', 'sales_closer'].includes(role);
const canActivate = (role: string) => ['founder', 'manager', 'sales_closer'].includes(role);
// AM can manage Active/LeverageGranted clients (leverage, hold) but not the SaleWon→Active handover
const canAMActions = (role: string) => ['founder', 'manager', 'sales_closer', 'account_manager'].includes(role);
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
    lead:         { identity: false, contact: true,  engagement: false, pipeline: false, financial: false, sensitive: false },
    sales_closer: { identity: false, contact: true,  engagement: true,  pipeline: false, financial: true,  sensitive: false },
    accounts:     { identity: false, contact: false, engagement: false, pipeline: false, financial: true,  sensitive: false },
  };
  return m[role]?.[cat] || false;
}

// ── Email nudge modal ────────────────────────────────────────────────────────
// Shown when the owning user visits a client with no email on file.
// Options: add now | remind tomorrow | dismiss for 7 days.
function EmailNudgeBanner({ client, userId }: { client: any; userId: string }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const snoozeKey = `email-nudge-dismissed-${client.id}`;

  const isSnoozed = () => {
    try {
      const raw = localStorage.getItem(snoozeKey);
      if (!raw) return false;
      return Date.now() < Number(raw);
    } catch { return false; }
  };

  const [open, setOpen] = useState(!isSnoozed());
  const [val, setVal] = useState('');

  const isOwner =
    client.intakeOwnerId === userId ||
    client.leadOwnerId === userId ||
    client.hostOwnerId === userId ||
    client.salesOwnerId === userId ||
    client.assignedAmId === userId;

  const hasEmail = !!(client.email || client.intakeData?.client_email);

  const save = useMutation({
    mutationFn: () => api.patch(`/clients/${client.id}`, { email: val.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      showToast('Email saved — thank you!');
      setOpen(false);
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to save', 'error'),
  });

  const snooze = (ms: number) => {
    try { localStorage.setItem(snoozeKey, String(Date.now() + ms)); } catch {}
    setOpen(false);
  };

  if (hasEmail || !isOwner || !open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1200,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
        }}
        onClick={() => snooze(7 * 24 * 60 * 60 * 1000)}
      />
      {/* Modal */}
      <div
        style={{
          position: 'fixed', zIndex: 1201,
          top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 420, maxWidth: 'calc(100vw - 32px)',
          background: 'var(--bg-card)',
          border: '1px solid var(--brand-borderSoft)',
          borderRadius: 16,
          padding: '28px 28px 22px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Close */}
        <button
          onClick={() => snooze(7 * 24 * 60 * 60 * 1000)}
          style={{ position: 'absolute', top: 14, right: 14, color: 'var(--brand-textMuted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
        >
          <X size={16} />
        </button>

        {/* Icon + heading */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: 'rgba(92,143,240,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AtSign size={18} style={{ color: 'var(--status-blue)' }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--brand-text)' }}>
              No email for {client.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--brand-textMuted)', marginTop: 2 }}>
              Helps with welcome emails, feedback &amp; follow-ups
            </div>
          </div>
        </div>

        {/* Input */}
        <input
          autoFocus
          type="email"
          className="input w-full"
          style={{ fontSize: 13, marginBottom: 14 }}
          placeholder="client@email.com"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && val.trim()) save.mutate(); }}
        />

        {/* Primary CTA */}
        <button
          className="btn btn-primary w-full"
          style={{ fontSize: 13, marginBottom: 10 }}
          disabled={!val.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Save email'}
        </button>

        {/* Secondary actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn w-full"
            style={{ fontSize: 12, color: 'var(--brand-textSecondary)' }}
            onClick={() => snooze(24 * 60 * 60 * 1000)}
          >
            🕐 I'll add tomorrow
          </button>
          <button
            className="btn w-full"
            style={{ fontSize: 12, color: 'var(--brand-textMuted)' }}
            onClick={() => snooze(7 * 24 * 60 * 60 * 1000)}
          >
            Skip for a week
          </button>
        </div>
      </div>
    </>
  );
}

type ModalKind =
  | null | 'editContact' | 'editEngagement' | 'assignOwner'
  | 'sendIntake' | 'recordIntake' | 'internalSearch'
  | 'scheduleDemo' | 'demoDone' | 'noShow' | 'freshPayment' | 'leverage' | 'hold' | 'renewal' | 'welcomeEmail' | 'postDemoFeedback' | 'sendSkillMatrix' | 'skipMatrix' | 'preDemoReminder'
  | 'engagementLetter' | 'handoverWelcome' | 'subStatus' | 'paymentConfirmation' | 'groupRename' | 'paymentChecklist'
  | 'sendEmail' | 'sendWA' | 'moveBack' | 'dormant' | 'resume' | 'assignAm' | 'feedbackEmail' | 'scheduleSession'
  | 'editTrainingSetup' | 'editHandover' | 'mitaliWelcomeEmail' | 'certificateEmail';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;
  const [modal, setModal] = useState<ModalKind>(null);
  // Sub-status modal target preset — set by the Close-out wizard so the
  // modal opens already pointed at the destination Roshni clicked.
  const [subStatusTarget, setSubStatusTarget] = useState<'CP' | 'C' | 'DP' | 'Training-Paid' | 'JBT-Paid' | 'Training-EmployerLater' | 'JBT-EmployerLater' | undefined>(undefined);

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

  if (isLoading || !client) return (
    <Page>
      <div className="space-y-3">
        <div className="card">
          <SkeletonBlock w={180} h={20} className="mb-2" />
          <SkeletonBlock w={260} h={12} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="kpi-card" style={{ minHeight: 70 }}>
              <SkeletonBlock w={70} h={10} className="mb-2" />
              <SkeletonBlock w={50} h={18} />
            </div>
          ))}
        </div>
        <div className="card">
          <SkeletonBlock w={140} h={12} className="mb-3" />
          <SkeletonBlock w="100%" h={12} className="mb-2" />
          <SkeletonBlock w="92%" h={12} className="mb-2" />
          <SkeletonBlock w="78%" h={12} />
        </div>
      </div>
    </Page>
  );

  const intake = (client.intakeData as any) || {};
  const hasIntake = Object.values(intake).some(Boolean);
  const isTraining = client.engagementType === 'Training' || client.engagementType === 'TaskBased';
  const isEmployerLater = client.saleClosingSubStatus === 'JBT-EmployerLater' || client.saleClosingSubStatus === 'Training-EmployerLater';
  const showAmt = canSeeFinancial(user.role);

  // Stage-specific actions (mirrors source.html renderClientDetail).
  const actions: React.ReactNode[] = [];
  // Always-available messaging shortcuts — work at every stage
  actions.push(
    <Button key="email" size="sm" onClick={() => setModal('sendEmail')} title="Send email via SMTP">
      <Mail size={14}/> Email
    </Button>
  );
  // If client has a WhatsApp group link, always prefer opening the group (pre- and post-demo).
  // Using a named window target prevents a second window opening when one is already open.
  const useGroupForWA = !!client.whatsappGroupLink;
  actions.push(
    <Button
      key="wa"
      size="sm"
      onClick={() => {
        if (useGroupForWA) window.open(client.whatsappGroupLink!, 'whatsapp_window', 'noopener');
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
  }
  // Edit intake — available at every stage AFTER intake is completed (Anjali can add/update info shared later by client).
  // Excludes Lead/IntakeSent (intake not yet recorded — they get the "Record replies" button) and Dormant (read-only).
  if (
    canIntake(user.role)
    && !['Lead', 'IntakeSent', 'Dormant'].includes(client.lifecycle)
    && client.intakeData && Object.keys(client.intakeData as object).length > 0
  ) {
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
      // Bypass: shared outside the portal (or matrix not needed for this client) — unlock scheduling
      actions.push(
        <Button key="sched-skip" variant="amber" onClick={() => setModal('skipMatrix')} title="Already shared the matrix outside the portal, or skipping the step for this client? Unlock Schedule demo now.">
          <CalendarPlus size={14}/> Skip matrix · Schedule demo
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
    actions.push(
      <Button key="matrix-resend-ds" size="sm" onClick={() => setModal('sendSkillMatrix')} title="Re-send skill matrix — useful for a second round of proposals">
        <FileCheck size={12}/> Re-send matrix
      </Button>
    );
    actions.push(<Button key="done" variant="success" onClick={() => setModal('demoDone')}><Check size={14}/> Demo done</Button>);
    actions.push(
      <Button key="noshow" size="sm" variant="amber" onClick={() => setModal('noShow')} title="Client / trainer didn't show up — push the demo by a week or mark dormant.">
        <Clock size={12}/> No-show
      </Button>
    );
  }
  // Re-send matrix at DemoDone/FeedbackPending — for repeat sourcing rounds on the same client
  if (canIntake(user.role) && (client.lifecycle === 'DemoDone' || client.lifecycle === 'FeedbackPending')) {
    actions.push(
      <Button key="matrix-resend-dd" size="sm" onClick={() => setModal('sendSkillMatrix')} title="Send / re-send skill matrix — useful when sourcing a second trainer for this client">
        <FileCheck size={12}/> Re-send matrix
      </Button>
    );
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
  if (canClose(user.role) && client.lifecycle === 'SaleClosing' && canRecordPayment(user.role) && !isEmployerLater) {
    actions.push(<Button key="pay" variant="success" onClick={() => setModal('freshPayment')}><Wallet size={14}/> Record payment</Button>);
  }
  // Roshni state machine — RP is auto-set entry; outcomes are CP / C +
  // 4 win states (Training/JBT × Paid/EmployerLater). The Close-out wizard
  // card above the action bar drives 90% of her work; this button is a
  // quick shortcut to re-open the outcome picker.
  if (canClose(user.role) && (client.lifecycle === 'SaleClosing' || client.lifecycle === 'SaleWon')) {
    const ss = client.saleClosingSubStatus;
    const isWin = ss === 'Training-Paid' || ss === 'JBT-Paid' || ss === 'Training-EmployerLater' || ss === 'JBT-EmployerLater';
    const label = ss === 'RP' ? 'RP → update status'
      : ss === 'CP' ? 'CP · move to C or DP'
      : ss === 'C' ? 'C · record win outcome'
      : ss === 'DP' ? 'DP · dropped'
      : isWin ? ss
      : 'Set status';
    const variant = ss === 'CP' ? 'amber' as const
      : ss === 'C' ? 'primary' as const
      : ss === 'DP' ? 'danger' as const
      : ss === 'RP' ? 'primary' as const
      : isWin ? 'success' as const
      : 'amber' as const;
    actions.push(
      <Button
        key="substatus"
        size="sm"
        variant={variant}
        onClick={() => setModal('subStatus')}
        title="RP → CP / C / Training-Paid / JBT-Paid / Training-EmployerLater / JBT-EmployerLater."
      >
        {label}
      </Button>
    );
    // Payment-terms checklist — the 10-item walkthrough Roshni opens on the close call
    const checklistDone = !!client.paymentChecklistCompletedAt;
    actions.push(
      <Button
        key="checklist"
        size="sm"
        variant={checklistDone ? 'success' : 'default'}
        onClick={() => setModal('paymentChecklist')}
        title="10-point checklist Roshni walks through on the close call"
      >
        <ClipboardCheck size={12}/> {checklistDone ? 'Checklist · done' : 'Open call checklist'}
      </Button>
    );
  }
  // Phase-2: Roshni sends engagement letter + triggers handover-to-Mitali on SaleClosing close-out
  if (phase2 && canClose(user.role) && (client.lifecycle === 'SaleClosing' || client.lifecycle === 'SaleWon')) {
    actions.push(
      <Button key="engage" variant="primary" onClick={() => setModal('engagementLetter')} title="Confirm engagement + create Mitali handover task">
        <Mail size={12}/> Engagement letter + handover
      </Button>
    );
  }
  // Roshni post-payment actions (SaleWon)
  if (canClose(user.role) && client.lifecycle === 'SaleWon') {
    // EmployerLater: employer pays later — skip payment confirmation, rename group immediately
    if (!isEmployerLater) {
      actions.push(
        <Button key="paymentconfirm" size="sm" variant={client.paymentConfirmationPostedAt ? 'default' : 'primary'} onClick={() => setModal('paymentConfirmation')} title="Upload payment screenshot + post to MITS payment-confirmation group">
          <Wallet size={12}/> {client.paymentConfirmationPostedAt ? 'Re-post confirmation' : 'Confirm payment received'}
        </Button>
      );
    }
    if (isEmployerLater || client.freshPaymentReceived) {
      actions.push(
        <Button key="grouprename" size="sm" variant={client.whatsappGroupRenamedAt ? 'default' : 'primary'} onClick={() => setModal('groupRename')} title="Rename client's WA group to Training / JBT + share Mitali intro message">
          <MessageCircle size={12}/> {client.whatsappGroupRenamedAt ? 'Rename group again' : 'Rename group → Training/JBT'}
        </Button>
      );
    }
  }
  if (canActivate(user.role) && client.lifecycle === 'SaleWon') {
    actions.push(<Button key="act" variant="primary" onClick={() => stageM.mutate('Active')}><ArrowRight size={14}/> {isTraining ? 'Start training' : 'Handover · activate'}</Button>);
  }
  // Intake team welcome email — available at any stage post-Lead so Anjali can send it
  // whenever the client shares their email address late in the process
  const PRE_INTAKE_STAGES = ['Lead', 'IntakeSent', 'WithRecruiters', 'InternalSearch', 'Dormant'];
  if (canIntake(user.role) && !PRE_INTAKE_STAGES.includes(client.lifecycle)) {
    actions.push(
      <Button key="welcome-email" size="sm" onClick={() => setModal('welcomeEmail')} title="Send welcome email to client">
        <Mail size={12}/> Welcome email
      </Button>
    );
  }
  // Phase-2: Mitali sends her welcome message (introducing her team + feedback rhythm)
  // Available at ALL stages post-intake — client may share email late
  if (phase2 && canAMActions(user.role) && !PRE_INTAKE_STAGES.includes(client.lifecycle)) {
    actions.push(
      <Button key="handover-welcome" size="sm" onClick={() => setModal('handoverWelcome')} title="Send Mitali's handover welcome (intro to team + feedback rhythm)">
        <Mail size={12}/> Welcome email
      </Button>
    );
    actions.push(
      <Button key="feedback-email" size="sm" onClick={() => setModal('feedbackEmail')} title="Send client feedback survey email">
        <Mail size={12}/> Feedback email
      </Button>
    );
  }
  if (canAMActions(user.role) && (client.lifecycle === 'Active' || client.lifecycle === 'LeverageGranted')) {
    actions.push(<Button key="lev" variant="amber" onClick={() => setModal('leverage')}><Clock size={14}/> Leverage</Button>);
    actions.push(<Button key="hold" variant="danger" onClick={() => setModal('hold')}><HandMetal size={14}/> Hold</Button>);
    if (!isTraining && canRecordPayment(user.role)) {
      // Feedback gate: manager/lead/account_manager must log feedback before recording renewal
      const isTeamRole = ['manager', 'lead', 'account_manager'].includes(user.role);
      const feedbackAge = client.lastFeedbackTakenAt
        ? Math.floor((Date.now() - new Date(client.lastFeedbackTakenAt).getTime()) / 86400000)
        : null;
      const feedbackRequired = isTeamRole && (feedbackAge === null || feedbackAge > 30);
      actions.push(
        <Button
          key="ren"
          variant="success"
          title={feedbackRequired ? `Log client feedback first (last logged: ${client.lastFeedbackTakenAt ? feedbackAge + ' days ago' : 'never'})` : undefined}
          onClick={() => feedbackRequired ? showToast('Log client feedback before recording renewal (Feedback page → Log feedback)', 'error') : setModal('renewal')}
        >
          <Wallet size={14}/> Renewal{feedbackRequired ? ' ⚠' : ''}
        </Button>
      );
    } else if (isTraining && user.role === 'founder') {
      actions.push(<Button key="cmpl" variant="success" onClick={() => stageM.mutate('Completed')}><Check size={14}/> Mark completed</Button>);
    }
  }
  // Schedule session — AM/lead can schedule a calendar invite for active clients
  if (['account_manager', 'lead', 'manager', 'founder'].includes(user.role) && (client.lifecycle === 'Active' || client.lifecycle === 'LeverageGranted')) {
    actions.push(
      <Button key="sched-session" size="sm" onClick={() => setModal('scheduleSession')}>
        <CalendarPlus size={12}/> Schedule session
      </Button>
    );
  }
  // Assign AM — Mitali (manager) can assign active clients to Bhavneet / Kashish / Muskan
  if (user.role === 'manager' && (client.lifecycle === 'Active' || client.lifecycle === 'LeverageGranted')) {
    actions.push(<Button key="assign-am" size="sm" onClick={() => setModal('assignAm')}><UserPlus size={12}/> Assign AM</Button>);
  }
  if (canActivate(user.role) && user.role !== 'sales_closer') {
    actions.push(
      <Button key="flag" size="sm" onClick={() => flagM.mutate(!client.paymentPendingVaibhav)}>
        {client.paymentPendingVaibhav ? 'Unflag Vaibhav' : 'Flag for Vaibhav'}
      </Button>
    );
  }

  // Backward-move button — recruiter/sales roles only (Mitali/Bhavneet/AMs don't move clients backwards)
  const canMoveBack = (role: string) => ['founder', 'manager', 'demo_lead', 'demo_intake', 'sales_closer', 'recruiter'].includes(role);
  // Manager can only move back to WithRecruiters (hand back to internal recruiter)
  const managerBackStages = ['WithRecruiters'];
  const validBack = user.role === 'manager'
    ? backStagesFor(client.lifecycle).filter(s => managerBackStages.includes(s))
    : backStagesFor(client.lifecycle);
  if (validBack.length > 0 && client.lifecycle !== 'Dormant' && canMoveBack(user.role)) {
    actions.push(
      <Button key="back" size="sm" onClick={() => setModal('moveBack')} title="Move client back to internal recruiter">
        <Undo2 size={14}/> Move back
      </Button>
    );
  }

  // Mark Dormant — not available to manager/lead/account_manager
  const canMarkDormant = (role: string) => ['founder', 'demo_lead', 'demo_intake', 'sales_closer'].includes(role);
  const dormantEligible = !['Dormant', 'Churned', 'Completed'].includes(client.lifecycle);
  if (dormantEligible && canMarkDormant(user.role)) {
    actions.push(
      <Button key="dormant" size="sm" onClick={() => setModal('dormant')} title="Client stopped responding — mark dormant">
        <Moon size={14}/> Mark dormant
      </Button>
    );
  }

  // Resume from Dormant
  if (client.lifecycle === 'Dormant' && (canIntake(user.role) || canClose(user.role) || canAMActions(user.role))) {
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
        title={`${client.name}${client.seqId ? ` · ${fmtClientId(client.seqId)}` : ''}`}
        subtitle={`${client.engagementType}${showAmt && client.cycleAmount ? ` · ${client.currency} ${client.cycleAmount}` : ''}${currentRecruiter ? ` · sourcing: ${currentRecruiter}` : ''}`}
        actions={
          <>
            <Button size="sm" onClick={() => navigate(-1)}><ArrowLeft size={14}/> Back</Button>
            {actions}
          </>
        }
      />
      <Page>
        {/* Roshni's close-out journey card — sits at the top whenever a sales-closer
            role user opens a client in SaleClosing/SaleWon. Shows current status
            and the 4 destinations as click-to-move cards with their validation. */}
        {canClose(user.role) && (client.lifecycle === 'SaleClosing' || client.lifecycle === 'SaleWon') && (
          <RoshniJourneyCard
            client={client}
            onMove={(target) => { setSubStatusTarget(target); setModal('subStatus'); }}
            onAction={(kind) => {
              if (kind === 'checklist') setModal('paymentChecklist');
              else if (kind === 'engagement') setModal('engagementLetter');
              else if (kind === 'recordPayment') setModal('freshPayment');
              else if (kind === 'postConfirmation') setModal('paymentConfirmation');
              else if (kind === 'groupRename') setModal('groupRename');
              else if (kind === 'mitaliIntro') setModal('handoverWelcome');
            }}
          />
        )}

        {/* Email nudge — soft prompt for the owning user to add client email */}
        <EmailNudgeBanner client={client} userId={user.id} />

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
                {(intake.attachments as { name: string; url: string }[] | undefined)?.length ? (
                  <div className="mt-3">
                    <div className="text-[10px] uppercase tracking-wider text-brand-textMuted font-semibold mb-1.5">Attachments</div>
                    <div className="flex flex-wrap gap-2">
                      {(intake.attachments as { name: string; url: string }[]).map((a, i) => (
                        <a
                          key={i}
                          href={fileUrl(a.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 bg-bg-input border border-brand-border rounded px-2 py-1 text-xs text-brand-blue underline hover:opacity-80 max-w-[200px] truncate"
                        >
                          📎 {a.name}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
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

            {/* Proposed trainers — grouped by sourcing request round.
                Most-recent request is shown expanded; older rounds are collapsed.
                This prevents old Pass'd/Fail'd proposals from previous rounds from
                cluttering the current round's pending trainers. */}
            {(() => {
              const requests: any[] = (client.sourcingRequests || [])
                .filter((r: any) => r.proposals?.length > 0)
                .slice() // don't mutate original
                .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
              if (!requests.length) return null;

              const totalCount = requests.reduce((s: number, r: any) => s + (r.proposals?.length || 0), 0);
              const totalPassed = requests.reduce((s: number, r: any) =>
                s + (r.proposals?.filter((p: any) => p.verification === 'Pass').length || 0), 0);

              const renderProposal = (p: any) => {
                const tName = p.trainer?.name || p.trainerName || '—';
                const tExp = p.trainer?.experienceYears ?? p.experienceYears ?? 0;
                const tSkills = p.trainer?.skills || p.trainerSkills || '';
                const slots = readAvailabilitySlots(p);
                const isPrimary = client.primaryTrainerId && p.trainer?.id === client.primaryTrainerId;
                const vColor = p.verification === 'Pass' ? 'green' : p.verification === 'Fail' ? 'red' : 'amber';
                return (
                  <div key={p.id} className={`border rounded p-2.5 ${p.verification === 'Pass' ? 'border-brand-green/50 bg-brand-green/5' : 'border-brand-border'}`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.trainer?.id ? (
                            <Link to={`/trainers/${p.trainer.id}`} className="font-medium text-brand-blue">{tName}</Link>
                          ) : (
                            <span className="font-medium">{tName}</span>
                          )}
                          <Pill color={vColor as any}>{p.verification}</Pill>
                          {isPrimary && <Pill color="blue">★ primary</Pill>}
                          <span className="muted text-[11px]">{tExp}y · ₹{p.rateInr}</span>
                        </div>
                        {tSkills && <div className="muted text-xs mt-0.5">{tSkills}</div>}
                        <div className="muted text-[10px] mt-1">
                          Proposed by <strong>{p.proposedBy?.name || '—'}</strong>
                          {p.proposedAt && <> · {p.proposedAt}</>}
                        </div>
                        {slots.length > 0 && (
                          <div className="text-[11px] mt-1">🕒 {formatAvailabilitySlots(slots)} IST</div>
                        )}
                      </div>
                      {canIntake(user.role) && p.verification !== 'Pass' && (
                        <PromoteToPassButton proposalId={p.id} clientId={client.id} trainerNotifiedAt={p.trainerNotifiedAt} />
                      )}
                    </div>
                    {(p.confirmationUrl || p.skillMatrixUrl) && (
                      <div className="mt-2 space-y-1">
                        {p.confirmationUrl && (
                          <div className="flex items-center gap-2 bg-bg-input rounded p-1.5">
                            <Pill color={p.confirmationKind === 'Audio' ? 'purple' : 'blue'}>{p.confirmationKind}</Pill>
                            {p.confirmationKind === 'Audio' ? (
                              <audio controls src={fileUrl(p.confirmationUrl)} style={{ height: 28, flex: 1 }} />
                            ) : (
                              <a href={fileUrl(p.confirmationUrl)} target="_blank" rel="noreferrer" className="text-brand-blue text-xs underline">View screenshot</a>
                            )}
                          </div>
                        )}
                        {p.skillMatrixUrl && (
                          <a href={fileUrl(p.skillMatrixUrl)} target="_blank" rel="noreferrer" className="text-brand-blue text-xs underline">View skill matrix →</a>
                        )}
                      </div>
                    )}
                    {p.verificationNotes && (
                      <div className="muted text-[11px] italic mt-1">Note: {p.verificationNotes}</div>
                    )}
                    {/* Post-demo status + feedback (visible once Anjali fills Move-back) */}
                    {p.postDemoStatus && (() => {
                      const sc =
                        p.postDemoStatus === 'Selected'        ? 'var(--status-green)'  :
                        p.postDemoStatus === 'Shortlisted'     ? 'var(--status-amber)'  :
                        p.postDemoStatus === 'Rejected'        ? 'var(--status-red)'    :
                        p.postDemoStatus === 'NotSuitable'     ? 'var(--status-red)'    :
                        p.postDemoStatus === 'NeedAnotherDemo' ? 'var(--status-blue)'   :
                        'var(--brand-textMuted)';
                      const label =
                        p.postDemoStatus === 'NeedAnotherDemo'      ? 'Need Another Demo'  :
                        p.postDemoStatus === 'NotSuitable'          ? 'Not Suitable'        :
                        p.postDemoStatus === 'PendingClientFeedback'? 'Pending Feedback'    :
                        p.postDemoStatus;
                      return (
                        <div className="mt-2 rounded-lg px-2.5 py-1.5" style={{ background: sc + '14', border: `1px solid ${sc}44` }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: sc }}>{label}</span>
                            {p.postDemoNote && <span className="text-[11px]" style={{ color: 'var(--brand-textSecondary)' }}>— {p.postDemoNote}</span>}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              };

              return (
                <div className="card">
                  <div className="card-h">
                    Proposed trainers · {totalCount}
                    {totalPassed > 0 && (
                      <span className="ml-2"><Pill color="green">{totalPassed} passed</Pill></span>
                    )}
                  </div>
                  <div className="space-y-4">
                    {requests.map((r: any, idx: number) => {
                      const sortRank = (v: string) => (v === 'Pass' ? 0 : v === 'Pending' ? 1 : 2);
                      const proposals = [...(r.proposals || [])].sort(
                        (a: any, b: any) => sortRank(a.verification) - sortRank(b.verification),
                      );
                      const passedCount = proposals.filter((p: any) => p.verification === 'Pass').length;
                      const pendingCount = proposals.filter((p: any) => p.verification === 'Pending').length;
                      const dateLabel = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
                      const isLatest = idx === 0;

                      const roundHeader = (
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-textMuted">
                            {isLatest ? 'Current round' : 'Previous round'}
                            {dateLabel && <> · {dateLabel}</>}
                          </span>
                          <span className="text-[11px] text-brand-textMuted">· {proposals.length} trainer{proposals.length !== 1 ? 's' : ''}</span>
                          {passedCount > 0 && <Pill color="green">{passedCount} passed</Pill>}
                          {pendingCount > 0 && <Pill color="amber">{pendingCount} pending</Pill>}
                        </div>
                      );

                      if (isLatest) {
                        return (
                          <div key={r.id}>
                            {roundHeader}
                            <div className="space-y-2">
                              {proposals.map(renderProposal)}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <details key={r.id} className="group">
                          <summary className="cursor-pointer list-none">
                            <div className="flex items-center gap-2 flex-wrap opacity-60 hover:opacity-90 transition-opacity">
                              <span className="text-[11px]">▶</span>
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-textMuted">
                                Previous round{dateLabel && ` · ${dateLabel}`}
                              </span>
                              <span className="text-[11px] text-brand-textMuted">· {proposals.length} trainer{proposals.length !== 1 ? 's' : ''}</span>
                              {passedCount > 0 && <Pill color="green">{passedCount} passed</Pill>}
                              {pendingCount > 0 && <Pill color="amber">{pendingCount} pending</Pill>}
                            </div>
                          </summary>
                          <div className="mt-2 space-y-2 pl-3 border-l border-brand-border">
                            {proposals.map(renderProposal)}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

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
              {(client.lifecycle === 'Active' || client.lifecycle === 'LeverageGranted') && (
                <Field label="Account manager">
                  {client.assignedAm
                    ? <span style={{ color: 'var(--accent-gold)' }}>{client.assignedAm.name}</span>
                    : <span className="muted italic">Not assigned</span>}
                </Field>
              )}
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
                {canEditClient(user.role, 'engagement') && (
                  <Button size="sm" onClick={() => setModal('editEngagement')}><EditIcon size={12}/></Button>
                )}
              </div>
              {!['manager', 'lead', 'account_manager'].includes(user.role) && (
                <Field label="Source">{client.source || '—'}</Field>
              )}
              {client.partner && <Field label="Partner">{client.partner.name}</Field>}
              {showAmt && <Field label="Currency · Amount"><span className="mono">{client.currency} {client.cycleAmount || 0}</span></Field>}
              <Field label="Verification">{client.requiresVerification ? <Pill color="green">Required</Pill> : <Pill>Disabled</Pill>}</Field>
              {client.notes && <Field label="Notes"><div className="whitespace-pre-wrap text-xs">{client.notes}</div></Field>}
            </div>

            {/* Training Setup & Handover — visible to manager/lead/founder/AM */}
            {['manager', 'lead', 'founder', 'account_manager'].includes(user.role) && (
              <div className="card">
                <div className="card-h">
                  <span>Training Setup & Handover</span>
                  <Button size="sm" onClick={() => setModal('editTrainingSetup')}><EditIcon size={12}/></Button>
                </div>
                <Field label="Session timings">{(client as any).sessionTimings || <span className="muted">—</span>}</Field>
                <Field label="Meeting platform">{(client as any).meetingPlatform || <span className="muted">—</span>}</Field>
                <Field label="Client skill set">{(client as any).clientSkillSet || <span className="muted">—</span>}</Field>
                <Field label="Client timezone">{(client as any).clientTimezone || <span className="muted">—</span>}</Field>
                <Field label="WA group link">
                  {client.whatsappGroupLink
                    ? <a href={client.whatsappGroupLink} target="_blank" rel="noreferrer" style={{ color: '#25d366' }}>Open group →</a>
                    : <span className="muted">—</span>}
                </Field>
              </div>
            )}

            {/* Handover workflow — manager/lead/founder */}
            {['manager', 'lead', 'founder'].includes(user.role) && (
              <div className="card">
                <div className="card-h">
                  <span>Handover</span>
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => setModal('editHandover')}><EditIcon size={12}/></Button>
                    <Button size="sm" variant={(client as any).welcomeEmailSentAt ? 'default' : 'primary'} onClick={() => setModal('mitaliWelcomeEmail')}>
                      <Mail size={12}/> {(client as any).welcomeEmailSentAt ? 'Resend welcome email' : 'Send welcome email'}
                    </Button>
                  </div>
                </div>
                <Field label="Handover status">
                  {(client as any).handoverStatus
                    ? <Pill color={(client as any).handoverStatus === 'Done' ? 'green' : 'amber'}>{(client as any).handoverStatus}</Pill>
                    : <span className="muted">Not started</span>}
                </Field>
                <Field label="Handover date">{(client as any).handoverDate || <span className="muted">—</span>}</Field>
                <Field label="Handover owner">{(client as any).handoverOwner?.name || <span className="muted">—</span>}</Field>
                <Field label="Handover notes">{(client as any).handoverNotes || <span className="muted">—</span>}</Field>
                {(client as any).welcomeEmailSentAt && (
                  <Field label="Welcome email sent">
                    <span className="text-green-400">{(client as any).welcomeEmailSentAt} ✓</span>
                  </Field>
                )}
              </div>
            )}

            {/* Certificate of Completion — Hold/Completed clients */}
            {['manager', 'lead', 'founder', 'account_manager'].includes(user.role) && ['Hold', 'Completed'].includes(client.lifecycle) && (
              <div className="card">
                <div className="card-h">
                  <span>Certificate of Completion</span>
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => setModal('editTrainingSetup')}><EditIcon size={12}/></Button>
                    {(client as any).certificateUrl && !(client as any).certificateEmailSentAt && (
                      <Button size="sm" variant="primary" onClick={() => setModal('certificateEmail')}>
                        <Mail size={12}/> Send certificate email
                      </Button>
                    )}
                  </div>
                </div>
                {(client as any).certificateUrl ? (
                  <Field label="Certificate">
                    <a href={(client as any).certificateUrl} target="_blank" rel="noreferrer" className="text-brand-blue">View certificate →</a>
                    {(client as any).certificateUploadedAt && <span className="muted text-[11px] ml-2">uploaded {(client as any).certificateUploadedAt}</span>}
                  </Field>
                ) : (
                  <div className="muted text-[12px] py-2">No certificate uploaded yet. Edit to add certificate URL.</div>
                )}
                {(client as any).certificateEmailSentAt && (
                  <Field label="Email sent"><span className="text-green-400">{(client as any).certificateEmailSentAt} ✓</span></Field>
                )}
              </div>
            )}

            <CommentSection clientId={client.id} />
            <ActivityLog clientId={client.id} />
            <FeedbackActivityLog clientId={client.id} />
            <DemoHistoryCard clientId={client.id} />
            <CallHistoryCard clientId={client.id} role={user.role} />
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
        {modal === 'skipMatrix' && <SkipMatrixModal client={client} onClose={() => setModal(null)} onProceed={() => { setModal('scheduleDemo'); }} />}
        {modal === 'noShow' && <NoShowModal client={client} onClose={() => setModal(null)} />}
        {modal === 'subStatus' && <SubStatusModal client={client} initialTarget={subStatusTarget} onClose={() => { setModal(null); setSubStatusTarget(undefined); }} />}
        {modal === 'paymentChecklist' && <PaymentChecklistModal client={client} onClose={() => setModal(null)} />}
        {modal === 'paymentConfirmation' && <PaymentConfirmationModal client={client} onClose={() => setModal(null)} />}
        {modal === 'groupRename' && <GroupRenameModal client={client} onClose={() => setModal(null)} />}
        {modal === 'preDemoReminder' && <PreDemoReminderModal client={client} onClose={() => setModal(null)} />}
        {modal === 'engagementLetter' && <EngagementLetterModal client={client} onClose={() => setModal(null)} />}
        {modal === 'handoverWelcome' && <HandoverWelcomeModal client={client} onClose={() => setModal(null)} />}
        {modal === 'feedbackEmail' && <FeedbackEmailModal client={client} onClose={() => setModal(null)} />}
        {modal === 'assignAm' && <AssignAmModal client={client} onClose={() => setModal(null)} />}
        {modal === 'scheduleSession' && (() => {
          const rt = client.regularTrainings?.[0];
          if (!rt) return (
            <Dialog open onOpenChange={(v) => !v && setModal(null)}>
              <DialogContent title="Schedule session">
                <p className="text-sm muted">No active training session found for this client. Add one from My Sessions first.</p>
                <DialogFooter><Button onClick={() => setModal(null)}>Close</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          );
          return (
            <AMScheduleDialog
              training={{
                id: rt.id,
                name: client.name,
                client: { id: client.id, name: client.name, whatsappGroupLink: client.whatsappGroupLink, phoneCode: client.phoneCode, phoneDigits: client.phoneDigits },
                trainer: client.primaryTrainer ? { id: client.primaryTrainer.id, name: client.primaryTrainer.name, email: client.primaryTrainer.email, phoneCode: client.primaryTrainer.phoneCode, phoneDigits: client.primaryTrainer.phoneDigits } : null,
                meetingMode: client.meetingMode || 'Zoom',
                defaultTimeIst: client.demoTimeIst || '',
                scheduleNotes: rt.scheduleNotes || null,
                sessions: [],
              }}
              onClose={() => setModal(null)}
              onSent={() => setModal(null)}
            />
          );
        })()}
        {modal === 'editTrainingSetup' && <EditTrainingSetupModal client={client} onClose={() => setModal(null)} />}
        {modal === 'editHandover' && <EditHandoverModal client={client} onClose={() => setModal(null)} />}
        {modal === 'mitaliWelcomeEmail' && <MitaliWelcomeEmailModal client={client} onClose={() => setModal(null)} />}
        {modal === 'certificateEmail' && <CertificateEmailModal client={client} onClose={() => setModal(null)} />}
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

function EditContactModal({ client, onClose, emailOnly = false }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const [f, setF] = useState({
    name: client.name || '',
    whatsappGroupName: client.whatsappGroupName || '',
    whatsappGroupLink: client.whatsappGroupLink || '',
    phoneCode: client.phoneCode || '+1',
    phoneDigits: client.phoneDigits || '',
    email: client.email || '',
  });
  const save = useMutation({
    mutationFn: () => {
      if (emailOnly) return api.patch(`/clients/${client.id}`, { email: f.email });
      // Only send fields that actually changed — avoids false phone-uniqueness errors
      const payload: any = {};
      if (f.name !== (client.name || '')) payload.name = f.name;
      if (f.whatsappGroupName !== (client.whatsappGroupName || '')) payload.whatsappGroupName = f.whatsappGroupName;
      if (f.whatsappGroupLink !== (client.whatsappGroupLink || '')) payload.whatsappGroupLink = f.whatsappGroupLink;
      if (f.phoneCode !== (client.phoneCode || '+1')) payload.phoneCode = f.phoneCode;
      if (f.phoneDigits !== (client.phoneDigits || '')) payload.phoneDigits = f.phoneDigits;
      if (f.email !== (client.email || '')) payload.email = f.email;
      return api.patch(`/clients/${client.id}`, payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client', client.id] }); showToast('Saved'); onClose(); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Edit contact · ${client.name}`} description={emailOnly ? 'Update client email address.' : 'WhatsApp group is primary. Direct phone is backup.'}>
        {!emailOnly && <>
          <div className="form-row"><Label>Client name</Label><Input value={f.name} onChange={(e) => setF({...f, name: e.target.value})} /></div>
          <div className="form-row"><Label>WhatsApp group name</Label><Input value={f.whatsappGroupName} onChange={(e) => setF({...f, whatsappGroupName: e.target.value})} /></div>
          <div className="form-row"><Label>WhatsApp group invite link</Label><Input value={f.whatsappGroupLink} onChange={(e) => setF({...f, whatsappGroupLink: e.target.value})} placeholder="https://chat.whatsapp.com/..." /></div>
          <div className="form-row"><Label>Direct phone (backup)</Label>
            <div className="grid grid-cols-[120px_1fr] gap-2">
              <Select value={f.phoneCode} onChange={(e) => setF({...f, phoneCode: e.target.value})}>
                <option>+1</option><option>+91</option><option>+44</option><option>+61</option><option>+64</option><option>+971</option><option>+65</option><option>+60</option><option>+63</option><option>+92</option><option>+880</option><option>+94</option><option>+977</option><option>+49</option><option>+33</option><option>+39</option><option>+34</option><option>+31</option><option>+48</option><option>+46</option><option>+47</option><option>+45</option><option>+358</option><option>+41</option><option>+43</option><option>+32</option><option>+353</option><option>+351</option><option>+30</option><option>+90</option><option>+7</option><option>+966</option><option>+974</option><option>+973</option><option>+968</option><option>+962</option><option>+20</option><option>+27</option><option>+234</option><option>+254</option><option>+82</option><option>+81</option><option>+86</option><option>+852</option><option>+886</option><option>+66</option><option>+62</option><option>+84</option><option>+55</option><option>+52</option><option>+54</option><option>+56</option><option>+57</option><option>+51</option><option>+58</option>
              </Select>
              <Input value={f.phoneDigits} onChange={(e) => setF({...f, phoneDigits: e.target.value.replace(/\D/g,'')})} placeholder="10 digits" />
            </div>
          </div>
        </>}
        <div className="form-row"><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({...f, email: e.target.value})} /></div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate()}>Save</Button>
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
    if (client.whatsappGroupLink) window.open(client.whatsappGroupLink, 'whatsapp_window', 'noopener');
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
  const [attachments, setAttachments] = useState<{ name: string; url: string }[]>(
    ((client.intakeData as any)?.attachments as { name: string; url: string }[]) || []
  );
  const [uploading, setUploading] = useState(false);

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
  // JBT and existing-engagement leads never get the welcome email — they already know MITS.
  const isFirstReceive = client.lifecycle === 'Lead' || client.lifecycle === 'IntakeSent';
  const clientEmail = client.email || (client.intakeData as any)?.client_email || data.client_email || '';
  const isJbtOrExisting = client.source === 'JBT' || client.source === 'Existing engagement';
  // Default checked when an email is on file AND source isn't JBT/Existing; auto-uncheck if either changes.
  const [sendWelcome, setSendWelcome] = useState<boolean>(!!clientEmail && !isJbtOrExisting);
  useEffect(() => {
    setSendWelcome((prev) => (clientEmail && !isJbtOrExisting ? prev : false));
  }, [clientEmail, isJbtOrExisting]);

  const save = useMutation({
    mutationFn: async () => {
      // 1. Save workflow fields via PATCH ("workflow" category — Anjali/Taran allowed)
      await api.patch(`/clients/${client.id}`, {
        intakeData: { ...data, attachments },
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
                disabled={!clientEmail || isJbtOrExisting}
              />
              <div className="text-sm">
                <div className="font-medium">Send welcome email automatically</div>
                <div className="text-xs muted mt-0.5">
                  Sends the branded <em>"Introducing MITS Solution"</em> email to {clientEmail || '(client)'} with the Client Interest Document, team intro, and Samita's signature.
                  {!clientEmail && <span className="text-brand-amber"> · No client email on file — provide an email above to enable.</span>}
                  {isJbtOrExisting && (
                    <span className="text-brand-amber"> · Skipped — client source is <strong>{client.source}</strong>, they already know MITS.</span>
                  )}
                </div>
              </div>
            </label>
          </div>
        )}

        {/* Attachments */}
        <div className="mt-3">
          <Label>Attachments (documents, screenshots)</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-bg-input border border-brand-border rounded px-2 py-1 text-xs">
                <a href={a.url} target="_blank" rel="noreferrer" className="text-brand-blue underline max-w-[160px] truncate">{a.name}</a>
                <button
                  type="button"
                  className="text-brand-red hover:opacity-70 font-bold leading-none"
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  title="Remove"
                >×</button>
              </div>
            ))}
            <label className={`flex items-center gap-1.5 cursor-pointer text-xs px-2 py-1 rounded border border-dashed border-brand-border hover:border-brand-blue text-brand-blue ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploading ? 'Uploading…' : '+ Add file'}
              <input
                type="file"
                className="hidden"
                multiple
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  setUploading(true);
                  try {
                    const uploaded: { name: string; url: string }[] = [];
                    for (const file of files) {
                      const fd = new FormData();
                      fd.append('file', file);
                      const r = await api.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                      uploaded.push({ name: file.name, url: r.data.url });
                    }
                    setAttachments((prev) => [...prev, ...uploaded]);
                  } catch {
                    showToast('File upload failed', 'error');
                  } finally {
                    setUploading(false);
                    e.target.value = '';
                  }
                }}
              />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!data.detailed_skill_set || save.isPending || uploading} onClick={() => save.mutate()}>
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
          {!isLoading && (() => {
            const q = trainerSearch.trim().toLowerCase();
            const filtered: any[] = q
              ? results.filter(({ trainer: t }: any) => {
                  const hay = `${t.name || ''} ${t.skills || ''} ${t.phoneDigits || ''} ${t.email || ''}`.toLowerCase();
                  return hay.includes(q);
                })
              : results.slice(0, 12);
            if (q && filtered.length === 0) return <div className="muted text-center py-6">No trainers match &ldquo;{trainerSearch}&rdquo;.</div>;
            return filtered.map(({ trainer: t, total, breakdown }: any) => {
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
            });
          })()}
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

type DemoSlot = { trainerId: string; trainerName: string; date: string; timeIst: string; include: boolean };

function ScheduleDemoModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const [sendInvite, setSendInvite] = useState(true);

  // Build the candidate list from passed proposals + primary trainer fallback.
  // Each candidate gets its own date/time slot so Anjali can match each trainer's availability.
  const candidates: { trainerId: string; trainerName: string; suggestedDate?: string; suggestedTime?: string }[] = useMemo(() => {
    const out: { trainerId: string; trainerName: string; suggestedDate?: string; suggestedTime?: string }[] = [];
    const seen = new Set<string>();
    // Pull passed proposals across all sourcing requests
    for (const r of (client.sourcingRequests || [])) {
      for (const p of (r.proposals || [])) {
        if (p.verification === 'Pass' && p.trainer?.id && !seen.has(p.trainer.id)) {
          seen.add(p.trainer.id);
          out.push({ trainerId: p.trainer.id, trainerName: p.trainer.name });
        }
      }
    }
    // Primary trainer fallback (Internal Search path — no proposal)
    if (client.primaryTrainerId && !seen.has(client.primaryTrainerId)) {
      out.push({
        trainerId: client.primaryTrainerId,
        trainerName: client.primaryTrainer?.name || 'Primary trainer',
      });
    }
    return out;
  }, [client]);

  // Initial slots: pre-check primary trainer if it exists, otherwise the first one.
  const [slots, setSlots] = useState<DemoSlot[]>(() => {
    const baseDate = client.demoDate || todayISO();
    const baseTime = client.demoTimeIst || '20:00';
    return candidates.map((c, i) => ({
      trainerId: c.trainerId,
      trainerName: c.trainerName,
      date: baseDate,
      timeIst: baseTime,
      include: client.primaryTrainerId ? c.trainerId === client.primaryTrainerId : i === 0,
    }));
  });

  function patchSlot(idx: number, patch: Partial<DemoSlot>) {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  const activeSlots = slots.filter((s) => s.include && s.date && s.timeIst);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        slots: activeSlots.map((s) => ({ trainerId: s.trainerId, date: s.date, timeIst: s.timeIst })),
        sendInvite,
      };
      await api.post(`/clients/${client.id}/schedule-multi-demo`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['my-calendar'] });
      const n = activeSlots.length;
      showToast(`Demo scheduled · ${n} trainer${n === 1 ? '' : 's'}${sendInvite ? ' · invites sent' : ''}`);
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const hasClientEmail = !!(client.email || client.intakeData?.client_email);
  const hasAnyCandidate = candidates.length > 0;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Schedule demo · ${client.name}`}
        description={hasAnyCandidate
          ? 'Tick each trainer you want to schedule. Each can have its own date/time — invites and calendar entries are created per trainer.'
          : 'Set the demo date + IST time. Saved on the client and shown on the Demo schedule page.'
        }
        className="max-w-2xl"
      >
        {!hasAnyCandidate && (
          <div className="callout amber mb-2">
            No trainer on file yet. Pick a trainer via Internal Search first, or wait for a recruiter proposal.
          </div>
        )}

        {hasAnyCandidate && (
          <div className="space-y-2 mb-3">
            {slots.map((s, idx) => (
              <div
                key={s.trainerId}
                className={`border rounded-md p-2.5 ${s.include ? 'border-brand-amber bg-bg-input' : 'border-brand-border'}`}
              >
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={s.include}
                    onChange={(e) => patchSlot(idx, { include: e.target.checked })}
                  />
                  <span className="text-sm font-medium">{s.trainerName}</span>
                  {client.primaryTrainerId === s.trainerId && (
                    <span className="text-[10px] muted">· primary</span>
                  )}
                </label>
                {s.include && (
                  <div className="grid md:grid-cols-2 gap-2 pl-6">
                    <div className="form-row">
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={s.date}
                        min={minPastDate()}
                        max={maxTodayDate()}
                        onChange={(e) => patchSlot(idx, { date: e.target.value })}
                      />
                    </div>
                    <div className="form-row">
                      <Label>Time (IST)</Label>
                      <Time12h
                        value={s.timeIst}
                        onChange={(v) => patchSlot(idx, { timeIst: v })}
                        quickSet
                        ariaLabel={`Demo time for ${s.trainerName}`}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-1 p-2.5 bg-bg-input rounded">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={(e) => setSendInvite(e.target.checked)}
              className="mt-0.5"
            />
            <div className="text-sm">
              <div className="font-medium">Send calendar invite (.ics) to client + trainer{activeSlots.length > 1 ? '(s)' : ''}</div>
              <div className="text-xs muted mt-0.5">
                One invite per trainer at their own time. You'll also get a copy on your own calendar.
                {!hasClientEmail && <span className="text-brand-amber"> · No client email on file — only trainer(s) will receive.</span>}
              </div>
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!hasAnyCandidate || activeSlots.length === 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending
              ? 'Scheduling…'
              : activeSlots.length > 1
                ? `Schedule ${activeSlots.length} demos`
                : client.lifecycle === 'DemoScheduled' ? 'Update demo time' : 'Schedule demo'}
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
          <div className="form-row"><Label>Date</Label><Input type="date" value={f.paymentDate} min={minPastDate()} max={maxTodayDate()} onChange={(e) => setF({...f, paymentDate: e.target.value})} /></div>
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
        <div className="form-row"><Label>New committed date</Label><Input type="date" value={f.newCommittedDate} min={minFutureDate()} onChange={(e) => setF({...f, newCommittedDate: e.target.value})} /></div>
        <div className="form-row"><Label>Reason</Label><Textarea value={f.reasonStated} onChange={(e) => setF({...f, reasonStated: e.target.value})} /></div>
        <DialogFooter><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => create.mutate()}>Submit</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Assign AM — Mitali picks which account manager will handle this active client
function AssignAmModal({ client, onClose }: any) {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then(r => r.data) });
  // Fixed Mitali's team: Bhavneet (lead), Kashish + Muskan (account_manager)
  const candidates = (users || []).filter((u: any) => u.active && ['lead', 'account_manager'].includes(u.role));
  const [amId, setAmId] = useState(client.assignedAmId || '');
  const save = useMutation({
    mutationFn: () => api.patch(`/clients/${client.id}`, { assignedAmId: amId || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['clients', 'team-kanban'] });
      showToast(amId ? 'AM assigned' : 'AM unassigned');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Assign account manager · ${client.name}`}
        description="Pick who from your team will handle sessions, feedback and trainer liaison for this client.">
        <div className="form-row">
          <Label>Account manager</Label>
          <Select value={amId} onChange={(e) => setAmId(e.target.value)}>
            <option value="">— unassigned —</option>
            {candidates.map((u: any) => (
              <option key={u.id} value={u.id}>{u.name} · {u.role.replace('_', ' ')}</option>
            ))}
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Assign'}
          </Button>
        </DialogFooter>
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
    demoEvidenceUrl: client.demoEvidenceUrl || '',
    demoEvidenceKind: client.demoEvidenceKind || '',
  });

  // Fetch all demos for this client to get per-trainer rows (Scheduled status)
  const { data: allDemos } = useQuery({
    queryKey: ['client-demos', client.id],
    queryFn: () => api.get(`/clients/${client.id}/demos`).then((r) => r.data),
  });
  // Demos that were scheduled for this round (not yet marked Done)
  const pendingDemos: any[] = (allDemos || []).filter((d: any) => d.status === 'Scheduled' && d.trainer);
  // Per-trainer state: trainerOutcome + feedback + nextSteps
  const [trainerFeedbacks, setTrainerFeedbacks] = useState<Record<string, { trainerOutcome: string; feedback: string; nextSteps: string }>>({});
  function setTF(demoId: string, patch: Partial<{ trainerOutcome: string; feedback: string; nextSteps: string }>) {
    setTrainerFeedbacks((prev) => {
      const existing = prev[demoId] || { trainerOutcome: '', feedback: '', nextSteps: '' };
      return { ...prev, [demoId]: { ...existing, ...patch } };
    });
  }
  const [uploading, setUploading] = useState(false);
  async function pickEvidence(file: File, kind: 'Audio' | 'Screenshot') {
    setUploading(true);
    try {
      // Normalize audio recordings to .mp3 — same pattern as the proposal flow.
      const final = kind === 'Audio'
        ? new File([file], `demo-evidence-${Date.now()}.mp3`, { type: 'audio/mpeg' })
        : file;
      const r = await uploadFile(final);
      setF((prev) => ({ ...prev, demoEvidenceUrl: r.url, demoEvidenceKind: kind }));
      showToast(`${kind} attached — will be sent to recruiter on save`);
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }
  const save = useMutation({
    mutationFn: async () => {
      // 1. workflow PATCH (actuals + overall feedback) — Anjali/Taran allowed
      await api.patch(`/clients/${client.id}`, f);
      // 2. Per-trainer demo row updates (non-fatal)
      for (const demo of pendingDemos) {
        const tf = trainerFeedbacks[demo.id];
        if (tf && (tf.trainerOutcome || tf.feedback || tf.nextSteps)) {
          try {
            await api.patch(`/clients/${client.id}/demos/${demo.id}`, {
              trainerOutcome: tf.trainerOutcome || null,
              feedback: tf.feedback || null,
              nextSteps: tf.nextSteps || null,
            });
          } catch { /* non-fatal */ }
        }
      }
      // 3. stage → DemoDone (skipped if already there)
      if (client.lifecycle !== 'DemoDone') {
        await api.post(`/clients/${client.id}/stage`, { lifecycle: 'DemoDone' });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client-demos', client.id] });
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
            <Input type="date" value={f.demoActualDate} min={minPastDate()} max={maxTodayDate()} onChange={(e) => setF({ ...f, demoActualDate: e.target.value })} />
            {client.demoDate && <div className="text-[10px] muted mt-0.5">Scheduled: {client.demoDate}</div>}
          </div>
          <div className="form-row">
            <Label>Actual time (IST)</Label>
            <Time12h value={f.demoActualTimeIst} onChange={(v) => setF({ ...f, demoActualTimeIst: v })} ariaLabel="Demo actual time" />
            {client.demoTimeIst && <div className="text-[10px] muted mt-0.5">Scheduled: {to12h(client.demoTimeIst)} IST</div>}
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
        {/* Evidence upload — show when the demo didn't go well. Auto-notifies
            the proposing recruiter (Aman/Kanchan) on save. */}
        {/* ── Per-trainer outcome (shown when multiple trainers demoed) ── */}
        {pendingDemos.length > 0 && (
          <div className="mt-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.10em] mb-2" style={{ color: 'var(--brand-textSecondary)' }}>
              Trainer-level feedback ({pendingDemos.length} trainer{pendingDemos.length > 1 ? 's' : ''})
            </div>
            <div className="space-y-3">
              {pendingDemos.map((demo: any) => {
                const tf = trainerFeedbacks[demo.id] || { trainerOutcome: '', feedback: '' };
                const outcomeColor =
                  tf.trainerOutcome === 'Selected'    ? 'var(--status-green)'  :
                  tf.trainerOutcome === 'Shortlisted' ? 'var(--status-amber)'  :
                  tf.trainerOutcome === 'Rejected'    ? 'var(--status-red)'    :
                  'var(--brand-textMuted)';
                return (
                  <div key={demo.id} className="rounded-xl p-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-[12px]" style={{ color: 'var(--brand-text)' }}>
                        {demo.trainer?.name || 'Trainer'}
                      </span>
                      {demo.trainer?.skills && (
                        <span className="text-[10px] muted truncate" style={{ maxWidth: 200 }}>{demo.trainer.skills.split(',').slice(0,3).join(', ')}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="form-row mb-0">
                        <Label>Client's decision</Label>
                        <Select
                          value={tf.trainerOutcome}
                          onChange={(e) => setTF(demo.id, { trainerOutcome: e.target.value })}
                          style={{ color: outcomeColor, fontWeight: tf.trainerOutcome ? 600 : undefined }}
                        >
                          <option value="">— pending —</option>
                          <option value="Selected">Selected ✓</option>
                          <option value="Shortlisted">Shortlisted (considering)</option>
                          <option value="Rejected">Rejected ✗</option>
                          <option value="PendingClientFeedback">Pending client feedback</option>
                        </Select>
                      </div>
                      <div className="form-row mb-0">
                        <Label>Client feedback for this trainer</Label>
                        <Input
                          value={tf.feedback}
                          onChange={(e) => setTF(demo.id, { feedback: e.target.value })}
                          placeholder="What the client said about this trainer…"
                        />
                      </div>
                    </div>
                    <div className="form-row mb-0 mt-2">
                      <Label>Next steps for this trainer</Label>
                      <Input
                        value={tf.nextSteps}
                        onChange={(e) => setTF(demo.id, { nextSteps: e.target.value })}
                        placeholder="e.g. Not fit — lack of GPS experience, need another demo…"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(f.demoOutcome === 'Negative' || f.demoOutcome === 'Neutral') && (
          <div className="form-row">
            <Label>
              Evidence (audio / screenshot)
              <span className="muted normal-case ml-1">— shared with the recruiter to explain why the demo didn't land</span>
            </Label>
            {f.demoEvidenceUrl ? (
              <div className="flex items-center gap-2 bg-bg-input rounded p-2 text-xs">
                <Pill color={f.demoEvidenceKind === 'Audio' ? 'purple' : 'blue'}>{f.demoEvidenceKind}</Pill>
                {f.demoEvidenceKind === 'Audio' ? (
                  <audio controls src={fileUrl(f.demoEvidenceUrl)} style={{ height: 28, flex: 1 }} />
                ) : (
                  <a href={fileUrl(f.demoEvidenceUrl)} target="_blank" rel="noreferrer" className="text-brand-blue flex-1 underline">View screenshot</a>
                )}
                <button onClick={() => setF({ ...f, demoEvidenceUrl: '', demoEvidenceKind: '' })} className="text-brand-textMuted hover:text-brand-red p-1" title="Remove">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <label className="btn btn-sm cursor-pointer">
                  🎙 Audio recording
                  <input type="file" hidden disabled={uploading}
                    onChange={(e) => { const fl = e.target.files?.[0]; if (fl) pickEvidence(fl, 'Audio'); e.target.value = ''; }} />
                </label>
                <label className="btn btn-sm cursor-pointer">
                  🖼 Screenshot
                  <input type="file" accept="image/*" hidden disabled={uploading}
                    onChange={(e) => { const fl = e.target.files?.[0]; if (fl) pickEvidence(fl, 'Screenshot'); e.target.value = ''; }} />
                </label>
                {uploading && <span className="text-xs muted self-center">Uploading…</span>}
              </div>
            )}
          </div>
        )}
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
  const me = useAuth((s) => s.user)!;
  // sales_closer (Roshni) can only route back to recruiter stages
  const allOptions = backStagesFor(client.lifecycle);
  const options = me.role === 'sales_closer' || me.role === 'manager'
    ? allOptions.filter((s) => ['WithRecruiters'].includes(s))
    : allOptions;
  const [target, setTarget] = useState(options[0] || '');
  const [reason, setReason] = useState('');

  // Per-trainer feedback rows — populated from existing Pass'd proposals so Anjali
  // can capture WHY each specific trainer didn't work + optionally attach evidence.
  // Saved to Proposal.postDemoNote / postDemoEvidence* on submit.
  const passedProposals: any[] = (client.sourcingRequests || [])
    .flatMap((r: any) => (r.proposals || []))
    .filter((p: any) => p.verification === 'Pass');
  const [feedbacks, setFeedbacks] = useState<Record<string, { status: string; note: string; url: string; kind: string }>>(
    () => Object.fromEntries(passedProposals.map((p) => [p.id, {
      status: p.postDemoStatus || '',
      note: p.postDemoNote || '',
      url: p.postDemoEvidenceUrl || '',
      kind: p.postDemoEvidenceKind || '',
    }])),
  );
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  async function pickEvidence(pid: string, file: File, kind: 'Audio' | 'Screenshot') {
    setUploadingFor(pid);
    try {
      const final = kind === 'Audio'
        ? new File([file], `trainer-feedback-${Date.now()}.mp3`, { type: 'audio/mpeg' })
        : file;
      const r = await uploadFile(final);
      setFeedbacks((prev) => ({ ...prev, [pid]: { ...prev[pid], url: r.url, kind } }));
      showToast(`${kind} attached`);
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Upload failed', 'error');
    } finally {
      setUploadingFor(null);
    }
  }

  const m = useMutation({
    mutationFn: async () => {
      // 1. Save per-trainer feedback to each Pass'd proposal — non-fatal: if a PATCH
      //    fails we keep going so the stage transition still runs. The user can re-open
      //    Move-back to retry the failed feedback rows.
      const feedbackErrors: string[] = [];
      for (const p of passedProposals) {
        const fb = feedbacks[p.id];
        if (!fb) continue;
        const hasChange = fb.status !== (p.postDemoStatus || '')
          || fb.note !== (p.postDemoNote || '')
          || fb.url !== (p.postDemoEvidenceUrl || '')
          || fb.kind !== (p.postDemoEvidenceKind || '');
        if (!hasChange) continue;
        try {
          await api.patch(`/sourcing/proposal/${p.id}`, {
            postDemoStatus: fb.status || null,
            postDemoNote: fb.note || null,
            postDemoEvidenceUrl: fb.url || null,
            postDemoEvidenceKind: fb.kind || null,
          });
        } catch (e: any) {
          const tName = p.trainer?.name || p.trainerName || p.id;
          const msg = e?.response?.data?.error || e?.message || 'unknown';
          console.error(`[move-back] feedback PATCH failed for ${tName}:`, msg, e);
          feedbackErrors.push(`${tName}: ${msg}`);
        }
      }
      // 2. Transition the stage — this is the part the user actually cares about.
      await api.post(`/clients/${client.id}/stage`, { lifecycle: target, reason, sendInvite: false });
      return { feedbackErrors };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      if (result?.feedbackErrors?.length) {
        showToast(
          `Moved to ${stageLabel(target)} · ${result.feedbackErrors.length} feedback row(s) failed (see console)`,
          'error',
        );
      } else {
        showToast(`Moved back to ${stageLabel(target)}${passedProposals.length ? ' · feedback saved' : ''}`);
      }
      onClose();
    },
    onError: (e: any) => {
      const detail = e?.response?.data?.error || e?.message || 'Failed';
      console.error('[move-back] stage transition failed:', detail, e?.response?.data, e);
      showToast(`Move back failed: ${detail}`, 'error');
    },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Move back · ${client.name}`}
        description={`Currently at ${stageLabel(client.lifecycle)}. Pick an earlier stage to roll back to. If trainers were Pass'd, give per-trainer feedback so recruiters know what to improve.`}
        className="max-w-3xl"
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
              <Label>Reason (logged in audit trail) <span className="muted normal-case">— optional if per-trainer feedback is filled below</span></Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Client rejected after demo, wants someone with banking-domain experience" />
            </div>

            {passedProposals.length > 0 && (
              <div className="form-row">
                <Label>Resource status &amp; feedback <span className="muted normal-case ml-1">— set status per trainer, recruiters will see this</span></Label>
                <div className="space-y-3">
                  {passedProposals.map((p: any) => {
                    const fb = feedbacks[p.id] || { status: '', note: '', url: '', kind: '' };
                    const tName = p.trainer?.name || p.trainerName || '—';
                    const tSkills = p.trainer?.skills || '';
                    const statusColor =
                      fb.status === 'Selected'        ? 'var(--status-green)'  :
                      fb.status === 'Shortlisted'     ? 'var(--status-amber)'  :
                      fb.status === 'Rejected'        ? 'var(--status-red)'    :
                      fb.status === 'NotSuitable'     ? 'var(--status-red)'    :
                      fb.status === 'NeedAnotherDemo' ? 'var(--status-blue)'   :
                      'var(--brand-textMuted)';
                    return (
                      <div key={p.id} className="rounded-xl p-3" style={{ background: 'var(--bg-input)', border: `1px solid ${fb.status ? statusColor + '55' : 'var(--brand-borderSoft)'}`, transition: 'border-color 0.2s' }}>
                        {/* Trainer header */}
                        <div className="flex items-start justify-between gap-2 mb-2.5">
                          <div className="min-w-0">
                            <div className="font-semibold text-[12px]" style={{ color: 'var(--brand-text)' }}>{tName}</div>
                            {tSkills && <div className="text-[10px] muted truncate mt-0.5" title={tSkills}>{tSkills.split(',').slice(0,4).join(', ')}</div>}
                            <div className="text-[10px] muted mt-0.5">Proposed by {p.proposedBy?.name || '—'}</div>
                          </div>
                          {fb.status && (
                            <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: statusColor + '22', color: statusColor }}>
                              {fb.status === 'NeedAnotherDemo' ? 'Need Another Demo' : fb.status === 'NotSuitable' ? 'Not Suitable' : fb.status === 'PendingClientFeedback' ? 'Pending' : fb.status}
                            </span>
                          )}
                        </div>
                        {/* Status dropdown — primary field */}
                        <div className="mb-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--brand-textMuted)' }}>Resource status *</div>
                          <Select
                            value={fb.status}
                            onChange={(e) => setFeedbacks({ ...feedbacks, [p.id]: { ...fb, status: e.target.value } })}
                            style={{ color: fb.status ? statusColor : undefined, fontWeight: fb.status ? 600 : undefined }}
                          >
                            <option value="">— not set —</option>
                            <option value="Selected">Selected ✓</option>
                            <option value="Shortlisted">Shortlisted (client considering)</option>
                            <option value="Rejected">Rejected ✗</option>
                            <option value="NotSuitable">Not suitable for this client</option>
                            <option value="NeedAnotherDemo">Need another demo</option>
                            <option value="PendingClientFeedback">Pending client feedback</option>
                          </Select>
                        </div>
                        {/* Comments / feedback note */}
                        <div className="mb-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--brand-textMuted)' }}>Feedback / comments</div>
                          <Textarea
                            rows={2}
                            value={fb.note}
                            onChange={(e) => setFeedbacks({ ...feedbacks, [p.id]: { ...fb, note: e.target.value } })}
                            placeholder="What didn't work? Client's specific remarks about this trainer…"
                          />
                        </div>
                        {/* Evidence */}
                        {fb.url ? (
                          <div className="flex items-center gap-2 rounded p-1.5 text-xs" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-borderSoft)' }}>
                            <Pill color={fb.kind === 'Audio' ? 'purple' : 'blue'}>{fb.kind}</Pill>
                            {fb.kind === 'Audio' ? (
                              <audio controls src={fileUrl(fb.url)} style={{ height: 26, flex: 1 }} />
                            ) : (
                              <a href={fileUrl(fb.url)} target="_blank" rel="noreferrer" className="text-brand-blue underline flex-1">View screenshot</a>
                            )}
                            <button onClick={() => setFeedbacks({ ...feedbacks, [p.id]: { ...fb, url: '', kind: '' } })} className="text-brand-textMuted hover:text-brand-red p-1" title="Remove">
                              <X size={12}/>
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <label className="btn btn-sm cursor-pointer text-xs">
                              🎙 Audio evidence
                              <input type="file" hidden disabled={uploadingFor === p.id}
                                onChange={(e) => { const fl = e.target.files?.[0]; if (fl) pickEvidence(p.id, fl, 'Audio'); e.target.value = ''; }} />
                            </label>
                            <label className="btn btn-sm cursor-pointer text-xs">
                              🖼 Screenshot
                              <input type="file" accept="image/*" hidden disabled={uploadingFor === p.id}
                                onChange={(e) => { const fl = e.target.files?.[0]; if (fl) pickEvidence(p.id, fl, 'Screenshot'); e.target.value = ''; }} />
                            </label>
                            {uploadingFor === p.id && <span className="text-[11px] muted self-center">Uploading…</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          {(() => {
            // Reason can be the top-level Reason field OR any non-blank per-trainer note —
            // both end up in the audit trail. Don't block on the top field if Samita
            // already wrote feedback per trainer below.
            const hasPerTrainerFeedback = Object.values(feedbacks).some((fb) => fb.status.length > 0 || fb.note.trim().length > 0);
            const reasonOk = reason.trim().length > 0 || hasPerTrainerFeedback;
            const blockReason = !target
              ? 'Pick a stage to move back to.'
              : !reasonOk
                ? 'Add a Reason at the top OR set resource status / feedback for at least one trainer below.'
                : uploadingFor
                  ? 'Waiting for the file upload to finish.'
                  : null;
            return (
              <Button
                variant="amber"
                disabled={m.isPending}
                disabledReason={blockReason}
                onClick={() => {
                  // Auto-build a reason string from per-trainer notes when the top field is blank.
                  if (!reason.trim() && hasPerTrainerFeedback) {
                    const built = passedProposals
                      .map((p: any) => {
                        const fb = feedbacks[p.id];
                        const status = fb?.status || '';
                        const note = (fb?.note || '').trim();
                        const tName = p.trainer?.name || p.trainerName || 'Trainer';
                        if (status && note) return `${tName}: ${status} — ${note}`;
                        if (status) return `${tName}: ${status}`;
                        if (note) return `${tName}: ${note}`;
                        return '';
                      })
                      .filter(Boolean)
                      .join(' · ');
                    setReason(`Per-trainer feedback — ${built}`);
                  }
                  m.mutate();
                }}
              >
                <Undo2 size={14}/> {m.isPending ? 'Saving…' : `Move back to ${target ? stageLabel(target) : '—'}`}
              </Button>
            );
          })()}
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
            <Input type="date" value={f.dormantSince} min={minPastDate()} max={maxTodayDate()} onChange={(e) => setF({ ...f, dormantSince: e.target.value })} />
          </div>
          <div className="form-row">
            <Label>Check back on</Label>
            <Input type="date" value={f.dormantCheckBackOn} min={minFutureDate()} onChange={(e) => setF({ ...f, dormantCheckBackOn: e.target.value })} />
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
/** Small inline button to promote a Pending/Failed proposal to Pass — so it lands
 *  in the skill-matrix candidate set on the client page. When the proposal hasn't
 *  been notified yet, uses the notify-and-pass endpoint to self-attest + pass in one click. */
function PromoteToPassButton({ proposalId, clientId, trainerNotifiedAt }: { proposalId: string; clientId: string; trainerNotifiedAt?: string | null }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const notified = !!trainerNotifiedAt;
  const m = useMutation({
    mutationFn: () => api.post(notified
      ? `/sourcing/proposal/${proposalId}/pass`
      : `/sourcing/proposal/${proposalId}/notify-and-pass`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', clientId] });
      qc.invalidateQueries({ queryKey: ['skill-matrix-preview', clientId] });
      showToast(notified ? 'Trainer added to skill matrix as Pass' : 'Trainer marked notified + added as Pass');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  return (
    <Button
      size="sm"
      variant={notified ? 'success' : 'amber'}
      disabled={m.isPending}
      onClick={() => m.mutate()}
      title={notified
        ? 'Promote this trainer to Pass — they\'ll be included in the skill matrix'
        : 'Trainer not notified yet. This will self-attest the notification + Pass in one click.'}
    >
      <Check size={11}/> {m.isPending ? '…' : (notified ? 'Pass' : 'Notify + Pass')}
    </Button>
  );
}

/** Bypass the skill-matrix step entirely — Anjali shared it outside the portal,
 *  or the client doesn't need a formal matrix. Marks "sent" and jumps to Schedule demo. */
function SkipMatrixModal({ client, onClose, onProceed }: { client: any; onClose: () => void; onProceed: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/mark-skill-matrix-sent`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      showToast('Matrix step bypassed · Schedule demo unlocked');
      onClose();
      // Caller pivots to scheduleDemo modal
      setTimeout(onProceed, 50);
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Skip skill matrix · ${client.name}`}
        description='Unlocks Schedule demo without sending the in-portal matrix. Use this when you have already shared the profile externally, or the client does not need a formal matrix.'
      >
        <div className="form-row">
          <Label>Note (optional)</Label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. shared profile via WhatsApp on personal phone"
          />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="amber" disabled={m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? 'Unlocking…' : 'Skip & schedule demo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** No-show modal — client / trainer didn't show up. Three exits:
 *  1) Push by 1 week (auto-set demoDate + reschedule)
 *  2) Custom reschedule date
 *  3) Mark dormant (push to Dormant lifecycle with a stamped reason). */
function NoShowModal({ client, onClose }: any) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [reason, setReason] = useState('');
  const [customDate, setCustomDate] = useState('');

  function plusDays(d: string | null | undefined, n: number): string {
    const base = d ? new Date(d + 'T12:00:00') : new Date();
    base.setDate(base.getDate() + n);
    return base.toISOString().slice(0, 10);
  }
  const pushByWeek = plusDays(client.demoDate, 7);

  const pushDemo = useMutation({
    mutationFn: async (newDate: string) => {
      const note = reason ? `No-show · pushed to ${newDate}. ${reason}` : `No-show · pushed to ${newDate}.`;
      // Cancel the open demo row + record the no-show outcome on it
      await api.patch(`/clients/${client.id}`, {
        demoDate: newDate,
        demoNextSteps: note,
      });
      // Mark the active scheduled demo as Cancelled with "No-show" note, then trigger a fresh schedule
      // by leaving the lifecycle in DemoScheduled (the PATCH already updated the headline date).
      await api.post(`/clients/${client.id}/demo-invite`).catch(() => {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['my-calendar'] });
      showToast('Demo pushed · invite re-sent');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const dormant = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/stage`, {
      lifecycle: 'Dormant',
      dormantReason: reason || 'No-show — client did not attend the demo.',
      dormantCheckBackOn: plusDays(null, 14),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      showToast('Client moved to Dormant');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const anyPending = pushDemo.isPending || dormant.isPending;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`No-show · ${client.name}`}
        description="Client or trainer didn't show up. Pick the next step."
      >
        <div className="form-row">
          <Label>Reason / note (optional)</Label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. client called sick, trainer's mic broke" />
        </div>
        <div className="space-y-2">
          <div className="bg-bg-input rounded p-2.5">
            <div className="text-sm font-medium mb-1.5">Push the demo by 1 week</div>
            <div className="text-xs muted mb-2">New date: <strong>{pushByWeek}</strong> · same trainer + time · invite re-sent.</div>
            <Button size="sm" variant="primary" disabled={anyPending} onClick={() => pushDemo.mutate(pushByWeek)}>
              {pushDemo.isPending ? 'Pushing…' : 'Push +1 week'}
            </Button>
          </div>
          <div className="bg-bg-input rounded p-2.5">
            <div className="text-sm font-medium mb-1.5">Custom reschedule date</div>
            <div className="flex gap-2 items-end">
              <Input type="date" value={customDate} min={minFutureDate()} onChange={(e) => setCustomDate(e.target.value)} className="flex-1" />
              <Button size="sm" variant="primary" disabled={!customDate || anyPending} onClick={() => pushDemo.mutate(customDate)}>
                Push to selected date
              </Button>
            </div>
          </div>
          <div className="bg-bg-input rounded p-2.5 border border-brand-amber/40">
            <div className="text-sm font-medium mb-1.5">Mark dormant</div>
            <div className="text-xs muted mb-2">Client paused — auto-set 14-day check-back. Reason is saved on the dormant entry.</div>
            <Button size="sm" variant="amber" disabled={anyPending} onClick={() => dormant.mutate()}>
              {dormant.isPending ? 'Moving…' : 'Mark dormant (+14d check-back)'}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Roshni's context-aware close-out wizard.
 *
 *  Phase 1 (RP) — 3 steps: checklist call, engagement letter, payment WA → pick CP / C / DP
 *  CP checklist    — 2 items: no-pickup WA sent, next call set → pick C or DP
 *  Phase 2 (C)  — 4 steps: record payment, post confirmation, rename group, intro Mitali → pick win outcome
 *  Terminal        — DP / win outcomes show a result banner
 */
function RoshniJourneyCard({ client, onMove, onAction }: {
  client: any;
  onMove: (t: 'CP' | 'C' | 'DP' | 'Training-Paid' | 'JBT-Paid' | 'Training-EmployerLater' | 'JBT-EmployerLater') => void;
  onAction: (kind: 'checklist' | 'engagement' | 'paymentWa' | 'recordPayment' | 'postConfirmation' | 'groupRename' | 'mitaliIntro') => void;
}) {
  const ss: string = client.saleClosingSubStatus || 'RP';
  const user = useAuth((s) => s.user)!;
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const canOverride = user.role === 'founder' || user.role === 'manager';
  const since = client.saleClosingSubStatusAt ? new Date(client.saleClosingSubStatusAt) : null;
  const daysSince = since ? Math.floor((Date.now() - since.getTime()) / 86_400_000) : null;

  const checklistDone = !!client.paymentChecklistCompletedAt;
  const engagementSent = !!client.engagementLetterSentAt;
  const paymentWaSent = !!client.paymentWaSentAt;
  const paymentRecorded = !!client.freshPaymentReceived || (client.freshPaymentAmount || 0) > 0;
  const isWinSS = ss === 'JBT-EmployerLater' || ss === 'Training-EmployerLater';
  const paymentResolved = paymentRecorded || isWinSS;
  const confirmationPosted = !!client.paymentConfirmationPostedAt;
  const groupRenamed = !!client.whatsappGroupRenamedAt;
  const mitaliIntroDone = !!client.mitaliIntroSentAt;

  const markPaymentWa = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/mark-payment-wa-sent`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      showToast('Payment WhatsApp marked sent · step unlocked');
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  type Step = {
    n: number;
    title: string;
    desc: string;
    done: boolean;
    doneAt?: string | null;
    button: { label: string; onClick: () => void } | null;
    extra?: React.ReactNode;
  };

  // ── Terminal states — show result banner ──────────────────────────────────
  const isWinOutcomeSS = ss === 'JBT-Paid' || ss === 'Training-Paid' || ss === 'JBT-EmployerLater' || ss === 'Training-EmployerLater';

  const reopen = useMutation({
    mutationFn: (target: 'RP' | 'DemoScheduled' | 'InternalSearch') =>
      target === 'RP'
        ? api.post(`/clients/${client.id}/sub-status`, { subStatus: 'RP', reason: 'Reopened — client returned' })
        : api.patch(`/clients/${client.id}`, { lifecycle: target === 'InternalSearch' ? 'InternalSearch' : 'DemoScheduled', saleClosingSubStatus: null }),
    onSuccess: (_, target) => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      showToast(
        target === 'RP' ? 'Reopened → RP · back in your queue'
        : target === 'InternalSearch' ? 'Sent back to demo team (Internal Search)'
        : 'Moved to Demo Scheduled'
      );
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  if (ss === 'DP' || isWinOutcomeSS) {
    const isWin = isWinOutcomeSS;
    return (
      <div className="card mb-4" style={{ borderColor: isWin ? '#0F8A5F' : '#EF4444' }}>
        <div className="card-h" style={{ color: isWin ? '#0F8A5F' : '#EF4444' }}>
          <span>Close-out complete · {ss}</span>
        </div>
        <div className="muted text-sm">
          {daysSince !== null && `Marked ${daysSince}d ago. `}
          {ss === 'Training-Paid' && 'Direct client paid; Training engagement started.'}
          {ss === 'JBT-Paid' && 'Direct client paid; JBT engagement started.'}
          {ss === 'Training-EmployerLater' && `Employer "${client.employerName || '—'}" committed for ${client.employerCommitDate || 'TBD'}; Training engagement started.`}
          {ss === 'JBT-EmployerLater' && `Employer "${client.employerName || '—'}" committed for ${client.employerCommitDate || 'TBD'}; JBT engagement started.`}
          {ss === 'DP' && 'Dropped — WA group moved to DP. No further follow-up by Roshni.'}
        </div>
        {(client as any).hasEngagementLetterFile && (
          <a href={`${API_BASE}/api/clients/${client.id}/engagement-letter/file`} target="_blank" rel="noopener noreferrer"
            className="text-xs flex items-center gap-1 mt-2" style={{ color: 'var(--accent-gold)' }}>
            <FileText size={11} /> Download uploaded engagement letter
          </a>
        )}
        {ss === 'DP' && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(239,68,68,0.20)' }}>
            <div className="text-xs muted mb-2">Client returned? Reopen:</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={reopen.isPending} onClick={() => reopen.mutate('RP')}>
                → RP · back to closing queue
              </Button>
              <Button size="sm" variant="amber" disabled={reopen.isPending} onClick={() => reopen.mutate('InternalSearch')}>
                → New trainer · back to demo team
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Helper: step list renderer ────────────────────────────────────────────
  function StepList({ steps }: { steps: Step[] }) {
    const doneCount = steps.filter((s) => s.done).length;
    const firstUndoneIdx = steps.findIndex((s) => !s.done);
    return (
      <>
        {/* Progress bar */}
        <div className="flex gap-1.5 mb-3">
          {steps.map((s, i) => (
            <div key={s.n} className="flex-1 h-1.5 rounded-full transition-all"
              style={{
                background: s.done
                  ? 'linear-gradient(90deg, var(--status-green) 0%, #16A34A 100%)'
                  : i === firstUndoneIdx
                  ? 'linear-gradient(90deg, var(--status-amber) 0%, #D97706 100%)'
                  : 'var(--bg-input)',
                boxShadow: s.done ? '0 0 4px rgba(74,222,128,0.25)' : i === firstUndoneIdx ? '0 0 4px rgba(245,158,11,0.25)' : undefined,
              }}
              title={`Step ${s.n}: ${s.title}${s.done ? ' ✓' : ''}`}
            />
          ))}
        </div>
        <div className="text-[10px] muted mb-3">{doneCount} of {steps.length} steps done{daysSince !== null ? ` · ${ss} for ${daysSince}d` : ''}</div>
        <div className="space-y-1.5">
          {steps.map((s, i) => {
            const isCurrent = i === firstUndoneIdx;
            const isLocked = !s.done && i > firstUndoneIdx && !canOverride;
            const borderColor = s.done ? 'var(--status-green)' : isCurrent ? 'var(--status-amber)' : 'var(--brand-border)';
            return (
              <div key={s.n}
                className="rounded-xl border p-3 flex items-start gap-3 transition-all"
                style={{
                  borderColor,
                  opacity: isLocked ? 0.50 : 1,
                  background: isCurrent
                    ? 'linear-gradient(90deg, color-mix(in srgb, var(--status-amber) 6%, var(--bg-card)) 0%, var(--bg-card) 60%)'
                    : s.done
                    ? 'linear-gradient(90deg, color-mix(in srgb, var(--status-green) 4%, var(--bg-card)) 0%, var(--bg-card) 60%)'
                    : 'var(--bg-card)',
                  boxShadow: isCurrent ? '0 4px 16px rgba(245,158,11,0.10)' : s.done ? '0 1px 3px rgba(74,222,128,0.08)' : 'var(--shadow-sm)',
                }}
              >
                <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: s.done
                      ? 'linear-gradient(135deg, var(--status-green) 0%, #16A34A 100%)'
                      : isCurrent
                      ? 'linear-gradient(135deg, var(--status-amber) 0%, #D97706 100%)'
                      : 'var(--bg-input)',
                    color: s.done || isCurrent ? 'white' : 'var(--brand-textMuted)',
                    boxShadow: s.done ? '0 2px 6px rgba(74,222,128,0.30)' : isCurrent ? '0 2px 6px rgba(245,158,11,0.30)' : 'none',
                  }}
                >
                  {s.done ? '✓' : s.n}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {s.title}
                    {s.done && s.doneAt && <span className="muted text-xs ml-2">· {s.doneAt}</span>}
                    {isCurrent && <span className="ml-2 text-[10px] text-brand-amber font-bold">NEXT</span>}
                    {isLocked && <span className="ml-2 text-[10px] muted">🔒 locked</span>}
                  </div>
                  <div className="text-xs muted mt-0.5">{s.desc}</div>
                  {s.extra}
                </div>
                {s.button && (
                  <Button size="sm"
                    variant={isCurrent ? 'primary' : 'default'}
                    disabled={isLocked && !canOverride}
                    disabledReason={isLocked && !canOverride ? `Complete step ${firstUndoneIdx + 1} first.` : null}
                    onClick={s.button.onClick}
                  >
                    {s.button.label}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // ── Phase badge + title line ──────────────────────────────────────────────
  const phaseLabel = ss === 'CP'
    ? 'CP · Called, went silent'
    : ss === 'C'
    ? 'Phase 2 · Onboard & close'
    : 'Phase 1 · Call & close';
  const phaseColor = ss === 'CP' ? '#D97706' : ss === 'C' ? '#1A6CDF' : '#1A6CDF';

  // ── RP state — Phase 1 (3 steps) ─────────────────────────────────────────
  if (ss === 'RP' || !ss) {
    const phase1Steps: Step[] = [
      {
        n: 1,
        title: 'Walk the 10-point payment checklist on the call',
        desc: 'Open the checklist while on the call; tick each item as you discuss it.',
        done: checklistDone,
        doneAt: client.paymentChecklistCompletedAt,
        button: { label: checklistDone ? 'Re-open checklist' : 'Open checklist', onClick: () => onAction('checklist') },
      },
      {
        n: 2,
        title: 'Send the engagement letter (email + PDF)',
        desc: 'Branded email with terms + PDF attachment. CCs Mitali automatically.',
        done: engagementSent,
        doneAt: client.engagementLetterSentAt,
        button: { label: engagementSent ? 'Re-send engagement letter' : 'Send engagement letter', onClick: () => onAction('engagement') },
        extra: (client as any).hasEngagementLetterFile
          ? <a href={`${API_BASE}/api/clients/${client.id}/engagement-letter/file`} target="_blank" rel="noopener noreferrer"
              className="text-xs flex items-center gap-1 mt-1" style={{ color: 'var(--accent-gold)' }}>
              <FileText size={11} /> Download uploaded copy
            </a>
          : null,
      },
      {
        n: 3,
        title: 'Send the payment WhatsApp with bank details',
        desc: 'Paste the payment-WA template into the client\'s WhatsApp, then mark sent here.',
        done: paymentWaSent,
        doneAt: client.paymentWaSentAt,
        button: { label: paymentWaSent ? 'Re-mark sent' : 'Mark payment WA sent', onClick: () => markPaymentWa.mutate() },
      },
    ];
    const allPhase1Done = phase1Steps.every((s) => s.done);
    return (
      <div className="card mb-4">
        <div className="card-h mb-3">
          <span className="font-bold">Close-out wizard</span>
          <span className="px-2 py-0.5 rounded border text-xs font-semibold" style={{ borderColor: phaseColor, color: phaseColor }}>{phaseLabel}</span>
        </div>
        <StepList steps={phase1Steps} />
        {/* Next-step picker */}
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--brand-borderSoft)' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--brand-textSecondary)' }}>
            After the call, what happened?
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary"
              disabled={!allPhase1Done && !canOverride}
              disabledReason={!allPhase1Done && !canOverride ? 'Complete all 3 steps first.' : null}
              onClick={() => onMove('C')}
            >
              C · Letter sent, payment pending
            </Button>
            <Button size="sm" variant="amber" onClick={() => onMove('CP')}>
              CP · Called, went silent
            </Button>
            <Button size="sm" variant="danger" onClick={() => onMove('DP')}>
              DP · Dropped
            </Button>
          </div>
          {canOverride && !allPhase1Done && (
            <div className="text-[10px] muted mt-2">Founder/manager: override active — you can move regardless of step completion.</div>
          )}
        </div>
      </div>
    );
  }

  // ── CP state — CP checklist ───────────────────────────────────────────────
  if (ss === 'CP') {
    const cpSteps: Step[] = [
      {
        n: 1,
        title: 'Copy & send the no-pickup WhatsApp message',
        desc: 'Use the template below — paste into the client\'s chat to let them know you\'ll follow up.',
        done: paymentWaSent,
        doneAt: client.paymentWaSentAt,
        button: { label: paymentWaSent ? 'Re-mark sent' : 'Mark WA sent', onClick: () => markPaymentWa.mutate() },
      },
      {
        n: 2,
        title: 'Set the next follow-up date',
        desc: 'Revisit in 3 days. When you reach them, send the letter and move to C.',
        done: !!client.roshniNextCallOn,
        doneAt: client.roshniNextCallOn,
        button: null,
      },
    ];
    const allCpDone = cpSteps.every((s) => s.done);
    return (
      <div className="card mb-4">
        <div className="card-h mb-3">
          <span className="font-bold">Close-out wizard</span>
          <span className="px-2 py-0.5 rounded border text-xs font-semibold" style={{ borderColor: phaseColor, color: phaseColor }}>{phaseLabel}</span>
        </div>
        <div className="callout amber text-xs mb-3">
          Called — client went silent. Send the no-pickup WA, set a follow-up date, and try again in 3 days. Once you reach them and send the letter, move to C.
        </div>
        <StepList steps={cpSteps} />
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--brand-borderSoft)' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--brand-textSecondary)' }}>When you reach them:</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => onMove('C')}>
              C · Letter sent, payment pending
            </Button>
            <Button size="sm" variant="danger" onClick={() => onMove('DP')}>
              DP · Dropped
            </Button>
            <Button size="sm" variant="amber" disabled={reopen.isPending} onClick={() => reopen.mutate('InternalSearch')}>
              → New trainer · back to demo team
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── C state — Phase 2 (4 steps) ──────────────────────────────────────────
  const phase2Steps: Step[] = [
    {
      n: 4,
      title: 'Record payment OR mark Employer-later',
      desc: 'Record Fresh payment (direct-client) or capture employer commitment details at the win-outcome step.',
      done: paymentResolved,
      doneAt: paymentRecorded ? client.freshPaymentDate : null,
      button: paymentRecorded ? null : { label: 'Record payment', onClick: () => onAction('recordPayment') },
    },
    {
      n: 5,
      title: 'Post confirmation in MITS payment-confirmation group',
      desc: 'Auto-generates the "X closed at Y USD" message for the internal group.',
      done: confirmationPosted,
      doneAt: client.paymentConfirmationPostedAt,
      button: { label: confirmationPosted ? 'Re-post confirmation' : 'Open confirmation', onClick: () => onAction('postConfirmation') },
    },
    {
      n: 6,
      title: 'Rename client WhatsApp group → Training / JBT',
      desc: 'Auto-suggests "Training {client} {trainer} Z" or "JBT {client} {trainer} Z".',
      done: groupRenamed,
      doneAt: client.whatsappGroupRenamedAt,
      button: { label: groupRenamed ? 'Re-rename group' : 'Rename group', onClick: () => onAction('groupRename') },
    },
    {
      n: 7,
      title: 'Intro Mitali in the renamed group',
      desc: 'Triggers Mitali-handover task + paste the intro message in the group.',
      done: mitaliIntroDone,
      doneAt: client.mitaliIntroSentAt,
      button: { label: mitaliIntroDone ? 'Re-send Mitali intro' : 'Hand over to Mitali', onClick: () => onAction('mitaliIntro') },
    },
  ];
  const allPhase2Done = phase2Steps.every((s) => s.done);
  return (
    <div className="card mb-4">
      <div className="card-h mb-3">
        <span className="font-bold">Close-out wizard</span>
        <span className="px-2 py-0.5 rounded border text-xs font-semibold" style={{ borderColor: phaseColor, color: phaseColor }}>{phaseLabel}</span>
      </div>
      <div className="callout text-xs mb-3">
        Letter sent — follow up daily until they pay. Once payment is in, complete steps 4–7 and pick the win outcome (JBT or Training).
      </div>
      <StepList steps={phase2Steps} />
      {/* Win outcome picker */}
      <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--brand-borderSoft)' }}>
        <div className="flex items-center gap-2 mb-1">
          {allPhase2Done && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, var(--status-green) 0%, #16A34A 100%)', boxShadow: '0 0 10px rgba(74,222,128,0.40)' }}>✓</span>
          )}
          <div className="text-[13px] font-bold">
            {allPhase2Done ? 'All steps done — pick the win outcome' : 'Win outcome'}
          </div>
        </div>
        <div className="text-xs muted mb-3">
          {allPhase2Done ? 'Choose which path the client is taking.' : 'Complete steps 4–7 first, then pick the outcome.'}
          {' '}Training / JBT = engagement type; Paid = direct; Employer-later = employer invoiced.
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          {([
            { k: 'Training-Paid',          label: 'Training · Paid by client',       tone: '#0F8A5F' },
            { k: 'JBT-Paid',               label: 'JBT · Paid by client',            tone: '#0F8A5F' },
            { k: 'Training-EmployerLater', label: 'Training · Employer pays later',  tone: '#1A6CDF' },
            { k: 'JBT-EmployerLater',      label: 'JBT · Employer pays later',       tone: '#1A6CDF' },
          ] as const).map((o) => (
            <Button key={o.k} size="sm"
              disabled={!allPhase2Done && !canOverride}
              disabledReason={(!allPhase2Done && !canOverride) ? 'Complete all 4 steps first (or ask founder/manager to override).' : null}
              onClick={() => onMove(o.k)}
              style={{ borderColor: o.tone, color: allPhase2Done || canOverride ? o.tone : undefined }}
            >
              {o.label}
            </Button>
          ))}
        </div>
        {canOverride && !allPhase2Done && (
          <div className="text-[10px] muted mt-2">Founder/manager: override active — you can pick any outcome.</div>
        )}
      </div>
    </div>
  );
}

/** Roshni's state machine.
 *  RP is the implicit entry state (set automatically when Samita marks a positive
 *  demo). From RP she moves the client to ONE of CP / C / JBT / Training. Each
 *  target has its own validation gate enforced by the backend. */
function SubStatusModal({ client, onClose, initialTarget }: { client: any; onClose: () => void; initialTarget?: 'CP' | 'C' | 'DP' | 'Training-Paid' | 'JBT-Paid' | 'Training-EmployerLater' | 'JBT-EmployerLater' }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const current: string = client.saleClosingSubStatus || 'RP';

  type Target = 'CP' | 'C' | 'DP' | 'Training-Paid' | 'JBT-Paid' | 'Training-EmployerLater' | 'JBT-EmployerLater';
  const [target, setTarget] = useState<Target | null>(initialTarget || null);
  const [nextCallOn, setNextCallOn] = useState<string>(client.roshniNextCallOn || '');
  const [employerName, setEmployerName] = useState(client.employerName || '');
  const [employerCommitDate, setEmployerCommitDate] = useState(client.employerCommitDate || '');

  const m = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/sub-status`, {
      subStatus: target,
      nextCallOn: nextCallOn || null,
      employerName: employerName || undefined,
      employerCommitDate: employerCommitDate || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['roshni-follow-ups'] });
      const isWin = !!target && target !== 'CP' && target !== 'C' && target !== 'DP';
      showToast(isWin ? `🎉 ${target} — closed!` : `Moved to ${target}`);
      if (isWin) celebrate();
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const paymentDone = !!client.freshPaymentReceived || (client.freshPaymentAmount || 0) > 0;
  const checklistDone = !!client.paymentChecklistCompletedAt;
  const isEmployerLaterTarget = target === 'Training-EmployerLater' || target === 'JBT-EmployerLater';
  const isPaidTarget = target === 'Training-Paid' || target === 'JBT-Paid';

  // Context-aware destinations based on current sub-status
  type DestDef = { key: Target; title: string; desc: string; tone: 'amber' | 'danger' | 'success' | 'grey' };
  const destinations: DestDef[] = current === 'C'
    ? [
        { key: 'Training-Paid',         title: 'Training · Client paid',        desc: 'Direct-client payment received. Training engagement starts.',         tone: 'success' },
        { key: 'JBT-Paid',              title: 'JBT · Client paid',             desc: 'Direct-client payment received. JBT engagement starts.',              tone: 'success' },
        { key: 'Training-EmployerLater',title: 'Training · Employer pays later', desc: 'Employer committed. Client starts Training now, invoice follows.',     tone: 'success' },
        { key: 'JBT-EmployerLater',     title: 'JBT · Employer pays later',     desc: 'Employer committed. Client starts JBT now, invoice follows.',          tone: 'success' },
        { key: 'DP',                    title: 'DP · Dropped',                   desc: '2–3 follow-ups, no payment, no response. Move to DP.',                tone: 'danger' },
      ]
    : current === 'CP'
    ? [
        { key: 'C',                      title: 'C · Letter sent, payment pending',    desc: 'Letter shared — follow up daily until they pay. Drops out of RP queue.',    tone: 'amber' },
        { key: 'JBT-EmployerLater',      title: 'JBT · Employer pays later',           desc: 'Employer committed to pay. Client starts JBT now, no direct payment.',       tone: 'success' },
        { key: 'Training-EmployerLater', title: 'Training · Employer pays later',      desc: 'Employer committed to pay. Client starts Training now, no direct payment.',  tone: 'success' },
        { key: 'DP',                     title: 'DP · Dropped',                        desc: 'No response after follow-up. Move WA group to DP. No further follow-up.',    tone: 'danger' },
      ]
    : /* RP or null */ [
        { key: 'CP',                     title: 'CP · Called, went silent',            desc: 'Called but no pickup. Send no-pickup WA, revisit in 3 days.',              tone: 'amber' },
        { key: 'C',                      title: 'C · Letter sent, payment pending',    desc: 'Letter shared — follow up daily until they pay. Drops out of RP queue.',   tone: 'amber' },
        { key: 'JBT-EmployerLater',      title: 'JBT · Employer pays later',           desc: 'Employer committed to pay. Client starts JBT now, no direct payment.',      tone: 'success' },
        { key: 'Training-EmployerLater', title: 'Training · Employer pays later',      desc: 'Employer committed to pay. Client starts Training now, no direct payment.', tone: 'success' },
        { key: 'DP',                     title: 'DP · Dropped',                        desc: 'No answer after multiple attempts. Move WA group to DP.',                  tone: 'danger' },
      ];

  // Default next call dates
  const defaultNextCall = (t: Target | null) => {
    if (!t) return '';
    const d = new Date();
    if (t === 'CP') d.setDate(d.getDate() + 3);
    else if (t === 'C') d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`${client.name} · ${current} → next step`}
        description={
          current === 'C' ? 'Letter sent, payment pending — pick the win outcome once paid (JBT or Training).'
          : current === 'CP' ? 'Client went silent — move to C once letter is shared, or DP if no response.'
          : 'Called the client — what happened?'
        }
        className="max-w-xl"
      >
        <div className="space-y-2">
          {destinations.map((d) => {
            const selected = target === d.key;
            const borderColor = d.tone === 'danger' ? '#ef4444' : d.tone === 'success' ? '#22c55e' : '#f59e0b';
            return (
              <button key={d.key} type="button"
                onClick={() => { setTarget(d.key); setNextCallOn(defaultNextCall(d.key)); }}
                className="w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-all"
                style={{
                  borderColor: selected ? borderColor : 'var(--brand-border)',
                  background: selected ? `color-mix(in srgb, ${borderColor} 8%, var(--bg-input))` : 'var(--bg-card)',
                }}
              >
                <div className="mt-1 w-3 h-3 rounded-full flex-shrink-0 border-2 transition-all"
                  style={{ borderColor, background: selected ? borderColor : 'transparent' }} />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{d.title}</div>
                  <div className="text-xs muted mt-0.5">{d.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Next call date for CP/C */}
        {(target === 'CP' || target === 'C') && (
          <div className="form-row mt-3">
            <Label>Next follow-up date</Label>
            <Input type="date" value={nextCallOn} min={minFutureDate()} onChange={(e) => setNextCallOn(e.target.value)} />
            <div className="text-[10px] muted mt-1">
              {target === 'CP' ? 'Default: 3 days from today.' : 'Default: tomorrow.'}
            </div>
          </div>
        )}

        {target === 'CP' && (
          <NoPickupTemplate clientId={client.id} nextCallOn={nextCallOn} />
        )}

        {isEmployerLaterTarget && (
          <>
            <div className="form-row mt-3">
              <Label>Employer name *</Label>
              <Input value={employerName} onChange={(e) => setEmployerName(e.target.value)} placeholder="e.g. Acme Corp · HR contact: Priya" />
            </div>
            <div className="form-row mt-2">
              <Label>Payment commitment date *</Label>
              <Input type="date" value={employerCommitDate} min={minFutureDate()} onChange={(e) => setEmployerCommitDate(e.target.value)} />
              <div className="text-[10px] muted mt-1">When will the employer settle the invoice?</div>
            </div>
          </>
        )}

        {isPaidTarget && (
          <div className="callout mt-3 text-xs">
            <strong>After this:</strong> rename the WA group → Training/JBT, then intro Mitali.
            {!checklistDone && <div className="text-brand-amber mt-1">⚠ Payment checklist not marked complete yet.</div>}
          </div>
        )}

        {isPaidTarget && !paymentDone && (
          <div className="callout amber mt-2 text-xs">⚠ No Fresh Payment recorded yet — record it first, then come back here.</div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={target === 'DP' ? 'danger' : target === 'CP' ? 'amber' : 'primary'}
            disabled={!target || m.isPending || (isPaidTarget && !paymentDone) || (isEmployerLaterTarget && (!employerName?.trim() || !employerCommitDate))}
            onClick={() => m.mutate()}
          >
            {m.isPending ? 'Saving…' : target ? `Move to ${target}` : 'Pick an option'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Renders the auto-generated "couldn't reach you" WhatsApp message for CP clients.
 *  Shows the suggested text + a "Send via WhatsApp" deep link Roshni can click. */
function NoPickupTemplate({ clientId, nextCallOn }: { clientId: string; nextCallOn: string }) {
  const { data } = useQuery<{ text: string; url: string | null }>({
    queryKey: ['no-pickup-template', clientId, nextCallOn],
    queryFn: () => api.get(`/clients/${clientId}/no-pickup-template`, {
      params: { nextCallOn: nextCallOn || undefined },
    }).then((r) => r.data),
  });
  if (!data) return <div className="mt-3 muted text-xs">Loading no-pickup message…</div>;
  return (
    <div className="mt-3 p-2.5 bg-bg-input rounded border border-brand-border">
      <div className="text-xs font-medium mb-1.5 flex items-center justify-between">
        <span>Suggested WhatsApp message</span>
        <Button
          size="sm"
          onClick={() => { navigator.clipboard?.writeText(data.text); }}
          title="Copy to clipboard"
        >
          Copy
        </Button>
      </div>
      <Textarea rows={6} value={data.text} readOnly className="text-xs" />
      {data.url && (
        <a href={data.url} target="_blank" rel="noreferrer">
          <Button size="sm" variant="default" className="mt-2"
            style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}>
            <MessageCircle size={11}/> Send via WhatsApp
          </Button>
        </a>
      )}
    </div>
  );
}

/** Payment-terms checklist Roshni opens on the close call. 10 default items
 *  (drawn from the engagement letter + SOP); each item has a checkbox + a free-text
 *  note. Auto-marks the checklist complete when all 10 are ticked. */
function PaymentChecklistModal({ client, onClose }: any) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  type Item = { key: string; label: string; checked: boolean; note?: string; checkedAt?: string };
  const { data, isLoading } = useQuery<{ items: Item[]; completedAt: string | null }>({
    queryKey: ['payment-checklist', client.id],
    queryFn: () => api.get(`/clients/${client.id}/payment-checklist`).then((r) => r.data),
  });
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => { if (data?.items) setItems(data.items); }, [data]);

  const save = useMutation({
    mutationFn: (completed: boolean) =>
      api.patch(`/clients/${client.id}/payment-checklist`, { items, completed }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['payment-checklist', client.id] });
      showToast('Checklist saved');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  function toggle(idx: number) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, checked: !it.checked } : it)));
  }
  function patchNote(idx: number, note: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, note } : it)));
  }

  const checkedCount = items.filter((it) => it.checked).length;
  const allDone = items.length > 0 && checkedCount === items.length;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Close-call checklist · ${client.name}`}
        description="Tick each item as you walk through it on the call. All 10 ticked = checklist complete. Notes are optional but useful for tracking what the client said."
        className="max-w-2xl"
      >
        <div className="muted text-xs mb-2">{checkedCount}/{items.length} ticked{data?.completedAt ? ` · last completed ${data.completedAt}` : ''}</div>
        {isLoading && <div className="muted text-sm">Loading checklist…</div>}
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
          {items.map((it, idx) => (
            <div
              key={it.key}
              className={`rounded border p-2 ${it.checked ? 'border-brand-green bg-brand-green/5' : 'border-brand-border'}`}
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={it.checked}
                  onChange={() => toggle(idx)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm">{it.label}</div>
                  {it.checked && (
                    <Input
                      placeholder="Note (optional) — what did the client say?"
                      value={it.note || ''}
                      onChange={(e) => patchNote(idx, e.target.value)}
                      className="mt-1 !text-xs"
                    />
                  )}
                </div>
              </label>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={allDone ? 'success' : 'primary'}
            disabled={save.isPending}
            onClick={() => save.mutate(allDone)}
          >
            {save.isPending ? 'Saving…' : allDone ? 'Save & mark complete' : 'Save progress'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Roshni payment-confirmation modal. Upload screenshot from client, generate the
 *  coordination message (Support vs Training variant), then post to the MITS
 *  payment-confirmation WhatsApp group via deep-link. */
function PaymentConfirmationModal({ client, onClose }: any) {
  const PAYMENT_GROUP_LINK = 'https://chat.whatsapp.com/EYcbMxrIYtZ4lExFkX3SAO';
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [screenshotUrl, setScreenshotUrl] = useState<string>(client.paymentScreenshotUrl || '');
  const [uploading, setUploading] = useState(false);
  const [generatedMsg, setGeneratedMsg] = useState<string>('');
  const [posted, setPosted] = useState<boolean>(!!client.paymentConfirmationPostedAt);

  async function pickFile(file: File) {
    setUploading(true);
    try {
      const r = await uploadFile(file);
      setScreenshotUrl(r.url);
      showToast('Screenshot uploaded');
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }

  const recordScreenshot = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/payment-confirmation`, { screenshotUrl }),
    onSuccess: (r: any) => {
      setGeneratedMsg(r.data?.groupMessage || '');
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      showToast('Confirmation recorded · message generated below');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const markPosted = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/payment-confirmation`, { screenshotUrl, postedToGroup: true }),
    onSuccess: () => {
      setPosted(true);
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      showToast('Marked as posted to group');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Payment confirmation · ${client.name}`}
        description="Upload the client's payment screenshot, then post the auto-generated coordination message in the MITS payment-confirmation WhatsApp group."
        className="max-w-2xl"
      >
        <div className="form-row">
          <Label>Payment screenshot</Label>
          {screenshotUrl ? (
            <div className="bg-bg-input rounded p-2 flex items-center gap-2">
              <a href={fileUrl(screenshotUrl)} target="_blank" rel="noreferrer" className="text-brand-blue underline text-sm flex-1">View screenshot →</a>
              <button onClick={() => setScreenshotUrl('')} className="text-xs muted hover:text-brand-red"><X size={12}/> Replace</button>
            </div>
          ) : (
            <label className="block">
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
              />
              <Button size="sm" disabled={uploading} onClick={(e) => { e.preventDefault(); (e.currentTarget.previousElementSibling as HTMLInputElement)?.click(); }}>
                {uploading ? 'Uploading…' : 'Pick screenshot file'}
              </Button>
            </label>
          )}
        </div>

        {!generatedMsg && (
          <Button variant="primary" disabled={!screenshotUrl || recordScreenshot.isPending} onClick={() => recordScreenshot.mutate()}>
            {recordScreenshot.isPending ? 'Generating…' : 'Record confirmation + generate group message'}
          </Button>
        )}

        {generatedMsg && (
          <div className="form-row mt-3">
            <Label>Group coordination message</Label>
            <Textarea rows={4} value={generatedMsg} onChange={(e) => setGeneratedMsg(e.target.value)} className="mono text-xs" />
            <div className="flex gap-2 mt-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => { navigator.clipboard?.writeText(generatedMsg); showToast('Message copied to clipboard'); }}
              >
                Copy message
              </Button>
              <a href={PAYMENT_GROUP_LINK} target="_blank" rel="noreferrer">
                <Button size="sm" variant="default" style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}>
                  <MessageCircle size={12}/> Open payment-confirmation group
                </Button>
              </a>
              {!posted && (
                <Button size="sm" variant="primary" disabled={markPosted.isPending} onClick={() => markPosted.mutate()}>
                  {markPosted.isPending ? 'Marking…' : 'Mark as posted'}
                </Button>
              )}
            </div>
            {posted && <div className="text-xs text-brand-green mt-2">✓ Marked as posted to group</div>}
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>{generatedMsg ? 'Done' : 'Cancel'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Group-rename modal — Roshni's handover step. Suggests "Training {client} {trainer} Z"
 *  or "JBT {...} Z" + shows the Mitali intro message to share in the renamed group. */
function GroupRenameModal({ client, onClose }: any) {
  const MITALI_INTRO = `I am pleased to introduce Miss Mitali as your primary contact for managing any issues or escalations going forward.

Ms. Mitali serves as our dedicated Client Service Manager and is available to assist you with inquiries or support related to our services. Please feel free to reach out to her directly for any assistance you may require.

You can contact Ms. Mitali at +91 9779530773.

Thank you,`;

  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const isTraining = client.engagementType === 'Training' || client.engagementType === 'TaskBased';
  // "Training Dinesh Rahul Z" / "JBT Dinesh Rahul Z" — AM initial gets appended by Mitali later.
  const clientFirst = (client.name || '').split(' ')[0] || client.name || '';
  const trainerFirst = ((client.primaryTrainer?.name as string) || '').split(' ')[0] || '';
  const suggested = `${isTraining ? 'Training' : 'JBT'} ${clientFirst}${trainerFirst ? ' ' + trainerFirst : ''} Z`;
  const [newName, setNewName] = useState<string>(suggested);

  const rename = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/group-rename`, { newName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      showToast(`Group renamed to "${newName}"`);
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const waLinkToGroup = client.whatsappGroupLink || '';

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Rename group · ${client.name}`}
        description="Renames the WhatsApp group in our system + gives you the Mitali intro message to share in the group."
        className="max-w-2xl"
      >
        <div className="form-row">
          <Label>Current group name</Label>
          <Input value={client.whatsappGroupName || '—'} readOnly />
        </div>
        <div className="form-row">
          <Label>New name <span className="muted normal-case ml-1">(Mitali/Bhavneet will append the AM initial later)</span></Label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div className="text-[10px] muted mt-1">
            Convention: <code>{isTraining ? 'Training' : 'JBT'}</code> &lt;Client first&gt; &lt;Trainer first&gt; Z&lt;AM initial: M=Muskan, K=Kashish&gt;
          </div>
        </div>

        <Button variant="primary" disabled={!newName.trim() || rename.isPending} onClick={() => rename.mutate()}>
          {rename.isPending ? 'Renaming…' : 'Save new group name'}
        </Button>

        <div className="form-row mt-4">
          <Label>Mitali introduction message <span className="muted normal-case ml-1">(share in the renamed group)</span></Label>
          <Textarea rows={9} value={MITALI_INTRO} readOnly className="text-xs" />
          <div className="flex gap-2 mt-2 flex-wrap">
            <Button size="sm" onClick={() => { navigator.clipboard?.writeText(MITALI_INTRO); showToast('Mitali intro copied'); }}>
              Copy intro message
            </Button>
            {waLinkToGroup && (
              <a href={waLinkToGroup} target="_blank" rel="noreferrer">
                <Button size="sm" variant="default" style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}>
                  <MessageCircle size={12}/> Open client group
                </Button>
              </a>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendSkillMatrixModal({ client, onClose }: any) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const toEmail = client.email || (client.intakeData as any)?.client_email || '';
  const hasPhone = !!client.phoneDigits;
  const groupLink: string | null = client.whatsappGroupLink || null;
  const groupName: string = client.whatsappGroupName || 'WhatsApp group';
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [downloadingImg, setDownloadingImg] = useState(false);
  const [introNote, setIntroNote] = useState(
    `Dear ${client.name || 'Client'}, please find below the proposed trainer profiles for your review.`,
  );
  // Shared default demo date / time — applied to any trainer who doesn't have a
  // per-trainer slot override below. Persisted on the client on send/mark.
  const [demoDate, setDemoDate] = useState<string>(client.demoDate || '');
  const [demoTimeIst, setDemoTimeIst] = useState<string>(client.demoTimeIst || '');

  // Anjali's two asks (P0 for her):
  //  (1) Pick which trainers to include in the matrix before sending (checkbox per trainer)
  //  (2) Per-trainer date + time slots so each trainer's actual availability shows in the matrix
  // We initialize from the preview's first response, then let her edit.
  type TrainerSlot = { trainerId: string; name: string; selected: boolean; date: string; timeIst: string };
  const [trainerSlots, setTrainerSlots] = useState<TrainerSlot[]>([]);
  const [slotsInitialized, setSlotsInitialized] = useState(false);

  // Preview re-fetches whenever selection or per-trainer slots change so the
  // iframe HTML stays in sync with what would actually go out.
  const selectedIds = trainerSlots.filter((s) => s.selected && s.trainerId).map((s) => s.trainerId);
  const slotsParam = trainerSlots
    .filter((s) => s.selected && s.trainerId && (s.date || s.timeIst))
    .map((s) => ({ trainerId: s.trainerId, date: s.date || undefined, timeIst: s.timeIst || undefined }));

  const { data: preview, isLoading } = useQuery({
    queryKey: ['skill-matrix-preview', client.id, demoDate, demoTimeIst, selectedIds.join(','), JSON.stringify(slotsParam)],
    queryFn: () => api.get(`/sourcing/clients/${client.id}/skill-matrix`, {
      params: {
        demoDate: demoDate || undefined,
        demoTimeIst: demoTimeIst || undefined,
        ...(selectedIds.length > 0 ? { selectedTrainerIds: selectedIds.join(',') } : {}),
        ...(slotsParam.length > 0 ? { slots: JSON.stringify(slotsParam) } : {}),
      },
    }).then((r) => r.data),
  });

  // Seed trainerSlots from the FIRST preview response (which has all available
  // trainers). Subsequent re-fetches return only the filtered subset so we
  // can't re-seed from there — we'd lose the unticked trainers.
  useEffect(() => {
    if (!slotsInitialized && preview?.candidates?.length) {
      setTrainerSlots(preview.candidates.map((c: any) => ({
        trainerId: c.trainerId || '',
        name: c.name,
        selected: true,
        date: demoDate,
        timeIst: demoTimeIst,
      })));
      setSlotsInitialized(true);
    }
  }, [preview, slotsInitialized, demoDate, demoTimeIst]);

  const sendPayload = {
    introNote,
    demoDate,
    demoTimeIst,
    selectedTrainerIds: selectedIds.length > 0 ? selectedIds : undefined,
    slots: slotsParam.length > 0 ? slotsParam : undefined,
  };

  const sendEmailOnly = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/send-skill-matrix`, sendPayload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['messages'] });
      showToast('Email sent · matrix marked as shared');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Email send failed', 'error'),
  });

  const sendWAOnly = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/send-skill-matrix-whatsapp`, sendPayload),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['messages'] });
      if (r.data?.url) window.open(r.data.url, '_blank', 'noopener');
      showToast('WhatsApp opened · matrix marked as shared');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'WhatsApp build failed', 'error'),
  });

  const markSent = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/mark-skill-matrix-sent`, { demoDate, demoTimeIst }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      showToast('Marked as sent — Schedule demo unlocked');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Mark failed', 'error'),
  });

  const anyPending = sendEmailOnly.isPending || sendWAOnly.isPending || markSent.isPending;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Send skill matrix · ${client.name}`}
        description='Compulsory step before scheduling demo. Sends the side-by-side trainer profile matrix to the client.'
        className="max-w-3xl"
      >
        {!toEmail && !hasPhone && (
          <div className="callout amber mb-2">No email or phone on file. Add one to send via email/WhatsApp, or use "Mark as sent" if you shared it manually.</div>
        )}
        {!toEmail && hasPhone && (
          <div className="callout amber mb-2">No email on file — Email send is disabled. WhatsApp + Mark-as-sent still work.</div>
        )}
        {toEmail && !hasPhone && (
          <div className="callout amber mb-2">No phone on file — WhatsApp send is disabled. Email + Mark-as-sent still work.</div>
        )}

        <div className="grid md:grid-cols-3 gap-2 mb-2">
          <div className="form-row">
            <Label>Email (to)</Label>
            <Input value={toEmail || '—'} readOnly />
          </div>
          <div className="form-row">
            <Label>Demo date</Label>
            <Input type="date" value={demoDate} min={minFutureDate()} onChange={(e) => setDemoDate(e.target.value)} />
          </div>
          <div className="form-row">
            <Label>Demo time (IST)</Label>
            <Time12h value={demoTimeIst} onChange={setDemoTimeIst} quickSet ariaLabel="Shared demo time" />
          </div>
        </div>

        {trainerSlots.length > 1 && (
          <div className="form-row">
            <Label>Trainers to include in the matrix</Label>
            <div className="text-[10px] muted mb-1.5">
              Tick the trainers to share with the client. Each can have its own demo date/time — leave blank to use the shared default above.
            </div>
            <div className="space-y-1.5">
              {trainerSlots.map((s, i) => (
                <div
                  key={`${s.trainerId}-${i}`}
                  className={`rounded border p-2 ${s.selected ? 'border-brand-blue bg-bg-input' : 'border-brand-border opacity-60'}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-[150px]">
                      <input
                        type="checkbox"
                        checked={s.selected}
                        onChange={(e) => setTrainerSlots((prev) => prev.map((p, idx) => idx === i ? { ...p, selected: e.target.checked } : p))}
                      />
                      <span className="text-sm font-medium">{s.name}</span>
                    </label>
                    {s.selected && (
                      <>
                        <Input
                          type="date"
                          value={s.date}
                          min={minFutureDate()}
                          onChange={(e) => setTrainerSlots((prev) => prev.map((p, idx) => idx === i ? { ...p, date: e.target.value } : p))}
                          className="!w-auto !text-xs"
                          title={`Demo date for ${s.name}`}
                        />
                        <Time12h
                          value={s.timeIst}
                          onChange={(v) => setTrainerSlots((prev) => prev.map((p, idx) => idx === i ? { ...p, timeIst: v } : p))}
                          ariaLabel={`Demo time IST for ${s.name}`}
                        />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[10px] muted mt-1">
              {selectedIds.length} of {trainerSlots.length} ticked. Preview below shows only the ticked trainers.
            </div>
          </div>
        )}

        <div className="form-row">
          <Label>Intro note (editable)</Label>
          <Textarea rows={2} value={introNote} onChange={(e) => setIntroNote(e.target.value)} />
        </div>

        <div className="form-row">
          <Label>Preview ({preview?.candidates?.length || 0} candidates)</Label>
          <div className="bg-white rounded p-2 max-h-96 overflow-auto border border-brand-border">
            {isLoading && <div className="muted text-sm p-3">Loading preview…</div>}
            {preview?.html && (
              // Rendered as a div (not iframe) so html2canvas can capture it for the
              // "Download as image" button. preview.html is server-built from
              // trusted inputs (DEFAULT_SOFT_SKILLS + escaped trainer fields).
              <div
                ref={previewRef}
                style={{ background: 'white', color: '#1A1B1E' }}
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            )}
            {preview && preview.candidates?.length === 0 && (
              <div className="muted text-sm p-3">
                No trainer profile available to render. Pick a trainer (Internal Search) or have Aman/Kanchan propose one.
                You can still click <strong>Mark as sent</strong> if you shared the matrix manually.
              </div>
            )}
          </div>
          {/* WhatsApp send paths — Anjali's ask: matrix as image, sent to group */}
          {(preview?.candidates?.length || 0) > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              <Button
                size="sm"
                disabled={downloadingImg}
                onClick={async () => {
                  if (!previewRef.current || !preview?.html) { showToast('Preview not ready', 'error'); return; }
                  setDownloadingImg(true);
                  // Anjali's bug: download was clipping the matrix because the on-screen
                  // preview lives inside a max-h-96 + overflow-auto + max-w-3xl modal,
                  // and html2canvas captures whatever clip box the browser hands it.
                  // Fix: clone the matrix HTML into an OFF-SCREEN, full-width, no-clip
                  // container, snapshot THAT, then remove. This way the full table
                  // (incl. horizontal scroll content) makes it into the PNG.
                  const offscreen = document.createElement('div');
                  offscreen.style.cssText = [
                    'position:fixed',
                    'left:-10000px',
                    'top:0',
                    'width:1200px',          // wide enough to fit the full matrix table
                    'background:#ffffff',
                    'color:#1A1B1E',
                    'padding:0',
                    'margin:0',
                    'z-index:-1',
                  ].join(';');
                  offscreen.innerHTML = preview.html;
                  document.body.appendChild(offscreen);
                  try {
                    // Wait one frame so the browser lays out the cloned DOM.
                    await new Promise((r) => requestAnimationFrame(() => r(null)));
                    const html2canvas = (await import('html2canvas')).default;
                    const canvas = await html2canvas(offscreen, {
                      backgroundColor: '#ffffff',
                      scale: 2, // retina quality for WhatsApp share
                      logging: false,
                      // Explicit dims = scrollWidth/Height of the cloned element so the
                      // whole table is captured, not just the modal-clipped viewport.
                      width: offscreen.scrollWidth,
                      height: offscreen.scrollHeight,
                      windowWidth: offscreen.scrollWidth,
                      windowHeight: offscreen.scrollHeight,
                    });
                    const dataUrl = canvas.toDataURL('image/png');
                    const a = document.createElement('a');
                    const safe = (client.name || 'client').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40);
                    a.download = `MITS_Skill_Matrix_${safe}.png`;
                    a.href = dataUrl;
                    a.click();
                    showToast('Image downloaded — attach it in WhatsApp');
                  } catch (e: any) {
                    showToast(e?.message || 'Image build failed', 'error');
                  } finally {
                    if (offscreen.parentNode) offscreen.parentNode.removeChild(offscreen);
                    setDownloadingImg(false);
                  }
                }}
                title="Render the FULL matrix as a PNG (off-screen capture, no clipping). Download then attach in WhatsApp."
              >
                <Download size={12}/> {downloadingImg ? 'Building image…' : 'Download as image'}
              </Button>
              {groupLink && (
                <a href={groupLink} target="_blank" rel="noreferrer">
                  <Button
                    size="sm"
                    style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}
                    title={`Open ${groupName} in WhatsApp — paste the matrix image you just downloaded`}
                  >
                    <Users size={12}/> Open group ({groupName})
                  </Button>
                </a>
              )}
              <div className="text-[10px] muted self-center">
                Workflow: <strong>Download image</strong> → <strong>Open group</strong> → attach in WhatsApp → send.
                {!groupLink && ' Add a WhatsApp group link on this client (Edit contact) to enable group send.'}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            disabled={anyPending}
            onClick={() => markSent.mutate()}
            title='Already shared outside the portal (or skipping the matrix step)? Mark as sent to unlock Schedule demo.'
          >
            {markSent.isPending ? 'Marking…' : 'Mark as sent'}
          </Button>
          <Button
            variant="default"
            style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}
            disabled={!hasPhone || anyPending || !preview?.candidates?.length}
            onClick={() => sendWAOnly.mutate()}
            title={hasPhone ? 'Open WhatsApp text-only summary on personal number (use Download image + Open group above for image to group)' : 'No phone on file'}
          >
            <MessageCircle size={12}/>{' '}
            {sendWAOnly.isPending ? 'Opening…' : 'Send WhatsApp (text)'}
          </Button>
          <Button
            variant="primary"
            disabled={!toEmail || anyPending || !preview?.candidates?.length}
            onClick={() => sendEmailOnly.mutate()}
            title={toEmail ? 'Send the matrix as a branded email + PDF attachment' : 'No email on file'}
          >
            <Mail size={12}/>{' '}
            {sendEmailOnly.isPending ? 'Sending…' : 'Send Email'}
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
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['client', client.id] });
    qc.invalidateQueries({ queryKey: ['messages'] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
  };

  // Already sent outside portal
  const markSent = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/mark-engagement-letter-sent`),
    onSuccess: () => {
      invalidate();
      showToast('Marked as sent — Mitali handover task created');
      celebrate();
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  // Send via email only
  const sendEmail = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/engagement-letter`, { channel: 'email' }),
    onSuccess: () => {
      invalidate();
      showToast('Engagement letter sent via email');
      celebrate();
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed to send email', 'error'),
  });

  // Send via WhatsApp only
  const sendWa = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/engagement-letter`, { channel: 'whatsapp' }),
    onSuccess: (r: any) => {
      invalidate();
      if (r.data?.url) window.open(r.data.url, '_blank', 'noopener');
      showToast('WhatsApp link opened — mark as sent once delivered');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const busy = markSent.isPending || sendEmail.isPending || sendWa.isPending;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Engagement letter · ${client.name}`}
        description="Choose how the engagement letter was or will be sent."
        className="max-w-lg"
      >
        <div className="space-y-3">

          {/* Option 1 — Already sent / upload copy */}
          <div className="rounded-lg border p-3"
            style={{ borderColor: 'var(--brand-borderSoft)', background: 'var(--bg-input)' }}>
            <div className="flex items-start gap-3">
              <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--status-green)' }} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">Already sent / upload copy</div>
                <div className="text-xs muted mt-0.5">Sent it yourself outside the portal? Mark it done. Optionally attach the signed PDF for records.</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs px-3 py-1.5 rounded-lg"
                style={{ border: '1px solid var(--brand-border)', color: 'var(--brand-textSecondary)', background: 'var(--bg-page)' }}>
                <FileText size={12} />
                {uploadFile ? uploadFile.name : 'Attach PDF (optional)'}
                <input type="file" accept=".pdf,application/pdf" className="hidden"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
              </label>
              {uploadFile && (
                <button className="text-xs muted" onClick={() => setUploadFile(null)}>✕ remove</button>
              )}
              <Button size="sm" disabled={busy || uploading} className="ml-auto"
                onClick={async () => {
                  setUploading(true);
                  try {
                    if (uploadFile) {
                      const fd = new FormData();
                      fd.append('file', uploadFile);
                      await api.post(`/clients/${client.id}/engagement-letter/upload`, fd);
                    } else {
                      await api.post(`/clients/${client.id}/mark-engagement-letter-sent`);
                    }
                    invalidate();
                    showToast('Marked as sent — Mitali handover task created');
                    celebrate();
                    onClose();
                  } catch (e: any) {
                    showToast(e.response?.data?.error || 'Failed', 'error');
                  } finally { setUploading(false); }
                }}>
                {uploading ? 'Saving…' : uploadFile ? 'Upload & mark sent' : 'Mark as sent'}
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px" style={{ background: 'var(--brand-border)' }} />
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-textMuted)' }}>
              or send system-generated letter
            </span>
            <div className="flex-1 h-px" style={{ background: 'var(--brand-border)' }} />
          </div>

          {/* Option 2 — Send via Email */}
          <div className="rounded-lg border p-3 flex items-start gap-3"
            style={{
              borderColor: !toEmail ? 'var(--brand-border)' : 'var(--brand-borderSoft)',
              background: 'var(--bg-input)',
              opacity: !toEmail ? 0.5 : 1,
            }}>
            <Mail size={16} className="mt-0.5 flex-shrink-0" style={{ color: !toEmail ? 'var(--brand-textMuted)' : 'var(--accent-blue)' }} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Send via Email</div>
              <div className="text-xs muted mt-0.5">
                {toEmail
                  ? <>Sends PDF to <strong>{toEmail}</strong> from your Gmail account.</>
                  : <>No email address on file — add it on the client page first.</>}
              </div>
            </div>
            <Button size="sm" variant="primary" disabled={busy || !toEmail} onClick={() => sendEmail.mutate()}
              style={{ flexShrink: 0 }}>
              {sendEmail.isPending ? 'Sending…' : 'Send email'}
            </Button>
          </div>

          {/* Option 3 — Send via WhatsApp */}
          <div className="rounded-lg border p-3 flex items-start gap-3"
            style={{
              borderColor: !hasPhone ? 'var(--brand-border)' : 'var(--brand-borderSoft)',
              background: 'var(--bg-input)',
              opacity: !hasPhone ? 0.5 : 1,
            }}>
            <MessageCircle size={16} className="mt-0.5 flex-shrink-0" style={{ color: !hasPhone ? 'var(--brand-textMuted)' : '#25D366' }} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Send via WhatsApp</div>
              <div className="text-xs muted mt-0.5">
                {hasPhone
                  ? <>Opens WhatsApp to <strong>{client.phoneCode || ''} {client.phoneDigits}</strong> with the letter text.</>
                  : <>No phone number on file — add it on the client page first.</>}
              </div>
            </div>
            <Button size="sm" disabled={busy || !hasPhone} onClick={() => sendWa.mutate()}
              style={{ flexShrink: 0 }}>
              {sendWa.isPending ? 'Opening…' : 'Open WhatsApp'}
            </Button>
          </div>

        </div>

        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
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
  const hasGroup = !!client.whatsappGroupLink;
  const hasPhone = !!client.phoneDigits;
  const hasWA = hasGroup || hasPhone;
  const canSend = toEmail || hasWA;
  const waLabel = hasGroup ? 'WhatsApp group' : hasPhone ? 'WhatsApp direct' : '';
  const [coordinatorName, setCoordinatorName] = useState('Kashish');

  const send = useMutation({
    mutationFn: async () => {
      const results: any = {};
      if (toEmail) results.email = await api.post(`/clients/${client.id}/handover-welcome`, { channel: 'email', coordinatorName }).then(r => r.data);
      if (hasWA) results.wa = await api.post(`/clients/${client.id}/handover-welcome`, { channel: 'whatsapp', coordinatorName }).then(r => r.data);
      return results;
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      qc.invalidateQueries({ queryKey: ['messages'] });
      // Open group or wa.me link — use named target to avoid duplicate windows
      if (r.wa?.url) window.open(r.wa.url, 'whatsapp_window', 'noopener');
      const sent = [toEmail && 'Email', hasWA && waLabel].filter(Boolean).join(' + ');
      showToast(`Welcome email sent (${sent})`);
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const markAlreadySent = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/handover-welcome`, { channel: 'already_sent' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] });
      showToast('Marked as already sent · step completed');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const anyPending = send.isPending || markAlreadySent.isPending;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Welcome email · ${client.name}`}
        description="Mitali's welcome to MITS team — playbook link, service agreement, team intro (Kashish / Bhavneet / Mitali)."
        className="max-w-xl"
      >
        <div className="space-y-2 text-sm">
          <div><strong>To (email):</strong> {toEmail || <span className="text-brand-amber">missing</span>}</div>
          <div><strong>To (WhatsApp):</strong> {hasGroup ? <span style={{ color: '#25D366' }}>Group — {client.whatsappGroupName || 'link saved'}</span> : hasPhone ? `${client.phoneCode || ''} ${client.phoneDigits}` : <span className="text-brand-amber">missing</span>}</div>
          <div className="mt-3">
            <label className="text-xs font-semibold block mb-1">Client Coordinator (line 1 of team intro)</label>
            <select
              value={coordinatorName}
              onChange={e => setCoordinatorName(e.target.value)}
              className="input text-sm w-full"
            >
              <option value="Kashish">Kashish</option>
              <option value="Muskan">Muskan</option>
              <option value="Bhavneet">Bhavneet</option>
            </select>
          </div>
          <div className="text-xs muted bg-bg-input p-2 rounded mt-2">
            Sends: <em>"Welcome Aboard [Name] — MITS Solution"</em> with MITS Client Playbook link, team intro ({coordinatorName}, Bhavneet, Mitali roles), and service agreement note. CC'd to mc.welcome@mitssolution.com.
          </div>
        </div>

        {/* Already sent option */}
        <div className="mt-3 p-2.5 rounded border" style={{ borderColor: 'var(--brand-borderSoft)', background: 'var(--bg-input)' }}>
          <div className="text-xs font-medium mb-1">Already sent this outside the app?</div>
          <div className="text-xs muted mb-2">Mark as done to complete the wizard step without sending again.</div>
          <Button size="sm" disabled={anyPending} onClick={() => markAlreadySent.mutate()}>
            {markAlreadySent.isPending ? 'Marking…' : '✓ Already sent — mark done'}
          </Button>
        </div>

        <DialogFooter>
          {!canSend && (
            <div className="text-xs text-brand-amber mr-auto self-center">
              ⚠ No email or WhatsApp on file — use "Already sent" above.
            </div>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canSend || anyPending} onClick={() => send.mutate()}>
            <Mail size={12}/><MessageCircle size={12}/>{' '}
            {send.isPending ? 'Sending…' : `Send (${[toEmail && 'Email', hasWA && waLabel].filter(Boolean).join(' + ') || '—'})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeedbackEmailModal({ client, onClose }: any) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const toEmail = client.email || (client.intakeData as any)?.client_email || '';

  const send = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/feedback-email`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      showToast('Feedback survey email sent');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed to send feedback email', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Send feedback survey · ${client.name}`}
        description="Sends the 'We value your feedback' email with the Client Survey Form link."
        className="max-w-md"
      >
        <div className="space-y-2 text-sm">
          <div><strong>To (email):</strong> {toEmail || <span className="text-brand-amber">missing — add email to client first</span>}</div>
          <div className="text-xs muted bg-bg-input p-2 rounded mt-2">
            Sends Mitali's branded feedback survey email asking the client to fill out the Client Survey Form. CC'd to feedback@mitssolution.com.
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!toEmail || send.isPending} onClick={() => send.mutate()}>
            <Mail size={12}/> {send.isPending ? 'Sending…' : 'Send feedback email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Edit Training Setup modal ──────────────────────────────────────────── */
function EditTrainingSetupModal({ client, onClose }: { client: any; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [f, setF] = useState({
    sessionTimings: client.sessionTimings || '',
    meetingPlatform: client.meetingPlatform || '',
    clientSkillSet: client.clientSkillSet || '',
    clientTimezone: client.clientTimezone || '',
    whatsappGroupLink: client.whatsappGroupLink || '',
    certificateUrl: client.certificateUrl || '',
  });

  const save = useMutation({
    mutationFn: () => api.patch(`/clients/${client.id}`, f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client', client.id] }); showToast('Saved'); onClose(); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Edit Training Setup" description="Session details visible on the coordinator sheet.">
        <div className="form-row"><Label>Session timings</Label><Input value={f.sessionTimings} onChange={(e) => setF({ ...f, sessionTimings: e.target.value })} placeholder="e.g. Mon/Wed/Fri 9:00 AM IST" /></div>
        <div className="form-row">
          <Label>Meeting platform</Label>
          <Select value={f.meetingPlatform} onChange={(e) => setF({ ...f, meetingPlatform: e.target.value })}>
            <option value="">— select —</option>
            <option>Zoom</option><option>Teams</option><option>Webex</option><option>Google Meet</option><option>GoToMeeting</option><option>Phone</option><option>Other</option>
          </Select>
        </div>
        <div className="form-row"><Label>Client skill set</Label><Input value={f.clientSkillSet} onChange={(e) => setF({ ...f, clientSkillSet: e.target.value })} placeholder="e.g. Python, Data Analysis, AWS" /></div>
        <div className="form-row"><Label>Client timezone</Label><Input value={f.clientTimezone} onChange={(e) => setF({ ...f, clientTimezone: e.target.value })} placeholder="e.g. America/New_York, Asia/Kolkata" /></div>
        <div className="form-row"><Label>WhatsApp group link</Label><Input value={f.whatsappGroupLink} onChange={(e) => setF({ ...f, whatsappGroupLink: e.target.value })} placeholder="https://chat.whatsapp.com/…" /></div>
        <div className="form-row"><Label>Certificate URL (when completed)</Label><Input value={f.certificateUrl} onChange={(e) => setF({ ...f, certificateUrl: e.target.value })} placeholder="https://drive.google.com/…" /></div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Edit Handover modal ─────────────────────────────────────────────────── */
function EditHandoverModal({ client, onClose }: { client: any; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [f, setF] = useState({
    handoverStatus: client.handoverStatus || '',
    handoverDate: client.handoverDate || '',
    handoverOwnerId: client.handoverOwnerId || '',
    handoverNotes: client.handoverNotes || '',
  });
  const { data: users } = useQuery({ queryKey: ['users-list'], queryFn: () => api.get('/users').then((r) => r.data) });
  const teamMembers = (users || []).filter((u: any) => ['manager', 'lead', 'account_manager', 'founder'].includes(u.role));

  const save = useMutation({
    mutationFn: () => api.patch(`/clients/${client.id}`, f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client', client.id] }); showToast('Saved'); onClose(); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Edit Handover" description="Track the client handover call and status.">
        <div className="form-row">
          <Label>Handover status</Label>
          <Select value={f.handoverStatus} onChange={(e) => setF({ ...f, handoverStatus: e.target.value })}>
            <option value="">— not started —</option>
            <option value="Pending">Pending</option>
            <option value="Done">Done</option>
          </Select>
        </div>
        <div className="form-row"><Label>Handover date</Label><Input type="date" value={f.handoverDate} onChange={(e) => setF({ ...f, handoverDate: e.target.value })} /></div>
        <div className="form-row">
          <Label>Handover owner</Label>
          <Select value={f.handoverOwnerId} onChange={(e) => setF({ ...f, handoverOwnerId: e.target.value })}>
            <option value="">— select —</option>
            {teamMembers.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </div>
        <div className="form-row"><Label>Handover notes</Label><Textarea rows={3} value={f.handoverNotes} onChange={(e) => setF({ ...f, handoverNotes: e.target.value })} placeholder="Topics covered, client concerns, special requests…" /></div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Mitali welcome email modal ─────────────────────────────────────────── */
function MitaliWelcomeEmailModal({ client, onClose }: { client: any; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const toEmail = client.email || (client.intakeData as any)?.client_email || '';
  const defaultCoordinator = client.assignedAm?.name || 'Muskan';
  const [coordinatorName, setCoordinatorName] = useState(defaultCoordinator);
  const [playbookUrl, setPlaybookUrl] = useState('https://drive.google.com/file/d/1v3myXlxmqjctWSL6qqmVofD21IxuGO_7/view?usp=sharing');
  const [agreementUrl, setAgreementUrl] = useState('');

  const send = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/mitali-welcome-email`, {
      coordinatorName: coordinatorName.trim() || undefined,
      playbookUrl: playbookUrl || undefined,
      agreementUrl: agreementUrl || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client', client.id] }); showToast('Welcome email sent'); onClose(); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Send welcome email" description="Sends Mitali's branded onboarding welcome to the client.">
        <div className="rounded-lg px-4 py-3 text-[12px]" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
          <div className="font-semibold mb-1">To: {toEmail || <span className="text-red-400">No email on file</span>}</div>
          <div className="muted">CC: vaibhav.aggarwal@mitssolution.com</div>
          <div className="mt-1 muted">Subject: Welcome Aboard {client.name} -- MITS Solution</div>
          <div className="mt-2 text-[11px] muted">Template: welcome message · {coordinatorName || 'Coordinator'} (Coordinator) · Bhavneet (Team Leader) · Mitali (CSM) · escalation ETAs · playbook + agreement links.</div>
        </div>

        <div className="form-row mt-3">
          <Label>Client Coordinator <span className="muted font-normal">(name shown in email)</span></Label>
          <input
            className="input text-[12px]"
            placeholder="e.g. Muskan or Kashish"
            value={coordinatorName}
            onChange={(e) => setCoordinatorName(e.target.value)}
          />
        </div>

        <div className="form-row">
          <Label>Client Playbook URL <span className="muted font-normal">(paste Google Drive link)</span></Label>
          <input
            className="input text-[12px]"
            type="url"
            placeholder="https://drive.google.com/file/d/..."
            value={playbookUrl}
            onChange={(e) => setPlaybookUrl(e.target.value)}
          />
        </div>

        <div className="form-row">
          <Label>Service Agreement URL <span className="muted font-normal">(optional — leave blank if sending via SignEasy)</span></Label>
          <input
            className="input text-[12px]"
            type="url"
            placeholder="https://signeasy.com/... or leave blank"
            value={agreementUrl}
            onChange={(e) => setAgreementUrl(e.target.value)}
          />
          {!agreementUrl && <div className="text-[11px] muted mt-0.5">Email will say "you might be receiving this document from SignEasy soon."</div>}
        </div>

        {!toEmail && <div className="text-red-400 text-[12px] mt-2">Add client email before sending.</div>}
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!toEmail || send.isPending} onClick={() => send.mutate()}>
            <Mail size={12}/> {send.isPending ? 'Sending…' : 'Send welcome email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Certificate email modal ────────────────────────────────────────────── */
function CertificateEmailModal({ client, onClose }: { client: any; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const toEmail = client.email || (client.intakeData as any)?.client_email || '';

  const send = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/certificate-email`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client', client.id] }); showToast('Certificate email sent'); onClose(); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Send certificate email" description="Sends the Certificate of Completion email to the client.">
        <div className="rounded-lg px-4 py-3 text-[12px]" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
          <div className="font-semibold mb-1">To: {toEmail || <span className="text-red-400">No email on file</span>}</div>
          <div className="mt-2 muted">Subject: Certificate of Completion – {client.name}</div>
          {(client as any).certificateUrl && (
            <div className="mt-2"><a href={(client as any).certificateUrl} target="_blank" rel="noreferrer" className="text-brand-blue text-[11px]">View certificate →</a></div>
          )}
        </div>
        {!toEmail && <div className="text-red-400 text-[12px] mt-2">Add client email before sending.</div>}
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!toEmail || send.isPending} onClick={() => send.mutate()}>
            <Mail size={12}/> {send.isPending ? 'Sending…' : 'Send certificate email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
