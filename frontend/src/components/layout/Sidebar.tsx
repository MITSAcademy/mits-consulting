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
  TableProperties, CalendarDays, AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  section: string;
  page: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
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

  { section: 'recruit', page: '/demo-intake', label: 'Pipeline view', icon: LayoutGrid, roles: ['recruiter'] },
  { section: 'recruit', page: '/sourcing', label: 'Sourcing requests', icon: Briefcase, roles: ['founder', 'manager', 'recruiter'] },
  { section: 'recruit', page: '/trainer-leads', label: 'Trainer leads (admin)', icon: UserSearch, roles: ['founder'] },
  { section: 'recruit', page: '/trainers', label: 'Trainer pool', icon: UserCog, roles: ['founder', 'manager', 'lead', 'demo_lead', 'demo_intake', 'recruiter', 'payment_processor'] },

  { section: 'sales', page: '/sales-closing', label: 'My pipeline', icon: LayoutGrid, roles: ['founder', 'manager', 'sales_closer'] },
  { section: 'sales', page: '/roshni/follow-ups', label: 'My follow-ups', icon: Clock, roles: ['founder', 'manager', 'sales_closer'] },
  { section: 'sales', page: '/fresh-payments', label: 'Fresh payments', icon: DollarSign, roles: ['founder', 'manager', 'sales_closer', 'accounts'] },

  { section: 'clients', page: '/follow-up-payments', label: 'Payment follow-up', icon: Receipt, roles: ['founder', 'manager', 'accounts'] },
  { section: 'clients', page: '/calendar', label: 'Work calendar', icon: LayoutGrid, roles: ['founder', 'manager', 'lead', 'staff'] },
  { section: 'clients', page: '/clients', label: 'Clients', icon: Users, roles: ['founder', 'manager', 'lead', 'accounts', 'demo_lead', 'demo_intake', 'account_manager'] },
  { section: 'clients', page: '/trainers', label: 'My trainers', icon: UserCog, roles: ['account_manager', 'lead'] },
  { section: 'clients', page: '/renewals', label: 'Renewals', icon: RefreshCw, roles: ['founder', 'manager'] },
  { section: 'clients', page: '/dormant', label: 'Dormant clients', icon: Moon, roles: ['founder', 'manager', 'demo_lead', 'demo_intake', 'sales_closer'] },
  { section: 'clients', page: '/hold', label: 'CP / C · Follow-ups', icon: Clock, roles: ['founder', 'manager', 'demo_lead', 'sales_closer'] },
  { section: 'clients', page: '/feedback', label: 'Feedback', icon: MessageCircle, roles: ['founder', 'manager', 'lead'] },
  { section: 'partners', page: '/partners', label: 'Partners', icon: Building, roles: ['founder', 'manager', 'sales_closer', 'accounts'] },

  { section: 'work', page: '/my-sessions', label: 'My sessions', icon: ClipboardList, roles: ['founder', 'manager', 'lead', 'account_manager'] },
  { section: 'work', page: '/sessions', label: 'Sessions', icon: CalendarDays, roles: ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'] },
  { section: 'work', page: '/issues', label: 'Issues', icon: AlertTriangle, roles: ['founder', 'manager', 'lead', 'account_manager'] },
  { section: 'clients', page: '/regular-trainings', label: 'Regular trainings', icon: Video, roles: ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'], feature: 'regularCalls' },
  { section: 'trainerOps', page: '/session-logs', label: 'Session logs', icon: ClipboardList, roles: ['founder', 'manager', 'lead', 'account_manager', 'accounts', 'payment_processor'] },
  { section: 'trainerOps', page: '/trainer-pay-sheet', label: 'Payment sheet', icon: TableProperties, roles: ['founder', 'manager', 'account_manager', 'accounts', 'payment_processor'] },
  { section: 'trainerOps', page: '/trainer-pay', label: 'Trainer payouts', icon: Wallet, roles: ['founder', 'manager', 'accounts', 'payment_processor'] },
  { section: 'trainerOps', page: '/payout-batches', label: 'Payout batches', icon: Archive, roles: ['founder', 'manager', 'accounts', 'payment_processor', 'demo_lead'] },

  { section: 'work', page: '/tasks', label: 'My tasks', icon: CheckSquare, roles: ['founder', 'manager', 'lead', 'staff', 'accounts', 'sales_closer', 'demo_lead', 'demo_intake', 'recruiter', 'payment_processor'] },
  { section: 'work', page: '/leverage', label: 'Leverage', icon: Clock, roles: ['founder', 'manager'] },
  { section: 'work', page: '/accounts-queue', label: 'Accounts queue', icon: Receipt, roles: ['founder', 'manager', 'accounts'] },
  { section: 'work', page: '/daily-report', label: 'Daily report', icon: Notebook, roles: ['founder', 'manager', 'demo_lead', 'demo_intake', 'recruiter', 'sales_closer', 'accounts', 'payment_processor', 'lead', 'staff'] },
  { section: 'work', page: '/my-calendar', label: 'My calendar', icon: Calendar, roles: ['founder', 'manager', 'demo_lead', 'demo_intake', 'recruiter', 'sales_closer', 'accounts', 'payment_processor', 'lead', 'staff', 'account_manager'] },

  { section: 'admin', page: '/reports-dashboard', label: 'Reports dashboard', icon: ChartLine, roles: ['founder', 'demo_lead', 'manager'] },
  { section: 'admin', page: '/bulk-upload', label: 'Bulk upload', icon: Upload, roles: ['founder', 'demo_lead', 'manager'] },
  { section: 'admin', page: '/raw-leads', label: 'Raw leads inbox', icon: Inbox, roles: ['founder', 'demo_lead', 'manager', 'demo_intake'] },
  { section: 'admin', page: '/edit-requests', label: 'Edit requests', icon: Edit, roles: ['founder', 'demo_lead', 'manager'] },
  { section: 'admin', page: '/team', label: 'Team', icon: UsersRound, roles: ['founder'] },
  { section: 'admin', page: '/templates', label: 'Email templates', icon: Mail, roles: ['founder', 'demo_lead', 'manager'] },
  { section: 'admin', page: '/sources', label: 'Lead sources', icon: Tag, roles: ['founder', 'demo_lead'] },
  { section: 'admin', page: '/permissions', label: 'Edit permissions', icon: LockKeyhole, roles: ['founder'] },
  { section: 'admin', page: '/banks', label: 'Bank accounts', icon: Building2, roles: ['founder', 'accounts'] },
  { section: 'admin', page: '/audit', label: 'Audit log', icon: History, roles: ['founder'] },
  { section: 'admin', page: '/settings', label: 'Settings', icon: Settings, roles: ['founder', 'manager', 'demo_lead', 'demo_intake', 'recruiter', 'sales_closer', 'accounts', 'payment_processor', 'lead', 'staff', 'account_manager'] },
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
      const isSalesCloser = user?.role === 'sales_closer';
      // For sales_closer: dormant = DP clients, hold = CP+C clients
      const dormantOverdue = isSalesCloser
        ? cl.filter((c) => c.lifecycle === 'SaleClosing' && c.saleClosingSubStatus === 'DP' && c.salesOwnerId === user?.id).length
        : cl.filter((c) => c.lifecycle === 'Dormant' && c.dormantCheckBackOn && c.dormantCheckBackOn <= today).length;
      const holdDue = isSalesCloser
        ? cl.filter((c) => c.lifecycle === 'SaleClosing' && ['CP', 'C'].includes(c.saleClosingSubStatus) && c.salesOwnerId === user?.id).length
        : cl.filter((c) => c.lifecycle === 'Hold' && c.holdCheckBackOn && c.holdCheckBackOn <= today).length;
      const demoIntakePending = cl.filter((c) => ['Lead', 'IntakeSent'].includes(c.lifecycle)).length;
      const demosToday = cl.filter((c) => c.lifecycle === 'DemoScheduled' && c.demoDate && c.demoDate <= weekOut).length;
      const feedbackPending = cl.filter((c) => ['DemoDone', 'FeedbackPending'].includes(c.lifecycle)).length;
      const salesClosingActive = isSalesCloser
        ? cl.filter((c) =>
            ['SaleClosing', 'SaleWon'].includes(c.lifecycle)
            && c.saleClosingSubStatus !== 'DP'
            && c.salesOwnerId === user?.id,
          ).length
        : cl.filter((c) =>
            ['DemoDone', 'FeedbackPending', 'SaleClosing', 'SaleWon'].includes(c.lifecycle)
            && c.lifecycle !== 'Active',
          ).length;
      // For sales_closer: count all RP clients (= exactly what My follow-ups page shows)
      const followUpsDue = isSalesCloser
        ? cl.filter((c) =>
            ['SaleClosing', 'SaleWon'].includes(c.lifecycle)
            && (!c.saleClosingSubStatus || c.saleClosingSubStatus === 'RP')
            && c.salesOwnerId === user?.id,
          ).length
        : cl.filter((c) =>
            ['SaleClosing', 'SaleWon'].includes(c.lifecycle)
            && (c.saleClosingSubStatus === 'RP' || c.saleClosingSubStatus === 'CP' || c.saleClosingSubStatus === 'C')
            && c.roshniNextCallOn && c.roshniNextCallOn <= today,
          ).length;
      const renewalsDue = cl.filter((c) =>
        ['Active', 'LeverageGranted'].includes(c.lifecycle)
        && c.nextRenewalDue && c.nextRenewalDue <= weekOut,
      ).length;
      const followUpActiveTotal = cl.filter((c) =>
        ['Active', 'LeverageGranted', 'SaleWon'].includes(c.lifecycle),
      ).length;
      return {
        pendingVaibhav: home.ops.pendingVaibhav,
        pendingLeverage: leverage.length,
        sourcingOpen: sourcing.filter((s: any) => s.status === 'Open').length,
        verPending: sourcing.filter((s: any) => s.status === 'Proposed').length,
        editReqPending: editReqs.filter((r: any) => r.status === 'Pending').length,
        dormantOverdue, holdDue, demoIntakePending, demosToday, feedbackPending,
        salesClosingActive, followUpsDue, renewalsDue, followUpActiveTotal,
      };
    },
    refetchInterval: 180_000,
    staleTime: 60_000,
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
    if (page === '/edit-requests') return metrics.editReqPending;
    if (page === '/dormant') return metrics.dormantOverdue;
    if (page === '/hold') return metrics.holdDue;
    if (page === '/demo-intake') return metrics.demoIntakePending;
    if (page === '/demo-schedule') return metrics.demosToday;
    if (page === '/feedback-queue') return metrics.feedbackPending;
    if (page === '/sales-closing') return metrics.salesClosingActive;
    if (page === '/roshni/follow-ups') return metrics.followUpsDue;
    if (page === '/renewals') return metrics.renewalsDue;
    if (page === '/follow-up-payments') return metrics.followUpActiveTotal;
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
            'radial-gradient(600px 200px at 0% 0%, rgba(229,178,76,0.04), transparent 50%), ' +
            'linear-gradient(180deg, var(--bg-sidebar) 0%, color-mix(in srgb, var(--bg-sidebar) 92%, #000) 100%)',
          borderColor: 'rgba(255,255,255,0.06)',
          color: '#E8E2D3',
          transition: 'width 220ms cubic-bezier(0.2,0.9,0.25,1), min-width 220ms cubic-bezier(0.2,0.9,0.25,1)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.30)',
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
                background: 'linear-gradient(135deg, #FAF5E7 0%, #E8DEC2 50%, #D4B98C 100%)',
                boxShadow: '0 2px 10px rgba(229,178,76,0.20), inset 0 1px 0 rgba(255,255,255,0.40)',
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
                      className="flex items-center gap-2.5 py-2 text-[13px] cursor-pointer relative group"
                      style={{
                        paddingLeft: collapsed ? 0 : 12,
                        paddingRight: collapsed ? 0 : 12,
                        justifyContent: collapsed ? 'center' : undefined,
                        color: isActive ? '#FAF5E7' : 'rgba(232,226,211,0.78)',
                        background: isActive
                          ? 'linear-gradient(90deg, rgba(229,178,76,0.18) 0%, rgba(229,178,76,0.04) 100%)'
                          : 'transparent',
                        transition: 'background-color 150ms ease, color 150ms ease',
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
        {!collapsed && (realUser ? realUser.role === 'founder' : user?.role === 'founder') && allUsers && (
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
