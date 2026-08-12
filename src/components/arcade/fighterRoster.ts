export const FighterPortrait = {
  Jason: 0,
  Grettel: 1,
  Anton: 2,
  Emma: 3,
  Rachel: 4,
} as const;

export type FighterPortraitIndex = typeof FighterPortrait[keyof typeof FighterPortrait];

export const ALL_FIGHTER_PORTRAITS: readonly FighterPortraitIndex[] = [
  FighterPortrait.Jason,
  FighterPortrait.Grettel,
  FighterPortrait.Anton,
  FighterPortrait.Emma,
  FighterPortrait.Rachel,
];
