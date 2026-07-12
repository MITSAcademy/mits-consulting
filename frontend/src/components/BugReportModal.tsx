import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useUI } from '@/store/ui';
import { X, Bug, Camera, Loader2 } from 'lucide-react';

async function captureScreenshot(): Promise<string | null> {
  try {
    // Use native Screen Capture API — works on all modern browsers, no CORS issues
    const stream = await (navigator.mediaDevices as any).getDisplayMedia({
      video: { displaySurface: 'browser' },
      preferCurrentTab: true,
    });
    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * 0.5);
    canvas.height = Math.round(video.videoHeight * 0.5);
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    return canvas.toDataURL('image/png');
  } catch {
    // User denied permission or browser unsupported — fall back to html2canvas
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(document.body, {
        scale: 0.5, useCORS: true, logging: false,
        ignoreElements: (el) => el.classList.contains('bug-report-modal'),
      });
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }
}

export function BugReportModal() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const showToast = useUI((s) => s.showToast);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('mits:open-bug-report', handler);
    return () => window.removeEventListener('mits:open-bug-report', handler);
  }, []);

  async function takeScreenshot() {
    setCapturing(true);
    const shot = await captureScreenshot();
    setScreenshot(shot);
    setCapturing(false);
  }

  const submit = useMutation({
    mutationFn: () => api.post('/bug-reports', {
      description,
      url: window.location.pathname,
      screenshot,
    }),
    onSuccess: () => {
      showToast('Bug reported — thank you! We\'ll look into it.', 'success');
      setOpen(false);
      setDescription('');
      setScreenshot(null);
    },
    onError: () => showToast('Failed to submit bug report', 'error'),
  });

  if (!open) return null;

  return (
    <div
      className="bug-report-modal"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 180ms ease both',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        style={{
          width: '100%', maxWidth: 500,
          background: 'var(--bg-card)',
          border: '1px solid var(--brand-border)',
          borderRadius: 16,
          padding: '24px',
          boxShadow: 'var(--shadow-lg)',
          animation: 'fadeUp 220ms cubic-bezier(0.2,0.9,0.25,1) both',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bug size={18} style={{ color: 'var(--status-amber)' }} />
            <span className="font-bold text-[15px]">Report a bug</span>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-bg-cardHover transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="mb-1 text-[11px] muted">What went wrong? Be as specific as possible.</div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. When I click 'Log session' on client Priya, the page goes blank and nothing saves..."
          autoFocus
          rows={5}
          style={{
            width: '100%', background: 'var(--bg-input)', border: '1px solid var(--brand-border)',
            borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--brand-text)',
            resize: 'vertical', outline: 'none', fontFamily: 'inherit',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--accent-gold)'; }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--brand-border)'; }}
        />

        {/* Screenshot */}
        <div className="mt-3 mb-4">
          {capturing ? (
            <div className="flex items-center gap-2 text-[11px] muted">
              <Loader2 size={12} className="animate-spin" /> Capturing — select this tab in the picker...
            </div>
          ) : screenshot ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--status-green)' }}>
                  <Camera size={11} /> Screenshot attached
                </span>
                <button onClick={() => setScreenshot(null)} className="text-[10px] muted hover:text-red-400 transition-colors">Remove</button>
              </div>
              <img src={screenshot} alt="Screenshot" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--brand-borderSoft)', maxHeight: 120, objectFit: 'cover', objectPosition: 'top' }} />
            </div>
          ) : (
            <button
              onClick={takeScreenshot}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg transition-colors"
              style={{ border: '1px dashed var(--brand-border)', color: 'var(--brand-textMuted)', background: 'var(--bg-input)', width: '100%', justifyContent: 'center' }}
            >
              <Camera size={12} /> Attach screenshot (optional)
            </button>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={() => setOpen(false)} className="btn btn-sm">Cancel</button>
          <button
            onClick={() => submit.mutate()}
            disabled={!description.trim() || submit.isPending}
            className="btn btn-amber btn-sm flex items-center gap-1.5"
          >
            {submit.isPending ? <Loader2 size={12} className="animate-spin" /> : <Bug size={12} />}
            {submit.isPending ? 'Submitting...' : 'Submit bug report'}
          </button>
        </div>

        <div className="mt-3 text-[10px] muted text-center">
          Your name, role, and current page URL are included automatically.
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  );
}
