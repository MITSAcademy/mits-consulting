import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, uploadFile, fileUrl } from '@/lib/api';
import type { AvailabilitySlot } from '@/lib/utils';
import { AvailabilitySlotsEditor } from '@/components/AvailabilitySlotsEditor';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useState, useEffect } from 'react';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';
import { Link } from 'react-router-dom';
import { Plus, MessageCircle, FileAudio, Image, FileText, Upload, X, Mail, Send } from 'lucide-react';

type ProposalDraft = {
  trainerId?: string;
  trainerName?: string;
  trainerSkills?: string;
  trainerPhone?: string;
  trainerEmail?: string;
  // Optional MITS↔trainer private WhatsApp group link. If set, trainer notifications
  // go to the group instead of the personal phone (group is the preferred channel).
  whatsappGroupLink?: string;
  rateInr: number;
  experienceYears: number;
  // Trainer's availability windows for THIS request (captured by recruiter).
  availabilitySlots?: AvailabilitySlot[];
  notes?: string;
  // proof of confirmation (compulsory)
  confirmationKind?: 'Audio' | 'Screenshot';
  confirmationUrl?: string;
  confirmationFilename?: string;
  // optional legacy skill matrix file upload (kept for backward compat)
  skillMatrixUrl?: string;
  skillMatrixFilename?: string;
  // structured skill matrix entries (preferred)
  mustHaveSkills?: Array<{ skill: string; proficiency: number }>;
  softSkills?: Array<{ item: string; value: string }>;
};

const DEFAULT_SOFT_SKILLS: Array<{ item: string; value: string }> = [
  { item: 'Confident',           value: 'Yes' },
  { item: 'English Speaking',    value: 'Yes' },
  { item: 'Trustworthy',         value: 'Yes' },
  { item: 'Zoom',                value: 'Installed' },
  { item: 'Internet Connection', value: 'Active' },
];

function newDraft(seedSkills?: string[]): ProposalDraft {
  const mustHaveSkills = seedSkills && seedSkills.length > 0
    ? seedSkills.map((s) => ({ skill: s, proficiency: 4.5 }))
    : [{ skill: '', proficiency: 4.5 }];
  return {
    rateInr: 1000,
    experienceYears: 0,
    availabilitySlots: [],
    mustHaveSkills,
    softSkills: DEFAULT_SOFT_SKILLS.map((s) => ({ ...s })),
  };
}

/**
 * Parse the client's intake skill string into individual skill entries.
 * "Java, Spring Boot, Microservices, REST APIs" → ['Java','Spring Boot','Microservices','REST APIs']
 * Splits on commas, slashes, and the word "and"; trims & dedupes; caps at 8 entries.
 */
function parseClientSkills(raw?: string | null): string[] {
  if (!raw) return [];
  const parts = String(raw)
    .split(/[,/]|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 60);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(p); }
    if (out.length >= 8) break;
  }
  return out;
}

/** Build a wa.me URL for a trainer phone (handles +91 / +1 / loose digits). */
function waPhoneUrl(raw?: string, message?: string) {
  const digits = (raw || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}${message ? '?text=' + encodeURIComponent(message) : ''}`;
}

export function SourcingPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data } = useQuery({ queryKey: ['sourcing'], queryFn: () => api.get('/sourcing').then((r) => r.data) });
  const { data: trainers } = useQuery({ queryKey: ['trainers'], queryFn: () => api.get('/trainers').then((r) => r.data) });
  const [addTrainerOpen, setAddTrainerOpen] = useState(false);

  const open = (data || []).filter((r: any) => r.status === 'Open');
  const proposed = (data || []).filter((r: any) => r.status === 'Proposed');
  const closed = (data || []).filter((r: any) => r.status === 'Closed');

  return (
    <>
      <Topbar
        title="Sourcing requests"
        subtitle={`${open.length} open · ${proposed.length} proposed · ${closed.length} closed`}
        actions={
          <Button variant="primary" size="sm" onClick={() => setAddTrainerOpen(true)}>
            <Plus size={12}/> Add trainer to pool
          </Button>
        }
      />
      {addTrainerOpen && <AddTrainerInlineModal qc={qc} showToast={showToast} onClose={() => setAddTrainerOpen(false)} />}
      <Page>
        <div className="callout">
          Propose 1–4 trainers per request. You can <strong>append more proposals later</strong> any time —
          even after Team 2 has started verifying — as long as the request is still open and no trainer has been matched.
        </div>

        {open.length === 0 && proposed.length === 0 && (
          <div className="muted text-center py-8">No sourcing requests.</div>
        )}

        {open.length > 0 && (
          <>
            <div className="divider">Awaiting first proposals · {open.length}</div>
            {open.map((sr: any) => (
              <ProposalsCard key={sr.id} req={sr} trainers={trainers || []} qc={qc} showToast={showToast} mode="initial" />
            ))}
          </>
        )}

        {proposed.length > 0 && (
          <>
            <div className="divider">Proposed · awaiting verification · {proposed.length}</div>
            {proposed.map((sr: any) => (
              <ProposalsCard key={sr.id} req={sr} trainers={trainers || []} qc={qc} showToast={showToast} mode="append" />
            ))}
          </>
        )}

        {closed.length > 0 && (
          <>
            <div className="divider">Closed · trainer matched · {closed.length}</div>
            {closed.slice(0, 10).map((sr: any) => (
              <div key={sr.id} className="card mb-2">
                <div className="card-h">
                  <span>
                    <Link to={`/clients/${sr.client.id}`} className="hover:underline">{sr.client.name}</Link>{' '}
                    <Pill color="green">Closed</Pill>
                  </span>
                  <Pill>{sr.proposals.length} proposals</Pill>
                </div>
              </div>
            ))}
          </>
        )}
      </Page>
    </>
  );
}

function ProposalsCard({ req, trainers, qc, showToast, mode }: any) {
  const [open, setOpen] = useState(false);
  // Seed must-have skills from the client's intake. Aman can still edit/extend.
  const clientSkillsRaw = req.client?.intakeSkillHint
    || (req.client?.intakeData as any)?.detailed_skill_set
    || '';
  const seedSkills = parseClientSkills(clientSkillsRaw);
  const [proposals, setProposals] = useState<ProposalDraft[]>([newDraft(seedSkills)]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  const updateAt = (i: number, patch: Partial<ProposalDraft>) => {
    const np = [...proposals];
    np[i] = { ...np[i], ...patch };
    setProposals(np);
  };

  // Pre-flight check: every row needs name (or pool id) AND confirmation proof
  const validate = (): string | null => {
    const filled = proposals.filter((p) => p.trainerId || (p.trainerName && p.trainerName.trim()));
    if (filled.length === 0) return 'Add at least one trainer proposal.';
    for (let i = 0; i < filled.length; i++) {
      const p = filled[i];
      const label = p.trainerName || p.trainerId || `row ${i + 1}`;
      if (!p.confirmationUrl || !p.confirmationKind) {
        return `Upload trainer confirmation (audio call or WhatsApp screenshot) for "${label}".`;
      }
    }
    return null;
  };

  const submit = useMutation({
    mutationFn: () => {
      const err = validate();
      if (err) return Promise.reject(new Error(err));
      const payload = proposals
        .filter((p) => p.trainerId || (p.trainerName && p.trainerName.trim()))
        .map((p) => ({
          trainerId: p.trainerId || undefined,
          trainerName: p.trainerName,
          trainerSkills: p.trainerSkills,
          trainerPhone: p.trainerPhone,
          trainerEmail: p.trainerEmail,
          rateInr: p.rateInr,
          experienceYears: p.experienceYears,
          availabilitySlots: (p.availabilitySlots || []).filter((s) => s.window || s.fromIst || s.toIst),
          notes: p.notes,
          confirmationKind: p.confirmationKind,
          confirmationUrl: p.confirmationUrl,
          skillMatrixUrl: p.skillMatrixUrl,
          // Filter out blank skill rows; only send if there's at least one filled entry
          mustHaveSkills: (p.mustHaveSkills || []).filter((s) => s.skill?.trim()),
          softSkills: (p.softSkills || []).filter((s) => s.item?.trim()),
        }));
      return api.post(`/sourcing/${req.id}/proposals`, { proposals: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sourcing'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      showToast(mode === 'append' ? 'More proposals added' : 'Proposals sent');
      setOpen(false);
      setProposals([newDraft(seedSkills)]);
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message || 'Failed', 'error'),
  });

  // "Quick add to pool" — turns the inline-entered new-trainer fields into a real Trainer record
  // and switches the row to reference the pool trainer by id. Saves the recruiter from cancelling
  // and going to the Trainer pool page mid-flow.
  const addToPool = useMutation({
    mutationFn: async ({ idx }: { idx: number }) => {
      const p = proposals[idx];
      if (!p.trainerName?.trim()) throw new Error('Name is required to add to pool.');
      const phoneDigitsOnly = (p.trainerPhone || '').replace(/[^0-9]/g, '').slice(-10);
      const phoneCode = (p.trainerPhone || '').trim().startsWith('+1') ? '+1' : '+91';
      const r = await api.post('/trainers', {
        name: p.trainerName,
        skills: p.trainerSkills || '',
        email: p.trainerEmail || '',
        phoneCode: phoneCode,
        phoneDigits: phoneDigitsOnly || undefined,
        whatsappGroupLink: p.whatsappGroupLink || undefined,
        defaultRateInr: p.rateInr,
        experienceYears: p.experienceYears,
        rateModel: 'hourly',
        paymentMethod: 'UPI',
        active: true,
      });
      return { idx, trainer: r.data };
    },
    onSuccess: ({ idx, trainer }) => {
      qc.invalidateQueries({ queryKey: ['trainers'] });
      // Replace the row with the pool reference so the proposal will store trainerId
      updateAt(idx, { trainerId: trainer.id });
      showToast(`${trainer.name} added to pool`);
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message || 'Failed', 'error'),
  });

  // Upload helper for a single proposal row's file slot
  async function handleUpload(idx: number, kindKey: 'confirmation' | 'skillMatrix', file: File, confirmationKind?: 'Audio' | 'Screenshot') {
    setUploadingIdx(idx);
    try {
      const r = await uploadFile(file);
      if (kindKey === 'confirmation') {
        updateAt(idx, { confirmationKind, confirmationUrl: r.url, confirmationFilename: r.originalName });
      } else {
        updateAt(idx, { skillMatrixUrl: r.url, skillMatrixFilename: r.originalName });
      }
      showToast(`${r.originalName} uploaded`);
    } catch (e: any) {
      showToast(e.response?.data?.error || e.message || 'Upload failed', 'error');
    } finally {
      setUploadingIdx(null);
    }
  }

  const verifiedSummary = () => {
    const ps = req.proposals || [];
    const pending = ps.filter((p: any) => p.verification === 'Pending').length;
    const passed = ps.filter((p: any) => p.verification === 'Pass').length;
    const failed = ps.filter((p: any) => p.verification === 'Fail').length;
    return { pending, passed, failed };
  };
  const s = verifiedSummary();

  // Smart match — recruiters get the same weighted-match modal Anjali uses internally
  const [smartOpen, setSmartOpen] = useState(false);

  function handleSmartPick(trainer: any) {
    // Open the propose modal with the picked trainer pre-filled in row 0
    setProposals([{
      ...newDraft(seedSkills),
      trainerId: trainer.id,
      rateInr: trainer.defaultRateInr || 1000,
      experienceYears: trainer.experienceYears || 0,
    }]);
    setSmartOpen(false);
    setOpen(true);
  }

  return (
    <div className="card mb-3">
      <div className="card-h">
        <span>
          <Link to={`/clients/${req.client.id}`} className="hover:underline">{req.client.name}</Link>{' '}
          <Pill color={req.status === 'Open' ? 'amber' : 'blue'}>{req.status}</Pill>
        </span>
        <div className="flex gap-1.5 items-center">
          <Button size="sm" onClick={() => setSmartOpen(true)} title="Weighted match scoring — auto-rank trainers by skill / cost / experience / past success">
            🎯 Smart match
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="primary" size="sm">
                <Plus size={12} /> {mode === 'append' ? 'Add more proposals' : 'Propose trainers'}
              </Button>
            </DialogTrigger>
          <DialogContent
            title={mode === 'append' ? `Add more proposals · ${req.client.name}` : `Propose for ${req.client.name}`}
            description={mode === 'append'
              ? 'Append additional trainer options. Existing proposals stay intact and continue through verification.'
              : 'Recommend 1–4 trainers. Team 2 will Pass/Fail them.'}
            className="max-w-3xl"
          >
            <div className="space-y-3">
              {proposals.map((p, i) => {
                const pickedFromPool = trainers.find((t: any) => t.id === p.trainerId);
                const effectivePhone = pickedFromPool
                  ? `${pickedFromPool.phoneCode || ''}${pickedFromPool.phoneDigits || ''}`
                  : p.trainerPhone;
                const waUrl = waPhoneUrl(effectivePhone, `Hi, this is from MITS Solution about a training engagement for "${req.client.name}". Are you available?`);

                return (
                  <div key={i} className="bg-bg-input rounded p-3 grid md:grid-cols-2 gap-2.5">
                    <div className="form-row md:col-span-2">
                      <Label>From pool (or fill new below)</Label>
                      <Select value={p.trainerId || ''} onChange={(e) => updateAt(i, { trainerId: e.target.value, trainerName: '', trainerSkills: '' })}>
                        <option value="">— New trainer —</option>
                        {trainers.map((t: any) => <option key={t.id} value={t.id}>{t.name} · {t.skills}</option>)}
                      </Select>
                    </div>
                    {!p.trainerId && (
                      <>
                        <div className="form-row"><Label>Name *</Label><Input value={p.trainerName || ''} onChange={(e) => updateAt(i, { trainerName: e.target.value })} /></div>
                        <div className="form-row"><Label>Skills</Label><Input value={p.trainerSkills || ''} onChange={(e) => updateAt(i, { trainerSkills: e.target.value })} /></div>
                        <div className="form-row">
                          <Label>Phone</Label>
                          <Input value={p.trainerPhone || ''} onChange={(e) => updateAt(i, { trainerPhone: e.target.value })} placeholder="+91 9876543210" />
                        </div>
                        <div className="form-row"><Label>Email</Label><Input value={p.trainerEmail || ''} onChange={(e) => updateAt(i, { trainerEmail: e.target.value })} /></div>
                        <div className="form-row md:col-span-2">
                          <Label>WhatsApp group link <span className="muted normal-case">(optional — preferred channel; falls back to personal phone if blank)</span></Label>
                          <Input value={p.whatsappGroupLink || ''} onChange={(e) => updateAt(i, { whatsappGroupLink: e.target.value })} placeholder="https://chat.whatsapp.com/…" />
                        </div>
                      </>
                    )}
                    <div className="form-row"><Label>Rate ₹</Label><Input type="number" value={p.rateInr} onChange={(e) => updateAt(i, { rateInr: +e.target.value })} /></div>
                    <div className="form-row"><Label>Experience yrs</Label><Input type="number" value={p.experienceYears} onChange={(e) => updateAt(i, { experienceYears: +e.target.value })} /></div>

                    {/* Trainer-confirmed availability (visible to Anjali on the verification card) */}
                    <div className="form-row md:col-span-2">
                      <Label>Trainer availability (IST) <span className="muted normal-case">(when can THIS trainer take the session?)</span></Label>
                      <AvailabilitySlotsEditor
                        slots={p.availabilitySlots || []}
                        onChange={(slots) => updateAt(i, { availabilitySlots: slots })}
                      />
                    </div>

                    {/* Quick-add to pool */}
                    {!p.trainerId && p.trainerName?.trim() && (
                      <div className="md:col-span-2">
                        <Button
                          size="sm"
                          variant="amber"
                          disabled={addToPool.isPending}
                          onClick={() => addToPool.mutate({ idx: i })}
                          title="Create this trainer in the pool right now (so they're reusable for future requests)"
                        >
                          + Save as new trainer in pool
                        </Button>
                        <span className="text-[11px] muted ml-2">
                          Optional — they'll auto-promote on Pass anyway. Use this if you want them in the pool now.
                        </span>
                      </div>
                    )}
                    {p.trainerId && (
                      <div className="md:col-span-2 text-[11px] text-brand-green">
                        ✓ Linked to pool trainer
                      </div>
                    )}

                    {/* WhatsApp direct-chat button */}
                    <div className="md:col-span-2 flex flex-wrap gap-1.5">
                      {waUrl ? (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-sm"
                          style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}
                        >
                          <MessageCircle size={12}/> Open WhatsApp chat with trainer
                        </a>
                      ) : (
                        <span className="text-[11px] muted">Add phone to enable direct WhatsApp.</span>
                      )}
                    </div>

                    {/* Confirmation proof (compulsory) */}
                    <div className="form-row md:col-span-2">
                      <Label>Confirmation proof * <span className="muted normal-case ml-1">(audio recording of call OR WhatsApp screenshot of timing confirmation)</span></Label>
                      {p.confirmationUrl ? (
                        <div className="flex items-center gap-2 bg-bg-card rounded p-2 text-xs">
                          {p.confirmationKind === 'Audio' ? <FileAudio size={14}/> : <Image size={14}/>}
                          <span className="flex-1 truncate">{p.confirmationFilename || p.confirmationUrl}</span>
                          <Pill color="green">{p.confirmationKind}</Pill>
                          <button
                            type="button"
                            className="text-brand-red"
                            onClick={() => updateAt(i, { confirmationUrl: undefined, confirmationKind: undefined, confirmationFilename: undefined })}
                            title="Remove"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <label className="btn btn-sm cursor-pointer">
                            <FileAudio size={12}/> Audio recording
                            <input
                              type="file"
                              // No accept filter — recruiters forward WhatsApp voice notes which
                              // arrive as .ogg/.opus/.amr/.3gp and OS pickers often filter them out.
                              // We rebrand the file as .mp3 (audio/mpeg) below so storage + playback
                              // are uniform regardless of source format.
                              hidden
                              disabled={uploadingIdx === i}
                              onChange={(e) => {
                                const original = e.target.files?.[0];
                                if (original) {
                                  const normalized = new File(
                                    [original],
                                    `recording-${Date.now()}.mp3`,
                                    { type: 'audio/mpeg' }
                                  );
                                  handleUpload(i, 'confirmation', normalized, 'Audio');
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                          <label className="btn btn-sm cursor-pointer">
                            <Image size={12}/> WhatsApp screenshot
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              disabled={uploadingIdx === i}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUpload(i, 'confirmation', f, 'Screenshot');
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {uploadingIdx === i && <span className="text-xs muted">Uploading…</span>}
                        </div>
                      )}
                    </div>

                    {/* Skill matrix — structured criteria (preferred). File upload kept as fallback. */}
                    <div className="form-row md:col-span-2">
                      <Label>
                        Skill matrix criteria <span className="text-brand-red">*</span>
                        <span className="muted normal-case ml-1">(compulsory — sent to client before demo)</span>
                      </Label>
                      <div className="bg-bg-card rounded p-2.5 space-y-2">
                        <SkillMatrixEditor
                          mustHaveSkills={p.mustHaveSkills || []}
                          softSkills={p.softSkills || DEFAULT_SOFT_SKILLS}
                          onChange={(m, s) => updateAt(i, { mustHaveSkills: m, softSkills: s })}
                        />

                        {/* Legacy file upload — collapsed by default */}
                        <details className="text-xs">
                          <summary className="cursor-pointer muted">▸ or attach a file (PDF / Excel / image)</summary>
                          <div className="mt-2">
                            {p.skillMatrixUrl ? (
                              <div className="flex items-center gap-2 bg-bg-input rounded p-2 text-xs">
                                <FileText size={14}/>
                                <span className="flex-1 truncate">{p.skillMatrixFilename || p.skillMatrixUrl}</span>
                                <a href={fileUrl(p.skillMatrixUrl)} target="_blank" rel="noreferrer" className="text-brand-blue">view</a>
                                <button
                                  type="button"
                                  className="text-brand-red"
                                  onClick={() => updateAt(i, { skillMatrixUrl: undefined, skillMatrixFilename: undefined })}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <label className="btn btn-sm cursor-pointer">
                                <Upload size={12}/> Upload skill matrix
                                <input
                                  type="file"
                                  accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,image/*"
                                  hidden
                                  disabled={uploadingIdx === i}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUpload(i, 'skillMatrix', f);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </details>
                      </div>
                    </div>

                    <div className="form-row md:col-span-2"><Label>Notes</Label><Textarea value={p.notes || ''} onChange={(e) => updateAt(i, { notes: e.target.value })} /></div>

                    {proposals.length > 1 && (
                      <div className="md:col-span-2 flex justify-end">
                        <Button size="sm" variant="danger" onClick={() => setProposals(proposals.filter((_, ix) => ix !== i))}>Remove row</Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {proposals.length < 4 && (
                <Button onClick={() => setProposals([...proposals, newDraft(seedSkills)])}>
                  + Add another row
                </Button>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => submit.mutate()} disabled={submit.isPending}>
                {mode === 'append' ? 'Append proposals' : 'Send proposals'}
              </Button>
            </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {smartOpen && <SmartMatchForRecruiterModal clientId={req.client.id} clientName={req.client.name} onPick={handleSmartPick} onClose={() => setSmartOpen(false)} />}

      <div className="text-sm muted">
        Routed to: {req.sentTo?.name || '—'} · {req.sentAt}
        {mode === 'append' && (
          <>
            {' · '}
            <span className="text-brand-amber">{s.pending} pending</span>
            {s.passed > 0 && <> · <span className="text-brand-green">{s.passed} passed</span></>}
            {s.failed > 0 && <> · <span className="text-brand-red">{s.failed} failed</span></>}
          </>
        )}
      </div>

      {/* Show existing proposals inline so recruiter sees what's already in and can notify each trainer */}
      {req.proposals?.length > 0 && (
        <div className="mt-3 grid md:grid-cols-2 gap-2 text-xs">
          {req.proposals.map((p: any) => (
            <ProposalRowWithOutreach key={p.id} proposal={p} />
          ))}
        </div>
      )}

      {/* Previous demos — helps recruiters avoid proposing trainers the client already rejected */}
      {req.client.demos && req.client.demos.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs muted hover:text-brand-text">
            ▸ Previous demos for this client ({req.client.demos.length}) — what to avoid
          </summary>
          <div className="mt-2 grid md:grid-cols-2 gap-2 text-xs">
            {req.client.demos.map((d: any) => (
              <div key={d.id} className="bg-bg-input rounded p-2">
                <div className="flex justify-between items-center mb-0.5">
                  <span className="font-medium">{d.trainer?.name || '(removed trainer)'}</span>
                  <Pill color={d.status === 'Done' ? (d.outcome === 'Positive' ? 'green' : d.outcome === 'Negative' ? 'red' : 'amber') : d.status === 'Cancelled' ? 'red' : 'grey'}>
                    {d.status}{d.outcome ? ` · ${d.outcome}` : ''}
                  </Pill>
                </div>
                <div className="muted mono text-[11px]">{d.actualDate || d.scheduledDate || '—'}</div>
                {d.trainer?.skills && <div className="muted text-[11px] mt-0.5">{d.trainer.skills}</div>}
                {d.feedback && <div className="mt-1 italic text-[11px]">"{d.feedback}"</div>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// Inline "add a trainer to the pool" shortcut for recruiters working in the sourcing page.
// Reuses the standard /trainers POST endpoint with the minimum-viable fields.
function AddTrainerInlineModal({ qc, showToast, onClose }: any) {
  const [f, setF] = useState({
    name: '', skills: '', phoneCode: '+91', phoneDigits: '', email: '',
    whatsappGroupLink: '',
    defaultRateInr: 1000, experienceYears: 0, rateModel: 'hourly', paymentMethod: 'UPI', upiId: '',
  });
  const create = useMutation({
    mutationFn: () => api.post('/trainers', { ...f, defaultRateInr: +f.defaultRateInr, experienceYears: +f.experienceYears }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trainers'] });
      showToast('Trainer added to pool');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Add trainer to pool" description="Quick-add. Use for trainers you want available before opening a propose modal.">
        <div className="grid md:grid-cols-2 gap-2.5">
          <div className="form-row md:col-span-2"><Label>Name *</Label><Input value={f.name} onChange={(e) => setF({...f, name: e.target.value})} autoFocus /></div>
          <div className="form-row md:col-span-2"><Label>Skills</Label><Input value={f.skills} onChange={(e) => setF({...f, skills: e.target.value})} placeholder="e.g. Java, Spring Boot, AWS" /></div>
          <div className="form-row"><Label>Country code</Label>
            <Select value={f.phoneCode} onChange={(e) => setF({...f, phoneCode: e.target.value})}><option>+91</option><option>+1</option><option>+44</option><option>+61</option></Select>
          </div>
          <div className="form-row"><Label>Phone digits</Label><Input value={f.phoneDigits} onChange={(e) => setF({...f, phoneDigits: e.target.value.replace(/\D/g,'')})} /></div>
          <div className="form-row"><Label>Email</Label><Input value={f.email} onChange={(e) => setF({...f, email: e.target.value})} /></div>
          <div className="form-row"><Label>UPI ID</Label><Input value={f.upiId} onChange={(e) => setF({...f, upiId: e.target.value})} placeholder="name@okhdfcbank" /></div>
          <div className="form-row"><Label>Rate ₹</Label><Input type="number" value={f.defaultRateInr} onChange={(e) => setF({...f, defaultRateInr: +e.target.value})} /></div>
          <div className="form-row"><Label>Experience yrs</Label><Input type="number" value={f.experienceYears} onChange={(e) => setF({...f, experienceYears: +e.target.value})} /></div>
          <div className="form-row md:col-span-2">
            <Label>WhatsApp group link <span className="muted normal-case">(optional — preferred channel; can be added later from the trainer profile)</span></Label>
            <Input value={f.whatsappGroupLink} onChange={(e) => setF({...f, whatsappGroupLink: e.target.value})} placeholder="https://chat.whatsapp.com/…" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!f.name || create.isPending} onClick={() => create.mutate()}>Save to pool</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Proposal row with "Notify trainer" buttons ──────────────────────────
function ProposalRowWithOutreach({ proposal }: { proposal: any }) {
  const [open, setOpen] = useState(false);
  const hasEmail = !!(proposal.trainer?.email || proposal.trainerEmail);
  const hasGroup = !!proposal.trainer?.whatsappGroupLink;
  const hasPhone = !!(proposal.trainer?.phoneDigits || proposal.trainerPhone);
  const notified = !!proposal.trainerNotifiedAt;
  const canNotify = hasEmail && (hasGroup || hasPhone);
  return (
    <div className="bg-bg-input rounded p-2">
      <div className="font-medium flex justify-between items-center">
        <span>{proposal.trainer?.name || proposal.trainerName || '—'}</span>
        <Pill color={proposal.verification === 'Pass' ? 'green' : proposal.verification === 'Fail' ? 'red' : 'amber'}>{proposal.verification}</Pill>
      </div>
      <div className="muted mt-0.5">{proposal.trainer?.skills || proposal.trainerSkills} · ₹{proposal.rateInr}</div>

      {/* Compulsory notification status — must be set before Anjali can Pass */}
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        {notified ? (
          <Pill color="green">✓ Notified {proposal.trainerNotifiedAt}</Pill>
        ) : (
          <Pill color="red">⚠ Notify required</Pill>
        )}
        {hasGroup && <span className="text-[10px] muted">📢 group link on file</span>}
      </div>

      <div className="mt-1.5 flex gap-1.5 flex-wrap">
        <Button
          size="sm"
          variant={notified ? 'default' : 'primary'}
          onClick={() => setOpen(true)}
          title={canNotify ? 'Send deal/rate/host details — Email + WhatsApp (group preferred)' : 'Add trainer email and group link or phone first'}
          disabled={!canNotify}
        >
          <Send size={11}/> {notified ? 'Re-notify trainer' : 'Notify trainer (required)'}
        </Button>
        {!canNotify && (
          <span className="text-[10px] text-brand-amber">
            {!hasEmail && 'No email · '}
            {!hasGroup && !hasPhone && 'No group/phone · '}
            add via trainer profile
          </span>
        )}
      </div>
      {open && <NotifyTrainerModal proposal={proposal} onClose={() => setOpen(false)} />}
    </div>
  );
}

function NotifyTrainerModal({ proposal, onClose }: any) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();

  // Editable overrides — recruiter can tweak before sending
  const [pricingMode, setPricingMode] = useState<'session' | 'oneShot'>('session');
  const [rateInr, setRateInr] = useState<number>(proposal.rateInr || 0);
  const [hoursPerSession, setHoursPerSession] = useState<number>(2);
  const [paymentClearanceDay, setPaymentClearanceDay] = useState('Every Wednesday');
  const [demoCallTime, setDemoCallTime] = useState('');
  const [guidelinesLink, setGuidelinesLink] = useState('');
  const [subject, setSubject] = useState('');
  const [messageText, setMessageText] = useState('');
  // Tracks whether the user has manually edited the message body. Once true, auto-regeneration
  // from structured fields is suppressed so we don't clobber their wording.
  const [manualEdit, setManualEdit] = useState(false);
  const [trainerInfo, setTrainerInfo] = useState<any>(null);

  // Fetch initial preview when modal opens
  const { data: initial } = useQuery({
    queryKey: ['proposal-outreach', proposal.id],
    queryFn: () => api.get(`/sourcing/proposals/${proposal.id}/outreach`).then((r) => r.data),
  });

  // Pre-fill editable fields from server's suggested vars on first load
  useEffect(() => {
    if (initial) {
      setSubject((s) => s || initial.subject || '');
      setMessageText((m) => m || initial.text || '');
      setTrainerInfo(initial.trainer);
      if (initial.vars?.demoCallTime) setDemoCallTime((prev) => prev || initial.vars.demoCallTime);
      if (initial.vars?.rateInr && !rateInr) setRateInr(initial.vars.rateInr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.subject]);

  // Auto-regenerate the body when structured fields change — BUT only if the recruiter
  // hasn't manually edited the text. Their edits always win.
  useEffect(() => {
    if (!initial?.text || manualEdit) return;
    let txt: string = initial.text;
    const paymentLine = pricingMode === 'oneShot'
      ? `Payment:         ₹${rateInr.toLocaleString('en-IN')} (one-shot · full engagement)`
      : `Payment:         ₹${rateInr.toLocaleString('en-IN')} for ${hoursPerSession} hour${hoursPerSession === 1 ? '' : 's'}`;
    txt = txt.replace(/Payment:\s+₹[^\n]*/, paymentLine);
    txt = txt.replace(/Payment clearance:\s+[^\n]*/, `Payment clearance: ${paymentClearanceDay}`);
    if (demoCallTime.trim()) txt = txt.replace(/Demo call time:\s+[^\n]*/, `Demo call time:  ${demoCallTime}`);
    setMessageText(txt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingMode, rateInr, hoursPerSession, paymentClearanceDay, demoCallTime, initial?.text, manualEdit]);

  function resetMessageToAuto() {
    setManualEdit(false);
    // useEffect above will regenerate from current field values
    if (initial?.text) setMessageText(initial.text);
  }

  function buildOverrides() {
    const o: any = { rateInr, hoursPerSession, paymentClearanceDay, pricingMode };
    if (demoCallTime.trim()) o.demoCallTime = demoCallTime.trim();
    if (guidelinesLink.trim()) o.guidelinesLink = guidelinesLink.trim();
    // Pass the recruiter's edited subject/body verbatim — backend uses these as-is when present.
    if (subject.trim()) o.customSubject = subject.trim();
    if (messageText.trim()) o.customText = messageText;
    return o;
  }

  // Compulsory dual-send: email AND WhatsApp both go out for every trainer outreach.
  const sendBoth = useMutation({
    mutationFn: async () => {
      const overrides = buildOverrides();
      const e = await api.post(`/sourcing/proposals/${proposal.id}/outreach/email`, { overrides });
      const w = await api.post(`/sourcing/proposals/${proposal.id}/outreach/whatsapp`, { overrides });
      return { email: e.data, wa: w.data };
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      if (r.wa?.url) window.open(r.wa.url, '_blank', 'noopener');
      showToast(`Email sent · WhatsApp opened — tap Send in WhatsApp tab to complete`);
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const hasEmail = !!(proposal.trainer?.email || proposal.trainerEmail);
  const hasPhone = !!(proposal.trainer?.phoneDigits || proposal.trainerPhone);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Notify trainer · ${trainerInfo?.name || proposal.trainer?.name || proposal.trainerName || ''}`}
        description='Send the deal, rate, host contact and demo time. Recipient sees a branded MITS email + matching WhatsApp text.'
        className="max-w-2xl"
      >
        <div className="grid md:grid-cols-2 gap-3 mb-3">
          <div className="form-row md:col-span-2">
            <Label>Pricing mode</Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={pricingMode === 'session' ? 'primary' : 'default'}
                onClick={() => setPricingMode('session')}
              >Per session</Button>
              <Button
                size="sm"
                variant={pricingMode === 'oneShot' ? 'primary' : 'default'}
                onClick={() => setPricingMode('oneShot')}
              >One-shot (full project)</Button>
            </div>
          </div>
          <div className="form-row">
            <Label>{pricingMode === 'oneShot' ? 'Total project cost (₹)' : 'Rate (₹)'}</Label>
            <Input type="number" value={rateInr} onChange={(e) => setRateInr(+e.target.value)} />
          </div>
          {pricingMode === 'session' && (
            <div className="form-row">
              <Label>Hours / session</Label>
              <Input type="number" min={0.5} step={0.5} value={hoursPerSession} onChange={(e) => setHoursPerSession(+e.target.value)} />
            </div>
          )}
          <div className="form-row">
            <Label>Payment clearance day</Label>
            <Input value={paymentClearanceDay} onChange={(e) => setPaymentClearanceDay(e.target.value)} placeholder="Every Wednesday" />
          </div>
          <div className="form-row">
            <Label>Demo call time</Label>
            <Input value={demoCallTime} onChange={(e) => setDemoCallTime(e.target.value)} placeholder="8 AM Tomorrow · 21 May 2026" />
          </div>
          <div className="form-row md:col-span-2">
            <Label>Guidelines link (optional override)</Label>
            <Input value={guidelinesLink} onChange={(e) => setGuidelinesLink(e.target.value)} placeholder="https://drive.google.com/…" />
          </div>
        </div>

        <div className="bg-bg-input rounded p-3 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="muted">
              {manualEdit
                ? <span className="text-brand-amber">✎ Manually edited — auto-updates are paused</span>
                : 'Subject + message preview (auto-updates from fields above; edit freely)'}
            </div>
            {manualEdit && (
              <button
                onClick={resetMessageToAuto}
                className="text-[11px] text-brand-blue hover:underline"
                title="Discard your edits and regenerate the message from the structured fields"
              >
                Reset to auto
              </button>
            )}
          </div>

          <div className="form-row">
            <Label className="text-[10px]">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setManualEdit(true); }}
              placeholder={initial?.subject || 'Subject…'}
            />
          </div>

          <div className="form-row">
            <Label className="text-[10px]">Message body (edit anything)</Label>
            <Textarea
              rows={14}
              value={messageText}
              onChange={(e) => { setMessageText(e.target.value); setManualEdit(true); }}
              className="mono text-[11px]"
              placeholder="Loading preview…"
            />
          </div>
        </div>

        <DialogFooter>
          {(!hasEmail || !hasPhone) && (
            <div className="text-xs text-brand-amber mr-auto self-center">
              {!hasEmail && '⚠ No trainer email. '}
              {!hasPhone && '⚠ No trainer phone. '}
              Both required to send.
            </div>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!hasEmail || !hasPhone || sendBoth.isPending}
            onClick={() => sendBoth.mutate()}
            title='Sends branded email AND opens WhatsApp — both are compulsory'
          >
            <Mail size={12}/><MessageCircle size={12}/>{' '}
            {sendBoth.isPending ? 'Sending…' : 'Send (Email + WhatsApp)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reusable skill-matrix editor (used inside proposal rows) ─────────────
function SkillMatrixEditor({
  mustHaveSkills,
  softSkills,
  onChange,
}: {
  mustHaveSkills: Array<{ skill: string; proficiency: number }>;
  softSkills: Array<{ item: string; value: string }>;
  onChange: (m: Array<{ skill: string; proficiency: number }>, s: Array<{ item: string; value: string }>) => void;
}) {
  function patchM(idx: number, patch: Partial<{ skill: string; proficiency: number }>) {
    const next = mustHaveSkills.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next, softSkills);
  }
  function patchS(idx: number, patch: Partial<{ item: string; value: string }>) {
    const next = softSkills.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(mustHaveSkills, next);
  }
  function addM() {
    onChange([...mustHaveSkills, { skill: '', proficiency: 4.5 }], softSkills);
  }
  function removeM(idx: number) {
    onChange(mustHaveSkills.filter((_, i) => i !== idx), softSkills);
  }
  function addS() {
    onChange(mustHaveSkills, [...softSkills, { item: '', value: 'Yes' }]);
  }
  function removeS(idx: number) {
    onChange(mustHaveSkills, softSkills.filter((_, i) => i !== idx));
  }

  // Stacks vertically — previously grid-cols-2 inside an already 2-col parent which broke at narrow widths.
  return (
    <div className="space-y-4">
      {/* Must-have skills */}
      <div>
        <div className="text-[11px] font-semibold uppercase muted mb-1.5">
          Must Have Skills <span className="text-brand-textMuted normal-case">(proficiency out of 5)</span>
        </div>
        <div className="space-y-1.5">
          {mustHaveSkills.length === 0 && (
            <div className="text-[11px] muted italic py-1">No skills added — click "+ Skill" below to start.</div>
          )}
          {mustHaveSkills.map((row, i) => (
            <div key={i} className="flex gap-1.5 items-center min-w-0">
              <Input
                placeholder="e.g. Networking Security"
                value={row.skill}
                onChange={(e) => patchM(i, { skill: e.target.value })}
                className="text-xs"
                style={{ flex: '1 1 auto', minWidth: 0, width: 'auto' }}
              />
              <Input
                type="number"
                min={0}
                max={5}
                step={0.5}
                value={row.proficiency}
                onChange={(e) => patchM(i, { proficiency: Math.max(0, Math.min(5, +e.target.value)) })}
                className="text-xs text-center"
                style={{ flex: '0 0 72px', width: 72, padding: '9px 6px' }}
                title="0-5 in 0.5 increments"
              />
              <button
                type="button"
                onClick={() => removeM(i)}
                className="text-brand-red hover:opacity-80 px-1 flex-shrink-0"
                title="Remove"
              >
                <X size={12}/>
              </button>
            </div>
          ))}
        </div>
        <Button size="sm" onClick={addM} type="button" className="mt-1.5">+ Skill</Button>
      </div>

      {/* Soft skills checklist */}
      <div>
        <div className="text-[11px] font-semibold uppercase muted mb-1.5">Soft Skills &amp; Checklist</div>
        <div className="space-y-1.5">
          {softSkills.map((row, i) => (
            <div key={i} className="flex gap-1.5 items-center min-w-0">
              <Input
                placeholder="e.g. English Speaking"
                value={row.item}
                onChange={(e) => patchS(i, { item: e.target.value })}
                className="text-xs"
                style={{ flex: '1 1 auto', minWidth: 0, width: 'auto' }}
              />
              <Input
                placeholder="Yes / Installed …"
                value={row.value}
                onChange={(e) => patchS(i, { value: e.target.value })}
                className="text-xs"
                style={{ flex: '0 0 120px', width: 120 }}
              />
              <button
                type="button"
                onClick={() => removeS(i)}
                className="text-brand-red hover:opacity-80 px-1 flex-shrink-0"
                title="Remove"
              >
                <X size={12}/>
              </button>
            </div>
          ))}
        </div>
        <Button size="sm" onClick={addS} type="button" className="mt-1.5">+ Item</Button>
      </div>
    </div>
  );
}

// ─── Smart match modal for recruiters ──────────────────────────────────────
// Same weighted-match endpoint Anjali uses internally, but framed for recruiters:
// PII is hidden (no client phone/email/budget), only the skill requirement + ranking metrics.
function SmartMatchForRecruiterModal({ clientId, clientName, onPick, onClose }: any) {
  const [weights, setWeights] = useState({
    skill: 50, cost: 10, sessionCount: 10, teamSessions: 10, demoSuccess: 15, pastClients: 5,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['recruiter-match', clientId, weights],
    queryFn: () => api.get('/trainers/match', { params: { clientId, ...weights } }).then((r) => r.data),
  });
  const results = data?.results || [];
  const skillsRequired = data?.client?.skills || '';

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`🎯 Smart match · ${clientName}`}
        description='Weighted ranking across active pool: skill match · cost · past success · recency · team-5 usage.'
        className="max-w-4xl"
      >
        <div className="bg-bg-input rounded p-3 mb-3 text-xs">
          <div className="font-medium text-brand-text mb-1">Required skills (from client intake)</div>
          <div className="muted">{skillsRequired || '(none captured — match will use only metric weights)'}</div>
        </div>

        {/* Weight tuning */}
        <div className="callout blue mb-3">
          <div className="text-xs muted mb-1.5">Adjust weights (must sum ≈ 100) — re-ranks instantly</div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
            {(['skill', 'cost', 'sessionCount', 'teamSessions', 'demoSuccess', 'pastClients'] as const).map((k) => (
              <div key={k}>
                <Label className="text-[10px]">{k}</Label>
                <Input type="number" min={0} max={100} value={weights[k]}
                  onChange={(e) => setWeights({ ...weights, [k]: Math.max(0, Math.min(100, +e.target.value)) })}
                  className="text-xs text-center"/>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-bg-card rounded border border-brand-border overflow-hidden">
          <table className="text-xs">
            <thead>
              <tr>
                <th>#</th>
                <th>Trainer</th>
                <th>Skills</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Exp</th>
                <th className="text-right">Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="muted text-center py-4">Scoring…</td></tr>}
              {!isLoading && results.length === 0 && (
                <tr><td colSpan={7} className="muted text-center py-4">No matches. Lower the skill weight or widen the pool.</td></tr>
              )}
              {results.slice(0, 15).map((r: any, i: number) => {
                const t = r.trainer;
                return (
                  <tr key={t.id} className="hover:bg-bg-input">
                    <td className="muted">{i + 1}</td>
                    <td>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-[10px] muted">
                        {t.whatsappGroupLink ? '📢 group ✓' : t.phoneDigits ? '📱 personal phone' : '⚠ no contact'}
                        {!t.requiresVerification && ' · verified by us'}
                      </div>
                    </td>
                    <td className="max-w-[200px] truncate" title={t.skills}>{t.skills}</td>
                    <td className="text-right mono">₹{t.defaultRateInr}</td>
                    <td className="text-right mono">{t.experienceYears}y</td>
                    <td className="text-right">
                      <Pill color={r.score >= 75 ? 'green' : r.score >= 50 ? 'amber' : 'grey'}>{Math.round(r.score)}</Pill>
                    </td>
                    <td>
                      <Button size="sm" variant="primary" onClick={() => onPick(t)}>
                        Use this trainer →
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <span className="text-xs muted mr-auto self-center">
            Clicking "Use this trainer" pre-fills the propose modal with that trainer in row 1. You can still edit rate/skills/matrix before sending.
          </span>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

