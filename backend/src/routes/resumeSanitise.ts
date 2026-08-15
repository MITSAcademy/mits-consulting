import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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

// Regex patterns for PII
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?\d[\d\s\-().]{7,}\d)/g;

// Strings to blank in raw PDF stream (case-insensitive variants of the logo text)
const LOGO_STRINGS = [
  'MITS Staffing', 'Mits Staffing', 'mits staffing', 'MITS STAFFING',
  'MITSStaffing', 'mitsstaffing',
];

/**
 * Patch raw PDF bytes:
 *   1. Replace email/phone substrings in text streams with spaces of equal length
 *   2. Replace known logo/header strings with spaces
 *
 * PDF text is stored as literal strings (parentheses) or hex strings (<hex>).
 * This approach handles the common case of unencoded Latin-1 / UTF-8 literal
 * strings in standard resume PDFs.  It won't handle subset-encoded fonts or
 * non-standard encodings — those require a full PDF renderer (pdfjs-dist).
 */
function patchPdfBuffer(buf: Buffer): Buffer {
  let str = buf.toString('binary'); // binary to preserve byte values

  // Helper: replace match with spaces of same byte length to keep PDF offsets valid
  function blankMatch(s: string, match: string): string {
    return s.replace(match, ' '.repeat(match.length));
  }

  // Patch literal strings: (some text here) → scan inside parens in stream sections
  // We work on the raw string and replace text matches preserving length
  const blank = (text: string) => ' '.repeat(text.length);

  str = str.replace(EMAIL_RE, blank);
  str = str.replace(PHONE_RE, (m) => ' '.repeat(m.length));

  for (const logoStr of LOGO_STRINGS) {
    while (str.includes(logoStr)) {
      str = str.replace(logoStr, ' '.repeat(logoStr.length));
    }
  }

  return Buffer.from(str, 'binary');
}

/**
 * Use pdf-lib to draw white rectangles over the top portion of every page
 * (removes header/logo area visually even if text patching misses it).
 */
async function whiteoutHeaders(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = doc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    // White rectangle covering top 12% of page — typical header zone
    const headerHeight = Math.round(height * 0.12);
    page.drawRectangle({
      x: 0,
      y: height - headerHeight,
      width,
      height: headerHeight,
      color: rgb(1, 1, 1),
      opacity: 1,
    });
  }

  return doc.save();
}

// POST /resume-sanitise/process
resumeSanitiseRouter.post('/process', upload.single('resume'), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });

  try {
    // Step 1: patch raw bytes to blank PII text in streams
    const patched = patchPdfBuffer(req.file.buffer);

    // Step 2: draw white header rectangle on every page
    const sanitised = await whiteoutHeaders(patched);

    // Return sanitised PDF
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

// Error handler for multer
resumeSanitiseRouter.use((err: any, _req: any, res: any, _next: any) => {
  if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
});
