import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { Link, Pencil, Trash2, ExternalLink, Plus } from 'lucide-react';

const PLATFORMS = ['Zoom', 'Google Meet', 'Teams', 'Webex', 'Other'];

interface MeetingLink {
  id: string;
  label: string;
  platform: string;
  url: string;
  owner: { id: string; name: string } | null;
  createdAt: string;
}

function LinkFormDialog({
  existing,
  trigger,
  onClose,
}: {
  existing?: MeetingLink;
  trigger: React.ReactNode;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const blank = { label: '', platform: 'Zoom', url: '' };
  const [f, setF] = useState(existing ? { label: existing.label, platform: existing.platform, url: existing.url } : blank);

  const save = useMutation({
    mutationFn: () =>
      existing
        ? api.patch(`/meeting-links/${existing.id}`, f)
        : api.post('/meeting-links', f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting-links'] });
      showToast(existing ? 'Link updated' : 'Link added');
      setOpen(false);
      if (!existing) setF(blank);
      onClose?.();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={existing ? 'Edit meeting link' : 'Add meeting link'}>
        <div className="space-y-3">
          <div className="form-row">
            <Label>Label *</Label>
            <Input
              placeholder="e.g. Muskan's Zoom room"
              value={f.label}
              onChange={(e) => setF({ ...f, label: e.target.value })}
            />
          </div>
          <div className="form-row">
            <Label>Platform</Label>
            <Select value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
          <div className="form-row">
            <Label>URL *</Label>
            <Input
              placeholder="https://zoom.us/j/..."
              value={f.url}
              onChange={(e) => setF({ ...f, url: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!f.label.trim() || !f.url.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : existing ? 'Save' : 'Add link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MeetingLinksPage() {
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  const { data: links, isLoading } = useQuery<MeetingLink[]>({
    queryKey: ['meeting-links'],
    queryFn: () => api.get('/meeting-links').then((r) => r.data),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/meeting-links/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meeting-links'] }); showToast('Deleted'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const canEdit = (link: MeetingLink) =>
    link.owner?.id === user.id || ['founder', 'manager'].includes(user.role);

  const PLATFORM_COLORS: Record<string, string> = {
    'Zoom': '#2D8CFF',
    'Google Meet': '#00897B',
    'Teams': '#6264A7',
    'Webex': '#00BCEB',
    'Other': 'var(--brand-textMuted)',
  };

  return (
    <>
      <Topbar
        title="Meeting Links"
        subtitle={`${(links || []).length} link${(links || []).length !== 1 ? 's' : ''} saved`}
        actions={
          <LinkFormDialog
            trigger={
              <Button variant="primary"><Plus size={14} className="mr-1" /> Add link</Button>
            }
          />
        }
      />
      <Page>
        <div className="callout">
          Store your Zoom / Google Meet / Teams links here. Pick from this list when scheduling a session.
        </div>

        {isLoading ? (
          <div className="muted text-[13px] py-12 text-center">Loading…</div>
        ) : !links?.length ? (
          <div className="muted text-[13px] py-12 text-center">No meeting links yet. Add your first one above.</div>
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Platform</th>
                  <th>URL</th>
                  <th>Owner</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr key={link.id}>
                    <td className="font-medium text-[13px]">{link.label}</td>
                    <td>
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: `color-mix(in srgb, ${PLATFORM_COLORS[link.platform] || 'grey'} 12%, transparent)`,
                          color: PLATFORM_COLORS[link.platform] || 'var(--brand-textMuted)',
                        }}
                      >
                        {link.platform}
                      </span>
                    </td>
                    <td>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[12px] hover:underline flex items-center gap-1 max-w-xs truncate"
                        style={{ color: 'var(--accent-gold)' }}
                      >
                        <Link size={10} />
                        {link.url.replace(/^https?:\/\//, '').slice(0, 48)}
                        <ExternalLink size={9} />
                      </a>
                    </td>
                    <td className="text-[12px] muted">{link.owner?.name || '—'}</td>
                    <td>
                      {canEdit(link) && (
                        <div className="flex items-center gap-1">
                          <LinkFormDialog
                            existing={link}
                            trigger={<button className="p-1 rounded hover:bg-white/5"><Pencil size={12} /></button>}
                          />
                          <button
                            className="p-1 rounded hover:bg-white/5"
                            style={{ color: 'var(--status-red)' }}
                            onClick={() => {
                              if (confirm(`Delete "${link.label}"?`)) remove.mutate(link.id);
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Page>
    </>
  );
}
