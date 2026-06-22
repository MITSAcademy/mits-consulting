import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { api } from '@/lib/api';

type MonthlyReport = {
  month: string;
  summary: {
    totalSessions: number;
    totalSessionHours: number;
    totalPaymentsReceived: number;
    totalTrainersPaid: number;
    activeClients: number;
    newClients: number;
    lostClients: number;
  };
  byCoordinator: { name: string; sessions: number; clients: number }[];
  topTrainers: { name: string; sessions: number; amountInr: number }[];
  recentPayments: {
    id: string;
    clientName: string;
    amount: number;
    currency: string;
    paymentDate: string;
  }[];
};

function monthLabel(m: string): string {
  const [y, mo] = m.split('-');
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function prevMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthStr(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}
    >
      <div className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--brand-textMuted)' }}>
        {label}
      </div>
      <div className="text-2xl font-bold" style={{ color: 'var(--brand-text)' }}>
        {value}
      </div>
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString('en-IN');
}

export function MonthlyReportPage() {
  const [month, setMonth] = useState(currentMonthStr());

  const { data, isLoading, error } = useQuery<MonthlyReport>({
    queryKey: ['monthly-report', month],
    queryFn: () => api.get(`/reports/monthly?month=${month}`).then((r) => r.data),
  });

  return (
    <>
      <Topbar
        title="Monthly Report"
        subtitle={monthLabel(month)}
        actions={
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
            style={{
              background: 'var(--bg-cardHover)',
              border: '1px solid var(--brand-border)',
              color: 'var(--brand-textSecondary)',
            }}
          >
            <Printer size={13} />
            Print
          </button>
        }
      />
      <Page>
        {/* Month picker */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setMonth(prevMonth(month))}
            className="p-1.5 rounded-lg transition-colors hover:bg-bg-cardHover"
            style={{ border: '1px solid var(--brand-borderSoft)' }}
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-base font-semibold min-w-[160px] text-center">{monthLabel(month)}</span>
          <button
            onClick={() => setMonth(nextMonth(month))}
            className="p-1.5 rounded-lg transition-colors hover:bg-bg-cardHover"
            style={{ border: '1px solid var(--brand-borderSoft)' }}
            aria-label="Next month"
            disabled={month >= currentMonthStr()}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {isLoading && (
          <div className="text-center py-16" style={{ color: 'var(--brand-textMuted)' }}>
            Loading…
          </div>
        )}

        {error && (
          <div className="text-center py-16" style={{ color: 'var(--status-red)' }}>
            Failed to load report.
          </div>
        )}

        {data && (
          <div className="space-y-8">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <SummaryCard label="Sessions" value={fmt(data.summary.totalSessions)} />
              <SummaryCard label="Hours" value={fmt(data.summary.totalSessionHours)} />
              <SummaryCard label="Payments Received" value={`₹${fmt(data.summary.totalPaymentsReceived)}`} />
              <SummaryCard label="Trainers Paid" value={`₹${fmt(data.summary.totalTrainersPaid)}`} />
              <SummaryCard label="Active Clients" value={fmt(data.summary.activeClients)} />
              <SummaryCard label="New Clients" value={fmt(data.summary.newClients)} />
              <SummaryCard label="Lost Clients" value={fmt(data.summary.lostClients)} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* By Coordinator */}
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--brand-border)' }}
              >
                <div
                  className="px-4 py-3 font-semibold text-[13px]"
                  style={{ background: 'var(--bg-cardHover)', borderBottom: '1px solid var(--brand-border)' }}
                >
                  By Coordinator
                </div>
                {data.byCoordinator.length === 0 ? (
                  <div className="px-4 py-6 text-[12px]" style={{ color: 'var(--brand-textMuted)' }}>
                    No data for this month.
                  </div>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
                        <th className="px-4 py-2 text-left font-medium" style={{ color: 'var(--brand-textMuted)' }}>Name</th>
                        <th className="px-4 py-2 text-right font-medium" style={{ color: 'var(--brand-textMuted)' }}>Sessions</th>
                        <th className="px-4 py-2 text-right font-medium" style={{ color: 'var(--brand-textMuted)' }}>Clients</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byCoordinator.map((row, i) => (
                        <tr
                          key={i}
                          style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}
                        >
                          <td className="px-4 py-2.5">{row.name}</td>
                          <td className="px-4 py-2.5 text-right">{row.sessions}</td>
                          <td className="px-4 py-2.5 text-right">{row.clients}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Top Trainers */}
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--brand-border)' }}
              >
                <div
                  className="px-4 py-3 font-semibold text-[13px]"
                  style={{ background: 'var(--bg-cardHover)', borderBottom: '1px solid var(--brand-border)' }}
                >
                  Top Trainers
                </div>
                {data.topTrainers.length === 0 ? (
                  <div className="px-4 py-6 text-[12px]" style={{ color: 'var(--brand-textMuted)' }}>
                    No data for this month.
                  </div>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
                        <th className="px-4 py-2 text-left font-medium" style={{ color: 'var(--brand-textMuted)' }}>Name</th>
                        <th className="px-4 py-2 text-right font-medium" style={{ color: 'var(--brand-textMuted)' }}>Sessions</th>
                        <th className="px-4 py-2 text-right font-medium" style={{ color: 'var(--brand-textMuted)' }}>Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topTrainers.map((row, i) => (
                        <tr
                          key={i}
                          style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}
                        >
                          <td className="px-4 py-2.5">{row.name}</td>
                          <td className="px-4 py-2.5 text-right">{row.sessions}</td>
                          <td className="px-4 py-2.5 text-right">{fmt(row.amountInr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Recent Payments */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--brand-border)' }}
            >
              <div
                className="px-4 py-3 font-semibold text-[13px]"
                style={{ background: 'var(--bg-cardHover)', borderBottom: '1px solid var(--brand-border)' }}
              >
                Recent Payments
              </div>
              {data.recentPayments.length === 0 ? (
                <div className="px-4 py-6 text-[12px]" style={{ color: 'var(--brand-textMuted)' }}>
                  No payments recorded for this month.
                </div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
                      <th className="px-4 py-2 text-left font-medium" style={{ color: 'var(--brand-textMuted)' }}>Client</th>
                      <th className="px-4 py-2 text-right font-medium" style={{ color: 'var(--brand-textMuted)' }}>Amount</th>
                      <th className="px-4 py-2 text-right font-medium" style={{ color: 'var(--brand-textMuted)' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentPayments.map((p) => (
                      <tr
                        key={p.id}
                        style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}
                      >
                        <td className="px-4 py-2.5">{p.clientName}</td>
                        <td className="px-4 py-2.5 text-right">
                          {p.currency} {fmt(p.amount)}
                        </td>
                        <td className="px-4 py-2.5 text-right">{p.paymentDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </Page>
    </>
  );
}
