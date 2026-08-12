import { ALL_FIGHTER_PORTRAITS, FighterPortrait, FighterPortraitIndex } from './fighterRoster';

export type FighterLockReason = 'after-lunch';

export interface FighterAvailability {
  portraitIndex: FighterPortraitIndex;
  isAvailable: boolean;
  lockReason?: FighterLockReason;
}

export const getFighterAvailability = async (now = new Date()): Promise<FighterAvailability[]> =>
  ALL_FIGHTER_PORTRAITS.map((portraitIndex) => {
    if (portraitIndex === FighterPortrait.Jason && now.getHours() >= 12) {
      return { portraitIndex, isAvailable: false, lockReason: 'after-lunch' };
    }
    return { portraitIndex, isAvailable: true };
  });
