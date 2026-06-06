import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Toaster } from '@/components/ui/toast';
import { NotificationBell } from '@/components/NotificationBell';
import { ThemeToggle, timeGreeting } from '@/components/ThemeToggle';
import { SetupAppPasswordModal } from '@/components/SetupAppPasswordModal';
import { useAuth } from '@/store/auth';

export function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
      <Toaster />
      <SetupAppPasswordModal />
    </div>
  );
}

/** Personalised "Good morning, Roshni" header next to the page title.
 *  Reads the user from the auth store + the time-of-day from ThemeToggle.
 *  Falls back gracefully when no user (login route still uses Topbar). */
function GreetingChip() {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  const { greeting, emoji } = timeGreeting();
  const firstName = (user.name || '').split(' ')[0];
  const dayDate = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  return (
    <div className="hidden md:flex items-center gap-2 text-[12px] muted">
      <span aria-hidden>{emoji}</span>
      <span>{greeting}, <span className="font-medium" style={{ color: 'var(--brand-text)' }}>{firstName}</span></span>
      <span>·</span>
      <span>{dayDate}</span>
    </div>
  );
}

export function Topbar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className="flex justify-between items-center px-6 py-3.5 border-b sticky top-0 z-10 flex-wrap gap-2.5"
      style={{
        borderColor: 'var(--brand-border)',
        background: 'color-mix(in srgb, var(--bg-page) 92%, transparent)',
        backdropFilter: 'saturate(140%) blur(6px)',
      }}
    >
      <div className="flex items-center gap-4 flex-wrap">
        <div className="text-[17px] font-semibold tracking-tight">
          {title}
          {subtitle && (
            <span className="text-brand-textMuted font-normal text-[13px] ml-2">· {subtitle}</span>
          )}
        </div>
        <GreetingChip />
      </div>
      <div className="flex gap-1.5 items-center flex-wrap">
        {actions}
        <ThemeToggle />
        <NotificationBell />
      </div>
    </div>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-5 page-enter">{children}</div>;
}
