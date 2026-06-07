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
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {days.map((d) => {
            const items = (tasks || []).filter((t: any) => t.dueDate === d);
            const isToday = d === today;
            return (
              <div
                key={d}
                className="rounded-xl p-2.5 min-h-[220px] transition-all"
                style={{
                  background: isToday
                    ? 'linear-gradient(180deg, color-mix(in srgb, var(--accent-gold) 6%, var(--bg-card)) 0%, var(--bg-card) 100%)'
                    : 'var(--bg-card)',
                  border: `1px solid ${isToday ? 'color-mix(in srgb, var(--accent-gold) 30%, var(--brand-border))' : 'var(--brand-border)'}`,
                  boxShadow: isToday ? '0 2px 8px rgba(229,178,76,0.10)' : 'var(--shadow-sm)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] mono font-semibold" style={{ color: isToday ? 'var(--accent-gold)' : 'var(--brand-textMuted)' }}>{d}</span>
                  {isToday && <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-goldSoft)', color: 'var(--accent-gold)' }}>Today</span>}
                </div>
                {items.length === 0 && <div className="text-[10.5px] muted italic text-center py-2">No tasks</div>}
                {items.map((t: any) => (
                  <div
                    key={t.id}
                    className="rounded-lg p-2 mb-1.5 text-xs transition-all"
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--brand-borderSoft)',
                    }}
                  >
                    <div className="font-semibold mb-0.5" style={{ color: 'var(--brand-text)' }}>{t.title}</div>
                    <div className="muted mb-1 text-[10.5px]">{t.client?.name || '—'}</div>
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
