/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Nocturne palette — dark "night venue" theme (digital succubus).
        // Same `app.*` token names re-pointed to dark values so existing
        // callers go dark automatically.
        // Semantic rule: `-soft` = dark tinted container bg, `-deep` = light
        // text/emphasis on that container (inverted vs the old light theme).
        app: {
          // Core surfaces
          canvas: '#0B0710',        // page background — deep purple-black
          surface: '#15101D',       // elevated card surface
          sunken: '#070409',        // recessed surface / input wells
          line: '#2C2138',          // hairline / border
          lineSoft: '#1E1628',      // softer hairline
          'line-soft': '#1E1628',   // alias — some callers use the kebab name

          // Ink (text)
          ink: '#F5EDF3',           // primary text — warm white
          'ink-soft': '#C9B8CF',    // secondary text
          muted: '#9A89A6',         // tertiary / hint text
          'muted-soft': '#6E5F7B',  // very subtle text (decorative only)

          // Brand — ambiguous purple (secondary accent)
          brand: '#A66BFA',
          'brand-soft': '#2A1B3F',
          'brand-deep': '#CDA9F7',

          // Rose — the neon primary
          rose: '#FF4D7E',
          'rose-soft': '#3A1424',
          'rose-deep': '#FF8FAD',

          // Wine — accent / prose highlights
          wine: '#D9587E',
          'wine-soft': '#381726',

          // Ember — candlelight / energy highlight
          ember: '#FF9D5C',
          'ember-soft': '#3A2316',

          // Status
          success: '#3EDC97',
          'success-soft': '#0E2E20',
          warning: '#FFC163',
          'warning-soft': '#3A2B12',
          danger: '#FF6B6B',
          'danger-soft': '#3A1518',
          info: '#6FA8FF',
          'info-soft': '#16243C',

          // Day / night gradients (used by chat overlay)
          twilight: '#0E0B14',
          'twilight-soft': '#1A1320',

          inverse: '#F5EDF3',

          // Legacy aliases — mapped so older callers still compile.
          bg: '#0B0710',
          card: '#15101D',
          text: '#F5EDF3',
          primary: '#FF4D7E',
          primarySoft: '#3A1424',
          accent: '#FF9D5C',
        },
      },
      fontFamily: {
        serif: ['Fraunces', ...defaultTheme.fontFamily.serif],
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
        card: '0 1px 2px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.35)',
        'card-lg': '0 2px 4px rgba(0, 0, 0, 0.4), 0 12px 32px rgba(0, 0, 0, 0.45)',
        float: '0 4px 8px rgba(0, 0, 0, 0.45), 0 20px 48px rgba(0, 0, 0, 0.55)',
        glow: '0 0 24px rgba(255, 77, 126, 0.35)',
        'glow-soft': '0 0 18px rgba(166, 107, 250, 0.25)',
        'inner-soft': 'inset 0 1px 2px rgba(0, 0, 0, 0.35)',
        'inner-line': 'inset 0 0 0 1px rgba(44, 33, 56, 0.7)',
        ring: '0 0 0 1px rgba(245, 237, 243, 0.08)',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      backgroundImage: {
        'gradient-twilight': 'linear-gradient(180deg, #0E0B14 0%, #1A1320 100%)',
        'gradient-canvas': 'linear-gradient(180deg, #0B0710 0%, #120A1A 100%)',
        'gradient-warm': 'linear-gradient(135deg, #3A1424 0%, #3A2316 100%)',
        'gradient-glow': 'radial-gradient(ellipse at top, rgba(255, 77, 126, 0.18) 0%, transparent 60%)',
        'gradient-hero': 'linear-gradient(135deg, #1A0F22 0%, #2C1024 55%, #3A1424 100%)',
        'gradient-card-fade': 'linear-gradient(180deg, transparent 0%, rgba(5, 2, 8, 0.92) 100%)',
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
