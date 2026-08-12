import { createBattleChatter } from './battleChatter';
import { createGameState } from './gameEngine';

describe('battle chatter', () => {
  it('waits briefly and then draws a random line for one fighter', () => {
    const random = jest.fn().mockReturnValue(0);
    const drawChatter = createBattleChatter(random);
    const fillText = jest.fn();
    const context = {
      beginPath: jest.fn(),
      fill: jest.fn(),
      fillRect: jest.fn(),
      fillText,
      lineTo: jest.fn(),
      measureText: jest.fn((text: string) => ({ width: text.length * 8 })),
      moveTo: jest.fn(),
      restore: jest.fn(),
      save: jest.fn(),
      stroke: jest.fn(),
      strokeRect: jest.fn(),
    } as unknown as CanvasRenderingContext2D;
    const state = createGameState(0, () => 0, {
      playerPortraitIndex: 0,
      eligiblePortraitIndices: [0, 1],
    });
    const lines = [['A policy has occurred.'], ['Grand.']] as const;

    drawChatter(context, state, 0, lines);
    expect(fillText).not.toHaveBeenCalled();

    drawChatter(context, state, 900, lines);
    expect(fillText).toHaveBeenCalledWith(
      'A policy has occurred.',
      expect.any(Number),
      expect.any(Number),
    );
  });
});
