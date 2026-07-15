import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Textarea, Label } from '@/components/ui/input';
import { useUI } from '@/store/ui';
import { Info } from 'lucide-react';

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
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to import — check your connection and try again', 'error'),
  });

  // Quote-aware CSV row splitter — handles cells containing commas (e.g.
  // a client name like "Smith, Jr."), escaped quotes (""), and trims the cell
  // whitespace. Pure JS, no papaparse dep needed for this scale.
  function splitCsvRow(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } // escaped ""
          else inQuotes = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === ',') { out.push(cur.trim()); cur = ''; }
        else if (ch === '"' && cur.length === 0) { inQuotes = true; }
        else { cur += ch; }
      }
    }
    out.push(cur.trim());
    return out;
  }

  const importCsv = useMutation({
    mutationFn: async () => {
      // Split on both \r\n and \n so Excel-exported CSVs work the same as raw paste.
      const lines = csv.trim().split(/\r?\n/);
      const headers = splitCsvRow(lines[0]);
      const required = ['name'];
      const missing = required.filter((r) => !headers.includes(r));
      if (missing.length > 0) {
        throw new Error(`Missing required header(s): ${missing.join(', ')}. First row must list column names.`);
      }
      const rows = lines.slice(1).map((l) => {
        const cells = splitCsvRow(l);
        const o: any = {};
        headers.forEach((h, i) => (o[h] = cells[i] || ''));
        return o;
      });
      const created: any[] = [];
      const failed: { row: number; name: string; error: string }[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r.name) continue;
        try {
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
        } catch (e: any) {
          failed.push({
            row: i + 2, // +2 = 1 (headers) + 1-based
            name: r.name,
            error: e?.response?.data?.error || e?.message || 'unknown',
          });
        }
      }
      return { created, failed };
    },
    onSuccess: ({ created, failed }) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['metrics/home'] });
      if (failed.length > 0) {
        const sample = failed.slice(0, 3).map((f) => `row ${f.row} (${f.name}): ${f.error}`).join(' · ');
        showToast(
          `Imported ${created.length} · ${failed.length} failed — ${sample}${failed.length > 3 ? ` · +${failed.length - 3} more (see console)` : ''}`,
          'error',
        );
        // eslint-disable-next-line no-console
        console.warn('[bulk-upload] failed rows:', failed);
      } else {
        showToast(`Imported ${created.length} clients`);
      }
      setCsv('');
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || e?.message || 'CSV parse failed';
      showToast(`Import failed: ${msg}. Check that the first row has the required column headers (name, phoneCode, phoneDigits…).`, 'error');
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
            <div
              className="flex gap-2 rounded-lg px-3 py-2.5 text-[12px]"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--brand-borderSoft)',
                color: 'var(--brand-textMuted)',
              }}
            >
              <Info size={13} className="shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-medium">Expected CSV columns (in order):</div>
                <div>Name · Phone Code · Phone Number · Email · Skill · Source</div>
                <div style={{ color: 'var(--brand-textMuted)', opacity: 0.75 }}>
                  Example: John Smith · +91 · 9876543210 · john@email.com · Python · LinkedIn
                </div>
              </div>
            </div>
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
