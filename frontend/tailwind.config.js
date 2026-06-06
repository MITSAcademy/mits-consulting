/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        // Surface tokens reference CSS vars so [data-theme="light"] swaps them.
        bg: {
          page:      'var(--bg-page)',
          sidebar:   'var(--bg-sidebar)',
          card:      'var(--bg-card)',
          cardHover: '#2D2F36',
          input:     'var(--bg-input)',
        },
        brand: {
          border:     'var(--brand-border)',
          borderSoft: 'var(--brand-borderSoft)',
          text:           'var(--brand-text)',
          textSecondary:  'var(--brand-textSecondary)',
          textMuted:      'var(--brand-textMuted)',
          // Status accents pull from CSS vars so light/dark mode can soften
          // them for cream-paper contrast vs deep-charcoal contrast.
          green:  'var(--status-green)',
          amber:  'var(--status-amber)',
          blue:   'var(--status-blue)',
          red:    'var(--status-red)',
          purple: 'var(--status-purple)',
          teal:   'var(--status-teal)',
          pink:   '#EC4899',
          // Academy brand accent — saved for marquee CTAs / branded surfaces
          gold:     'var(--accent-gold)',
          goldDeep: 'var(--accent-goldDeep)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: { lg: '10px', md: '8px', sm: '6px' },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
