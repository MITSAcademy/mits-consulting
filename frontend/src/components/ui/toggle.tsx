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
          background: checked ? '#4ADE80' : '#3a3b3f',
          borderRadius: 24,
          transition: '0.2s',
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
            transition: '0.2s',
            transform: checked ? 'translateX(18px)' : 'none',
          }}
        />
      </span>
    </label>
  );
}
