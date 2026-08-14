/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        os: {
          bg: '#07111C',
          card: '#0D1A27',
          card2: '#132232',
          border: '#1E3347',
          text: '#E2E8F0',
          muted: '#94A3B8',
        },
        accent: '#F97316',
        ok: '#22C55E',
        warn: '#F59E0B',
        danger: '#EF4444',
        info: '#60A5FA',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        os: '14px',
        'os-lg': '20px',
      },
      boxShadow: {
        os: '0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.25)',
        'os-accent': '0 4px 16px rgba(249,115,22,.35)',
      },
    },
  },
  plugins: [],
}
