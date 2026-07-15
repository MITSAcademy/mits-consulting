import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { TableProperties, Download, Filter, X, Check, Pencil, ChevronsUpDown, LayoutGrid, List, FileSpreadsheet } from 'lucide-react';
import { useState, useMemo, useRef, useEffect } from 'react';
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
    new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
  proceed?: string | null; comments?: string | null;
  trainer: TrainerInfo;
  client?: { id: string; name: string } | null;
};

/* ── Status config ────────────────────────────────────────────────────────── */

const PAY_STATUS_CFG = {
  Paid:    { label: 'Paid',     color: '#22c55e', bg: 'rgba(34,197,94,0.13)'  },
  NotPaid: { label: 'Not Paid', color: '#ef4444', bg: 'rgba(239,68,68,0.13)'  },
  Hold:    { label: 'Hold',     color: '#fb923c', bg: 'rgba(251,146,60,0.13)' },
  Logged:  { label: '—',        color: '#64748b', bg: 'transparent'            },
} as const;

type PayStatus = keyof typeof PAY_STATUS_CFG;

function payLabel(status: string): string {
  return (PAY_STATUS_CFG as any)[status]?.label ?? status;
}
function payColor(status: string): string {
  return (PAY_STATUS_CFG as any)[status]?.color ?? '#64748b';
}
function payBg(status: string): string {
  return (PAY_STATUS_CFG as any)[status]?.bg ?? 'transparent';
}

const PROCEED_CFG = {
  Yes:  { label: 'Yes',  color: '#22c55e', bg: 'rgba(34,197,94,0.13)'  },
  No:   { label: 'No',   color: '#ef4444', bg: 'rgba(239,68,68,0.13)'  },
  Hold: { label: 'Hold', color: '#fb923c', bg: 'rgba(251,146,60,0.13)' },
} as const;

/* ── Inline editable cell ─────────────────────────────────────────────────── */

function EditableNumber({
  value, logId, field, prefix = '', onSaved,
}: {
  value: number; logId: string; field: string; prefix?: string; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const showToast = useUI((s) => s.showToast);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = async () => {
    const num = parseFloat(draft);
    if (isNaN(num) || num === value) { setEditing(false); setDraft(String(value)); return; }
    try {
      await api.patch(`/session-logs/${logId}`, { [field]: num });
      onSaved();
    } catch {
      showToast('Failed to save', 'error');
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        className="input !py-0.5 !px-1.5 w-20 text-xs mono"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setDraft(String(value)); } }}
      />
    );
  }

  return (
    <button
      className="group flex items-center gap-1 hover:opacity-80"
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      title="Click to edit"
    >
      <span className="mono text-xs">{prefix}{value.toLocaleString()}</span>
      <Pencil size={9} className="opacity-0 group-hover:opacity-50" />
    </button>
  );
}

/* ── Inline editable text ─────────────────────────────────────────────────── */

function EditableText({
  value, logId, field, placeholder = 'Add comment…', onSaved,
}: {
  value?: string | null; logId: string; field: string; placeholder?: string; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const showToast = useUI((s) => s.showToast);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = async () => {
    try {
      await api.patch(`/session-logs/${logId}`, { [field]: draft || null });
      onSaved();
    } catch {
      showToast('Failed to save', 'error');
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className="input !py-0.5 !px-1.5 text-xs w-36"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
      />
    );
  }

  return (
    <button
      className="group flex items-center gap-1 text-left hover:opacity-80 max-w-[160px]"
      onClick={() => { setDraft(value || ''); setEditing(true); }}
      title={value || 'Click to add comment'}
    >
      <span className="text-[11px] truncate" style={{ color: value ? 'var(--brand-text)' : 'var(--brand-textMuted)' }}>
        {value || placeholder}
      </span>
      <Pencil size={9} className="flex-shrink-0 opacity-0 group-hover:opacity-50" />
    </button>
  );
}

/* ── Proceed selector ─────────────────────────────────────────────────────── */

function ProceedCell({ logId, value, onSaved }: { logId: string; value?: string | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const showToast = useUI((s) => s.showToast);

  const set = async (v: string | null) => {
    setOpen(false);
    try {
      await api.patch(`/session-logs/${logId}`, { proceed: v });
      onSaved();
    } catch {
      showToast('Failed to save', 'error');
    }
  };

  const cfg = value ? (PROCEED_CFG as any)[value] : null;

  return (
    <div className="relative inline-block">
      <button
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border cursor-pointer"
        style={{
          background: cfg?.bg ?? 'transparent',
          color: cfg?.color ?? 'var(--brand-textMuted)',
          borderColor: cfg?.color ? `${cfg.color}40` : 'var(--brand-border)',
        }}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        {cfg?.label ?? '— set —'}
        <ChevronsUpDown size={9} />
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 rounded-lg shadow-xl overflow-hidden"
          style={{ minWidth: 100, background: 'var(--bg-card)', border: '1px solid var(--brand-border)', top: '100%', left: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {Object.entries(PROCEED_CFG).map(([k, c]) => (
            <button
              key={k}
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2"
              style={{ background: value === k ? c.bg : 'transparent', color: c.color }}
              onClick={() => set(k)}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
              {c.label}
              {value === k && <Check size={10} className="ml-auto" />}
            </button>
          ))}
          {value && (
            <button
              className="w-full text-left px-3 py-2 text-xs text-brand-textMuted border-t"
              style={{ borderColor: 'var(--brand-border)' }}
              onClick={() => set(null)}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Status cell (Samita / founder only) ──────────────────────────────────── */

function StatusCell({
  logId, value, canEdit, onSaved,
}: {
  logId: string; value: string; canEdit: boolean; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const showToast = useUI((s) => s.showToast);

  const set = async (s: string) => {
    setOpen(false);
    try {
      await api.patch(`/session-logs/${logId}`, { status: s });
      onSaved();
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Failed', 'error');
    }
  };

  const pill = (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: payBg(value), color: payColor(value), border: `1px solid ${payColor(value)}33` }}
    >
      {payLabel(value)}
    </span>
  );

  if (!canEdit) return pill;

  return (
    <div className="relative inline-block">
      <button
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer"
        style={{ background: payBg(value), color: payColor(value), border: `1px solid ${payColor(value)}33` }}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title="Mark payment status"
      >
        {payLabel(value)}
        <ChevronsUpDown size={9} />
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 rounded-lg shadow-xl overflow-hidden"
          style={{ minWidth: 120, background: 'var(--bg-card)', border: '1px solid var(--brand-border)', top: '100%', left: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {(['Paid', 'NotPaid', 'Hold', 'Logged'] as PayStatus[]).map((s) => {
            const c = PAY_STATUS_CFG[s];
            return (
              <button
                key={s}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2"
                style={{ background: value === s ? c.bg : 'transparent', color: c.color }}
                onClick={() => set(s)}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                {c.label}
                {value === s && <Check size={10} className="ml-auto" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Export helpers ───────────────────────────────────────────────────────── */

function exportExcel(logs: Log[], weekLabel: string) {
  const header = ['Sr No', 'Date', 'Trainer', 'Client', 'Sessions', 'Rate ₹', 'Total ₹', 'Status', 'Proceed', 'Comments'].join('\t');
  const rows = logs.map((l, i) => [
    i + 1, l.date, l.trainer.name, l.client?.name || '—',
    l.hours, l.rateSnapshot, l.amountInr,
    payLabel(l.status), l.proceed || '—', l.comments || '',
  ].join('\t'));
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/tab-separated-values' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trainer-pay-sheet-${weekLabel.replace(/[^a-z0-9]/gi, '-')}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV(logs: Log[], weekLabel: string) {
  // Group by trainer, sum days (hours) and total amount
  const byTrainer = new Map<string, { trainer: TrainerInfo; days: number; rate: number; total: number; comments: string[] }>();
  logs.forEach((l, i) => {
    const key = l.trainer.id;
    if (!byTrainer.has(key)) byTrainer.set(key, { trainer: l.trainer, days: 0, rate: l.rateSnapshot, total: 0, comments: [] });
    const t = byTrainer.get(key)!;
    t.days += l.hours;
    t.total += l.amountInr;
    if (l.comments) t.comments.push(l.comments);
  });

  const header = ['Sr No', 'Trainer Name', 'Bank Account / UPI Details', 'Phone (UPI)', 'Days', 'Rate/Session (₹)', 'Total Amount (₹)', 'Comments'].join(',');
  const rows = Array.from(byTrainer.values()).map((t, i) => {
    const tr = t.trainer;
    const bankDetails = tr.upiId
      ? `UPI: ${tr.upiId}`
      : [tr.bankHolderName, tr.bankName, tr.bankAccountNumber ? `A/c: ${tr.bankAccountNumber}` : '', tr.bankIfscCode ? `IFSC: ${tr.bankIfscCode}` : ''].filter(Boolean).join(' | ');
    const phone = tr.phoneCode && tr.phoneDigits ? `${tr.phoneCode}${tr.phoneDigits}` : '';
    return [i + 1, tr.name, `"${bankDetails}"`, phone, t.days, t.rate, t.total, `"${t.comments.join('; ')}"`].join(',');
  });

  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trainer-payment-${weekLabel.replace(/[^a-z0-9]/gi, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportWhatsApp(logs: Log[], weekLabel: string) {
  // Group by trainer
  const byTrainer = new Map<string, { trainer: TrainerInfo; days: number; rate: number; total: number }>();
  logs.forEach((l) => {
    const key = l.trainer.id;
    if (!byTrainer.has(key)) byTrainer.set(key, { trainer: l.trainer, days: 0, rate: l.rateSnapshot, total: 0 });
    const t = byTrainer.get(key)!;
    t.days += l.hours;
    t.total += l.amountInr;
  });

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const lines: string[] = [
    `Trainer Payment Sheet (Date: ${today})`,
    `Trainer Payment Summary (${today})`,
    '',
    `${'Sr No'.padEnd(6)} ${'Trainer Name'.padEnd(22)} ${'Days'.padEnd(6)} ${'Rate/Session'.padEnd(14)} Total Amount`,
    '',
  ];

  Array.from(byTrainer.values()).forEach((t, i) => {
    lines.push(`${String(i + 1).padEnd(6)} ${t.trainer.name.padEnd(22)} ${String(t.days).padEnd(6)} * ${String(t.rate).padEnd(12)} (=) ${t.total}`);
  });

  const grand = Array.from(byTrainer.values()).reduce((s, t) => s + t.total, 0);
  lines.push('');
  lines.push(`Total: ₹${grand.toLocaleString()}`);

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trainer-payment-whatsapp-${today}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// Alternating week background colors (pastel, prints well)
const WEEK_COLORS = [
  { header: '#D6E4F0', row: '#EBF5FB' },  // blue
  { header: '#D5F5E3', row: '#EAFAF1' },  // green
  { header: '#FEF9E7', row: '#FEFDF5' },  // yellow
  { header: '#F9EBEA', row: '#FDEDEC' },  // pink
  { header: '#EAE0F5', row: '#F5EEF8' },  // purple
];

/**
 * Export in Bhavneet's Google Sheet format as HTML-XLS.
 * HTML-as-XLS is the only way to preserve:
 *   - Text format for bank account / phone numbers (no scientific notation)
 *   - Per-week color coding
 *   - Merged header cells
 *   - Client mapping column per week
 */
function exportBhavneetSheet(allWeeksLogs: { weekStart: string; logs: Log[] }[]) {
  // Collect all unique trainers across all weeks, sorted by name
  const trainerMap = new Map<string, TrainerInfo>();
  for (const { logs } of allWeeksLogs) {
    for (const l of logs) {
      if (!trainerMap.has(l.trainer.id)) trainerMap.set(l.trainer.id, l.trainer);
    }
  }
  const trainers = Array.from(trainerMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Aggregate per trainer per week, also collect client names
  type WeekData = { days: number; rate: number; total: number; comments: string[]; clients: Set<string> };
  const data = new Map<string, Map<string, WeekData>>(); // trainerId → weekStart → data
  for (const { weekStart, logs } of allWeeksLogs) {
    for (const l of logs) {
      if (!data.has(l.trainer.id)) data.set(l.trainer.id, new Map());
      const tw = data.get(l.trainer.id)!;
      if (!tw.has(weekStart)) tw.set(weekStart, { days: 0, rate: l.rateSnapshot, total: 0, comments: [], clients: new Set() });
      const w = tw.get(weekStart)!;
      w.days += l.hours;
      w.total += l.amountInr;
      w.rate = l.rateSnapshot;
      if (l.comments) w.comments.push(l.comments);
      if (l.client?.name) w.clients.add(l.client.name);
    }
  }

  const weeks = allWeeksLogs.map((w) => w.weekStart);
  // 5 cols per week: Days, Amount/session, Total Amount, Clients, Comments
  const WEEK_COLS = 5;

  function esc(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // text cell — forces Excel to treat value as text (no scientific notation)
  function td(val: string, bg: string, extra = '') {
    return `<td style="background:${bg};mso-number-format:'@';font-size:11px;padding:4px 6px;border:1px solid #ccc;white-space:pre-wrap;${extra}">${esc(val)}</td>`;
  }
  function tdNum(val: string | number, bg: string, bold = false) {
    return `<td style="background:${bg};font-size:11px;padding:4px 6px;border:1px solid #ccc;text-align:right;${bold ? 'font-weight:bold;' : ''}">${val}</td>`;
  }
  function th(val: string, bg: string, extra = '') {
    return `<th style="background:${bg};font-size:11px;font-weight:bold;padding:5px 6px;border:1px solid #aaa;${extra}">${esc(val)}</th>`;
  }

  // Row 1: week date group headers (merged across WEEK_COLS each)
  const staticCount = 4; // Sr no, Name, Bank details, UPI/Phone
  let row1 = `<tr><th colspan="${staticCount}" style="background:#f0f0f0;border:1px solid #aaa;"></th>`;
  for (let wi = 0; wi < weeks.length; wi++) {
    const ws = weeks[wi];
    const d = new Date(ws + 'T00:00:00');
    const label = `Date-${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
    const col = WEEK_COLORS[wi % WEEK_COLORS.length];
    row1 += `<th colspan="${WEEK_COLS}" style="background:${col.header};font-size:12px;font-weight:bold;padding:5px 6px;border:1px solid #aaa;text-align:center;">${label}</th>`;
  }
  row1 += '</tr>';

  // Row 2: column headers
  let row2 = `<tr>
    ${th('Sr no', '#e8e8e8')}
    ${th('Name', '#e8e8e8')}
    ${th('Bank Account / UPI Details', '#e8e8e8')}
    ${th('Google Pay / Phonepe', '#e8e8e8')}`;
  for (let wi = 0; wi < weeks.length; wi++) {
    const col = WEEK_COLORS[wi % WEEK_COLORS.length];
    row2 += th('Days', col.header) + th('Amount/session', col.header) + th('Total Amount', col.header) + th('Clients', col.header) + th('Comments', col.header);
  }
  row2 += '</tr>';

  // Data rows
  const dataRowsHtml = trainers.map((t, idx) => {
    const bankDetails = t.upiId
      ? `UPI: ${t.upiId}`
      : [
          t.bankHolderName ? `Name: ${t.bankHolderName}` : '',
          t.bankAccountNumber ? `Bank Account Number: ${t.bankAccountNumber}` : '',
          t.bankIfscCode ? `IFSC Code: ${t.bankIfscCode}` : '',
          t.bankName ? `Bank: ${t.bankName}` : '',
          t.bankBranchName ? `Branch: ${t.bankBranchName}` : '',
        ].filter(Boolean).join('\n');
    // Force phone as text to avoid scientific notation
    const phone = t.upiId || (t.phoneCode && t.phoneDigits ? `${t.phoneCode}${t.phoneDigits}` : '');

    let row = `<tr>
      ${tdNum(idx + 1, '#fff')}
      ${td(t.name, '#fff', 'font-weight:600;')}
      ${td(bankDetails, '#fff')}
      ${td(phone, '#fff')}`;

    for (let wi = 0; wi < weeks.length; wi++) {
      const ws = weeks[wi];
      const w = data.get(t.id)?.get(ws);
      const bg = WEEK_COLORS[wi % WEEK_COLORS.length].row;
      const clients = w ? Array.from(w.clients).join(', ') : '';
      row += tdNum(w ? w.days : 0, bg)
           + tdNum(w ? w.rate : '', bg)
           + tdNum(w ? w.total : 0, bg, true)
           + td(clients, bg, 'font-size:10px;color:#555;')
           + td(w?.comments.join('; ') ?? '', bg, 'font-size:10px;');
    }
    row += '</tr>';
    return row;
  }).join('');

  // Grand total row
  let totalRow = `<tr style="background:#f0f0f0;">
    <td colspan="3" style="font-weight:bold;text-align:right;font-size:12px;padding:5px 6px;border:1px solid #aaa;">GRAND TOTAL</td>
    <td style="border:1px solid #aaa;"></td>`;
  for (let wi = 0; wi < weeks.length; wi++) {
    const ws = weeks[wi];
    let totalAmt = 0;
    for (const t of trainers) totalAmt += data.get(t.id)?.get(ws)?.total ?? 0;
    const col = WEEK_COLORS[wi % WEEK_COLORS.length];
    totalRow += `<td style="background:${col.header};border:1px solid #aaa;"></td>`
              + `<td style="background:${col.header};border:1px solid #aaa;"></td>`
              + `<td style="background:${col.header};font-weight:bold;text-align:right;font-size:12px;padding:5px 6px;border:1px solid #aaa;">₹${totalAmt.toLocaleString()}</td>`
              + `<td style="background:${col.header};border:1px solid #aaa;"></td>`
              + `<td style="background:${col.header};border:1px solid #aaa;"></td>`;
  }
  totalRow += '</tr>';

  const month = new Date(weeks[0] + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${month}</x:Name>
<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  table { border-collapse: collapse; font-family: Arial, sans-serif; }
  td, th { border: 1px solid #ccc; }
</style>
</head>
<body>
<h3 style="font-family:Arial;font-size:14px;margin-bottom:8px;">MITS Payment Sheet — ${month}</h3>
<table>
  <thead>${row1}${row2}</thead>
  <tbody>${dataRowsHtml}${totalRow}</tbody>
</table>
</body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MITS-Payment-Sheet-${month.replace(' ', '-')}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPdf(logs: Log[], weekLabel: string) {
  const totalAmount = logs.reduce((s, l) => s + l.amountInr, 0);
  const rows = logs.map((l, i) => `<tr>
    <td>${i + 1}</td>
    <td>${l.date}</td>
    <td>${l.trainer.name}</td>
    <td>${l.client?.name || '—'}</td>
    <td>${l.hours}</td>
    <td>₹${l.rateSnapshot.toLocaleString()}</td>
    <td>₹${l.amountInr.toLocaleString()}</td>
    <td style="color:${payColor(l.status)}">${payLabel(l.status)}</td>
    <td style="color:${l.proceed ? (PROCEED_CFG as any)[l.proceed]?.color : '#888'}">${l.proceed || '—'}</td>
    <td>${l.comments || '—'}</td>
  </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Trainer Pay Sheet — ${weekLabel}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
    h1 { font-size: 15px; } p { color: #666; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f3f4f6; text-align: left; padding: 5px 7px; font-size: 10px; border: 1px solid #e5e7eb; }
    td { padding: 4px 7px; border: 1px solid #e5e7eb; font-size: 10px; }
    tr:nth-child(even) td { background: #fafafa; }
    tfoot td { background: #f3f4f6; font-weight: bold; }
  </style></head><body>
  <h1>MITS Trainer Payment Sheet</h1>
  <p>${weekLabel} · ${logs.length} entries · ₹${totalAmount.toLocaleString()} total</p>
  <table>
    <thead><tr>
      <th>Sr</th><th>Date</th><th>Trainer</th><th>Client</th>
      <th>Sessions</th><th>Rate</th><th>Total</th>
      <th>Status</th><th>Proceed</th><th>Comments</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="6" style="text-align:right">Grand Total</td>
      <td>₹${totalAmount.toLocaleString()}</td>
      <td colspan="3"></td>
    </tr></tfoot>
  </table>
  </body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); win.print(); }
}

/* ── Summary card ─────────────────────────────────────────────────────────── */

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: `${color}14`, border: `1px solid ${color}33` }}>
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--brand-textMuted)' }}>{label}</div>
      <div className="text-lg font-bold mono" style={{ color }}>{value}</div>
    </div>
  );
}

/* ── Excel-style grouped view ─────────────────────────────────────────────── */

type TrainerRow = {
  trainer: TrainerInfo;
  date: string;       // latest session date for this week
  days: number;       // total sessions (hours)
  perSession: number; // rate snapshot
  amount: number;     // total amount
  logIds: string[];   // underlying log ids (for status ops)
  status: string;     // worst-case status across logs (Paid if all paid, else Logged)
};

function bankDetail(t: TrainerInfo): string {
  if (t.upiId) return `UPI: ${t.upiId}`;
  const parts = [t.bankHolderName, t.bankName, t.bankAccountNumber ? `A/c ${t.bankAccountNumber}` : '', t.bankIfscCode ? `IFSC ${t.bankIfscCode}` : ''].filter(Boolean);
  return parts.join(' · ') || '—';
}

function ExcelView({ logs, canMarkStatus, canEdit, onRefresh }: {
  logs: Log[]; canMarkStatus: boolean; canEdit: boolean; onRefresh: () => void;
}) {
  const showToast = useUI((s) => s.showToast);
  const [editingAmount, setEditingAmount] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState('');

  // Group logs by trainer
  const rows = useMemo<TrainerRow[]>(() => {
    const map = new Map<string, TrainerRow>();
    for (const l of logs) {
      const key = l.trainer.id;
      if (!map.has(key)) {
        map.set(key, { trainer: l.trainer, date: l.date, days: 0, perSession: l.rateSnapshot, amount: 0, logIds: [], status: 'Paid' });
      }
      const r = map.get(key)!;
      r.days += l.hours;
      r.amount += l.amountInr;
      r.logIds.push(l.id);
      if (l.date > r.date) r.date = l.date;
      // status: if any log isn't Paid, show as unpaid
      if (l.status !== 'Paid') r.status = l.status;
    }
    return Array.from(map.values()).sort((a, b) => a.trainer.name.localeCompare(b.trainer.name));
  }, [logs]);

  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);

  const markAllStatus = async (_trainerId: string, logIds: string[], status: string) => {
    try {
      await Promise.all(logIds.map((id) => api.patch(`/session-logs/${id}`, { status })));
      onRefresh();
      showToast(status === 'Paid' ? 'Payment marked as Done ✓' : 'Marked as Pending');
    } catch {
      showToast('Failed to update status', 'error');
    }
  };

  const saveAmount = async (_trainerId: string, logIds: string[], newTotal: number, perSession: number) => {
    // Distribute amount evenly across all logs for this trainer
    const perLog = Math.round(newTotal / logIds.length);
    try {
      await Promise.all(logIds.map((id) => api.patch(`/session-logs/${id}`, { amountInr: perLog, rateSnapshot: perSession })));
      onRefresh();
    } catch {
      showToast('Failed to save', 'error');
    }
    setEditingAmount(null);
  };

  const thStyle: React.CSSProperties = {
    padding: '9px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: 'var(--brand-textMuted)',
    borderBottom: '2px solid var(--brand-border)', whiteSpace: 'nowrap',
    background: 'var(--bg-card)',
  };
  const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--brand-borderSoft)', verticalAlign: 'middle' };

  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--brand-border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            <th style={thStyle}>Trainer Name</th>
            <th style={thStyle}>Bank Details</th>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Days</th>
            <th style={thStyle}>Per Session ₹</th>
            <th style={thStyle}>Amount ₹</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>
              Actions {!canMarkStatus && <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--brand-textMuted)' }}>(Samita only)</span>}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isPaid = r.logIds.every((id) => {
              const l = logs.find((x) => x.id === id);
              return l?.status === 'Paid';
            });
            const isEditing = editingAmount === r.trainer.id;

            return (
              <tr key={r.trainer.id} style={{ background: isPaid ? 'rgba(34,197,94,0.04)' : undefined }}>
                <td style={{ ...tdStyle, color: 'var(--brand-textMuted)', fontFamily: 'monospace', fontSize: 11 }}>{i + 1}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{r.trainer.name}</td>
                <td style={{ ...tdStyle, fontSize: 11, color: 'var(--brand-textMuted)', maxWidth: 220 }}>
                  <span title={bankDetail(r.trainer)}>{bankDetail(r.trainer)}</span>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{r.date}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', textAlign: 'center' }}>
                  {canEdit ? (
                    <EditableNumber value={r.days} logId={r.logIds[0]} field="hours" onSaved={onRefresh} />
                  ) : r.days}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  {canEdit ? (
                    <EditableNumber value={r.perSession} logId={r.logIds[0]} field="rateSnapshot" prefix="₹" onSaved={onRefresh} />
                  ) : `₹${r.perSession.toLocaleString()}`}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ color: 'var(--brand-textMuted)', fontSize: 12 }}>₹</span>
                      <input
                        type="number"
                        defaultValue={r.amount}
                        autoFocus
                        style={{ width: 80, background: 'var(--bg-input)', border: '1px solid var(--brand-border)', borderRadius: 4, padding: '2px 6px', fontSize: 12, color: 'var(--brand-text)', fontFamily: 'monospace' }}
                        onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) saveAmount(r.trainer.id, r.logIds, v, r.perSession); else setEditingAmount(null); }}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingAmount(null); }}
                      />
                    </div>
                  ) : (
                    <button
                      style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: canEdit ? 'pointer' : 'default' }}
                      onClick={() => { if (canEdit) { setAmountDraft(String(r.amount)); setEditingAmount(r.trainer.id); } }}
                      title={canEdit ? 'Click to edit' : undefined}
                    >
                      ₹{r.amount.toLocaleString()}
                      {canEdit && <Pencil size={9} style={{ opacity: 0.4 }} />}
                    </button>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  {canMarkStatus ? (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button
                        onClick={() => markAllStatus(r.trainer.id, r.logIds, 'Paid')}
                        disabled={isPaid}
                        style={{
                          padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: isPaid ? 'default' : 'pointer',
                          background: isPaid ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.15)',
                          color: '#16a34a', border: '1px solid rgba(34,197,94,0.4)',
                          opacity: isPaid ? 0.7 : 1,
                        }}
                        title="Mark payment as done"
                      >
                        🟢 Payment Done
                      </button>
                      <button
                        onClick={() => markAllStatus(r.trainer.id, r.logIds, 'NotPaid')}
                        disabled={!isPaid}
                        style={{
                          padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: !isPaid ? 'default' : 'pointer',
                          background: !isPaid ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
                          color: '#dc2626', border: '1px solid rgba(239,68,68,0.3)',
                          opacity: !isPaid ? 1 : 0.5,
                        }}
                        title="Mark payment as pending"
                      >
                        🔴 Payment Pending
                      </button>
                    </div>
                  ) : (
                    <span style={{
                      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                      background: isPaid ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.1)',
                      color: isPaid ? '#16a34a' : '#dc2626',
                    }}>
                      {isPaid ? '🟢 Paid' : '🔴 Pending'}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--bg-input)' }}>
            <td colSpan={6} style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontSize: 12 }}>End Total</td>
            <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: 'var(--status-green)' }}>
              ₹{grandTotal.toLocaleString()}
            </td>
            <td style={tdStyle} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

/** Returns all Monday dates for the 4–5 weeks that fall within the given month (year-MM). */
function weeksInMonth(yearMonth: string): string[] {
  const [year, month] = yearMonth.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const mondays: string[] = [];
  // Start from the Monday on or before the 1st
  const d = new Date(firstDay);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  while (d <= lastDay) {
    mondays.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  return mondays;
}

export function TrainerPaySheetPage() {
  const user = useAuth((s) => s.user)!;
  // Only Samita (demo_lead) and founder can mark Paid / Not Paid
  const canMarkStatus = user.role === 'demo_lead' || user.role === 'founder';
  // Anyone with write access can edit Days, Amount, Proceed, Comments
  const canEdit = ['founder', 'manager', 'lead', 'accounts', 'payment_processor', 'demo_lead'].includes(user.role);

  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(mondayOf(todayISO()));
  const [viewMode, setViewMode] = useState<'excel' | 'detail'>('excel');
  const [showFilters, setShowFilters] = useState(false);
  const [filterTrainer, setFilterTrainer] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProceed, setFilterProceed] = useState('');
  const [exportingMonthly, setExportingMonthly] = useState(false);
  const showToast = useUI((s) => s.showToast);

  // Current month derived from selected week (for monthly export label)
  const currentMonth = weekStart.slice(0, 7); // "YYYY-MM"

  async function handleMonthlyExport() {
    setExportingMonthly(true);
    try {
      const mondays = weeksInMonth(currentMonth);
      const allWeeksLogs = await Promise.all(
        mondays.map(async (ws) => {
          const r = await api.get('/session-logs', { params: { weekStart: ws } });
          return { weekStart: ws, logs: r.data as Log[] };
        })
      );
      // Only keep weeks that have at least one log
      const withData = allWeeksLogs.filter((w) => w.logs.length > 0);
      if (withData.length === 0) {
        showToast('No session data found for this month', 'error');
        return;
      }
      exportBhavneetSheet(withData);
      showToast(`Exported ${withData.length} week(s) for ${new Date(currentMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`);
    } catch {
      showToast('Export failed', 'error');
    } finally {
      setExportingMonthly(false);
    }
  }

  const { data: logs, isLoading } = useQuery({
    queryKey: ['session-logs', { weekStart }],
    queryFn: () => api.get('/session-logs', { params: { weekStart } }).then((r) => r.data as Log[]),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['session-logs'] });

  // Filter options
  const trainerOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of logs || []) m.set(l.trainer.id, l.trainer.name);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [logs]);

  const clientOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of logs || []) if (l.client) m.set(l.client.id, l.client.name);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [logs]);

  // Apply filters + sort by date then trainer
  const filtered = useMemo<Log[]>(() => {
    return (logs || [])
      .filter((l) => {
        if (filterTrainer && l.trainer.id !== filterTrainer) return false;
        if (filterClient && l.client?.id !== filterClient) return false;
        if (filterStatus && l.status !== filterStatus) return false;
        if (filterProceed && l.proceed !== filterProceed) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.trainer.name.localeCompare(b.trainer.name));
  }, [logs, filterTrainer, filterClient, filterStatus, filterProceed]);

  // Summary
  const totalAmount   = filtered.reduce((s, l) => s + l.amountInr, 0);
  const totalSessions = filtered.reduce((s, l) => s + l.hours, 0);
  const totalPending  = filtered.filter((l) => l.status !== 'Paid').reduce((s, l) => s + l.amountInr, 0);
  const uniqueTrainers = new Set(filtered.map((l) => l.trainer.id)).size;

  const activeFilterCount = [filterTrainer, filterClient, filterStatus, filterProceed].filter(Boolean).length;
  const hasFilters = activeFilterCount > 0;

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
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
              <button
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium"
                style={{ background: viewMode === 'excel' ? 'var(--accent-gold)' : 'var(--bg-card)', color: viewMode === 'excel' ? '#1A1B1E' : 'var(--brand-textMuted)' }}
                onClick={() => setViewMode('excel')}
                title="Excel-style grouped view"
              >
                <LayoutGrid size={11} /> Excel
              </button>
              <button
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium"
                style={{ background: viewMode === 'detail' ? 'var(--accent-gold)' : 'var(--bg-card)', color: viewMode === 'detail' ? '#1A1B1E' : 'var(--brand-textMuted)', borderLeft: '1px solid var(--brand-border)' }}
                onClick={() => setViewMode('detail')}
                title="Detailed session-level view"
              >
                <List size={11} /> Detail
              </button>
            </div>
            <Button size="sm" variant={showFilters ? 'primary' : 'default'} onClick={() => setShowFilters(!showFilters)}>
              <Filter size={12} /> Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 px-1.5 rounded-full text-[10px] text-[#1A1B1E] font-bold" style={{ background: 'var(--accent-gold)' }}>
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleMonthlyExport}
              disabled={exportingMonthly}
              title={`Export full month (${new Date(currentMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}) in Bhavneet's Google Sheet format`}
            >
              <FileSpreadsheet size={12} />
              {exportingMonthly ? 'Exporting…' : `Export ${new Date(currentMonth + '-01').toLocaleDateString('en-IN', { month: 'short' })} Sheet`}
            </Button>
            {filtered.length > 0 && (
              <>
                <Button size="sm" onClick={() => exportCSV(filtered, fmtWeek(weekStart))} title="Download CSV (grouped by trainer with bank details)">
                  <Download size={12} /> CSV
                </Button>
                <Button size="sm" onClick={() => exportWhatsApp(filtered, fmtWeek(weekStart))} title="Download WhatsApp text format">
                  <Download size={12} /> WhatsApp .txt
                </Button>
                <Button size="sm" onClick={() => exportExcel(filtered, fmtWeek(weekStart))}>
                  <Download size={12} /> Excel
                </Button>
                <Button size="sm" onClick={() => exportPdf(filtered, fmtWeek(weekStart))}>
                  <Download size={12} /> PDF
                </Button>
              </>
            )}
          </div>
        }
      />
      <Page>

        {/* ── Filters ───────────────────────────────────────────────── */}
        {showFilters && (
          <div className="card mb-4">
            <div className="card-h mb-3">
              <Filter size={13} /><span className="font-semibold">Filters</span>
              {hasFilters && (
                <button
                  className="ml-auto text-xs hover:underline flex items-center gap-1"
                  style={{ color: 'var(--brand-blue)' }}
                  onClick={() => { setFilterTrainer(''); setFilterClient(''); setFilterStatus(''); setFilterProceed(''); }}
                >
                  <X size={11} />Reset
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                  <option value="Paid">Paid</option>
                  <option value="NotPaid">Not Paid</option>
                  <option value="Hold">Hold</option>
                  <option value="Logged">Logged (unmarked)</option>
                </select>
              </div>
              <div>
                <label className="label">Proceed</label>
                <select className="input" value={filterProceed} onChange={(e) => setFilterProceed(e.target.value)}>
                  <option value="">All</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="Hold">Hold</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── Summary cards ─────────────────────────────────────────── */}
        {(logs || []).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <SummaryCard label="Total Trainers"    value={String(uniqueTrainers)}          color="#38bdf8" />
            <SummaryCard label="Total Sessions"    value={String(totalSessions)}           color="#eab308" />
            <SummaryCard label="Total Amount"      value={`₹${totalAmount.toLocaleString()}`} color="#22c55e" />
            <SummaryCard label="Pending Payment"   value={`₹${totalPending.toLocaleString()}`} color="#fb923c" />
          </div>
        )}

        {/* ── Table ─────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="muted text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={TableProperties}
            tone="grey"
            title={hasFilters ? 'No sessions match filters' : 'No sessions this week'}
            description={hasFilters
              ? 'Clear the filters above to see all entries.'
              : 'Navigate to a different week, or log sessions via Session logs.'}
          />
        ) : viewMode === 'excel' ? (
          <ExcelView logs={filtered} canMarkStatus={canMarkStatus} canEdit={canEdit} onRefresh={refresh} />
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th className="w-8 text-center">Sr</th>
                  <th>Date</th>
                  <th>Trainer</th>
                  <th>Client</th>
                  <th title="Editable">Sessions {canEdit && <Pencil size={9} className="inline opacity-40" />}</th>
                  <th title="Editable">Rate ₹ {canEdit && <Pencil size={9} className="inline opacity-40" />}</th>
                  <th>Total ₹</th>
                  <th title={canMarkStatus ? 'Click to mark Paid / Not Paid' : 'Set by Samita'}>
                    Status {!canMarkStatus && <span className="muted text-[9px] normal-case font-normal">(Samita)</span>}
                  </th>
                  <th>Proceed</th>
                  <th title="Editable">Comments {canEdit && <Pencil size={9} className="inline opacity-40" />}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => (
                  <tr key={l.id}>
                    <td className="mono text-[11px] text-center muted">{i + 1}</td>
                    <td className="mono text-[12px]">{l.date}</td>
                    <td className="font-medium text-sm">{l.trainer.name}</td>
                    <td className="muted text-[12px]">{l.client?.name || '—'}</td>
                    <td>
                      {canEdit
                        ? <EditableNumber value={l.hours} logId={l.id} field="hours" onSaved={refresh} />
                        : <span className="mono text-xs">{l.hours}</span>}
                    </td>
                    <td>
                      {canEdit
                        ? <EditableNumber value={l.rateSnapshot} logId={l.id} field="rateSnapshot" prefix="₹" onSaved={refresh} />
                        : <span className="mono text-xs">₹{l.rateSnapshot.toLocaleString()}</span>}
                    </td>
                    <td className="mono font-semibold text-sm">₹{l.amountInr.toLocaleString()}</td>
                    <td>
                      <StatusCell logId={l.id} value={l.status} canEdit={canMarkStatus} onSaved={refresh} />
                    </td>
                    <td>
                      {canEdit
                        ? <ProceedCell logId={l.id} value={l.proceed} onSaved={refresh} />
                        : (l.proceed
                          ? <span className="text-xs font-semibold" style={{ color: (PROCEED_CFG as any)[l.proceed]?.color }}>{l.proceed}</span>
                          : <span className="muted text-[11px]">—</span>)}
                    </td>
                    <td>
                      {canEdit
                        ? <EditableText value={l.comments} logId={l.id} field="comments" onSaved={refresh} />
                        : <span className="text-[11px] muted">{l.comments || '—'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg-input)' }}>
                  <td colSpan={6} className="text-right text-xs font-semibold pr-3">Grand Total</td>
                  <td className="mono font-bold" style={{ color: 'var(--status-green)' }}>₹{totalAmount.toLocaleString()}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Page>
    </>
  );
}
