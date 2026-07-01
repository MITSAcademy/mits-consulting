import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { homePathFor, HOME_ROLES } from '@/lib/utils';

// Lazy-load every workflow / admin page. Initial bundle ships only the login
// page + layout shell, then routes pull in their own chunks as users navigate.
// Cuts the first-paint bundle by ~60% on Render's free tier — perceptible
// speed-up especially on mobile.
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })));
const PipelinePage = lazy(() => import('@/pages/PipelinePage').then((m) => ({ default: m.PipelinePage })));
const MoneyFlowPage = lazy(() => import('@/pages/MoneyFlowPage').then((m) => ({ default: m.MoneyFlowPage })));
const FinancePage = lazy(() => import('@/pages/FinancePage').then((m) => ({ default: m.FinancePage })));
const VaibhavQueuePage = lazy(() => import('@/pages/VaibhavQueuePage').then((m) => ({ default: m.VaibhavQueuePage })));
const ClientsPage = lazy(() => import('@/pages/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const ClientDetailPage = lazy(() => import('@/pages/ClientDetailPage').then((m) => ({ default: m.ClientDetailPage })));
const TrainersPage = lazy(() => import('@/pages/TrainersPage').then((m) => ({ default: m.TrainersPage })));
const TrainerDetailPage = lazy(() => import('@/pages/TrainerDetailPage').then((m) => ({ default: m.TrainerDetailPage })));
const TrainerLeadsPage = lazy(() => import('@/pages/TrainerLeadsPage').then((m) => ({ default: m.TrainerLeadsPage })));
const PartnersPage = lazy(() => import('@/pages/PartnersPage').then((m) => ({ default: m.PartnersPage })));
const DemoIntakePage = lazy(() => import('@/pages/DemoIntakePage').then((m) => ({ default: m.DemoIntakePage })));
const VerificationsPage = lazy(() => import('@/pages/VerificationsPage').then((m) => ({ default: m.VerificationsPage })));
const DemosPage = lazy(() => import('@/pages/DemosPage').then((m) => ({ default: m.DemosPage })));
const SourcingPage = lazy(() => import('@/pages/SourcingPage').then((m) => ({ default: m.SourcingPage })));
const SalesClosingPage = lazy(() => import('@/pages/SalesClosingPage').then((m) => ({ default: m.SalesClosingPage })));
const FreshPaymentsPage = lazy(() => import('@/pages/FreshPaymentsPage').then((m) => ({ default: m.FreshPaymentsPage })));
const FollowUpPaymentsPage = lazy(() => import('@/pages/FollowUpPaymentsPage').then((m) => ({ default: m.FollowUpPaymentsPage })));
const MySessionsPage = lazy(() => import('@/pages/MySessionsPage').then((m) => ({ default: m.MySessionsPage })));
const DemoTeamReportPage = lazy(() => import('@/pages/DemoTeamReportPage').then((m) => ({ default: m.DemoTeamReportPage })));
const RegularTrainingsPage = lazy(() => import('@/pages/RegularTrainingsPage').then((m) => ({ default: m.RegularTrainingsPage })));
const RegularTrainingDetailPage = lazy(() => import('@/pages/RegularTrainingDetailPage').then((m) => ({ default: m.RegularTrainingDetailPage })));
const CalendarPage = lazy(() => import('@/pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const RenewalsPage = lazy(() => import('@/pages/RenewalsPage').then((m) => ({ default: m.RenewalsPage })));
const FeedbackPage = lazy(() => import('@/pages/FeedbackPage').then((m) => ({ default: m.FeedbackPage })));
const SessionLogsPage = lazy(() => import('@/pages/SessionLogsPage').then((m) => ({ default: m.SessionLogsPage })));
const TrainerPayPage = lazy(() => import('@/pages/TrainerPayPage').then((m) => ({ default: m.TrainerPayPage })));
const TrainerPaySheetPage = lazy(() => import('@/pages/TrainerPaySheetPage').then((m) => ({ default: m.TrainerPaySheetPage })));
const PayoutBatchesPage = lazy(() => import('@/pages/PayoutBatchesPage').then((m) => ({ default: m.PayoutBatchesPage })));
const TasksPage = lazy(() => import('@/pages/TasksPage').then((m) => ({ default: m.TasksPage })));
const LeveragePage = lazy(() => import('@/pages/LeveragePage').then((m) => ({ default: m.LeveragePage })));
const AccountsQueuePage = lazy(() => import('@/pages/AccountsQueuePage').then((m) => ({ default: m.AccountsQueuePage })));
const DailyReportPage = lazy(() => import('@/pages/DailyReportPage').then((m) => ({ default: m.DailyReportPage })));
const ReportsDashboardPage = lazy(() => import('@/pages/ReportsDashboardPage').then((m) => ({ default: m.ReportsDashboardPage })));
const BulkUploadPage = lazy(() => import('@/pages/BulkUploadPage').then((m) => ({ default: m.BulkUploadPage })));
const RawLeadsPage = lazy(() => import('@/pages/RawLeadsPage').then((m) => ({ default: m.RawLeadsPage })));
const EditRequestsPage = lazy(() => import('@/pages/EditRequestsPage').then((m) => ({ default: m.EditRequestsPage })));
const TeamAdminPage = lazy(() => import('@/pages/TeamAdminPage').then((m) => ({ default: m.TeamAdminPage })));
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage })));
const LeadSourcesPage = lazy(() => import('@/pages/LeadSourcesPage').then((m) => ({ default: m.LeadSourcesPage })));
const PermissionsPage = lazy(() => import('@/pages/PermissionsPage').then((m) => ({ default: m.PermissionsPage })));
const BanksPage = lazy(() => import('@/pages/BanksPage').then((m) => ({ default: m.BanksPage })));
const AuditPage = lazy(() => import('@/pages/AuditPage').then((m) => ({ default: m.AuditPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const DormantClientsPage = lazy(() => import('@/pages/DormantClientsPage').then((m) => ({ default: m.DormantClientsPage })));
const MyCalendarPage = lazy(() => import('@/pages/MyCalendarPage').then((m) => ({ default: m.MyCalendarPage })));
const HoldClientsPage = lazy(() => import('@/pages/HoldClientsPage').then((m) => ({ default: m.HoldClientsPage })));
const FeedbackPendingPage = lazy(() => import('@/pages/FeedbackPendingPage').then((m) => ({ default: m.FeedbackPendingPage })));
const RoshniFollowUpsPage = lazy(() => import('@/pages/RoshniFollowUpsPage').then((m) => ({ default: m.RoshniFollowUpsPage })));
const SessionsDashboardPage = lazy(() => import('@/pages/SessionsDashboardPage'));
const IssueTrackerPage = lazy(() => import('@/pages/IssueTrackerPage'));
const FreelanceRequirementsPage = lazy(() => import('@/pages/FreelanceRequirementsPage'));
const MeetingLinksPage = lazy(() => import('@/pages/MeetingLinksPage'));
const CoordinatorDashboardPage = lazy(() => import('@/pages/CoordinatorDashboardPage'));
const TeamKanbanPage = lazy(() => import('@/pages/TeamKanbanPage').then((m) => ({ default: m.TeamKanbanPage })));
const MyTimesheetPage = lazy(() => import('@/pages/MyTimesheetPage').then((m) => ({ default: m.MyTimesheetPage })));
const TimesheetReportPage = lazy(() => import('@/pages/TimesheetReportPage').then((m) => ({ default: m.TimesheetReportPage })));
const FeatureFlagsPage = lazy(() => import('@/pages/FeatureFlagsPage'));
const RolePermissionsPage = lazy(() => import('@/pages/RolePermissionsPage').then((m) => ({ default: m.RolePermissionsPage })));
const MonthlyReportPage = lazy(() => import('@/pages/MonthlyReportPage').then((m) => ({ default: m.MonthlyReportPage })));
const EscalationInboxPage = lazy(() => import('@/pages/EscalationInboxPage'));

function PrivateRoute({ children }: { children: JSX.Element }) {
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  if (loading) return <div className="p-10 text-brand-textMuted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function CoordinatorDashboardGate() {
  return <CoordinatorDashboardPage />;
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
    <Suspense fallback={null}>
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
          <Route path="/finance" element={<FinancePage />} />
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
          <Route path="/follow-up-payments" element={<FollowUpPaymentsPage />} />
          <Route path="/my-sessions" element={<MySessionsPage />} />
          <Route path="/reports/demo-team" element={<DemoTeamReportPage />} />
          <Route path="/regular-trainings" element={<RegularTrainingsPage />} />
          <Route path="/regular-trainings/:id" element={<RegularTrainingDetailPage />} />
          <Route path="/meeting-links" element={<MeetingLinksPage />} />
          <Route path="/coordinator-dashboard" element={<CoordinatorDashboardGate />} />
          <Route path="/team-board" element={<TeamKanbanPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/renewals" element={<RenewalsPage />} />
          <Route path="/dormant" element={<DormantClientsPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/session-logs" element={<SessionLogsPage />} />
          <Route path="/trainer-pay" element={<TrainerPayPage />} />
          <Route path="/trainer-pay-sheet" element={<TrainerPaySheetPage />} />
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
          <Route path="/roshni/follow-ups" element={<RoshniFollowUpsPage />} />
          <Route path="/feedback-pending" element={<FeedbackPendingPage />} />
          <Route path="/sessions" element={<SessionsDashboardPage />} />
          <Route path="/issues" element={<IssueTrackerPage />} />
          <Route path="/freelance-requirements" element={<FreelanceRequirementsPage />} />
          <Route path="/timesheet" element={<MyTimesheetPage />} />
          <Route path="/timesheet/report" element={<TimesheetReportPage />} />
          <Route path="/feature-flags" element={<FeatureFlagsPage />} />
          <Route path="/role-permissions" element={<RolePermissionsPage />} />
          <Route path="/reports/monthly" element={<MonthlyReportPage />} />
          <Route path="/escalations" element={<EscalationInboxPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
