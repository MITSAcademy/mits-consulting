import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ClipboardList } from 'lucide-react';

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const TYPE_COLOR: Record<string, string> = {
  Call:    'var(--status-green)',
  Message: 'var(--status-amber)',
  Note:    'var(--brand-textMuted)',
};

export function FeedbackActivityLog({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['feedback-activities', clientId],
    queryFn: () => api.get(`/feedback/client/${clientId}/activities`).then((r) => r.data),
  });

  if (isLoading || !data?.length) return null;

  return (
    <div className="card">
      <div className="card-h">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ClipboardList size={14} /> Feedback activity log · {data.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
        {(data as any[]).map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--brand-borderSoft)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLOR[a.type] || 'var(--brand-textMuted)', marginTop: 5, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: TYPE_COLOR[a.type] || 'var(--brand-text)' }}>{a.type}</span>
                <span style={{ fontSize: 11, color: 'var(--brand-textMuted)' }}>{a.loggedBy?.name}</span>
                <span style={{ fontSize: 11, color: 'var(--brand-textMuted)' }}>·</span>
                <span style={{ fontSize: 11, color: 'var(--brand-textMuted)' }}>{fmtDateTime(a.loggedAt)}</span>
              </div>
              {a.note && <div style={{ fontSize: 12, color: 'var(--brand-textMuted)', marginTop: 2 }}>{a.note}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
