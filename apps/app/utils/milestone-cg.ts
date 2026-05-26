export const MILESTONE_OVERLAYS = {
  anniversary: { accent: '#D8A24A', label: 'Anniversary', path: 'overlays/anniversary' },
  confession: { accent: '#B65C3A', label: 'Confession', path: 'overlays/confession' },
  first_date: { accent: '#6D7FA8', label: 'First Date', path: 'overlays/first_date' },
  repair: { accent: '#1E6B52', label: 'Repair', path: 'overlays/repair' },
} as const;

export type MilestoneOverlayKey = keyof typeof MILESTONE_OVERLAYS;

export function milestoneOverlay(template?: string | null) {
  if (!template || !(template in MILESTONE_OVERLAYS)) {
    return null;
  }
  return MILESTONE_OVERLAYS[template as MilestoneOverlayKey];
}
