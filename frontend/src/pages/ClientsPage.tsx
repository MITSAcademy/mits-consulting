import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { stageColor, stageLabel } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';

const canSeeFinancial = (role: string) =>
  ['founder', 'demo_lead', 'manager', 'sales_closer', 'accounts', 'payment_processor'].includes(role);

// Roles that don't have a personal-ownership stake → "Mine only" doesn't make sense
const SHOW_MINE_FILTER_ROLES = ['demo_intake', 'demo_lead', 'recruiter', 'sales_closer', 'lead', 'staff'];

export function ClientsPage() {
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [mineOnly, setMineOnly] = useState(SHOW_MINE_FILTER_ROLES.includes(user.role));

  const { data: clients } = useQuery({
    queryKey: ['clients', search],
    queryFn: () => api.get('/clients', { params: { search } }).then((r) => r.data),
  });
  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.get('/sources').then((r) => r.data),
  });

  const [form, setForm] = useState({
    name: '', phoneCode: '+1', phoneDigits: '', email: '',
    engagementType: 'Support', currency: 'USD', source: '',
    intakeSkillHint: '', notes: '',
  });

  const create = useMutation({
    mutationFn: () => api.post('/clients', { ...form, lifecycle: 'Lead' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['metrics/home'] });
      showToast('Lead added');
      setOpen(false);
      setForm({ name: '', phoneCode: '+1', phoneDigits: '', email: '', engagementType: 'Support', currency: 'USD', source: '', intakeSkillHint: '', notes: '' });
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const showAmt = canSeeFinancial(user.role);
  // Filter to "mine" based on the user's role and ownership field on the client.
  const isMine = (c: any) => {
    if (user.role === 'demo_intake' || user.role === 'demo_lead') return c.intakeOwnerId === user.id;
    if (user.role === 'recruiter') {
      // recruiter "owns" a client if they have an open/proposed sourcing request on it
      return (c.sourcingRequests || []).some((r: any) => r.sentToId === user.id);
    }
    if (user.role === 'sales_closer') return c.salesOwnerId === user.id;
    if (user.role === 'lead' || user.role === 'staff') return c.hostOwnerId === user.id;
    return true;
  };
  const all = (clients || []) as any[];
  const list = mineOnly ? all.filter(isMine) : all;

  return (
    <>
      <Topbar
        title="Clients"
        subtitle={`${list.length}${mineOnly ? ' · mine' : ` of ${all.length}`}`}
        actions={
          <>
            {SHOW_MINE_FILTER_ROLES.includes(user.role) && (
              <div className="flex gap-1.5 mr-1">
                <Button size="sm" variant={mineOnly ? 'primary' : 'default'} onClick={() => setMineOnly(true)}>Mine</Button>
                <Button size="sm" variant={!mineOnly ? 'primary' : 'default'} onClick={() => setMineOnly(false)}>All</Button>
              </div>
            )}
            <Input
              placeholder="Search…"
              className="max-w-[240px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="primary">
                  <Plus size={14} /> New lead
                </Button>
              </DialogTrigger>
              <DialogContent title="New lead" description="Create a fresh client at Lead stage.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className="form-row md:col-span-2">
                    <Label>Name *</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="form-row">
                    <Label>Country code</Label>
                    <Select value={form.phoneCode} onChange={(e) => setForm({ ...form, phoneCode: e.target.value })}>
                      <option value="+1">US/Canada (+1)</option>
                      <option value="+91">India (+91)</option>
                      <option value="+44">UK (+44)</option>
                      <option value="+61">Australia (+61)</option>
                      <option value="+971">UAE (+971)</option>
                      <option value="+65">Singapore (+65)</option>
                    </Select>
                  </div>
                  <div className="form-row">
                    <Label>Phone digits</Label>
                    <Input value={form.phoneDigits} onChange={(e) => setForm({ ...form, phoneDigits: e.target.value.replace(/[^0-9]/g, '') })} />
                  </div>
                  <div className="form-row md:col-span-2">
                    <Label>Email</Label>
                    <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="form-row">
                    <Label>Engagement type</Label>
                    <Select value={form.engagementType} onChange={(e) => setForm({ ...form, engagementType: e.target.value })}>
                      <option>Support</option>
                      <option>Training</option>
                      <option>TaskBased</option>
                    </Select>
                  </div>
                  <div className="form-row">
                    <Label>Currency</Label>
                    <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                      <option>USD</option>
                      <option>CAD</option>
                      <option>INR</option>
                      <option>EUR</option>
                      <option>GBP</option>
                      <option>AUD</option>
                      <option>AED</option>
                    </Select>
                  </div>
                  <div className="form-row md:col-span-2">
                    <Label>Source</Label>
                    <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                      <option value="">— Select —</option>
                      {(sources || []).map((s: any) => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="form-row md:col-span-2">
                    <Label>Skill hint</Label>
                    <Input value={form.intakeSkillHint} onChange={(e) => setForm({ ...form, intakeSkillHint: e.target.value })} />
                  </div>
                  <div className="form-row md:col-span-2">
                    <Label>Notes</Label>
                    <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setOpen(false)}>Cancel</Button>
                  <Button variant="primary" disabled={!form.name || create.isPending} onClick={() => create.mutate()}>
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />
      <Page>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Stage</th>
                <th>Engagement</th>
                {showAmt && <th>Amount</th>}
                <th>Trainer</th>
                <th>Source</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c: any) => (
                <tr key={c.id} className="clickable">
                  <td>
                    <Link to={`/clients/${c.id}`}>
                      <div className="font-medium">{c.name}</div>
                      <div className="muted text-[11px]">
                        {c.phoneCode && c.phoneDigits ? `${c.phoneCode} ${c.phoneDigits}` : c.email || '—'}
                      </div>
                    </Link>
                  </td>
                  <td>
                    <Pill color={stageColor(c.lifecycle) as any}>{stageLabel(c.lifecycle)}</Pill>
                  </td>
                  <td>
                    <Pill color={c.engagementType === 'Training' ? 'purple' : c.engagementType === 'TaskBased' ? 'pink' : 'grey'}>
                      {c.engagementType}
                    </Pill>
                  </td>
                  {showAmt && (
                    <td className="mono">{c.cycleAmount ? `${c.currency} ${c.cycleAmount}` : '—'}</td>
                  )}
                  <td>{c.primaryTrainer?.name || '—'}</td>
                  <td className="muted text-[12px]">{c.source || '—'}</td>
                  <td>
                    {c.paymentPendingVaibhav && <Pill color="amber">Vaibhav</Pill>}{' '}
                    {c.partner && <Pill color="purple">Partner</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
