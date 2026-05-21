import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Avatar } from '@/components/ui/avatar';

export function ReportsDashboardPage() {
  const { data: reports } = useQuery({ queryKey: ['reports'], queryFn: () => api.get('/reports').then((r) => r.data) });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then((r) => r.data) });

  const byUser: Record<string, any[]> = {};
  (reports || []).forEach((r: any) => {
    (byUser[r.userId] = byUser[r.userId] || []).push(r);
  });

  return (
    <>
      <Topbar title="Reports dashboard" subtitle={`${reports?.length || 0} total reports`} />
      <Page>
        <div className="grid md:grid-cols-2 gap-3">
          {(users || []).filter((u: any) => u.active).map((u: any) => {
            const list = byUser[u.id] || [];
            return (
              <div key={u.id} className="card">
                <div className="card-h flex justify-between">
                  <div className="flex items-center gap-2"><Avatar name={u.name} size={24} /><span>{u.name}</span></div>
                  <span>{list.length}</span>
                </div>
                {list.length === 0 ? <div className="muted text-xs">No reports yet.</div> :
                  list.slice(0, 5).map((r: any) => (
                    <div key={r.id} className="bg-bg-input rounded p-2 mb-1.5">
                      <div className="text-xs mono muted">{r.date}</div>
                      <div className="text-xs mt-0.5 line-clamp-2">{r.content}</div>
                    </div>
                  ))
                }
              </div>
            );
          })}
        </div>
      </Page>
    </>
  );
}
