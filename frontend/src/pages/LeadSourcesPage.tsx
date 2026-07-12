import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { useUI } from '@/store/ui';

export function LeadSourcesPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data, isLoading } = useQuery({ queryKey: ['sources'], queryFn: () => api.get('/sources').then((r) => r.data) });
  const [name, setName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => api.post('/sources', { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sources'] }); setName(''); showToast('Added'); },
    onError: () => showToast('Failed to add source', 'error'),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/sources/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
    onError: () => showToast('Failed to delete source', 'error'),
  });

  return (
    <>
      <Topbar title="Lead sources" subtitle={`${data?.length || 0}`} />
      <Page>
        <div className="card mb-4">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New source name" />
            <Button variant="primary" disabled={!name || add.isPending} onClick={() => add.mutate()}>Add</Button>
          </div>
        </div>
        <div className="card">
          {isLoading ? (
            <div className="text-sm muted py-4 text-center">Loading…</div>
          ) : (
            <div className="grid md:grid-cols-3 gap-2">
              {(data || []).map((s: any) => (
                <div
                  key={s.id}
                  className="flex justify-between items-center rounded-xl px-3 py-2.5 hover-lift"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
                >
                  <span className="text-sm font-medium">{s.name}</span>
                  {deleteConfirm === s.id ? (
                    <span className="flex items-center gap-1 text-[11px]">
                      Delete?{' '}
                      <Button size="sm" variant="danger" onClick={() => { del.mutate(deleteConfirm!); setDeleteConfirm(null); }}>Yes</Button>
                      <Button size="sm" onClick={() => setDeleteConfirm(null)}>No</Button>
                    </span>
                  ) : (
                    <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(s.id)}>×</Button>
                  )}
                </div>
              ))}
              {(data || []).length === 0 && (
                <div className="col-span-3 text-center py-8 muted text-sm">No sources yet. Add one above.</div>
              )}
            </div>
          )}
        </div>
      </Page>
    </>
  );
}
