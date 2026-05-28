import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl } from '@/lib/api';
import { readAvailabilitySlots, formatAvailabilitySlots } from '@/lib/utils';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Label, Textarea } from '@/components/ui/input';
import { useState } from 'react';
import { useAuth } from '@/store/auth';
import { Check, X } from 'lucide-react';

const ORDER = { Pending: 0, Fail: 1, Pass: 2 } as const;

function matchScore(required: string, skills: string) {
  if (!required || !skills) return 0;
  const toks = required.toLowerCase().split(/[,\s/+]+/).filter((s) => s.length > 2);
  if (!toks.length) return 0;
  let hits = 0;
  toks.forEach((t) => { if (skills.toLowerCase().includes(t)) hits++; });
  return Math.round((hits / toks.length) * 100);
}

export function VerificationsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;
  const [failingProposal, setFailingProposal] = useState<{ requestId: string; proposalId: string; trainerName: string } | null>(null);
  // Default to "Mine only" for Anjali/Taran so they aren't distracted by their colleague's queue
  const [mineOnly, setMineOnly] = useState(user.role === 'demo_intake');

  const { data: dataRaw } = useQuery({
    queryKey: ['sourcing', 'Proposed'],
    queryFn: () => api.get('/sourcing', { params: { status: 'Proposed' } }).then((r) => r.data),
  });

  // Filter to only requests where I'm the intake owner of the underlying client
  const data = mineOnly
    ? (dataRaw || []).filter((r: any) => r.client.intakeOwnerId === user.id)
    : (dataRaw || []);

  // Clients stuck at VerificationPending but with NO proposals (orphan state).
  const { data: allClients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data),
  });

  const orphans = (allClients || []).filter((c: any) =>
    c.lifecycle === 'VerificationPending'
    && (!mineOnly || c.intakeOwnerId === user.id)
  )
    .filter((c: any) => {
      const inProposed = (data || []).some((r: any) => r.client.id === c.id);
      return !inProposed;
    });

  const moveBack = useMutation({
    mutationFn: ({ clientId, lifecycle }: any) => api.post(`/clients/${clientId}/stage`, { lifecycle }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['sourcing'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Moved back');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  // Pass: single atomic server-side endpoint handles everything —
  // marks Pass, auto-fails others, creates trainer if new, sets primary trainer,
  // moves client to TrainerMatched, closes request.
  const pass = useMutation({
    mutationFn: ({ proposal }: any) => api.post(`/sourcing/proposal/${proposal.id}/pass`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sourcing'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['trainers'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Verified → trainer matched');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const fail = useMutation({
    mutationFn: ({ proposalId, reason }: any) =>
      api.patch(`/sourcing/proposal/${proposalId}`, {
        verification: 'Fail',
        verificationNotes: reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sourcing'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Proposal failed');
      setFailingProposal(null);
    },
  });

  const sendBack = useMutation({
    mutationFn: async (request: any) => {
      await api.patch(`/sourcing/${request.id}`, { status: 'Open' });
      await api.patch(`/clients/${request.client.id}`, { lifecycle: 'WithRecruiters' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sourcing'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      showToast('Sent back to recruiters');
    },
  });

  const toggleVer = useMutation({
    mutationFn: ({ clientId, value }: any) => api.patch(`/clients/${clientId}`, { requiresVerification: value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sourcing'] }); showToast('Updated'); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const items = data || [];

  return (
    <>
      <Topbar
        title="Verifications"
        subtitle={`${items.length} pending${mineOnly ? ' (mine)' : ''}${orphans.length ? ` · ${orphans.length} orphaned` : ''}`}
        actions={
          ['demo_intake', 'demo_lead', 'founder', 'manager'].includes(user.role) ? (
            <div className="flex gap-1.5">
              <Button size="sm" variant={mineOnly ? 'primary' : 'default'} onClick={() => setMineOnly(true)}>Mine</Button>
              <Button size="sm" variant={!mineOnly ? 'primary' : 'default'} onClick={() => setMineOnly(false)}>All Team 2</Button>
            </div>
          ) : null
        }
      />
      <Page>
        <div className="callout">
          Recruiters propose trainers — sometimes 3 or 4 options. Pass/Fail each one. First Pass becomes the matched trainer and the rest auto-close.
        </div>

        {orphans.length > 0 && (
          <div className="card mb-4" style={{ borderColor: '#EF4444' }}>
            <div className="card-h" style={{ color: '#EF4444' }}>
              Stuck in Verify proposal · no proposals on file · {orphans.length}
            </div>
            <div className="muted text-xs mb-2">
              These clients are in "Verify proposal" stage but no recruiter has submitted a proposal yet.
              Move them back to <em>With recruiters</em> (chase Aman/Kanchan) or <em>Internal search</em>.
            </div>
            <div className="space-y-1.5">
              {orphans.map((c: any) => (
                <div key={c.id} className="bg-bg-input rounded p-2 flex justify-between items-center">
                  <Link to={`/clients/${c.id}`} className="font-medium text-sm">{c.name}</Link>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="amber" onClick={() => moveBack.mutate({ clientId: c.id, lifecycle: 'WithRecruiters' })}>
                      → With recruiters
                    </Button>
                    <Button size="sm" onClick={() => moveBack.mutate({ clientId: c.id, lifecycle: 'InternalSearch' })}>
                      → Internal search
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {items.length === 0 && orphans.length === 0 ? (
          <div className="text-center py-12 muted">
            <div className="text-base font-semibold text-brand-text mb-1">All clear</div>
            <div>No recruiter proposals awaiting verification.</div>
          </div>
        ) : items.map((req: any) => {
          const intake = (req.client.intakeData as any) || {};
          const required = intake.detailed_skill_set || req.client.intakeSkillHint || '';
          const sorted = [...req.proposals].sort((a: any, b: any) => ORDER[a.verification as keyof typeof ORDER] - ORDER[b.verification as keyof typeof ORDER]);
          const allFailed = req.proposals.length > 0 && req.proposals.every((p: any) => p.verification === 'Fail');

          return (
            <div key={req.id} className="card mb-4">
              <div className="flex justify-between items-start flex-wrap gap-2.5 mb-3.5">
                <div>
                  <div className="text-base font-semibold mb-0.5">
                    <Link to={`/clients/${req.client.id}`} className="hover:underline">{req.client.name}</Link>
                  </div>
                  <div className="muted text-xs">
                    {req.proposals.length} proposal{req.proposals.length === 1 ? '' : 's'} from {req.sentTo?.name || '—'}
                  </div>
                </div>
                <div className="flex gap-1.5 items-center">
                  {!req.client.requiresVerification && <Pill>Verification disabled</Pill>}
                  <Button size="sm" onClick={() => toggleVer.mutate({ clientId: req.client.id, value: !req.client.requiresVerification })}>
                    {req.client.requiresVerification ? 'Make optional' : 'Make required'}
                  </Button>
                </div>
              </div>

              <div className="callout blue mb-3.5">
                <div className="grid md:grid-cols-2 gap-2 text-xs">
                  <div><span className="muted">Skills required:</span> <strong>{required || '—'}</strong></div>
                  <div><span className="muted">Priority task:</span> {intake.current_priority_task || '—'}</div>
                  <div><span className="muted">Demo timing:</span> {intake.demo_timing_ist || '—'}</div>
                  <div><span className="muted">Session timing:</span> {intake.session_timing_ist || '—'}</div>
                  <div><span className="muted">Trainer preference:</span> {intake.trainer_preference || '—'}</div>
                  <div><span className="muted">Meeting tool:</span> {intake.meeting_tool || '—'}</div>
                </div>
              </div>

              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                {sorted.map((p: any) => {
                  const tName = p.trainer?.name || p.trainerName || '—';
                  const tSkills = p.trainer?.skills || p.trainerSkills || '';
                  const tExp = p.trainer?.experienceYears ?? p.experienceYears ?? 0;
                  const tPhone = p.trainerPhone || '';
                  const tEmail = p.trainerEmail || '';
                  const score = matchScore(required, tSkills);
                  const v = p.verification as 'Pending' | 'Pass' | 'Fail';
                  const border = v === 'Pass' ? '2px solid #4ADE80' : v === 'Fail' ? '2px solid #EF4444' : '1px solid #33363D';

                  return (
                    <div key={p.id} className="bg-bg-card rounded-md p-3" style={{ border }}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-semibold text-sm">
                            {tName}
                            {!p.trainer?.id && <Pill color="amber" className="ml-1.5 !text-[9px]">New</Pill>}
                          </div>
                          <div className="muted text-[11px]">via {p.proposedBy?.name || '—'}</div>
                        </div>
                        <Pill color={v === 'Pass' ? 'green' : v === 'Fail' ? 'red' : 'amber'}>{v}</Pill>
                      </div>
                      <div className="text-xs leading-relaxed">
                        <div><span className="muted">Skills:</span> <strong>{tSkills || '—'}</strong></div>
                        <div><span className="muted">Experience:</span> {tExp}yrs</div>
                        <div><span className="muted">Rate:</span> <span className="mono">₹{p.rateInr}</span></div>
                        <div><span className="muted">Phone:</span> <span className="mono">{tPhone || '—'}</span></div>
                        <div><span className="muted">Email:</span> {tEmail || '—'}</div>
                        {(() => {
                          const slots = readAvailabilitySlots(p);
                          if (!slots.length) return null;
                          return (
                            <div>
                              <span className="muted">Availability:</span>{' '}
                              <span>🕒 {formatAvailabilitySlots(slots)} IST</span>
                            </div>
                          );
                        })()}
                        <div className="mt-1">
                          <span className="muted">Match:</span>{' '}
                          <strong style={{ color: score >= 60 ? '#4ADE80' : score >= 30 ? '#F59E0B' : '#EF4444' }}>{score}%</strong>
                        </div>
                      </div>
                      {p.notes && <div className="muted text-[11px] mt-2 italic">"{p.notes}"</div>}

                      {/* Attached proofs */}
                      <div className="mt-2 space-y-1 text-[11px]">
                        {p.confirmationUrl && (
                          <div className="flex items-center gap-2 bg-bg-input rounded p-1.5">
                            <Pill color={p.confirmationKind === 'Audio' ? 'purple' : 'blue'}>
                              {p.confirmationKind}
                            </Pill>
                            {p.confirmationKind === 'Audio' ? (
                              <audio controls src={fileUrl(p.confirmationUrl)} style={{ height: 28, flex: 1 }} />
                            ) : (
                              <a href={fileUrl(p.confirmationUrl)} target="_blank" rel="noreferrer" className="text-brand-blue flex-1 underline">
                                View screenshot
                              </a>
                            )}
                          </div>
                        )}
                        {p.skillMatrixUrl && (
                          <div>
                            <a href={fileUrl(p.skillMatrixUrl)} target="_blank" rel="noreferrer" className="text-brand-blue underline">
                              View skill matrix →
                            </a>
                          </div>
                        )}
                        {tPhone && (
                          <a
                            href={`https://wa.me/${tPhone.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded"
                            style={{ background: '#25D366', color: 'white', fontSize: 11 }}
                          >
                            WhatsApp trainer
                          </a>
                        )}
                      </div>

                      {v === 'Pending' && (
                        <div className="flex gap-1.5 mt-2.5">
                          <Button size="sm" variant="success" className="flex-1 justify-center"
                            onClick={() => pass.mutate({ request: req, proposal: p })}>
                            <Check size={12}/> Pass
                          </Button>
                          <Button size="sm" variant="danger" className="flex-1 justify-center"
                            onClick={() => setFailingProposal({ requestId: req.id, proposalId: p.id, trainerName: tName })}>
                            <X size={12}/> Fail
                          </Button>
                        </div>
                      )}
                      {v === 'Fail' && p.verificationNotes && (
                        <div className="text-[11px] text-brand-red mt-1.5"><strong>Failed:</strong> {p.verificationNotes}</div>
                      )}
                      {v === 'Pass' && (
                        <div className="text-[11px] text-brand-green mt-1.5 font-medium">✓ Matched and ready for demo</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {allFailed && (
                <div className="callout red mt-3.5">
                  All proposals failed.{' '}
                  <Button size="sm" variant="danger" className="ml-2" onClick={() => sendBack.mutate(req)}>
                    Send back to recruiters
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {failingProposal && (
          <FailReasonModal
            trainerName={failingProposal.trainerName}
            onClose={() => setFailingProposal(null)}
            onConfirm={(reason) => fail.mutate({ proposalId: failingProposal.proposalId, reason })}
          />
        )}
      </Page>
    </>
  );
}

function FailReasonModal({ trainerName, onClose, onConfirm }: { trainerName: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Fail proposal · ${trainerName}`} description="Other proposals on this client stay pending.">
        <div className="form-row">
          <Label>Reason</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. skill stack doesn't match, rate too high, timing won't work" />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
            <X size={14}/> Fail this proposal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
