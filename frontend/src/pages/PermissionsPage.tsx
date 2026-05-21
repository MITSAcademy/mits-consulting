import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { Link } from 'react-router-dom';

// Read-only matrix view. Permissions are enforced server-side in /backend/src/routes/clients.ts.
const CLIENT_CATS = ['identity', 'contact', 'engagement', 'pipeline', 'workflow', 'financial', 'sensitive'] as const;
const CLIENT_PERMS: Record<string, Record<string, boolean>> = {
  founder:           { identity: true,  contact: true,  engagement: true,  pipeline: true,  workflow: true,  financial: true,  sensitive: true  },
  demo_lead:         { identity: true,  contact: true,  engagement: true,  pipeline: true,  workflow: true,  financial: false, sensitive: false },
  manager:           { identity: true,  contact: true,  engagement: true,  pipeline: true,  workflow: true,  financial: true,  sensitive: true  },
  demo_intake:       { identity: false, contact: false, engagement: false, pipeline: false, workflow: true,  financial: false, sensitive: false },
  recruiter:         { identity: false, contact: false, engagement: false, pipeline: false, workflow: false, financial: false, sensitive: false },
  sales_closer:      { identity: false, contact: false, engagement: true,  pipeline: false, workflow: false, financial: true,  sensitive: false },
  accounts:          { identity: false, contact: false, engagement: false, pipeline: false, workflow: false, financial: true,  sensitive: false },
  lead:              { identity: false, contact: false, engagement: false, pipeline: false, workflow: true,  financial: false, sensitive: false },
  staff:             { identity: false, contact: false, engagement: false, pipeline: false, workflow: true,  financial: false, sensitive: false },
  payment_processor: { identity: false, contact: false, engagement: false, pipeline: false, workflow: false, financial: false, sensitive: false },
};

const CAT_DESC: Record<string, string> = {
  identity: 'name, group name',
  contact: 'phone, email, group link',
  engagement: 'source, type, currency, amount, notes',
  pipeline: 'REASSIGN owners (managerial)',
  workflow: 'intake data, match trainer, set timing — Team 2/5 daily job',
  financial: 'bank, payment amounts, fresh/renewal',
  sensitive: 'verification toggle, churn risk',
};

export function PermissionsPage() {
  return (
    <>
      <Topbar title="Edit permissions" subtitle="Read-only matrix · enforced server-side" />
      <Page>
        <div className="callout">
          This matrix mirrors what the backend enforces on every <code>PATCH /clients/:id</code> and
          <code> POST /clients/:id/stage</code>. To toggle the master switch (off = anyone can edit anything),
          use <Link to="/settings" className="text-brand-amber underline">Settings → strict_edit_permissions</Link>.
          The <Link to="/edit-requests" className="text-brand-amber underline">Edit requests</Link> queue handles
          change-requests from users without direct permission.
        </div>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                {CLIENT_CATS.map((c) => <th key={c} title={CAT_DESC[c]}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(CLIENT_PERMS).map(([role, perms]) => (
                <tr key={role}>
                  <td><strong className="capitalize">{role.replace(/_/g, ' ')}</strong></td>
                  {CLIENT_CATS.map((c) => (
                    <td key={c}>
                      {perms[c] ? <Pill color="green">edit</Pill> : <Pill>read</Pill>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="muted text-xs mt-3">
          {Object.entries(CAT_DESC).map(([k, v]) => <span key={k} className="mr-3"><strong>{k}</strong> — {v}</span>)}
        </div>
      </Page>
    </>
  );
}
