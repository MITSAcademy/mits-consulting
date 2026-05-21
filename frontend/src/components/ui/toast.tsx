import { useUI } from '@/store/ui';

export function Toaster() {
  const toast = useUI((s) => s.toast);
  if (!toast) return null;
  const bg = toast.kind === 'error' ? '#EF4444' : '#4ADE80';
  return (
    <div
      className="fixed bottom-5 right-5 z-[300] px-4 py-2.5 rounded-lg font-medium text-sm shadow-lg"
      style={{ background: bg, color: '#1A1B1E' }}
    >
      {toast.message}
    </div>
  );
}
