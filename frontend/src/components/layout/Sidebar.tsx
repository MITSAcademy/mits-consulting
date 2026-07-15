import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { Avatar } from '@/components/ui/avatar';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/hooks/useFeatures';
import { useState, useEffect } from 'react';
import {
  Home, ArrowRightLeft, AlertCircle, Target, MessageSquare, ShieldCheck, Video,
  Briefcase, UserSearch, UserCog, FileCheck, DollarSign, LayoutGrid, Users, RefreshCw,
  MessageCircle, Building, ClipboardList, Wallet, Archive, CheckSquare, Clock, Receipt,
  Notebook, ChartLine, Upload, Inbox, Edit, UsersRound, Mail, Tag, LockKeyhole,
  Building2, History, Settings, LogOut, Moon, Calendar, ChevronsLeft, ChevronsRight,
  TableProperties, CalendarDays, AlertTriangle, Link, BarChart2, BarChart3, ToggleRight,
  Sparkles, X, Bug, Handshake,
  type LucideIcon,
} from 'lucide-react';

/* ── What's New changelog entries — newest first ─────────────────────────── */
const CHANGELOG = [
  { date: 'Jul 12', text: 'Duplicate client/trainer prevention — 409 warning on create' },
  { date: 'Jul 12', text: 'RBAC health check — 403 errors now tracked in Admin panel' },
  { date: 'Jul 12', text: 'Toast queue — up to 4 alerts stack, now with info/warning types' },
  { date: 'Jul 11', text: 'Session Logs: inline delete confirm, pagination, loading skeleton' },
  { date: 'Jul 11', text: 'Homepage KPIs: sparklines, number counter, click-through drill-downs' },
  { date: 'Jul 11', text: 'Button loading spinner — see progress on every save action' },
  { date: 'Jul 10', text: 'Feedback sheet: week navigator, read-only history, loading state' },
  { date: 'Jul 10', text: 'Freelance Requirements: unlimited trainer proposals per requirement' },
  { date: 'Jul 10', text: 'Direct stage change to JBT/Training Employer Pays Later from RP/CP' },
];

const CHANGELOG_KEY = 'mits_changelog_seen';

function WhatsNew({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(CHANGELOG_KEY);
    setHasNew(seen !== CHANGELOG[0].date + CHANGELOG[0].text);
  }, []);

  function markSeen() {
    localStorage.setItem(CHANGELOG_KEY, CHANGELOG[0].date + CHANGELOG[0].text);
    setHasNew(false);
  }

  if (collapsed) return null;

  return (
    <div className="mx-2 mb-2 flex-shrink-0">
      <button
        onClick={() => { setOpen((o) => !o); if (!open) markSeen(); }}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
        style={{
          background: open ? 'rgba(229,178,76,0.12)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${open ? 'rgba(229,178,76,0.25)' : 'rgba(255,255,255,0.07)'}`,
          color: 'rgba(232,226,211,0.75)',
        }}
      >
        <Sparkles size={12} style={{ color: hasNew ? '#E5B24C' : 'rgba(229,178,76,0.5)', flexShrink: 0 }} />
        <span className="flex-1 text-left">What's new</span>
        {hasNew && (
          <span
            className="text-[9px] px-1.5 py-px rounded-full font-bold"
            style={{ background: '#E5B24C', color: '#0F1115' }}
          >
            NEW
          </span>
        )}
      </button>
      {open && (
        <div
          className="mt-1.5 rounded-lg overflow-hidden"
          style={{
            background: 'rgba(8,9,15,0.8)',
            border: '1px solid rgba(229,178,76,0.18)',
            animation: 'fadeUp 180ms cubic-bezier(0.2,0.9,0.25,1) both',
          }}
        >
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(229,178,76,0.1)' }}>
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: 'rgba(229,178,76,0.7)' }}>Recent updates</span>
            <button onClick={() => setOpen(false)} style={{ color: 'rgba(232,226,211,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <X size={11} />
            </button>
          </div>
          <div className="py-1" style={{ maxHeight: 220, overflowY: 'auto' }}>
            {CHANGELOG.map((entry, i) => (
              <div key={i} className="flex gap-2 px-3 py-1.5" style={{ borderBottom: i < CHANGELOG.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <span className="text-[9px] font-bold flex-shrink-0 mt-0.5" style={{ color: 'rgba(229,178,76,0.55)', minWidth: 36 }}>{entry.date}</span>
                <span className="text-[11px] leading-snug" style={{ color: 'rgba(232,226,211,0.65)' }}>{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface NavItem {
  section: string;
  page: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
  feature?: 'regularCalls';
}

// Role notes:
//   founder    — unrestricted
//   demo_lead  — Samita: demo ops only
//   demo_intake — Anjali/Taran: intake + demos
//   recruiter  — trainer sourcing only
//   sales_closer — Roshni: sales pipeline
//   accounts   — Areena/Ashok: payments/payouts
//   payment_processor — Malika: trainer pay sheet
//   account_manager — Muskan/Kashish: own Active clients + trainer ops + sessions + feedback
//   lead       — Bhavneet: senior AM; own+team clients, sessions, trainer payout batches, allocates calls, L1 escalation
//   manager    — Mitali: team oversight, client payment follow-up, team dashboard, no trainer ops
const NAV: NavItem[] = [
  // ── Overview (founder + Samita demo ops) ──────────────────────────────
  { section: 'overview', page: '/', label: 'Home', icon: Home, roles: ['founder', 'demo_lead'] },
  { section: 'overview', page: '/money-flow', label: 'Money flow', icon: ArrowRightLeft, roles: ['founder', 'accounts'] },
  { section: 'overview', page: '/finance', label: 'Finance dashboard', icon: BarChart3, roles: ['founder'] },
  { section: 'overview', page: '/vaibhav-queue', label: 'Vaibhav queue', icon: AlertCircle, roles: ['founder', 'accounts'] },
  { section: 'overview', page: '/pipeline', label: 'Pipeline overview', icon: Target, roles: ['founder', 'demo_lead'] },
  { section: 'overview', page: '/reports/demo-team', label: 'Demo team report', icon: ChartLine, roles: ['founder', 'demo_lead'] },

  // ── Demo intake (Samita + intake team) ────────────────────────────────
  { section: 'intake', page: '/demo-intake', label: 'Demo intake', icon: MessageSquare, roles: ['founder', 'demo_lead', 'demo_intake'] },
  { section: 'intake', page: '/verifications', label: 'Verifications', icon: ShieldCheck, roles: ['founder', 'demo_lead', 'demo_intake'] },
  { section: 'intake', page: '/demos', label: 'Demo schedule', icon: Video, roles: ['founder', 'demo_lead', 'demo_intake'] },
  { section: 'intake', page: '/feedback-pending', label: 'Feedback queue (Samita)', icon: MessageCircle, roles: ['founder', 'demo_lead'] },

  // ── Recruiter / trainer sourcing ──────────────────────────────────────
  { section: 'recruit', page: '/demo-intake', label: 'Pipeline view', icon: LayoutGrid, roles: ['recruiter'] },
  { section: 'recruit', page: '/sourcing', label: 'Sourcing requests', icon: Briefcase, roles: ['founder', 'recruiter'] },
  { section: 'recruit', page: '/trainer-leads', label: 'Trainer leads (admin)', icon: UserSearch, roles: ['founder'] },
  // All trainers visible to those who work with them
  { section: 'recruit', page: '/trainers', label: 'Trainer pool', icon: UserCog, roles: ['founder', 'manager', 'lead', 'demo_lead', 'demo_intake', 'recruiter', 'payment_processor'] },

  // ── Sales pipeline (Roshni + founder) ────────────────────────────────
  { section: 'sales', page: '/sales-closing', label: 'My pipeline', icon: LayoutGrid, roles: ['founder', 'sales_closer'] },
  { section: 'sales', page: '/roshni/follow-ups', label: 'My follow-ups', icon: Clock, roles: ['founder', 'sales_closer'] },
  { section: 'sales', page: '/fresh-payments', label: 'Fresh payments', icon: DollarSign, roles: ['founder', 'sales_closer', 'accounts'] },

  // ── Client success (team-scoped for manager/lead/AM) ─────────────────
  // Payment follow-up: Mitali's primary job + accounts; Bhavneet needs it to export her team's payments
  { section: 'clients', page: '/follow-up-payments', label: 'Payment follow-up', icon: Receipt, roles: ['founder', 'manager', 'accounts', 'demo_lead'] },
  // Clients: scoped by backend per role (AM=own, lead=team, manager=team)
  { section: 'clients', page: '/clients', label: 'Clients', icon: Users, roles: ['founder', 'manager', 'lead', 'accounts', 'demo_lead', 'demo_intake', 'account_manager'] },
  // Hold: Mitali needs to see clients on hold (leverage / missed payments) within her team
  { section: 'clients', page: '/hold', label: 'On hold', icon: Clock, roles: ['founder', 'manager', 'demo_lead', 'sales_closer'] },
  { section: 'clients', page: '/trainers', label: 'My trainers', icon: UserCog, roles: ['account_manager'] },
  { section: 'clients', page: '/dormant', label: 'Dormant clients', icon: Moon, roles: ['founder', 'demo_lead', 'demo_intake', 'sales_closer'] },
  { section: 'clients', page: '/feedback', label: 'Feedback', icon: MessageCircle, roles: ['founder', 'manager', 'lead', 'account_manager'] },

  // ── Coordinator work (Mitali + Bhavneet + AMs) ───────────────────────
  { section: 'work', page: '/team-board', label: 'Client assignment', icon: UsersRound, roles: ['founder', 'manager', 'lead', 'account_manager'] },
  { section: 'work', page: '/coordinator-dashboard', label: 'Team dashboard', icon: UsersRound, roles: ['founder', 'manager', 'lead'] },
  { section: 'work', page: '/my-calendar', label: 'My calendar', icon: Calendar, roles: ['founder', 'manager', 'lead', 'account_manager', 'staff', 'sales_closer', 'demo_lead', 'demo_intake'] },
  { section: 'work', page: '/my-sessions', label: 'My calls & sessions', icon: ClipboardList, roles: ['founder', 'manager', 'lead', 'account_manager'] },
  { section: 'work', page: '/sessions', label: 'Team sessions', icon: CalendarDays, roles: ['founder', 'manager', 'lead'] },
  { section: 'work', page: '/issues', label: 'Issues & escalations', icon: AlertTriangle, roles: ['founder', 'manager', 'lead', 'account_manager', 'demo_lead', 'demo_intake'] },
  { section: 'work', page: '/freelance-requirements', label: 'Freelance Requirements', icon: Briefcase, roles: ['founder', 'manager', 'lead', 'account_manager', 'recruiter'] },
  { section: 'clients', page: '/regular-trainings', label: 'Regular trainings', icon: Video, roles: ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'], feature: 'regularCalls' },
  { section: 'clients', page: '/meeting-links', label: 'Meeting links', icon: Link, roles: ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'], feature: 'regularCalls' },

  // ── Trainer ops: Bhavneet (lead) + AMs log sessions; Bhavneet creates payout batches; Mitali approves ──
  { section: 'trainerOps', page: '/session-logs', label: 'Session logs', icon: ClipboardList, roles: ['founder', 'manager', 'lead', 'account_manager', 'accounts', 'payment_processor'] },
  // Payment sheet: Bhavneet validates and submits; payment_processor processes
  { section: 'trainerOps', page: '/trainer-pay-sheet', label: 'Payment sheet', icon: TableProperties, roles: ['founder', 'manager', 'lead', 'account_manager', 'accounts', 'payment_processor'] },
  { section: 'trainerOps', page: '/trainer-pay', label: 'Trainer payouts', icon: Wallet, roles: ['founder', 'accounts', 'payment_processor'] },
  // Payout batches: Bhavneet creates → Mitali approves → accounts/payment_processor process
  { section: 'trainerOps', page: '/payout-batches', label: 'Payout batches', icon: Archive, roles: ['founder', 'manager', 'lead', 'accounts', 'payment_processor'] },

  // ── My work (universal) ───────────────────────────────────────────────
  { section: 'work', page: '/tasks', label: 'My tasks', icon: CheckSquare, roles: ['founder', 'manager', 'lead', 'staff', 'accounts', 'sales_closer', 'demo_lead', 'demo_intake', 'recruiter', 'payment_processor', 'account_manager'] },
  { section: 'work', page: '/leverage', label: 'Leverage', icon: Clock, roles: ['founder', 'demo_lead'] },
  { section: 'work', page: '/accounts-queue', label: 'Accounts queue', icon: Receipt, roles: ['founder', 'accounts'] },
  { section: 'work', page: '/daily-report', label: 'Daily report', icon: Notebook, roles: ['founder', 'manager', 'lead', 'demo_lead', 'demo_intake', 'recruiter', 'sales_closer', 'accounts', 'payment_processor', 'staff', 'account_manager'] },
  { section: 'team', page: '/timesheet', label: 'My timesheet', icon: ClipboardList, roles: ['manager', 'lead', 'staff', 'accounts', 'demo_lead', 'demo_intake', 'recruiter', 'sales_closer', 'payment_processor', 'account_manager'] },
  { section: 'team', page: '/timesheet/report', label: 'Timesheet report', icon: BarChart2, roles: ['founder', 'manager', 'demo_lead'] },

  // ── Admin (Vaibhav + team leads for visibility) ───────────────────────
  { section: 'admin', page: '/reports/monthly', label: 'Monthly report', icon: BarChart3, roles: ['founder', 'manager', 'lead', 'account_manager'] },
  { section: 'admin', page: '/bulk-upload', label: 'Bulk upload', icon: Upload, roles: ['founder', 'demo_lead'] },
  { section: 'admin', page: '/raw-leads', label: 'Raw leads inbox', icon: Inbox, roles: ['founder', 'demo_lead', 'demo_intake'] },
  { section: 'admin', page: '/team', label: 'Team', icon: UsersRound, roles: ['founder'] },
  { section: 'admin', page: '/partners', label: 'Partners', icon: Handshake, roles: ['founder'] },
  { section: 'admin', page: '/templates', label: 'Email templates', icon: Mail, roles: ['founder', 'demo_lead'] },
  { section: 'admin', page: '/sources', label: 'Lead sources', icon: Tag, roles: ['founder', 'demo_lead'] },
  { section: 'admin', page: '/feature-flags', label: 'Feature flags', icon: ToggleRight, roles: ['founder'] },
  { section: 'admin', page: '/permissions', label: 'Edit permissions', icon: LockKeyhole, roles: ['founder'] },
  { section: 'admin', page: '/role-permissions', label: 'Role permissions', icon: ShieldCheck, roles: ['founder'] },
  { section: 'admin', page: '/banks', label: 'Bank accounts', icon: Building2, roles: ['founder', 'accounts'] },
  { section: 'admin', page: '/audit', label: 'Activity log', icon: History, roles: ['founder', 'manager'] },
  { section: 'admin', page: '/settings', label: 'Settings', icon: Settings, roles: ['founder', 'manager', 'lead', 'demo_lead', 'demo_intake', 'recruiter', 'sales_closer', 'accounts', 'payment_processor', 'staff', 'account_manager'] },
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
  team: 'Timesheet',
  admin: 'Admin',
};

export function Sidebar({ mobileOpen = false, onMobileClose }: { mobileOpen?: boolean; onMobileClose?: () => void } = {}) {
  const user = useAuth((s) => s.user);
  const realUser = useAuth((s) => s.realUser);
  const impersonate = useAuth((s) => s.impersonate);
  const exitImpersonation = useAuth((s) => s.exitImpersonation);
  const features = useFeatures();
  const logout = useAuth((s) => s.logout);
  const location = useLocation();

  const { data: allUsers } = useQuery({
    queryKey: ['auth-users'],
    queryFn: () => api.get('/auth/users').then((r) => r.data),
    enabled: !!user && (realUser ? realUser.role === 'founder' : user?.role === 'founder'),
    staleTime: 300_000,
  });
  const isImpersonating = !!realUser;

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('sidebar-collapsed', String(collapsed)); } catch {}
  }, [collapsed]);

  const { data: metrics } = useQuery({
    queryKey: ['nav-badges'],
    queryFn: () => api.get('/metrics/nav-badges').then((r) => r.data),
    refetchInterval: 10 * 60_000,  // 10 min — counts don't change that fast
    staleTime: 10 * 60_000,
    enabled: !!user,
  });

  if (!user) return null;

  const filtered = NAV.filter((n) => n.roles.includes(user.role) && (!n.feature || features[n.feature]));
  const grouped: Record<string, NavItem[]> = {};
  filtered.forEach((n) => { (grouped[n.section] = grouped[n.section] || []).push(n); });

  const badge = (page: string) => {
    if (!metrics) return 0;
    if (page === '/leverage') return metrics.pendingLeverage;
    if (page === '/vaibhav-queue') return metrics.pendingVaibhav;
    if (page === '/sourcing') return metrics.sourcingOpen;
    if (page === '/verifications') return metrics.verPending;
    if (page === '/dormant') return metrics.dormantOverdue;
    if (page === '/hold') return metrics.holdDue;
    if (page === '/demo-intake') return metrics.demoIntakePending;
    if (page === '/demo-schedule') return metrics.demosToday;
    if (page === '/feedback-queue') return metrics.feedbackPending;
    if (page === '/sales-closing') return metrics.salesClosingActive;
    if (page === '/roshni/follow-ups') return metrics.followUpsDue;
    if (page === '/renewals') return metrics.renewalsDue;
    if (page === '/follow-up-payments') return metrics.followUpActiveTotal;
    if (page === '/issues') return metrics.escalationCount || 0;
    return 0;
  };

  const sidebarWidth = collapsed ? 56 : 240;

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          className="md:hidden fixed inset-0 z-30"
          style={{ background: 'rgba(10,12,18,0.55)', backdropFilter: 'blur(4px)', animation: 'fadeIn 200ms ease-out both' }}
        />
      )}
      <aside
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          background:
            'radial-gradient(500px 180px at 50% 0%, rgba(232,184,75,0.07), transparent 55%), ' +
            'radial-gradient(400px 300px at 100% 100%, rgba(92,143,240,0.04), transparent 55%), ' +
            'linear-gradient(180deg, #07080C 0%, #050608 100%)',
          borderColor: 'rgba(255,255,255,0.07)',
          color: '#EBE4D5',
          transition: 'width 220ms cubic-bezier(0.2,0.9,0.25,1), min-width 220ms cubic-bezier(0.2,0.9,0.25,1)',
          boxShadow: '4px 0 32px rgba(0,0,0,0.40), 1px 0 0 rgba(255,255,255,0.04)',
          transitionDuration: '280ms',
          transitionTimingFunction: 'cubic-bezier(0.2, 0.9, 0.25, 1)',
        }}
        className={`border-r py-4 flex flex-col h-screen flex-shrink-0 overflow-y-auto overflow-x-hidden z-40
          fixed md:sticky top-0 left-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Brand header */}
        <div className="pb-3 flex-shrink-0" style={{ padding: collapsed ? '0 8px 12px' : '0 12px 12px' }}>
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform hover:rotate-3"
              style={{
                background: 'linear-gradient(145deg, #FDF6E3 0%, #ECD89A 45%, #C8961C 100%)',
                boxShadow: '0 2px 14px rgba(232,184,75,0.35), inset 0 1px 0 rgba(255,255,255,0.50), 0 0 0 1px rgba(232,184,75,0.25)',
                color: '#0F1115',
              }}
            >
              <img src="/mits-logo.svg" alt="MITS" className="w-6 h-6" style={{ filter: 'none' }} />
            </div>
            {!collapsed && (
              <div className="leading-tight overflow-hidden flex-1">
                <div className="text-[10px] uppercase tracking-[0.14em] whitespace-nowrap" style={{ color: 'rgba(229,178,76,0.85)' }}>
                  Consulting Hub
                </div>
                <div className="text-[12px] mt-0.5 whitespace-nowrap" style={{ color: 'rgba(232,226,211,0.62)' }}>
                  by MITS
                </div>
              </div>
            )}
          </div>
          {/* Collapse toggle — always visible on desktop */}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="hidden md:flex items-center justify-center w-full mt-2 py-1.5 rounded-lg transition-colors"
            style={{
              color: 'rgba(229,178,76,0.9)',
              background: 'rgba(229,178,76,0.10)',
              border: '1px solid rgba(229,178,76,0.20)',
              gap: 6,
              fontSize: 11,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(229,178,76,0.20)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(229,178,76,0.10)'; }}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight size={13} /> : <><ChevronsLeft size={13} /><span>Collapse</span></>}
          </button>
          {!collapsed && (
            <div
              className="mt-2 h-px"
              style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(229,178,76,0.40) 50%, transparent 100%)' }}
            />
          )}
        </div>

        {/* Nav items */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {Object.keys(SECTIONS).map((k) =>
            grouped[k] ? (
              <div key={k} className="mb-1">
                {!collapsed && (
                  <div
                    className="text-[10px] font-bold uppercase tracking-[0.14em] px-3 pt-3 pb-1.5 flex items-center gap-2"
                    style={{ color: 'rgba(245,239,224,0.45)' }}
                  >
                    <span className="inline-block w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--accent-gold)', opacity: 0.6 }} />
                    {SECTIONS[k]}
                  </div>
                )}
                {collapsed && <div className="mt-2" />}
                {grouped[k].map((n) => {
                  const Icon = n.icon;
                  const b = badge(n.page);
                  const isActive = n.page === '/' ? location.pathname === '/' : location.pathname.startsWith(n.page);
                  return (
                    <NavLink
                      key={n.page}
                      to={n.page}
                      onClick={() => onMobileClose?.()}
                      title={collapsed ? n.label : undefined}
                      className={`sidebar-nav-item flex items-center gap-2.5 py-2 text-[13px] cursor-pointer relative group${isActive ? ' sidebar-nav-active' : ''}`}
                      style={{
                        paddingLeft: collapsed ? 0 : 12,
                        paddingRight: collapsed ? 0 : 12,
                        justifyContent: collapsed ? 'center' : undefined,
                      }}
                    >
                      {isActive && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full"
                          style={{ background: 'linear-gradient(180deg, var(--accent-gold) 0%, var(--accent-goldDeep) 100%)', boxShadow: '0 0 8px rgba(229,178,76,0.5)' }}
                        />
                      )}
                      <span className="w-[18px] text-center flex-shrink-0 relative">
                        <Icon size={14} />
                        {/* Badge dot in collapsed mode */}
                        {collapsed && b > 0 && (
                          <span
                            className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                            style={{ background: n.page === '/verifications' ? 'var(--status-red)' : 'var(--accent-gold)' }}
                          />
                        )}
                      </span>
                      {!collapsed && (
                        <>
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
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            ) : null,
          )}
        </div>

        {/* View as — founder only */}
        {!collapsed && (isImpersonating || user?.role === 'founder') && allUsers && (
          <div className="mx-2 mb-2 flex-shrink-0">
            {isImpersonating ? (
              <div
                className="px-2 py-1.5 rounded-lg flex items-center justify-between gap-2"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.30)' }}
              >
                <span className="text-[11px]" style={{ color: '#FCA5A5' }}>
                  Viewing as <strong>{user.name}</strong>
                </span>
                <button
                  onClick={() => exitImpersonation()}
                  className="text-[10px] px-2 py-0.5 rounded font-semibold"
                  style={{ background: 'rgba(239,68,68,0.25)', color: '#FCA5A5' }}
                >
                  Exit
                </button>
              </div>
            ) : (
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] mb-1 px-1" style={{ color: 'rgba(229,178,76,0.55)' }}>
                  View as
                </div>
                <select
                  className="input !text-[11px] !py-1"
                  value=""
                  onChange={(e) => { if (e.target.value) impersonate(e.target.value); }}
                >
                  <option value="">— pick a team member —</option>
                  {(allUsers || [])
                    .filter((u: any) => u.id !== user?.id)
                    .map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.role.replace(/_/g, ' ')}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        )}

        <WhatsNew collapsed={collapsed} />

        {/* Report bug */}
        <div className="mx-2 mb-2 flex-shrink-0">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('mits:open-bug-report'))}
            title={collapsed ? 'Report bug' : undefined}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: 'rgba(232,226,211,0.75)',
              justifyContent: collapsed ? 'center' : undefined,
            }}
          >
            <Bug size={12} style={{ flexShrink: 0 }} />
            {!collapsed && <span className="flex-1 text-left">Report bug</span>}
          </button>
        </div>

        {/* User footer */}
        <div
          className="mx-2 px-2 py-2 rounded-lg flex items-center gap-2 flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', justifyContent: collapsed ? 'center' : undefined }}
        >
          <Avatar name={user.name} ring />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[13px] truncate" style={{ color: isImpersonating ? '#FCA5A5' : '#F5EFE0' }}>{user.name}</div>
              <div className="text-[10.5px] uppercase tracking-[0.10em]" style={{ color: isImpersonating ? 'rgba(252,165,165,0.75)' : 'rgba(229,178,76,0.75)' }}>
                {user.role.replace(/_/g, ' ')}
              </div>
            </div>
          )}
          <button
            onClick={() => logout()}
            className="p-1.5 rounded transition-colors flex-shrink-0"
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
