-- Performance indexes on hot WHERE columns. CREATE INDEX IF NOT EXISTS so
-- this is safe to re-run; each is on a small column set, no rewrites needed.

-- Client — every page filters on lifecycle, Roshni queues on sub-status + next-call,
-- ownership filters by salesOwner / intakeOwner.
CREATE INDEX IF NOT EXISTS "Client_lifecycle_idx"
  ON "Client" ("lifecycle");
CREATE INDEX IF NOT EXISTS "Client_nextRenewalDue_idx"
  ON "Client" ("nextRenewalDue");
CREATE INDEX IF NOT EXISTS "Client_saleClosingSubStatus_roshniNextCallOn_idx"
  ON "Client" ("saleClosingSubStatus", "roshniNextCallOn");
CREATE INDEX IF NOT EXISTS "Client_salesOwnerId_idx"
  ON "Client" ("salesOwnerId");
CREATE INDEX IF NOT EXISTS "Client_intakeOwnerId_idx"
  ON "Client" ("intakeOwnerId");

-- SourcingRequest — recruiter queue, matrix lookups, auto-close
CREATE INDEX IF NOT EXISTS "SourcingRequest_sentToId_status_idx"
  ON "SourcingRequest" ("sentToId", "status");
CREATE INDEX IF NOT EXISTS "SourcingRequest_clientId_status_idx"
  ON "SourcingRequest" ("clientId", "status");

-- Proposal — per-request pending/passed filters, trainer auto-create lookup
CREATE INDEX IF NOT EXISTS "Proposal_requestId_verification_idx"
  ON "Proposal" ("requestId", "verification");
CREATE INDEX IF NOT EXISTS "Proposal_trainerId_idx"
  ON "Proposal" ("trainerId");

-- Trainer — auto-add dedup (phone first, name fallback) + active filter
CREATE INDEX IF NOT EXISTS "Trainer_phoneDigits_idx"
  ON "Trainer" ("phoneDigits");
CREATE INDEX IF NOT EXISTS "Trainer_name_idx"
  ON "Trainer" ("name");
CREATE INDEX IF NOT EXISTS "Trainer_active_idx"
  ON "Trainer" ("active");

-- Payment — per-client history, MoneyFlow aggregation, kind filter
CREATE INDEX IF NOT EXISTS "Payment_clientId_paymentDate_idx"
  ON "Payment" ("clientId", "paymentDate");
CREATE INDEX IF NOT EXISTS "Payment_paymentDate_idx"
  ON "Payment" ("paymentDate");
CREATE INDEX IF NOT EXISTS "Payment_kind_idx"
  ON "Payment" ("kind");

-- Task — TasksPage per-owner + overdue badge
CREATE INDEX IF NOT EXISTS "Task_ownerId_status_idx"
  ON "Task" ("ownerId", "status");
CREATE INDEX IF NOT EXISTS "Task_ownerId_dueDate_idx"
  ON "Task" ("ownerId", "dueDate");
CREATE INDEX IF NOT EXISTS "Task_clientId_idx"
  ON "Task" ("clientId");

-- Demo — calendar pages, per-client history, conducted-by drill-in
CREATE INDEX IF NOT EXISTS "Demo_clientId_status_idx"
  ON "Demo" ("clientId", "status");
CREATE INDEX IF NOT EXISTS "Demo_trainerId_idx"
  ON "Demo" ("trainerId");
CREATE INDEX IF NOT EXISTS "Demo_scheduledDate_idx"
  ON "Demo" ("scheduledDate");
CREATE INDEX IF NOT EXISTS "Demo_conductedById_idx"
  ON "Demo" ("conductedById");

-- AuditLog — AuditPage sort/filter
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx"
  ON "AuditLog" ("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_byId_createdAt_idx"
  ON "AuditLog" ("byId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx"
  ON "AuditLog" ("action");
