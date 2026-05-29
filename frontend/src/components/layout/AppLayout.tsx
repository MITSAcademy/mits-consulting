import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Toaster } from '@/components/ui/toast';
import { NotificationBell } from '@/components/NotificationBell';

export function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
      <Toaster />
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
    <div className="flex justify-between items-center px-6 py-3.5 border-b border-brand-border sticky top-0 bg-bg-page z-10 flex-wrap gap-2.5">
      <div className="text-[17px] font-semibold">
        {title}
        {subtitle && (
          <span className="text-brand-textMuted font-normal text-[13px] ml-2">· {subtitle}</span>
        )}
      </div>
      <div className="flex gap-1.5 items-center flex-wrap">
        {actions}
        <NotificationBell />
      </div>
    </div>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-5">{children}</div>;
}
