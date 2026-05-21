import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { HomePage } from '@/pages/HomePage';
import { PipelinePage } from '@/pages/PipelinePage';
import { MoneyFlowPage } from '@/pages/MoneyFlowPage';
import { VaibhavQueuePage } from '@/pages/VaibhavQueuePage';
import { ClientsPage } from '@/pages/ClientsPage';
import { ClientDetailPage } from '@/pages/ClientDetailPage';
import { TrainersPage } from '@/pages/TrainersPage';
import { TrainerDetailPage } from '@/pages/TrainerDetailPage';
import { TrainerLeadsPage } from '@/pages/TrainerLeadsPage';
import { PartnersPage } from '@/pages/PartnersPage';
import { DemoIntakePage } from '@/pages/DemoIntakePage';
import { VerificationsPage } from '@/pages/VerificationsPage';
import { DemosPage } from '@/pages/DemosPage';
import { SourcingPage } from '@/pages/SourcingPage';
import { SalesClosingPage } from '@/pages/SalesClosingPage';
import { FreshPaymentsPage } from '@/pages/FreshPaymentsPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { RenewalsPage } from '@/pages/RenewalsPage';
import { FeedbackPage } from '@/pages/FeedbackPage';
import { SessionLogsPage } from '@/pages/SessionLogsPage';
import { TrainerPayPage } from '@/pages/TrainerPayPage';
import { PayoutBatchesPage } from '@/pages/PayoutBatchesPage';
import { TasksPage } from '@/pages/TasksPage';
import { LeveragePage } from '@/pages/LeveragePage';
import { AccountsQueuePage } from '@/pages/AccountsQueuePage';
import { DailyReportPage } from '@/pages/DailyReportPage';
import { ReportsDashboardPage } from '@/pages/ReportsDashboardPage';
import { BulkUploadPage } from '@/pages/BulkUploadPage';
import { RawLeadsPage } from '@/pages/RawLeadsPage';
import { EditRequestsPage } from '@/pages/EditRequestsPage';
import { TeamAdminPage } from '@/pages/TeamAdminPage';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { LeadSourcesPage } from '@/pages/LeadSourcesPage';
import { PermissionsPage } from '@/pages/PermissionsPage';
import { BanksPage } from '@/pages/BanksPage';
import { AuditPage } from '@/pages/AuditPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { DormantClientsPage } from '@/pages/DormantClientsPage';
import { MyCalendarPage } from '@/pages/MyCalendarPage';
import { HoldClientsPage } from '@/pages/HoldClientsPage';
import { FeedbackPendingPage } from '@/pages/FeedbackPendingPage';
import { homePathFor, HOME_ROLES } from '@/lib/utils';

function PrivateRoute({ children }: { children: JSX.Element }) {
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  if (loading) return <div className="p-10 text-brand-textMuted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/** Send users whose role can't see the financial Home dashboard to their role-specific landing page. */
function HomeGate() {
  const user = useAuth((s) => s.user);
  if (user && !(HOME_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }
  return <HomePage />;
}

export default function App() {
  const refresh = useAuth((s) => s.refresh);
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route path="/" element={<HomeGate />} />
        <Route path="/pipeline" element={<PipelinePage />} />
        <Route path="/money-flow" element={<MoneyFlowPage />} />
        <Route path="/vaibhav-queue" element={<VaibhavQueuePage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/:id" element={<ClientDetailPage />} />
        <Route path="/trainers" element={<TrainersPage />} />
        <Route path="/trainers/:id" element={<TrainerDetailPage />} />
        <Route path="/trainer-leads" element={<TrainerLeadsPage />} />
        <Route path="/partners" element={<PartnersPage />} />
        <Route path="/demo-intake" element={<DemoIntakePage />} />
        <Route path="/verifications" element={<VerificationsPage />} />
        <Route path="/demos" element={<DemosPage />} />
        <Route path="/sourcing" element={<SourcingPage />} />
        <Route path="/sales-closing" element={<SalesClosingPage />} />
        <Route path="/fresh-payments" element={<FreshPaymentsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/renewals" element={<RenewalsPage />} />
        <Route path="/dormant" element={<DormantClientsPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/session-logs" element={<SessionLogsPage />} />
        <Route path="/trainer-pay" element={<TrainerPayPage />} />
        <Route path="/payout-batches" element={<PayoutBatchesPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/leverage" element={<LeveragePage />} />
        <Route path="/accounts-queue" element={<AccountsQueuePage />} />
        <Route path="/daily-report" element={<DailyReportPage />} />
        <Route path="/reports-dashboard" element={<ReportsDashboardPage />} />
        <Route path="/bulk-upload" element={<BulkUploadPage />} />
        <Route path="/raw-leads" element={<RawLeadsPage />} />
        <Route path="/edit-requests" element={<EditRequestsPage />} />
        <Route path="/team" element={<TeamAdminPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/sources" element={<LeadSourcesPage />} />
        <Route path="/permissions" element={<PermissionsPage />} />
        <Route path="/banks" element={<BanksPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/my-calendar" element={<MyCalendarPage />} />
        <Route path="/hold" element={<HoldClientsPage />} />
        <Route path="/feedback-pending" element={<FeedbackPendingPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
