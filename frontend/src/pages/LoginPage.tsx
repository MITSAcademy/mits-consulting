import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { api } from '@/lib/api';
import { homePathFor } from '@/lib/utils';
import { timeGreeting } from '@/components/ThemeToggle';
import { Sparkles, ShieldCheck, BarChart3, Users2 } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000';

/**
 * Login page redesign — split layout.
 *
 *  Left (60%): dark brand panel with the MITS wordmark on a soft cream tile,
 *  time-of-day greeting, three quick value props ("This is what you get").
 *  Right (40%): clean white card with SSO button (or email/password fallback).
 *
 *  Subtle ambient gradients on both halves keep it feeling warm and
 *  intentional — first thing the team sees every morning, so polish matters.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const showToast = useUI((s) => s.showToast);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);

  useEffect(() => {
    api.get('/oauth/google/status')
      .then((r) => setSsoEnabled(!!r.data?.enabled))
      .catch(() => setSsoEnabled(false));
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) showToast(err, 'error');
  }, [showToast]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      let user;
      if (mode === 'login') {
        user = await login(email, password);
      } else {
        user = await register(name, email, password);
      }
      navigate(homePathFor(user?.role), { replace: true });
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  const { greeting, emoji } = timeGreeting();

  return (
    <div className="min-h-screen flex" style={{ background: '#0A0C12' }}>
      {/* ── Left: brand panel ────────────────────────────────────────────── */}
      <div
        className="hidden md:flex flex-col justify-between p-10 lg:p-14 relative overflow-hidden"
        style={{
          flex: '1 1 60%',
          background:
            'radial-gradient(900px 500px at 20% 0%, rgba(229,178,76,0.18), transparent 60%), ' +
            'radial-gradient(800px 600px at 80% 100%, rgba(91,141,239,0.10), transparent 60%), ' +
            'linear-gradient(180deg, #0A0C12 0%, #10131A 100%)',
          color: '#F0E8D6',
        }}
      >
        {/* Brand mark */}
        <div className="flex items-center gap-3" style={{ animation: 'fadeUp 400ms ease-out 60ms both' }}>
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #FAF5E7 0%, #E8DEC2 100%)',
              boxShadow: '0 4px 20px rgba(229,178,76,0.25), inset 0 1px 0 rgba(255,255,255,0.50)',
              color: '#0F1115',
            }}
          >
            <img src="/mits-logo.svg" alt="MITS" className="w-10 h-10" />
          </div>
          <div className="leading-tight">
            <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'rgba(229,178,76,0.85)' }}>
              by MITS
            </div>
            <div className="text-[18px] font-bold tracking-tight">Consulting Hub</div>
          </div>
        </div>

        {/* Hero copy + greeting */}
        <div style={{ animation: 'fadeUp 500ms ease-out 180ms both' }}>
          <div className="text-[13px] muted flex items-center gap-2 mb-2">
            <span aria-hidden>{emoji}</span>
            <span>{greeting} — welcome back.</span>
          </div>
          <h1
            className="text-[42px] lg:text-[54px] font-extrabold tracking-tight leading-[1.05] mb-4"
            style={{ color: '#FAF5E7', letterSpacing: '-0.025em' }}
          >
            Run the entire client lifecycle <span className="text-gold-grad">in one place.</span>
          </h1>
          <p className="text-[14px] max-w-[460px]" style={{ color: 'rgba(240,232,214,0.65)' }}>
            From the first lead, through demos, sourcing, sales close, and renewals —
            everything the MITS team needs to move clients forward, together.
          </p>
        </div>

        {/* Value chips */}
        <div className="grid grid-cols-3 gap-3" style={{ animation: 'fadeUp 600ms ease-out 300ms both' }}>
          {[
            { Icon: Users2,     label: 'Pipeline',  sub: 'Lead → Active' },
            { Icon: BarChart3,  label: 'Insights',  sub: 'Money flow live' },
            { Icon: Sparkles,   label: 'AI helper', sub: 'Ask anything' },
          ].map(({ Icon, label, sub }) => (
            <div
              key={label}
              className="rounded-xl p-3"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <Icon size={18} style={{ color: 'var(--accent-gold)' }} />
              <div className="text-[12px] font-semibold mt-1.5" style={{ color: '#F0E8D6' }}>{label}</div>
              <div className="text-[10px]" style={{ color: 'rgba(240,232,214,0.50)' }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: auth card ─────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-center p-6 md:p-10"
        style={{
          flex: '1 1 40%',
          background:
            'radial-gradient(700px 400px at 50% 0%, rgba(229,178,76,0.04), transparent 60%), ' +
            'var(--bg-page)',
        }}
      >
        <div
          className="w-full max-w-sm"
          style={{ animation: 'fadeUp 450ms ease-out 220ms both' }}
        >
          {/* Mobile-only brand line (md:hidden) */}
          <div className="md:hidden flex items-center gap-2.5 mb-6">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #FAF5E7 0%, #E8DEC2 100%)',
                color: '#0F1115',
              }}
            >
              <img src="/mits-logo.svg" alt="MITS" className="w-7 h-7" />
            </div>
            <div className="leading-tight">
              <div className="text-[10px] uppercase tracking-[0.14em] muted">by MITS</div>
              <div className="text-[15px] font-bold">Consulting Hub</div>
            </div>
          </div>

          <h2 className="text-[24px] font-bold tracking-tight mb-1">
            {mode === 'login' ? 'Sign in' : 'Create your account'}
          </h2>
          <p className="text-[13px] muted mb-6">
            {mode === 'login'
              ? 'Use your @mitssolution.com Google account.'
              : 'Use your work email — we\'ll send a confirmation.'}
          </p>

          {ssoEnabled ? (
            <div className="space-y-3">
              <a
                href={`${API_BASE}/api/oauth/google/start`}
                className="flex items-center justify-center gap-2.5 w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: '#FFFFFF',
                  color: '#1A1B1E',
                  border: '1px solid var(--brand-border)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F9F9F9'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.10)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.transform = 'translateY(0)';   e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'; }}
              >
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                  <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                  <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                  <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
                </svg>
                Sign in with Google
              </a>
              <div className="text-[11px] muted flex items-center justify-center gap-1.5">
                <ShieldCheck size={11} />
                <span>Restricted to <code className="text-[10px]">@mitssolution.com</code> accounts</span>
              </div>
            </div>
          ) : (
            <>
              <form onSubmit={submit} className="space-y-3">
                {mode === 'register' && (
                  <div className="form-row">
                    <Label>Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
                  </div>
                )}
                <div className="form-row">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={mode === 'login'} />
                </div>
                <div className="form-row">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" variant="primary" className="w-full justify-center" disabled={loading}>
                  {loading ? 'Signing in…' : mode === 'login' ? 'Sign in' : 'Create account'}
                </Button>
              </form>

              <div className="mt-5 text-center text-xs muted">
                {mode === 'login' ? (
                  <>
                    No account yet?{' '}
                    <button onClick={() => setMode('register')} className="font-semibold" style={{ color: 'var(--accent-gold)' }}>
                      Register
                    </button>
                  </>
                ) : (
                  <>
                    Have an account?{' '}
                    <button onClick={() => setMode('login')} className="font-semibold" style={{ color: 'var(--accent-gold)' }}>
                      Sign in
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          <div className="mt-8 text-[10px] muted text-center">
            © {new Date().getFullYear()} MITS Consulting · All rights reserved
          </div>
        </div>
      </div>
    </div>
  );
}
