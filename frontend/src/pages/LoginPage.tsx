import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { api } from '@/lib/api';
import { homePathFor } from '@/lib/utils';

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000';

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

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <div className="bg-bg-card border border-brand-border rounded-2xl p-7 w-full max-w-md">
        <img src="/mits-logo.svg" alt="MITS" className="w-14 h-14 rounded-lg mb-4" />
        <h1 className="text-[22px] font-bold mb-1">MITS Consulting Hub</h1>
        <p className="text-brand-textSecondary mb-5">
          {mode === 'login' ? 'Sign in to continue' : 'Create an account'}
        </p>

        {ssoEnabled && (
          <>
            <a
              href={`${API_BASE}/api/oauth/google/start`}
              className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded border border-brand-border bg-white text-[#1A1B1E] text-sm font-medium hover:bg-[#f5f5f5] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
              Sign in with Google
            </a>
            <div className="text-[11px] muted mt-1.5 text-center">
              Restricted to <code>@mitssolution.com</code> accounts
            </div>
            <div className="flex items-center gap-2 my-4">
              <div className="flex-1 h-px bg-brand-border"/>
              <span className="text-[10px] uppercase tracking-wider muted">or</span>
              <div className="flex-1 h-px bg-brand-border"/>
            </div>
          </>
        )}

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <div className="form-row">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div className="form-row">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
            {loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className="mt-4 text-center text-xs text-brand-textMuted">
          {mode === 'login' ? (
            <>
              No account?{' '}
              <button onClick={() => setMode('register')} className="text-brand-blue underline">
                Register
              </button>
            </>
          ) : (
            <>
              Have an account?{' '}
              <button onClick={() => setMode('login')} className="text-brand-blue underline">
                Sign in
              </button>
            </>
          )}
        </div>

        <div className="mt-6 p-3 rounded bg-bg-input text-xs text-brand-textMuted">
          <strong className="text-brand-text">Seeded users</strong>
          <br />
          email: <code>vaibhav@mits.local</code> (or samita, anjali, taran, aman, kanchan, roshni, mitali, areena, malika…)
          <br />
          password: <code>password123</code>
        </div>
      </div>
    </div>
  );
}
