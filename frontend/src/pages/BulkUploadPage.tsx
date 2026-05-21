import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Textarea, Label } from '@/components/ui/input';
import { useUI } from '@/store/ui';

export function BulkUploadPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [raw, setRaw] = useState('');
  const [csv, setCsv] = useState('');

  const importRaw = useMutation({
    mutationFn: () =>
      api.post('/raw-leads/bulk', { lines: raw.split('\n').map((l) => l.trim()).filter(Boolean) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['raw-leads'] });
      showToast(`Imported ${r.data.count}`);
      setRaw('');
    },
  });

  const importCsv = useMutation({
    mutationFn: async () => {
      const lines = csv.trim().split('\n');
      const headers = lines[0].split(',').map((h) => h.trim());
      const rows = lines.slice(1).map((l) => {
        const cells = l.split(',');
        const o: any = {};
        headers.forEach((h, i) => (o[h] = (cells[i] || '').trim()));
        return o;
      });
      const created: any[] = [];
      for (const r of rows) {
        if (!r.name) continue;
        const res = await api.post('/clients', {
          name: r.name,
          phoneCode: r.phoneCode || '+1',
          phoneDigits: (r.phoneDigits || '').replace(/\D/g, ''),
          email: r.email || '',
          engagementType: r.engagementType || 'Support',
          currency: r.currency || 'USD',
          source: r.source || '',
          intakeSkillHint: r.skill || '',
          lifecycle: 'Lead',
        });
        created.push(res.data);
      }
      return created;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      showToast(`Imported ${created.length} clients`);
      setCsv('');
    },
  });

  return (
    <>
      <Topbar title="Bulk upload" />
      <Page>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card">
            <div className="card-h">Raw paste (messy) → Inbox</div>
            <Label>One lead per line; any format. Goes to Raw leads inbox for cleanup.</Label>
            <Textarea rows={10} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={`Karthik 9876543210 Java\nRiya +15125550102 ServiceNow\n…`} />
            <Button variant="primary" className="mt-2" onClick={() => importRaw.mutate()} disabled={!raw.trim()}>
              Send to raw inbox
            </Button>
          </div>
          <div className="card">
            <div className="card-h">Structured CSV → Clients</div>
            <Label>First row = headers. Supported: name, phoneCode, phoneDigits, email, engagementType, currency, source, skill</Label>
            <Textarea rows={10} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={`name,phoneCode,phoneDigits,email,engagementType,currency,source,skill\nKarthik,+1,5125550101,k@x.com,Support,USD,LinkedIn,Java`} />
            <Button variant="primary" className="mt-2" onClick={() => importCsv.mutate()} disabled={!csv.trim()}>
              Import as clients
            </Button>
          </div>
        </div>
      </Page>
    </>
  );
}
