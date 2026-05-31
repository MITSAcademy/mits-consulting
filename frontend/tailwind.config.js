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
          borderSoft: '#2A2D33',
          text:           'var(--brand-text)',
          textSecondary:  'var(--brand-textSecondary)',
          textMuted:      'var(--brand-textMuted)',
          // Accent colours stay static — work on both themes.
          green: '#4ADE80',
          amber: '#F59E0B',
          blue: '#3B82F6',
          red: '#EF4444',
          purple: '#A78BFA',
          pink: '#EC4899',
          teal: '#14B8A6',
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
