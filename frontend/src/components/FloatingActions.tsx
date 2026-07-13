import { useState } from 'react';
import { Bug, Gamepad2, X, Plus } from 'lucide-react';

export function FloatingActions() {
  const [open, setOpen] = useState(false);

  const actions = [
    {
      label: 'Report a bug',
      icon: Bug,
      color: '#F59E0B',
      onClick: () => {
        setOpen(false);
        window.dispatchEvent(new CustomEvent('mits:open-bug-report'));
      },
    },
    {
      label: 'Play a game',
      icon: Gamepad2,
      color: '#E5B24C',
      onClick: () => {
        setOpen(false);
        setTimeout(() => window.dispatchEvent(new CustomEvent('mits:open-idle-game')), 50);
      },
    },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        right: 20,
        zIndex: 400,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
      }}
    >
      {/* Action items */}
      {actions.map((a, i) => (
        <div
          key={a.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            opacity: open ? 1 : 0,
            transform: open ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.85)',
            transition: `opacity 200ms ${open ? i * 60 : (actions.length - i - 1) * 40}ms ease, transform 220ms ${open ? i * 60 : (actions.length - i - 1) * 40}ms cubic-bezier(0.2,0.9,0.25,1)`,
            pointerEvents: open ? 'auto' : 'none',
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--brand-text)',
              background: 'var(--bg-card)',
              border: '1px solid var(--brand-border)',
              borderRadius: 8,
              padding: '4px 10px',
              whiteSpace: 'nowrap',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {a.label}
          </span>
          <button
            onClick={a.onClick}
            title={a.label}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--bg-card)',
              border: `1px solid ${a.color}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: `0 4px 16px rgba(0,0,0,0.2), 0 0 0 1px ${a.color}22`,
              flexShrink: 0,
            }}
          >
            <a.icon size={16} style={{ color: a.color }} />
          </button>
        </div>
      ))}

      {/* Main FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? 'Close' : 'Quick actions'}
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: open
            ? 'var(--bg-card)'
            : 'linear-gradient(135deg, var(--accent-gold), var(--accent-goldDeep))',
          border: '1px solid var(--brand-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: open
            ? 'var(--shadow-md)'
            : 'var(--shadow-gold), 0 2px 8px rgba(0,0,0,0.2)',
          transition: 'all 220ms cubic-bezier(0.2,0.9,0.25,1)',
        }}
      >
        <div style={{ transition: 'transform 220ms cubic-bezier(0.2,0.9,0.25,1)', transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}>
          {open
            ? <X size={18} style={{ color: 'var(--brand-text)' }} />
            : <Plus size={20} style={{ color: '#0F1115' }} />
          }
        </div>
      </button>
    </div>
  );
}
