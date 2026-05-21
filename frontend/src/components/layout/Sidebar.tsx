import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { Avatar } from '@/components/ui/avatar';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
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
}

const NAV: NavItem[] = [
  { section: 'overview', page: '/', label: 'Home', icon: Home, roles: ['founder', 'manager', 'demo_lead'] },
  { section: 'overview', page: '/money-flow', label: 'Money flow', icon: ArrowRightLeft, roles: ['founder', 'manager', 'accounts'] },
  { section: 'overview', page: '/vaibhav-queue', label: 'Vaibhav queue', icon: AlertCircle, roles: ['founder', 'manager', 'accounts'] },
  { section: 'overview', page: '/pipeline', label: 'Pipeline overview', icon: Target, roles: ['founder', 'manager', 'demo_lead'] },

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
  { section: 'sales', page: '/fresh-payments', label: 'Fresh payments', icon: DollarSign, roles: ['founder', 'manager', 'sales_closer', 'accounts'] },

  { section: 'clients', page: '/calendar', label: 'Work calendar', icon: LayoutGrid, roles: ['founder', 'manager', 'lead', 'staff'] },
  { section: 'clients', page: '/clients', label: 'Clients', icon: Users, roles: ['founder', 'manager', 'lead', 'sales_closer', 'accounts', 'demo_lead', 'demo_intake'] },
  { section: 'clients', page: '/renewals', label: 'Renewals', icon: RefreshCw, roles: ['founder', 'manager'] },
  { section: 'clients', page: '/dormant',  label: 'Dormant clients', icon: Moon, roles: ['founder', 'manager', 'demo_lead', 'demo_intake', 'sales_closer'] },
  { section: 'clients', page: '/hold',     label: 'On Hold · follow-ups', icon: Clock, roles: ['founder', 'manager', 'demo_lead', 'sales_closer'] },
  { section: 'clients', page: '/feedback', label: 'Feedback', icon: MessageCircle, roles: ['founder', 'manager', 'lead'] },
  { section: 'partners', page: '/partners', label: 'Partners', icon: Building, roles: ['founder', 'manager', 'sales_closer', 'accounts'] },

  { section: 'trainerOps', page: '/session-logs', label: 'Session logs', icon: ClipboardList, roles: ['founder', 'manager', 'accounts', 'payment_processor'] },
  { section: 'trainerOps', page: '/trainer-pay', label: 'Trainer payouts', icon: Wallet, roles: ['founder', 'manager', 'accounts', 'payment_processor'] },
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

export function Sidebar() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const location = useLocation();

  const { data: metrics } = useQuery({
    queryKey: ['nav-badges'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [home, sourcing, leverage, editReqs, clients] = await Promise.all([
        api.get('/metrics/home').then((r) => r.data),
        api.get('/sourcing').then((r) => r.data),
        api.get('/leverage', { params: { status: 'PendingVaibhav' } }).then((r) => r.data),
        api.get('/edit-requests').then((r) => r.data),
        api.get('/clients').then((r) => r.data),
      ]);
      const dormantOverdue = (clients || []).filter(
        (c: any) => c.lifecycle === 'Dormant' && c.dormantCheckBackOn && c.dormantCheckBackOn <= today,
      ).length;
      const holdDue = (clients || []).filter(
        (c: any) => c.lifecycle === 'Hold' && c.holdCheckBackOn && c.holdCheckBackOn <= today,
      ).length;
      return {
        pendingVaibhav: home.ops.pendingVaibhav,
        pendingLeverage: leverage.length,
        sourcingOpen: sourcing.filter((s: any) => s.status === 'Open').length,
        verPending: sourcing.filter((s: any) => s.status === 'Proposed').length,
        editReqPending: editReqs.filter((r: any) => r.status === 'Pending').length,
        dormantOverdue,
        holdDue,
      };
    },
    refetchInterval: 30000,
    enabled: !!user,
  });

  if (!user) return null;

  const filtered = NAV.filter((n) => n.roles.includes(user.role));
  const grouped: Record<string, NavItem[]> = {};
  filtered.forEach((n) => {
    (grouped[n.section] = grouped[n.section] || []).push(n);
  });

  const badge = (page: string) => {
    if (!metrics) return 0;
    if (page === '/leverage') return metrics.pendingLeverage;
    if (page === '/vaibhav-queue') return metrics.pendingVaibhav;
    if (page === '/sourcing') return metrics.sourcingOpen;
    if (page === '/verifications') return metrics.verPending;
    if (page === '/edit-requests') return metrics.editReqPending;
    if (page === '/dormant') return metrics.dormantOverdue;
    if (page === '/hold') return metrics.holdDue;
    return 0;
  };

  return (
    <aside className="w-60 bg-bg-sidebar border-r border-brand-border py-4 flex flex-col sticky top-0 h-screen flex-shrink-0 overflow-y-auto">
      <div className="flex items-center gap-2.5 px-4 pb-4 text-[15px] font-medium">
        <img src="/mits-logo.svg" alt="MITS" className="w-7 h-7 rounded-md flex-shrink-0" />
        <span>MITS Consulting Hub</span>
      </div>

      {Object.keys(SECTIONS).map((k) =>
        grouped[k] ? (
          <div key={k}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-textMuted px-4 pt-3 pb-1">
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
                  className={() =>
                    `flex items-center gap-2.5 px-4 py-1.5 text-[13px] cursor-pointer transition-all border-l-2 ${
                      isActive
                        ? 'bg-bg-card text-brand-text border-brand-amber'
                        : 'text-brand-textSecondary border-transparent hover:bg-bg-card hover:text-brand-text'
                    }`
                  }
                >
                  <span className="w-[18px] text-center">
                    <Icon size={14} />
                  </span>
                  <span className="flex-1">{n.label}</span>
                  {b > 0 && (
                    <span
                      className={`ml-auto text-[10px] px-1.5 py-0 rounded-full font-semibold ${
                        n.page === '/verifications' ? 'bg-brand-red text-white' : 'bg-brand-amber text-[#1A1B1E]'
                      }`}
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

      <div className="mt-auto px-3 pt-3 border-t border-brand-border flex items-center gap-2.5">
        <Avatar name={user.name} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[13px]">{user.name}</div>
          <div className="text-[11px] text-brand-textMuted capitalize">
            {user.role.replace(/_/g, ' ')}
          </div>
        </div>
        <button onClick={() => logout()} className="text-brand-textMuted hover:text-brand-text" title="Logout">
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}
