import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';
import { formatPhone, waLink, readAvailabilitySlots, formatAvailabilitySlots } from '@/lib/utils';
import type { AvailabilitySlot } from '@/lib/utils';
import { AvailabilitySlotsEditor } from '@/components/AvailabilitySlotsEditor';
import { MessageCircle, ArrowUp, ArrowDown, Filter, X } from 'lucide-react';

type SortKey = 'name' | 'rate' | 'experience' | 'recent';

export function TrainersPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data } = useQuery({
    queryKey: ['trainers'],
    queryFn: () => api.get('/trainers').then((r) => r.data),
  });
  const [open, setOpen] = useState(false);

  // ─── Filter / sort state ──────────────────────────────────────────────
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [skillChips, setSkillChips] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [rateMin, setRateMin] = useState<string>('');
  const [rateMax, setRateMax] = useState<string>('');
  const [expMin, setExpMin] = useState<string>('');
  const [expMax, setExpMax] = useState<string>('');
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [onlyWithGroup, setOnlyWithGroup] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(false);

  function addSkillChip() {
    const s = skillInput.trim();
    if (s && !skillChips.includes(s.toLowerCase())) {
      setSkillChips([...skillChips, s.toLowerCase()]);
    }
    setSkillInput('');
  }

  function resetFilters() {
    setQ('');
    setSkillChips([]);
    setSkillInput('');
    setRateMin(''); setRateMax('');
    setExpMin(''); setExpMax('');
    setOnlyVerified(false);
    setOnlyWithGroup(false);
  }

  // ─── Apply filters + sort ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const min = rateMin ? +rateMin : -Infinity;
    const max = rateMax ? +rateMax : Infinity;
    const emin = expMin ? +expMin : -Infinity;
    const emax = expMax ? +expMax : Infinity;
    let list = (data || []).filter((t: any) => {
      if (!showInactive && !t.active) return false;
      if (onlyVerified && t.requiresVerification) return false; // verified = doesn't require verification
      if (onlyWithGroup && !t.whatsappGroupLink) return false;
      if (t.defaultRateInr < min || t.defaultRateInr > max) return false;
      if ((t.experienceYears || 0) < emin || (t.experienceYears || 0) > emax) return false;
      // skill chips: every chip must match the skills field
      const skillsLower = (t.skills || '').toLowerCase();
      if (skillChips.length > 0 && !skillChips.every((c) => skillsLower.includes(c))) return false;
      // free-text search across many fields
      if (q) {
        const hay = `${t.name} ${t.skills || ''} ${t.email || ''} ${t.phoneCode || ''}${t.phoneDigits || ''} ${t.upiId || ''} ${t.recruitedBy?.name || ''}`.toLowerCase();
        const ok = q.toLowerCase().split(/\s+/).every((tok) => hay.includes(tok));
        if (!ok) return false;
      }
      return true;
    });
    // sort
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a: any, b: any) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'rate':       av = a.defaultRateInr; bv = b.defaultRateInr; break;
        case 'experience': av = a.experienceYears || 0; bv = b.experienceYears || 0; break;
        case 'recent':     av = new Date(a.createdAt).getTime(); bv = new Date(b.createdAt).getTime(); break;
        default:           av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase();
      }
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
    return list;
  }, [data, q, showInactive, skillChips, rateMin, rateMax, expMin, expMax, onlyVerified, onlyWithGroup, sortKey, sortDir]);

  const activeFilterCount =
    (skillChips.length) +
    (rateMin ? 1 : 0) + (rateMax ? 1 : 0) +
    (expMin ? 1 : 0) + (expMax ? 1 : 0) +
    (onlyVerified ? 1 : 0) + (onlyWithGroup ? 1 : 0);

  const [form, setForm] = useState<any>({
    name: '', email: '', phoneCode: '+91', phoneDigits: '',
    skills: '', defaultRateInr: 1000, rateModel: 'hourly',
    experienceYears: 0, paymentMethod: 'UPI', upiId: '',
    whatsappGroupLink: '',
    availabilitySlots: [] as AvailabilitySlot[],
  });
  const create = useMutation({
    mutationFn: () => api.post('/trainers', { ...form, defaultRateInr: +form.defaultRateInr, experienceYears: +form.experienceYears }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trainers'] });
      showToast('Trainer added');
      setOpen(false);
    },
  });
  const toggleActive = useMutation({
    mutationFn: ({ id, active }: any) => api.patch(`/trainers/${id}`, { active }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['trainers'] });
      showToast(vars.active ? 'Trainer activated' : 'Trainer marked inactive');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <>
      <Topbar
        title="Trainer pool"
        subtitle={`${filtered.length} of ${data?.length || 0}${activeFilterCount ? ` · ${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active` : ''}`}
        actions={
          <>
            <Input
              placeholder="Search name / skills / phone / email / UPI…"
              className="max-w-[300px]"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button size="sm" variant={showFilters ? 'primary' : 'default'} onClick={() => setShowFilters(!showFilters)}>
              <Filter size={12}/> {showFilters ? 'Hide' : 'Filters'}
              {activeFilterCount > 0 && <span className="ml-1 px-1.5 rounded-full bg-brand-amber text-[10px] text-[#1A1B1E] font-bold">{activeFilterCount}</span>}
            </Button>
            <Button size="sm" variant={showInactive ? 'primary' : 'default'} onClick={() => setShowInactive(!showInactive)}>
              {showInactive ? 'Hiding inactive' : 'Show inactive'}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="primary">+ Add trainer</Button>
              </DialogTrigger>
              <DialogContent title="New trainer">
                <div className="grid md:grid-cols-2 gap-2.5">
                  <div className="form-row md:col-span-2">
                    <Label>Name *</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="form-row">
                    <Label>Email</Label>
                    <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="form-row">
                    <Label>Phone</Label>
                    <div className="flex gap-1">
                      <Select className="!w-20" value={form.phoneCode} onChange={(e) => setForm({ ...form, phoneCode: e.target.value })}>
                        <option>+91</option><option>+1</option><option>+44</option>
                      </Select>
                      <Input value={form.phoneDigits} onChange={(e) => setForm({ ...form, phoneDigits: e.target.value.replace(/\D/g, '') })} />
                    </div>
                  </div>
                  <div className="form-row md:col-span-2">
                    <Label>Skills</Label>
                    <Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
                  </div>
                  <div className="form-row">
                    <Label>Rate model</Label>
                    <Select value={form.rateModel} onChange={(e) => setForm({ ...form, rateModel: e.target.value })}>
                      <option value="hourly">Hourly</option>
                      <option value="per_session">Per session</option>
                    </Select>
                  </div>
                  <div className="form-row">
                    <Label>Default rate (₹)</Label>
                    <Input type="number" value={form.defaultRateInr} onChange={(e) => setForm({ ...form, defaultRateInr: +e.target.value })} />
                  </div>
                  <div className="form-row">
                    <Label>Experience (yrs)</Label>
                    <Input type="number" value={form.experienceYears} onChange={(e) => setForm({ ...form, experienceYears: +e.target.value })} />
                  </div>
                  <div className="form-row">
                    <Label>UPI ID</Label>
                    <Input value={form.upiId} onChange={(e) => setForm({ ...form, upiId: e.target.value })} />
                  </div>
                  <div className="form-row md:col-span-2">
                    <Label>WhatsApp group link <span className="muted normal-case">(optional · preferred channel)</span></Label>
                    <Input value={form.whatsappGroupLink} onChange={(e) => setForm({ ...form, whatsappGroupLink: e.target.value })} placeholder="https://chat.whatsapp.com/…" />
                  </div>
                  <div className="form-row md:col-span-2">
                    <Label>Availability (IST) <span className="muted normal-case">(when can this trainer take sessions? add one row per window)</span></Label>
                    <AvailabilitySlotsEditor
                      slots={form.availabilitySlots}
                      onChange={(slots) => setForm({ ...form, availabilitySlots: slots })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setOpen(false)}>Cancel</Button>
                  <Button variant="primary" disabled={!form.name} onClick={() => create.mutate()}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />
      <Page>

        {/* ─── Filters panel ─────────────────────────────────────────── */}
        {showFilters && (
          <div className="card mb-3">
            <div className="card-h">
              <span>Filters &amp; sort</span>
              {activeFilterCount > 0 && (
                <button onClick={resetFilters} className="text-xs text-brand-blue hover:underline">Reset all</button>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Skill chips */}
              <div>
                <Label>Skills (every chip must match)</Label>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {skillChips.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1 bg-bg-input rounded-full px-2 py-0.5 text-xs">
                      {c}
                      <button onClick={() => setSkillChips(skillChips.filter((x) => x !== c))} className="text-brand-red hover:opacity-80">
                        <X size={10}/>
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="e.g. spring, react, aws — Enter to add"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkillChip(); } }}
                  />
                  <Button size="sm" onClick={addSkillChip} disabled={!skillInput.trim()}>+ Add</Button>
                </div>
              </div>

              {/* Rate band */}
              <div>
                <Label>Rate band (₹)</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" placeholder="min" value={rateMin} onChange={(e) => setRateMin(e.target.value)} />
                  <span className="muted">–</span>
                  <Input type="number" placeholder="max" value={rateMax} onChange={(e) => setRateMax(e.target.value)} />
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <button onClick={() => { setRateMin('0'); setRateMax('1000'); }} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-input hover:bg-bg-card">≤ ₹1000</button>
                  <button onClick={() => { setRateMin('1000'); setRateMax('1500'); }} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-input hover:bg-bg-card">₹1000-1500</button>
                  <button onClick={() => { setRateMin('1500'); setRateMax(''); }} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-input hover:bg-bg-card">₹1500+</button>
                </div>
              </div>

              {/* Experience band */}
              <div>
                <Label>Experience (years)</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" placeholder="min" value={expMin} onChange={(e) => setExpMin(e.target.value)} />
                  <span className="muted">–</span>
                  <Input type="number" placeholder="max" value={expMax} onChange={(e) => setExpMax(e.target.value)} />
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <button onClick={() => { setExpMin('0'); setExpMax('3'); }} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-input hover:bg-bg-card">Junior 0-3y</button>
                  <button onClick={() => { setExpMin('3'); setExpMax('8'); }} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-input hover:bg-bg-card">Mid 3-8y</button>
                  <button onClick={() => { setExpMin('8'); setExpMax(''); }} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-input hover:bg-bg-card">Senior 8+y</button>
                </div>
              </div>

              {/* Toggles + sort */}
              <div>
                <Label>Toggles &amp; sort</Label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={onlyVerified} onChange={(e) => setOnlyVerified(e.target.checked)}/>
                    Verified only (no requiresVerification flag)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={onlyWithGroup} onChange={(e) => setOnlyWithGroup(e.target.checked)}/>
                    Has WhatsApp group link
                  </label>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="flex-1">
                    <option value="name">Sort by Name</option>
                    <option value="rate">Sort by Rate</option>
                    <option value="experience">Sort by Experience</option>
                    <option value="recent">Sort by Added (recent)</option>
                  </Select>
                  <Button size="sm" onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')} title={sortDir === 'asc' ? 'Ascending' : 'Descending'}>
                    {sortDir === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Skills</th>
                <th>Rate</th>
                <th>Exp</th>
                <th>Recruiter</th>
                <th>Channel</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="muted text-center py-6">
                  {q || activeFilterCount ? 'No trainers match your filters.' : 'No trainers in pool.'}
                </td></tr>
              ) : filtered.map((t: any) => {
                const phone = formatPhone(t.phoneCode, t.phoneDigits);
                const wa = t.phoneDigits ? waLink(t.phoneCode, t.phoneDigits) : '';
                return (
                  <tr key={t.id} className="clickable">
                    <td>
                      <Link to={`/trainers/${t.id}`} className="font-medium">{t.name}</Link>
                      <div className="muted text-[11px]">{t.email}</div>
                    </td>
                    <td>
                      {phone ? (
                        <div className="flex items-center gap-1.5">
                          <span className="mono text-xs">{phone}</span>
                          {wa && (
                            <a href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                              title="WhatsApp trainer"
                              style={{ color: '#25D366' }}>
                              <MessageCircle size={13}/>
                            </a>
                          )}
                        </div>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="text-xs max-w-[260px]">
                      <div title={t.skills}>{t.skills}</div>
                      {(() => {
                        const slots = readAvailabilitySlots(t);
                        if (!slots.length) return null;
                        return <div className="muted text-[10px] mt-0.5">🕒 {formatAvailabilitySlots(slots)} IST</div>;
                      })()}
                    </td>
                    <td className="mono">₹{t.defaultRateInr} <span className="muted text-xs">{t.rateModel === 'hourly' ? '/hr' : '/sess'}</span></td>
                    <td className="mono">{t.experienceYears}y</td>
                    <td>{t.recruitedBy?.name || '—'}</td>
                    <td>
                      {t.whatsappGroupLink ? (
                        <a href={t.whatsappGroupLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Open WhatsApp group">
                          <Pill color="green">📢 Group</Pill>
                        </a>
                      ) : t.phoneDigits ? (
                        <Pill>Personal</Pill>
                      ) : (
                        <Pill color="amber">—</Pill>
                      )}
                    </td>
                    <td>{t.active ? <Pill color="green">Active</Pill> : <Pill color="red">Inactive</Pill>}</td>
                    <td>
                      <Button
                        size="sm"
                        variant={t.active ? 'default' : 'success'}
                        onClick={(e) => { e.stopPropagation(); toggleActive.mutate({ id: t.id, active: !t.active }); }}
                      >
                        {t.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
