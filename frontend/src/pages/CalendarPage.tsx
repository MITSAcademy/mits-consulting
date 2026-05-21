import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { todayISO, addDays } from '@/lib/utils';
import { Pill } from '@/components/ui/pill';

export function CalendarPage() {
  const today = todayISO();
  const { data: tasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.get('/tasks').then((r) => r.data),
  });
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 3));

  return (
    <>
      <Topbar title="Work calendar" subtitle="Sessions and tasks" />
      <Page>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {days.map((d) => {
            const items = (tasks || []).filter((t: any) => t.dueDate === d);
            return (
              <div key={d} className="bg-bg-card border border-brand-border rounded-md p-2 min-h-[200px]">
                <div className="text-xs muted mono mb-1">{d}{d === today && ' · today'}</div>
                {items.map((t: any) => (
                  <div key={t.id} className="bg-bg-input rounded p-1.5 mb-1 text-xs">
                    <div className="font-medium">{t.title}</div>
                    <div className="muted">{t.client?.name || '—'}</div>
                    <Pill color={t.status === 'Done' ? 'green' : 'amber'}>{t.status}</Pill>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Page>
    </>
  );
}
