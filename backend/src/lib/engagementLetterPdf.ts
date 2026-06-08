/**
 * Engagement letter PDF — pdfkit, no Chromium.
 *
 * All pages use margin: 0 at doc level. We manage all coordinates explicitly.
 * Footer is drawn FIRST on each content page (before any flowing text) so the
 * cursor never flows into footer territory. Cover + Thank-you pages have their
 * own footers placed at absolute y coords (content is short, no overflow risk).
 */
import PDFDocument from 'pdfkit';
import type { EngagementLetterVars } from './engagementLetter';

const BLACK   = '#1A1B1E';
const GREY    = '#6B6F78';
const LGREY   = '#9aa0a6';
const ACCENT  = '#1A6CDF';
const LIGHT   = '#f4f4f6';
const BORDER  = '#e4e4e7';
const WHITE   = '#ffffff';

export async function buildEngagementLetterPdf(v: EngagementLetterVars): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      info: {
        Title: `MITS Engagement Letter — ${v.clientName}`,
        Author: 'MITS Solution Pvt Ltd',
        Subject: 'Engagement Letter',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW  = doc.page.width;   // 595.28
    const PH  = doc.page.height;  // 841.89
    const M   = 52;               // side margin
    const CW  = PW - M * 2;       // content width  491.28

    // Footer reserved zone: bottom 50 pts. Content must not enter y > PH - 50.
    const FOOTER_Y = PH - 50;

    const cadenceLabel = (() => {
      switch ((v.paymentModel || '').toLowerCase()) {
        case 'weekly':   return { name: 'Weekly',    cycle: '7 days' };
        case 'biweekly': return { name: 'Bi-weekly', cycle: '15 days' };
        case 'monthly':  return { name: 'Monthly',   cycle: '30 days' };
        case 'oneshot':  return { name: 'One-shot',  cycle: 'single payment' };
        default:         return { name: v.paymentModel || '—', cycle: '—' };
      }
    })();
    const amountLabel = v.cycleAmount
      ? `${v.currency || 'USD'} ${v.cycleAmount.toLocaleString('en-IN')}`
      : '—';

    // ─── PAGE 1: COVER ──────────────────────────────────────────────────────
    doc.rect(0, 0, PW, PH).fill(WHITE);

    // Dark diagonal band (top-left, covering roughly y 0→437)
    doc.save()
       .polygon([0, 0], [PW * 0.58, 0], [PW * 0.38, PH * 0.52], [0, PH * 0.52])
       .fill(BLACK);
    doc.restore();

    // Thin accent stripe alongside the band
    doc.save()
       .polygon([PW * 0.58, 0], [PW * 0.65, 0], [PW * 0.45, PH * 0.52], [PW * 0.38, PH * 0.52])
       .fill('#3a3d44');
    doc.restore();

    // "MITS" wordmark top-left — WHITE so it shows on the dark band
    doc.font('Helvetica-Bold').fontSize(52).fillColor(WHITE)
       .text('MITS', M, M, { lineBreak: false });

    // "ENGAGEMENT LETTER" — placed BELOW the diagonal band (band ends ~y=437)
    // Use WHITE text at y=460 so it's in the white region below the band.
    // Also render a second copy in dark just below for contrast.
    const engY = 460;
    doc.font('Helvetica-Bold').fontSize(48).fillColor(BLACK)
       .text('ENGAGEMENT', M, engY, { width: CW, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(48).fillColor(BLACK)
       .text('LETTER', M, engY + 56, { width: CW, lineBreak: false });

    // Subtitle
    doc.font('Helvetica').fontSize(13).fillColor(GREY)
       .text('M I T S  S o l u t i o n', M, engY + 120, { width: CW, lineBreak: false });

    // Cover footer (content is short so no overflow risk here)
    doc.font('Helvetica').fontSize(8).fillColor(LGREY)
       .text(
         'No part of this documentation may be reproduced or transmitted in any form or by any means, electronic or mechanical, ' +
         'including photocopying or recording, for any purpose without express written permission of the Management of MITS Solution.',
         M, PH - 56, { width: CW },
       );

    // ─── PAGE 2: ABOUT US + VALUE STATEMENT ────────────────────────────────
    doc.addPage({ margin: 0 });
    doc.rect(0, 0, PW, PH).fill(WHITE);

    // Draw footer FIRST — this way the cursor starts at top and we
    // explicitly stop content before FOOTER_Y.
    drawFooter(doc, M, PH, CW);

    dotGrid(doc, M, M, 6, 6);

    // MITS wordmark top-right — explicit coords, no width/align to avoid wrap
    doc.font('Helvetica-Bold').fontSize(22).fillColor(BLACK)
       .text('MITS', PW - M - 55, M + 4, { lineBreak: false });

    let y = M + 48;

    doc.font('Helvetica-Bold').fontSize(26).fillColor(BLACK)
       .text('ABOUT US', M, y, { width: CW, align: 'center' });
    y += 42;

    doc.font('Helvetica').fontSize(11).fillColor(BLACK)
       .text(
         'MITS is a leading IT services and software training company that provides innovative solutions to help businesses grow, optimize operations, and enhance productivity. We work closely with our clients to understand their needs and challenges, and we design and implement customized solutions that meet their specific requirements. We are committed to quality and customer satisfaction. Our team of experienced professionals has a deep understanding of the latest technologies and trends, and we are constantly innovating to stay ahead of the curve.',
         M, y, { width: CW, lineGap: 3 },
       );
    y = doc.y + 10;

    if (y < FOOTER_Y - 100) {
      doc.font('Helvetica').fontSize(11).fillColor(BLACK)
         .text('We offer a wide range of services, including:', M, y, { width: CW });
      y = doc.y + 4;
      y = bul(doc, 'Staffing services', M, y, CW, FOOTER_Y);
      y = bul(doc, 'Software Training', M, y, CW, FOOTER_Y);
      y = bul(doc, 'IT services', M, y, CW, FOOTER_Y);
    }

    y += 28;
    if (y < FOOTER_Y - 80) {
      doc.font('Helvetica-Bold').fontSize(24).fillColor(BLACK)
         .text('VALUE STATEMENT', M, y, { width: CW, align: 'center' });
      y += 38;

      doc.font('Helvetica').fontSize(11).fillColor(BLACK)
         .text(
           'MITS is committed to providing exceptional IT training and development services that are client-centric, expert, innovative, and continuously learning. We foster collaboration, ethical conduct, and social responsibility.',
           M, y, { width: CW, lineGap: 3 },
         );
    }

    // ─── PAGE 3: T&C PART 1 (sections 1–3) ────────────────────────────────
    doc.addPage({ margin: 0 });
    doc.rect(0, 0, PW, PH).fill(WHITE);
    drawFooter(doc, M, PH, CW);
    dotGrid(doc, M, M, 6, 8);

    doc.font('Helvetica-Bold').fontSize(22).fillColor(BLACK)
       .text('MITS', PW - M - 55, M + 4, { lineBreak: false });

    y = M + 44;
    doc.font('Helvetica-Bold').fontSize(20).fillColor(BLACK)
       .text('Engagement Letter', M, y, { width: CW });
    y = doc.y + 2;
    doc.lineWidth(0.8).strokeColor(BORDER).moveTo(M, y).lineTo(M + 100, y).stroke();
    y += 14;

    y = secTitle(doc, '1. Terms & Conditions', M, y, CW, FOOTER_Y);
    y = bul(doc, `This contract is between ${v.clientName} (hereinafter referred to as "Client") and MITS Solution (hereinafter referred to as "Company") for the provision of services.`, M, y, CW, FOOTER_Y);
    y = bul(doc, 'The Client will be responsible for providing the working resources with all necessary information and materials to complete the services.', M, y, CW, FOOTER_Y);
    y = bul(doc, 'The Client will be responsible for reviewing the work of the working resources.', M, y, CW, FOOTER_Y);

    y = secTitle(doc, '2. Subscription Model', M, y, CW, FOOTER_Y);
    y = bul(doc, `The payment for the service will be ${amountLabel} which will be ${cadenceLabel.name} payment.`, M, y, CW, FOOTER_Y);
    y = bul(doc, `Expected commencement of the service will be from 1st day from starting service. If biweekly/one-shot this will be subject to repeat after every ${cadenceLabel.cycle}.`, M, y, CW, FOOTER_Y);
    y = bul(doc, 'The subscription period begins on the first session taken by the client.', M, y, CW, FOOTER_Y);
    y = bul(doc, 'The invoice will be shared with you once the full payment is received.', M, y, CW, FOOTER_Y);

    if (y < FOOTER_Y - 40) {
      y += 6;
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(GREY)
         .text('(Additional comments)', M, y, { width: CW });
      y = doc.y + 2;
      y = bul(doc, v.engagementType ? `${v.engagementType} based model` : 'Engagement type: TBD', M, y, CW, FOOTER_Y);
      y = bul(doc, 'Monday to Friday', M, y, CW, FOOTER_Y);
      y = bul(doc, v.sessionsPerCycle && v.sessionsPerCycle > 0 ? `${v.sessionsPerCycle} hours in stretch.` : 'Session duration: TBD', M, y, CW, FOOTER_Y);
      y = bul(doc, 'No extra charges for skill change.', M, y, CW, FOOTER_Y);
    }

    if (y < FOOTER_Y - 80) {
      y = secTitle(doc, '3. Replacement of Trainer', M, y, CW, FOOTER_Y);
      y = bul(doc, 'The Service Delivery team will arrange for a replacement resource in case of unavoidable emergencies or non-availability, without any additional charge.', M, y, CW, FOOTER_Y);
      y = bul(doc, 'The Client must inform the service delivery team at least 72 hours in advance regarding any need for a replacement resource.', M, y, CW, FOOTER_Y);
      y = bul(doc, 'The service delivery team shall assume full responsibility for providing a suitable replacement of the working resource in the event of a technology change or any other reason.', M, y, CW, FOOTER_Y);
    }

    // ─── PAGE 4: T&C PART 2 (sections 4–7) ────────────────────────────────
    doc.addPage({ margin: 0 });
    doc.rect(0, 0, PW, PH).fill(WHITE);
    drawFooter(doc, M, PH, CW);
    dotGrid(doc, M, M, 6, 8);

    doc.font('Helvetica-Bold').fontSize(22).fillColor(BLACK)
       .text('MITS', PW - M - 55, M + 4, { lineBreak: false });

    y = M + 44;

    y = secTitle(doc, '4. Availability', M, y, CW, FOOTER_Y);
    y = bul(doc, 'The service delivery team will be available during working hours from 8:30 EST – 12:30 EST and 20:30 EST – 00:30 EST.', M, y, CW, FOOTER_Y);
    y = bul(doc, 'Availability of the working resource is subject to factors such as scheduling, project requirements, and any prior commitments.', M, y, CW, FOOTER_Y);

    y = secTitle(doc, '5. Confidentiality', M, y, CW, FOOTER_Y);
    if (y < FOOTER_Y - 60) {
      doc.font('Helvetica').fontSize(11).fillColor(BLACK)
         .text(
           "The company agrees to keep all Client's information strictly confidential. It includes personal, business, and financial information. The company will prevent unauthorized access and disclosure. Also, the client agrees not to disclose, share, or use confidential information for purposes other than the intended business relationship with the company.",
           M, y, { width: CW, lineGap: 3 },
         );
      y = doc.y + 8;
    }

    if (y < FOOTER_Y - 80) {
      y = secTitle(doc, '6. Opt-Out and Adjustment', M, y, CW, FOOTER_Y);
      y = bul(doc, 'If the Client decides to opt out for any unforeseen reason, the remaining days will be carried forward and can be used by the Client without any deductions (in the future).', M, y, CW, FOOTER_Y);
      y = bul(doc, 'Refunds will not be provided, as the working resource is paid in advance. (Only 6a. the point will be applicable)', M, y, CW, FOOTER_Y);
    }

    if (y < FOOTER_Y - 80) {
      y = secTitle(doc, '7. Tax Responsibility', M, y, CW, FOOTER_Y);
      doc.font('Helvetica').fontSize(11).fillColor(BLACK)
         .text(
           "It is the Client's responsibility to pay applicable taxes for the services provided, in accordance with relevant tax laws.",
           M, y, { width: CW, lineGap: 3 },
         );
      y = doc.y + 10;
    }

    if (y < FOOTER_Y - 30) {
      doc.font('Helvetica-BoldOblique').fontSize(11).fillColor(BLACK)
         .text(
           'Also, by making the payment, you indicate that you agree to all the terms and conditions outlined in this document.',
           M, y, { width: CW, lineGap: 3 },
         );
    }

    // ─── PAGE 5: THANK YOU ─────────────────────────────────────────────────
    doc.addPage({ margin: 0 });
    doc.rect(0, 0, PW, PH).fill(LIGHT);

    doc.font('Helvetica-Bold').fontSize(72).fillColor(BLACK)
       .text('THANK', M, PH / 2 - 90, { width: CW, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(72).fillColor(BLACK)
       .text('YOU', M, PH / 2 - 10, { width: CW, lineBreak: false });

    doc.font('Helvetica').fontSize(11).fillColor(BLACK)
       .text('www.mitssolution.com', M, PH - 180, { width: CW, lineBreak: false });
    doc.font('Helvetica').fontSize(11).fillColor(BLACK)
       .text('info@mitssolution.com', M, PH - 160, { width: CW, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK)
       .text('1800 889 3655 (Tollfree)', M, PH - 140, { width: CW, lineBreak: false });

    doc.font('Helvetica').fontSize(8).fillColor(LGREY)
       .text(
         'No part of this documentation may be reproduced or transmitted in any form or by any means, electronic or mechanical, ' +
         'including photocopying or recording, for any purpose without express written permission of the Management of MITS Solution.',
         M, PH - 90, { width: CW },
       );
    doc.font('Helvetica').fontSize(8).fillColor(LGREY)
       .text('© Copyright All Rights Reserved 2023, MITS Solution.', M, PH - 56, { width: CW, lineBreak: false });

    doc.end();
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Bullet point. Guards FOOTER_Y — skips silently if y is already in footer zone.
 * Returns new y after the line.
 */
function bul(doc: PDFKit.PDFDocument, text: string, x: number, y: number, w: number, footerY?: number): number {
  if (footerY && y >= footerY - 20) return y;
  doc.font('Helvetica').fontSize(11).fillColor('#1A1B1E')
     .text(`•  ${text}`, x + 8, y, { width: w - 8, lineGap: 2 });
  return doc.y + 4;
}

/** Bold section heading. Guards FOOTER_Y. Returns new y. */
function secTitle(doc: PDFKit.PDFDocument, text: string, x: number, y: number, w: number, footerY?: number): number {
  if (footerY && y >= footerY - 30) return y;
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1A1B1E')
     .text(text, x, y + 12, { width: w });
  return doc.y + 4;
}

/** Small dot-grid decoration. */
function dotGrid(doc: PDFKit.PDFDocument, x: number, y: number, rows: number, cols: number) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      doc.circle(x + c * 8, y + r * 8, 1.2).fill('#9aa0a6');
    }
  }
}

/**
 * Footer drawn at ABSOLUTE coordinates at the bottom of a page.
 * Must be called BEFORE any flowing text on the page so that the PDFKit
 * cursor (doc.y) is still near the top and won't overflow into this area.
 * The caller is responsible for starting flowing content at y >= M + 44.
 */
function drawFooter(doc: PDFKit.PDFDocument, x: number, ph: number, w: number) {
  // Thin separator line
  doc.lineWidth(0.5).strokeColor('#e4e4e7')
     .moveTo(x, ph - 52).lineTo(x + w, ph - 52).stroke();
  doc.font('Helvetica-BoldOblique').fontSize(8).fillColor('#9aa0a6')
     .text('© Copyright All Rights Reserved 2023, MITS Solution.', x, ph - 44, { width: w, lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor('#1A6CDF')
     .text('www.mitssolution.com', x, ph - 30, { width: w, lineBreak: false });
}
