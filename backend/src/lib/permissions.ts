/**
 * Central permission matrix — single source of truth for all role-based access.
 * Import ROLES from here instead of scattering string arrays across route files.
 *
 * Role hierarchy (highest → lowest):
 *   founder > manager > lead > account_manager > staff
 *   Specialist roles: recruiter, sales_closer, demo_lead, demo_intake, payment_processor, accounts
 */

export const ALL_ROLES = [
  'founder', 'manager', 'lead', 'account_manager', 'staff',
  'recruiter', 'sales_closer', 'demo_lead', 'demo_intake',
  'payment_processor', 'accounts',
] as const;

export type Role = typeof ALL_ROLES[number];

/** Roles that can manage the regular (coordinator) team */
export const COORDINATOR_ROLES: Role[] = ['founder', 'manager', 'lead'];

/** Roles that can view/manage active client trainings */
export const TRAINING_READ_ROLES: Role[] = ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'];

/** Roles that can write active client trainings */
export const TRAINING_WRITE_ROLES: Role[] = ['founder', 'manager', 'lead', 'account_manager'];

/** Roles that can log sessions */
export const SESSION_LOG_ROLES: Role[] = ['founder', 'manager', 'lead', 'staff', 'account_manager', 'payment_processor'];

/** Roles that can view freelance requirements */
export const FREELANCE_READ_ROLES: Role[] = ['founder', 'manager', 'lead', 'account_manager', 'recruiter'];

/** Roles that can create freelance requirements */
export const FREELANCE_WRITE_ROLES: Role[] = ['founder', 'manager', 'lead', 'account_manager'];

/** Roles with finance visibility */
export const FINANCE_ROLES: Role[] = ['founder', 'manager', 'accounts', 'payment_processor'];

/** Roles that can see audit log */
export const AUDIT_ROLES: Role[] = ['founder', 'manager', 'accounts', 'demo_lead'];

/** Roles with recruiter/sourcing access */
export const SOURCING_ROLES: Role[] = ['founder', 'manager', 'demo_lead', 'demo_intake'];

/** Roles with demo/intake pipeline access */
export const DEMO_ROLES: Role[] = ['founder', 'demo_lead', 'demo_intake'];
