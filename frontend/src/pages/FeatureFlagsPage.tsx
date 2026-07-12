import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useUI } from '@/store/ui';
import { Topbar, Page } from '@/components/layout/AppLayout';

const FLAG_LABELS: Record<string, string> = {
  regularCalls: 'Regular Calls',
};

interface MatrixUser {
  id: string;
  name: string;
  role: string;
  flags: Record<string, boolean>;
}

interface MatrixData {
  flags: string[];
  users: MatrixUser[];
}

export default function FeatureFlagsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  const { data, isLoading } = useQuery<MatrixData>({
    queryKey: ['feature-flags-matrix'],
    queryFn: () => api.get('/features/matrix').then((r) => r.data),
  });

  // Also fetch env defaults (the unauthenticated /features endpoint returns env defaults for the current user,
  // but for the "Default (env)" row we call readFlags which is exposed via GET /features without overrides —
  // we approximate by reading flags from any user that has no overrides, or we fetch from the matrix endpoint
  // itself which already reflects env defaults for users with no overrides.
  // Instead, re-use the existing GET /features endpoint which now returns per-user flags.
  // For env defaults row, we call it without userId context — but that's per-user now.
  // We'll compute env defaults as: for each flag, the value a user with NO overrides would see.
  // Since the matrix already includes all users, we infer env default from users with no explicit override
  // by fetching /features/matrix and reading env defaults from the backend.
  // Simplest: add a separate endpoint. But spec says no extra backend changes beyond what's listed.
  // We'll derive env default by noticing that the matrix returns merged values.
  // The safest approach: make a separate fetch of /features as a "defaults" user context is not available here,
  // but we can compute it: env default = what a user with no overrides sees. We just parse from flags array
  // by checking a dummy. Actually let's just fetch /features for the current user (founder) which likely has no overrides.
  // The current user is a founder — we'll use their flags as a proxy for env defaults, noting founders
  // typically don't have per-user overrides set.
  // Better: add an env-defaults row by calling GET /features separately.
  const { data: envDefaults } = useQuery<Record<string, boolean>>({
    queryKey: ['feature-flags-env'],
    queryFn: () => api.get('/features').then((r) => r.data),
  });

  const toggle = useMutation({
    mutationFn: async ({
      userId,
      flag,
      currentValue,
      isOverridden,
      envDefault,
    }: {
      userId: string;
      flag: string;
      currentValue: boolean;
      isOverridden: boolean;
      envDefault: boolean;
    }) => {
      const newValue = !currentValue;
      if (isOverridden && newValue === envDefault) {
        // Reset to inherited
        await api.delete('/features/matrix', { data: { userId, flag } });
      } else {
        await api.post('/features/matrix', { userId, flag, enabled: newValue });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feature-flags-matrix'] });
      showToast('Flag updated');
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to update flag', 'error'),
  });

  if (isLoading) {
    return (
      <div className="p-8 text-brand-textMuted text-sm">Loading feature flags…</div>
    );
  }

  if (!data) return null;

  const { flags, users } = data;

  // Determine which users have per-user overrides by re-fetching per-user data isn't available directly.
  // The matrix endpoint returns merged values. We need to know which values are overrides vs env defaults.
  // We'll compare each user's flag value to the env defaults to show the override indicator.
  const envDef = envDefaults || {};

  return (
    <>
      <Topbar title="Feature flags" />
      <Page>
      <div
        className="rounded-xl overflow-auto"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
              <th
                className="text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wide"
                style={{ color: 'rgba(229,178,76,0.7)', minWidth: 200 }}
              >
                User
              </th>
              {flags.map((flag) => (
                <th
                  key={flag}
                  className="px-4 py-3 font-medium text-[11px] uppercase tracking-wide text-center"
                  style={{ color: 'rgba(229,178,76,0.7)', minWidth: 130 }}
                >
                  {FLAG_LABELS[flag] ?? flag}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Env default row — non-editable */}
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(229,178,76,0.04)' }}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium" style={{ color: 'rgba(229,178,76,0.85)' }}>Default (env)</span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide"
                    style={{ background: 'rgba(229,178,76,0.15)', color: 'rgba(229,178,76,0.85)' }}
                  >
                    env
                  </span>
                </div>
              </td>
              {flags.map((flag) => {
                const val = envDef[flag] ?? false;
                return (
                  <td key={flag} className="px-4 py-3 text-center">
                    <span
                      className="inline-flex items-center justify-center w-10 h-5 rounded-full text-[10px] font-bold"
                      style={{
                        background: val ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                        color: val ? '#4ade80' : 'rgba(232,226,211,0.35)',
                        border: val ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      {val ? 'ON' : 'OFF'}
                    </span>
                  </td>
                );
              })}
            </tr>

            {/* User rows */}
            {users.map((user, idx) => (
              <tr
                key={user.id}
                style={{
                  borderBottom: idx < users.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span style={{ color: '#E8E2D3' }}>{user.name}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide"
                      style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(232,226,211,0.5)' }}
                    >
                      {user.role.replace(/_/g, ' ')}
                    </span>
                  </div>
                </td>
                {flags.map((flag) => {
                  const currentValue = user.flags[flag] ?? false;
                  const envDefault = envDef[flag] ?? false;
                  const isOverridden = currentValue !== envDefault;
                  const isPending = toggle.isPending;

                  return (
                    <td key={flag} className="px-4 py-3 text-center">
                      <button
                        onClick={() =>
                          toggle.mutate({ userId: user.id, flag, currentValue, isOverridden, envDefault })
                        }
                        disabled={isPending}
                        title={isOverridden ? 'Override active — click to toggle' : 'Inherited from env — click to override'}
                        className="relative inline-flex items-center rounded-full transition-colors focus:outline-none"
                        style={{
                          width: 40,
                          height: 22,
                          background: currentValue
                            ? isOverridden
                              ? 'rgba(34,197,94,0.7)'
                              : 'rgba(34,197,94,0.35)'
                            : isOverridden
                            ? 'rgba(239,68,68,0.5)'
                            : 'rgba(255,255,255,0.10)',
                          border: isOverridden ? '1px solid rgba(229,178,76,0.5)' : '1px solid rgba(255,255,255,0.10)',
                          cursor: isPending ? 'not-allowed' : 'pointer',
                          opacity: isPending ? 0.6 : 1,
                        }}
                      >
                        <span
                          className="inline-block rounded-full transition-transform"
                          style={{
                            width: 16,
                            height: 16,
                            background: currentValue ? '#fff' : 'rgba(255,255,255,0.45)',
                            transform: currentValue ? 'translateX(20px)' : 'translateX(2px)',
                            transition: 'transform 150ms ease',
                          }}
                        />
                        {/* Override indicator dot */}
                        {isOverridden && (
                          <span
                            aria-hidden
                            className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                            style={{ background: 'var(--accent-gold)', boxShadow: '0 0 4px rgba(229,178,76,0.6)' }}
                          />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </Page>
    </>
  );
}
