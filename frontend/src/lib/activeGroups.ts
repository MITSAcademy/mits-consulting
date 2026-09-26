import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Must match READ_ROLES in backend/src/routes/regularTrainings.ts — only these roles can open
// a training's detail page. Everyone else who sees the active-groups list gets the client page.
const TRAINING_DETAIL_ROLES = ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'];

// Active groups = active RegularTrainings. Shared by Demo intake and My pipeline so both
// boards count the same thing.
export function useActiveGroups(enabled: boolean) {
  const { data } = useQuery({
    queryKey: ['active-groups'],
    queryFn: () => api.get('/regular-trainings/trainings', { params: { status: 'active' } }).then((r) => r.data),
    enabled,
  });
  return (data || []) as any[];
}

export function activeGroupHref(t: any, role: string): string {
  if (TRAINING_DETAIL_ROLES.includes(role) || !t.client?.id) return `/regular-trainings/${t.id}`;
  return `/clients/${t.client.id}`;
}
