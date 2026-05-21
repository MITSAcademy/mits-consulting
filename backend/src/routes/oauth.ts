/**
 * Google SSO + Calendar — Authorization Code flow. Restricted to @mitssolution.com.
 *
 * Required env (graceful if missing):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI   (e.g. http://localhost:4000/api/oauth/google/callback)
 */
import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { signToken, setAuthCookie } from '../lib/auth';
import { audit } from '../lib/audit';
import { encryptSecret } from '../lib/mailer';

export const oauthRouter = Router();

const ALLOWED_DOMAIN = '@mitssolution.com';
const STATE_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Scopes:
//   openid email profile               — identity (mandatory for SSO)
//   calendar.readonly                  — read user's events into our My Calendar grid
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

oauthRouter.get('/google/start', (req, res) => {
  if (!googleConfigured()) {
    return res.status(503).send('Google SSO not configured. Set GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI in backend/.env.');
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = jwt.sign({ n: nonce }, STATE_SECRET, { expiresIn: '5m' });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    scope: SCOPES,
    state,
    prompt: 'consent',           // force consent so we always get a refresh_token
    access_type: 'offline',      // request refresh_token
    include_granted_scopes: 'true',
    hd: 'mitssolution.com',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

oauthRouter.get('/google/callback', async (req, res) => {
  if (!googleConfigured()) return res.status(503).send('Google SSO not configured.');
  const { code, state, error } = req.query as Record<string, string>;
  if (error) return res.redirect(`${process.env.CLIENT_ORIGIN || ''}/login?error=` + encodeURIComponent(error));
  if (!code) return res.status(400).send('Missing authorization code');
  if (!state) {
    return res.status(400).send('Missing state parameter.');
  }
  try {
    jwt.verify(state, STATE_SECRET);
  } catch {
    return res.status(400).send('State invalid or expired — please try again.');
  }

  // Exchange code → tokens
  let tokenResp: any;
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }).toString(),
    });
    tokenResp = await resp.json();
    if (!resp.ok) throw new Error(tokenResp.error_description || tokenResp.error || 'token exchange failed');
  } catch (e: any) {
    return res.status(502).send('OAuth token exchange failed: ' + e.message);
  }

  const idToken: string | undefined = tokenResp.id_token;
  if (!idToken) return res.status(502).send('No id_token returned from Google');
  const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
  const { email, sub: googleId, name, picture, hd } = payload;
  const refreshToken: string | undefined = tokenResp.refresh_token;

  if (!email || !email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
    const origin = process.env.CLIENT_ORIGIN || '';
    return res.redirect(`${origin}/login?error=` + encodeURIComponent(`Only ${ALLOWED_DOMAIN} accounts are allowed.`));
  }
  if (hd && hd !== 'mitssolution.com') {
    const origin = process.env.CLIENT_ORIGIN || '';
    return res.redirect(`${origin}/login?error=` + encodeURIComponent('Only mitssolution.com Google Workspace accounts are allowed.'));
  }

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId }, { gmailAddress: email.toLowerCase() }, { email: email.toLowerCase() }] },
  });
  if (!user) {
    const origin = process.env.CLIENT_ORIGIN || '';
    return res.redirect(`${origin}/login?error=` + encodeURIComponent(
      `No MITS portal account for ${email}. Ask Vaibhav to create one, then try again.`,
    ));
  }

  const updates: any = {};
  if (!user.googleId) updates.googleId = googleId;
  if (!user.avatarUrl && picture) updates.avatarUrl = picture;
  if (!user.gmailAddress) updates.gmailAddress = email.toLowerCase();
  if (refreshToken) {
    updates.googleRefreshToken = encryptSecret(refreshToken);
    updates.googleCalendarConnectedAt = new Date();
  }
  if (Object.keys(updates).length > 0) {
    user = await prisma.user.update({ where: { id: user.id }, data: updates });
  }

  const token = signToken({ id: user.id });
  setAuthCookie(res, token);
  await audit(user.id, user.name, refreshToken ? 'LOGIN_GOOGLE_CAL' : 'LOGIN_GOOGLE_SSO', email);
  const origin = process.env.CLIENT_ORIGIN || '';
  res.redirect(`${origin}/my-calendar`);
});

// Status — frontend uses to know whether to render the Google button
oauthRouter.get('/google/status', (_req, res) => {
  res.json({ enabled: googleConfigured() });
});
