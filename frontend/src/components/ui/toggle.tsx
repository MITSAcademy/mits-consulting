interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

/** iOS-style sliding toggle. Matches the original .switch/.slider CSS from source.html. */
export function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-block',
        width: 42,
        height: 24,
        flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background: checked
            ? 'linear-gradient(135deg, #4ADE80, #22C55E)'
            : 'var(--brand-border, #2A2F3A)',
          borderRadius: 24,
          transition: 'background 200ms ease',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.20)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            content: '""',
            height: 18,
            width: 18,
            left: 3,
            bottom: 3,
            background: 'white',
            borderRadius: '50%',
            transition: 'transform 200ms cubic-bezier(0.2,0.9,0.25,1)',
            transform: checked ? 'translateX(18px)' : 'none',
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          }}
        />
      </span>
    </label>
  );
}
