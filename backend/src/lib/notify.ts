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

export interface NotifyArgs {
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

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
    // Swallow — we never want a notification failure to break the calling flow.
    // eslint-disable-next-line no-console
    console.warn('[notify] failed:', (e as any)?.message || e);
  }
}

/** Bulk variant for fan-out to multiple users (skip duplicates inside the array). */
export async function notifyMany(userIds: string[], args: Omit<NotifyArgs, 'userId'>): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  for (const uid of unique) {
    await notify({ ...args, userId: uid });
  }
}
