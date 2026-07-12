/**
 * IdleGame — detects user inactivity (5 min) and offers a quick mini-game.
 *
 * Game: "Gold Rush" — gold coins pop up on a 4×4 grid for 10 seconds.
 * Tap them before they vanish. Score = coins tapped. High score saved in
 * localStorage. Streak bonus: 3+ in a row = multiplier.
 *
 * Wire-up: mount <IdleGame /> once in AppLayout alongside CelebrationLayer.
 * No props needed.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { celebrate } from './CelebrationLayer';
import { playTick, isSoundEnabled, setSoundEnabled } from '@/lib/sounds';

const IDLE_MS = 5 * 60 * 1000;   // 5 min
const GRID    = 16;                // 4×4
const GAME_MS = 12_000;            // 12 s round
const COIN_LIFE_MIN = 900;         // ms a coin stays visible
const COIN_LIFE_MAX = 1600;
const SPAWN_INTERVAL = 420;        // ms between spawns
const HS_KEY = 'mits_goldrush_hs';

type CoinState = { id: number; cell: number; born: number; lifeMs: number } | null;

const GAMES = [
  { id: 'goldrush', label: 'Gold Rush', emoji: '🪙', desc: 'Tap the coins before they vanish — 12 seconds, how many can you get?' },
  { id: 'breathe',  label: 'Box Breathe', emoji: '🌬️', desc: 'A 30-second guided breathing exercise. Relax your mind.' },
  { id: 'trivia',   label: 'Fitness Trivia', emoji: '🧠', desc: 'Three quick questions about fitness & training.' },
];

// ── Trivia questions ──────────────────────────────────────────────────────────
const TRIVIA = [
  { q: 'How many muscles does the human body have?', opts: ['~200', '~400', '~600', '~800'], a: 2 },
  { q: 'Which nutrient is the body\'s preferred energy source?', opts: ['Fat', 'Protein', 'Carbohydrates', 'Vitamins'], a: 2 },
  { q: 'How long should a warm-up typically last?', opts: ['1–2 min', '5–10 min', '20–25 min', '30+ min'], a: 1 },
  { q: 'What does HIIT stand for?', opts: ['High-Intensity Interval Training', 'High-Impact Incremental Technique', 'Heart-rate Integrated Interval Toning', 'High-Incline Isometric Training'], a: 0 },
  { q: 'Which vitamin is produced when skin is exposed to sunlight?', opts: ['Vitamin A', 'Vitamin B12', 'Vitamin C', 'Vitamin D'], a: 3 },
  { q: 'How many hours of sleep do most adults need?', opts: ['4–5', '6–7', '7–9', '10–12'], a: 2 },
  { q: 'What is the recommended daily water intake for adults?', opts: ['1 L', '2 L', '3.5 L', '5 L'], a: 1 },
  { q: 'Which exercise targets the gluteus maximus most directly?', opts: ['Bicep curl', 'Squat', 'Plank', 'Calf raise'], a: 1 },
];

function pick3() {
  const shuffled = [...TRIVIA].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

// ── Gold Rush game ────────────────────────────────────────────────────────────
function GoldRush({ onDone }: { onDone: (score: number) => void }) {
  const [coins, setCoins] = useState<CoinState[]>(Array(GRID).fill(null));
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_MS);
  const [combo, setCombo] = useState<{ val: number; key: number } | null>(null);
  const [missed, setMissed] = useState(0);

  const scoreRef  = useRef(0);
  const streakRef = useRef(0);
  const coinsRef  = useRef<CoinState[]>(Array(GRID).fill(null));
  const nextId    = useRef(0);
  const done      = useRef(false);

  const tap = useCallback((cell: number) => {
    playTick();
    const current = coinsRef.current[cell];
    if (!current) return;
    const newCoins = [...coinsRef.current];
    newCoins[cell] = null;
    coinsRef.current = newCoins;
    setCoins([...newCoins]);
    scoreRef.current += 1;
    streakRef.current += 1;
    setMaxStreak(m => Math.max(m, streakRef.current));
    setScore(scoreRef.current);
    setStreak(streakRef.current);
    if (streakRef.current >= 3) {
      setCombo({ val: streakRef.current, key: Date.now() });
    }
  }, []);

  useEffect(() => {
    const start = Date.now();
    done.current = false;

    // Countdown
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, GAME_MS - elapsed);
      setTimeLeft(remaining);
      if (remaining === 0) {
        done.current = true;
        clearInterval(tick);
        onDone(scoreRef.current);
      }
    }, 100);

    // Spawn coins
    const spawn = setInterval(() => {
      if (done.current) { clearInterval(spawn); return; }
      const empty: number[] = [];
      coinsRef.current.forEach((c, i) => { if (!c) empty.push(i); });
      if (empty.length === 0) return;
      const cell = empty[Math.floor(Math.random() * empty.length)];
      const lifeMs = COIN_LIFE_MIN + Math.random() * (COIN_LIFE_MAX - COIN_LIFE_MIN);
      const coin: CoinState = { id: nextId.current++, cell, born: Date.now(), lifeMs };
      const next = [...coinsRef.current];
      next[cell] = coin;
      coinsRef.current = next;
      setCoins([...next]);

      // Auto-expire
      setTimeout(() => {
        if (done.current) return;
        const cur = coinsRef.current[cell];
        if (cur?.id === coin.id) {
          const expired = [...coinsRef.current];
          expired[cell] = null;
          coinsRef.current = expired;
          setCoins([...expired]);
          streakRef.current = 0;
          setStreak(0);
          setMissed(m => m + 1);
        }
      }, lifeMs);
    }, SPAWN_INTERVAL);

    return () => { done.current = true; clearInterval(tick); clearInterval(spawn); };
  }, [onDone]);

  const progress = timeLeft / GAME_MS;
  const urgentColor = timeLeft < 3000 ? 'var(--status-red)' : timeLeft < 6000 ? 'var(--status-amber)' : 'var(--accent-gold)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, userSelect: 'none' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--accent-gold)' }}>
          {scoreRef.current}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-textMuted)', marginLeft: 4 }}>pts</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: urgentColor, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
            {(timeLeft / 1000).toFixed(1)}s
          </div>
          {streak >= 3 && (
            <div style={{ fontSize: 11, color: 'var(--accent-gold)', fontWeight: 700 }}>🔥 ×{streak} streak!</div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 5, borderRadius: 999, background: 'var(--brand-borderSoft)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${urgentColor}, color-mix(in srgb, ${urgentColor} 70%, white))`, width: `${progress * 100}%`, transition: 'width 0.1s linear, background 0.5s ease' }} />
      </div>

      {/* Combo flash */}
      {combo && (
        <div
          key={combo.key}
          style={{ textAlign: 'center', fontSize: 22, fontWeight: 900, color: 'var(--accent-gold)', animation: 'comboFlash 700ms ease-out forwards', letterSpacing: '-0.01em' }}
        >
          🔥 ×{combo.val} COMBO!
        </div>
      )}

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {coins.map((coin, i) => {
          const age = coin ? (Date.now() - coin.born) / coin.lifeMs : 0;
          const fadingOut = age > 0.7;
          return (
            <button
              key={i}
              onClick={() => tap(i)}
              style={{
                aspectRatio: '1',
                borderRadius: 14,
                border: coin ? '2px solid rgba(229,178,76,0.5)' : '2px solid var(--brand-borderSoft)',
                background: coin
                  ? `linear-gradient(135deg, rgba(229,178,76,${fadingOut ? 0.15 : 0.22}) 0%, rgba(229,178,76,${fadingOut ? 0.06 : 0.12}) 100%)`
                  : 'var(--bg-input)',
                cursor: coin ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: coin ? 28 : 14,
                transition: 'all 120ms ease',
                transform: coin ? 'scale(1)' : 'scale(0.95)',
                boxShadow: coin ? '0 4px 16px rgba(229,178,76,0.25), inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
                opacity: coin ? (fadingOut ? 0.5 : 1) : 0.4,
              }}
            >
              {coin ? '🪙' : ''}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--brand-textMuted)' }}>
        <span>Tap coins before they vanish</span>
        <span>Missed: {missed}</span>
      </div>

      <style>{`
        @keyframes comboFlash {
          0%   { opacity: 1; transform: scale(1.1) translateY(-4px); }
          60%  { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0.9) translateY(4px); }
        }
      `}</style>
    </div>
  );
}

// ── Score screen ──────────────────────────────────────────────────────────────
function ScoreScreen({ score, hs, onRetry, onClose }: { score: number; hs: number; onRetry: () => void; onClose: () => void }) {
  const isNew = score > 0 && score >= hs;
  const tier = score >= 25 ? '🏆 Legend' : score >= 15 ? '🥇 Pro' : score >= 8 ? '🥈 Solid' : score >= 4 ? '🥉 Nice try' : '😅 Keep going';

  useEffect(() => {
    if (score >= 10) celebrate();
  }, [score]);

  return (
    <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
      <div style={{ fontSize: 52, marginBottom: 8 }}>{isNew ? '🎉' : '🪙'}</div>
      <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--accent-gold)' }}>{score}</div>
      <div style={{ fontSize: 13, color: 'var(--brand-textMuted)', marginBottom: 4 }}>coins tapped</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{tier}</div>
      {isNew && score > 0 && (
        <div style={{ fontSize: 12, color: 'var(--status-green)', fontWeight: 600, marginBottom: 12 }}>
          ✨ New high score! (was {hs === score ? 0 : hs})
        </div>
      )}
      {!isNew && hs > 0 && (
        <div style={{ fontSize: 12, color: 'var(--brand-textMuted)', marginBottom: 12 }}>
          Your best: {hs} coins
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button
          onClick={onRetry}
          style={{ padding: '8px 20px', borderRadius: 10, background: 'var(--accent-gold)', color: '#0F1115', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}
        >
          Play again
        </button>
        <button
          onClick={onClose}
          style={{ padding: '8px 20px', borderRadius: 10, background: 'var(--bg-input)', color: 'var(--brand-text)', fontSize: 13, border: '1px solid var(--brand-border)', cursor: 'pointer' }}
        >
          Back to work
        </button>
      </div>
    </div>
  );
}

// ── Box Breathe ───────────────────────────────────────────────────────────────
const BREATH_PHASES = [
  { label: 'Inhale', seconds: 4, color: 'var(--status-blue)' },
  { label: 'Hold', seconds: 4, color: 'var(--status-purple)' },
  { label: 'Exhale', seconds: 4, color: 'var(--status-teal)' },
  { label: 'Hold', seconds: 4, color: 'var(--status-amber)' },
];
const TOTAL_BREATH = BREATH_PHASES.reduce((s, p) => s + p.seconds, 0); // 16s per cycle

function BoxBreathe({ onDone }: { onDone: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const ROUNDS = 2; // 2 full cycles = 32s

  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => {
      const e = (Date.now() - start) / 1000;
      setElapsed(e);
      if (e >= TOTAL_BREATH * ROUNDS) { clearInterval(t); setTimeout(onDone, 600); }
    }, 50);
    return () => clearInterval(t);
  }, [onDone]);

  const cycleElapsed = elapsed % TOTAL_BREATH;
  let acc = 0;
  let phaseIdx = 0;
  let phaseProgress = 0;
  for (let i = 0; i < BREATH_PHASES.length; i++) {
    const p = BREATH_PHASES[i];
    if (cycleElapsed < acc + p.seconds) {
      phaseIdx = i;
      phaseProgress = (cycleElapsed - acc) / p.seconds;
      break;
    }
    acc += p.seconds;
  }
  const phase = BREATH_PHASES[phaseIdx];
  const totalProgress = elapsed / (TOTAL_BREATH * ROUNDS);
  const circleScale = phase.label === 'Inhale' ? 0.6 + 0.4 * phaseProgress
    : phase.label === 'Exhale' ? 1 - 0.4 * phaseProgress : phaseIdx === 1 ? 1 : 0.6;

  return (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <div style={{ position: 'relative', width: 180, height: 180, margin: '0 auto 20px' }}>
        {/* Outer ring */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${phase.color}`, opacity: 0.2 }} />
        {/* Breathing circle */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `radial-gradient(circle, color-mix(in srgb, ${phase.color} 25%, transparent) 0%, transparent 70%)`,
          border: `2px solid ${phase.color}`,
          transform: `scale(${circleScale})`,
          transition: 'transform 0.3s ease, border-color 0.5s ease, background 0.5s ease',
          boxShadow: `0 0 30px color-mix(in srgb, ${phase.color} 30%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: phase.color }}>{phase.label}</div>
        </div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: phase.color, marginBottom: 4, letterSpacing: '-0.01em' }}>{phase.label}</div>
      <div style={{ fontSize: 13, color: 'var(--brand-textMuted)', marginBottom: 16 }}>
        {Math.ceil((1 - phaseProgress) * phase.seconds)}s remaining in this phase
      </div>
      {/* Progress */}
      <div style={{ height: 4, borderRadius: 999, background: 'var(--brand-borderSoft)', marginBottom: 8 }}>
        <div style={{ height: '100%', borderRadius: 999, background: phase.color, width: `${totalProgress * 100}%`, transition: 'width 0.1s linear' }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--brand-textMuted)' }}>
        {Math.ceil((TOTAL_BREATH * ROUNDS) - elapsed)}s left · Box breathing · 4-4-4-4
      </div>
    </div>
  );
}

// ── Fitness Trivia ────────────────────────────────────────────────────────────
function FitnessTrivia({ onDone }: { onDone: () => void }) {
  const [questions] = useState(() => pick3());
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);

  const q = questions[idx];

  function choose(i: number) {
    if (selected !== null) return;
    setSelected(i);
    if (i === q.a) setCorrect(c => c + 1);
    setTimeout(() => {
      if (idx < questions.length - 1) {
        setIdx(x => x + 1);
        setSelected(null);
      } else {
        setFinished(true);
        setTimeout(onDone, 2500);
      }
    }, 1000);
  }

  if (finished) {
    const emoji = correct === 3 ? '🏆' : correct === 2 ? '✅' : correct === 1 ? '😊' : '📚';
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{emoji}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-gold)' }}>{correct}/3 correct</div>
        <div style={{ fontSize: 13, color: 'var(--brand-textMuted)', marginTop: 6 }}>
          {correct === 3 ? 'Perfect score! You know your fitness!' : 'Keep learning — every day is a new chance!'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--brand-textMuted)', marginBottom: 12 }}>
        <span>Question {idx + 1} of {questions.length}</span>
        <span>{correct} correct so far</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, lineHeight: 1.4, color: 'var(--brand-text)' }}>{q.q}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.opts.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrect = selected !== null && i === q.a;
          const isWrong = isSelected && i !== q.a;
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: `1.5px solid ${isCorrect ? 'var(--status-green)' : isWrong ? 'var(--status-red)' : 'var(--brand-border)'}`,
                background: isCorrect ? 'rgba(74,222,128,0.12)' : isWrong ? 'rgba(239,68,68,0.10)' : 'var(--bg-input)',
                color: isCorrect ? 'var(--status-green)' : isWrong ? 'var(--status-red)' : 'var(--brand-text)',
                textAlign: 'left',
                fontSize: 13,
                fontWeight: isSelected ? 700 : 400,
                cursor: selected !== null ? 'default' : 'pointer',
                transition: 'all 200ms ease',
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Game picker ───────────────────────────────────────────────────────────────
function GamePicker({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--brand-textMuted)', marginBottom: 16, lineHeight: 1.5 }}>
        You've been quiet for a bit. Take a quick break — pick a game:
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {GAMES.map((g) => (
          <button
            key={g.id}
            onClick={() => onPick(g.id)}
            style={{
              padding: '12px 16px',
              borderRadius: 12,
              border: '1.5px solid var(--brand-border)',
              background: 'var(--bg-input)',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              transition: 'all 160ms ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--accent-gold) 6%, var(--bg-input))';
              (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--accent-gold) 35%, var(--brand-border))';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-input)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-border)';
            }}
          >
            <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{g.emoji}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-text)', marginBottom: 2 }}>{g.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--brand-textMuted)', lineHeight: 1.4 }}>{g.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Sound toggle ──────────────────────────────────────────────────────────────
function SoundToggle() {
  const [on, setOn] = useState(() => isSoundEnabled());
  function toggle() {
    const next = !on;
    setSoundEnabled(next);
    setOn(next);
  }
  return (
    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
      <button
        onClick={toggle}
        style={{ fontSize: 11, color: 'var(--brand-textMuted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        title={on ? 'Mute sounds' : 'Enable sounds'}
      >
        {on ? '🔊' : '🔇'} Sound {on ? 'on' : 'off'}
      </button>
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function GameModal({ onClose }: { onClose: () => void }) {
  const [screen, setScreen] = useState<'pick' | 'goldrush' | 'breathe' | 'trivia' | 'score'>('pick');
  const [finalScore, setFinalScore] = useState(0);
  const [hs, setHs] = useState(() => parseInt(localStorage.getItem(HS_KEY) || '0', 10));

  function pick(id: string) { setScreen(id as any); }

  function goldDone(score: number) {
    setFinalScore(score);
    if (score > hs) {
      localStorage.setItem(HS_KEY, String(score));
      setHs(score);
    }
    setScreen('score');
  }

  const titles: Record<string, string> = {
    pick: '🎮 Quick break',
    goldrush: '🪙 Gold Rush',
    breathe: '🌬️ Box Breathing',
    trivia: '🧠 Fitness Trivia',
    score: '🏁 Round done!',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(8,9,15,0.65)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'idleGameFadeIn 220ms ease-out both',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: '92%',
          maxWidth: 420,
          borderRadius: 20,
          background:
            'radial-gradient(500px 200px at 80% 0%, rgba(229,178,76,0.05), transparent 60%), var(--bg-card)',
          border: '1px solid var(--brand-border)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(229,178,76,0.08)',
          padding: '22px 24px 24px',
          animation: 'idleGamePopIn 300ms cubic-bezier(0.2,0.9,0.25,1) both',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>{titles[screen]}</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-textMuted)', padding: 4, borderRadius: 8, lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Content */}
        {screen === 'pick'     && <GamePicker onPick={pick} />}
        {screen === 'goldrush' && <GoldRush onDone={goldDone} />}
        {screen === 'breathe'  && <BoxBreathe onDone={onClose} />}
        {screen === 'trivia'   && <FitnessTrivia onDone={() => setTimeout(onClose, 2000)} />}
        {screen === 'score'    && (
          <ScoreScreen
            score={finalScore}
            hs={hs}
            onRetry={() => setScreen('goldrush')}
            onClose={onClose}
          />
        )}

        {/* Back link — only on game screens */}
        {screen !== 'pick' && screen !== 'score' && (
          <button
            onClick={() => setScreen('pick')}
            style={{ marginTop: 14, fontSize: 11, color: 'var(--brand-textMuted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            ← Choose different game
          </button>
        )}

        {/* Sound toggle — always visible in modal */}
        <SoundToggle />
      </div>

      <style>{`
        @keyframes idleGameFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes idleGamePopIn {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Idle toast ────────────────────────────────────────────────────────────────
function IdleToast({ onPlay, onDismiss }: { onPlay: () => void; onDismiss: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 8999,
        background: 'var(--bg-card)',
        border: '1px solid color-mix(in srgb, var(--accent-gold) 35%, var(--brand-border))',
        borderRadius: 14,
        padding: '12px 18px',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 16px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(229,178,76,0.08)',
        animation: 'idleToastIn 300ms cubic-bezier(0.18,0.89,0.32,1.28) both',
        maxWidth: '90vw',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <span style={{ fontSize: 22 }}>😴</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-text)' }}>Getting bored?</div>
        <div style={{ fontSize: 11.5, color: 'var(--brand-textMuted)' }}>Take a 30-second break</div>
      </div>
      <button
        onClick={onPlay}
        style={{ padding: '7px 14px', borderRadius: 9, background: 'var(--accent-gold)', color: '#0F1115', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        Play a game
      </button>
      <button
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-textMuted)', fontSize: 18, padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}
        title="Dismiss"
      >×</button>

      <style>{`
        @keyframes idleToastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(16px) scale(0.96); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1); }
        }
      `}</style>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────
export function IdleGame() {
  const [showToast, setShowToast] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showModalRef = useRef(false); // stable ref so resetTimer never needs showModal in deps

  // Keep ref in sync with state
  useEffect(() => { showModalRef.current = showModal; }, [showModal]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (showModalRef.current) return; // game open — don't interfere
    timerRef.current = setTimeout(() => {
      setShowToast(true);
    }, IDLE_MS);
  }, []); // stable — no deps needed now

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
    // User activity: clear toast (they're back) then restart timer
    const onActivity = () => {
      if (showModalRef.current) return;
      setShowToast(false);
      resetTimer();
    };
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    resetTimer(); // start on mount
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]); // resetTimer is stable so this runs once

  function openGame() {
    setShowToast(false);
    setShowModal(true);
  }

  function closeGame() {
    setShowModal(false);
    resetTimer();
  }

  function dismiss() {
    setShowToast(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    // Don't show again for 30 minutes
    timerRef.current = setTimeout(() => setShowToast(true), 30 * 60 * 1000);
  }

  return (
    <>
      {showToast && !showModal && <IdleToast onPlay={openGame} onDismiss={dismiss} />}
      {showModal && <GameModal onClose={closeGame} />}
    </>
  );
}
