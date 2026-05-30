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
import { sendEmail } from './mailer';

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
      select: { email: true, gmailAddress: true, name: true },
    });
    const to = user?.gmailAddress || user?.email;
    if (!to) return;
    const linkLine = args.link && FRONTEND_BASE
      ? `\n\nOpen in portal: ${FRONTEND_BASE}${args.link}`
      : '';
    const greeting = user?.name ? `Hi ${user.name.split(' ')[0]},\n\n` : '';
    const body = `${greeting}${args.title}${args.body ? `\n\n${args.body}` : ''}${linkLine}\n\n— MITS Consulting Hub`;
    await sendEmail({
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
