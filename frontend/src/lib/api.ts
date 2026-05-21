import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: API_BASE + '/api',
  withCredentials: true,
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      // Don't auto-redirect on login page; let the page handle it
    }
    return Promise.reject(err);
  },
);

/** Upload a single File via multipart/form-data. Returns the served URL. */
export async function uploadFile(file: File): Promise<{ url: string; filename: string; originalName: string; size: number; mime: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await api.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  return r.data;
}

/**
 * Resolve a relative `/uploads/...` path to a full URL the browser can fetch.
 *
 * In dev (no VITE_API_URL set), we hit the backend at :4000 directly because
 * Vite's SPA history fallback was intercepting /uploads/* requests and returning
 * index.html instead of the binary. Going direct is simpler and avoids the issue.
 * The backend's CORS already allows :5173 origin, and /uploads is unauthed static.
 */
export function fileUrl(path?: string | null) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  if (API_BASE) return API_BASE + path;
  // Dev fallback — backend on :4000
  return 'http://localhost:4000' + path;
}
