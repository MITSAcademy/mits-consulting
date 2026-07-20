import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { requireAuth, AuthedRequest } from '../lib/auth';

export const uploadsRouter = Router();

// ── Cloudinary (persistent storage) — used when CLOUDINARY_URL env var is set.
// Falls back to local disk when not configured (dev / no-cloud env).
const CLOUDINARY_URL = process.env.CLOUDINARY_URL;

let cloudinary: any = null;
if (CLOUDINARY_URL) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { v2 } = require('cloudinary');
  v2.config({ cloudinary_url: CLOUDINARY_URL });
  cloudinary = v2;
}

// ── Local disk fallback ──────────────────────────────────────────────────────
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  // audio
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm',
  'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/x-aac',
  // WhatsApp / mobile voice notes commonly arrive as one of these
  'audio/opus', 'application/ogg', 'audio/3gpp', 'audio/amr',
  // images
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
  // skill matrix docs
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel',                                          // xls
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/msword',                                                       // doc
]);

const ALLOWED_EXT = new Set([
  '.mp3', '.mp4', '.m4a', '.ogg', '.opus', '.wav', '.webm', '.aac', '.amr', '.3gp',
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.pdf', '.xlsx', '.xls', '.csv', '.docx', '.doc',
]);

// Always buffer to memory so we can re-upload to Cloudinary without a temp file path issue
const storage = cloudinary ? multer.memoryStorage() : multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const id = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${id}${ext.toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const baseMime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
    if (ALLOWED_MIME.has(baseMime)) return cb(null, true);
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ALLOWED_EXT.has(ext)) return cb(null, true);
    return cb(new Error(`Unsupported file type: ${file.mimetype || 'unknown'} (.${ext.replace('.', '') || '?'})`));
  },
});

uploadsRouter.use(requireAuth);

uploadsRouter.post('/', upload.single('file'), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    if (cloudinary && req.file.buffer) {
      // Upload buffer to Cloudinary
      const ext = path.extname(req.file.originalname || '').toLowerCase().replace('.', '');
      const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
      const isPdf   = ext === 'pdf';
      const resourceType = isImage ? 'image' : isPdf ? 'image' : 'raw';

      const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'mits-consulting',
            resource_type: resourceType,
            use_filename: false,
            unique_filename: true,
          },
          (err: any, res: any) => err ? reject(err) : resolve(res),
        );
        stream.end(req.file!.buffer);
      });

      return res.status(201).json({
        url: result.secure_url,
        filename: result.public_id,
        originalName: req.file.originalname,
        size: req.file.size,
        mime: req.file.mimetype,
      });
    }

    // Disk fallback
    const url = `/uploads/${req.file.filename}`;
    return res.status(201).json({
      url,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mime: req.file.mimetype,
    });
  } catch (e: any) {
    return res.status(500).json({ error: 'Upload failed: ' + (e.message || String(e)) });
  }
});

// Friendly error handler for multer
uploadsRouter.use((err: any, _req: any, res: any, _next: any) => {
  if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
});

export { UPLOAD_DIR };
