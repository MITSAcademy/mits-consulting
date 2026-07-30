import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/input';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Brain, Plus, Pin, PinOff, Search, Tag, Trash2, Edit3, X, BookOpen,
  Lightbulb, FileText, Users, Zap, ChevronRight, Clock, Eye, EyeOff,
  CheckCircle, AlertCircle, MessageCircle, Send, BookMarked,
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrainNote {
  id: string;
  title: string;
  content: string;
  category: NoteCategory;
  tags: string[];
  visibleTo: string[];
  isPinned: boolean;
  authorId: string;
  author: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

type NoteCategory = 'general' | 'decision' | 'sop' | 'meeting' | 'strategy';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { value: NoteCategory; label: string; icon: typeof BookOpen; color: string }[] = [
  { value: 'general',  label: 'General',   icon: FileText,   color: '#94a3b8' },
  { value: 'decision', label: 'Decision',  icon: CheckCircle, color: '#f59e0b' },
  { value: 'sop',      label: 'SOP',       icon: BookOpen,   color: '#6366f1' },
  { value: 'meeting',  label: 'Meeting',   icon: Users,      color: '#10b981' },
  { value: 'strategy', label: 'Strategy',  icon: Zap,        color: '#ec4899' },
];

const ALL_ROLES = [
  { value: 'manager',           label: 'Mitali (Manager)' },
  { value: 'lead',              label: 'Bhavneet (Lead)' },
  { value: 'account_manager',   label: 'Account Managers' },
  { value: 'demo_lead',         label: 'Samita (Demo Lead)' },
  { value: 'demo_intake',       label: 'Demo Intake' },
  { value: 'recruiter',         label: 'Recruiters' },
  { value: 'sales_closer',      label: 'Sales (Roshni)' },
  { value: 'accounts',          label: 'Accounts' },
  { value: 'payment_processor', label: 'Payment Processor' },
];

function catMeta(cat: NoteCategory) {
  return CATEGORIES.find((c) => c.value === cat) || CATEGORIES[0];
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

// ── Rich Text Editor ──────────────────────────────────────────────────────────

function RichEditor({
  content,
  onChange,
  editable,
  placeholder,
}: {
  content: string;
  onChange?: (html: string) => void;
  editable: boolean;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder || 'Start writing…' }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  });

  // sync content when switching notes
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  // sync editable mode
  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editable, editor]);

  if (!editor) return null;

  return (
    <div className="rich-editor-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1 }}>
      {editable && (
        <div
          className="toolbar"
          style={{
            display: 'flex', flexWrap: 'wrap', gap: 2, padding: '6px 8px',
            background: 'var(--bg-input)',
            border: '1px solid var(--brand-borderSoft)',
            borderBottom: 'none',
            borderRadius: '8px 8px 0 0',
          }}
        >
          {[
            { label: 'B', title: 'Bold', action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold') },
            { label: 'I', title: 'Italic', action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic') },
            { label: 'U', title: 'Underline', action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline') },
            { label: 'S', title: 'Strike', action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive('strike') },
          ].map((btn) => (
            <button
              key={btn.title}
              title={btn.title}
              onMouseDown={(e) => { e.preventDefault(); btn.action(); }}
              style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: btn.active ? 'var(--accent-gold)' : 'transparent',
                color: btn.active ? '#0F1115' : 'var(--brand-textSecondary)',
                border: '1px solid ' + (btn.active ? 'var(--accent-gold)' : 'var(--brand-borderSoft)'),
              }}
            >
              {btn.label}
            </button>
          ))}
          <div style={{ width: 1, background: 'var(--brand-borderSoft)', margin: '0 4px' }} />
          {[
            { label: 'H1', action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive('heading', { level: 1 }) },
            { label: 'H2', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }) },
            { label: 'H3', action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: editor.isActive('heading', { level: 3 }) },
          ].map((btn) => (
            <button
              key={btn.label}
              onMouseDown={(e) => { e.preventDefault(); btn.action(); }}
              style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: btn.active ? 'rgba(229,178,76,0.15)' : 'transparent',
                color: btn.active ? 'var(--accent-gold)' : 'var(--brand-textSecondary)',
                border: '1px solid ' + (btn.active ? 'rgba(229,178,76,0.3)' : 'var(--brand-borderSoft)'),
              }}
            >
              {btn.label}
            </button>
          ))}
          <div style={{ width: 1, background: 'var(--brand-borderSoft)', margin: '0 4px' }} />
          {[
            { label: '• List', action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList') },
            { label: '1. List', action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList') },
            { label: '❝ Quote', action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive('blockquote') },
            { label: '</> Code', action: () => editor.chain().focus().toggleCodeBlock().run(), active: editor.isActive('codeBlock') },
          ].map((btn) => (
            <button
              key={btn.label}
              onMouseDown={(e) => { e.preventDefault(); btn.action(); }}
              style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                background: btn.active ? 'rgba(229,178,76,0.15)' : 'transparent',
                color: btn.active ? 'var(--accent-gold)' : 'var(--brand-textSecondary)',
                border: '1px solid ' + (btn.active ? 'rgba(229,178,76,0.3)' : 'var(--brand-borderSoft)'),
              }}
            >
              {btn.label}
            </button>
          ))}
          <div style={{ width: 1, background: 'var(--brand-borderSoft)', margin: '0 4px' }} />
          <button
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setHorizontalRule().run(); }}
            title="Divider"
            style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              background: 'transparent', color: 'var(--brand-textSecondary)',
              border: '1px solid var(--brand-borderSoft)',
            }}
          >
            ─ HR
          </button>
        </div>
      )}
      <div
        style={{
          flex: 1, overflow: 'auto',
          border: '1px solid var(--brand-borderSoft)',
          borderRadius: editable ? '0 0 8px 8px' : '8px',
          background: editable ? 'var(--bg-card)' : 'transparent',
        }}
      >
        <EditorContent
          editor={editor}
          style={{ padding: '16px 20px', minHeight: editable ? 300 : undefined }}
        />
      </div>
      <style>{`
        .tiptap { outline: none; font-size: 14px; line-height: 1.7; color: var(--brand-text); }
        .tiptap h1 { font-size: 22px; font-weight: 700; margin: 16px 0 8px; color: var(--brand-text); }
        .tiptap h2 { font-size: 18px; font-weight: 600; margin: 14px 0 6px; color: var(--brand-text); }
        .tiptap h3 { font-size: 15px; font-weight: 600; margin: 12px 0 4px; color: var(--brand-text); }
        .tiptap p { margin: 0 0 8px; }
        .tiptap ul, .tiptap ol { padding-left: 20px; margin: 0 0 8px; }
        .tiptap li { margin-bottom: 2px; }
        .tiptap blockquote { border-left: 3px solid var(--accent-gold); padding-left: 12px; margin: 8px 0; color: var(--brand-textSecondary); font-style: italic; }
        .tiptap pre { background: rgba(0,0,0,0.25); border-radius: 6px; padding: 12px; font-size: 12px; overflow-x: auto; margin: 8px 0; }
        .tiptap code { background: rgba(0,0,0,0.2); border-radius: 3px; padding: 1px 4px; font-size: 12px; }
        .tiptap hr { border: none; border-top: 1px solid var(--brand-borderSoft); margin: 16px 0; }
        .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; color: var(--brand-textMuted); pointer-events: none; height: 0; }
        .tiptap a { color: var(--accent-gold); text-decoration: underline; }
      `}</style>
    </div>
  );
}

// ── Note card (list view) ─────────────────────────────────────────────────────

function NoteCard({
  note,
  selected,
  onClick,
}: {
  note: BrainNote;
  selected: boolean;
  onClick: () => void;
}) {
  const meta = catMeta(note.category);
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left',
        padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
        background: selected ? 'rgba(229,178,76,0.08)' : 'transparent',
        border: `1px solid ${selected ? 'rgba(229,178,76,0.35)' : 'var(--brand-borderSoft)'}`,
        transition: 'all 150ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon size={12} style={{ color: meta.color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {note.title}
        </span>
        {note.isPinned && <Pin size={10} style={{ color: 'var(--accent-gold)', flexShrink: 0 }} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: meta.color, background: meta.color + '18', padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>
          {meta.label}
        </span>
        {note.tags.slice(0, 2).map((t) => (
          <span key={t} style={{ fontSize: 10, color: 'var(--brand-textMuted)', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 10 }}>
            #{t}
          </span>
        ))}
        <span style={{ fontSize: 10, color: 'var(--brand-textMuted)', marginLeft: 'auto' }}>{relativeTime(note.updatedAt)}</span>
      </div>
      {note.visibleTo.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--brand-textMuted)' }}>
          <EyeOff size={9} /> Private
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--brand-textMuted)' }}>
          <Eye size={9} /> {note.visibleTo.length === ALL_ROLES.length ? 'All team' : `${note.visibleTo.length} role${note.visibleTo.length > 1 ? 's' : ''}`}
        </div>
      )}
    </button>
  );
}

// ── Decisions strip (pinned decisions shown at top) ───────────────────────────

function DecisionsStrip({ notes, onSelect }: { notes: BrainNote[]; onSelect: (n: BrainNote) => void }) {
  const decisions = notes.filter((n) => n.category === 'decision' && n.isPinned);
  if (!decisions.length) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Lightbulb size={14} style={{ color: '#f59e0b' }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f59e0b' }}>
          Pinned Decisions
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {decisions.map((n) => (
          <button
            key={n.id}
            onClick={() => onSelect(n)}
            style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.2)',
              transition: 'background 150ms',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-text)', marginBottom: 4 }}>{n.title}</div>
            <div style={{ fontSize: 10, color: 'var(--brand-textMuted)' }}>{relativeTime(n.updatedAt)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Edit / Create dialog ──────────────────────────────────────────────────────

function NoteEditDialog({
  note,
  onClose,
  onSaved,
}: {
  note: Partial<BrainNote> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useUI();
  const qc = useQueryClient();
  const isNew = !note?.id;

  const [title, setTitle] = useState(note?.title || '');
  const [category, setCategory] = useState<NoteCategory>(note?.category || 'general');
  const [tags, setTags] = useState((note?.tags || []).join(', '));
  const [visibleTo, setVisibleTo] = useState<string[]>(note?.visibleTo || []);
  const [isPinned, setIsPinned] = useState(note?.isPinned || false);
  const [content, setContent] = useState(note?.content || '');

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(),
        content,
        category,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        visibleTo,
        isPinned,
      };
      return isNew
        ? api.post('/brain-notes', payload)
        : api.patch(`/brain-notes/${note!.id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brain-notes'] });
      showToast(isNew ? 'Note created' : 'Note saved');
      onSaved();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const toggleRole = (role: string) => {
    setVisibleTo((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]);
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        title={isNew ? 'New note' : 'Edit note'}
        description="Only you (Vaibhav) can create and edit notes."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Title */}
          <div className="form-row">
            <Label>Title *</Label>
            <input
              className="input w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title"
              autoFocus
            />
          </div>

          {/* Category + Pin */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <Label>Category</Label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    style={{
                      padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: category === c.value ? c.color + '25' : 'transparent',
                      color: category === c.value ? c.color : 'var(--brand-textMuted)',
                      border: `1px solid ${category === c.value ? c.color + '60' : 'var(--brand-borderSoft)'}`,
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPinned((p) => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                background: isPinned ? 'rgba(229,178,76,0.12)' : 'transparent',
                color: isPinned ? 'var(--accent-gold)' : 'var(--brand-textMuted)',
                border: `1px solid ${isPinned ? 'rgba(229,178,76,0.35)' : 'var(--brand-borderSoft)'}`,
                fontSize: 12, fontWeight: 600,
              }}
            >
              {isPinned ? <Pin size={12} /> : <PinOff size={12} />}
              {isPinned ? 'Pinned' : 'Pin'}
            </button>
          </div>

          {/* Tags */}
          <div className="form-row">
            <Label>Tags (comma-separated)</Label>
            <input
              className="input w-full"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. ops, hiring, q3"
            />
          </div>

          {/* Visibility */}
          <div className="form-row">
            <Label>Visible to (leave empty for private/founder only)</Label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <button
                type="button"
                onClick={() => setVisibleTo(visibleTo.length === ALL_ROLES.length ? [] : ALL_ROLES.map((r) => r.value))}
                style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer', fontWeight: 600,
                  background: visibleTo.length === ALL_ROLES.length ? 'rgba(16,185,129,0.15)' : 'transparent',
                  color: visibleTo.length === ALL_ROLES.length ? '#10b981' : 'var(--brand-textMuted)',
                  border: `1px solid ${visibleTo.length === ALL_ROLES.length ? 'rgba(16,185,129,0.35)' : 'var(--brand-borderSoft)'}`,
                }}
              >
                All team
              </button>
              {ALL_ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => toggleRole(r.value)}
                  style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                    background: visibleTo.includes(r.value) ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: visibleTo.includes(r.value) ? '#818cf8' : 'var(--brand-textMuted)',
                    border: `1px solid ${visibleTo.includes(r.value) ? 'rgba(99,102,241,0.35)' : 'var(--brand-borderSoft)'}`,
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="form-row" style={{ marginBottom: 0 }}>
            <Label>Content</Label>
            <div style={{ marginTop: 6, minHeight: 250, display: 'flex', flexDirection: 'column' }}>
              <RichEditor
                content={content}
                onChange={setContent}
                editable
                placeholder="Write your note here…"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!title.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : isNew ? 'Create note' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Ask (AI chat) tab ─────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function AskTab() {
  const { showToast } = useUI();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const r = await api.post('/brain-notes/ask', { message: text, history });
      setMessages([...next, { role: 'assistant', content: r.data.answer }]);
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Something went wrong';
      if (e?.response?.data?.code === 'NO_AI_PROVIDER') {
        showToast('AI not configured — ask Vaibhav to set ANTHROPIC_API_KEY in Render', 'error');
      } else {
        showToast(msg, 'error');
      }
      setMessages(next); // leave user message, remove loading state
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--brand-textMuted)' }}>
            <MessageCircle size={40} style={{ opacity: 0.25 }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-textSecondary)' }}>Ask anything</p>
            <p style={{ fontSize: 12, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
              I know Vaibhav&apos;s notes, portal SOPs, and live data. Try asking about processes, decisions, or live counts.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
              {[
                "What are Vaibhav's pinned decisions?",
                "Explain Roshni's SaleClosing steps",
                'How many clients are in active stage?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 50); }}
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                    background: 'rgba(229,178,76,0.06)',
                    color: 'var(--brand-textSecondary)',
                    border: '1px solid rgba(229,178,76,0.2)',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
              gap: 10, alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: m.role === 'user' ? 'var(--accent-gold)' : 'rgba(99,102,241,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                color: m.role === 'user' ? '#0F1115' : '#818cf8',
              }}
            >
              {m.role === 'user' ? 'Y' : 'AI'}
            </div>
            <div
              style={{
                maxWidth: '75%',
                padding: '10px 14px',
                borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: m.role === 'user'
                  ? 'rgba(229,178,76,0.1)'
                  : 'var(--bg-card)',
                border: '1px solid ' + (m.role === 'user' ? 'rgba(229,178,76,0.25)' : 'var(--brand-borderSoft)'),
                fontSize: 13,
                lineHeight: 1.65,
                color: 'var(--brand-text)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#818cf8' }}>AI</div>
            <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'var(--bg-card)', border: '1px solid var(--brand-borderSoft)', display: 'flex', gap: 5, alignItems: 'center' }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-textMuted)',
                    animation: 'brain-dot-bounce 1.2s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--brand-borderSoft)',
          background: 'var(--bg-card)',
          display: 'flex', gap: 10, alignItems: 'flex-end',
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
          rows={1}
          style={{
            flex: 1, resize: 'none', padding: '10px 14px', borderRadius: 10,
            background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)',
            color: 'var(--brand-text)', fontSize: 13, lineHeight: 1.5,
            outline: 'none', fontFamily: 'inherit',
            maxHeight: 140, overflowY: 'auto',
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          style={{
            width: 38, height: 38, borderRadius: 10, border: 'none', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            background: input.trim() && !loading ? 'var(--accent-gold)' : 'rgba(229,178,76,0.15)',
            color: input.trim() && !loading ? '#0F1115' : 'var(--brand-textMuted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 150ms',
            flexShrink: 0,
          }}
        >
          <Send size={15} />
        </button>
      </div>

      <style>{`
        @keyframes brain-dot-bounce {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
          40% { transform: scale(1.2); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SecondBrainPage() {
  const user = useAuth((s) => s.user);
  const { showToast } = useUI();
  const qc = useQueryClient();
  const isFounder = user?.role === 'founder';

  const [activeTab, setActiveTab] = useState<'notes' | 'ask'>('notes');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<NoteCategory | 'all'>('all');
  const [filterTag, setFilterTag] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState<Partial<BrainNote> | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const params: any = {};
  if (search) params.search = search;
  if (filterCat !== 'all') params.category = filterCat;
  if (filterTag) params.tag = filterTag;

  const { data: notes = [], isLoading } = useQuery<BrainNote[]>({
    queryKey: ['brain-notes', params],
    queryFn: () => api.get('/brain-notes', { params }).then((r) => r.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/brain-notes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brain-notes'] });
      setSelectedId(null);
      setShowDeleteConfirm(false);
      showToast('Note deleted');
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const pinMut = useMutation({
    mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) =>
      api.patch(`/brain-notes/${id}`, { isPinned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brain-notes'] }),
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const seedMut = useMutation({
    mutationFn: () => api.post('/brain-notes/seed-defaults'),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['brain-notes'] });
      showToast(`Knowledge base populated — ${r.data.created} notes added!`);
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Seed failed', 'error'),
  });

  const selected = notes.find((n) => n.id === selectedId) || null;

  // auto-select first on load
  useEffect(() => {
    if (!selectedId && notes.length > 0) setSelectedId(notes[0].id);
  }, [notes.length]);

  // keyboard shortcut: / to focus search, N to new note
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.contentEditable === 'true') return;
      if (e.key === '/' && !e.metaKey) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'n' && !e.metaKey && isFounder) setEditNote({});
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFounder]);

  // All unique tags across notes
  const allTags = [...new Set(notes.flatMap((n) => n.tags))].sort();

  return (
    <Page>
      <Topbar
        title="Second Brain"
        subtitle={isFounder ? 'Your private knowledge base — share what matters with the team' : "Vaibhav's shared knowledge base"}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Tab switcher */}
            <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: 8, padding: 2, border: '1px solid var(--brand-borderSoft)' }}>
              {([
                { key: 'notes', label: 'Knowledge Base', icon: BookMarked },
                { key: 'ask',   label: 'Ask',            icon: MessageCircle },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: activeTab === key ? 'var(--bg-card)' : 'transparent',
                    color: activeTab === key ? 'var(--brand-text)' : 'var(--brand-textMuted)',
                    boxShadow: activeTab === key ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                    transition: 'all 150ms',
                  }}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
            {isFounder && activeTab === 'notes' && (
              <Button variant="primary" onClick={() => setEditNote({})}>
                <Plus size={14} /> New note
              </Button>
            )}
          </div>
        }
      />

      {activeTab === 'ask' && (
        <div style={{ height: 'calc(100vh - 130px)', display: 'flex', flexDirection: 'column' }}>
          <AskTab />
        </div>
      )}

      {activeTab === 'notes' && <>
      {/* Decisions strip */}
      {notes.some((n) => n.category === 'decision' && n.isPinned) && (
        <div style={{ padding: '0 24px 0', marginBottom: 0 }}>
          <DecisionsStrip notes={notes} onSelect={(n) => setSelectedId(n.id)} />
        </div>
      )}

      <div style={{ display: 'flex', height: 'calc(100vh - 130px)', minHeight: 400 }}>
        {/* ── Left panel: list ── */}
        <div
          style={{
            width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0,
            borderRight: '1px solid var(--brand-borderSoft)',
            background: 'var(--bg-card)',
          }}
        >
          {/* Search + filters */}
          <div style={{ padding: '12px 12px 8px', display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '1px solid var(--brand-borderSoft)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--brand-textMuted)', pointerEvents: 'none' }} />
              <input
                ref={searchRef}
                className="input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search… (press /)"
                style={{ paddingLeft: 28, fontSize: 12, width: '100%' }}
              />
            </div>

            {/* Category filter pills */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button
                onClick={() => setFilterCat('all')}
                style={{
                  padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  background: filterCat === 'all' ? 'var(--accent-gold)' : 'transparent',
                  color: filterCat === 'all' ? '#0F1115' : 'var(--brand-textMuted)',
                  border: `1px solid ${filterCat === 'all' ? 'var(--accent-gold)' : 'var(--brand-borderSoft)'}`,
                }}
              >
                All
              </button>
              {CATEGORIES.map((c) => {
                const active = filterCat === c.value;
                return (
                  <button
                    key={c.value}
                    onClick={() => setFilterCat(active ? 'all' : c.value)}
                    style={{
                      padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                      background: active ? c.color + '20' : 'transparent',
                      color: active ? c.color : 'var(--brand-textMuted)',
                      border: `1px solid ${active ? c.color + '50' : 'var(--brand-borderSoft)'}`,
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            {/* Tag filter */}
            {allTags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterTag(filterTag === t ? '' : t)}
                    style={{
                      padding: '1px 7px', borderRadius: 20, fontSize: 10, cursor: 'pointer',
                      background: filterTag === t ? 'rgba(148,163,184,0.15)' : 'transparent',
                      color: filterTag === t ? 'var(--brand-text)' : 'var(--brand-textMuted)',
                      border: `1px solid ${filterTag === t ? 'rgba(148,163,184,0.4)' : 'var(--brand-borderSoft)'}`,
                    }}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Note list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {isLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--brand-textMuted)', fontSize: 12 }}>Loading…</div>
            ) : notes.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <span style={{ color: 'var(--brand-textMuted)' }}>
                  {isFounder ? 'No notes yet.' : 'No notes shared with you yet.'}
                </span>
                {isFounder && (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: 12 }}
                    disabled={seedMut.isPending}
                    onClick={() => seedMut.mutate()}
                  >
                    {seedMut.isPending ? 'Populating…' : '✨ Populate with MITS knowledge base'}
                  </button>
                )}
              </div>
            ) : (
              notes.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  selected={n.id === selectedId}
                  onClick={() => setSelectedId(n.id)}
                />
              ))
            )}
          </div>

          {/* Bottom stat */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--brand-borderSoft)', fontSize: 10, color: 'var(--brand-textMuted)' }}>
            {notes.length} note{notes.length !== 1 ? 's' : ''}
            {isFounder && <span> · Press <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '0 4px', borderRadius: 3, fontSize: 9 }}>N</kbd> to create</span>}
          </div>
        </div>

        {/* ── Right panel: note detail ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-page)' }}>
          {selected ? (
            <>
              {/* Note header */}
              <div
                style={{
                  padding: '16px 24px 14px',
                  borderBottom: '1px solid var(--brand-borderSoft)',
                  background: 'var(--bg-card)',
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    {(() => { const m = catMeta(selected.category); return (
                      <span style={{ fontSize: 10, fontWeight: 700, color: m.color, background: m.color + '18', padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {m.label}
                      </span>
                    ); })()}
                    {selected.isPinned && (
                      <span style={{ fontSize: 10, color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Pin size={10} /> Pinned
                      </span>
                    )}
                    {selected.visibleTo.length === 0 ? (
                      <span style={{ fontSize: 10, color: 'var(--brand-textMuted)', display: 'flex', alignItems: 'center', gap: 3 }}><EyeOff size={9} /> Private</span>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--brand-textMuted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Eye size={9} />
                        {selected.visibleTo.length === ALL_ROLES.length
                          ? 'Visible to all team'
                          : `${ALL_ROLES.filter((r) => selected.visibleTo.includes(r.value)).map((r) => r.label).join(', ')}`}
                      </span>
                    )}
                    {selected.tags.map((t) => (
                      <span key={t} style={{ fontSize: 10, color: 'var(--brand-textMuted)', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 10 }}>#{t}</span>
                    ))}
                  </div>
                  <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand-text)', margin: 0, lineHeight: 1.3 }}>{selected.title}</h1>
                  <div style={{ fontSize: 11, color: 'var(--brand-textMuted)', marginTop: 6, display: 'flex', gap: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={10} /> Updated {relativeTime(selected.updatedAt)}</span>
                    <span>by {selected.author.name}</span>
                  </div>
                </div>

                {/* Action buttons (founder only) */}
                {isFounder && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      title={selected.isPinned ? 'Unpin' : 'Pin'}
                      onClick={() => pinMut.mutate({ id: selected.id, isPinned: !selected.isPinned })}
                      style={{
                        padding: '6px 8px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center',
                        background: selected.isPinned ? 'rgba(229,178,76,0.12)' : 'transparent',
                        color: selected.isPinned ? 'var(--accent-gold)' : 'var(--brand-textMuted)',
                        border: '1px solid var(--brand-borderSoft)',
                      }}
                    >
                      {selected.isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                    </button>
                    <button
                      title="Edit"
                      onClick={() => setEditNote(selected)}
                      style={{ padding: '6px 8px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: 'var(--brand-textSecondary)', border: '1px solid var(--brand-borderSoft)', fontSize: 12 }}
                    >
                      <Edit3 size={13} /> Edit
                    </button>
                    <button
                      title="Delete"
                      onClick={() => setShowDeleteConfirm(true)}
                      style={{ padding: '6px 8px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', background: 'transparent', color: 'var(--status-red)', border: '1px solid rgba(239,68,68,0.25)' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>

              {/* Note content */}
              <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
                {selected.content ? (
                  <RichEditor content={selected.content} onChange={undefined} editable={false} />
                ) : (
                  <p style={{ color: 'var(--brand-textMuted)', fontSize: 13, fontStyle: 'italic' }}>No content yet.</p>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--brand-textMuted)' }}>
              <Brain size={40} style={{ opacity: 0.3 }} />
              <p style={{ fontSize: 13 }}>Select a note to read it</p>
              {isFounder && notes.length === 0 && (
                <Button variant="primary" disabled={seedMut.isPending} onClick={() => seedMut.mutate()}>
                  {seedMut.isPending ? 'Populating…' : '✨ Populate with MITS knowledge base'}
                </Button>
              )}
              {isFounder && (
                <Button onClick={() => setEditNote({})}>
                  <Plus size={14} /> Create note
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      </>}

      {/* Edit / Create dialog */}
      {editNote !== null && (
        <NoteEditDialog
          note={editNote}
          onClose={() => setEditNote(null)}
          onSaved={() => setEditNote(null)}
        />
      )}

      {/* Delete confirm dialog */}
      {showDeleteConfirm && selected && (
        <Dialog open onOpenChange={(v) => { if (!v) setShowDeleteConfirm(false); }}>
          <DialogContent title="Delete note?" description={`"${selected.title}" will be permanently deleted.`}>
            <DialogFooter>
              <Button onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button
                variant="danger"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate(selected.id)}
              >
                {deleteMut.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Page>
  );
}
