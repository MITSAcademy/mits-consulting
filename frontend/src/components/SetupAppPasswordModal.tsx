import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

// Roles that send emails and must have an app password configured
const EMAIL_ROLES = ['founder', 'manager', 'demo_lead', 'demo_intake', 'account_manager', 'lead', 'sales_closer'];

/**
 * Pops up automatically when:
 *  1. An API call returns code === 'MISSING_APP_PASSWORD' (reactive), OR
 *  2. On first load, the user's role requires email and no app password is set (proactive).
 *
 * Mounted once at AppLayout level.
 */
export function SetupAppPasswordModal() {
  const user = useAuth((s) => s.user);
  const showToast = useUI((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [gmail, setGmail] = useState('');
  const [appPassword, setAppPassword] = useState('');

  // Reactive: fired by API interceptor when a send fails
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('mits:missing-app-password', handler);
    return () => window.removeEventListener('mits:missing-app-password', handler);
  }, []);

  // Proactive: check on login whether app password is already set
  useEffect(() => {
    if (!user || dismissed) return;
    if (!EMAIL_ROLES.includes((user as any).role)) return;
    api.get('/users/me/smtp').then((r) => {
      if (!r.data.hasPassword) setOpen(true);
    }).catch(() => {}); // non-fatal — don't block the app
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && user && !gmail) {
      // Prefill with the user's known Workspace address — they shouldn't have to type it.
      setGmail((user as any).gmailAddress || (user as any).email || '');
    }
  }, [open, user, gmail]);

  const save = useMutation({
    mutationFn: () => api.post('/users/me/smtp', {
      gmailAddress: gmail.trim(),
      appPassword: appPassword.replace(/\s+/g, ''),
    }),
    onSuccess: () => {
      showToast('App Password saved ✓ — email is now enabled for your account');
      setOpen(false);
      setDismissed(true);
      setAppPassword('');
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Save failed', 'error'),
  });

  const cleaned = appPassword.replace(/\s+/g, '');
  const validLength = cleaned.length === 16;

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && setOpen(false)}>
      <DialogContent
        title="⚠ Gmail App Password required"
        description="Email features (demo invites, session invites, receipts) won't work until you connect your Gmail. Takes 2 minutes — set it up now so nothing breaks."
        className="max-w-lg"
      >
        <div className="text-xs muted mb-3">
          <strong>How to generate one (one-time, 2 minutes):</strong>
          <ol className="list-decimal pl-5 mt-1 space-y-0.5">
            <li>Open <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-brand-blue underline">myaccount.google.com/apppasswords</a></li>
            <li>App name: <code>MITS Hub</code> · click <strong>Create</strong></li>
            <li>Copy the 16-character password Google shows you</li>
            <li>Paste it below and click Save</li>
          </ol>
          <div className="mt-2">Requires 2-Step Verification enabled on your Google account.</div>
        </div>
        <div className="form-row">
          <Label>Your Gmail address</Label>
          <Input value={gmail} onChange={(e) => setGmail(e.target.value)} placeholder="you@mitssolution.com" />
        </div>
        <div className="form-row">
          <Label>App Password (16 characters)</Label>
          <Input
            type="text"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            placeholder="abcd efgh ijkl mnop"
            className="mono"
            autoFocus
          />
          <div className="text-[10px] muted mt-1">
            {cleaned.length === 0 ? 'Paste exactly as Google shows it — spaces are fine, we strip them.'
              : validLength ? '✓ Looks like a valid App Password'
              : `${cleaned.length}/16 characters — need exactly 16`}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => { setOpen(false); setDismissed(true); }}>Remind me later</Button>
          <Button
            variant="primary"
            disabled={save.isPending}
            disabledReason={!gmail.trim() ? 'Enter your Gmail address' : !validLength ? 'Paste a 16-character App Password' : null}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save & continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
