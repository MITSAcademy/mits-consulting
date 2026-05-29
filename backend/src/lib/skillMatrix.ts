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

export interface BuildSkillMatrixOpts {
  clientName: string;
  candidates: CandidateMatrix[];
  introNote?: string;
}

/**
 * Build the email-ready HTML matrix.
 *
 * Renders ALL candidates inside a SINGLE outer table so rows line up
 * across columns (was previously one table per candidate which caused
 * "Date for Demo" / "Time for Demo" rows to drift out of sync when
 * candidates had different content lengths).
 *
 * Each candidate occupies 4 sub-columns (label-MustHave, value-MustHave,
 * label-Soft, value-Soft). Multiple candidates sit beside each other,
 * separated by a thin spacer column.
 */
export function buildSkillMatrixHtml(opts: BuildSkillMatrixOpts): string {
  const labelBg = '#e9e9ec';
  const cellBorder = '1px solid #1A1B1E';
  const cellPad = '5px 8px';
  const skillPad = '4px 8px';
  const lightBg = '#fafafa';
  const subHeadBg = '#f5f5f7';

  const cands = opts.candidates;
  if (cands.length === 0) {
    return wrapEmail(opts, `<tr><td style="padding:24px 0;text-align:center;color:#6B6F78;">No candidates to display.</td></tr>`);
  }

  // Each candidate = 4 sub-cols (mh-label, mh-val, soft-label, soft-val).
  // Spacer between candidates = 1 col with background:white, no border.
  const SPACER_WIDTH = 12;
  const candidateColspan = 4;

  // ---- Top info section: header + 4 info rows + zone-times row ----
  const headerCells = cands.map((_, i) => `
    <td colspan="${candidateColspan}" style="background:${labelBg};border:${cellBorder};padding:6px 8px;text-align:center;font-weight:700;font-size:13px;">Candidate · ${i + 1}</td>
  `).join(`<td style="width:${SPACER_WIDTH}px;border:none;"></td>`);

  const labelValueRow = (label: string, valueOf: (c: CandidateMatrix) => string, isItalic = false) => cands.map((c) => `
    <td colspan="2" style="background:${labelBg};border:${cellBorder};padding:${cellPad};font-weight:600;font-size:13px;${isItalic ? 'font-style:italic;' : ''}">${esc(label)}</td>
    <td colspan="2" style="border:${cellBorder};padding:${cellPad};font-size:13px;">${esc(valueOf(c) || '—')}</td>
  `).join(`<td style="width:${SPACER_WIDTH}px;border:none;"></td>`);

  const zoneRow = cands.map((c) => `
    <td colspan="${candidateColspan}" style="border:${cellBorder};padding:${cellPad};text-align:center;font-size:12px;background:${lightBg};">${esc(c.zoneTimes || '')}</td>
  `).join(`<td style="width:${SPACER_WIDTH}px;border:none;"></td>`);

  // ---- Name banners before the skills block ----
  const nameBanner = cands.map((c) => `
    <td colspan="${candidateColspan}" style="background:${labelBg};border:${cellBorder};padding:6px 8px;text-align:center;font-weight:700;font-size:13px;">${esc(c.name)}</td>
  `).join(`<td style="width:${SPACER_WIDTH}px;border:none;"></td>`);

  const skillsHeader = cands.map(() => `
    <td colspan="2" style="background:${labelBg};border:${cellBorder};padding:${cellPad};text-align:center;font-weight:700;font-size:13px;">Must Have Skills</td>
    <td colspan="2" style="background:${labelBg};border:${cellBorder};padding:${cellPad};text-align:center;font-weight:700;font-size:13px;">Soft Skills &amp; Checklist</td>
  `).join(`<td style="width:${SPACER_WIDTH}px;border:none;"></td>`);

  const skillsSubHeader = cands.map(() => `
    <td colspan="2" style="background:${subHeadBg};border:${cellBorder};padding:${skillPad};text-align:center;font-style:italic;font-size:12px;">Proficiency (Out of 5)</td>
    <td colspan="2" style="background:${subHeadBg};border:${cellBorder};padding:${skillPad};text-align:center;font-style:italic;font-size:12px;">Yes / No</td>
  `).join(`<td style="width:${SPACER_WIDTH}px;border:none;"></td>`);

  // ---- Skill rows — pad each candidate to the MAX number of rows across all candidates ----
  const maxRows = cands.reduce((acc, c) => {
    const mh = (c.mustHaveSkills || []).length;
    const ss = (c.softSkills && c.softSkills.length ? c.softSkills : DEFAULT_SOFT_SKILLS).length;
    return Math.max(acc, mh, ss);
  }, 0);

  const skillRows: string[] = [];
  for (let r = 0; r < maxRows; r++) {
    const perCandidate = cands.map((c) => {
      const mh = (c.mustHaveSkills || [])[r];
      const ss = (c.softSkills && c.softSkills.length ? c.softSkills : DEFAULT_SOFT_SKILLS)[r];
      const mhLabel = mh ? `<td style="background:${labelBg};border:${cellBorder};padding:${skillPad};font-weight:600;font-size:13px;">${esc(mh.skill)}</td>` : `<td style="border:${cellBorder};padding:${skillPad};">&nbsp;</td>`;
      const mhVal = mh ? `<td style="border:${cellBorder};padding:${skillPad};text-align:center;font-weight:600;font-size:13px;">${mh.proficiency.toFixed(1)}</td>` : `<td style="border:${cellBorder};padding:${skillPad};">&nbsp;</td>`;
      const ssLabel = ss ? `<td style="background:${labelBg};border:${cellBorder};padding:${skillPad};font-size:13px;">${esc(ss.item)}</td>` : `<td style="border:${cellBorder};padding:${skillPad};">&nbsp;</td>`;
      const ssVal = ss ? `<td style="border:${cellBorder};padding:${skillPad};text-align:center;font-size:13px;">${esc(ss.value)}</td>` : `<td style="border:${cellBorder};padding:${skillPad};">&nbsp;</td>`;
      return mhLabel + mhVal + ssLabel + ssVal;
    }).join(`<td style="width:${SPACER_WIDTH}px;border:none;"></td>`);
    skillRows.push(`<tr>${perCandidate}</tr>`);
  }

  // Vertical gap between info and skills sections — empty spacer row.
  const spacerRow = `<tr><td colspan="${cands.length * candidateColspan + Math.max(0, cands.length - 1)}" style="height:14px;border:none;"></td></tr>`;

  const matrix = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;font-family:'Inter','Helvetica Neue',Arial,sans-serif;">
      <tr>${headerCells}</tr>
      <tr>${labelValueRow('Name', (c) => c.name)}</tr>
      <tr>${labelValueRow('Total IT Experience', (c) => c.totalExperience || '')}</tr>
      <tr>${labelValueRow('Date for Demo', (c) => c.demoDate || '')}</tr>
      <tr>${labelValueRow('Time for Demo', (c) => c.demoTimeIst || '')}</tr>
      <tr>${zoneRow}</tr>
      ${spacerRow}
      <tr>${nameBanner}</tr>
      <tr>${skillsHeader}</tr>
      <tr>${skillsSubHeader}</tr>
      ${skillRows.join('')}
    </table>
  `;

  return wrapEmail(opts, `<tr><td style="padding:14px 0;">${matrix}</td></tr>`);
}

function wrapEmail(opts: BuildSkillMatrixOpts, bodyRows: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>MITS Skillset Matrix · ${esc(opts.clientName)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1A1B1E;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#ffffff;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="960" style="max-width:960px;width:100%;background:#ffffff;padding:24px 28px;">

        <tr><td style="padding:0 0 10px;text-align:center;">
          <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-weight:900;font-size:36px;color:#1A1B1E;line-height:1;letter-spacing:-1px;">MITS</div>
        </td></tr>

        <tr><td style="padding:6px 0 16px;text-align:center;border-top:2px solid #1A1B1E;border-bottom:2px solid #1A1B1E;font-weight:700;font-size:18px;">
          Skillset Matrix of Candidates
        </td></tr>

        ${opts.introNote ? `<tr><td style="padding:14px 0 6px;font-size:14px;line-height:1.6;">${esc(opts.introNote)}</td></tr>` : ''}

        ${bodyRows}

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
