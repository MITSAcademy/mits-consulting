/**
 * Frontend feature-flag hook. Polls GET /api/features at app boot and caches
 * for 5 minutes. Used by the sidebar to hide gated nav entries and by gated
 * pages to render a "not available" placeholder instead of a real fetch.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';

export interface FeatureFlags {
  regularCalls: boolean;
}

const DEFAULTS: FeatureFlags = {
  regularCalls: false,
};

export function useFeatures(): FeatureFlags {
  const user = useAuth((s) => s.user);
  const { data } = useQuery<FeatureFlags>({
    queryKey: ['features'],
    queryFn: () => api.get('/features').then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled: !!user,
  });
  return data || DEFAULTS;
}
