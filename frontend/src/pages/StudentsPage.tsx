import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { GraduationCap } from 'lucide-react';

type Student = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  emailVerified: boolean;
  active: boolean;
  createdAt: string;
  paidPurchaseCount: number;
};

export function StudentsPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<Student[]>({
    queryKey: ['students'],
    queryFn: () => api.get('/students').then((r) => r.data),
  });

  const filtered = (data || []).filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.phone?.includes(q);
  });

  return (
    <>
      <Topbar
        title="Students"
        subtitle={`${data?.length || 0} signed up from mitsedge.com`}
        actions={
          <input
            placeholder="Search name, email, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
            style={{ width: 220 }}
          />
        }
      />
      <Page>
        {isLoading && <div className="muted text-sm p-6">Loading…</div>}
        {!isLoading && filtered.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            tone="grey"
            title={search ? 'No students match' : 'No students yet'}
            description={
              search ? 'Try a different search.' : 'Students who sign up on mitsedge.com will appear here.'
            }
          />
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Courses</th>
                  <th>Status</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="clickable" style={{ opacity: s.active ? 1 : 0.55 }}>
                    <td style={{ fontWeight: 600 }}>
                      <Link to={`/students/${s.id}`}>{s.name}</Link>
                    </td>
                    <td className="text-[12px]">{s.email}</td>
                    <td className="mono text-[12px]">{s.phone || '—'}</td>
                    <td className="text-[12px]">{s.paidPurchaseCount || '—'}</td>
                    <td>
                      <span
                        style={{
                          background: 'var(--bg-input)',
                          borderRadius: 20,
                          padding: '2px 8px',
                          fontSize: 10,
                          fontWeight: 600,
                          color: s.emailVerified ? '#4ade80' : '#fbbf24',
                        }}
                      >
                        {s.emailVerified ? 'verified' : 'unverified'}
                      </span>
                    </td>
                    <td className="muted text-[11px]" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(s.createdAt).toLocaleDateString()}
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
