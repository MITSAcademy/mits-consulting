import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/store/auth';
import { ArrowLeft } from 'lucide-react';

type Purchase = {
  id: string;
  courseId: number;
  courseTitle: string;
  status: string;
  createdAt: string;
  paidAt?: string | null;
};

type Student = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  emailVerified: boolean;
  active: boolean;
  createdAt: string;
  purchases: Purchase[];
};

type PaymentRow = Purchase & {
  amount: number;
  currency: string;
  gateway: string;
  merchantTxnId: string;
  gatewayRef?: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  PAID: '#4ade80',
  PENDING: '#fbbf24',
  FAILED: '#f87171',
  CANCELLED: '#9ca3af',
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      style={{
        background: 'var(--bg-input)',
        borderRadius: 20,
        padding: '2px 8px',
        fontSize: 10,
        fontWeight: 600,
        color: STATUS_COLORS[status] || 'var(--brand-textMuted)',
      }}
    >
      {status.toLowerCase()}
    </span>
  );
}

/** Amounts are stored in minor units so no float ever touches money. */
function formatAmount(minorUnits: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minorUnits / 100);
}

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user)!;
  const isFounder = user.role === 'founder';

  const { data: s } = useQuery<Student>({
    queryKey: ['student', id],
    queryFn: () => api.get(`/students/${id}`).then((r) => r.data),
  });

  // Payments are founder-only on the server too; skipping the fetch keeps a
  // non-founder from even producing a 403 in their network log.
  const { data: payments } = useQuery<PaymentRow[]>({
    queryKey: ['student-payments', id],
    queryFn: () => api.get(`/students/${id}/payments`).then((r) => r.data),
    enabled: isFounder && !!id,
  });

  if (!s) return <Page><div className="card muted text-sm">Loading…</div></Page>;

  return (
    <>
      <Topbar
        title={s.name}
        subtitle={s.email}
        actions={
          <Button
            size="sm"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/students'))}
          >
            <ArrowLeft size={14} /> Back
          </Button>
        }
      />
      <Page>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="card">
            <div className="card-h">Profile</div>
            <div className="p-3 text-[13px] grid gap-2">
              <Row label="Email" value={s.email} />
              <Row label="Phone" value={s.phone || '—'} />
              <Row label="Email verified" value={s.emailVerified ? 'Yes' : 'No'} />
              <Row label="Account" value={s.active ? 'Active' : 'Inactive'} />
              <Row label="Joined" value={new Date(s.createdAt).toLocaleString()} />
            </div>
          </div>

          <div className="card">
            <div className="card-h">Courses</div>
            {s.purchases.length === 0 ? (
              <div className="p-3 muted text-[13px]">No courses purchased yet.</div>
            ) : (
              <div className="p-3 grid gap-2">
                {s.purchases.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 text-[13px]"
                    style={{ borderBottom: '1px solid var(--brand-borderSoft)', paddingBottom: 6 }}
                  >
                    <span style={{ fontWeight: 600 }}>{p.courseTitle}</span>
                    <StatusPill status={p.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {isFounder && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-h">Payments</div>
            {!payments || payments.length === 0 ? (
              <div className="p-3 muted text-[13px]">No payment records.</div>
            ) : (
              <div className="table-card" style={{ border: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Gateway</th>
                      <th>Transaction</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.courseTitle}</td>
                        <td className="mono">{formatAmount(p.amount, p.currency)}</td>
                        <td><StatusPill status={p.status} /></td>
                        <td className="text-[12px]">{p.gateway}</td>
                        <td className="mono text-[11px]">{p.gatewayRef || p.merchantTxnId}</td>
                        <td className="muted text-[11px]" style={{ whiteSpace: 'nowrap' }}>
                          {new Date(p.paidAt || p.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Page>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
