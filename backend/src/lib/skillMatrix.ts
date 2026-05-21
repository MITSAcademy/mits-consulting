/**
 * Skillset Matrix renderer — produces the side-by-side HTML matrix used by MITS
 * to present proposed trainers to a client. Mirrors the spreadsheet template:
 *
 *   ┌─────────── Candidate 1 ───────────┐    ┌─────────── Candidate 2 ───────────┐
 *   │ Name | Total Exp | Date | Time IST │    │ ... same header structure ...      │
 *   │ ─ Must Have Skills (out of 5) ─    │    │ ─ Must Have Skills (out of 5) ─    │
 *   │ Skill A           | 4.5            │    │ Skill A          | 4.0             │
 *   │ Skill B           | 4.0            │    │ Skill B          | 4.5             │
 *   │ ─ Soft Skills & Checklist ─        │    │ ─ Soft Skills & Checklist ─        │
 *   │ Confident         | Yes            │    │ Confident         | Yes            │
 *   │ English Speaking  | Yes            │    │ English Speaking  | Yes            │
 *   │ Zoom              | Installed      │    │ Zoom              | Installed      │
 *   │ Internet Connection | Active       │    │ Internet Connection | Active       │
 *   └────────────────────────────────────┘    └────────────────────────────────────┘
 */

export interface CandidateMatrix {
  name: string;
  totalExperience?: string;   // e.g. "9 Years"
  demoDate?: string;          // e.g. "19-5-2026"
  demoTimeIst?: string;       // e.g. "7:30 AM IST"
  zoneTimes?: string;         // e.g. "9 PM EST | 8 PM CST | 6 PM PST"
  mustHaveSkills: Array<{ skill: string; proficiency: number }>;
  softSkills: Array<{ item: string; value: string }>;
}

export const DEFAULT_SOFT_SKILLS: Array<{ item: string; value: string }> = [
  { item: 'Confident',           value: 'Yes' },
  { item: 'English Speaking',    value: 'Yes' },
  { item: 'Trustworthy',         value: 'Yes' },
  { item: 'Zoom',                value: 'Installed' },
  { item: 'Internet Connection', value: 'Active' },
];

/** Convert an IST HH:MM into US zone display, e.g. "7:30 AM IST" → "9 PM EST | 8 PM CST | 6 PM PST" (best effort). */
export function istToUsZones(istTime?: string | null, demoDateISO?: string | null): string {
  if (!istTime) return '';
  // Parse "7:30" or "7:30 AM" → 24h hour/minute
  const m = istTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return '';
  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const ampm = (m[3] || '').toUpperCase();
  if (ampm === 'PM' && hh < 12) hh += 12;
  if (ampm === 'AM' && hh === 12) hh = 0;
  // Build IST date (UTC+5:30); use today if no date supplied (timezone math only needs hours)
  const base = demoDateISO ? new Date(demoDateISO + 'T00:00:00Z') : new Date();
  // IST minutes from UTC = 330; so UTC = IST - 5h30m
  const utc = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hh, mm) - 330 * 60_000);
  const fmt = (tz: string) =>
    utc.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz, hour12: true })
      .replace(/^0/, '');
  return `${fmt('America/New_York')} EST | ${fmt('America/Chicago')} CST | ${fmt('America/Los_Angeles')} PST`;
}

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Render one candidate's two stacked tables (header + must-have + soft skills). */
function renderCandidateTable(c: CandidateMatrix, idx: number): string {
  const labelBg = '#e9e9ec';
  const cellBorder = '1px solid #1A1B1E';
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr><td colspan="2" style="background:${labelBg};border:${cellBorder};padding:6px 8px;text-align:center;font-weight:700;">Candidate · ${idx + 1}</td></tr>
      <tr><td style="background:${labelBg};border:${cellBorder};padding:5px 8px;font-weight:600;">Name</td><td style="border:${cellBorder};padding:5px 8px;">${esc(c.name)}</td></tr>
      <tr><td style="background:${labelBg};border:${cellBorder};padding:5px 8px;font-weight:600;">Total IT Experience</td><td style="border:${cellBorder};padding:5px 8px;">${esc(c.totalExperience || '—')}</td></tr>
      <tr><td style="background:${labelBg};border:${cellBorder};padding:5px 8px;font-weight:600;">Date for Demo</td><td style="border:${cellBorder};padding:5px 8px;">${esc(c.demoDate || '—')}</td></tr>
      <tr><td style="background:${labelBg};border:${cellBorder};padding:5px 8px;font-weight:600;">Time for Demo</td><td style="border:${cellBorder};padding:5px 8px;">${esc(c.demoTimeIst || '—')}</td></tr>
      <tr><td colspan="2" style="border:${cellBorder};padding:5px 8px;text-align:center;font-size:12px;background:#fafafa;">${esc(c.zoneTimes || '')}</td></tr>
    </table>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;margin-top:14px;font-size:13px;">
      <tr><td colspan="2" style="background:${labelBg};border:${cellBorder};padding:6px 8px;text-align:center;font-weight:700;">${esc(c.name)}</td></tr>
      <tr>
        <td style="background:${labelBg};border:${cellBorder};padding:5px 8px;text-align:center;font-weight:700;">Must Have Skills</td>
        <td style="background:${labelBg};border:${cellBorder};padding:5px 8px;text-align:center;font-weight:700;">Soft Skills &amp; Checklist</td>
      </tr>
      <tr>
        <td style="background:#f5f5f7;border:${cellBorder};padding:4px 8px;text-align:center;font-style:italic;">Proficiency (Out of 5)</td>
        <td style="background:#f5f5f7;border:${cellBorder};padding:4px 8px;text-align:center;font-style:italic;">Yes / No</td>
      </tr>
      ${renderSkillRows(c)}
    </table>
  `;
}

function renderSkillRows(c: CandidateMatrix): string {
  const labelBg = '#e9e9ec';
  const cellBorder = '1px solid #1A1B1E';
  const mh = c.mustHaveSkills || [];
  const ss = c.softSkills && c.softSkills.length ? c.softSkills : DEFAULT_SOFT_SKILLS;
  const rows = Math.max(mh.length, ss.length);
  const out: string[] = [];
  for (let i = 0; i < rows; i++) {
    const m = mh[i];
    const s = ss[i];
    const lhs = m
      ? `<td style="background:${labelBg};border:${cellBorder};padding:4px 8px;font-weight:600;">${esc(m.skill)}</td><td style="border:${cellBorder};padding:4px 8px;text-align:center;font-weight:600;">${m.proficiency.toFixed(1)}</td>`
      : `<td style="border:${cellBorder};padding:4px 8px;">&nbsp;</td><td style="border:${cellBorder};padding:4px 8px;">&nbsp;</td>`;
    const rhs = s
      ? `<td style="background:${labelBg};border:${cellBorder};padding:4px 8px;">${esc(s.item)}</td><td style="border:${cellBorder};padding:4px 8px;text-align:center;">${esc(s.value)}</td>`
      : `<td style="border:${cellBorder};padding:4px 8px;">&nbsp;</td><td style="border:${cellBorder};padding:4px 8px;">&nbsp;</td>`;
    out.push(`<tr><td style="padding:0;border:none;"><table style="width:100%;border-collapse:collapse;"><tr>${lhs}</tr></table></td><td style="padding:0;border:none;"><table style="width:100%;border-collapse:collapse;"><tr>${rhs}</tr></table></td></tr>`);
  }
  return out.join('\n');
}

export interface BuildSkillMatrixOpts {
  clientName: string;
  candidates: CandidateMatrix[];
  introNote?: string;
}

/** Render the full email-ready HTML matrix (multiple candidates side-by-side, up to 3 per row). */
export function buildSkillMatrixHtml(opts: BuildSkillMatrixOpts): string {
  const cols = Math.min(opts.candidates.length, 3);
  const widthPct = Math.floor(100 / cols);
  const cards = opts.candidates.map((c, i) =>
    `<td style="vertical-align:top;padding:0 6px;width:${widthPct}%;">${renderCandidateTable(c, i)}</td>`,
  ).join('');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>MITS Skillset Matrix · ${esc(opts.clientName)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1A1B1E;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#ffffff;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="900" style="max-width:900px;width:100%;background:#ffffff;padding:24px 28px;">

        <tr><td style="padding:0 0 10px;text-align:center;">
          <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-weight:900;font-size:36px;color:#1A1B1E;line-height:1;letter-spacing:-1px;">MITS</div>
        </td></tr>

        <tr><td style="padding:6px 0 16px;text-align:center;border-top:2px solid #1A1B1E;border-bottom:2px solid #1A1B1E;font-weight:700;font-size:18px;">
          Skillset Matrix of Candidates
        </td></tr>

        ${opts.introNote ? `<tr><td style="padding:14px 0 6px;font-size:14px;line-height:1.6;">${esc(opts.introNote)}</td></tr>` : ''}

        <tr><td style="padding:14px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate;border-spacing:8px 0;">
            <tr>${cards}</tr>
          </table>
        </td></tr>

        <tr><td style="padding:14px 0 0;font-size:12px;color:#6B6F78;line-height:1.5;">
          This skillset matrix is shared by <b>MITS Consulting</b> for your review. Please confirm your preferred candidate and demo slot by reply.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Plain-text fallback so SMTP includes a text/plain part (and WhatsApp can use it). */
export function buildSkillMatrixText(opts: BuildSkillMatrixOpts): string {
  const lines: string[] = [];
  lines.push('MITS — Skillset Matrix of Candidates');
  lines.push('====================================');
  if (opts.introNote) { lines.push(''); lines.push(opts.introNote); }
  for (let i = 0; i < opts.candidates.length; i++) {
    const c = opts.candidates[i];
    lines.push('');
    lines.push(`Candidate ${i + 1}: ${c.name}`);
    lines.push('---------------------------------');
    lines.push(`Total IT Experience: ${c.totalExperience || '—'}`);
    lines.push(`Date for Demo:       ${c.demoDate || '—'}`);
    lines.push(`Time for Demo:       ${c.demoTimeIst || '—'}`);
    if (c.zoneTimes) lines.push(`Time zones:          ${c.zoneTimes}`);
    lines.push('');
    lines.push('Must Have Skills (proficiency out of 5):');
    (c.mustHaveSkills || []).forEach((s) => lines.push(`  - ${s.skill}: ${s.proficiency.toFixed(1)}`));
    lines.push('');
    lines.push('Soft Skills & Checklist:');
    (c.softSkills && c.softSkills.length ? c.softSkills : DEFAULT_SOFT_SKILLS)
      .forEach((s) => lines.push(`  - ${s.item}: ${s.value}`));
  }
  lines.push('');
  lines.push('— MITS Consulting');
  return lines.join('\n');
}
