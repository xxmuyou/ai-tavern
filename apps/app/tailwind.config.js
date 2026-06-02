/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand-new editorial palette (warm, relational).
        // Kept under the `app` namespace so old `bg-app-bg` classes still
        // resolve to the new `canvas` for one release.
        app: {
          // Core surfaces
          canvas: '#FAF6F0',        // page background — warm cream
          surface: '#FFFFFF',       // elevated card surface
          sunken: '#F2EBE0',        // recessed surface
          line: '#E8DCC8',          // hairline / border
          lineSoft: '#F0E7D6',      // softer hairline

          // Ink (text)
          ink: '#2A1F1A',           // primary text
          'ink-soft': '#4A3B33',    // secondary text
          muted: '#7A6A5E',         // tertiary / hint text
          'muted-soft': '#A89A8B',  // very subtle text

          // Brand (forest — preserved from old design as a calmer base accent)
          brand: '#1E6B52',
          'brand-soft': '#DCEFE8',
          'brand-deep': '#14493A',

          // Rose — the warm primary of v2
          rose: '#C9486B',
          'rose-soft': '#FBE6EC',
          'rose-deep': '#9A2F4F',

          // Wine — accent / prose highlights
          wine: '#7C2D4A',
          'wine-soft': '#EFD9E2',

          // Ember — energy / CTA highlight
          ember: '#D97757',
          'ember-soft': '#FCE3D6',

          // Status
          success: '#1E8E5C',
          warning: '#C87918',
          'warning-soft': '#FCEFD8',
          danger: '#B42318',
          'danger-soft': '#FBE2E0',
          info: '#3B6EA5',
          'info-soft': '#DCE7F2',

          // Day / night gradients (used by chat overlay)
          twilight: '#0E0B14',
          'twilight-soft': '#1A1320',

          inverse: '#FAF6F0',

          // Legacy aliases — mapped so older callers still compile.
          bg: '#FAF6F0',
          card: '#FFFFFF',
          text: '#2A1F1A',
          primary: '#1E6B52',
          primarySoft: '#DCEFE8',
          accent: '#D97757',
        },
      },
      fontFamily: {
        serif: ['Lora', ...defaultTheme.fontFamily.serif],
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        mono: ['"JetBrains Mono"', ...defaultTheme.fontFamily.mono],
      },
      fontSize: {
        'display-2xl': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '600' }],
        'display-xl': ['3.75rem', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '600' }],
        'display-lg': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.015em', fontWeight: '600' }],
        'display-md': ['2.5rem', { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '600' }],
        'display-sm': ['2rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' }],
        'title': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.005em', fontWeight: '600' }],
        'title-sm': ['1.25rem', { lineHeight: '1.35', letterSpacing: '0', fontWeight: '600' }],
        'body-lg': ['1.125rem', { lineHeight: '1.6', fontWeight: '400' }],
        'body': ['1rem', { lineHeight: '1.55', fontWeight: '400' }],
        'body-sm': ['0.9375rem', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['0.8125rem', { lineHeight: '1.4', fontWeight: '500' }],
        'overline': ['0.6875rem', { lineHeight: '1.2', letterSpacing: '0.14em', fontWeight: '600' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(42, 31, 26, 0.04), 0 4px 16px rgba(42, 31, 26, 0.04)',
        'card-lg': '0 2px 4px rgba(42, 31, 26, 0.04), 0 12px 32px rgba(42, 31, 26, 0.08)',
        float: '0 4px 8px rgba(42, 31, 26, 0.06), 0 20px 48px rgba(42, 31, 26, 0.10)',
        glow: '0 0 0 4px rgba(201, 72, 107, 0.16)',
        'glow-soft': '0 0 0 3px rgba(201, 72, 107, 0.10)',
        'inner-soft': 'inset 0 1px 2px rgba(42, 31, 26, 0.05)',
        'inner-line': 'inset 0 0 0 1px rgba(232, 220, 200, 0.6)',
        ring: '0 0 0 1px rgba(42, 31, 26, 0.06)',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      backgroundImage: {
        'gradient-twilight': 'linear-gradient(180deg, #0E0B14 0%, #1A1320 100%)',
        'gradient-canvas': 'linear-gradient(180deg, #FAF6F0 0%, #F2EBE0 100%)',
        'gradient-warm': 'linear-gradient(135deg, #FBE6EC 0%, #FCE3D6 100%)',
        'gradient-glow': 'radial-gradient(ellipse at top, rgba(201, 72, 107, 0.10) 0%, transparent 60%)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'pulse-soft': { '0%, 100%': { opacity: '0.6' }, '50%': { opacity: '1' } },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'fade-up': 'fade-up 0.5s ease-out',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite',
      },
      transitionTimingFunction: {
        'editorial': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
};
