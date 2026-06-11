/**
 * Nocturne palette — JS mirror of the `app.*` tokens in tailwind.config.js.
 *
 * Use these for props that cannot take a className (Ionicons `color`,
 * ActivityIndicator `color`, inline styles, chart colors…). Keep the values
 * in lockstep with tailwind.config.js — changing the theme means editing
 * both files and nothing else.
 */
export const PALETTE = {
  // Core surfaces
  canvas: '#0B0710',
  surface: '#15101D',
  sunken: '#070409',
  line: '#2C2138',
  lineSoft: '#1E1628',

  // Ink (text)
  ink: '#F5EDF3',
  inkSoft: '#C9B8CF',
  muted: '#9A89A6',
  mutedSoft: '#6E5F7B',

  // Brand — ambiguous purple
  brand: '#A66BFA',
  brandSoft: '#2A1B3F',
  brandDeep: '#CDA9F7',

  // Rose — the neon primary
  rose: '#FF4D7E',
  roseSoft: '#3A1424',
  roseDeep: '#FF8FAD',

  // Wine
  wine: '#D9587E',
  wineSoft: '#381726',

  // Ember — candlelight
  ember: '#FF9D5C',
  emberSoft: '#3A2316',

  // Status
  success: '#3EDC97',
  successSoft: '#0E2E20',
  warning: '#FFC163',
  warningSoft: '#3A2B12',
  danger: '#FF6B6B',
  dangerSoft: '#3A1518',
  info: '#6FA8FF',
  infoSoft: '#16243C',

  // Misc
  twilight: '#0E0B14',
  twilightSoft: '#1A1320',
  inverse: '#F5EDF3',
  white: '#FFFFFF',
} as const;

export type PaletteColor = keyof typeof PALETTE;
