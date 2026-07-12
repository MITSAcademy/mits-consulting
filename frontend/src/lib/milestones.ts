// Milestone engine — fires an appreciative toast when a user crosses a count threshold.
// Each milestone fires only once (tracked in localStorage).
// Usage: checkMilestone('sessions_logged', newCount, showToast)

const KEY = 'mits_milestones';

function getFired(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); }
}
function markFired(id: string) {
  const s = getFired(); s.add(id);
  localStorage.setItem(KEY, JSON.stringify([...s]));
}

interface Milestone { count: number; message: string; kind?: 'success' | 'info' }

const MILESTONES: Record<string, Milestone[]> = {
  sessions_logged: [
    { count: 1,   message: '🎯 First session logged — you\'re on the board!', kind: 'success' },
    { count: 5,   message: '🔥 5 sessions logged this month — great momentum!', kind: 'success' },
    { count: 10,  message: '💪 10 sessions — you\'re crushing it!', kind: 'success' },
    { count: 25,  message: '🏆 25 sessions logged — incredible work!', kind: 'success' },
    { count: 50,  message: '🌟 50 sessions! You\'re a legend on this team.', kind: 'success' },
  ],
  payments_recorded: [
    { count: 1,   message: '💰 First payment recorded — money in the bank!', kind: 'success' },
    { count: 5,   message: '💰 5 payments recorded today — on fire!', kind: 'success' },
    { count: 10,  message: '🤑 10 payments — the team thanks you!', kind: 'success' },
  ],
  clients_closed: [
    { count: 1,   message: '🎉 First client closed this month — let\'s go!', kind: 'success' },
    { count: 5,   message: '🏅 5 clients closed — incredible closing streak!', kind: 'success' },
    { count: 10,  message: '🌟 10 clients closed this month. Absolute legend.', kind: 'success' },
  ],
  demos_done: [
    { count: 1,   message: '✅ Demo marked done — great execution!', kind: 'success' },
    { count: 5,   message: '🎤 5 demos done — you\'re on a roll!', kind: 'success' },
    { count: 10,  message: '🏆 10 demos done — the demo team is proud!', kind: 'success' },
  ],
  issues_resolved: [
    { count: 1,   message: '✅ Issue resolved — one less blocker for the team!', kind: 'success' },
    { count: 5,   message: '🛠️ 5 issues resolved — you\'re the team\'s problem-solver!', kind: 'success' },
  ],
};

// checkMilestone: call from onSuccess handlers
// category: key from MILESTONES
// count: NEW total after this action (1-indexed)
// showToast: from useUI
export function checkMilestone(
  category: string,
  count: number,
  showToast: (msg: string, kind?: 'success' | 'error' | 'info' | 'warning') => void
) {
  const milestones = MILESTONES[category];
  if (!milestones) return;
  const fired = getFired();
  for (const m of milestones) {
    const id = `${category}_${m.count}`;
    if (count >= m.count && !fired.has(id)) {
      markFired(id);
      // Small delay so the regular toast fires first
      setTimeout(() => showToast(m.message, m.kind || 'success'), 800);
      break; // only one milestone per action
    }
  }
}

// getMonthlyCount: reads from localStorage a simple counter per category per month
// Used to track running totals without needing backend changes.
const COUNT_KEY = 'mits_milestone_counts';
function getCounts(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(COUNT_KEY) || '{}'); } catch { return {}; }
}
export function incrementCount(category: string): number {
  const month = new Date().toISOString().slice(0, 7); // "2026-07"
  const key = `${category}_${month}`;
  const counts = getCounts();
  const next = (counts[key] || 0) + 1;
  counts[key] = next;
  localStorage.setItem(COUNT_KEY, JSON.stringify(counts));
  return next;
}
export function getCount(category: string): number {
  const month = new Date().toISOString().slice(0, 7);
  const key = `${category}_${month}`;
  const counts = getCounts();
  return counts[key] || 0;
}
