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
  const { data } = useQuery({ queryKey: ['sources'], queryFn: () => api.get('/sources').then((r) => r.data) });
  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: () => api.post('/sources', { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sources'] }); setName(''); showToast('Added'); },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/sources/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });

  return (
    <>
      <Topbar title="Lead sources" subtitle={`${data?.length || 0}`} />
      <Page>
        <div className="card mb-4">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New source name" />
            <Button variant="primary" disabled={!name} onClick={() => add.mutate()}>Add</Button>
          </div>
        </div>
        <div className="card">
          <div className="grid md:grid-cols-3 gap-2">
            {(data || []).map((s: any) => (
              <div key={s.id} className="bg-bg-input rounded p-2 flex justify-between items-center">
                <span>{s.name}</span>
                <Button size="sm" variant="danger" onClick={() => { if (confirm('Delete?')) del.mutate(s.id); }}>×</Button>
              </div>
            ))}
          </div>
        </div>
      </Page>
    </>
  );
}
