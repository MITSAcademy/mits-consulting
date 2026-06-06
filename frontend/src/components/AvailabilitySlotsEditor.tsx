import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { to12h, type AvailabilitySlot } from '@/lib/utils';

/** Show "= 8:00 PM" next to a time input so the user instantly sees AM/PM.
 *  Bugfix per Aman: she entered 08:00 thinking 8 PM, but no AM/PM was
 *  visible so it stored as 8 AM and Anjali saw "morning". Now the preview
 *  is color-coded — green when PM, amber when AM — to flag morning entries
 *  on a slot that's probably meant to be evening. */
function AmPmHint({ hhmm }: { hhmm?: string }) {
  if (!hhmm) return null;
  const pretty = to12h(hhmm);
  const isAm = pretty.endsWith('AM');
  return (
    <span
      className={`text-[10px] font-medium ${isAm ? 'text-brand-amber' : 'text-brand-green'}`}
      title={isAm ? 'AM = morning. If you meant the evening, switch to PM (e.g. 20:00 = 8 PM).' : 'PM = evening.'}
    >
      = {pretty}
    </span>
  );
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
      {slots.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5 flex-wrap">
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
          <Input
            type="time"
            className="!w-[110px] h-8"
            value={s.fromIst || ''}
            onChange={(e) => update(i, { fromIst: e.target.value })}
          />
          <AmPmHint hhmm={s.fromIst} />
          <span className="text-xs muted">to</span>
          <Input
            type="time"
            className="!w-[110px] h-8"
            value={s.toIst || ''}
            onChange={(e) => update(i, { toIst: e.target.value })}
          />
          <AmPmHint hhmm={s.toIst} />
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
      ))}
      <Button size="sm" type="button" onClick={add}>
        <Plus size={12} /> Add slot
      </Button>
    </div>
  );
}
