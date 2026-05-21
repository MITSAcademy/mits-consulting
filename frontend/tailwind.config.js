/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        bg: {
          page: '#1A1B1E',
          sidebar: '#141518',
          card: '#26282E',
          cardHover: '#2D2F36',
          input: '#1E2024',
        },
        brand: {
          border: '#33363D',
          borderSoft: '#2A2D33',
          text: '#E8E8EA',
          textSecondary: '#9CA0A8',
          textMuted: '#6B6F78',
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
