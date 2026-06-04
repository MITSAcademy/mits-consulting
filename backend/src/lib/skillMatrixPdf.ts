/**
 * Skill-set matrix PDF — attached to client emails so they can download / forward
 * a clean copy of the trainer comparison. Mirrors the layout of the HTML body
 * but renders to a portable PDF with pdfkit (no chromium dependency).
 */
import PDFDocument from 'pdfkit';
import type { BuildSkillMatrixOpts, CandidateMatrix } from './skillMatrix';
import { DEFAULT_SOFT_SKILLS } from './skillMatrix';

const INK = '#1A1B1E';
const SUBTLE = '#6B6F78';
const LIGHT = '#f4f4f6';
const BORDER = '#cfcfd3';
const ACCENT = '#1A6CDF';

export async function buildSkillMatrixPdf(opts: BuildSkillMatrixOpts): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margin: 40,
      info: {
        Title: `MITS Skillset Matrix — ${opts.clientName}`,
        Author: 'MITS Solution Pvt Ltd',
        Subject: 'Proposed trainer profiles + skill matrix',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const LEFT = doc.page.margins.left;
    const RIGHT = W - doc.page.margins.right;
    const CW = RIGHT - LEFT;

    // Title block
    doc.font('Helvetica-Bold').fontSize(18).fillColor(INK)
      .text('MITS Solution — Proposed Trainer Profiles', LEFT, doc.y);
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(11).fillColor(SUBTLE)
      .text(`Prepared for ${opts.clientName}`, { width: CW });
    doc.moveDown(0.5);
    if (opts.introNote) {
      doc.font('Helvetica').fontSize(10).fillColor(INK)
        .text(opts.introNote, { width: CW, lineGap: 2 });
      doc.moveDown(0.5);
    }
    doc.lineWidth(0.5).strokeColor(BORDER)
      .moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).stroke();
    doc.moveDown(0.6);

    const cands = opts.candidates;
    if (cands.length === 0) {
      doc.font('Helvetica').fontSize(11).fillColor(SUBTLE)
        .text('No candidates to display.', { width: CW });
      doc.end();
      return;
    }

    // Per-candidate sections — one block per trainer (vertical layout reads well
    // on A4 portrait even for 3+ candidates, which a side-by-side table can't).
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      renderCandidate(doc, i + 1, c, LEFT, RIGHT, CW);
      if (i < cands.length - 1) {
        doc.moveDown(0.6);
        doc.lineWidth(0.5).strokeColor(BORDER)
          .moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).stroke();
        doc.moveDown(0.6);
      }
    }

    // Footer
    doc.moveDown(1);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(SUBTLE)
      .text('— MITS Consulting · sales@mitssolution.com · https://mitssolution.com',
        LEFT, undefined, { width: CW, align: 'center' });

    doc.end();
  });
}

function renderCandidate(doc: PDFKit.PDFDocument, n: number, c: CandidateMatrix, LEFT: number, RIGHT: number, CW: number) {
  // Header strip — Candidate N + name
  const yHead = doc.y;
  doc.rect(LEFT, yHead, CW, 22).fill(LIGHT);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12)
    .text(`Candidate ${n}  ·  ${c.name || '—'}`, LEFT + 8, yHead + 5, { width: CW - 16 });
  doc.y = yHead + 26;

  // Quick facts grid
  const facts: { label: string; value: string }[] = [
    { label: 'Total IT Experience', value: c.totalExperience || '—' },
    { label: 'Demo Date',           value: c.demoDate || '—' },
    { label: 'Demo Time (IST)',     value: c.demoTimeIst || '—' },
  ];
  if (c.zoneTimes) facts.push({ label: 'US Time Zones', value: c.zoneTimes });
  for (const f of facts) {
    const yRow = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
      .text(`${f.label}:`, LEFT, yRow, { width: 140, continued: false });
    doc.font('Helvetica').fontSize(10).fillColor(INK)
      .text(f.value, LEFT + 145, yRow, { width: CW - 145 });
    doc.y = yRow + 14;
  }
  doc.moveDown(0.3);

  // Must-have skills — two-column matrix (Skill, Proficiency /5)
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT)
    .text('Must Have Skills', LEFT, doc.y);
  doc.moveDown(0.2);
  const mh = c.mustHaveSkills || [];
  if (mh.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(SUBTLE)
      .text('—', LEFT, doc.y);
    doc.moveDown(0.3);
  } else {
    renderTwoColTable(doc, ['Skill', 'Proficiency'], mh.map((s) => [s.skill, `${s.proficiency.toFixed(1)} / 5`]), LEFT, RIGHT, CW);
  }

  // Soft skills + checklist
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT)
    .text('Soft Skills & Checklist', LEFT, doc.y);
  doc.moveDown(0.2);
  const soft = (c.softSkills && c.softSkills.length ? c.softSkills : DEFAULT_SOFT_SKILLS);
  renderTwoColTable(doc, ['Item', 'Value'], soft.map((s) => [s.item, s.value]), LEFT, RIGHT, CW);
}

function renderTwoColTable(doc: PDFKit.PDFDocument, headers: string[], rows: string[][], LEFT: number, RIGHT: number, CW: number) {
  const col1W = Math.floor(CW * 0.62);
  const col2W = CW - col1W;
  const cell = 14;
  // Header
  const yh = doc.y;
  doc.rect(LEFT, yh, CW, cell).fill(LIGHT);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9)
    .text(headers[0], LEFT + 6, yh + 3, { width: col1W - 12 });
  doc.text(headers[1], LEFT + col1W + 6, yh + 3, { width: col2W - 12 });
  doc.y = yh + cell;
  // Rows
  for (const r of rows) {
    const yr = doc.y;
    doc.rect(LEFT, yr, CW, cell).lineWidth(0.4).strokeColor(BORDER).stroke();
    doc.fillColor(INK).font('Helvetica').fontSize(9)
      .text(r[0] || '—', LEFT + 6, yr + 3, { width: col1W - 12 });
    doc.text(r[1] || '—', LEFT + col1W + 6, yr + 3, { width: col2W - 12 });
    doc.y = yr + cell;
  }
  doc.moveDown(0.4);
}
