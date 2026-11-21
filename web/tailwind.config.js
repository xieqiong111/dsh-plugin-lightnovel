/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        'surface-soft': 'var(--surface-soft)',
        line: 'var(--line)',
        track: 'var(--track)',
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          line: 'var(--accent-line)',
        },
        positive: {
          DEFAULT: 'var(--positive)',
          soft: 'var(--positive-soft)',
          line: 'var(--positive-line)',
        },
        caution: {
          DEFAULT: 'var(--caution)',
          soft: 'var(--caution-soft)',
          line: 'var(--caution-line)',
        },
        negative: {
          DEFAULT: 'var(--negative)',
          soft: 'var(--negative-soft)',
          line: 'var(--negative-line)',
        },
        info: { DEFAULT: 'var(--info)', soft: 'var(--info-soft)' },
        ink: {
          DEFAULT: 'var(--ink)',
          soft: 'var(--ink-soft)',
          muted: 'var(--ink-muted)',
        },
        violet: {
          50: '#F5F2FF',
          100: '#EDE9FE',
          200: '#DCD4FC',
          300: '#C4B5FB',
          400: '#A78BFA',
          500: '#8B63F2',
          600: '#7E5EE9',
          700: '#6C4AD9',
          800: '#5738B8',
          900: '#3F2A8C',
        },
        sidebar: {
          from: '#181935',
          to: '#262352',
        },
        success: '#10B981',
        warn: '#F59E0B',
        rose: '#F472B6',
      },
      fontFamily: {
        sans: [
          'InterVariable',
          'Inter',
          '-apple-system',
          'Segoe UI',
          'PingFang SC',
          'Noto Sans SC',
          'Noto Sans CJK SC',
          'Microsoft YaHei',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        lift: '0 18px 40px -18px rgba(78,54,168,0.28)',
        nav: '0 10px 24px -8px rgba(114,79,232,0.55)',
        hero: '0 24px 60px -32px rgba(109,78,224,0.55)',
      },
      borderRadius: {
        xl2: '18px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(-10px) scale(.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.22,.85,.3,1) both',
        'fade-in': 'fade-in .3s ease both',
        'toast-in': 'toast-in .35s cubic-bezier(.22,.85,.3,1) both',
        float: 'float 7s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
}
