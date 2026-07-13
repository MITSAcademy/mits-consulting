import { Outlet } from 'react-router-dom';
import { useState, createContext, useContext, Suspense, useEffect } from 'react';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { HelpPanel } from '@/components/HelpPanel';
import { Menu, Search } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Toaster } from '@/components/ui/toast';
import { NotificationBell } from '@/components/NotificationBell';
import { ThemeToggle, timeGreeting } from '@/components/ThemeToggle';
import { SetupAppPasswordModal } from '@/components/SetupAppPasswordModal';
import { AskAIButton } from '@/components/AskAI';
import { CelebrationLayer } from '@/components/CelebrationLayer';
import { IdleGame } from '@/components/IdleGame';
import { useAuth } from '@/store/auth';
import { GlobalSearch, openGlobalSearch } from '@/components/GlobalSearch';
import { StreakBanner } from '@/components/StreakBanner';
import { BugReportModal } from '@/components/BugReportModal';
import { FloatingActions } from '@/components/FloatingActions';

/** Context lets the Topbar open the off-canvas sidebar without lifting state
 *  through every page. */
const MobileNavCtx = createContext<{ open: () => void }>({ open: () => {} });

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = useAuth((s) => s.user);

  useEffect(() => {
    const handler = () => setMobileOpen(true);
    window.addEventListener('mits:open-sidebar', handler);
    return () => window.removeEventListener('mits:open-sidebar', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === '?') {
        window.dispatchEvent(new CustomEvent('mits:open-help'));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <MobileNavCtx.Provider value={{ open: () => setMobileOpen(true) }}>
      <div className="flex min-h-screen">
        <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
        <main className="flex-1 min-w-0 w-full overflow-x-hidden pb-16 md:pb-0">
          <Suspense fallback={<div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '2px', background: 'var(--accent-gold)', animation: 'progress-bar 1s ease-in-out infinite' }} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <Toaster />
      <StreakBanner userName={user?.name || ''} />
      <SetupAppPasswordModal />
      <CelebrationLayer />
      <IdleGame />
      <GlobalSearch />
      <HelpPanel />
      <MobileBottomNav />
      <BugReportModal />
      <FloatingActions />
    </MobileNavCtx.Provider>
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
    <div
      className="hidden md:flex items-center gap-2 text-[12px] px-3 py-1 rounded-full"
      style={{
        background: 'color-mix(in srgb, var(--bg-input) 80%, transparent)',
        border: '1px solid var(--brand-borderSoft)',
        color: 'var(--brand-textSecondary)',
      }}
    >
      <span aria-hidden style={{ fontSize: '13px' }}>{emoji}</span>
      <span>{greeting}, <span className="font-semibold" style={{ color: 'var(--brand-text)' }}>{firstName}</span></span>
      <span style={{ color: 'var(--brand-textMuted)' }}>·</span>
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
  const { open: openMobile } = useContext(MobileNavCtx);
  return (
    <div
      className="flex justify-between items-center px-4 md:px-6 py-4 border-b sticky top-0 z-10 flex-wrap gap-2.5"
      style={{
        borderColor: 'color-mix(in srgb, var(--brand-border) 55%, transparent)',
        background: 'color-mix(in srgb, var(--bg-page) 85%, transparent)',
        backdropFilter: 'saturate(180%) blur(16px)',
        WebkitBackdropFilter: 'saturate(180%) blur(16px)',
        boxShadow: '0 1px 0 color-mix(in srgb, var(--brand-border) 40%, transparent), 0 4px 20px rgba(0,0,0,0.06)',
      }}
    >
      <div className="flex items-center gap-3 flex-wrap min-w-0">
        {/* Hamburger — mobile-only, opens the off-canvas sidebar */}
        <button
          onClick={openMobile}
          className="md:hidden p-2 -ml-1 rounded-lg hover:bg-bg-cardHover transition-colors"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
        <div className="min-w-0 truncate">
          <span className="h-page">{title}</span>
          {subtitle && (
            <span className="font-normal text-[12.5px] ml-2.5" style={{ color: 'var(--brand-textMuted)' }}>· {subtitle}</span>
          )}
        </div>
        <GreetingChip />
      </div>
      <div className="flex gap-1.5 items-center flex-wrap">
        {actions}
        <button
          onClick={openGlobalSearch}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] transition-colors"
          style={{ background: 'var(--bg-input)', color: 'var(--brand-textMuted)', border: '1px solid var(--brand-borderSoft)' }}
          title="Search (⌘K)"
        >
          <Search size={13} />
          <span>Search</span>
          <kbd className="text-[10px] px-1 py-0.5 rounded ml-1" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-borderSoft)' }}>⌘K</kbd>
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('mits:open-help'))}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors"
          style={{ background: 'var(--bg-input)', color: 'var(--brand-textMuted)', border: '1px solid var(--brand-borderSoft)' }}
          title="Help (press ?)"
          aria-label="Help"
        >
          <span style={{ fontSize: 14 }}>?</span>
        </button>
        <AskAIButton />
        <ThemeToggle />
        <NotificationBell />
      </div>
    </div>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 md:px-6 py-6 route-enter relative" style={{ maxWidth: '1600px', margin: '0 auto' }}>
      {children}
    </div>
  );
}
