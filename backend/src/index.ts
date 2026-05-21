import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { clientsRouter } from './routes/clients';
import { trainersRouter } from './routes/trainers';
import { trainerLeadsRouter } from './routes/trainerLeads';
import { partnersRouter } from './routes/partners';
import { sourcingRouter } from './routes/sourcing';
import { paymentsRouter } from './routes/payments';
import { tasksRouter } from './routes/tasks';
import { sessionLogsRouter } from './routes/sessionLogs';
import { leverageRouter } from './routes/leverage';
import { accountsRouter } from './routes/accounts';
import { feedbackRouter } from './routes/feedback';
import { payoutsRouter } from './routes/payouts';
import { banksRouter } from './routes/banks';
import { auditRouter } from './routes/audit';
import { reportsRouter } from './routes/reports';
import { templatesRouter } from './routes/templates';
import { sourcesRouter } from './routes/sources';
import { flagsRouter } from './routes/flags';
import { rawLeadsRouter } from './routes/rawLeads';
import { editRequestsRouter } from './routes/editRequests';
import { metricsRouter } from './routes/metrics';
import { uploadsRouter, UPLOAD_DIR } from './routes/uploads';
import { messagesRouter } from './routes/messages';
import { calendarRouter } from './routes/calendar';
import { oauthRouter } from './routes/oauth';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(
  cors({
    origin: CLIENT_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Serve uploaded files (audio recordings, screenshots, skill matrices).
// In production, replace with S3/Cloudinary + signed URLs.
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/trainers', trainersRouter);
app.use('/api/trainer-leads', trainerLeadsRouter);
app.use('/api/partners', partnersRouter);
app.use('/api/sourcing', sourcingRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/session-logs', sessionLogsRouter);
app.use('/api/leverage', leverageRouter);
app.use('/api/accounts-queue', accountsRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/payouts', payoutsRouter);
app.use('/api/banks', banksRouter);
app.use('/api/audit', auditRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/flags', flagsRouter);
app.use('/api/raw-leads', rawLeadsRouter);
app.use('/api/edit-requests', editRequestsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/oauth', oauthRouter);

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`[mits-backend] listening on :${PORT}`);
});
