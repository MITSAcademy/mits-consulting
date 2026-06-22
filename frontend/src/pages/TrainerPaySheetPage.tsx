import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { TableProperties, Download, Filter, X, ChevronDown, CopyIcon, CheckIcon } from 'lucide-react';
import { useState, useMemo, useRef } from 'react';
import { todayISO } from '@/lib/utils';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function mondayOf(iso: string) {
  const d = new Date(iso);
  const day = d.getDay();
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
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${fmt(monday)} – ${fmt(end)}`;
}

/* ── Types ────────────────────────────────────────────────────────────────── */

type TrainerInfo = {
  id: string; name: string; email?: string;
  phoneCode?: string; phoneDigits?: string;
  bankHolderName?: string; bankName?: string; bankAccountNumber?: string;
  bankIfscCode?: string; bankBranchName?: string; bankAccountType?: string;
  upiId?: string; paymentMethod?: string;
};

type Log = {
  id: string; date: string; hours: number;
  rateSnapshot: number; amountInr: number;
  status: string; notes?: string; feedback?: string;
  trainer: TrainerInfo;
  client?: { id: string; name: string } | null;
};

type TrainerRow = {
  trainerId: string; trainerName: string;
  trainerInfo: TrainerInfo;
  logs: Log[];
  totalDays: number; totalAmount: number;
  pendingAmount: number;
};

/* ── Status config ────────────────────────────────────────────────────────── */

const STATUS_ORDER: Record<string, number> = {
  Logged: 0, ReadyForFinal: 1, PaymentApproved: 2, Paid: 3, Hold: 4, Rejected: 5,
};

const STATUS_CFG: Record<string, { color: string; bg: string; label: string; pill: 'green' | 'blue' | 'amber' | 'grey' | 'red' }> = {
  Logged:          { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', label: 'Logged',           pill: 'grey'  },
  ReadyForFinal:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'Ready for Final',  pill: 'amber' },
  PaymentApproved: { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  label: 'Payment Approved', pill: 'blue'  },
  Paid:            { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   label: 'Paid',             pill: 'green' },
  Hold:            { color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  label: 'Hold',             pill: 'amber' },
  Rejected:        { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   label: 'Rejected',         pill: 'red'   },
};

const STATUSES = Object.keys(STATUS_ORDER);

const PENDING_STATUSES = new Set(['Logged', 'ReadyForFinal', 'Hold']);

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CFG[status];
  if (!cfg) return <span className="text-xs muted">{status}</span>;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}
    >
      {cfg.label}
    </span>
  );
}

/* ── Inline status changer ────────────────────────────────────────────────── */

function StatusChanger({ logId, current }: { logId: string; current: string }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const patch = useMutation({
    mutationFn: (status: string) => api.patch(`/session-logs/${logId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session-logs'] });
      setOpen(false);
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const cfg = STATUS_CFG[current];

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer"
        style={{ background: cfg?.bg, color: cfg?.color, border: `1px solid ${cfg?.color || '#fff'}33` }}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title="Click to change status"
      >
        {cfg?.label || current}
        <ChevronDown size={9} />
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 rounded-lg shadow-xl overflow-hidden"
          style={{ minWidth: 160, background: 'var(--bg-card)', border: '1px solid var(--brand-border)', top: '100%', left: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {STATUSES.filter((s) => s !== 'Rejected').map((s) => {
            const c = STATUS_CFG[s];
            return (
              <button
                key={s}
                className="w-full text-left px-3 py-2 text-xs hover:opacity-80 flex items-center gap-2"
                style={{
                  background: s === current ? c.bg : 'transparent',
                  color: c.color,
                }}
                onClick={() => patch.mutate(s)}
                disabled={patch.isPending}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Copyable cell ────────────────────────────────────────────────────────── */

function CopyCell({ value }: { value?: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1 group">
      <span className="mono text-[11px]">{value}</span>
      <button
        className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
        onClick={() => {
          navigator.clipboard?.writeText(value).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        title="Copy"
      >
        {copied ? <CheckIcon size={10} style={{ color: 'var(--status-green)' }} /> : <CopyIcon size={10} />}
      </button>
    </span>
  );
}

/* ── Export helpers ───────────────────────────────────────────────────────── */

function exportExcel(rows: TrainerRow[], weekLabel: string) {
  const lines: string[] = [];
  lines.push(`Trainer Payment Sheet — ${weekLabel}`);
  lines.push('');
  lines.push('Trainer\tEmail\tBank Holder\tBank\tAccount No.\tIFSC\tUPI\tDate\tClient\tSessions\tRate\tAmount\tStatus\tNotes');
  for (const row of rows) {
    const t = row.trainerInfo;
    for (const l of row.logs) {
      lines.push([
        row.trainerName, t.email || '', t.bankHolderName || '', t.bankName || '',
        t.bankAccountNumber || '', t.bankIfscCode || '', t.upiId || '',
        l.date, l.client?.name || '',
        l.hours, l.rateSnapshot, l.amountInr, l.status, l.notes || '',
      ].join('\t'));
    }
    lines.push([row.trainerName, '', '', '', '', '', '', 'TOTAL', '', row.totalDays, '', row.totalAmount, '', ''].join('\t'));
    lines.push('');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/tab-separated-values' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trainer-payment-sheet-${weekLabel.replace(/[^a-z0-9]/gi, '-')}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPdf(rows: TrainerRow[], weekLabel: string) {
  const trainerRows = rows.map((row) => {
    const t = row.trainerInfo;
    const logRows = row.logs.map((l) => {
      const cfg = STATUS_CFG[l.status];
      return `<tr>
        <td>${l.date}</td><td>${l.client?.name || '—'}</td>
        <td>${l.hours}</td><td>₹${l.rateSnapshot?.toLocaleString()}</td>
        <td>₹${l.amountInr?.toLocaleString()}</td>
        <td><span style="color:${cfg?.color || '#fff'};background:${cfg?.bg || 'transparent'};padding:2px 6px;border-radius:99px;font-size:10px">${cfg?.label || l.status}</span></td>
        <td>${l.notes || '—'}</td>
      </tr>`;
    }).join('');
    return `
      <div class="trainer-block">
        <div class="trainer-header">
          <strong>${row.trainerName}</strong>
          <span class="muted">${row.logs.length} entr${row.logs.length === 1 ? 'y' : 'ies'}</span>
          <span class="total">₹${row.totalAmount.toLocaleString()}</span>
        </div>
        <div class="trainer-meta">
          ${t.email ? `Email: <b>${t.email}</b>` : ''}
          ${t.bankHolderName ? ` · Holder: <b>${t.bankHolderName}</b>` : ''}
          ${t.bankName ? ` · Bank: <b>${t.bankName}</b>` : ''}
          ${t.bankAccountNumber ? ` · A/C: <b>${t.bankAccountNumber}</b>` : ''}
          ${t.bankIfscCode ? ` · IFSC: <b>${t.bankIfscCode}</b>` : ''}
          ${t.upiId ? ` · UPI: <b>${t.upiId}</b>` : ''}
        </div>
        <table><thead><tr>
          <th>Date</th><th>Client</th><th>Sessions</th><th>Rate</th><th>Amount</th><th>Status</th><th>Notes</th>
        </tr></thead><tbody>${logRows}</tbody>
        <tfoot><tr><td colspan="2"><b>Total</b></td><td>${row.totalDays}</td><td></td><td><b>₹${row.totalAmount.toLocaleString()}</b></td><td colspan="2"></td></tr></tfoot>
        </table>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Trainer Payment Sheet — ${weekLabel}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 20px; }
    h1 { font-size: 16px; } p { color: #666; font-size: 11px; margin-bottom: 16px; }
    .trainer-block { margin-bottom: 24px; page-break-inside: avoid; }
    .trainer-header { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
    .trainer-header .muted { color: #888; font-size: 11px; }
    .trainer-header .total { margin-left: auto; font-weight: bold; color: #16a34a; }
    .trainer-meta { font-size: 10px; color: #555; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f3f4f6; text-align: left; padding: 5px 8px; font-size: 11px; border: 1px solid #e5e7eb; }
    td { padding: 4px 8px; border: 1px solid #e5e7eb; font-size: 11px; }
    tfoot td { background: #f9fafb; font-weight: bold; }
  </style></head><body>
  <h1>MITS Trainer Payment Sheet</h1>
  <p>${weekLabel} · ${rows.length} trainers · ₹${rows.reduce((s, r) => s + r.totalAmount, 0).toLocaleString()} total</p>
  ${trainerRows}
  </body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); win.print(); }
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export function TrainerPaySheetPage() {
  const user = useAuth((s) => s.user)!;
  const canChangeStatus = ['founder', 'manager', 'lead', 'accounts', 'payment_processor'].includes(user.role);

  const [weekStart, setWeekStart] = useState(mondayOf(todayISO()));
  const [showFilters, setShowFilters] = useState(false);
  const [filterTrainer, setFilterTrainer] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['session-logs', { weekStart }],
    queryFn: () => api.get('/session-logs', { params: { weekStart } }).then((r) => r.data as Log[]),
  });

  // Group by trainer → rows
  const allRows = useMemo<TrainerRow[]>(() => {
    const trainerMap = new Map<string, TrainerRow>();
    for (const l of logs || []) {
      if (!trainerMap.has(l.trainer.id)) {
        trainerMap.set(l.trainer.id, {
          trainerId: l.trainer.id,
          trainerName: l.trainer.name,
          trainerInfo: l.trainer,
          logs: [],
          totalDays: 0,
          totalAmount: 0,
          pendingAmount: 0,
        });
      }
      const row = trainerMap.get(l.trainer.id)!;
      row.logs.push(l);
      row.totalDays += l.hours;
      row.totalAmount += l.amountInr;
      if (PENDING_STATUSES.has(l.status)) row.pendingAmount += l.amountInr;
    }
    return Array.from(trainerMap.values()).sort((a, b) => a.trainerName.localeCompare(b.trainerName));
  }, [logs]);

  // Apply filters
  const rows = useMemo<TrainerRow[]>(() => {
    return allRows.map((row) => {
      let filteredLogs = row.logs;
      if (filterTrainer && row.trainerId !== filterTrainer) return null;
      if (filterStatus) filteredLogs = filteredLogs.filter((l) => l.status === filterStatus);
      if (filterClient) filteredLogs = filteredLogs.filter((l) => l.client?.id === filterClient);
      if (filterFrom) filteredLogs = filteredLogs.filter((l) => l.date >= filterFrom);
      if (filterTo) filteredLogs = filteredLogs.filter((l) => l.date <= filterTo);
      if (filteredLogs.length === 0) return null;
      const totalDays = filteredLogs.reduce((s, l) => s + l.hours, 0);
      const totalAmount = filteredLogs.reduce((s, l) => s + l.amountInr, 0);
      const pendingAmount = filteredLogs.filter((l) => PENDING_STATUSES.has(l.status)).reduce((s, l) => s + l.amountInr, 0);
      return { ...row, logs: filteredLogs, totalDays, totalAmount, pendingAmount };
    }).filter(Boolean) as TrainerRow[];
  }, [allRows, filterTrainer, filterClient, filterStatus, filterFrom, filterTo]);

  // Summary
  const totalSessions = rows.reduce((s, r) => s + r.totalDays, 0);
  const totalAmount = rows.reduce((s, r) => s + r.totalAmount, 0);
  const totalPending = rows.reduce((s, r) => s + r.pendingAmount, 0);

  // Unique trainers + clients for filter dropdowns
  const trainerOptions = useMemo(() =>
    Array.from(new Map((logs || []).map((l) => [l.trainer.id, l.trainer.name])).entries()),
    [logs]);
  const clientOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of logs || []) if (l.client) m.set(l.client.id, l.client.name);
    return Array.from(m.entries());
  }, [logs]);

  const hasFilters = !!(filterTrainer || filterClient || filterStatus || filterFrom || filterTo);
  const activeFilterCount = [filterTrainer, filterClient, filterStatus, filterFrom, filterTo].filter(Boolean).length;

  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));

  return (
    <>
      <Topbar
        title="Trainer payment sheet"
        subtitle={fmtWeek(weekStart)}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn-icon" onClick={prevWeek} title="Previous week">‹</button>
            <input
              type="date"
              className="input !w-auto"
              value={weekStart}
              onChange={(e) => setWeekStart(mondayOf(e.target.value))}
            />
            <button className="btn-icon" onClick={nextWeek} title="Next week">›</button>
            <Button
              size="sm"
              variant={showFilters ? 'primary' : 'default'}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={12} /> Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 px-1.5 rounded-full text-[10px] text-[#1A1B1E] font-bold" style={{ background: 'var(--accent-gold)' }}>
                  {activeFilterCount}
                </span>
              )}
            </Button>
            {rows.length > 0 && (
              <>
                <Button size="sm" onClick={() => exportExcel(rows, fmtWeek(weekStart))}>
                  <Download size={12} /> Excel
                </Button>
                <Button size="sm" onClick={() => exportPdf(rows, fmtWeek(weekStart))}>
                  <Download size={12} /> PDF
                </Button>
              </>
            )}
          </div>
        }
      />
      <Page>

        {/* ── Filters ──────────────────────────────────────────────────── */}
        {showFilters && (
          <div className="card mb-4">
            <div className="card-h mb-3">
              <Filter size={13} />
              <span className="font-semibold">Filters</span>
              {hasFilters && (
                <button
                  className="ml-auto text-xs hover:underline"
                  style={{ color: 'var(--brand-blue)' }}
                  onClick={() => { setFilterTrainer(''); setFilterClient(''); setFilterStatus(''); setFilterFrom(''); setFilterTo(''); }}
                >
                  <X size={11} className="inline mr-0.5" />Reset
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="label">Trainer</label>
                <select className="input" value={filterTrainer} onChange={(e) => setFilterTrainer(e.target.value)}>
                  <option value="">All trainers</option>
                  {trainerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Client</label>
                <select className="input" value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
                  <option value="">All clients</option>
                  {clientOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Payment Status</label>
                <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="">All statuses</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{STATUS_CFG[s]?.label || s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Date from</label>
                <input type="date" className="input" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
              </div>
              <div>
                <label className="label">Date to</label>
                <input type="date" className="input" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ── Summary cards ─────────────────────────────────────────────── */}
        {(logs || []).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <SummaryCard label="Total Trainers" value={String(rows.length)} color="blue" />
            <SummaryCard label="Total Sessions" value={String(totalSessions)} color="gold" />
            <SummaryCard label="Total Amount" value={`₹${totalAmount.toLocaleString()}`} color="green" />
            <SummaryCard label="Pending Payment" value={`₹${totalPending.toLocaleString()}`} color="amber" />
          </div>
        )}

        {/* ── Main content ──────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="muted text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={TableProperties}
            tone="grey"
            title={hasFilters ? 'No sessions match the filters' : 'No sessions this week'}
            description={hasFilters
              ? 'Clear the filters above to see all sessions, or navigate to a different week.'
              : 'Navigate to a different week, or log sessions via Session logs.'}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {rows.map((row) => (
              <TrainerCard key={row.trainerId} row={row} canChangeStatus={canChangeStatus} />
            ))}
          </div>
        )}
      </Page>
    </>
  );
}

/* ── Summary card ─────────────────────────────────────────────────────────── */

function SummaryCard({ label, value, color }: { label: string; value: string; color: 'blue' | 'green' | 'amber' | 'gold' }) {
  const colors = {
    blue:  { bg: 'rgba(56,189,248,0.10)',  border: 'rgba(56,189,248,0.25)',  text: '#38bdf8' },
    green: { bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.25)',   text: '#22c55e' },
    amber: { bg: 'rgba(251,146,60,0.10)',  border: 'rgba(251,146,60,0.25)',  text: '#fb923c' },
    gold:  { bg: 'rgba(234,179,8,0.10)',   border: 'rgba(234,179,8,0.25)',   text: '#eab308' },
  };
  const c = colors[color];
  return (
    <div className="rounded-xl p-4" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--brand-textMuted)' }}>{label}</div>
      <div className="text-xl font-bold mono" style={{ color: c.text }}>{value}</div>
    </div>
  );
}

/* ── Trainer card ─────────────────────────────────────────────────────────── */

function TrainerCard({ row, canChangeStatus }: { row: TrainerRow; canChangeStatus: boolean }) {
  const t = row.trainerInfo;
  const [showBankDetails, setShowBankDetails] = useState(false);

  const hasBankInfo = !!(t.bankHolderName || t.bankAccountNumber || t.bankIfscCode || t.upiId);
  const pendingLogs = row.logs.filter((l) => PENDING_STATUSES.has(l.status));

  return (
    <div className="card">
      {/* Trainer header */}
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">{row.trainerName}</span>
            <span className="muted text-xs">{row.logs.length} entr{row.logs.length === 1 ? 'y' : 'ies'}</span>
            {pendingLogs.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(251,146,60,0.15)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)' }}>
                {pendingLogs.length} pending
              </span>
            )}
          </div>
          {/* Email & phone */}
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {t.email && (
              <span className="text-[11px] muted">
                📧 <a href={`mailto:${t.email}`} className="hover:underline" style={{ color: 'var(--brand-textMuted)' }}>{t.email}</a>
              </span>
            )}
            {t.phoneDigits && (
              <span className="text-[11px] muted mono">
                📞 {t.phoneCode}{t.phoneDigits}
              </span>
            )}
          </div>
          {/* Bank details toggle */}
          {hasBankInfo && (
            <button
              className="text-[11px] mt-1 hover:underline flex items-center gap-1"
              style={{ color: 'var(--accent-gold)' }}
              onClick={() => setShowBankDetails(!showBankDetails)}
            >
              🏦 {showBankDetails ? 'Hide' : 'Show'} bank details
              <ChevronDown size={10} style={{ transform: showBankDetails ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
            </button>
          )}
          {showBankDetails && (
            <div className="mt-2 p-3 rounded-lg grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]"
              style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)' }}>
              {t.bankHolderName   && <BankField label="Holder"   value={t.bankHolderName} />}
              {t.bankName         && <BankField label="Bank"     value={t.bankName} />}
              {t.bankAccountNumber && <BankField label="A/C No." value={t.bankAccountNumber} />}
              {t.bankIfscCode     && <BankField label="IFSC"     value={t.bankIfscCode} />}
              {t.bankBranchName   && <BankField label="Branch"   value={t.bankBranchName} />}
              {t.bankAccountType  && <BankField label="Type"     value={t.bankAccountType} />}
              {t.upiId            && <BankField label="UPI"      value={t.upiId} />}
            </div>
          )}
        </div>

        {/* Total */}
        <div className="text-right flex-shrink-0">
          <div className="text-[11px] muted">{row.totalDays} sessions × ₹{row.logs[0]?.rateSnapshot?.toLocaleString() || '—'}</div>
          <div className="mono font-bold text-base" style={{ color: 'var(--status-green)' }}>
            ₹{row.totalAmount.toLocaleString()}
          </div>
          {pendingLogs.length > 0 && (
            <div className="text-[10px] mt-0.5" style={{ color: '#fb923c' }}>
              ₹{row.pendingAmount.toLocaleString()} pending
            </div>
          )}
        </div>
      </div>

      {/* Session rows table */}
      <div className="table-card !mb-0">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Sessions</th>
              <th>Rate</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {row.logs
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((l) => (
                <tr key={l.id}>
                  <td className="mono text-[12px]">{l.date}</td>
                  <td className="muted text-[12px]">{l.client?.name || '—'}</td>
                  <td className="mono">{l.hours}</td>
                  <td className="mono text-[12px]">₹{l.rateSnapshot?.toLocaleString()}</td>
                  <td className="mono font-semibold">₹{l.amountInr.toLocaleString()}</td>
                  <td>
                    {canChangeStatus
                      ? <StatusChanger logId={l.id} current={l.status} />
                      : <StatusPill status={l.status} />}
                  </td>
                  <td className="muted text-[11px]">{l.notes || '—'}</td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--bg-input)' }}>
              <td colSpan={2} className="font-semibold text-xs">Total</td>
              <td className="mono font-semibold">{row.totalDays}</td>
              <td></td>
              <td className="mono font-bold" style={{ color: 'var(--status-green)' }}>
                ₹{row.totalAmount.toLocaleString()}
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function BankField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="muted mr-1">{label}:</span>
      <CopyCell value={value} />
    </div>
  );
}
