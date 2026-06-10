import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Pill } from '@/components/ui/pill';
import { TableProperties } from 'lucide-react';
import { useState } from 'react';
import { todayISO } from '@/lib/utils';

function mondayOf(iso: string) {
  const d = new Date(iso);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtWeek(monday: string) {
  const end = addDays(monday, 6);
  const fmt = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };
  return `${fmt(monday)} – ${fmt(end)}`;
}

type Log = {
  id: string;
  date: string;
  hours: number;
  rateSnapshot: number;
  amountInr: number;
  status: string;
  notes?: string;
  trainer: { id: string; name: string };
  client?: { id: string; name: string } | null;
};

type TrainerRow = {
  trainerId: string;
  trainerName: string;
  logs: Log[];
  totalDays: number;
  totalAmount: number;
};

const STATUS_COLOR: Record<string, 'green' | 'blue' | 'amber' | 'grey'> = {
  Paid: 'green',
  PaymentApproved: 'blue',
  ReadyForFinal: 'amber',
  Logged: 'grey',
};

export function TrainerPaySheetPage() {
  const [weekStart, setWeekStart] = useState(mondayOf(todayISO()));

  const { data: logs, isLoading } = useQuery({
    queryKey: ['session-logs', { weekStart }],
    queryFn: () =>
      api.get('/session-logs', { params: { weekStart } }).then((r) => r.data as Log[]),
  });

  // Group by trainer
  const trainerMap = new Map<string, TrainerRow>();
  for (const l of logs || []) {
    if (!trainerMap.has(l.trainer.id)) {
      trainerMap.set(l.trainer.id, {
        trainerId: l.trainer.id,
        trainerName: l.trainer.name,
        logs: [],
        totalDays: 0,
        totalAmount: 0,
      });
    }
    const row = trainerMap.get(l.trainer.id)!;
    row.logs.push(l);
    row.totalDays += l.hours;
    row.totalAmount += l.amountInr;
  }
  const rows = Array.from(trainerMap.values()).sort((a, b) =>
    a.trainerName.localeCompare(b.trainerName)
  );

  const grandTotal = rows.reduce((s, r) => s + r.totalAmount, 0);
  const grandDays = rows.reduce((s, r) => s + r.totalDays, 0);

  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));

  return (
    <>
      <Topbar
        title="Trainer payment sheet"
        subtitle={fmtWeek(weekStart)}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-icon" onClick={prevWeek}>‹</button>
            <input
              type="date"
              className="input !w-auto"
              value={weekStart}
              onChange={(e) => setWeekStart(mondayOf(e.target.value))}
            />
            <button className="btn-icon" onClick={nextWeek}>›</button>
          </div>
        }
      />
      <Page>
        {rows.length > 0 && (
          <div className="callout gold mb-4 flex justify-between text-sm">
            <span>
              <strong>{rows.length}</strong> trainers · <strong>{grandDays}</strong> sessions total
            </span>
            <span className="mono font-bold">₹{grandTotal.toLocaleString()}</span>
          </div>
        )}

        {isLoading ? (
          <div className="muted text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={TableProperties}
            tone="grey"
            title="No sessions this week"
            description="Navigate to a different week, or log sessions first via Session logs."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {rows.map((row) => (
              <div key={row.trainerId} className="card">
                {/* Trainer header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-bold">{row.trainerName}</span>
                    <span className="muted text-xs ml-2">{row.logs.length} entr{row.logs.length === 1 ? 'y' : 'ies'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs muted">
                      {row.totalDays} sessions × ₹{row.logs[0]?.rateSnapshot?.toLocaleString() || '—'}
                    </span>
                    <span className="mono font-bold text-sm" style={{ color: 'var(--status-green)' }}>
                      ₹{row.totalAmount.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Session rows */}
                <div className="table-card !mb-0">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Client</th>
                        <th>Days</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.logs
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map((l) => (
                          <tr key={l.id}>
                            <td className="mono text-[12px]">{l.date}</td>
                            <td className="muted">{l.client?.name || '—'}</td>
                            <td className="mono">{l.hours}</td>
                            <td className="mono font-semibold">₹{l.amountInr.toLocaleString()}</td>
                            <td>
                              <Pill color={STATUS_COLOR[l.status] || 'grey'}>{l.status}</Pill>
                            </td>
                            <td className="muted text-[11px]">{l.notes || '—'}</td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--bg-input)' }}>
                        <td colSpan={2} className="font-semibold text-xs">Total</td>
                        <td className="mono font-semibold">{row.totalDays}</td>
                        <td className="mono font-bold" style={{ color: 'var(--status-green)' }}>
                          ₹{row.totalAmount.toLocaleString()}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Page>
    </>
  );
}
