/**
 * Regular Trainings hub — Mitali team's recurring training operations.
 *
 * Mirrors the "RegularCalls - Recording links" Google sheet:
 *   training name | recording account | folder URL | hosted by | schedule
 *
 * Plus a structured per-session workflow (schedule → start → end + feedback +
 * recording URL) instead of free-form rows.
 *
 * Gated behind the regularCalls feature flag — page is hidden from the
 * sidebar when off and the backend returns 404 anyway.
 *
 * Security: passwords are NEVER captured here. Only the email is shown so
 * Mitali can quickly identify which password to look up in 1Password.
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Pill } from '@/components/ui/pill';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useUI } from '@/store/ui';
import { useFeatures } from '@/hooks/useFeatures';
import { EmptyState } from '@/components/EmptyState';
import { FolderOpen, Plus, Video, ExternalLink, Mail, Calendar as CalendarIcon } from 'lucide-react';

interface Training {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'archived' | string;
  recordingAccountEmail: string | null;
  recordingAccountLabel: string | null;
  recordingFolderUrl: string | null;
  scheduleNotes: string | null;
  notes: string | null;
  hostedByDefault: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
  trainer: { id: string; name: string } | null;
  _count: { sessions: number };
  createdAt: string;
  updatedAt: string;
}

export function RegularTrainingsPage() {
  const features = useFeatures();
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [search, setSearch] = useState('');

  const { data: trainings, isLoading } = useQuery<Training[]>({
    queryKey: ['regular-trainings'],
    queryFn: () => api.get('/regular-trainings/trainings').then((r) => r.data),
    enabled: features.regularCalls,
  });

  const filtered = useMemo(() => {
    let xs = trainings || [];
    if (statusFilter !== 'all') xs = xs.filter((t) => t.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter((t) =>
        t.name.toLowerCase().includes(q)
        || (t.recordingAccountEmail || '').toLowerCase().includes(q)
        || (t.hostedByDefault?.name || '').toLowerCase().includes(q)
        || (t.scheduleNotes || '').toLowerCase().includes(q),
      );
    }
    return xs;
  }, [trainings, search, statusFilter]);

  // Group by recording account so it visually mirrors the sheet's structure.
  const grouped = useMemo(() => {
    const map = new Map<string, Training[]>();
    for (const t of filtered) {
      const k = t.recordingAccountEmail || '(no recording account)';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  if (!features.regularCalls) {
    return (
      <>
        <Topbar title="Regular trainings" />
        <Page>
          <EmptyState
            icon={Video}
            tone="grey"
            title="Feature not enabled"
            description="Ask Vaibhav to set FEATURES_REGULAR_CALLS=true in Render env to enable this view."
          />
        </Page>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Regular trainings"
        subtitle={`${(trainings || []).length} total · ${(trainings || []).filter(t => t.status === 'active').length} active`}
        actions={
          <>
            <Input placeholder="Search name / email / host…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-[260px]" />
            <CreateTrainingButton />
          </>
        }
      />
      <Page>
        {/* Filter chips */}
        <div className="flex gap-2 mb-3">
          {(['active', 'archived', 'all'] as const).map((k) => {
            const active = statusFilter === k;
            return (
              <button
                key={k}
                onClick={() => setStatusFilter(k)}
                className="px-3 py-1 rounded-full text-[12px] font-medium border transition-all"
                style={{
                  background: active ? 'var(--accent-goldSoft)' : 'var(--bg-card)',
                  borderColor: active ? 'var(--accent-gold)'   : 'var(--brand-border)',
                  color:       active ? 'var(--accent-gold)'   : 'var(--brand-textSecondary)',
                }}
              >
                {k}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="muted text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Video}
            tone="gold"
            title="No regular trainings yet"
            description='Click "+ New training" to add your first one. Map a name, the recording Gmail (no password!), the Drive folder, and who hosts it.'
          />
        ) : (
          grouped.map(([accountEmail, rows]) => (
            <div key={accountEmail} className="mb-5">
              <div className="section-h">
                <Mail size={11} style={{ color: 'var(--accent-gold)', marginLeft: -2 }}/>
                <span>Recording account: <span style={{ color: 'var(--brand-text)' }}>{accountEmail}</span></span>
                <span className="muted text-[10.5px]">· {rows.length} training{rows.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="table-card">
                <table>
                  <thead>
                    <tr>
                      <th>Training</th>
                      <th>Host</th>
                      <th>Schedule</th>
                      <th>Folder</th>
                      <th>Sessions</th>
                      <th>Status</th>
                      <th className="text-right">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => <Row key={t.id} t={t} />)}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </Page>
    </>
  );
}

function Row({ t }: { t: Training }) {
  return (
    <tr className="clickable">
      <td>
        <Link to={`/regular-trainings/${t.id}`} className="font-semibold hover:underline" style={{ color: 'var(--brand-text)' }}>
          {t.name}
        </Link>
        {t.notes && <div className="text-[10.5px] muted mt-0.5 truncate" title={t.notes}>{t.notes.slice(0, 60)}</div>}
      </td>
      <td>{t.hostedByDefault?.name || <span className="muted">—</span>}</td>
      <td className="text-[11.5px]">{t.scheduleNotes || <span className="muted">—</span>}</td>
      <td>
        {t.recordingFolderUrl ? (
          <a href={t.recordingFolderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] hover:underline" style={{ color: 'var(--accent-gold)' }}>
            <FolderOpen size={11}/> Open folder <ExternalLink size={9}/>
          </a>
        ) : <span className="muted">—</span>}
      </td>
      <td className="mono">{t._count.sessions}</td>
      <td>
        <Pill color={t.status === 'active' ? 'green' : t.status === 'paused' ? 'amber' : 'grey'}>{t.status}</Pill>
      </td>
      <td className="text-right">
        <Link to={`/regular-trainings/${t.id}`}>
          <Button size="sm">Open →</Button>
        </Link>
      </td>
    </tr>
  );
}

function CreateTrainingButton() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [form, setForm] = useState({
    name: '',
    recordingAccountEmail: '',
    recordingAccountLabel: '',
    recordingFolderUrl: '',
    scheduleNotes: '',
    hostedByDefaultId: '',
    notes: '',
  });

  // Lazy-load users for the host picker only when the modal opens.
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => api.post('/regular-trainings/trainings', {
      ...form,
      hostedByDefaultId: form.hostedByDefaultId || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['regular-trainings'] });
      showToast('Training created');
      setOpen(false);
      setForm({ name: '', recordingAccountEmail: '', recordingAccountLabel: '', recordingFolderUrl: '', scheduleNotes: '', hostedByDefaultId: '', notes: '' });
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary"><Plus size={12}/> New training</Button>
      </DialogTrigger>
      <DialogContent
        title="New regular training"
        description="Maps to one row in the team's RegularCalls sheet — name + recording account + folder + host."
      >
        <div className="form-row">
          <Label>Training name *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Anita Training" autoFocus />
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          <div className="form-row">
            <Label>Recording account email</Label>
            <Input
              type="email"
              value={form.recordingAccountEmail}
              onChange={(e) => setForm({ ...form, recordingAccountEmail: e.target.value })}
              placeholder="jobstraining44@gmail.com"
            />
            <div className="text-[10px] muted mt-1">⚠ Password goes in 1Password, not here.</div>
          </div>
          <div className="form-row">
            <Label>Account label (optional)</Label>
            <Input value={form.recordingAccountLabel} onChange={(e) => setForm({ ...form, recordingAccountLabel: e.target.value })} placeholder="Account 1" />
          </div>
        </div>
        <div className="form-row">
          <Label>Recording folder URL (Google Drive)</Label>
          <Input value={form.recordingFolderUrl} onChange={(e) => setForm({ ...form, recordingFolderUrl: e.target.value })} placeholder="https://drive.google.com/drive/folders/…" />
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          <div className="form-row">
            <Label>Default host</Label>
            <Select value={form.hostedByDefaultId} onChange={(e) => setForm({ ...form, hostedByDefaultId: e.target.value })}>
              <option value="">— pick —</option>
              {(users || [])
                .filter((u: any) => ['manager', 'lead', 'account_manager', 'founder'].includes(u.role))
                .map((u: any) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
            </Select>
          </div>
          <div className="form-row">
            <Label>Schedule notes</Label>
            <Input value={form.scheduleNotes} onChange={(e) => setForm({ ...form, scheduleNotes: e.target.value })} placeholder="Mon/Wed/Fri 7-8 PM IST" />
          </div>
        </div>
        <div className="form-row">
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any context — trainer specifics, special instructions, etc." />
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create training'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
