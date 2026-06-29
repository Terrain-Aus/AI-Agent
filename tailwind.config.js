/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Construction-fintech dark palette — "Binance meets civil".
        ink: {
          900: '#070A0C', // app background
          800: '#0A0D0F',
          700: '#11161A', // base surface
          600: '#161C21', // raised card
          500: '#1C242B', // elevated / inputs
          400: '#28323B', // borders
          300: '#3A4651',
        },
        sage: {
          // Muted green accent system.
          DEFAULT: '#6FA86F',
          50: '#EAF3EA',
          400: '#8FCB8F',
          500: '#6FA86F',
          600: '#588757',
          700: '#436843',
        },
        amber: {
          DEFAULT: '#E8B339',
          soft: '#3a2f14',
        },
        danger: '#E5544E',
        info: '#5BA4CF',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.02) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(111,168,111,0.4), 0 0 24px -6px rgba(111,168,111,0.45)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%,100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.25s ease-out both',
        'pulse-dot': 'pulse-dot 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
