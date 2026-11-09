export const PANELS = ['needs', 'sessions', 'jobs', 'goals'] as const;
export type PanelId = (typeof PANELS)[number];

export const PANEL_TITLES: Record<PanelId, string> = {
  needs: 'Needs you',
  sessions: 'Sessions',
  jobs: 'Jobs',
  goals: 'Goals / Next',
};
