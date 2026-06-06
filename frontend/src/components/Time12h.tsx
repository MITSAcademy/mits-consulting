/**
 * Time12h — explicit 12-hour time picker.
 *
 * Why this exists: native <input type="time"> stores "HH:MM" in 24-hour
 * format. When users type "8:30" thinking 8:30 PM, the browser silently
 * accepts it as 8:30 AM. Aman has hit this bug twice — proposals coming
 * out as "Night 8:30 AM" because the time was stored as 08:30 while the
 * window dropdown said "Night".
 *
 * This component splits the input into Hour · Minute · AM/PM dropdowns
 * so the user can NEVER skip picking AM or PM. Same external contract as
 * a native time input — receives + emits "HH:MM" 24-hour strings, so it's
 * a drop-in replacement.
 *
 * Quick-set chips ("9 AM", "8 PM", "9 PM") cover the most common slots
 * so one click sets the whole thing.
 */
import { useMemo } from 'react';

interface Props {
  value: string;                      // "HH:MM" 24-hour (e.g. "20:30")
  onChange: (v: string) => void;      // emits same format
  className?: string;
  quickSet?: boolean;                 // show 9AM/8PM/9PM chips below the dropdowns
  ariaLabel?: string;
}

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES  = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

function parse(value: string): { h12: number; mm: string; isAm: boolean } {
  const m = /^(\d{1,2}):(\d{2})/.exec(value || '');
  if (!m) return { h12: 8, mm: '00', isAm: false }; // 8 PM default (most common training slot)
  const h24 = Number(m[1]);
  const mm = m[2];
  const isAm = h24 < 12;
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return { h12, mm, isAm };
}

function to24h(h12: number, mm: string, isAm: boolean): string {
  let h24: number;
  if (isAm) h24 = h12 === 12 ? 0 : h12;
  else      h24 = h12 === 12 ? 12 : h12 + 12;
  return `${String(h24).padStart(2, '0')}:${mm.padStart(2, '0')}`;
}

export function Time12h({ value, onChange, className = '', quickSet = false, ariaLabel }: Props) {
  const { h12, mm, isAm } = useMemo(() => parse(value), [value]);

  // selectStyle keeps the dropdowns compact (no fluid `width: 100%` from
  // the global .input rule) so the H · MM · AM/PM trio reads as a unit.
  const selectStyle: React.CSSProperties = { width: 'auto', padding: '7px 8px' };

  return (
    <div className={`inline-flex flex-col gap-1 ${className}`} aria-label={ariaLabel}>
      <div className="inline-flex items-center gap-1">
        <select
          value={h12}
          onChange={(e) => onChange(to24h(Number(e.target.value), mm, isAm))}
          style={selectStyle}
          aria-label="Hour"
        >
          {HOURS_12.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <span className="muted text-sm">:</span>
        <select
          value={mm}
          onChange={(e) => onChange(to24h(h12, e.target.value, isAm))}
          style={selectStyle}
          aria-label="Minute"
        >
          {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={isAm ? 'AM' : 'PM'}
          onChange={(e) => onChange(to24h(h12, mm, e.target.value === 'AM'))}
          style={{ ...selectStyle, fontWeight: 600, color: isAm ? 'var(--status-amber)' : 'var(--status-green)' }}
          aria-label="AM or PM"
          title={isAm ? 'AM = morning. Pick PM for evening (e.g. 8 PM).' : 'PM = evening.'}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      {quickSet && (
        <div className="inline-flex flex-wrap gap-1 mt-0.5">
          {[
            { label: '9 AM', v: '09:00' },
            { label: '6 PM', v: '18:00' },
            { label: '8 PM', v: '20:00' },
            { label: '9 PM', v: '21:00' },
          ].map((q) => (
            <button
              key={q.v}
              type="button"
              onClick={() => onChange(q.v)}
              className={`text-[10px] px-1.5 py-0.5 rounded border ${value === q.v ? 'border-brand-amber text-brand-amber' : 'border-brand-border muted hover:border-brand-textMuted'}`}
              title={`Quick-set to ${q.label}`}
            >
              {q.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
