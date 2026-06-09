/**
 * Auto-generated engagement letter PDF.
 *
 * Mirrors the static branded template Roshni used to attach manually —
 * 4 sections on a single document: Title, About Us + Value Statement,
 * Terms & Conditions (Subscription / Trainer Replacement / Availability /
 * Confidentiality / Opt-Out / Tax), Thank You. Client-specific fields
 * (name, amount, cadence, schedule) are filled from EngagementLetterVars.
 *
 * Built with `pdfkit` — no chromium dependency, runs cleanly on Render's
 * free tier where puppeteer would blow the memory limit.
 */
import PDFDocument from 'pdfkit';
import type { EngagementLetterVars } from './engagementLetter';

const BRAND_BLACK = '#1A1B1E';
const BRAND_GREY = '#6B6F78';
const BRAND_LIGHT_GREY = '#9aa0a6';
const ACCENT = '#1A6CDF';
const LIGHT_BG = '#f4f4f6';
const BORDER = '#e4e4e7';

export async function buildEngagementLetterPdf(v: EngagementLetterVars): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 56,
      info: {
        Title: `MITS Engagement Letter — ${v.clientName}`,
        Author: 'MITS Solution Pvt Ltd',
        Subject: 'Engagement Letter',
        Keywords: 'engagement, MITS, training, support',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const H = doc.page.height;
    const LEFT = doc.page.margins.left;
    const RIGHT = W - doc.page.margins.right;
    const CONTENT_W = RIGHT - LEFT;

    // Computed labels
    const cadenceLabel = (() => {
      switch ((v.paymentModel || '').toLowerCase()) {
        case 'weekly': return { name: 'Weekly', cycle: '7 days' };
        case 'biweekly': return { name: 'Bi-weekly', cycle: '15 days' };
        case 'monthly': return { name: 'Monthly', cycle: '30 days' };
        case 'oneshot': return { name: 'One-shot', cycle: 'single payment' };
        default: return { name: v.paymentModel || '—', cycle: '—' };
      }
    })();
    const amountLabel = v.cycleAmount
      ? `${v.currency || 'USD'} ${v.cycleAmount.toLocaleString('en-IN')}`
      : '—';

    // ── PAGE 1: COVER ─────────────────────────────────────────────────────
    // White background
    doc.rect(0, 0, W, H).fill('#ffffff');

    // Dark diagonal band — top-left to mid-right (matches original black/grey slanted design)
    doc.save();
    doc.polygon([0, 0], [W * 0.55, 0], [W * 0.35, H * 0.55], [0, H * 0.55]).fill(BRAND_BLACK);
    doc.restore();

    // Grey accent stripe alongside the dark band
    doc.save();
    doc.polygon([W * 0.55, 0], [W * 0.62, 0], [W * 0.42, H * 0.55], [W * 0.35, H * 0.55]).fill('#3a3d44');
    doc.restore();

    // MITS wordmark (white, top-left over dark band)
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(48).text('MITS', LEFT, 56);

    // ENGAGEMENT LETTER large heading (black text, left, below band edge)
    doc.fillColor(BRAND_BLACK).font('Helvetica-Bold').fontSize(44).text('ENGAGEMENT', LEFT, 180);
    doc.fontSize(44).text('LETTER', LEFT, 236);

    // Subtitle
    doc.font('Helvetica').fontSize(13).fillColor(BRAND_BLACK)
      .text('M I T S  S o l u t i o n', LEFT, 300);

    // Footer fineprint
    doc.font('Helvetica').fontSize(8).fillColor(BRAND_GREY)
      .text('No part of this documentation may be reproduced or transmitted in any form or by any means, electronic or mechanical, including photocopying or recording, for any purpose without express written permission of the Management of MITS Solution.',
        LEFT, H - 80, { width: CONTENT_W, align: 'left' });
    doc.text('© Copyright All Rights Reserved 2023, MITS Solution.', LEFT, H - 52);

    // ── PAGE 2: ABOUT + VALUE ────────────────────────────────────────────
    doc.addPage();
    // Dot-pattern accent (top-left, grey dots like original)
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) {
        doc.circle(LEFT + col * 8, 56 + row * 8, 1.2).fill(BRAND_LIGHT_GREY);
      }
    }
    // MITS top-right wordmark
    doc.font('Helvetica-Bold').fontSize(28).fillColor(BRAND_BLACK).text('MITS', W - LEFT - 60, 44, { width: 60, align: 'right' });

    // Large centred heading
    doc.font('Helvetica-Bold').fontSize(28).fillColor(BRAND_BLACK)
      .text('ABOUT US', LEFT, 100, { width: CONTENT_W, align: 'center' });
    doc.moveDown(1);

    doc.font('Helvetica').fontSize(11).fillColor(BRAND_BLACK).text(
      'MITS is a leading IT services and software training company that provides innovative solutions to help businesses grow, optimize operations, and enhance productivity. We work closely with our clients to understand their needs and challenges, and we design and implement customized solutions that meet their specific requirements. We are committed to quality and customer satisfaction. Our team of experienced professionals has a deep understanding of the latest technologies and trends, and we are constantly innovating to stay ahead of the curve.',
      LEFT, doc.y, { width: CONTENT_W, lineGap: 4 },
    );
    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(11).fillColor(BRAND_BLACK)
      .text('We offer a wide range of services, including:', { width: CONTENT_W });
    doc.moveDown(0.4);
    bullet(doc, 'Staffing services');
    bullet(doc, 'Software Training');
    bullet(doc, 'IT services');

    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(28).fillColor(BRAND_BLACK)
      .text('VALUE STATEMENT', LEFT, doc.y, { width: CONTENT_W, align: 'center' });
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(11).fillColor(BRAND_BLACK).text(
      'MITS is committed to providing exceptional IT training and development services that are client-centric, expert, innovative, and continuously learning. We foster collaboration, ethical conduct, and social responsibility.',
      LEFT, doc.y, { width: CONTENT_W, lineGap: 4 },
    );

    footer(doc);

    // ── PAGE 3: TERMS — SECTIONS 1–3 ──────────────────────────────────────
    doc.addPage();
    // Dot-pattern + MITS mark (matches original style on content pages)
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 8; col++) {
        doc.circle(LEFT + col * 8, 44 + row * 8, 1.2).fill(BRAND_LIGHT_GREY);
      }
    }
    doc.font('Helvetica-Bold').fontSize(28).fillColor(BRAND_BLACK).text('MITS', W - LEFT - 60, 44, { width: 60, align: 'right' });
    pageTitle(doc, 'Engagement Letter');

    sectionTitle(doc, '1. Terms & Conditions');
    bullet(doc, `This contract is between ${bold(v.clientName)} (hereinafter referred to as "Client") and MITS Solution (hereinafter referred to as "Company") for the provision of services.`);
    bullet(doc, 'The Client will be responsible for providing the working resources with all necessary information and materials to complete the services.');
    bullet(doc, 'The Client will be responsible for reviewing the work of the working resources.');

    sectionTitle(doc, '2. Subscription Model');
    bullet(doc, `The payment for the service will be ${bold(amountLabel)} which will be ${bold(cadenceLabel.name)} payment.`);
    bullet(doc, `Expected commencement of the service will be from 1st day from starting service. If biweekly/one-shot this will be subject to repeat after every ${cadenceLabel.cycle}.`);
    bullet(doc, 'The subscription period begins on the first session taken by the client.');
    bullet(doc, 'The invoice will be shared with you once the full payment is received.');
    doc.moveDown(0.4);
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(BRAND_GREY).text('(Additional comments)');
    doc.moveDown(0.2);
    // Render real values when known; show "TBD" instead of fabricated defaults
    // ("Support · Monday-Friday · 2 hours") when the field is unset — clients
    // would otherwise read defaults as confirmed terms.
    bullet(doc, v.engagementType ? `${v.engagementType} based model` : 'Engagement type: TBD');
    bullet(doc, 'Monday to Friday');
    bullet(doc, v.sessionsPerCycle && v.sessionsPerCycle > 0
      ? `${v.sessionsPerCycle} hours in stretch.`
      : 'Session duration: TBD');
    bullet(doc, 'No extra charges for skill change.');

    sectionTitle(doc, '3. Replacement of Trainer');
    bullet(doc, 'The Service Delivery team will arrange for a replacement resource in case of unavoidable emergencies or non-availability, without any additional charge.');
    bullet(doc, 'The Client must inform the service delivery team at least 72 hours in advance regarding any need for a replacement resource.');
    bullet(doc, 'The service delivery team shall assume full responsibility for providing a suitable replacement of the working resource in the event of a technology change or any other reason.');

    footer(doc);

    // ── PAGE 4: TERMS — SECTIONS 4–7 ──────────────────────────────────────
    doc.addPage();
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 8; col++) {
        doc.circle(LEFT + col * 8, 44 + row * 8, 1.2).fill(BRAND_LIGHT_GREY);
      }
    }
    doc.font('Helvetica-Bold').fontSize(28).fillColor(BRAND_BLACK).text('MITS', W - LEFT - 60, 44, { width: 60, align: 'right' });
    sectionTitle(doc, '4. Availability');
    bullet(doc, 'The service delivery team will be available during working hours from 8:30 EST – 12:30 EST and 20:30 EST – 00:30 EST.');
    bullet(doc, 'Availability of the working resource is subject to factors such as scheduling, project requirements, and any prior commitments.');

    sectionTitle(doc, '5. Confidentiality');
    doc.font('Helvetica').fontSize(11).fillColor(BRAND_BLACK).text(
      "The company agrees to keep all Client's information strictly confidential. It includes personal, business, and financial information. The company will prevent unauthorized access and disclosure. Also, the client agrees not to disclose, share, or use confidential information for purposes other than the intended business relationship with the company.",
      { width: CONTENT_W, lineGap: 4 },
    );

    sectionTitle(doc, '6. Opt-Out and Adjustment');
    bullet(doc, 'If the Client decides to opt out for any unforeseen reason, the remaining days will be carried forward and can be used by the Client without any deductions (in the future).');
    bullet(doc, 'Refunds will not be provided, as the working resource is paid in advance. (Only 6a. the point will be applicable)');

    sectionTitle(doc, '7. Tax Responsibility');
    doc.font('Helvetica').fontSize(11).fillColor(BRAND_BLACK).text(
      "It is the Client's responsibility to pay applicable taxes for the services provided, in accordance with relevant tax laws.",
      { width: CONTENT_W, lineGap: 4 },
    );
    doc.moveDown(0.8);
    doc.font('Helvetica-BoldOblique').fontSize(11).fillColor(BRAND_BLACK).text(
      'Also, by making the payment, you indicate that you agree to all the terms and conditions outlined in this document.',
      { width: CONTENT_W, lineGap: 4 },
    );

    footer(doc);

    // ── PAGE 5: THANK YOU ────────────────────────────────────────────────
    doc.addPage();
    doc.rect(0, 0, W, H).fill(LIGHT_BG);

    doc.font('Helvetica-Bold').fontSize(54).fillColor(BRAND_BLACK)
      .text('THANK', LEFT, H / 2 - 80);
    doc.text('YOU', LEFT, H / 2 - 20);

    // Contact block
    doc.font('Helvetica').fontSize(11).fillColor(BRAND_BLACK)
      .text('www.mitssolution.com', LEFT, H - 180);
    doc.text('info@mitssolution.com', LEFT, H - 160);
    doc.font('Helvetica-Bold').text('1800 889 3655 (Tollfree)', LEFT, H - 140);

    doc.font('Helvetica').fontSize(8).fillColor(BRAND_LIGHT_GREY).text(
      'No part of this documentation may be reproduced or transmitted in any form or by any means, electronic or mechanical, including photocopying or recording, for any purpose without express written permission of the Management of MITS Solution.',
      LEFT, H - 90, { width: CONTENT_W, align: 'left' },
    );
    doc.text('© Copyright All Rights Reserved 2023, MITS Solution.', LEFT, H - 55);

    doc.end();
  });
}

// ── PDF helpers ─────────────────────────────────────────────────────────

function pageTitle(doc: PDFKit.PDFDocument, text: string) {
  doc.font('Helvetica-Bold').fontSize(24).fillColor(BRAND_BLACK).text(text);
  doc.moveDown(0.4);
  doc.lineWidth(1).strokeColor(BORDER).moveTo(doc.x, doc.y).lineTo(doc.x + 80, doc.y).stroke();
  doc.moveDown(0.6);
}

function pageHeader(doc: PDFKit.PDFDocument, text: string) {
  doc.font('Helvetica-Bold').fontSize(22).fillColor(BRAND_BLACK).text(text);
  doc.moveDown(0.4);
}

function sectionTitle(doc: PDFKit.PDFDocument, text: string) {
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(BRAND_BLACK).text(text);
  doc.moveDown(0.3);
}

function bullet(doc: PDFKit.PDFDocument, text: string) {
  const x = doc.x;
  doc.font('Helvetica').fontSize(11).fillColor(BRAND_BLACK);
  // Render bullet + indented text. pdfkit doesn't natively split bold within
  // bulletted text well, so we strip the {{bold}} markers and accept that
  // emphasized terms render as plain in PDF (still readable + correct).
  const stripped = text.replace(/​(.+?)​/g, '$1');
  doc.text(`•  ${stripped}`, x, doc.y, { width: doc.page.width - doc.page.margins.right - x, lineGap: 3 });
  doc.moveDown(0.2);
}

function bold(s: string): string {
  // We mark emphasized terms with zero-width-space sentinels for future styling;
  // bullet() currently strips them. Keeping the helper so call sites read clearly.
  return `​${s}​`;
}

function footer(doc: PDFKit.PDFDocument) {
  const W = doc.page.width;
  const H = doc.page.height;
  const LEFT = doc.page.margins.left;
  doc.font('Helvetica-BoldOblique').fontSize(8).fillColor(BRAND_LIGHT_GREY)
    .text('© Copyright All Rights Reserved 2023, MITS Solution.', LEFT, H - 50);
  doc.font('Helvetica').fillColor(ACCENT).text('www.mitssolution.com', LEFT, H - 36);
  doc.fillColor(BRAND_BLACK);
}
