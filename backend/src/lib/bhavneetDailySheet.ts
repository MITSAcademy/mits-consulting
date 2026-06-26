/**
 * Bhavneet's daily session sheet — auto-sent at 2:00 PM IST.
 * Same content as the "Send daily sheet" button on My Calls & Sessions page.
 * Recipients: Kashish, Muskan (TO) + Samita, Vaibhav, Mitali, Bhavneet (CC)
 */

import { prisma } from './prisma';
import { sendEmail, safeBuildFromUser } from './mailer';

function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function sendBhavneetDailySheet() {
  const today = todayIST();

  // Fetch all active regular trainings hosted by Bhavneet's team (Kashish)
  const trainings = await prisma.regularTraining.findMany({
    where: {
      status: 'active',
      OR: [
        { hostedByDefaultId: 'u-kashish' },
        { temporaryHostId: 'u-kashish' },
      ],
    },
    select: {
      id: true,
      defaultTimeIst: true,
      scheduledTimeIST: true,
      meetingMode: true,
      lastSessionStatus: true,
      lastSessionComment: true,
      client: { select: { name: true } },
      trainer: { select: { name: true } },
      hostedByDefault: { select: { name: true } },
      temporaryHost: { select: { name: true } },
    },
    orderBy: { defaultTimeIst: 'asc' },
  });

  if (trainings.length === 0) {
    console.log('[bhavneet-daily-sheet] No active trainings found — skipping');
    return;
  }

  const label = new Date(today + 'T00:00:00Z').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  });

  const tableRows = trainings.map((t, i) => {
    const client = t.client?.name || '—';
    const trainer = t.trainer?.name || '—';
    const host = t.temporaryHost?.name || t.hostedByDefault?.name || '—';
    const time = (t as any).scheduledTimeIST || t.defaultTimeIst || '—';
    const tool = t.meetingMode || '—';
    const status = t.lastSessionStatus || '—';
    const comment = t.lastSessionComment || '';
    const bg = comment ? '#fff3f3' : (i % 2 === 0 ? '#fff' : '#f9fafb');
    return `<tr style="background:${bg}">
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-weight:600">${i + 1}. ${client}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${trainer}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${host}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${time}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${tool}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:${status === 'Yes-Proper session' ? '#16a34a' : status === 'No' ? '#dc2626' : '#92400e'}">${status}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-style:italic">${comment}</td>
    </tr>`;
  }).join('');

  const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto">
  <h2 style="color:#1a3a5c;margin-bottom:4px">📋 Daily Session Sheet — ${label}</h2>
  <p style="color:#6b7280;margin-top:0;font-size:13px">Auto-sent at 2:00 PM IST from MITS Portal</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <thead>
      <tr style="background:#1a3a5c;color:#fff">
        <th style="padding:8px 10px;text-align:left">Client</th>
        <th style="padding:8px 10px;text-align:left">Trainer</th>
        <th style="padding:8px 10px;text-align:left">Host</th>
        <th style="padding:8px 10px;text-align:left">Time</th>
        <th style="padding:8px 10px;text-align:left">Tool</th>
        <th style="padding:8px 10px;text-align:left">Status</th>
        <th style="padding:8px 10px;text-align:left">Comment</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <p style="color:#9ca3af;font-size:11px;margin-top:12px">Auto-generated from MITS Portal · ${label}</p>
</div>`;

  // Send from Bhavneet's account
  const bhavneet = await prisma.user.findUnique({
    where: { id: 'u-bhavneet' },
    select: { id: true, name: true, email: true, gmailAddress: true, sendAsAddress: true, smtpAppPassword: true },
  });

  const fromUser = bhavneet ? safeBuildFromUser(bhavneet) : undefined;

  const allIds = ['u-kashish', 'u-muskan', 'u-samita', 'u-vaibhav', 'u-mitali', 'u-bhavneet'];
  const users = await prisma.user.findMany({
    where: { id: { in: allIds } },
    select: { id: true, email: true, gmailAddress: true, sendAsAddress: true },
  });
  const byId = Object.fromEntries(users.map(u => [u.id, u]));
  const addr = (id: string) => byId[id]?.sendAsAddress || byId[id]?.gmailAddress || byId[id]?.email || '';

  const toEmails = ['u-kashish', 'u-muskan'].map(addr).filter(Boolean);
  const ccEmails = ['u-samita', 'u-vaibhav', 'u-mitali', 'u-bhavneet'].map(addr).filter(Boolean)
    .filter(e => !toEmails.includes(e));

  await sendEmail({
    to: toEmails.join(', '),
    cc: ccEmails.length ? ccEmails.join(', ') : undefined,
    subject: `Daily Session Sheet — ${label}`,
    body: `Daily session sheet for ${label} — ${trainings.length} sessions`,
    htmlBody,
    fromUser,
  } as any);

  console.log(`[bhavneet-daily-sheet] Sent — ${trainings.length} sessions · ${label}`);
}
