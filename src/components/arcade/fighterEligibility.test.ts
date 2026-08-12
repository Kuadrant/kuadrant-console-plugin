import { getFighterAvailability } from './fighterEligibility';
import { FighterPortrait } from './fighterRoster';

describe('fighter eligibility', () => {
  it('allows Jason only before noon in the browser local time', async () => {
    const morning = await getFighterAvailability(new Date(2026, 0, 1, 11, 59));
    const afternoon = await getFighterAvailability(new Date(2026, 0, 1, 12, 0));

    expect(morning[FighterPortrait.Jason].isAvailable).toBe(true);
    expect(afternoon[FighterPortrait.Jason]).toEqual({
      portraitIndex: FighterPortrait.Jason,
      isAvailable: false,
      lockReason: 'after-lunch',
    });
  });

  it('keeps Anton available at all times', async () => {
    const afternoon = await getFighterAvailability(new Date(2026, 0, 1, 16, 0));

    expect(afternoon[FighterPortrait.Anton]).toEqual({
      portraitIndex: FighterPortrait.Anton,
      isAvailable: true,
    });
  });
});
