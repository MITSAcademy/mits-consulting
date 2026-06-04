import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

/**
 * Pops up automatically the first time an API call returns
 * code === 'MISSING_APP_PASSWORD' (see api.ts interceptor). Lets the signed-in
 * user paste their Gmail App Password without leaving the page so the email
 * they were trying to send can be retried immediately.
 *
 * Mounted once at AppLayout level — invisible until the global event fires.
 */
export function SetupAppPasswordModal() {
  const user = useAuth((s) => s.user);
  const showToast = useUI((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const [gmail, setGmail] = useState('');
  const [appPassword, setAppPassword] = useState('');

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('mits:missing-app-password', handler);
    return () => window.removeEventListener('mits:missing-app-password', handler);
  }, []);

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
      showToast('App Password saved — try the send again');
      setOpen(false);
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
        title="Set up your Gmail App Password"
        description="The system needs your own App Password to send email from your account. We will NOT send emails from anyone else's account."
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
          <Button onClick={() => setOpen(false)}>Cancel</Button>
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
