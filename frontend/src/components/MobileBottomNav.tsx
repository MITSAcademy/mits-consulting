import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Users,
  ClipboardList,
  Calendar,
  AlertTriangle,
  DollarSign,
  Video,
  Briefcase,
  UserCog,
  LayoutGrid,
  MoreHorizontal,
} from 'lucide-react';
import { useAuth } from '@/store/auth';

type Tab = {
  label: string;
  path?: string;
  icon: React.ElementType;
  more?: true;
};

function getTabsForRole(role: string): Tab[] {
  switch (role) {
    case 'founder':
    case 'manager':
      return [
        { label: 'Home', path: '/', icon: Home },
        { label: 'Clients', path: '/clients', icon: Users },
        { label: 'Sessions', path: '/my-sessions', icon: ClipboardList },
        { label: 'Issues', path: '/issues', icon: AlertTriangle },
        { label: 'More', icon: MoreHorizontal, more: true },
      ];
    case 'lead':
    case 'account_manager':
      return [
        { label: 'Home', path: '/', icon: Home },
        { label: 'Clients', path: '/clients', icon: Users },
        { label: 'Sessions', path: '/my-sessions', icon: ClipboardList },
        { label: 'Calendar', path: '/my-calendar', icon: Calendar },
        { label: 'More', icon: MoreHorizontal, more: true },
      ];
    case 'sales_closer':
      return [
        { label: 'Home', path: '/', icon: Home },
        { label: 'Pipeline', path: '/sales-closing', icon: Briefcase },
        { label: 'Payments', path: '/fresh-payments', icon: DollarSign },
        { label: 'Calendar', path: '/my-calendar', icon: Calendar },
        { label: 'More', icon: MoreHorizontal, more: true },
      ];
    case 'demo_lead':
    case 'demo_intake':
      return [
        { label: 'Home', path: '/', icon: Home },
        { label: 'Demos', path: '/demos', icon: Video },
        { label: 'Clients', path: '/clients', icon: Users },
        { label: 'Issues', path: '/issues', icon: AlertTriangle },
        { label: 'More', icon: MoreHorizontal, more: true },
      ];
    case 'recruiter':
      return [
        { label: 'Sourcing', path: '/sourcing', icon: UserCog },
        { label: 'Trainers', path: '/trainers', icon: Users },
        { label: 'Requirements', path: '/freelance-requirements', icon: LayoutGrid },
        { label: 'Calendar', path: '/my-calendar', icon: Calendar },
      ];
    case 'payment_processor':
    case 'accounts':
      return [
        { label: 'Clients', path: '/clients', icon: Users },
        { label: 'Sessions', path: '/session-logs', icon: ClipboardList },
        { label: 'Payments', path: '/fresh-payments', icon: DollarSign },
        { label: 'Calendar', path: '/my-calendar', icon: Calendar },
      ];
    default:
      return [
        { label: 'Home', path: '/', icon: Home },
        { label: 'More', icon: MoreHorizontal, more: true },
      ];
  }
}

export function MobileBottomNav() {
  const user = useAuth((s) => s.user);
  const location = useLocation();

  if (!user) return null;

  const role = user.role as string;
  const tabs = getTabsForRole(role);

  function isActive(path?: string) {
    if (!path) return false;
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
      style={{
        height: '56px',
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px) saturate(160%)',
        WebkitBackdropFilter: 'blur(12px) saturate(160%)',
        borderTop: '1px solid var(--brand-border)',
      }}
    >
      {tabs.map((tab) => {
        const active = isActive(tab.path);
        const Icon = tab.icon;
        const color = active ? 'var(--accent-gold)' : 'var(--brand-textMuted)';

        if (tab.more) {
          return (
            <button
              key="more"
              onClick={() => window.dispatchEvent(new CustomEvent('mits:open-sidebar'))}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2"
              style={{ color }}
              aria-label="Open sidebar"
            >
              <Icon size={20} />
              <span style={{ fontSize: '10px' }}>{tab.label}</span>
            </button>
          );
        }

        return (
          <Link
            key={tab.path}
            to={tab.path!}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 no-underline"
            style={{ color }}
            aria-label={tab.label}
          >
            <div className="relative flex flex-col items-center gap-1">
              <Icon size={20} />
              {active && (
                <span
                  style={{
                    display: 'block',
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: 'var(--accent-gold)',
                  }}
                />
              )}
              {!active && <span style={{ width: '4px', height: '4px' }} />}
            </div>
            <span style={{ fontSize: '10px' }}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
