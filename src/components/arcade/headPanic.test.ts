import { createGameState } from './gameEngine';
import { createHeadPanic } from './headPanic';

describe('fighter head panic', () => {
  it('runs short random bursts with bounded quake motion', () => {
    const getHeadPanic = createHeadPanic(() => 0);
    const fighter = createGameState(0, () => 0).player;

    expect(getHeadPanic(fighter, 1599).isActive).toBe(false);

    const panic = getHeadPanic(fighter, 3199);
    expect(panic.isActive).toBe(true);
    expect(Math.abs(panic.offsetX)).toBeLessThanOrEqual(7);
    expect(Math.abs(panic.offsetY)).toBeLessThanOrEqual(3);
    expect(Math.abs(panic.rotation)).toBeLessThanOrEqual(0.1);
    expect(panic.scaleX + panic.scaleY).toBeCloseTo(2);

    expect(getHeadPanic(fighter, 3950).isActive).toBe(false);
  });

  it('does not panic after a knockout', () => {
    const getHeadPanic = createHeadPanic(() => 0);
    const fighter = createGameState(0, () => 0).player;
    fighter.action = 'ko';

    expect(getHeadPanic(fighter, 10_000).isActive).toBe(false);
  });
});
