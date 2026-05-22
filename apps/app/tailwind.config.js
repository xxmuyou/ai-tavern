/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#F7F8FA',
          card: '#FFFFFF',
          line: '#D8DEE6',
          text: '#11181C',
          muted: '#687076',
          primary: '#1E6B52',
          primarySoft: '#DCEFE8',
          accent: '#B65C3A',
          danger: '#B42318',
          warning: '#C87918',
          inverse: '#F8FAFC',
        },
      },
    },
  },
};
