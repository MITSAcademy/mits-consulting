/**
 * Lightweight in-app notification helper.
 *
 * Call notify({ userId, kind, title, body?, link? }) from anywhere a state change
 * should ping a teammate. The bell icon in the topbar polls /api/notifications.
 *
 * Stays non-blocking: a failure to create a notification never fails the parent
 * operation (we just log it). Notifications are convenience, not source of truth.
 */
import { prisma } from './prisma';
import { sendEmail, safeBuildFromUser } from './mailer';

/** Pick the best available SMTP sender (Vaibhav first, then any configured user). */
async function getSystemFromUser() {
  const users = await prisma.user.findMany({
    where: { smtpAppPassword: { not: null }, active: true },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });
  const preferred = users.find((u: any) => u.id === 'u-vaibhav') || users[0];
  return preferred ? safeBuildFromUser(preferred as any) : null;
}

export interface NotifyArgs {
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  /**
   * When true, ALSO send an email to the user's primary email address.
   * Use sparingly — only for cross-role handoffs (recruiter↔intake, etc.).
   * Defaults to false so internal pings stay quiet.
   */
  email?: boolean;
  /** When set, send the email FROM this user's SMTP instead of Vaibhav's. */
  fromUserId?: string;
}

const FRONTEND_BASE = (process.env.CLIENT_ORIGIN || '').trim().replace(/\/+$/, '');

export async function notify(args: NotifyArgs): Promise<void> {
  if (!args.userId) return;
  try {
    await prisma.notification.create({
      data: {
        userId: args.userId,
        kind: args.kind,
        title: args.title,
        body: args.body ?? null,
        link: args.link ?? null,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notify] db insert failed:', (e as any)?.message || e);
  }

  if (!args.email) return;
  try {
    const user = await prisma.user.findUnique({
      where: { id: args.userId },
      select: { email: true, gmailAddress: true, sendAsAddress: true, name: true },
    });
    const to = user?.sendAsAddress || user?.gmailAddress || user?.email;
    if (!to) {
      console.warn(`[notify] no email address for user ${args.userId} (${user?.name}) — skipping email for "${args.title}"`);
      return;
    }
    let fromUser = args.fromUserId
      ? safeBuildFromUser(await prisma.user.findUnique({ where: { id: args.fromUserId }, select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true } }) as any)
      : null;
    if (!fromUser) fromUser = await getSystemFromUser();
    if (!fromUser) {
      console.warn(`[notify] no SMTP sender configured — skipping email to ${to} for "${args.title}"`);
      return;
    }
    console.log(`[notify] sending email to ${to} via ${fromUser.gmailAddress} — "${args.title}"`);
    const linkLine = args.link && FRONTEND_BASE
      ? `\n\nOpen in portal: ${FRONTEND_BASE}${args.link}`
      : '';
    const greeting = user?.name ? `Hi ${user.name.split(' ')[0]},\n\n` : '';
    const body = `${greeting}${args.title}${args.body ? `\n\n${args.body}` : ''}${linkLine}\n\n— MITS Consulting Hub`;
    await sendEmail({
      fromUser,
      to,
      subject: `[MITS] ${args.title}`,
      body,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notify] email send failed:', (e as any)?.message || e);
  }
}

/** Bulk variant for fan-out to multiple users (skip duplicates inside the array). */
export async function notifyMany(userIds: string[], args: Omit<NotifyArgs, 'userId'>): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  for (const uid of unique) {
    await notify({ ...args, userId: uid });
  }
}
