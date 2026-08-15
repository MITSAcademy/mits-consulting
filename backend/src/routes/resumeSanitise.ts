import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { PDFDocument, rgb } from 'pdf-lib';

export const resumeSanitiseRouter = Router();
resumeSanitiseRouter.use(requireAuth);
resumeSanitiseRouter.use(requireRole('founder', 'demo_lead'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname?.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are supported'));
    }
  },
});

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?\d[\d\s\-().]{7,}\d)/g;

interface TextItem {
  str: string;
  transform: number[]; // [scaleX, skewX, skewY, scaleY, tx, ty]
  width: number;
  height: number;
}

interface RedactBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Use pdfjs-dist (ESM, dynamic import) to find character positions of
 * emails and phone numbers on each page, then use pdf-lib to draw white
 * rectangles over those positions + the header strip.
 */
async function sanitisePdf(inputBytes: Buffer): Promise<Uint8Array> {
  // Dynamic import — pdfjs-dist v4+ is ESM-only
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as any) as any;
  // Disable worker in Node environment
  pdfjsLib.GlobalWorkerOptions = pdfjsLib.GlobalWorkerOptions || {};
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(inputBytes),
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  // Collect redaction boxes per page (in PDF user-space coords)
  const pageRedactions: Map<number, RedactBox[]> = new Map();

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;

    const textContent = await page.getTextContent();
    const boxes: RedactBox[] = [];

    // Header whiteout — top 12% of page
    boxes.push({ x: 0, y: pageHeight * 0.88, w: viewport.width, h: pageHeight * 0.12 });

    for (const item of textContent.items as TextItem[]) {
      if (!item.str || !item.str.trim()) continue;

      const emails = [...item.str.matchAll(new RegExp(EMAIL_RE.source, 'g'))];
      const phones = [...item.str.matchAll(new RegExp(PHONE_RE.source, 'g'))];

      if (emails.length === 0 && phones.length === 0) continue;

      // item.transform = [scaleX, skewX, skewY, scaleY, tx, ty]
      // tx, ty = position of the text origin in PDF user space
      const [, , , scaleY, tx, ty] = item.transform;
      const fontSize = Math.abs(scaleY);
      const charWidth = item.str.length > 0 ? item.width / item.str.length : fontSize * 0.5;

      const addBox = (match: RegExpMatchArray) => {
        const startChar = match.index ?? 0;
        const matchLen = match[0].length;
        const x = tx + startChar * charWidth;
        const y = ty - fontSize * 0.2; // slight padding below baseline
        const w = matchLen * charWidth + 2;
        const h = fontSize * 1.4;
        boxes.push({ x, y, w, h });
      };

      emails.forEach(addBox);
      phones.forEach(addBox);
    }

    pageRedactions.set(pageNum, boxes);
    page.cleanup();
  }

  // Now use pdf-lib to draw white rectangles
  const libDoc = await PDFDocument.load(inputBytes, { ignoreEncryption: true });
  const pages = libDoc.getPages();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { height: pdfHeight, width: pdfWidth } = page.getSize();
    const boxes = pageRedactions.get(i + 1) || [];

    // Always draw header strip even if no text boxes
    if (boxes.length === 0) {
      const hh = Math.round(pdfHeight * 0.12);
      page.drawRectangle({ x: 0, y: pdfHeight - hh, width: pdfWidth, height: hh, color: rgb(1, 1, 1), opacity: 1 });
      continue;
    }

    // pdfjs uses bottom-left origin same as pdf-lib, so coordinates should align
    for (const box of boxes) {
      page.drawRectangle({
        x: Math.max(0, box.x - 1),
        y: Math.max(0, box.y),
        width: Math.min(box.w + 2, pdfWidth),
        height: Math.min(box.h, pdfHeight),
        color: rgb(1, 1, 1),
        opacity: 1,
      });
    }
  }

  return libDoc.save();
}

// POST /resume-sanitise/process
resumeSanitiseRouter.post('/process', upload.single('resume'), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });

  try {
    const sanitised = await sanitisePdf(req.file.buffer);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sanitised-${req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}"`,
    );
    res.send(Buffer.from(sanitised));
  } catch (e: any) {
    console.error('[resume-sanitise]', e);
    res.status(500).json({ error: 'Failed to process PDF: ' + (e.message || String(e)) });
  }
});

// Multer error handler
resumeSanitiseRouter.use((err: any, _req: any, res: any, _next: any) => {
  if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
});
