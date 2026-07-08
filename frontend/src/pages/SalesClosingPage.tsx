import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/ui/pill';
import { useAuth } from '@/store/auth';
import { EmptyState } from '@/components/EmptyState';
import { LayoutGrid, Search } from 'lucide-react';

const STAGE_ORDER = ['DemoDone', 'FeedbackPending', 'SaleClosing', 'SaleWon', 'Active'];
const BOARD_STAGES = ['SaleClosing', 'SaleWon', 'Active'];


function subStatusPillColor(ss: string): 'amber' | 'green' | 'grey' | 'blue' | 'red' {
  if (ss === 'RP') return 'blue';
  if (ss === 'CP') return 'amber';
  if (ss === 'C') return 'amber';
  if (ss === 'DP') return 'red';
  if (ss === 'JBT-Paid' || ss === 'Training-Paid') return 'green';
  if (ss === 'JBT-EmployerLater' || ss === 'Training-EmployerLater') return 'green';
  return 'grey';
}

function pendingAction(c: any): { label: string; urgent: boolean } {
  const ss = c.saleClosingSubStatus;
  const lc = c.lifecycle;

  if (lc === 'DemoDone' || lc === 'FeedbackPending') return { label: 'Start closing', urgent: false };
  if (lc === 'SaleClosing') {
    if (!ss || ss === 'RP') return { label: 'Call client · move to CP / C / JBT / Training', urgent: true };
    if (ss === 'CP') return { label: 'Follow up in 3 days · reach them → move to C', urgent: false };
    if (ss === 'C') return { label: 'Follow up daily · waiting for payment', urgent: true };
    if (ss === 'DP') return { label: 'Dropped — no follow-up', urgent: false };
    if (ss === 'JBT-EmployerLater' || ss === 'Training-EmployerLater') return { label: 'Send engagement letter', urgent: false };
  }
  if (lc === 'SaleWon') {
    if (!c.engagementLetterSentAt) return { label: 'Send engagement letter', urgent: true };
    if (!c.whatsappGroupRenamedAt) return { label: 'Rename WA group', urgent: false };
    return { label: 'Activate client', urgent: false };
  }
  if (lc === 'Active') return { label: 'Active — with Mitali', urgent: false };
  return { label: '—', urgent: false };
}

function daysSince(iso?: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// ── Tile board (Roshni / sales_closer view) ───────────────────────────────

type TileColumn = {
  key: string;
  label: string;
  accent: string;
  desc: string;
};

const TILE_COLUMNS: TileColumn[] = [
  { key: 'RP',       label: 'RP',       accent: '#1A6CDF', desc: 'Call them · move to CP / C / JBT / Training' },
  { key: 'CP',       label: 'CP',       accent: '#D97706', desc: 'Called, went silent · follow up in 3 days' },
  { key: 'C',        label: 'C',        accent: '#D97706', desc: 'Letter sent · follow up daily until paid' },
  { key: 'SaleWon',  label: 'Won',      accent: '#7C3AED', desc: 'JBT / Training · activate client' },
  { key: 'Active',   label: 'Active',   accent: '#0F8A5F', desc: 'With Mitali' },
];

function clientColKey(c: any): string {
  const lc = c.lifecycle;
  const ss = c.saleClosingSubStatus;
  if (lc === 'SaleClosing') {
    if (!ss || ss === 'RP') return 'RP';
    if (ss === 'CP') return 'CP';
    if (ss === 'C') return 'C';
    // DP and win outcomes are terminal — show in "Won" column for wins, skip DP
    if (ss === 'JBT-Paid' || ss === 'Training-Paid' || ss === 'JBT-EmployerLater' || ss === 'Training-EmployerLater') return 'SaleWon';
    return 'RP';
  }
  if (lc === 'SaleWon') return 'SaleWon';
  if (lc === 'Active') return 'Active';
  return 'RP';
}

function ClientTile({ c }: { c: any }) {
  const { label, urgent } = pendingAction(c);
  const days = daysSince(c.stageEnteredAt);
  const ss = c.saleClosingSubStatus;
  return (
    <Link
      to={`/clients/${c.id}`}
      className="block rounded-lg border p-2.5 mb-1.5 transition-all"
      style={{
        background: 'var(--bg-card)',
        borderColor: urgent ? 'rgba(245,158,11,0.40)' : 'var(--brand-borderSoft)',
        boxShadow: urgent ? '0 2px 8px rgba(245,158,11,0.08)' : 'var(--shadow-sm)',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-cardHover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)'; }}
    >
      <div className="font-semibold text-xs mb-1 truncate" style={{ color: 'var(--brand-text)' }}>{c.name}</div>
      <div className="flex items-center gap-1 flex-wrap mb-1">
        {ss && <Pill color={subStatusPillColor(ss)}>{ss}</Pill>}
        {c.engagementType && <span className="text-[10px] muted">{c.engagementType}</span>}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px]" style={{ color: urgent ? 'var(--status-amber)' : 'var(--brand-textMuted)' }}>
          {urgent && '⚡ '}{label}
        </span>
        <span className="text-[10px] mono" style={{ color: days >= 5 ? 'var(--status-red)' : days >= 3 ? 'var(--status-amber)' : 'var(--brand-textMuted)' }}>
          {days}d
        </span>
      </div>
    </Link>
  );
}

function TileBoard({ items }: { items: any[] }) {
  const byCol: Record<string, any[]> = {};
  for (const col of TILE_COLUMNS) byCol[col.key] = [];
  // exclude DP from board — they're dropped
  for (const c of items) {
    if (c.saleClosingSubStatus === 'DP') continue;
    const key = clientColKey(c);
    if (byCol[key]) byCol[key].push(c);
  }
  const droppedCount = items.filter(c => c.saleClosingSubStatus === 'DP').length;

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ alignItems: 'flex-start' }}>
        {TILE_COLUMNS.map((col) => {
          const clients = byCol[col.key] || [];
          return (
            <div key={col.key} className="flex-shrink-0 rounded-xl border p-3"
              style={{
                width: 220,
                minHeight: 180,
                background: 'var(--bg-card)',
                borderColor: 'var(--brand-border)',
              }}
            >
              {/* Column header */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold" style={{ color: col.accent }}>{col.label}</span>
                  <span className="text-[10px] px-1.5 py-px rounded-full font-bold"
                    style={{ background: `color-mix(in srgb, ${col.accent} 15%, var(--bg-input))`, color: col.accent }}>
                    {clients.length}
                  </span>
                </div>
              </div>
              <div className="text-[10px] muted mb-2.5">{col.desc}</div>
              {clients.length === 0 && (
                <div className="text-[10px] muted text-center pt-4">Empty</div>
              )}
              {clients.map((c: any) => <ClientTile key={c.id} c={c} />)}
            </div>
          );
        })}
      </div>
      {droppedCount > 0 && (
        <div className="mt-3 text-[11px] muted">
          {droppedCount} client{droppedCount !== 1 ? 's' : ''} in DP (dropped) — hidden from board. Open client page to view.
        </div>
      )}
    </>
  );
}


// ── Page ──────────────────────────────────────────────────────────────────

export function SalesClosingPage() {
  const user = useAuth((s) => s.user)!;
  const { data } = useQuery({ queryKey: ['clients'], queryFn: () => api.get('/clients').then((r) => r.data) });
  const [search, setSearch] = useState('');

  const all = (data || []) as any[];
  const searchLower = search.trim().toLowerCase();
  const items = all
    .filter((c: any) => {
      if (!BOARD_STAGES.includes(c.lifecycle)) return false;
      // sales_closer sees all closing-stage clients (shared queue across the team)
      return true;
    })
    .filter((c: any) => !searchLower || c.name?.toLowerCase().includes(searchLower) || c.skills?.toLowerCase().includes(searchLower))
    .sort((a: any, b: any) => STAGE_ORDER.indexOf(a.lifecycle) - STAGE_ORDER.indexOf(b.lifecycle));

  return (
    <>
      <Topbar
        title="My pipeline"
        subtitle={`${items.length} client${items.length !== 1 ? 's' : ''} across closing stages`}
        actions={
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 muted pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name…"
              className="pl-7 pr-3 py-1.5 text-xs rounded-lg"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', width: 160, outline: 'none' }}
            />
          </div>
        }
      />
      <Page>


        {items.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            tone="gold"
            title="No clients in your pipeline"
            description="Clients appear here once they reach Demo Done and move through closing to Active."
          />
        ) : (
          <TileBoard items={items} />
        )}
      </Page>
    </>
  );
}
