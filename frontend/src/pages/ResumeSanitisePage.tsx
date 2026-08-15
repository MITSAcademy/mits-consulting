import { useState, useRef, useCallback } from 'react';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { api } from '@/lib/api';
import { Upload, FileText, Download, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

type Status = 'idle' | 'processing' | 'done' | 'error';

interface Result {
  originalName: string;
  blobUrl: string;
  downloadName: string;
  mimeType: string;
}

const ACCEPTED = '.pdf,.doc,.docx,.html,.htm';
const ACCEPTED_LABEL = 'PDF, DOCX, DOC, HTML';

function mimeForExt(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'doc') return 'application/msword';
  if (ext === 'html' || ext === 'htm') return 'text/html';
  return 'application/octet-stream';
}

export function ResumeSanitisePage() {
  const { showToast } = useUI();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const reset = () => {
    if (result?.blobUrl) URL.revokeObjectURL(result.blobUrl);
    setFile(null);
    setResult(null);
    setStatus('idle');
    setErrorMsg('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const process = useCallback(async (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    const supported = ['pdf', 'doc', 'docx', 'html', 'htm'];
    if (!supported.includes(ext)) {
      showToast(`Unsupported file type .${ext}. Supported: ${ACCEPTED_LABEL}`, 'error');
      return;
    }
    setFile(f);
    setStatus('processing');
    setResult(null);
    setErrorMsg('');

    try {
      const form = new FormData();
      form.append('resume', f);
      const response = await api.post('/resume-sanitise/process', form, {
        responseType: 'blob',
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const mime = mimeForExt(f.name);
      const blob = new Blob([response.data], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const downloadName = `sanitised-${f.name}`;
      setResult({ originalName: f.name, blobUrl, downloadName, mimeType: mime });
      setStatus('done');
    } catch (e: any) {
      let msg = e?.message || 'Processing failed';
      if (e?.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text();
          const parsed = JSON.parse(text);
          msg = parsed.error || msg;
        } catch { /* keep original */ }
      } else {
        msg = e?.response?.data?.error || msg;
      }
      setErrorMsg(msg);
      setStatus('error');
      showToast(msg, 'error');
    }
  }, [showToast]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) process(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) process(f);
  };

  const isPdf = result?.mimeType === 'application/pdf';

  return (
    <Page>
      <Topbar
        title="Resume Sanitiser"
        subtitle="Remove emails, phone numbers, and MITS Staffing header from resumes"
      />

      <div style={{ maxWidth: 640, margin: '32px auto', padding: '0 24px' }}>

        {/* What it does */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--brand-borderSoft)',
          borderRadius: 10, padding: '16px 20px', marginBottom: 28,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--brand-textMuted)', marginBottom: 4 }}>What this tool does</div>
          {[
            'Removes all email addresses from the resume',
            'Removes all phone numbers from the resume',
            'Whites out the top header area — removes MITS Staffing logo on every page (PDF)',
            `Returns the sanitised file in the same format as uploaded (${ACCEPTED_LABEL})`,
          ].map((item) => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--brand-textSecondary)' }}>
              <CheckCircle size={13} style={{ color: 'var(--status-green)', flexShrink: 0 }} />
              {item}
            </div>
          ))}
        </div>

        {/* Drop zone */}
        {status === 'idle' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--brand-primary)' : 'var(--brand-borderSoft)'}`,
              borderRadius: 12,
              padding: '48px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? 'rgba(var(--brand-primary-rgb, 99,102,241),0.05)' : 'var(--bg-card)',
              transition: 'all 200ms',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            }}
          >
            <Upload size={32} style={{ color: 'var(--brand-textMuted)', opacity: 0.6 }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--brand-text)', marginBottom: 4 }}>
                Drop a resume here
              </div>
              <div style={{ fontSize: 13, color: 'var(--brand-textMuted)' }}>
                or click to browse · {ACCEPTED_LABEL} · max 20MB
              </div>
            </div>
            <input ref={inputRef} type="file" accept={ACCEPTED} style={{ display: 'none' }} onChange={onFileChange} />
          </div>
        )}

        {/* Processing */}
        {status === 'processing' && (
          <div style={{
            border: '1px solid var(--brand-borderSoft)', borderRadius: 12, padding: '40px 24px',
            textAlign: 'center', background: 'var(--bg-card)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
          }}>
            <Loader2 size={32} style={{ color: 'var(--brand-primary)', animation: 'spin 1s linear infinite' }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-text)' }}>Processing…</div>
              <div style={{ fontSize: 12, color: 'var(--brand-textMuted)', marginTop: 4 }}>{file?.name}</div>
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Done */}
        {status === 'done' && result && (
          <div style={{
            border: '1px solid var(--brand-borderSoft)', borderRadius: 12, overflow: 'hidden',
            background: 'var(--bg-card)',
          }}>
            {/* Success banner */}
            <div style={{
              background: 'rgba(34,197,94,0.08)', borderBottom: '1px solid rgba(34,197,94,0.2)',
              padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <CheckCircle size={16} style={{ color: 'var(--status-green)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-text)' }}>Sanitised successfully</div>
                <div style={{ fontSize: 11, color: 'var(--brand-textMuted)', marginTop: 1 }}>{result.originalName}</div>
              </div>
            </div>

            {/* PDF preview — only for PDFs */}
            {isPdf && (
              <div style={{ background: '#555', padding: 0 }}>
                <iframe
                  src={result.blobUrl}
                  title="Sanitised PDF preview"
                  style={{ width: '100%', height: 480, border: 'none', display: 'block' }}
                />
              </div>
            )}

            {/* Non-PDF — just show a file icon */}
            {!isPdf && (
              <div style={{
                padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                borderBottom: '1px solid var(--brand-borderSoft)',
              }}>
                <FileText size={40} style={{ color: 'var(--brand-textMuted)', opacity: 0.5 }} />
                <div style={{ fontSize: 13, color: 'var(--brand-textMuted)' }}>Preview not available for this format — download to review</div>
              </div>
            )}

            {/* Actions */}
            <div style={{ padding: '14px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button onClick={reset}>
                <Trash2 size={13} /> Process another
              </Button>
              <a href={result.blobUrl} download={result.downloadName} style={{ textDecoration: 'none' }}>
                <Button variant="primary">
                  <Download size={13} /> Download sanitised file
                </Button>
              </a>
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div style={{
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '24px 20px',
            background: 'rgba(239,68,68,0.05)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
          }}>
            <AlertCircle size={28} style={{ color: 'var(--status-red)' }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-text)' }}>Processing failed</div>
              <div style={{ fontSize: 12, color: 'var(--brand-textMuted)', marginTop: 4 }}>{errorMsg}</div>
            </div>
            <Button onClick={reset}>Try again</Button>
          </div>
        )}

        {/* Note */}
        <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--brand-borderSoft)' }}>
          <div style={{ fontSize: 11, color: 'var(--brand-textMuted)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--brand-textSecondary)' }}>Note:</strong> For PDFs, both text and the header area are sanitised. For DOCX/DOC, text content is sanitised; images are not removed. Scanned image PDFs (where content is a photo) — only the header area will be whited out. Always review before sharing.
          </div>
        </div>
      </div>
    </Page>
  );
}
