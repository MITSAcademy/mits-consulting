import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Avatar } from '@/components/ui/avatar';

export function ReportsDashboardPage() {
  const { data: reports, isLoading: reportsLoading } = useQuery({ queryKey: ['reports'], queryFn: () => api.get('/reports').then((r) => r.data) });
  const { data: users, isLoading: usersLoading } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then((r) => r.data) });
  const isLoading = reportsLoading || usersLoading;

  const byUser: Record<string, any[]> = {};
  (reports || []).forEach((r: any) => {
    (byUser[r.userId] = byUser[r.userId] || []).push(r);
  });

  return (
    <>
      <Topbar title="Reports dashboard" subtitle={`${reports?.length || 0} total reports`} />
      <Page>
        {isLoading && <div className="muted text-sm py-8 text-center">Loading reports…</div>}
        {!isLoading && (users || []).filter((u: any) => u.active).length === 0 && (
          <div className="muted text-sm p-4 text-center">No active users found.</div>
        )}
        <div className="grid md:grid-cols-2 gap-3">
          {(users || []).filter((u: any) => u.active).map((u: any) => {
            const list = byUser[u.id] || [];
            return (
              <div key={u.id} className="card">
                <div className="card-h flex justify-between">
                  <div className="flex items-center gap-2"><Avatar name={u.name} size={24} /><span>{u.name}</span></div>
                  <span>{list.length}</span>
                </div>
                {list.length === 0 ? <div className="muted text-xs py-2">No reports yet.</div> :
                  <div className="space-y-1.5">
                    {list.slice(0, 5).map((r: any) => (
                      <div
                        key={r.id}
                        className="rounded-lg p-2.5"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
                      >
                        <div className="text-[11px] mono muted mb-0.5">{r.date}</div>
                        <div className="text-xs line-clamp-2">{r.content}</div>
                      </div>
                    ))}
                  </div>
                }
              </div>
            );
          })}
        </div>
      </Page>
    </>
  );
}
