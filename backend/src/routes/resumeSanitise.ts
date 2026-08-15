import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { PDFDocument, rgb } from 'pdf-lib';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('jszip');

export const resumeSanitiseRouter = Router();
resumeSanitiseRouter.use(requireAuth);
resumeSanitiseRouter.use(requireRole('founder', 'demo_lead'));

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/msword',                                                       // doc
  'text/html', 'text/plain',
]);
const ALLOWED_EXT = new Set(['.pdf', '.docx', '.doc', '.html', '.htm', '.txt']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
    if (ALLOWED_MIME.has(mime) || ALLOWED_EXT.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext || mime}. Supported: PDF, DOCX, DOC, HTML`));
    }
  },
});

// ── PII patterns ──────────────────────────────────────────────────────────────
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
// Requires + prefix, exactly 10 digits, or (NNN) NNN-NNNN — avoids false matches on dates
const PHONE_RE = /(?:\+\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{2,4}[\s\-]?\d{2,4}[\s\-]?\d{0,4}|\b\d{10}\b|\(\d{3}\)\s*\d{3}[\s\-]\d{4})/g;

const LOGO_STRINGS = ['MITS Staffing', 'Mits Staffing', 'MITS STAFFING', 'MITSStaffing'];

function redactText(text: string): string {
  let t = text;
  t = t.replace(EMAIL_RE, (m) => '[removed]'.padEnd(m.length > 9 ? m.length : 9, ' ').slice(0, m.length > 9 ? m.length : 9));
  t = t.replace(PHONE_RE, (m) => ' '.repeat(m.length));
  for (const s of LOGO_STRINGS) t = t.split(s).join(' '.repeat(s.length));
  return t;
}

// ── PDF sanitiser ─────────────────────────────────────────────────────────────
function patchContentStream(buf: Buffer): Buffer {
  let s = buf.toString('latin1');
  s = s.replace(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g, (_match, inner) => {
    let patched = inner;
    patched = patched.replace(EMAIL_RE, (m: string) => ' '.repeat(m.length));
    patched = patched.replace(PHONE_RE, (m: string) => ' '.repeat(m.length));
    for (const ls of LOGO_STRINGS) patched = patched.split(ls).join(' '.repeat(ls.length));
    if (patched === inner) return _match;
    return `(${patched})`;
  });
  return Buffer.from(s, 'latin1');
}

async function sanitisePdf(inputBytes: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(inputBytes, { ignoreEncryption: true });
  const pages = doc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    // Header strip (10% ≈ 84pt on A4) — removes logo image at top
    const headerH = Math.round(height * 0.10);
    // Footer strip (5%) — removes contact lines at very bottom
    const footerH = Math.round(height * 0.05);
    page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: rgb(1, 1, 1), opacity: 1 });
    page.drawRectangle({ x: 0, y: 0, width, height: footerH, color: rgb(1, 1, 1), opacity: 1 });

    // Patch content streams for text PII
    const node = page.node;
    const contents = node.get(node.context.obj('Contents') as any);
    if (!contents) continue;

    const refs: any[] = (contents as any).constructor?.name === 'PDFArray'
      ? Array.from({ length: (contents as any).size() }, (_, i) => (contents as any).get(i))
      : [contents];

    for (const ref of refs) {
      const stream = doc.context.lookup(ref) as any;
      if (!stream || typeof stream.getContents !== 'function') continue;
      try {
        const raw = Buffer.from(stream.getContents() as Uint8Array);
        const patched = patchContentStream(raw);
        if (!patched.equals(raw)) stream.setContents(patched);
      } catch { /* skip — visual whiteout still applied */ }
    }
  }

  return Buffer.from(await doc.save());
}

// ── DOCX sanitiser — patch XML inside the ZIP ─────────────────────────────────
async function sanitiseDocx(inputBytes: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(inputBytes);

  // Word documents store content in word/document.xml and word/header*.xml etc.
  const xmlFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith('word/') && name.endsWith('.xml')
  );

  for (const fileName of xmlFiles) {
    const content = await zip.files[fileName].async('string');
    // Strip XML tags to get text, redact, restore — actually we need to patch
    // inside XML text nodes only (between > and <), not tag attributes
    const patched = content.replace(/>([^<]*)</g, (_match: string, text: string) => {
      const clean = redactText(text);
      return `>${clean}<`;
    });
    if (patched !== content) {
      zip.file(fileName, patched);
    }
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── HTML / plain text sanitiser ───────────────────────────────────────────────
function sanitiseHtml(inputBytes: Buffer): Buffer {
  let content = inputBytes.toString('utf8');
  // Patch text nodes between HTML tags
  content = content.replace(/>([^<]*)</g, (_match, text) => `>${redactText(text)}<`);
  return Buffer.from(content, 'utf8');
}

function sanitisePlainText(inputBytes: Buffer): Buffer {
  return Buffer.from(redactText(inputBytes.toString('utf8')), 'utf8');
}

// ── Route ─────────────────────────────────────────────────────────────────────
resumeSanitiseRouter.post('/process', upload.single('resume'), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = path.extname(req.file.originalname || '').toLowerCase();
  const mime = (req.file.mimetype || '').split(';')[0].trim().toLowerCase();
  const safeName = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');

  try {
    let outBuffer: Buffer;
    let outMime: string;

    if (ext === '.pdf' || mime === 'application/pdf') {
      outBuffer = await sanitisePdf(req.file.buffer);
      outMime = 'application/pdf';
    } else if (ext === '.docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      outBuffer = await sanitiseDocx(req.file.buffer);
      outMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (ext === '.doc' || mime === 'application/msword') {
      // .doc is binary — we can only do basic text patching same as PDF streams
      outBuffer = Buffer.from(redactText(req.file.buffer.toString('latin1')), 'latin1');
      outMime = 'application/msword';
    } else if (ext === '.html' || ext === '.htm' || mime === 'text/html') {
      outBuffer = sanitiseHtml(req.file.buffer);
      outMime = 'text/html';
    } else {
      outBuffer = sanitisePlainText(req.file.buffer);
      outMime = 'text/plain';
    }

    res.setHeader('Content-Type', outMime);
    res.setHeader('Content-Disposition', `attachment; filename="sanitised-${safeName}"`);
    res.send(outBuffer);
  } catch (e: any) {
    console.error('[resume-sanitise]', e);
    res.status(500).json({ error: 'Failed to process file: ' + (e.message || String(e)) });
  }
});

// Multer error handler
resumeSanitiseRouter.use((err: any, _req: any, res: any, _next: any) => {
  if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
});
