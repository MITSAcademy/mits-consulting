import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { PDFDocument, rgb } from 'pdf-lib';
// pdf-parse is CJS and works fine in Node
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

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
// Phone: covers +91 99999 99999, (123) 456-7890, +1-800-555-0000 etc.
const PHONE_RE = /(\+?\d[\d\s\-().]{7,}\d)/g;

/**
 * Approach:
 *  1. Use pdf-lib to draw white rectangles:
 *     - Top 20% of every page → removes header logo image
 *     - Bottom 8% of every page → removes footer contact line
 *  2. Scan each page's raw content streams for text operators that contain
 *     email or phone patterns and replace the string content with spaces.
 *     PDF text operators look like: (text)Tj  or [(text)]TJ
 *     We patch the content stream bytes directly, keeping byte length identical.
 */

function blankSameLength(str: string): string {
  return ' '.repeat(str.length);
}

/**
 * Patch a single content stream buffer:
 * Find (literal string) occurrences inside Tj/TJ operators and blank PII.
 * We only touch literal strings — hex strings (<...>) are left alone because
 * they often represent glyph IDs in subset-encoded fonts, not readable text.
 */
function patchContentStream(buf: Buffer): Buffer {
  // Work as latin1 string so byte values are preserved 1:1
  let s = buf.toString('latin1');

  // Match PDF literal strings: (content) — handling escaped parens \( \)
  // Replace PII found inside them with spaces of equal length
  s = s.replace(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g, (_match, inner) => {
    let patched = inner;
    patched = patched.replace(EMAIL_RE, blankSameLength);
    patched = patched.replace(PHONE_RE, blankSameLength);
    // If nothing changed, return original match unchanged
    if (patched === inner) return _match;
    return `(${patched})`;
  });

  return Buffer.from(s, 'latin1');
}

async function sanitisePdf(inputBytes: Buffer): Promise<Uint8Array> {
  const doc = await PDFDocument.load(inputBytes, { ignoreEncryption: true });
  const pages = doc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();

    // ── 1. Visual whiteout: header (logo image) + footer ──────────────────
    const headerH = Math.round(height * 0.20);
    const footerH = Math.round(height * 0.08);

    page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: rgb(1, 1, 1), opacity: 1 });
    page.drawRectangle({ x: 0, y: 0, width, height: footerH, color: rgb(1, 1, 1), opacity: 1 });

    // ── 2. Content stream patching: redact email/phone text ───────────────
    const node = page.node;
    // Access the raw content streams
    const contents = node.get(node.context.obj('Contents') as any);
    if (!contents) continue;

    // Contents can be a single stream ref or an array of stream refs
    const contentRefs: any[] = [];
    if ((contents as any).constructor?.name === 'PDFArray') {
      for (let i = 0; i < (contents as any).size(); i++) {
        contentRefs.push((contents as any).get(i));
      }
    } else {
      contentRefs.push(contents);
    }

    for (const ref of contentRefs) {
      const stream = doc.context.lookup(ref) as any;
      if (!stream || typeof stream.getContents !== 'function') continue;
      try {
        const rawBytes: Uint8Array = stream.getContents();
        const patched = patchContentStream(Buffer.from(rawBytes));
        // Only update if something changed
        if (!patched.equals(Buffer.from(rawBytes))) {
          stream.setContents(patched);
        }
      } catch {
        // If stream access fails, skip — visual whiteout still covers header
      }
    }
  }

  return doc.save();
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
