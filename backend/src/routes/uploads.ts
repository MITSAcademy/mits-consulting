import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { requireAuth, AuthedRequest } from '../lib/auth';

export const uploadsRouter = Router();

// Local disk storage. For prod, swap with S3 / Cloudinary multer-s3 adapter.
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

// File extensions to allow as a fallback when the browser sends a generic
// mimetype (e.g. application/octet-stream for some WhatsApp .ogg/.opus exports).
const ALLOWED_EXT = new Set([
  '.mp3', '.mp4', '.m4a', '.ogg', '.opus', '.wav', '.webm', '.aac', '.amr', '.3gp',
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.pdf', '.xlsx', '.xls', '.csv', '.docx', '.doc',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const id = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${id}${ext.toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — WhatsApp voice notes can be long
  fileFilter: (_req, file, cb) => {
    // Strip MIME parameters: "audio/ogg; codecs=opus" → "audio/ogg"
    const baseMime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
    if (ALLOWED_MIME.has(baseMime)) return cb(null, true);
    // Generic browser-sent MIME on mobile uploads → fall back to file extension
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ALLOWED_EXT.has(ext)) return cb(null, true);
    return cb(new Error(`Unsupported file type: ${file.mimetype || 'unknown'} (.${ext.replace('.', '') || '?'})`));
  },
});

uploadsRouter.use(requireAuth);

uploadsRouter.post('/', upload.single('file'), (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.status(201).json({
    url,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mime: req.file.mimetype,
  });
});

// Friendly error handler for multer
uploadsRouter.use((err: any, _req: any, res: any, _next: any) => {
  if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
});

export { UPLOAD_DIR };
