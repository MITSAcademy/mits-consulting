/**
 * Public-ish features endpoint — returns which feature flags are currently
 * on for the running backend. Frontend uses this to hide nav entries that
 * point to gated routes.
 *
 * No sensitive data — flag names and booleans only.
 */
import { Router } from 'express';
import { requireAuth } from '../lib/auth';
import { readFlags } from '../lib/features';

export const featuresRouter = Router();
featuresRouter.use(requireAuth);

featuresRouter.get('/', (_req, res) => {
  res.json(readFlags());
});
