import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { Avatar } from '@/components/ui/avatar';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/hooks/useFeatures';
import {
  Home, ArrowRightLeft, AlertCircle, Target, MessageSquare, ShieldCheck, Video,
  Briefcase, UserSearch, UserCog, FileCheck, DollarSign, LayoutGrid, Users, RefreshCw,
  MessageCircle, Building, ClipboardList, Wallet, Archive, CheckSquare, Clock, Receipt,
  Notebook, ChartLine, Upload, Inbox, Edit, UsersRound, Mail, Tag, LockKeyhole,
  Building2, History, Settings, LogOut, Moon, Calendar,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  section: string;
  page: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
  /** If set, the entry is only shown when the corresponding feature flag is on. */
  feature?: 'regularCalls';
}

const NAV: NavItem[] = [
  { section: 'overview', page: '/', label: 'Home', icon: Home, roles: ['founder', 'manager', 'demo_lead'] },
  { section: 'overview', page: '/money-flow', label: 'Money flow', icon: ArrowRightLeft, roles: ['founder', 'manager', 'accounts'] },
  { section: 'overview', page: '/vaibhav-queue', label: 'Vaibhav queue', icon: AlertCircle, roles: ['founder', 'manager', 'accounts'] },
  { section: 'overview', page: '/pipeline', label: 'Pipeline overview', icon: Target, roles: ['founder', 'manager', 'demo_lead'] },
  { section: 'overview', page: '/reports/demo-team', label: 'Demo team report', icon: ChartLine, roles: ['founder', 'demo_lead'] },

  { section: 'intake', page: '/demo-intake', label: 'Demo intake', icon: MessageSquare, roles: ['founder', 'manager', 'demo_lead', 'demo_intake'] },
  { section: 'intake', page: '/verifications', label: 'Verifications', icon: ShieldCheck, roles: ['founder', 'manager', 'demo_lead', 'demo_intake'] },
  { section: 'intake', page: '/demos', label: 'Demo schedule', icon: Video, roles: ['founder', 'manager', 'demo_lead', 'demo_intake'] },
  { section: 'intake', page: '/feedback-pending', label: 'Feedback queue (Samita)', icon: MessageCircle, roles: ['founder', 'manager', 'demo_lead'] },

  { section: 'recruit', page: '/sourcing', label: 'Sourcing requests', icon: Briefcase, roles: ['founder', 'manager', 'recruiter'] },
  // Trainer leads is deprecated for recruiters — the Trainer pool now lets them
  // add a new trainer directly from the proposal flow. Keep for founder only as a sourcing journal.
  { section: 'recruit', page: '/trainer-leads', label: 'Trainer leads (admin)', icon: UserSearch, roles: ['founder'] },
  { section: 'recruit', page: '/trainers', label: 'Trainer pool', icon: UserCog, roles: ['founder', 'manager', 'lead', 'demo_lead', 'demo_intake', 'recruiter', 'payment_processor'] },

  { section: 'sales', page: '/sales-closing', label: 'Sales closing', icon: FileCheck, roles: ['founder', 'manager', 'sales_closer'] },
  { section: 'sales', page: '/roshni/follow-ups', label: 'My follow-ups', icon: Clock, roles: ['founder', 'manager', 'sales_closer'] },
  { section: 'sales', page: '/fresh-payments', label: 'Fresh payments', icon: DollarSign, roles: ['founder', 'manager', 'sales_closer', 'accounts'] },

  { section: 'clients', page: '/follow-up-payments', label: 'Payment follow-up', icon: Receipt, roles: ['founder', 'manager', 'lead', 'accounts'] },
  { section: 'clients', page: '/calendar', label: 'Work calendar', icon: LayoutGrid, roles: ['founder', 'manager', 'lead', 'staff'] },
  { section: 'clients', page: '/clients', label: 'Clients', icon: Users, roles: ['founder', 'manager', 'lead', 'sales_closer', 'accounts', 'demo_lead', 'demo_intake', 'account_manager'] },
  { section: 'clients', page: '/renewals', label: 'Renewals', icon: RefreshCw, roles: ['founder', 'manager'] },
  { section: 'clients', page: '/dormant',  label: 'Dormant clients', icon: Moon, roles: ['founder', 'manager', 'demo_lead', 'demo_intake', 'sales_closer'] },
  { section: 'clients', page: '/hold',     label: 'On Hold · follow-ups', icon: Clock, roles: ['founder', 'manager', 'demo_lead', 'sales_closer'] },
  { section: 'clients', page: '/feedback', label: 'Feedback', icon: MessageCircle, roles: ['founder', 'manager', 'lead'] },
  { section: 'partners', page: '/partners', label: 'Partners', icon: Building, roles: ['founder', 'manager', 'sales_closer', 'accounts'] },

  { section: 'work',       page: '/my-sessions',  label: 'My sessions', icon: ClipboardList, roles: ['founder', 'manager', 'lead', 'account_manager'] },
  { section: 'work',       page: '/regular-trainings', label: 'Regular trainings', icon: Video, roles: ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'], feature: 'regularCalls' },
  { section: 'trainerOps', page: '/session-logs', label: 'Session logs', icon: ClipboardList, roles: ['founder', 'manager', 'lead', 'accounts', 'payment_processor'] },
  { section: 'trainerOps', page: '/trainer-pay', label: 'Trainer payouts', icon: Wallet, roles: ['founder', 'manager', 'lead', 'accounts', 'payment_processor'] },
  { section: 'trainerOps', page: '/payout-batches', label: 'Payout batches', icon: Archive, roles: ['founder', 'manager', 'accounts', 'payment_processor', 'demo_lead'] },

  { section: 'work', page: '/tasks', label: 'My tasks', icon: CheckSquare, roles: ['founder', 'manager', 'lead', 'staff', 'accounts', 'sales_closer', 'demo_lead', 'demo_intake', 'recruiter', 'payment_processor'] },
  { section: 'work', page: '/leverage', label: 'Leverage', icon: Clock, roles: ['founder', 'manager'] },
  { section: 'work', page: '/accounts-queue', label: 'Accounts queue', icon: Receipt, roles: ['founder', 'manager', 'accounts'] },
  { section: 'work', page: '/daily-report', label: 'Daily report', icon: Notebook, roles: ['founder', 'manager', 'demo_lead', 'demo_intake', 'recruiter', 'sales_closer', 'accounts', 'payment_processor', 'lead', 'staff'] },
  { section: 'work', page: '/my-calendar', label: 'My calendar', icon: Calendar, roles: ['founder', 'manager', 'demo_lead', 'demo_intake', 'recruiter', 'sales_closer', 'accounts', 'payment_processor', 'lead', 'staff'] },

  { section: 'admin', page: '/reports-dashboard', label: 'Reports dashboard', icon: ChartLine, roles: ['founder', 'demo_lead', 'manager'] },
  { section: 'admin', page: '/bulk-upload', label: 'Bulk upload', icon: Upload, roles: ['founder', 'demo_lead', 'manager'] },
  { section: 'admin', page: '/raw-leads', label: 'Raw leads inbox', icon: Inbox, roles: ['founder', 'demo_lead', 'manager', 'demo_intake'] },
  { section: 'admin', page: '/edit-requests', label: 'Edit requests', icon: Edit, roles: ['founder', 'demo_lead', 'manager'] },
  { section: 'admin', page: '/team', label: 'Team', icon: UsersRound, roles: ['founder'] },
  { section: 'admin', page: '/templates', label: 'Email templates', icon: Mail, roles: ['founder', 'demo_lead', 'manager', 'sales_closer'] },
  { section: 'admin', page: '/sources', label: 'Lead sources', icon: Tag, roles: ['founder', 'demo_lead'] },
  { section: 'admin', page: '/permissions', label: 'Edit permissions', icon: LockKeyhole, roles: ['founder'] },
  { section: 'admin', page: '/banks', label: 'Bank accounts', icon: Building2, roles: ['founder', 'accounts'] },
  { section: 'admin', page: '/audit', label: 'Audit log', icon: History, roles: ['founder'] },
  { section: 'admin', page: '/settings', label: 'Settings', icon: Settings, roles: ['founder', 'manager', 'demo_lead', 'demo_intake', 'recruiter', 'sales_closer', 'accounts', 'payment_processor', 'lead', 'staff'] },
];

const SECTIONS: Record<string, string> = {
  overview: 'Overview',
  intake: 'Demo intake · Team 2',
  recruit: 'Recruiters · Team 1',
  sales: 'Sales close',
  clients: 'Client success',
  partners: 'Partners',
  trainerOps: 'Trainer ops',
  work: 'My work',
  admin: 'Admin',
};

export function Sidebar({ mobileOpen = false, onMobileClose }: { mobileOpen?: boolean; onMobileClose?: () => void } = {}) {
  const user = useAuth((s) => s.user);
  const features = useFeatures();
  const logout = useAuth((s) => s.logout);
  const location = useLocation();

  const { data: metrics } = useQuery({
    queryKey: ['nav-badges'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const weekOut = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
      const [home, sourcing, leverage, editReqs, clients] = await Promise.all([
        api.get('/metrics/home').then((r) => r.data),
        api.get('/sourcing').then((r) => r.data),
        api.get('/leverage', { params: { status: 'PendingVaibhav' } }).then((r) => r.data),
        api.get('/edit-requests').then((r) => r.data),
        api.get('/clients').then((r) => r.data),
      ]);
      const cl = (clients || []) as any[];
      const dormantOverdue = cl.filter((c) => c.lifecycle === 'Dormant' && c.dormantCheckBackOn && c.dormantCheckBackOn <= today).length;
      const holdDue       = cl.filter((c) => c.lifecycle === 'Hold' && c.holdCheckBackOn && c.holdCheckBackOn <= today).length;
      // Demo Intake: clients still in Anjali/Taran's hands BEFORE recruiters take over.
      const demoIntakePending = cl.filter((c) => ['Lead', 'IntakeSent'].includes(c.lifecycle)).length;
      // Demo schedule: upcoming or today's scheduled demos.
      const demosToday = cl.filter((c) => c.lifecycle === 'DemoScheduled' && c.demoDate && c.demoDate <= weekOut).length;
      // Feedback queue (Samita): demos done, awaiting feedback / disposition.
      const feedbackPending = cl.filter((c) => ['DemoDone', 'FeedbackPending'].includes(c.lifecycle)).length;
      // Sales closing (Roshni's primary list): SaleClosing/SaleWon still in her hands
      // (RP / CP / no-status). Terminal outcomes drop out automatically.
      const salesClosingActive = cl.filter((c) =>
        ['SaleClosing', 'SaleWon'].includes(c.lifecycle)
        && (c.saleClosingSubStatus === null || c.saleClosingSubStatus === 'RP' || c.saleClosingSubStatus === 'CP'),
      ).length;
      // My follow-ups (Roshni): overdue or due today calls.
      const followUpsDue = cl.filter((c) =>
        ['SaleClosing', 'SaleWon'].includes(c.lifecycle)
        && (c.saleClosingSubStatus === 'RP' || c.saleClosingSubStatus === 'CP')
        && c.roshniNextCallOn && c.roshniNextCallOn <= today,
      ).length;
      // Renewals approaching — active clients whose renewal date is within 7 days or already past.
      const renewalsDue = cl.filter((c) =>
        ['Active', 'LeverageGranted'].includes(c.lifecycle)
        && c.nextRenewalDue && c.nextRenewalDue <= weekOut,
      ).length;
      // Payment follow-up (Mitali): Active/LeverageGranted/SaleWon clients
      // flagged pending-Vaibhav OR active. Cheap proxy without round-tripping
      // the follow-up endpoint — counts active clients overall.
      const followUpActiveTotal = cl.filter((c) =>
        ['Active', 'LeverageGranted', 'SaleWon'].includes(c.lifecycle),
      ).length;
      return {
        pendingVaibhav: home.ops.pendingVaibhav,
        pendingLeverage: leverage.length,
        sourcingOpen: sourcing.filter((s: any) => s.status === 'Open').length,
        verPending: sourcing.filter((s: any) => s.status === 'Proposed').length,
        editReqPending: editReqs.filter((r: any) => r.status === 'Pending').length,
        dormantOverdue,
        holdDue,
        demoIntakePending,
        demosToday,
        feedbackPending,
        salesClosingActive,
        followUpsDue,
        renewalsDue,
        followUpActiveTotal,
      };
    },
    // 3 min — badges are advisory, no need to hammer the server every 30s.
    // Counts also refresh via React Query's invalidateQueries on relevant mutations.
    refetchInterval: 180_000,
    staleTime: 60_000,
    enabled: !!user,
  });

  if (!user) return null;

  const filtered = NAV.filter((n) => n.roles.includes(user.role) && (!n.feature || features[n.feature]));
  const grouped: Record<string, NavItem[]> = {};
  filtered.forEach((n) => {
    (grouped[n.section] = grouped[n.section] || []).push(n);
  });

  const badge = (page: string) => {
    if (!metrics) return 0;
    // Existing badges
    if (page === '/leverage') return metrics.pendingLeverage;
    if (page === '/vaibhav-queue') return metrics.pendingVaibhav;
    if (page === '/sourcing') return metrics.sourcingOpen;
    if (page === '/verifications') return metrics.verPending;
    if (page === '/edit-requests') return metrics.editReqPending;
    if (page === '/dormant') return metrics.dormantOverdue;
    if (page === '/hold') return metrics.holdDue;
    // Newly added — pending counts across the rest of the nav so every user
    // can see "what's on my plate" at a glance.
    if (page === '/demo-intake') return metrics.demoIntakePending;
    if (page === '/demo-schedule') return metrics.demosToday;
    if (page === '/feedback-queue') return metrics.feedbackPending;
    if (page === '/sales-closing') return metrics.salesClosingActive;
    if (page === '/roshni/follow-ups') return metrics.followUpsDue;
    if (page === '/renewals') return metrics.renewalsDue;
    if (page === '/follow-up-payments') return metrics.followUpActiveTotal;
    return 0;
  };

  return (
    <>
      {/* Mobile backdrop — only renders when the off-canvas sidebar is open. */}
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          className="md:hidden fixed inset-0 z-30"
          style={{
            background: 'rgba(10,12,18,0.55)',
            backdropFilter: 'blur(4px)',
            animation: 'fadeIn 200ms ease-out both',
          }}
        />
      )}
    <aside
      className={`w-60 border-r py-4 flex flex-col h-screen flex-shrink-0 overflow-y-auto z-40 transition-transform md:transition-none
        fixed md:sticky top-0 left-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}
      style={{
        background:
          'radial-gradient(600px 200px at 0% 0%, rgba(229,178,76,0.04), transparent 50%), ' +
          'linear-gradient(180deg, var(--bg-sidebar) 0%, color-mix(in srgb, var(--bg-sidebar) 92%, #000) 100%)',
        borderColor: 'rgba(255,255,255,0.06)',
        color: '#E8E2D3',
        transitionDuration: '280ms',
        transitionTimingFunction: 'cubic-bezier(0.2, 0.9, 0.25, 1)',
        boxShadow: '4px 0 24px rgba(0,0,0,0.30)',
      }}
    >
      {/* Brand header — clean MITS wordmark + thin gold rule underneath */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform hover:rotate-3"
            style={{
              background: 'linear-gradient(135deg, #FAF5E7 0%, #E8DEC2 50%, #D4B98C 100%)',
              boxShadow: '0 2px 10px rgba(229,178,76,0.20), inset 0 1px 0 rgba(255,255,255,0.40)',
              color: '#0F1115',
            }}
          >
            {/* SVG uses currentColor → renders dark on the cream tile */}
            <img src="/mits-logo.svg" alt="MITS" className="w-8 h-8" style={{ filter: 'none' }} />
          </div>
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'rgba(229,178,76,0.85)' }}>
              Consulting Hub
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: 'rgba(232,226,211,0.62)' }}>
              by MITS
            </div>
          </div>
        </div>
        <div
          className="mt-3 h-px"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(229,178,76,0.40) 50%, transparent 100%)' }}
        />
      </div>

      {Object.keys(SECTIONS).map((k) =>
        grouped[k] ? (
          <div key={k} className="mb-1">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.14em] px-4 pt-3 pb-1.5 flex items-center gap-2"
              style={{ color: 'rgba(245,239,224,0.45)' }}
            >
              <span
                className="inline-block w-1 h-1 rounded-full"
                style={{ background: 'var(--accent-gold)', opacity: 0.6 }}
              />
              {SECTIONS[k]}
            </div>
            {grouped[k].map((n) => {
              const Icon = n.icon;
              const b = badge(n.page);
              const isActive =
                n.page === '/' ? location.pathname === '/' : location.pathname.startsWith(n.page);
              return (
                <NavLink
                  key={n.page}
                  to={n.page}
                  onClick={() => onMobileClose?.()}
                  className="flex items-center gap-2.5 px-4 py-2 text-[13px] cursor-pointer relative group"
                  style={{
                    color: isActive ? '#FAF5E7' : 'rgba(232,226,211,0.78)',
                    background: isActive
                      ? 'linear-gradient(90deg, rgba(229,178,76,0.18) 0%, rgba(229,178,76,0.04) 100%)'
                      : 'transparent',
                    transition: 'background-color 150ms ease, color 150ms ease, padding-left 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                      e.currentTarget.style.color = '#FAF5E7';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'rgba(232,226,211,0.78)';
                    }
                  }}
                >
                  {/* Gold left accent bar — only on active item */}
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full"
                      style={{
                        background: 'linear-gradient(180deg, var(--accent-gold) 0%, var(--accent-goldDeep) 100%)',
                        boxShadow: '0 0 8px rgba(229,178,76,0.5)',
                      }}
                    />
                  )}
                  <span className="w-[18px] text-center flex-shrink-0">
                    <Icon size={14} />
                  </span>
                  <span className="flex-1 truncate">{n.label}</span>
                  {b > 0 && (
                    <span
                      className="ml-auto text-[10px] px-1.5 py-px rounded-full font-bold leading-none min-w-[18px] text-center"
                      style={
                        n.page === '/verifications'
                          ? { background: 'var(--status-red)', color: 'white', boxShadow: '0 1px 3px rgba(239,68,68,0.35)' }
                          : { background: 'var(--accent-gold)', color: '#0F1115', boxShadow: '0 1px 3px rgba(229,178,76,0.35)' }
                      }
                    >
                      {b}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ) : null,
      )}

      <div
        className="mt-auto mx-3 mt-3 px-2.5 py-2.5 rounded-lg flex items-center gap-2.5"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Avatar name={user.name} ring />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px] truncate" style={{ color: '#F5EFE0' }}>{user.name}</div>
          <div className="text-[10.5px] uppercase tracking-[0.10em]" style={{ color: 'rgba(229,178,76,0.75)' }}>
            {user.role.replace(/_/g, ' ')}
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="p-1.5 rounded transition-colors"
          style={{ color: 'rgba(232,226,211,0.55)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--status-red)'; e.currentTarget.style.background = 'rgba(239,68,68,0.10)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(232,226,211,0.55)'; e.currentTarget.style.background = 'transparent'; }}
          title="Logout"
        >
          <LogOut size={14} />
        </button>
      </div>
    </aside>
    </>
  );
}
