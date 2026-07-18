import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ── Types ─────────────────────────────────────────────────────────────── */
interface StaffMember { id: string; name: string; role: string }
interface Client { id: string; name: string; assignedAm?: { id: string; name: string } | null; hostOwner?: { id: string; name: string } | null }
interface ComplianceData {
  week: { monday: string; saturday: string };
  clients: Client[];
  verbalDone: { clientId: string; staffId: string }[];
  writtenDone: { clientId: string; staffId: string; date: string }[];
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
  const [weekRef, setWeekRef] = useState<string | undefined>(undefined);

  const { data, isLoading } = useQuery<ComplianceData>({
    queryKey: ['feedback-punches-compliance', weekRef],
    queryFn: () =>
      api.get(`/feedback-punches/compliance${weekRef ? `?week=${weekRef}` : ''}`).then((r) => r.data),
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  const { week, clients, verbalDone, writtenDone, staff } = data;
  const days = daysBetween(week.monday);

  const verbalStaff = staff.filter(s => VERBAL_IDS.includes(s.id));
  const writtenStaff = staff.filter(s => WRITTEN_IDS.includes(s.id));

  // Lookup sets
  const verbalSet = new Set(verbalDone.map(v => `${v.clientId}:${v.staffId}`));
  const writtenSet = new Set(writtenDone.map(w => `${w.clientId}:${w.staffId}:${w.date}`));

  // Stats
  const totalClients = clients.length;
  let verbalDoneCount = 0, writtenDoneCount = 0;
  for (const c of clients) {
    if (verbalStaff.some(s => verbalSet.has(`${c.id}:${s.id}`))) verbalDoneCount++;
    if (writtenStaff.some(s => days.some(d => writtenSet.has(`${c.id}:${s.id}:${d}`)))) writtenDoneCount++;
  }

  const navWeek = (delta: number) => {
    const base = weekRef ?? week.monday;
    setWeekRef(offsetWeek(base, delta));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Feedback Compliance</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Week: {fmtDate(week.monday)} – {fmtDate(week.saturday)} · auto-derived from feedback activity logs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navWeek(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekRef(undefined)} disabled={!weekRef}>
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
          { label: 'Verbal Done', value: verbalDoneCount, color: 'text-green-600' },
          { label: 'Verbal Missing', value: totalClients - verbalDoneCount, color: totalClients - verbalDoneCount > 0 ? 'text-red-600' : 'text-green-600' },
          { label: 'Written Done', value: writtenDoneCount, color: writtenDoneCount > 0 ? 'text-green-600' : 'text-red-600' },
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

                {verbalStaff.map(s => (
                  <th key={s.id} className="text-center py-3 px-3 font-semibold text-gray-600 min-w-[100px]">
                    <div className="text-xs uppercase tracking-wide text-indigo-600">{s.name}</div>
                    <div className="text-xs text-gray-400 font-normal">verbal / week</div>
                  </th>
                ))}

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

                    {/* Verbal: one cell per staff */}
                    {verbalStaff.map(s => {
                      const done = verbalSet.has(`${c.id}:${s.id}`);
                      return (
                        <td key={s.id} className="py-2.5 px-3 text-center">
                          {done
                            ? <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" />
                            : <XCircle className="h-5 w-5 text-gray-200 mx-auto" />}
                        </td>
                      );
                    })}

                    {/* Written: 6 day dots per staff */}
                    {writtenStaff.map((s, si) =>
                      days.map((d, di) => {
                        const done = writtenSet.has(`${c.id}:${s.id}:${d}`);
                        return (
                          <td key={`${s.id}:${d}`} className={`py-2.5 px-1 text-center ${di === 0 ? 'border-l border-gray-100' : ''}`}>
                            <div className={`w-5 h-5 rounded-full mx-auto ${done ? 'bg-purple-500' : 'bg-gray-100'}`} />
                          </td>
                        );
                      })
                    )}
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
