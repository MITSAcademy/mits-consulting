import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useUI } from '@/store/ui';

interface MatrixData {
  resources: { key: string; label: string }[];
  roles: string[];
  permissions: Record<string, Record<string, boolean>>;
  overrides: Record<string, Record<string, boolean>>;
}

const ROLE_DISPLAY: Record<string, string> = {
  founder: 'Founder',
  manager: 'Manager',
  lead: 'Lead',
  account_manager: 'Acct Mgr',
  demo_lead: 'Demo Lead',
  recruiter: 'Recruiter',
  sales_closer: 'Sales',
  accounts: 'Accounts',
  payment_processor: 'Payments',
};

const CATEGORY_ORDER = [
  { prefix: 'feedback', label: 'Feedback' },
  { prefix: 'tasks', label: 'Tasks' },
  { prefix: 'payments', label: 'Payments' },
  { prefix: 'sessions', label: 'Sessions' },
  { prefix: 'trainers', label: 'Trainers' },
  { prefix: 'users', label: 'Users' },
];

export function RolePermissionsPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [resetTarget, setResetTarget] = useState<{ resource: string } | null>(null);

  if (user?.role !== 'founder') return <Navigate to="/" replace />;

  const { data, isLoading } = useQuery<MatrixData>({
    queryKey: ['role-permissions-matrix'],
    queryFn: () => api.get('/role-permissions/matrix').then((r) => r.data),
  });

  const toggleMut = useMutation({
    mutationFn: (vars: { resource: string; role: string; allowed: boolean }) =>
      api.post('/role-permissions/toggle', vars),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['role-permissions-matrix'] });
      const prev = qc.getQueryData<MatrixData>(['role-permissions-matrix']);
      if (prev) {
        qc.setQueryData<MatrixData>(['role-permissions-matrix'], {
          ...prev,
          permissions: {
            ...prev.permissions,
            [vars.resource]: { ...prev.permissions[vars.resource], [vars.role]: vars.allowed },
          },
          overrides: {
            ...prev.overrides,
            [vars.resource]: { ...(prev.overrides[vars.resource] || {}), [vars.role]: vars.allowed },
          },
        });
      }
      return { prev };
    },
    onSuccess: (_data, vars) => {
      showToast(`Permission updated — ${vars.role}: ${vars.resource} ${vars.allowed ? 'enabled' : 'disabled'}`);
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['role-permissions-matrix'], ctx.prev);
      showToast('Failed to update permission', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['role-permissions-matrix'] }),
  });

  const resetRowMut = useMutation({
    mutationFn: (resource: string) =>
      Promise.all(
        (data?.roles || []).map((role) =>
          api.post('/role-permissions/reset', { resource, role }),
        ),
      ),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['role-permissions-matrix'] });
      setResetTarget(null);
    },
  });

  if (isLoading || !data) {
    return (
      <Page>
        <Topbar title="Role Permissions" />
        <div className="p-8 text-brand-textMuted">Loading…</div>
      </Page>
    );
  }

  const resourcesByCategory: Record<string, { key: string; label: string }[]> = {};
  for (const cat of CATEGORY_ORDER) {
    resourcesByCategory[cat.prefix] = data.resources.filter((r) =>
      r.key.startsWith(cat.prefix + '.'),
    );
  }

  return (
    <Page>
      <Topbar title="Role Permissions" />
      <div className="p-6 max-w-full">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-brand-text">Role Permissions</h1>
          <p className="text-sm text-brand-textMuted mt-1">
            Control which roles can access each feature. Changes take effect immediately — no redeploy needed.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                <th className="text-left px-4 py-3 font-semibold text-brand-textMuted text-xs uppercase tracking-wider w-52 border-b border-white/10">
                  Feature
                </th>
                {data.roles.map((role) => (
                  <th
                    key={role}
                    className="px-2 py-3 text-center font-semibold text-brand-textMuted text-xs uppercase tracking-wider border-b border-white/10 min-w-[72px]"
                  >
                    {ROLE_DISPLAY[role] || role}
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-semibold text-brand-textMuted text-xs uppercase tracking-wider border-b border-white/10 w-28">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {CATEGORY_ORDER.map((cat) => {
                const catResources = resourcesByCategory[cat.prefix] || [];
                if (catResources.length === 0) return null;
                return (
                  <>
                    <tr key={cat.prefix + '-header'} style={{ background: 'rgba(229,178,76,0.05)' }}>
                      <td
                        colSpan={data.roles.length + 2}
                        className="px-4 py-2 text-xs font-bold uppercase tracking-widest border-b border-white/10"
                        style={{ color: 'rgba(229,178,76,0.85)' }}
                      >
                        {cat.label}
                      </td>
                    </tr>
                    {catResources.map((resource) => {
                      const hasAnyOverride = Object.keys(data.overrides[resource.key] || {}).length > 0;
                      return (
                        <tr
                          key={resource.key}
                          className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-4 py-3 text-brand-text text-xs font-medium">
                            {resource.label}
                          </td>
                          {data.roles.map((role) => {
                            const allowed = data.permissions[resource.key]?.[role] ?? false;
                            const isOverridden = data.overrides[resource.key]?.[role] !== undefined;
                            const isFounder = role === 'founder';

                            return (
                              <td key={role} className="px-2 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {isFounder ? (
                                    <span
                                      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs"
                                      style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}
                                      title="Founder always has access"
                                    >
                                      ✓
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        toggleMut.mutate({ resource: resource.key, role, allowed: !allowed })
                                      }
                                      title={`${allowed ? 'Deny' : 'Allow'} ${role} access to ${resource.label}`}
                                      className="relative inline-flex items-center rounded-full transition-colors focus:outline-none"
                                      style={{
                                        width: 36,
                                        height: 20,
                                        background: allowed ? '#22c55e' : 'rgba(255,255,255,0.12)',
                                        transition: 'background 150ms ease',
                                      }}
                                    >
                                      <span
                                        style={{
                                          position: 'absolute',
                                          top: 2,
                                          left: allowed ? 18 : 2,
                                          width: 16,
                                          height: 16,
                                          borderRadius: '50%',
                                          background: 'white',
                                          transition: 'left 150ms ease',
                                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                        }}
                                      />
                                    </button>
                                  )}
                                  {isOverridden && !isFounder && (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{ background: 'rgba(229,178,76,0.85)' }}
                                      title="Overridden from default"
                                    />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 text-center">
                            {hasAnyOverride && (
                              <button
                                onClick={() => setResetTarget({ resource: resource.key })}
                                className="text-xs px-2 py-1 rounded-md transition-colors"
                                style={{
                                  color: 'rgba(229,178,76,0.85)',
                                  border: '1px solid rgba(229,178,76,0.30)',
                                  background: 'rgba(229,178,76,0.08)',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(229,178,76,0.18)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'rgba(229,178,76,0.08)';
                                }}
                                title="Reset all overrides for this feature to defaults"
                              >
                                Reset
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-brand-textMuted">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(229,178,76,0.85)' }} />
            Overridden from default
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-9 h-5 rounded-full" style={{ background: '#22c55e' }} />
            Allowed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-9 h-5 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
            Denied
          </span>
        </div>
      </div>

      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setResetTarget(null)}
        >
          <div
            className="rounded-2xl p-6 max-w-sm w-full mx-4"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.10)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-brand-text mb-2">Reset to defaults?</h3>
            <p className="text-sm text-brand-textMuted mb-5">
              All custom overrides for{' '}
              <strong className="text-brand-text">
                {data.resources.find((r) => r.key === resetTarget.resource)?.label}
              </strong>{' '}
              will be removed and the default access rules will apply.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setResetTarget(null)}
                className="px-4 py-2 text-sm rounded-lg text-brand-textMuted"
                style={{ border: '1px solid rgba(255,255,255,0.12)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => resetRowMut.mutate(resetTarget.resource)}
                className="px-4 py-2 text-sm rounded-lg font-semibold"
                style={{ background: 'rgba(239,68,68,0.20)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.30)' }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
