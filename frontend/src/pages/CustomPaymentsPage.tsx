import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Topbar, Page } from '@/components/layout/AppLayout';

type PayLink = {
  id: string;
  url: string;
  amount: number; // minor units
  currency: string;
  purpose: string;
  clientName?: string | null;
  active: boolean;
  expiresAt?: string | null;
  createdByName: string;
  createdAt: string;
  paid: boolean;
};

type CustomPayment = {
  id: string;
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  purpose: string;
  amount: number; // minor units
  currency: string;
  status: string;
  merchantTxnId: string;
  gatewayRef?: string | null;
  linkId?: string | null;
  paidAt?: string | null;
  createdAt: string;
};

const money = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(2)}`;
const OPEN_PAGE_URL = 'https://mitsedge.com/pay';

function pill(text: string, color: string) {
  return (
    <span
      style={{ background: 'var(--bg-input)', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 600, color }}
    >
      {text}
    </span>
  );
}

/**
 * Custom-amount payments from mitsedge.com/pay.
 *
 * These are money received for a stated purpose. They never enroll anyone in a
 * course, so a client paying here still has to be enrolled by the team.
 */
export function CustomPaymentsPage() {
  const user = useAuth((s) => s.user)!;
  const isFounder = user.role === 'founder';
  const qc = useQueryClient();

  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [clientName, setClientName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const links = useQuery<PayLink[]>({
    queryKey: ['custom-payment-links'],
    queryFn: () => api.get('/custom-payments/links').then((r) => r.data),
  });
  const payments = useQuery<CustomPayment[]>({
    queryKey: ['custom-payments'],
    queryFn: () => api.get('/custom-payments').then((r) => r.data),
    enabled: isFounder, // amounts received are founder-only
  });

  const create = useMutation({
    mutationFn: () =>
      api
        .post('/custom-payments/links', { amount, purpose, clientName: clientName || undefined })
        .then((r) => r.data as PayLink),
    onSuccess: (link) => {
      setAmount('');
      setPurpose('');
      setClientName('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['custom-payment-links'] });
      copy(link.url);
    },
    onError: (e: any) => setError(e?.response?.data?.error || 'Could not create the link.'),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.post(`/custom-payments/links/${id}/deactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-payment-links'] }),
  });

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(text);
        window.setTimeout(() => setCopied((c) => (c === text ? null : c)), 2500);
      },
      () => setCopied(null),
    );
  }

  return (
    <>
      <Topbar title="Custom payments" subtitle="Payment links for mitsedge.com/pay" />
      <Page>
        <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Create a fixed-amount link</div>
          <div className="muted text-[12px]" style={{ marginBottom: 12 }}>
            The client cannot change the amount, and the link can be paid once. A payment here does not enroll anyone
            in a course: enroll the client yourself once the payment arrives.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="input"
              style={{ width: 130 }}
              placeholder="Amount in USD"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <input
              className="input"
              style={{ flex: 1, minWidth: 220 }}
              placeholder="What is it for? e.g. R Programming, 22-day training"
              maxLength={200}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
            <input
              className="input"
              style={{ width: 190 }}
              placeholder="Client name (optional)"
              maxLength={120}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
            <button
              className="btn btn-sm btn-primary"
              disabled={create.isPending || !amount.trim() || purpose.trim().length < 3}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'Creating…' : 'Create and copy link'}
            </button>
          </div>
          {error && <div style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>{error}</div>}
          <div className="muted text-[12px]" style={{ marginTop: 12 }}>
            Open page, where the client types the amount (minimum $5):{' '}
            <span className="mono">{OPEN_PAGE_URL}</span>{' '}
            <button className="btn btn-sm" onClick={() => copy(OPEN_PAGE_URL)}>
              {copied === OPEN_PAGE_URL ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="table-card" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Link for</th>
                <th>Client</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {links.isLoading && (
                <tr>
                  <td colSpan={6} className="muted text-sm">Loading…</td>
                </tr>
              )}
              {!links.isLoading && (links.data || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="muted text-sm">No links yet.</td>
                </tr>
              )}
              {(links.data || []).map((l) => (
                <tr key={l.id} style={{ opacity: l.active ? 1 : 0.55 }}>
                  <td style={{ fontWeight: 600 }}>{l.purpose}</td>
                  <td className="text-[12px]">{l.clientName || '—'}</td>
                  <td className="mono text-[12px]">{money(l.amount, l.currency)}</td>
                  <td>
                    {l.paid ? pill('paid', '#4ade80') : l.active ? pill('waiting', '#fbbf24') : pill('off', '#9ca3af')}
                  </td>
                  <td className="muted text-[11px]" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(l.createdAt).toLocaleDateString()} · {l.createdByName}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {l.active && !l.paid && (
                      <>
                        <button className="btn btn-sm" onClick={() => copy(l.url)}>
                          {copied === l.url ? 'Copied' : 'Copy link'}
                        </button>{' '}
                        <button
                          className="btn btn-sm"
                          disabled={deactivate.isPending}
                          onClick={() => deactivate.mutate(l.id)}
                        >
                          Turn off
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isFounder && (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Payer</th>
                  <th>For</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Reference</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.isLoading && (
                  <tr>
                    <td colSpan={6} className="muted text-sm">Loading…</td>
                  </tr>
                )}
                {!payments.isLoading && (payments.data || []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted text-sm">No custom payments yet.</td>
                  </tr>
                )}
                {(payments.data || []).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.payerName}</div>
                      <div className="muted text-[11px]">
                        {p.payerEmail} · {p.payerPhone}
                      </div>
                    </td>
                    <td className="text-[12px]">
                      {p.purpose}
                      {p.linkId ? '' : ' (amount typed by payer)'}
                    </td>
                    <td className="mono text-[12px]">{money(p.amount, p.currency)}</td>
                    <td>
                      {pill(
                        p.status.toLowerCase(),
                        p.status === 'PAID' ? '#4ade80' : p.status === 'FAILED' ? '#f87171' : '#fbbf24',
                      )}
                    </td>
                    <td className="mono text-[11px]">{p.gatewayRef || p.merchantTxnId}</td>
                    <td className="muted text-[11px]" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(p.paidAt || p.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Page>
    </>
  );
}
