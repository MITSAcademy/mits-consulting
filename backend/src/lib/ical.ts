/**
 * Minimal RFC 5545 ICS generator for demo invites.
 * No external dep — just string formatting.
 */

export interface IcsInviteArgs {
  uid: string;                     // unique event id (we use Demo.id)
  summary: string;                 // shown as event title
  description?: string;            // body / agenda
  location?: string;               // e.g. "Zoom meeting" / a URL
  organizerName: string;
  organizerEmail: string;
  startISO: string;                // event start in ISO format, e.g. 2026-05-20T14:30:00+05:30
  durationMinutes: number;
  attendees: Array<{ name?: string; email: string; role?: 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT' }>;
  /** Used in METHOD line. REQUEST = invite, CANCEL = cancellation, REFRESH = update. */
  method?: 'REQUEST' | 'CANCEL' | 'PUBLISH';
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

/** Convert ISO date string (with TZ offset) to UTC ICS format YYYYMMDDTHHMMSSZ. */
function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

function addMinutesISO(iso: string, mins: number): string {
  const d = new Date(iso);
  d.setUTCMinutes(d.getUTCMinutes() + mins);
  return d.toISOString();
}

/** Escape per RFC 5545 §3.3.11: backslash, comma, semicolon, newlines. */
function esc(s: string): string {
  return (s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold long lines to 75 octets per RFC 5545 §3.1. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const slice = line.slice(i, i + 73);
    out.push(i === 0 ? slice : ' ' + slice);
    i += 73;
  }
  return out.join('\r\n');
}

export function buildIcsInvite(args: IcsInviteArgs): string {
  const dtStart = toIcsUtc(args.startISO);
  const dtEnd = toIcsUtc(addMinutesISO(args.startISO, args.durationMinutes));
  const dtStamp = toIcsUtc(new Date().toISOString());
  const method = args.method || 'REQUEST';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MITS Consulting Portal//EN',
    `METHOD:${method}`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${esc(args.uid)}@mits-portal`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${esc(args.summary)}`,
  ];

  if (args.description) lines.push(`DESCRIPTION:${esc(args.description)}`);
  if (args.location) lines.push(`LOCATION:${esc(args.location)}`);

  lines.push(`ORGANIZER;CN=${esc(args.organizerName)}:mailto:${args.organizerEmail}`);

  for (const a of args.attendees) {
    const cn = a.name ? `;CN=${esc(a.name)}` : '';
    const role = `;ROLE=${a.role || 'REQ-PARTICIPANT'}`;
    lines.push(`ATTENDEE${cn}${role};RSVP=TRUE:mailto:${a.email}`);
  }

  lines.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR');

  return lines.map(fold).join('\r\n');
}
