import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';

export function AuditPage() {
  const { data } = useQuery({ queryKey: ['audit'], queryFn: () => api.get('/audit').then((r) => r.data) });

  return (
    <>
      <Topbar title="Audit log" subtitle={`${data?.length || 0}`} />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              {(data || []).map((l: any) => (
                <tr key={l.id}>
                  <td className="mono text-xs">{new Date(l.createdAt).toLocaleString()}</td>
                  <td>{l.byName}</td>
                  <td className="mono text-xs">{l.action}</td>
                  <td className="text-xs">{l.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
