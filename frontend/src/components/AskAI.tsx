/**
 * Ask AI — slide-in chat panel for the MITS Hub.
 *
 * Button lives in the topbar (sparkle icon). Click → panel slides in from
 * the right. User types a question, gets a 2-4 sentence answer from the
 * configured AI provider (Grok / Claude / GPT — backend picks whichever
 * env var is set).
 *
 * The conversation is in-memory only — closing the panel resets it. We
 * keep the last 10 turns and send them as history so the AI can answer
 * follow-ups. ~600 token answers + ~3000 token system prompt is plenty
 * for the helper use-case without burning a bunch of tokens.
 *
 * Hidden entirely when /api/ai/status reports no provider configured —
 * users don't see a dead button.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Sparkles, Send, X, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';

interface ChatTurn { role: 'user' | 'assistant'; content: string; }

/** True only when no input/textarea/contenteditable currently has focus.
 *  Stops "/" or Cmd+K from opening AI while the user is typing in a form. */
function noInputActive(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return true;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (el.isContentEditable) return false;
  return true;
}

export function AskAIButton() {
  const [open, setOpen] = useState(false);
  const user = useAuth((s) => s.user);

  // Only render the button if the backend reports a provider is configured.
  const { data: status } = useQuery({
    queryKey: ['ai/status'],
    queryFn: () => api.get('/ai/status').then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled: !!user,
  });

  // Global keyboard shortcuts — Cmd/Ctrl+K and "/" to open Ask AI.
  // Standard command-palette muscle memory; respects when the user is
  // already typing in a form so it doesn't hijack their input.
  useEffect(() => {
    if (!status?.enabled) return;
    function onKey(e: KeyboardEvent) {
      if (open) return;
      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      const isSlash = e.key === '/' && noInputActive();
      if (isCmdK || isSlash) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, status?.enabled]);

  if (!user || !status?.enabled) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded transition-all hover:bg-bg-cardHover relative group"
        title="Ask MITS AI  ·  ⌘K or /"
        aria-label="Ask AI"
      >
        <Sparkles size={18} style={{ color: 'var(--accent-gold)' }} />
        {/* Subtle pulse on the icon — feels alive */}
        <span
          aria-hidden
          className="absolute inset-0 rounded pointer-events-none"
          style={{
            boxShadow: '0 0 0 0 rgba(229,178,76,0.5)',
            animation: 'aiPulse 2.4s ease-in-out infinite',
          }}
        />
      </button>
      {open && <AskAIPanel onClose={() => setOpen(false)} />}
      <style>{`
        @keyframes aiPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(229,178,76,0.0); }
          50%      { box-shadow: 0 0 0 4px rgba(229,178,76,0.10); }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </>
  );
}

function AskAIPanel({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef  = useRef<HTMLTextAreaElement | null>(null);
  const user = useAuth((s) => s.user)!;

  const ask = useMutation({
    mutationFn: (question: string) =>
      api.post('/ai/ask', { message: question, history: turns.slice(-10) }).then((r) => r.data),
    onSuccess: (r, question) => {
      setTurns((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: r.answer }]);
      setInput('');
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        inputRef.current?.focus();
      });
    },
    onError: (e: any) => {
      setTurns((prev) => [...prev, { role: 'assistant', content: '⚠ ' + (e?.response?.data?.error || 'Request failed') }]);
    },
  });

  useEffect(() => {
    inputRef.current?.focus();
    // ESC closes the panel
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function submit() {
    const t = input.trim();
    if (!t || ask.isPending) return;
    ask.mutate(t);
  }

  const firstName = (user.name || '').split(' ')[0];
  const starters = [
    'How do I move a client to JBT-Paid?',
    'What does Roshni do in step 3 of the wizard?',
    'Where do I see today\'s sourcing requests?',
    'Draft a polite WhatsApp follow-up for an unpaid client.',
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(2px)', animation: 'fadeIn 200ms ease-out both' }}
      />
      {/* Panel */}
      <aside
        className="fixed top-0 right-0 h-screen z-50 flex flex-col"
        style={{
          width: 'min(440px, 100vw)',
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--brand-border)',
          boxShadow: '-12px 0 40px rgba(0,0,0,0.30)',
          animation: 'slideInRight 280ms cubic-bezier(0.2, 0.9, 0.25, 1) both',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--brand-border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, var(--accent-gold) 0%, var(--accent-goldDeep) 100%)',
                boxShadow: '0 2px 8px rgba(229,178,76,0.30)',
              }}
            >
              <Sparkles size={16} color="#0F1115" />
            </div>
            <div className="leading-tight">
              <div className="text-[13px] font-semibold">Ask MITS</div>
              <div className="text-[10px] muted">Your in-app guide — Hub features, workflows, drafts.</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {turns.length > 0 && (
              <button
                onClick={() => setTurns([])}
                className="p-1.5 rounded hover:bg-bg-cardHover"
                title="Clear conversation"
              >
                <RotateCcw size={14} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded hover:bg-bg-cardHover" title="Close (Esc)">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Conversation */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {turns.length === 0 ? (
            <div className="space-y-3">
              <div className="text-[13px]" style={{ color: 'var(--brand-text)' }}>
                Hey {firstName} 👋 — ask me anything about how to use the Hub or draft a message.
              </div>
              <div className="text-[11px] muted">Try one of these:</div>
              <div className="grid gap-1.5">
                {starters.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask.mutate(s)}
                    disabled={ask.isPending}
                    className="text-left text-[12px] px-2.5 py-1.5 rounded border transition-colors"
                    style={{
                      background: 'var(--bg-input)',
                      borderColor: 'var(--brand-border)',
                      color: 'var(--brand-textSecondary)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className="max-w-[85%] px-3 py-2 rounded-xl text-[13px] leading-relaxed whitespace-pre-wrap"
                  style={
                    t.role === 'user'
                      ? { background: 'var(--accent-goldSoft)', border: '1px solid rgba(229,178,76,0.30)', color: 'var(--brand-text)' }
                      : { background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }
                  }
                >
                  {t.content}
                </div>
              </div>
            ))
          )}
          {ask.isPending && (
            <div className="flex justify-start">
              <div
                className="px-3 py-2 rounded-xl text-[13px] muted inline-flex items-center gap-1.5"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)' }}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-gold)', animation: 'aiPulse 1s ease-in-out infinite' }} />
                Thinking…
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="p-3" style={{ borderTop: '1px solid var(--brand-border)' }}>
          <div
            className="flex items-end gap-2 p-2 rounded-lg"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)' }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              placeholder="Ask anything…"
              className="flex-1 bg-transparent border-0 outline-none resize-none text-[13px] py-1"
              style={{ minHeight: 24, maxHeight: 120 }}
              disabled={ask.isPending}
            />
            <button
              type="button"
              onClick={submit}
              disabled={ask.isPending || !input.trim()}
              className="p-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              style={{
                background: 'linear-gradient(135deg, var(--accent-gold) 0%, var(--accent-goldDeep) 100%)',
                color: '#0F1115',
                boxShadow: input.trim() ? '0 1px 4px rgba(229,178,76,0.30)' : 'none',
              }}
              title="Send (Enter)"
            >
              <Send size={14} />
            </button>
          </div>
          <div className="text-[10px] muted mt-1.5 px-1 flex items-center justify-between flex-wrap gap-1">
            <span>Enter to send · Shift+Enter for new line · Esc to close</span>
            <span className="flex items-center gap-1">
              <Kbd>⌘K</Kbd> or <Kbd>/</Kbd> to open
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-mono font-semibold"
      style={{
        background: 'var(--bg-input)',
        border: '1px solid var(--brand-border)',
        color: 'var(--brand-textSecondary)',
        minWidth: 18,
        justifyContent: 'center',
      }}
    >
      {children}
    </kbd>
  );
}
