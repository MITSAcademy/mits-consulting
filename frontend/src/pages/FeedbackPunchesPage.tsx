import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ── Types ─────────────────────────────────────────────────────────────── */
interface StaffMember { id: string; name: string; role: string }
interface Client { id: string; name: string; assignedAm?: { id: string; name: string } | null; hostOwner?: { id: string; name: string } | null }
interface Punch { id: string; clientId: string; punchedById: string; date: string; type: string; note?: string }
interface ComplianceData {
  week: { monday: string; saturday: string };
  clients: Client[];
  punches: Punch[];
  staff: StaffMember[];
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const VERBAL_IDS = ['u-mitali', 'u-bhavneet'];
const WRITTEN_IDS = ['u-kashish', 'u-muskan'];

function isoToDate(iso: string) {
  return new Date(iso + 'T00:00:00Z');
}

function fmtDate(iso: string) {
  return isoToDate(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function offsetWeek(from: string, delta: number) {
  const d = isoToDate(from);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return d.toISOString().slice(0, 10);
}

function daysBetween(monday: string): string[] {
  const days: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = isoToDate(monday);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function dayLabel(iso: string) {
  return isoToDate(iso).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2);
}

/* ── Main component ─────────────────────────────────────────────────────── */
export function FeedbackPunchesPage() {
  const { user } = useAuth();
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const [weekRef, setWeekRef] = useState<string | undefined>(undefined); // undefined = current week

  const { data, isLoading } = useQuery<ComplianceData>({
    queryKey: ['feedback-punches-compliance', weekRef],
    queryFn: () =>
      api.get(`/feedback-punches/compliance${weekRef ? `?week=${weekRef}` : ''}`).then((r) => r.data),
  });

  const punchMut = useMutation({
    mutationFn: (body: { clientId: string; date: string; type: string }) =>
      api.post('/feedback-punches', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback-punches-compliance'] }),
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/feedback-punches/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback-punches-compliance'] }),
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  const { week, clients, punches, staff } = data;
  const days = daysBetween(week.monday);
  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const verbalStaff = staff.filter(s => VERBAL_IDS.includes(s.id));
  const writtenStaff = staff.filter(s => WRITTEN_IDS.includes(s.id));

  const role = user?.role;
  const canPunchVerbal = role === 'founder' || role === 'manager' || role === 'lead';
  const canPunchWritten = role === 'founder' || role === 'manager' || role === 'account_manager';

  // Build punch lookup: clientId → staffId → Set<date>
  // Also id lookup: clientId+staffId+date → punchId
  const punchByKey: Record<string, string> = {};
  const punchByClientStaff: Record<string, Set<string>> = {};
  for (const p of punches) {
    const key = `${p.clientId}:${p.punchedById}:${p.date}`;
    punchByKey[key] = p.id;
    const csKey = `${p.clientId}:${p.punchedById}`;
    if (!punchByClientStaff[csKey]) punchByClientStaff[csKey] = new Set();
    punchByClientStaff[csKey].add(p.date);
  }

  function hasPunch(clientId: string, staffId: string, date: string) {
    return !!punchByKey[`${clientId}:${staffId}:${date}`];
  }

  function togglePunch(clientId: string, staffId: string, date: string, type: string) {
    const key = `${clientId}:${staffId}:${date}`;
    if (punchByKey[key]) {
      deleteMut.mutate(punchByKey[key]);
    } else {
      punchMut.mutate({ clientId, date, type });
    }
  }

  // Summary stats
  const totalClients = clients.length;
  let verbalDone = 0, writtenDone = 0;
  for (const c of clients) {
    const gotVerbal = verbalStaff.some(s => (punchByClientStaff[`${c.id}:${s.id}`]?.size ?? 0) > 0);
    const gotWritten = writtenStaff.some(s => days.some(d => hasPunch(c.id, s.id, d)));
    if (gotVerbal) verbalDone++;
    if (gotWritten) writtenDone++;
  }

  const navWeek = (delta: number) => {
    const base = weekRef ?? week.monday;
    setWeekRef(offsetWeek(base, delta));
  };

  const isPast = weekRef && weekRef < new Date().toISOString().slice(0, 10);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Feedback Compliance</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Week: {fmtDate(week.monday)} – {fmtDate(week.saturday)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navWeek(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekRef(undefined)}
            disabled={!weekRef}
          >
            This week
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navWeek(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Clients', value: totalClients, color: 'text-gray-900' },
          { label: 'Verbal Done', value: verbalDone, color: 'text-green-600' },
          { label: 'Verbal Missing', value: totalClients - verbalDone, color: totalClients - verbalDone > 0 ? 'text-red-600' : 'text-green-600' },
          { label: 'Written Done', value: writtenDone, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-600 min-w-[160px]">Client</th>

                {/* Verbal columns */}
                {verbalStaff.map(s => (
                  <th key={s.id} className="text-center py-3 px-3 font-semibold text-gray-600 min-w-[90px]">
                    <div className="text-xs uppercase tracking-wide text-indigo-600">{s.name}</div>
                    <div className="text-xs text-gray-400 font-normal">verbal / week</div>
                  </th>
                ))}

                {/* Written columns — per day */}
                {writtenStaff.map(s => (
                  <th key={s.id} colSpan={6} className="text-center py-3 px-3 font-semibold text-gray-600 border-l border-gray-100">
                    <div className="text-xs uppercase tracking-wide text-purple-600">{s.name}</div>
                    <div className="flex justify-center gap-1 mt-1">
                      {days.map(d => (
                        <span key={d} className="text-xs text-gray-400 w-6 text-center font-normal">{dayLabel(d)}</span>
                      ))}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.map(c => {
                const coordinator = c.assignedAm?.name || c.hostOwner?.name || '—';
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-gray-900">{c.name}</div>
                      <div className="text-xs text-gray-400">{coordinator}</div>
                    </td>

                    {/* Verbal: one cell per staff, one checkmark per week */}
                    {verbalStaff.map(s => {
                      const hasDone = (punchByClientStaff[`${c.id}:${s.id}`]?.size ?? 0) > 0;
                      const canAct = canPunchVerbal && !isPast;
                      return (
                        <td key={s.id} className="py-2.5 px-3 text-center">
                          <button
                            disabled={!canAct || punchMut.isPending || deleteMut.isPending}
                            onClick={() => {
                              if (!canAct) return;
                              // For verbal: use today's date; if already done, delete most recent
                              if (hasDone) {
                                // find any punch for this client+staff this week
                                const existingPunch = punches.find(p => p.clientId === c.id && p.punchedById === s.id && days.includes(p.date));
                                if (existingPunch) deleteMut.mutate(existingPunch.id);
                              } else {
                                punchMut.mutate({ clientId: c.id, date: todayIST, type: 'verbal' });
                              }
                            }}
                            className={`rounded-full p-0.5 transition-colors ${canAct ? 'hover:bg-gray-100 cursor-pointer' : 'cursor-default'}`}
                          >
                            {hasDone
                              ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                              : <XCircle className="h-5 w-5 text-gray-300" />}
                          </button>
                        </td>
                      );
                    })}

                    {/* Written: 6 day cells per staff */}
                    {writtenStaff.map((s, si) => (
                      days.map((d, di) => {
                        const done = hasPunch(c.id, s.id, d);
                        const isFuture = d > todayIST;
                        const canAct = canPunchWritten && !isFuture && !isPast;
                        return (
                          <td key={`${s.id}:${d}`} className={`py-2.5 px-1 text-center ${di === 0 && si === 0 ? 'border-l border-gray-100' : ''}`}>
                            <button
                              disabled={!canAct || punchMut.isPending || deleteMut.isPending}
                              onClick={() => canAct && togglePunch(c.id, s.id, d, 'written')}
                              className={`w-6 h-6 rounded-full flex items-center justify-center mx-auto transition-colors ${
                                done
                                  ? 'bg-purple-500 text-white'
                                  : isFuture
                                  ? 'bg-gray-100 cursor-not-allowed'
                                  : canAct
                                  ? 'bg-gray-200 hover:bg-purple-200 cursor-pointer'
                                  : 'bg-gray-100'
                              }`}
                            >
                              {done && <span className="text-xs font-bold">✓</span>}
                            </button>
                          </td>
                        );
                      })
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {clients.length === 0 && (
        <div className="text-center py-12 text-gray-400">No active clients found.</div>
      )}
    </div>
  );
}
