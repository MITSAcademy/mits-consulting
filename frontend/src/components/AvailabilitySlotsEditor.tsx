import { Button } from '@/components/ui/button';
import { Plus, X, AlertTriangle } from 'lucide-react';
import type { AvailabilitySlot } from '@/lib/utils';
import { Time12h } from '@/components/Time12h';

/** Detect window-vs-time mismatches.
 *  If Aman picks "Night" / "Evening" but the time is morning (or vice versa),
 *  she almost certainly meant the opposite — flag it loudly. The first bug
 *  report ("Night 8:30 AM–9:00 AM") would have been caught by this. */
function windowMismatch(window?: string, fromIst?: string, toIst?: string): string | null {
  if (!window || !fromIst) return null;
  const h = Number((fromIst.split(':')[0] || '0'));
  const isMorning = h < 12;
  const isEvening = h >= 17;
  const w = window.toLowerCase();
  if ((w === 'night' || w === 'evening') && isMorning) {
    return `You picked "${window}" but the time (${fromIst}) is morning. Did you mean PM?`;
  }
  if (w === 'morning' && !isMorning) {
    return `You picked "Morning" but the time (${fromIst}) is afternoon/evening. Did you mean AM?`;
  }
  // Also check that the "to" time is after "from" (basic sanity)
  if (toIst && toIst.localeCompare(fromIst) < 0 && Math.abs(h - Number(toIst.split(':')[0])) > 8) {
    return `End time (${toIst}) is before start (${fromIst}). Check AM/PM on both.`;
  }
  return null;
}

interface Props {
  slots: AvailabilitySlot[];
  onChange: (slots: AvailabilitySlot[]) => void;
}

export function AvailabilitySlotsEditor({ slots, onChange }: Props) {
  function update(i: number, patch: Partial<AvailabilitySlot>) {
    onChange(slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function remove(i: number) {
    onChange(slots.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...slots, { window: '', fromIst: '', toIst: '' }]);
  }

  return (
    <div className="space-y-1.5">
      {slots.length === 0 && (
        <div className="text-xs muted italic">No slots set — click "+ Add slot" to add when this trainer can take sessions.</div>
      )}
      {slots.map((s, i) => {
        const warn = windowMismatch(s.window, s.fromIst, s.toIst);
        return (
        <div key={i} className="space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <select
              className="rounded border px-2 py-1 text-sm bg-bg-input border-brand-border h-8"
              style={{ minWidth: 120 }}
              value={s.window || ''}
              onChange={(e) => update(i, { window: e.target.value })}
            >
              <option value="">— window —</option>
              <option value="Morning">Morning</option>
              <option value="Afternoon">Afternoon</option>
              <option value="Evening">Evening</option>
              <option value="Night">Night</option>
              <option value="Flexible">Flexible</option>
            </select>
            <Time12h
              value={s.fromIst || ''}
              onChange={(v) => update(i, { fromIst: v })}
              ariaLabel="From time"
            />
            <span className="text-xs muted">to</span>
            <Time12h
              value={s.toIst || ''}
              onChange={(v) => update(i, { toIst: v })}
              ariaLabel="To time"
            />
            <span className="text-[11px] muted">IST</span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="ml-auto text-brand-textMuted hover:text-brand-red p-1 rounded"
              title="Remove slot"
            >
              <X size={14} />
            </button>
          </div>
          {warn && (
            <div
              className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded"
              style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--status-amber)' }}
            >
              <AlertTriangle size={12} />
              <span>{warn}</span>
            </div>
          )}
        </div>
        );
      })}
      <Button size="sm" type="button" onClick={add}>
        <Plus size={12} /> Add slot
      </Button>
    </div>
  );
}
