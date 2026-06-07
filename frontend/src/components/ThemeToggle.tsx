import { useEffect, useState } from 'react';
import { Moon, Sun, Clock3 } from 'lucide-react';

/** Three-state theme cycle.
 *   Auto  = follow the time of day (morning = light, evening = dark, re-checked every 15 min)
 *   Light = morning theme, always
 *   Dark  = evening theme, always
 * Cycles on click: Auto → Light → Dark → Auto. The saved preference always
 * persists; "Auto" is the new default for users who haven't picked yet so
 * the UI naturally warms up at sunset.                                       */
type ThemeChoice = 'auto' | 'light' | 'dark';
type Resolved   = 'light' | 'dark';

const STORAGE_KEY = 'mits-theme';

/** 6 AM – 6 PM IST-ish window = morning. Anything else = evening.
 *  Uses local time (browser TZ), so users abroad get their own sunset.       */
function timeBucket(): Resolved {
  const h = new Date().getHours();
  return h >= 6 && h < 18 ? 'light' : 'dark';
}

function readChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'auto';
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark' || v === 'auto') return v;
  return 'auto';
}

function resolve(choice: ThemeChoice): Resolved {
  return choice === 'auto' ? timeBucket() : choice;
}

function applyTheme(t: Resolved) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', t);
}

/** Boot — apply the saved (or auto-detected) theme before first paint. */
export function initTheme() {
  applyTheme(resolve(readChoice()));
}

/** Greeting helper exported for the Topbar so it always matches the
 *  currently-resolved theme bucket (morning / afternoon / evening / night). */
export function timeGreeting(): { greeting: string; emoji: string } {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return { greeting: 'Good morning',   emoji: '☀️' };
  if (h >= 12 && h < 17) return { greeting: 'Good afternoon', emoji: '🌤️' };
  if (h >= 17 && h < 21) return { greeting: 'Good evening',   emoji: '🌆' };
  return { greeting: 'Working late', emoji: '🌙' };
}

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice());

  // Apply + persist on every change
  useEffect(() => {
    applyTheme(resolve(choice));
    try { window.localStorage.setItem(STORAGE_KEY, choice); } catch { /* private mode */ }
  }, [choice]);

  // If user is on "auto", re-check the time bucket every 15 minutes so the
  // UI quietly warms up at sunset without a refresh.
  useEffect(() => {
    if (choice !== 'auto') return;
    const id = setInterval(() => applyTheme(resolve('auto')), 15 * 60_000);
    return () => clearInterval(id);
  }, [choice]);

  const next = (): ThemeChoice => choice === 'auto' ? 'light' : choice === 'light' ? 'dark' : 'auto';
  const Icon = choice === 'auto' ? Clock3 : choice === 'light' ? Sun : Moon;
  const label =
    choice === 'auto'  ? `Auto theme (currently ${resolve('auto')}). Click → Light.`
    : choice === 'light' ? 'Light theme. Click → Dark.'
    : 'Dark theme. Click → Auto.';

  return (
    <button
      onClick={() => setChoice(next())}
      className="p-2 rounded-lg hover:bg-bg-cardHover transition-all"
      title={label}
      aria-label="Theme — Auto / Light / Dark"
      style={{ border: '1px solid var(--brand-borderSoft)' }}
    >
      <Icon size={18} style={{ color: 'var(--brand-textSecondary)' }} />
    </button>
  );
}
