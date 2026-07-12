export interface StreakData {
  current: number;      // consecutive days
  best: number;         // all-time best
  lastDate: string;     // ISO date "YYYY-MM-DD" of last check-in
  todayDone: boolean;   // has today's check-in already been shown this session
}
const KEY = 'mits_streak';
const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

export function getStreak(): StreakData {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') || { current: 0, best: 0, lastDate: '', todayDone: false }; } catch { return { current: 0, best: 0, lastDate: '', todayDone: false }; }
}

export function checkInStreak(): { data: StreakData; isNew: boolean; isNewBest: boolean } {
  // Returns isNew=true only if this is the first check-in today
  const data = getStreak();
  const t = today();
  if (data.lastDate === t) return { data: { ...data, todayDone: true }, isNew: false, isNewBest: false };
  const continued = data.lastDate === yesterday();
  const newCurrent = continued ? data.current + 1 : 1;
  const newBest = Math.max(data.best, newCurrent);
  const next: StreakData = { current: newCurrent, best: newBest, lastDate: t, todayDone: true };
  localStorage.setItem(KEY, JSON.stringify(next));
  return { data: next, isNew: true, isNewBest: newCurrent > data.best && data.best > 0 };
}
