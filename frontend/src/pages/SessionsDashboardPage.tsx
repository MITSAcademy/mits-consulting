/**
 * "My Session Planned" Dashboard — Features 1, 3, 4, 5, 7, 8
 *
 * Feature 1: Today's + Upcoming sessions with filters
 * Feature 3: Start/End time tracking with delay reason
 * Feature 4: Structured trainer feedback (trainerFeedbackJson)
 * Feature 5: Client feedback with satisfaction rating (clientFeedbackJson)
 * Feature 7: Pre-session checklist (inline, 7 items)
 * Feature 8: Quick stats bar
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';
import { todayISO } from '@/lib/utils';
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Video,
  User,
  Clock,
  CheckSquare,
  Square,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Play,
  StopCircle,
  MessageSquare,
  Star,
  X,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────── */
/* Types */

interface SessionChecklist {
  trainerConfirmed: boolean;
  clientReminded: boolean;
  zoomLinkShared: boolean;
  sessionStartedOnTime: boolean;
  sessionEndedSmoothly: boolean;
  trainerFeedbackCollected: boolean;
  clientFeedbackRequested: boolean;
}

interface TrainerFeedback {
  topicsCovered: string;
  assignmentsGiven: string;
  studentPerformance: string;
  attendanceCount: string;
  trainerNotes: string;
}

interface ClientFeedback {
  satisfactionRating: number;
  feedbackText: string;
  issuesReported: string;
  wouldRecommend: boolean | null;
}

interface TrainingSession {
  id: string;
  scheduledFor: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'cancelled';
  sessionType: 'Training' | 'Demo' | 'Catchup' | string;
  durationMinutes: number | null;
  meetingLink: string | null;
  notes: string | null;
  timezone: string | null;
  delayReason: string | null;
  checklist: SessionChecklist | null;
  trainerFeedbackJson: TrainerFeedback | null;
  clientFeedbackJson: ClientFeedback | null;
  training: {
    id: string;
    name: string;
    client: { id: string; name: string } | null;
    trainer: { id: string; name: string } | null;
    hostedByDefault: { id: string; name: string } | null;
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Helpers */

const TODAY = todayISO();

function fmtDateTime(iso: string, tz?: string | null): { date: string; time: string; tz?: string } {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  if (tz) opts.timeZone = tz;
  const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...(tz ? { timeZone: tz } : {}) });
  const timeStr = d.toLocaleTimeString('en-IN', opts);
  return { date: dateStr, time: timeStr, tz: tz || undefined };
}

function isoDatePart(iso: string, tz?: string | null): string {
  if (!tz) return iso.slice(0, 10);
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
  } catch {
    return iso.slice(0, 10);
  }
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Status badge */

function StatusBadge({ status }: { status: TrainingSession['status'] }) {
  if (status === 'scheduled') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}
      >
        Scheduled
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(74,222,128,0.18)', color: 'var(--status-green)' }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: 'var(--status-green)', animation: 'sdp-pulse 1.4s ease-in-out infinite' }}
        />
        Live
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(148,163,184,0.12)', color: 'var(--brand-textMuted)' }}
      >
        Completed
      </span>
    );
  }
  if (status === 'missed') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--status-red)' }}
      >
        Missed
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: 'rgba(148,163,184,0.10)', color: 'var(--brand-textMuted)' }}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Session type badge */

function TypeBadge({ type }: { type: string }) {
  const color =
    type === 'Demo' ? 'purple' :
    type === 'Catchup' ? 'teal' :
    'blue';
  return <Pill color={color as any}>{type}</Pill>;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Checklist keys + labels */

const CHECKLIST_KEYS: { key: keyof SessionChecklist; label: string }[] = [
  { key: 'trainerConfirmed',          label: 'Trainer confirmed attendance' },
  { key: 'clientReminded',            label: 'Client reminded 24h before' },
  { key: 'zoomLinkShared',            label: 'Zoom / meeting link shared' },
  { key: 'sessionStartedOnTime',      label: 'Session started on time' },
  { key: 'sessionEndedSmoothly',      label: 'Session ended smoothly' },
  { key: 'trainerFeedbackCollected',  label: 'Trainer feedback collected' },
  { key: 'clientFeedbackRequested',   label: 'Client feedback requested' },
];

const DEFAULT_CHECKLIST: SessionChecklist = {
  trainerConfirmed: false,
  clientReminded: false,
  zoomLinkShared: false,
  sessionStartedOnTime: false,
  sessionEndedSmoothly: false,
  trainerFeedbackCollected: false,
  clientFeedbackRequested: false,
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* Checklist panel */

function ChecklistPanel({ session }: { session: TrainingSession }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  const checklist: SessionChecklist = { ...DEFAULT_CHECKLIST, ...(session.checklist || {}) };
  const done = CHECKLIST_KEYS.filter((k) => checklist[k.key]).length;

  const patch = useMutation({
    mutationFn: (updated: SessionChecklist) =>
      api.patch(`/regular-trainings/sessions/${session.id}`, { checklist: updated }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions-dashboard'] });
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to save checklist', 'error'),
  });

  function toggle(key: keyof SessionChecklist) {
    const updated = { ...checklist, [key]: !checklist[key] };
    patch.mutate(updated);
  }

  return (
    <div
      className="mt-3 rounded-lg p-3"
      style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <span
          className="text-[10px] uppercase tracking-[0.12em] font-bold"
          style={{ color: 'var(--accent-gold)' }}
        >
          Pre-session checklist
        </span>
        <span className="text-[11px] font-semibold" style={{ color: done === 7 ? 'var(--status-green)' : 'var(--brand-textMuted)' }}>
          {done}/7 done
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {CHECKLIST_KEYS.map(({ key, label }) => {
          const checked = checklist[key];
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              disabled={patch.isPending}
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-all hover-lift"
              style={{
                background: checked ? 'rgba(74,222,128,0.08)' : 'transparent',
                border: `1px solid ${checked ? 'rgba(74,222,128,0.25)' : 'var(--brand-borderSoft)'}`,
                cursor: 'pointer',
              }}
            >
              {checked
                ? <CheckSquare size={13} style={{ color: 'var(--status-green)', flexShrink: 0 }} />
                : <Square size={13} style={{ color: 'var(--brand-textMuted)', flexShrink: 0 }} />
              }
              <span
                className="text-[11.5px]"
                style={{ color: checked ? 'var(--brand-text)' : 'var(--brand-textMuted)' }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Feature 3: Start/End Time modal */

interface StartEndModalProps {
  session: TrainingSession;
  onClose: () => void;
}

function StartEndModal({ session, onClose }: StartEndModalProps) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [delayReason, setDelayReason] = useState(session.delayReason || '');

  const startMut = useMutation({
    mutationFn: () => api.post(`/regular-trainings/sessions/${session.id}/start`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions-dashboard'] });
      showToast('Session started — timer running', 'success');
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to start session', 'error'),
  });

  const endMut = useMutation({
    mutationFn: () => api.post(`/regular-trainings/sessions/${session.id}/end`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions-dashboard'] });
      showToast('Session ended — duration saved', 'success');
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to end session', 'error'),
  });

  const delayMut = useMutation({
    mutationFn: (reason: string) =>
      api.patch(`/regular-trainings/sessions/${session.id}`, { delayReason: reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions-dashboard'] });
      showToast('Delay reason saved', 'success');
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to save', 'error'),
  });

  const isLive = session.status === 'in_progress';
  const isStarted = !!session.actualStartAt;
  const isEnded = !!session.actualEndAt;

  function fmtTime(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--brand-border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-[15px] font-bold" style={{ color: 'var(--brand-text)' }}>
              Session Time Tracking
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--brand-textMuted)' }}>
              {session.training.client?.name || session.training.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all hover-lift"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-textMuted)', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Time display */}
        <div
          className="grid grid-cols-2 gap-3 mb-5 p-4 rounded-xl"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
        >
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--brand-textMuted)' }}>Started</div>
            <div className="text-[18px] font-bold mono" style={{ color: isStarted ? 'var(--status-green)' : 'var(--brand-textMuted)' }}>
              {fmtTime(session.actualStartAt)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--brand-textMuted)' }}>Ended</div>
            <div className="text-[18px] font-bold mono" style={{ color: isEnded ? '#60a5fa' : 'var(--brand-textMuted)' }}>
              {fmtTime(session.actualEndAt)}
            </div>
          </div>
          {session.durationMinutes && (
            <div className="col-span-2 text-center border-t pt-2" style={{ borderColor: 'var(--brand-borderSoft)' }}>
              <span className="text-[11px]" style={{ color: 'var(--brand-textMuted)' }}>Duration: </span>
              <span className="text-[13px] font-bold" style={{ color: 'var(--accent-gold)' }}>
                {session.durationMinutes} min
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mb-4">
          {!isStarted && (
            <Button
              className="flex-1"
              variant="primary"
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending}
            >
              <Play size={13} />
              {startMut.isPending ? 'Starting…' : 'Mark Start'}
            </Button>
          )}
          {(isLive || (isStarted && !isEnded)) && (
            <Button
              className="flex-1"
              onClick={() => endMut.mutate()}
              disabled={endMut.isPending}
              style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--status-red)', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              <StopCircle size={13} />
              {endMut.isPending ? 'Ending…' : 'Mark End'}
            </Button>
          )}
        </div>

        {/* Delay reason */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: 'var(--brand-textMuted)' }}>
            Delay Reason (optional)
          </label>
          <textarea
            value={delayReason}
            onChange={(e) => setDelayReason(e.target.value)}
            rows={2}
            placeholder="e.g. Trainer joined 10 min late — technical issue"
            className="w-full rounded-lg px-3 py-2 text-[12px] resize-none"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--brand-borderSoft)',
              color: 'var(--brand-text)',
              outline: 'none',
            }}
          />
          <div className="flex justify-end mt-2">
            <Button
              size="sm"
              onClick={() => delayMut.mutate(delayReason)}
              disabled={delayMut.isPending || delayReason === (session.delayReason || '')}
            >
              {delayMut.isPending ? 'Saving…' : 'Save Reason'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Feature 4: Trainer Feedback modal */

interface TrainerFeedbackModalProps {
  session: TrainingSession;
  onClose: () => void;
}

function TrainerFeedbackModal({ session, onClose }: TrainerFeedbackModalProps) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const existing = session.trainerFeedbackJson;

  const [form, setForm] = useState<TrainerFeedback>({
    topicsCovered:      existing?.topicsCovered      || '',
    assignmentsGiven:   existing?.assignmentsGiven   || '',
    studentPerformance: existing?.studentPerformance || '',
    attendanceCount:    existing?.attendanceCount    || '',
    trainerNotes:       existing?.trainerNotes       || '',
  });

  const saveMut = useMutation({
    mutationFn: (data: TrainerFeedback) =>
      api.patch(`/regular-trainings/sessions/${session.id}`, { trainerFeedbackJson: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions-dashboard'] });
      showToast('Trainer feedback saved', 'success');
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to save', 'error'),
  });

  function set(field: keyof TrainerFeedback, val: string) {
    setForm((prev) => ({ ...prev, [field]: val }));
  }

  const performanceOptions = ['Excellent', 'Good', 'Average', 'Below Average', 'Poor'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--brand-border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-[15px] font-bold" style={{ color: 'var(--brand-text)' }}>
              Trainer Feedback
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--brand-textMuted)' }}>
              {session.training.trainer?.name || 'No trainer'} · {session.training.client?.name || session.training.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all hover-lift"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-textMuted)', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Topics covered */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: 'var(--brand-textMuted)' }}>
              Topics Covered
            </label>
            <textarea
              value={form.topicsCovered}
              onChange={(e) => set('topicsCovered', e.target.value)}
              rows={2}
              placeholder="e.g. Arrays, Linked Lists, Big-O notation"
              className="w-full rounded-lg px-3 py-2 text-[12px] resize-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', outline: 'none' }}
            />
          </div>

          {/* Assignments given */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: 'var(--brand-textMuted)' }}>
              Assignments Given
            </label>
            <textarea
              value={form.assignmentsGiven}
              onChange={(e) => set('assignmentsGiven', e.target.value)}
              rows={2}
              placeholder="e.g. Practice 10 array problems on LeetCode"
              className="w-full rounded-lg px-3 py-2 text-[12px] resize-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', outline: 'none' }}
            />
          </div>

          {/* Student performance */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: 'var(--brand-textMuted)' }}>
              Student Performance
            </label>
            <div className="relative">
              <select
                value={form.studentPerformance}
                onChange={(e) => set('studentPerformance', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[12px] appearance-none pr-8"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--brand-borderSoft)',
                  color: form.studentPerformance ? 'var(--brand-text)' : 'var(--brand-textMuted)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">Select performance</option>
                {performanceOptions.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--brand-textMuted)' }} />
            </div>
          </div>

          {/* Attendance count */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: 'var(--brand-textMuted)' }}>
              Attendance Count
            </label>
            <input
              type="number"
              min={0}
              value={form.attendanceCount}
              onChange={(e) => set('attendanceCount', e.target.value)}
              placeholder="Number of students present"
              className="w-full rounded-lg px-3 py-2 text-[12px]"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', outline: 'none' }}
            />
          </div>

          {/* Trainer notes */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: 'var(--brand-textMuted)' }}>
              Trainer Notes
            </label>
            <textarea
              value={form.trainerNotes}
              onChange={(e) => set('trainerNotes', e.target.value)}
              rows={3}
              placeholder="Any additional observations, concerns, or next steps"
              className="w-full rounded-lg px-3 py-2 text-[12px] resize-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', outline: 'none' }}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => saveMut.mutate(form)}
            disabled={saveMut.isPending}
          >
            {saveMut.isPending ? 'Saving…' : 'Save Feedback'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Feature 5: Client Feedback modal */

interface ClientFeedbackModalProps {
  session: TrainingSession;
  onClose: () => void;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hovered || value);
        return (
          <button
            key={star}
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <Star
              size={24}
              fill={filled ? 'var(--accent-gold)' : 'none'}
              style={{ color: filled ? 'var(--accent-gold)' : 'var(--brand-borderSoft)', transition: 'all 0.15s' }}
            />
          </button>
        );
      })}
      {value > 0 && (
        <span className="ml-1 text-[12px] font-semibold self-center" style={{ color: 'var(--accent-gold)' }}>
          {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][value]}
        </span>
      )}
    </div>
  );
}

function ClientFeedbackModal({ session, onClose }: ClientFeedbackModalProps) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const existing = session.clientFeedbackJson;

  const [rating, setRating]               = useState(existing?.satisfactionRating || 0);
  const [feedbackText, setFeedbackText]   = useState(existing?.feedbackText || '');
  const [issuesReported, setIssuesReported] = useState(existing?.issuesReported || '');
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(existing?.wouldRecommend ?? null);

  const saveMut = useMutation({
    mutationFn: (data: ClientFeedback) =>
      api.patch(`/regular-trainings/sessions/${session.id}`, { clientFeedbackJson: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions-dashboard'] });
      showToast('Client feedback saved', 'success');
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to save', 'error'),
  });

  function save() {
    saveMut.mutate({
      satisfactionRating: rating,
      feedbackText,
      issuesReported,
      wouldRecommend,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--brand-border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-[15px] font-bold" style={{ color: 'var(--brand-text)' }}>
              Client Feedback
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--brand-textMuted)' }}>
              {session.training.client?.name || session.training.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all hover-lift"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-textMuted)', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Satisfaction rating */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide mb-2 block" style={{ color: 'var(--brand-textMuted)' }}>
              Satisfaction Rating
            </label>
            <StarRating value={rating} onChange={setRating} />
          </div>

          {/* Would recommend */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide mb-2 block" style={{ color: 'var(--brand-textMuted)' }}>
              Would Client Recommend?
            </label>
            <div className="flex gap-2">
              {[
                { val: true,  label: 'Yes' },
                { val: false, label: 'No' },
              ].map(({ val, label }) => (
                <button
                  key={String(val)}
                  onClick={() => setWouldRecommend(wouldRecommend === val ? null : val)}
                  className="px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                  style={{
                    background: wouldRecommend === val
                      ? (val ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.12)')
                      : 'var(--bg-input)',
                    border: `1px solid ${wouldRecommend === val
                      ? (val ? 'rgba(74,222,128,0.4)' : 'rgba(239,68,68,0.3)')
                      : 'var(--brand-borderSoft)'}`,
                    color: wouldRecommend === val
                      ? (val ? 'var(--status-green)' : 'var(--status-red)')
                      : 'var(--brand-textMuted)',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback text */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: 'var(--brand-textMuted)' }}>
              Client Feedback
            </label>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={3}
              placeholder="What did the client say about the session?"
              className="w-full rounded-lg px-3 py-2 text-[12px] resize-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', outline: 'none' }}
            />
          </div>

          {/* Issues reported */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: 'var(--brand-textMuted)' }}>
              Issues Reported
            </label>
            <textarea
              value={issuesReported}
              onChange={(e) => setIssuesReported(e.target.value)}
              rows={2}
              placeholder="Any complaints, concerns or issues raised by the client"
              className="w-full rounded-lg px-3 py-2 text-[12px] resize-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', outline: 'none' }}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={save}
            disabled={saveMut.isPending || rating === 0}
          >
            {saveMut.isPending ? 'Saving…' : 'Save Feedback'}
          </Button>
        </div>

        {rating === 0 && (
          <p className="text-[10px] text-center mt-2" style={{ color: 'var(--brand-textMuted)' }}>
            A satisfaction rating is required to save
          </p>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Session card */

function SessionCard({ session }: { session: TrainingSession }) {
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [startEndOpen, setStartEndOpen]   = useState(false);
  const [trainerFbOpen, setTrainerFbOpen] = useState(false);
  const [clientFbOpen, setClientFbOpen]   = useState(false);

  const { training } = session;
  const fmt = fmtDateTime(session.scheduledFor, session.timezone);
  const clientName = training.client?.name || training.name;
  const trainerName = training.trainer?.name;
  const coordinator = training.hostedByDefault?.name;

  const isLive = session.status === 'in_progress';
  const isMissed = session.status === 'missed';
  const isCompleted = session.status === 'completed';

  const checklistCount = CHECKLIST_KEYS.filter(
    (k) => session.checklist?.[k.key]
  ).length;

  const hasTrainerFb = !!(session.trainerFeedbackJson?.topicsCovered || session.trainerFeedbackJson?.trainerNotes);
  const hasClientFb = !!session.clientFeedbackJson?.satisfactionRating;
  const hasTimingInfo = !!session.actualStartAt;

  return (
    <>
      <div
        className="rounded-xl p-4 transition-all hover-lift"
        style={{
          background: isLive
            ? 'linear-gradient(135deg, rgba(74,222,128,0.06) 0%, var(--bg-card) 60%)'
            : isMissed
            ? 'linear-gradient(135deg, rgba(239,68,68,0.05) 0%, var(--bg-card) 60%)'
            : 'var(--bg-card)',
          border: `1px solid ${
            isLive ? 'rgba(74,222,128,0.35)' :
            isMissed ? 'rgba(239,68,68,0.25)' :
            'var(--brand-border)'
          }`,
          borderLeft: `3px solid ${
            isLive ? 'var(--status-green)' :
            isMissed ? 'var(--status-red)' :
            isCompleted ? 'var(--brand-borderSoft)' :
            'var(--accent-gold)'
          }`,
          boxShadow: isLive ? '0 4px 16px rgba(74,222,128,0.10)' : 'var(--shadow-sm)',
        }}
      >
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {/* Left: main info */}
          <div className="flex-1 min-w-0">
            {/* Client name + type + status */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {training.client ? (
                <Link
                  to={`/clients/${training.client.id}`}
                  className="font-semibold text-[14px] hover:underline"
                  style={{ color: 'var(--brand-text)' }}
                >
                  {clientName}
                </Link>
              ) : (
                <span className="font-semibold text-[14px]" style={{ color: 'var(--brand-text)' }}>
                  {clientName}
                </span>
              )}
              <TypeBadge type={session.sessionType || 'Training'} />
              <StatusBadge status={session.status} />
              {session.delayReason && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--status-red)' }}
                  title={session.delayReason}
                >
                  Delayed
                </span>
              )}
            </div>

            {/* Meta row */}
            <div
              className="flex items-center gap-3 flex-wrap text-[11.5px]"
              style={{ color: 'var(--brand-textMuted)' }}
            >
              {/* Date + time */}
              <span className="flex items-center gap-1">
                <CalendarClock size={11} />
                <span className="font-semibold mono" style={{ color: 'var(--brand-textSecondary)' }}>
                  {fmt.date}
                </span>
                <span style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>
                  {fmt.time}
                </span>
                {fmt.tz && <span className="opacity-60 text-[10px]">{fmt.tz}</span>}
              </span>

              {/* Trainer */}
              {trainerName && (
                <span className="flex items-center gap-1">
                  <User size={11} />
                  {training.trainer ? (
                    <Link
                      to={`/trainers/${training.trainer.id}`}
                      className="hover:underline"
                      style={{ color: 'var(--brand-textMuted)' }}
                    >
                      {trainerName}
                    </Link>
                  ) : trainerName}
                </span>
              )}

              {/* Actual timing */}
              {hasTimingInfo && (
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  <span style={{ color: 'var(--status-green)' }}>
                    {new Date(session.actualStartAt!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </span>
                  {session.actualEndAt && (
                    <>
                      <span className="opacity-40">→</span>
                      <span>{new Date(session.actualEndAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                    </>
                  )}
                  {session.durationMinutes && (
                    <span style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>({session.durationMinutes}m)</span>
                  )}
                </span>
              )}

              {/* Coordinator */}
              {coordinator && (
                <span className="opacity-75">
                  Host: <span style={{ color: 'var(--brand-textSecondary)' }}>{coordinator}</span>
                </span>
              )}
            </div>

            {/* Notes */}
            {session.notes && (
              <div
                className="mt-1 text-[11px] italic line-clamp-1"
                style={{ color: 'var(--brand-textMuted)' }}
              >
                {session.notes}
              </div>
            )}

            {/* Feedback status chips */}
            {(hasTrainerFb || hasClientFb) && (
              <div className="flex gap-2 mt-1.5">
                {hasTrainerFb && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}
                  >
                    Trainer fb ✓
                  </span>
                )}
                {hasClientFb && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1"
                    style={{ background: 'rgba(229,178,76,0.12)', color: 'var(--accent-gold)' }}
                  >
                    <Star size={9} fill="var(--accent-gold)" />
                    {session.clientFeedbackJson!.satisfactionRating}/5
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            {/* Meeting link */}
            {session.meetingLink && (
              <a href={session.meetingLink} target="_blank" rel="noreferrer">
                <Button size="sm" variant="primary">
                  <Video size={11} /> Join
                  <ExternalLink size={10} className="ml-0.5 opacity-60" />
                </Button>
              </a>
            )}

            {/* Start/End time tracking */}
            <button
              onClick={() => setStartEndOpen(true)}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all hover-lift"
              style={{
                background: hasTimingInfo ? 'rgba(74,222,128,0.10)' : 'var(--bg-input)',
                border: `1px solid ${hasTimingInfo ? 'rgba(74,222,128,0.30)' : 'var(--brand-borderSoft)'}`,
                color: hasTimingInfo ? 'var(--status-green)' : 'var(--brand-textMuted)',
                cursor: 'pointer',
              }}
              title="Track session start/end time"
            >
              {isLive ? <StopCircle size={12} /> : <Play size={12} />}
              <span>{isLive ? 'Live' : hasTimingInfo ? 'Timed' : 'Time'}</span>
            </button>

            {/* Trainer feedback */}
            <button
              onClick={() => setTrainerFbOpen(true)}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all hover-lift"
              style={{
                background: hasTrainerFb ? 'rgba(59,130,246,0.10)' : 'var(--bg-input)',
                border: `1px solid ${hasTrainerFb ? 'rgba(59,130,246,0.30)' : 'var(--brand-borderSoft)'}`,
                color: hasTrainerFb ? '#60a5fa' : 'var(--brand-textMuted)',
                cursor: 'pointer',
              }}
              title="Trainer feedback"
            >
              <MessageSquare size={12} />
              <span>T.Fb</span>
            </button>

            {/* Client feedback */}
            <button
              onClick={() => setClientFbOpen(true)}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all hover-lift"
              style={{
                background: hasClientFb ? 'rgba(229,178,76,0.12)' : 'var(--bg-input)',
                border: `1px solid ${hasClientFb ? 'rgba(229,178,76,0.35)' : 'var(--brand-borderSoft)'}`,
                color: hasClientFb ? 'var(--accent-gold)' : 'var(--brand-textMuted)',
                cursor: 'pointer',
              }}
              title="Client feedback"
            >
              <Star size={12} fill={hasClientFb ? 'var(--accent-gold)' : 'none'} />
              <span>C.Fb</span>
            </button>

            {/* Checklist toggle */}
            <button
              onClick={() => setChecklistOpen((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all hover-lift"
              style={{
                background: checklistOpen ? 'rgba(229,178,76,0.15)' : 'var(--bg-input)',
                border: `1px solid ${checklistOpen ? 'rgba(229,178,76,0.40)' : 'var(--brand-borderSoft)'}`,
                color: checklistOpen ? 'var(--accent-gold)' : 'var(--brand-textMuted)',
                cursor: 'pointer',
              }}
            >
              <CheckSquare size={12} />
              <span>{checklistCount}/7</span>
              {checklistOpen
                ? <ChevronDown size={11} />
                : <ChevronRight size={11} />
              }
            </button>
          </div>
        </div>

        {/* Checklist panel */}
        {checklistOpen && <ChecklistPanel session={session} />}
      </div>

      {/* Modals */}
      {startEndOpen  && <StartEndModal session={session} onClose={() => setStartEndOpen(false)} />}
      {trainerFbOpen && <TrainerFeedbackModal session={session} onClose={() => setTrainerFbOpen(false)} />}
      {clientFbOpen  && <ClientFeedbackModal session={session} onClose={() => setClientFbOpen(false)} />}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Stats tile */

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-xl px-4 py-3 flex flex-col gap-0.5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}
    >
      <span
        className="text-[22px] font-bold mono"
        style={{ color: accent || 'var(--brand-text)' }}
      >
        {value}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--brand-textMuted)' }}>
        {label}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Section header */

function SectionHeader({ title, count, tone }: { title: string; count: number; tone: 'gold' | 'blue' | 'muted' }) {
  const color =
    tone === 'gold'  ? 'var(--accent-gold)' :
    tone === 'blue'  ? '#60a5fa' :
    'var(--brand-textMuted)';
  return (
    <div
      className="flex items-center gap-2 mb-3 text-[11px] uppercase tracking-[0.14em] font-bold"
      style={{ color }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      {title}
      <span
        className="normal-case tracking-normal font-semibold text-[11px] px-2 py-0.5 rounded-full"
        style={{ background: 'var(--bg-input)', color: 'var(--brand-textMuted)' }}
      >
        {count}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Main page */

type TimeFilter   = 'today' | 'week' | 'all';
type ScopeFilter  = 'mine' | 'all';
type StatusFilter = 'all' | 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'cancelled';

export default function SessionsDashboardPage() {
  const user = useAuth((s) => s.user)!;
  const isAM = user.role === 'account_manager';

  const [timeFilter, setTimeFilter]     = useState<TimeFilter>('week');
  const [scopeFilter, setScopeFilter]   = useState<ScopeFilter>(isAM ? 'mine' : 'all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const qc = useQueryClient();

  // Build query params
  const params: Record<string, string | boolean> = {};
  if (scopeFilter === 'mine') params.mine = true;
  if (statusFilter !== 'all') params.status = statusFilter;
  if (timeFilter === 'today') params.dateFrom = params.dateTo = TODAY;
  if (timeFilter === 'week') {
    const d = new Date();
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    params.dateFrom = monday.toISOString().slice(0, 10);
    params.dateTo   = sunday.toISOString().slice(0, 10);
  }

  const { data: sessions = [], isLoading, isFetching } = useQuery<TrainingSession[]>({
    queryKey: ['sessions-dashboard', params],
    queryFn: () => api.get('/regular-trainings/sessions', { params }).then((r) => r.data),
    refetchInterval: 10 * 60_000,
  });

  // Partition into today / upcoming / past
  const todaySessions = sessions.filter((s) => isoDatePart(s.scheduledFor, s.timezone) === TODAY);

  const upcomingSessions = sessions
    .filter((s) => isoDatePart(s.scheduledFor, s.timezone) > TODAY)
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  const todayCount    = todaySessions.length;
  const weekCount     = sessions.length;
  const upcomingCount = upcomingSessions.length;
  const missedCount   = sessions.filter((s) => s.status === 'missed').length;

  return (
    <>
      <style>{`
        @keyframes sdp-pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
      `}</style>

      <Topbar
        title="Session planned"
        subtitle={
          isLoading
            ? 'Loading…'
            : `${todayCount} today · ${upcomingCount} upcoming · ${missedCount} missed`
        }
        actions={
          <Button
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['sessions-dashboard'] })}
            disabled={isFetching}
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />

      <Page>
        {/* ── Quick stats bar ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatTile label="Today's sessions"   value={todayCount}    accent="var(--accent-gold)" />
          <StatTile label="This week total"    value={weekCount}     accent="#60a5fa" />
          <StatTile label="Upcoming"           value={upcomingCount} accent="var(--status-green)" />
          <StatTile label="Missed"             value={missedCount}   accent={missedCount > 0 ? 'var(--status-red)' : 'var(--brand-textMuted)'} />
        </div>

        {/* ── Filter bar ── */}
        <div
          className="flex flex-wrap items-center gap-2 mb-6 p-3 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}
        >
          {/* Time filter */}
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--brand-borderSoft)' }}>
            {(['today', 'week', 'all'] as TimeFilter[]).map((t) => (
              <button
                key={t}
                onClick={() => setTimeFilter(t)}
                className="px-3 py-1.5 text-[11.5px] font-semibold transition-all"
                style={{
                  background: timeFilter === t ? 'var(--accent-gold)' : 'var(--bg-input)',
                  color: timeFilter === t ? '#1a1a00' : 'var(--brand-textMuted)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                {t === 'today' ? 'Today' : t === 'week' ? 'This week' : 'All'}
              </button>
            ))}
          </div>

          {/* Scope filter — hidden for account_manager */}
          {!isAM && (
            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--brand-borderSoft)' }}>
              {(['mine', 'all'] as ScopeFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScopeFilter(s)}
                  className="px-3 py-1.5 text-[11.5px] font-semibold transition-all"
                  style={{
                    background: scopeFilter === s ? 'rgba(229,178,76,0.25)' : 'var(--bg-input)',
                    color: scopeFilter === s ? 'var(--accent-gold)' : 'var(--brand-textMuted)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {s === 'mine' ? 'Mine' : 'All coordinators'}
                </button>
              ))}
            </div>
          )}

          {/* Status filter */}
          <div className="flex items-center gap-1 ml-auto flex-wrap">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--brand-textMuted)' }}>Status:</span>
            {(['all', 'scheduled', 'in_progress', 'completed', 'missed', 'cancelled'] as StatusFilter[]).map((s) => {
              const label =
                s === 'all'         ? 'All' :
                s === 'in_progress' ? 'Live' :
                s.charAt(0).toUpperCase() + s.slice(1);
              const isActive = statusFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all"
                  style={{
                    background: isActive ? 'var(--bg-input)' : 'transparent',
                    border: `1px solid ${isActive ? 'var(--brand-borderSoft)' : 'transparent'}`,
                    color: isActive ? 'var(--brand-text)' : 'var(--brand-textMuted)',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Loading ── */}
        {isLoading && (
          <div className="flex items-center justify-center py-16 gap-2 muted">
            <RefreshCw size={16} className="animate-spin" />
            <span className="text-sm">Loading sessions…</span>
          </div>
        )}

        {/* ── Content ── */}
        {!isLoading && (
          <>
            {/* Today's sessions */}
            <div className="mb-6">
              <SectionHeader title="Today's sessions" count={todaySessions.length} tone="gold" />
              {todaySessions.length === 0 ? (
                <div
                  className="rounded-xl py-10 text-center"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}
                >
                  <CalendarClock size={28} style={{ color: 'var(--accent-gold)', margin: '0 auto 8px', opacity: 0.5 }} />
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>No sessions today</div>
                  <div className="text-[12px] muted mt-1">
                    {timeFilter !== 'today' ? 'All clear — nothing scheduled for today.' : 'Switch to "This week" or "All" to see more sessions.'}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {todaySessions
                    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
                    .map((s) => <SessionCard key={s.id} session={s} />)
                  }
                </div>
              )}
            </div>

            {/* Upcoming sessions */}
            {timeFilter !== 'today' && (
              <div className="mb-6">
                <SectionHeader title="Upcoming sessions" count={upcomingCount} tone="blue" />
                {upcomingCount === 0 ? (
                  <div
                    className="rounded-xl py-8 text-center"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}
                  >
                    <div className="text-[12px] muted">No upcoming sessions in the selected range.</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcomingSessions.map((s) => <SessionCard key={s.id} session={s} />)}
                  </div>
                )}
              </div>
            )}

            {/* Past sessions (all time filter only) */}
            {timeFilter === 'all' && (() => {
              const past = sessions
                .filter((s) => isoDatePart(s.scheduledFor, s.timezone) < TODAY)
                .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
              if (past.length === 0) return null;
              return (
                <div className="mb-6">
                  <SectionHeader title="Past sessions" count={past.length} tone="muted" />
                  <div className="space-y-2">
                    {past.map((s) => <SessionCard key={s.id} session={s} />)}
                  </div>
                </div>
              );
            })()}

            {/* Empty state */}
            {sessions.length === 0 && (
              <div
                className="rounded-xl py-16 text-center mt-2"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}
              >
                <AlertCircle size={32} style={{ color: 'var(--brand-textMuted)', margin: '0 auto 10px', opacity: 0.4 }} />
                <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>No sessions found</div>
                <div className="text-[12px] muted mt-1 max-w-xs mx-auto">
                  Try adjusting the time range or status filter, or check with your coordinator.
                </div>
              </div>
            )}
          </>
        )}
      </Page>
    </>
  );
}
