import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'dark' | 'light';
const STORAGE_KEY = 'mits-theme';

function readSavedTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'light' ? 'light' : 'dark';
}

function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', t);
}

/** Call once at app boot — sets the saved theme before first paint. */
export function initTheme() {
  applyTheme(readSavedTheme());
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readSavedTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable (private mode etc) — non-fatal
    }
  }, [theme]);

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded hover:bg-bg-input"
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
