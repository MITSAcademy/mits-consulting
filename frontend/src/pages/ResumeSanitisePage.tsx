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
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      showToast('Only PDF files are supported', 'error');
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
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      const downloadName = `sanitised-${f.name}`;
      setResult({ originalName: f.name, blobUrl, downloadName });
      setStatus('done');
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Processing failed';
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

  return (
    <Page>
      <Topbar
        title="Resume Sanitiser"
        subtitle="Remove emails, phone numbers, and MITS Staffing header from candidate PDFs"
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
            'Whites out the top header area (18%) — removes MITS Staffing logo image on every page',
            'Returns a clean PDF ready to share with clients',
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
                Drop a PDF resume here
              </div>
              <div style={{ fontSize: 13, color: 'var(--brand-textMuted)' }}>
                or click to browse · PDF only · max 20MB
              </div>
            </div>
            <input ref={inputRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={onFileChange} />
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

            {/* PDF preview */}
            <div style={{ background: '#555', padding: 0 }}>
              <iframe
                src={result.blobUrl}
                title="Sanitised PDF preview"
                style={{ width: '100%', height: 480, border: 'none', display: 'block' }}
              />
            </div>

            {/* Actions */}
            <div style={{ padding: '14px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button onClick={reset}>
                <Trash2 size={13} /> Process another
              </Button>
              <a href={result.blobUrl} download={result.downloadName} style={{ textDecoration: 'none' }}>
                <Button variant="primary">
                  <Download size={13} /> Download sanitised PDF
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
            <strong style={{ color: 'var(--brand-textSecondary)' }}>Note:</strong> This tool works best on standard text-based PDFs. Scanned image PDFs (where the content is a photo) cannot have text removed — only the header area will be whited out. Always preview before sharing.
          </div>
        </div>
      </div>
    </Page>
  );
}
