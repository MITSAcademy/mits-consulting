/**
 * Durable retry queue for system notifications.
 *
 * Before this existed, a notification whose every delivery path was down wrote
 * one audit row and vanished — nobody learned a lead had come in. Now the mail
 * is parked in EmailOutbox and retried with backoff until it lands, and a
 * delivery that is still stuck after the final attempt is reported loudly.
 *
 * Only plain notifications are parked: attachments are not persisted (see the
 * schema comment), so callers sending files must keep handling their own errors.
 */
import { prisma } from './prisma';
import { sendEmail, type SendEmailArgs } from './mailer';

/** Backoff per attempt, in minutes. After the last one the row is FAILED. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 240, 720];
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length;

function joinAddr(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return (Array.isArray(v) ? v.join(', ') : v) || null;
}

/** Park a notification for retry. Never throws — the caller is already failing. */
export async function parkEmail(args: SendEmailArgs, error: unknown): Promise<void> {
  try {
    await prisma.emailOutbox.create({
      data: {
        to: joinAddr(args.to) || '',
        cc: joinAddr(args.cc),
        bcc: joinAddr(args.bcc),
        subject: args.subject,
        body: args.body,
        htmlBody: args.htmlBody ?? null,
        replyTo: args.replyTo ?? null,
        skipVaibhavCc: !!args.skipVaibhavCc,
        lastError: String((error as any)?.message || error).slice(0, 500),
        // First retry is a minute out, so a blip clears without waiting.
        nextAttempt: new Date(Date.now() + BACKOFF_MINUTES[0] * 60_000),
      },
    });
    console.warn('[outbox] parked for retry:', args.subject, '→', args.to);
  } catch (e) {
    console.error('[outbox] could not park email (it is now lost):', args.subject, e);
  }
}

/**
 * Attempt every notification that is due. Called on a timer and safe to run
 * concurrently: each row is claimed with a conditional update, so two workers
 * cannot send the same mail twice.
 */
export async function drainOutbox(): Promise<{ sent: number; failed: number; retrying: number }> {
  // Reclaim rows abandoned mid-send by a restart: Render cycles this process
  // on every deploy, and a row stuck in SENDING would never be retried.
  await prisma.emailOutbox.updateMany({
    where: { status: 'SENDING', updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: 'PENDING' },
  });

  const due = await prisma.emailOutbox.findMany({
    where: { status: 'PENDING', nextAttempt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: 25,
  });

  let sent = 0, failed = 0, retrying = 0;

  for (const row of due) {
    // Claim it by moving the row out of PENDING. Guarding on attempts is not
    // enough: a second worker that re-reads the row after the first claim sees
    // the incremented value and its conditional update matches too, so both
    // send. Only one worker can win the status transition.
    const claimed = await prisma.emailOutbox.updateMany({
      where: { id: row.id, status: 'PENDING' },
      data: { status: 'SENDING', attempts: row.attempts + 1 },
    });
    if (claimed.count === 0) continue;

    const attempt = row.attempts + 1;
    try {
      await sendEmail({
        to: row.to,
        cc: row.cc ?? undefined,
        bcc: row.bcc ?? undefined,
        subject: row.subject,
        body: row.body,
        htmlBody: row.htmlBody ?? undefined,
        replyTo: row.replyTo ?? undefined,
        skipVaibhavCc: row.skipVaibhavCc,
        // Must not re-park: that would grow the queue instead of draining it.
        _noPark: true,
      } as SendEmailArgs);

      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: { status: 'SENT', sentAt: new Date(), lastError: null },
      });
      sent++;
      console.log(`[outbox] delivered on attempt ${attempt}:`, row.subject);
    } catch (e) {
      const message = String((e as any)?.message || e).slice(0, 500);
      if (attempt >= MAX_ATTEMPTS) {
        await prisma.emailOutbox.update({
          where: { id: row.id },
          data: { status: 'FAILED', lastError: message },
        });
        failed++;
        console.error(`[outbox] GAVE UP after ${attempt} attempts — "${row.subject}" to ${row.to}: ${message}`);
        await recordGaveUp(row.subject, row.to, message);
      } else {
        await prisma.emailOutbox.update({
          where: { id: row.id },
          data: {
            status: 'PENDING',
            lastError: message,
            nextAttempt: new Date(Date.now() + BACKOFF_MINUTES[attempt] * 60_000),
          },
        });
        retrying++;
      }
    }
  }

  return { sent, failed, retrying };
}

async function recordGaveUp(subject: string, to: string, error: string): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        byName: 'System',
        action: 'EMAIL_DELIVERY_GAVE_UP',
        details: `Subject: ${subject} | To: ${to} | After ${MAX_ATTEMPTS} attempts | Last error: ${error}`,
      },
    });
  } catch { /* audit failure is non-fatal */ }
}

/** Counts for the health endpoint, so a backlog is visible without a log dive. */
export async function outboxHealth() {
  const [pending, failed] = await Promise.all([
    prisma.emailOutbox.count({ where: { status: 'PENDING' } }),
    prisma.emailOutbox.count({ where: { status: 'FAILED' } }),
  ]);
  return { pending, failed };
}
