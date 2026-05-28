import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import type { AvailabilitySlot } from '@/lib/utils';

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
          <span className="text-xs muted">to</span>
          <Input
            type="time"
            className="!w-[110px] h-8"
            value={s.toIst || ''}
            onChange={(e) => update(i, { toIst: e.target.value })}
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
      ))}
      <Button size="sm" type="button" onClick={add}>
        <Plus size={12} /> Add slot
      </Button>
    </div>
  );
}
