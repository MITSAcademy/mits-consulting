import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export const LIFECYCLE = [
  'Lead', 'IntakeSent', 'IntakeReceived', 'InternalSearch', 'WithRecruiters',
  'VerificationPending', 'TrainerMatched', 'DemoScheduled', 'DemoDone',
  'SaleClosing', 'SaleWon', 'Active',
] as const;

export function stageLabel(s: string) {
  const m: Record<string, string> = {
    Lead: 'Lead', IntakeSent: 'Intake sent', IntakeReceived: 'Intake received',
    InternalSearch: 'Internal search', WithRecruiters: 'With recruiters',
    VerificationPending: 'Verification pending', TrainerMatched: 'Trainer matched',
    DemoScheduled: 'Demo scheduled', DemoDone: 'Demo done',
    FeedbackPending: 'Feedback (Samita)',
    SaleClosing: 'Sale closing',
    SaleWon: 'Sale won', Active: 'Active', LeverageGranted: 'Leverage granted',
    Hold: 'On hold', Dormant: 'Dormant', Churned: 'Churned', Completed: 'Completed',
  };
  return m[s] || s;
}

export function stageColor(s: string): string {
  const m: Record<string, string> = {
    Lead: 'grey', IntakeSent: 'amber', IntakeReceived: 'amber',
    InternalSearch: 'purple', WithRecruiters: 'pink', VerificationPending: 'red',
    TrainerMatched: 'blue', DemoScheduled: 'blue', DemoDone: 'blue',
    FeedbackPending: 'amber',
    SaleClosing: 'amber', SaleWon: 'green', Active: 'green',
    LeverageGranted: 'amber', Hold: 'red', Dormant: 'grey', Churned: 'red', Completed: 'purple',
  };
  return m[s] || 'grey';
}

// Valid backward transitions per current stage (UI-only — backend enforces too).
// Lets Anjali pull a "DemoScheduled" client back to "WithRecruiters" when the client
// rejected the trainer post-call, etc.
export const BACK_OPTIONS: Record<string, string[]> = {
  IntakeSent:          ['Lead'],
  IntakeReceived:      ['Lead', 'IntakeSent'],
  InternalSearch:      ['IntakeReceived'],
  WithRecruiters:      ['IntakeReceived', 'InternalSearch'],
  VerificationPending: ['WithRecruiters', 'InternalSearch'],
  TrainerMatched:      ['WithRecruiters', 'InternalSearch'],
  DemoScheduled:       ['TrainerMatched', 'WithRecruiters', 'InternalSearch'],
  DemoDone:            ['DemoScheduled', 'WithRecruiters', 'InternalSearch'],
  FeedbackPending:     ['DemoDone', 'WithRecruiters'],
  SaleClosing:         ['DemoDone', 'FeedbackPending'],
  SaleWon:             ['SaleClosing'],
  Active:              ['SaleWon'],
};

export function backStagesFor(currentStage: string): string[] {
  return BACK_OPTIONS[currentStage] || [];
}

export function formatPhone(code?: string | null, digits?: string | null) {
  if (!digits) return '';
  const cc = code || '';
  if (cc === '+1' && digits.length === 10) return `${cc} ${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (cc === '+91' && digits.length === 10) return `${cc} ${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${cc} ${digits}`;
}

export function waLink(code?: string | null, digits?: string | null, message?: string) {
  const clean = `${code || ''}${digits || ''}`.replace(/[^0-9]/g, '');
  return `https://wa.me/${clean}${message ? '?text=' + encodeURIComponent(message) : ''}`;
}

export type AvailabilitySlot = { window?: string; fromIst?: string; toIst?: string };

/** Normalize whatever's stored (array, single legacy fields, null) into AvailabilitySlot[]. */
export function readAvailabilitySlots(t: any): AvailabilitySlot[] {
  if (Array.isArray(t?.availabilitySlots) && t.availabilitySlots.length) {
    return t.availabilitySlots.filter((s: any) => s && (s.window || s.fromIst || s.toIst));
  }
  if (t?.availabilityWindow || t?.availableFromIst || t?.availableToIst) {
    return [{ window: t.availabilityWindow || '', fromIst: t.availableFromIst || '', toIst: t.availableToIst || '' }];
  }
  return [];
}

/** Convert a "HH:MM" 24h string to a 12h "h:MM AM/PM" string. */
export function to12h(hhmm?: string): string {
  if (!hhmm) return '?';
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  let h = Number(m[1]);
  const mm = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mm} ${ampm}`;
}

/** Render slots as a short, human-readable line in 12h IST. */
export function formatAvailabilitySlots(slots: AvailabilitySlot[]): string {
  return slots
    .map((s) => {
      const range = (s.fromIst || s.toIst) ? `${to12h(s.fromIst)}–${to12h(s.toIst)}` : '';
      return [s.window, range].filter(Boolean).join(' ');
    })
    .filter(Boolean)
    .join(' · ');
}

// Role-based landing page. Mirrors the original `homePageFor()` in source.html.
// Each role lands on the screen most relevant to their job.
export function homePathFor(role?: string): string {
  switch (role) {
    case 'demo_lead':
    case 'demo_intake':       return '/demo-intake';
    case 'recruiter':         return '/sourcing';
    case 'sales_closer':      return '/sales-closing';
    case 'staff':             return '/tasks';
    case 'accounts':          return '/accounts-queue';
    case 'payment_processor': return '/trainer-pay';
    case 'lead':              return '/calendar';
    case 'manager':
    case 'founder':           return '/';
    default:                  return '/tasks';
  }
}

// Roles allowed to see the financial Home dashboard.
export const HOME_ROLES = ['founder', 'manager', 'demo_lead'] as const;

export const ROLE_LABELS: Record<string, string> = {
  founder: 'Founder',
  demo_lead: 'Demo lead',
  demo_intake: 'Demo intake',
  recruiter: 'Recruiter',
  sales_closer: 'Sales closer',
  manager: 'Operations manager',
  lead: 'Client success lead',
  staff: 'Client success staff',
  accounts: 'Accounts',
  payment_processor: 'Payment processor',
};
