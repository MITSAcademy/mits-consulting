import { useEffect, useRef, useState } from 'react';
import { X, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '@/store/auth';

type GuideEntry = {
  title: string;
  keywords: string[];
  roles: string[];
  steps: string[];
  tip?: string;
};

type GuideSection = {
  section: string;
  entries: GuideEntry[];
};

const GUIDES: GuideSection[] = [
  {
    section: 'Getting started',
    entries: [
      {
        title: 'Navigate the portal',
        keywords: ['sidebar', 'navigation', 'topbar', 'menu', 'pages'],
        roles: [],
        steps: [
          'Use the sidebar on the left to navigate between pages',
          'The topbar shows your current page and a global search (⌘K)',
          'Click your name in the greeting chip to see your profile',
        ],
      },
      {
        title: 'Global search',
        keywords: ['search', 'find', 'lookup', 'cmd k', 'ctrl k'],
        roles: [],
        steps: [
          'Press ⌘K (or Ctrl+K on Windows) to open global search',
          'Search for any client, trainer, or page by name',
          'Press Enter to navigate to the first result',
        ],
      },
      {
        title: 'Notifications',
        keywords: ['bell', 'alerts', 'reminders', 'renewals', 'activity'],
        roles: [],
        steps: [
          'The bell icon in the topbar shows unread notifications',
          'Click it to see recent activity and alerts',
          'Notifications auto-arrive for renewals, issues, and session reminders',
        ],
      },
    ],
  },
  {
    section: 'Clients',
    entries: [
      {
        title: 'Add a new client',
        keywords: ['add client', 'new client', 'create client', 'lead', 'engagement'],
        roles: ['founder', 'manager', 'demo_lead', 'demo_intake'],
        steps: [
          "Go to Clients page",
          "Click '+ Add client' in the top right",
          'Fill in name, engagement type, and source',
          "The client starts in 'Lead' lifecycle stage",
        ],
      },
      {
        title: 'Move a client through the pipeline',
        keywords: ['pipeline', 'lifecycle', 'stage', 'move client', 'progress'],
        roles: ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'],
        steps: [
          "Open the client's detail page",
          "Use the 'Lifecycle stage' dropdown to move them forward",
          'Each stage change is logged automatically',
        ],
      },
      {
        title: 'Understand the Pipeline overview page',
        keywords: ['pipeline overview', 'pipeline page', 'funnel', 'stage counts', 'doubts', 'help'],
        roles: [],
        steps: [
          "Go to the Pipeline page from the sidebar",
          'Each column shows a lifecycle stage and the clients currently in it',
          'Click a client card to jump to their detail page and update their stage',
          'Use this page as your at-a-glance view of where every client stands',
          "If anything here is unclear, use this Help panel first — search a keyword or ask your manager",
        ],
      },
      {
        title: 'Put a client on hold',
        keywords: ['hold', 'pause', 'resume', 'inactive'],
        roles: ['founder', 'manager', 'lead'],
        steps: [
          'Open the client detail page',
          "Change lifecycle to 'Hold'",
          "Set a resume date so you don't forget them",
          "They'll appear in the 'On hold' page",
        ],
      },
    ],
  },
  {
    section: 'Sessions & training',
    entries: [
      {
        title: 'Log a session',
        keywords: ['log session', 'session log', 'training', 'hours', 'trainer', 'pay sheet'],
        roles: ['founder', 'manager', 'lead', 'account_manager'],
        steps: [
          'Go to Session logs',
          'Find the client in the table',
          "Click 'Log session' on their row",
          'Fill in date, trainer, hours, and whether the session happened',
          "Save — the trainer's pay sheet updates automatically",
        ],
      },
      {
        title: 'View team sessions',
        keywords: ['team sessions', 'all sessions', 'filter', 'export', 'csv'],
        roles: ['founder', 'manager', 'lead'],
        steps: [
          'Go to Team sessions to see all logs across your team',
          'Filter by date range or trainer name',
          'Export to CSV using the button in the top right',
        ],
      },
    ],
  },
  {
    section: 'Payments',
    entries: [
      {
        title: 'Record a payment',
        keywords: ['payment', 'record payment', 'fresh payment', 'bank', 'amount', 'currency'],
        roles: ['founder', 'sales_closer', 'accounts'],
        steps: [
          'Go to Fresh payments',
          "Click '+ Record payment'",
          'Select the client, enter amount and currency',
          'Choose the bank account it was received in',
          'Save — a confirmation is logged and milestone toasts may appear',
        ],
      },
      {
        title: 'Check payment follow-up',
        keywords: ['follow up', 'overdue', 'upcoming payment', 'payment due'],
        roles: ['founder', 'manager', 'accounts', 'demo_lead'],
        steps: [
          'Go to Payment follow-up',
          'This shows clients with overdue or upcoming payments',
          'Click a client to open their detail and log a payment',
        ],
      },
    ],
  },
  {
    section: 'Issues & escalations',
    entries: [
      {
        title: 'Log an issue',
        keywords: ['issue', 'escalation', 'problem', 'severity', 'assign'],
        roles: ['founder', 'manager', 'lead', 'account_manager', 'demo_lead', 'demo_intake'],
        steps: [
          'Go to Issues & escalations',
          "Click '+ New issue'",
          'Describe the issue clearly — include client name if relevant',
          'Set severity and assign it',
          'Issues auto-escalate after 48 hours if unresolved',
        ],
      },
      {
        title: 'Report a bug in the portal',
        keywords: ['bug', 'report bug', 'error', 'broken', 'screenshot', 'tech team'],
        roles: [],
        steps: [
          "Click the '🐛 Report bug' button in this help panel",
          'Describe what went wrong and what you expected',
          'A screenshot is captured automatically',
          'The tech team is notified and will fix it',
        ],
      },
      {
        title: 'Escalation levels',
        keywords: ['escalation level', 'level 0', 'level 1', 'level 2', 'level 3', 'coordinator', 'founder'],
        roles: ['founder', 'manager', 'lead'],
        steps: [
          'Level 0 = unescalated (assigned owner handles it)',
          'Level 1 = escalated to L1 coordinator after 24h',
          'Level 2 = escalated to manager after 48h',
          'Level 3 = reaches founder after 72h',
        ],
      },
    ],
  },
  {
    section: 'Demo team',
    entries: [
      {
        title: 'Process a demo intake',
        keywords: ['demo', 'intake', 'raw leads', 'demo time', 'sale closing'],
        roles: ['demo_lead', 'demo_intake'],
        steps: [
          'Go to Demo intake',
          'New leads appear here from the raw leads inbox',
          'Review the lead, set a demo time, assign a trainer',
          'After the demo, mark it done — it moves to Sale closing',
        ],
      },
      {
        title: 'Flag a call for demo team',
        keywords: ['flag', 'flag call', 'demo team', 'follow up', 'my calls'],
        roles: ['founder', 'manager', 'lead', 'account_manager'],
        steps: [
          'In My calls & sessions, find the call',
          "Click 'Flag for demo team'",
          'The demo lead is notified to follow up',
        ],
      },
    ],
  },
  {
    section: 'Admin',
    entries: [
      {
        title: 'Manage team members',
        keywords: ['team admin', 'add user', 'roles', 'deactivate', 'permissions', 'settings'],
        roles: ['founder', 'manager'],
        steps: [
          'Go to Settings → Team admin',
          'Add users with name, email, password, and role',
          'Roles control what pages each person can access',
          'Deactivate users who leave — they lose portal access immediately',
        ],
      },
      {
        title: 'Feature flags',
        keywords: ['feature flags', 'toggle', 'features', 'deploy', 'settings'],
        roles: ['founder'],
        steps: [
          'Go to Settings → Feature flags',
          'Toggle features on/off without deploying code',
          'Changes take effect immediately for all users',
        ],
      },
    ],
  },
];

function matchesSearch(entry: GuideEntry, query: string): boolean {
  const q = query.toLowerCase();
  if (entry.title.toLowerCase().includes(q)) return true;
  if (entry.keywords.some((k) => k.toLowerCase().includes(q))) return true;
  if (entry.steps.some((s) => s.toLowerCase().includes(q))) return true;
  return false;
}

function GuideItem({ entry }: { entry: GuideEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        borderRadius: '8px',
        border: '1px solid var(--brand-borderSoft)',
        overflow: 'hidden',
        marginBottom: '6px',
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors"
        style={{
          background: expanded ? 'color-mix(in srgb, var(--bg-input) 80%, transparent)' : 'var(--bg-card)',
          color: 'var(--brand-text)',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 500 }}>{entry.title}</span>
        {expanded ? <ChevronDown size={14} style={{ color: 'var(--brand-textMuted)', flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: 'var(--brand-textMuted)', flexShrink: 0 }} />}
      </button>
      {expanded && (
        <div style={{ padding: '4px 12px 12px', background: 'var(--bg-card)' }}>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, counterReset: 'step-counter' }}>
            {entry.steps.map((step, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  gap: '10px',
                  padding: '4px 0',
                  fontSize: '13px',
                  color: 'var(--brand-textSecondary)',
                  lineHeight: '1.5',
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: 'color-mix(in srgb, var(--accent-gold) 20%, transparent)',
                    color: 'var(--accent-gold)',
                    fontSize: '10px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: '2px',
                  }}
                >
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {entry.tip && (
            <div
              style={{
                marginTop: '10px',
                padding: '8px 10px',
                borderRadius: '6px',
                background: 'color-mix(in srgb, #f59e0b 12%, transparent)',
                border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)',
                fontSize: '12px',
                color: 'color-mix(in srgb, #f59e0b 90%, var(--brand-text))',
                lineHeight: '1.5',
              }}
            >
              <span style={{ fontWeight: 600 }}>Tip: </span>{entry.tip}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const user = useAuth((s) => s.user);
  const userRole = user?.role ?? '';

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('mits:open-help', handler);
    return () => window.removeEventListener('mits:open-help', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filteredSections = GUIDES.map((section) => ({
    ...section,
    entries: section.entries.filter((entry) => {
      const roleMatch = entry.roles.length === 0 || entry.roles.includes(userRole);
      if (!roleMatch) return false;
      if (!search.trim()) return true;
      return matchesSearch(entry, search.trim());
    }),
  })).filter((s) => s.entries.length > 0);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 1000,
          animation: 'fadeIn 200ms ease',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(420px, 100vw)',
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--brand-border)',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInFromRight 280ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 16px 12px',
            borderBottom: '1px solid var(--brand-borderSoft)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--brand-text)' }}>Help &amp; guides</span>
          <button
            onClick={() => setOpen(false)}
            style={{
              padding: '4px',
              borderRadius: '6px',
              color: 'var(--brand-textMuted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close help panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={13}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--brand-textMuted)',
                pointerEvents: 'none',
              }}
            />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search guides…"
              style={{
                width: '100%',
                paddingLeft: '32px',
                paddingRight: '12px',
                paddingTop: '8px',
                paddingBottom: '8px',
                borderRadius: '8px',
                background: 'var(--bg-input)',
                border: '1px solid var(--brand-borderSoft)',
                color: 'var(--brand-text)',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Guide list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px' }}>
          {filteredSections.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 0',
                color: 'var(--brand-textMuted)',
                fontSize: '13px',
              }}
            >
              No guides match "{search}"
            </div>
          )}
          {filteredSections.map((section) => (
            <div key={section.section} style={{ marginBottom: '16px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--brand-textMuted)',
                  marginBottom: '6px',
                  paddingLeft: '2px',
                }}
              >
                {section.section}
              </div>
              {section.entries.map((entry) => (
                <GuideItem key={entry.title} entry={entry} />
              ))}
            </div>
          ))}
        </div>

        {/* Footer — Report bug */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--brand-borderSoft)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent('mits:open-bug-report'));
            }}
            style={{
              width: '100%',
              padding: '9px 0',
              borderRadius: '8px',
              background: 'transparent',
              border: '1px solid var(--accent-gold)',
              color: 'var(--accent-gold)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>🐛</span>
            <span>Report a bug</span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInFromRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
