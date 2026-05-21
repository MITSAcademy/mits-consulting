import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';
import { Mail, MessageCircle, Send } from 'lucide-react';

interface Props {
  /** what we're sending to */
  recipient: {
    name?: string;
    email?: string;
    phone?: string;        // E.164-ish or +91 format
  };
  /** to log against — either client OR trainer */
  clientId?: string;
  trainerId?: string;
  /** filter template suggestions to this stage */
  stage?: string;
  /** initial channel */
  defaultKind?: 'Email' | 'WhatsApp';
  onClose: () => void;
}

export function SendMessageModal({ recipient, clientId, trainerId, stage, defaultKind, onClose }: Props) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  const [kind, setKind] = useState<'Email' | 'WhatsApp'>(
    defaultKind || (recipient.email ? 'Email' : 'WhatsApp'),
  );
  const [templateId, setTemplateId] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get('/templates').then((r) => r.data),
  });

  const { data: health } = useQuery({
    queryKey: ['messages/health'],
    queryFn: () => api.get('/messages/health').then((r) => r.data),
  });

  const suggestions = useMemo(() => {
    return (templates || []).filter((t: any) => {
      if (t.kind !== kind) return false;
      if (!stage) return true;
      return !t.stage || t.stage === stage;
    });
  }, [templates, kind, stage]);

  // When the user picks a template, fill subject + body (rendered server-side at send-time)
  function pickTemplate(id: string) {
    setTemplateId(id);
    const tpl = (templates || []).find((t: any) => t.id === id);
    if (tpl) {
      setSubject(tpl.subject || tpl.name);
      setBody(tpl.body);
    }
  }

  const sendEmail = useMutation({
    mutationFn: () =>
      api.post('/messages/email', {
        to: recipient.email,
        subject, body,
        templateId: templateId || undefined,
        clientId, trainerId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      showToast('Email sent');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Email failed', 'error'),
  });

  const sendWA = useMutation({
    mutationFn: () =>
      api.post('/messages/whatsapp', {
        toPhone: recipient.phone,
        toName: recipient.name,
        body,
        templateId: templateId || undefined,
        clientId, trainerId,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      if (r.data.url) {
        // Copy + open WhatsApp deep link (free path)
        if (body) navigator.clipboard?.writeText(body).catch(() => {});
        window.open(r.data.url, '_blank');
      }
      showToast('WhatsApp opened + message copied · logged in history');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const canSend =
    kind === 'Email'
      ? !!(recipient.email && subject && body && health?.email?.configured)
      : !!(recipient.phone && body);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Send ${kind} to ${recipient.name || (kind === 'Email' ? recipient.email : recipient.phone) || '—'}`}
        description={
          kind === 'Email'
            ? health?.email?.configured
              ? 'Email sent via SMTP. Logged in message history.'
              : '⚠️ SMTP not configured — set SMTP_* env vars to enable real email sending.'
            : 'Opens WhatsApp with message pre-loaded. Free-path: you click Send in WhatsApp; we log the intent here.'
        }
        className="max-w-2xl"
      >
        {/* Channel switch */}
        <div className="flex gap-1.5 mb-3">
          <Button
            size="sm"
            variant={kind === 'Email' ? 'primary' : 'default'}
            disabled={!recipient.email}
            onClick={() => setKind('Email')}
            title={!recipient.email ? 'No email on file' : ''}
          >
            <Mail size={12}/> Email {!recipient.email && '(no email)'}
          </Button>
          <Button
            size="sm"
            variant={kind === 'WhatsApp' ? 'primary' : 'default'}
            disabled={!recipient.phone}
            onClick={() => setKind('WhatsApp')}
            title={!recipient.phone ? 'No phone on file' : ''}
          >
            <MessageCircle size={12}/> WhatsApp {!recipient.phone && '(no phone)'}
          </Button>
          <span className="ml-auto text-[11px] muted self-center">
            {kind === 'Email'
              ? (health?.email?.configured ? <Pill color="green">SMTP ready</Pill> : <Pill color="red">SMTP off</Pill>)
              : <Pill color="green">wa.me ready</Pill>}
          </span>
        </div>

        {/* Recipient line */}
        <div className="bg-bg-input rounded p-2 text-xs mb-3">
          <span className="muted">To:</span>{' '}
          <strong>{recipient.name || '—'}</strong>{' '}
          <span className="mono ml-2">{kind === 'Email' ? recipient.email : recipient.phone}</span>
        </div>

        {/* Template picker */}
        <div className="form-row">
          <Label>Template <span className="muted normal-case ml-1">(pre-fills subject + body with client/trainer variables on send)</span></Label>
          <Select value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
            <option value="">— free-form (no template) —</option>
            {suggestions.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name} ({t.stage || 'any stage'})</option>
            ))}
          </Select>
        </div>

        {kind === 'Email' && (
          <div className="form-row">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. MITS Demo confirmed — {{demo_date}}" />
          </div>
        )}

        <div className="form-row">
          <Label>Body <span className="muted normal-case ml-1">{`{{client_name}}`} / {`{{trainer_name}}`} / {`{{demo_date}}`} / etc. — rendered on send</span></Label>
          <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} placeholder={
            kind === 'Email'
              ? 'Type your email or pick a template above.'
              : 'Type the WhatsApp message. Variables auto-render on send.'
          } />
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          {kind === 'Email' ? (
            <Button variant="primary" disabled={!canSend || sendEmail.isPending} onClick={() => sendEmail.mutate()}>
              <Send size={14}/> Send email
            </Button>
          ) : (
            <Button variant="primary" disabled={!canSend || sendWA.isPending} onClick={() => sendWA.mutate()}
              style={{ background: '#25D366', color: 'white', borderColor: '#25D366' }}>
              <MessageCircle size={14}/> Open WhatsApp & log
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------- Messages history card (drop-in for ClientDetail / TrainerDetail) ---------

export function MessagesHistoryCard({ clientId, trainerId }: { clientId?: string; trainerId?: string }) {
  const { data } = useQuery({
    queryKey: ['messages', { clientId, trainerId }],
    queryFn: () =>
      api.get('/messages', { params: { clientId, trainerId } }).then((r) => r.data),
    enabled: !!(clientId || trainerId),
  });

  return (
    <div className="card">
      <div className="card-h">
        <span>Messages history</span>
        <span className="muted normal-case text-xs">{data?.length || 0}</span>
      </div>
      {!data?.length ? (
        <div className="muted text-sm">No emails or WhatsApp messages sent yet.</div>
      ) : (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {data.map((m: any) => (
            <div key={m.id} className="bg-bg-input rounded p-2 text-xs">
              <div className="flex justify-between items-center mb-0.5">
                <span className="flex items-center gap-1.5">
                  {m.kind === 'Email' ? <Mail size={12}/> : <MessageCircle size={12} style={{ color: '#25D366' }}/>}
                  <strong>{m.kind}</strong>
                  <Pill color={m.status === 'Sent' ? 'green' : m.status === 'Failed' ? 'red' : m.status === 'Logged' ? 'blue' : 'grey'}>
                    {m.status}
                  </Pill>
                </span>
                <span className="mono muted text-[11px]">{new Date(m.sentAt).toLocaleString()}</span>
              </div>
              <div className="muted">
                To: <span className="mono">{m.toEmail || m.toPhone || '—'}</span> · by {m.sentBy?.name || '—'}
              </div>
              {m.subject && <div className="mt-0.5"><strong>Subject:</strong> {m.subject}</div>}
              <details className="mt-1">
                <summary className="cursor-pointer text-[11px] muted">view body</summary>
                <pre className="whitespace-pre-wrap text-[11px] mt-1 muted">{m.body}</pre>
              </details>
              {m.errorText && <div className="text-brand-red mt-0.5"><strong>Error:</strong> {m.errorText}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
