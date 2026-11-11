// What a milestone tile shows (MilestoneTiles). Here in lib so the copy that builds tiles (the
// month recap's milestoneTiles, a later Achievements screen) never imports from components.

export type MilestoneGlyph = 'star' | 'heart' | 'calendar' | 'moon';

export interface MilestoneTile {
  key: string;
  label: string;
  glyph: MilestoneGlyph;
  earned: boolean;
  /** Badge progress for a month on or after the badge start date: "2 of 3 months for Silver". */
  progress?: string;
  /** A level of this family was earned in this month. */
  levelUp?: boolean;
}
