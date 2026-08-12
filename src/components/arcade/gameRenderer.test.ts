import { createGameState } from './gameEngine';

describe('arcade game renderer', () => {
  it('draws the two portraits selected for the round', async () => {
    const imageInstances: Array<{ complete: boolean; naturalWidth: number; src: string }> = [];
    const originalImage = global.Image;

    class LoadedImage {
      complete = true;
      naturalWidth = 128;
      src = '';

      constructor() {
        imageInstances.push(this);
      }
    }

    Object.defineProperty(global, 'Image', { configurable: true, value: LoadedImage });

    try {
      const { drawGame } = await import('./gameRenderer');
      const gradient = { addColorStop: jest.fn() };
      const drawImage = jest.fn();
      const context = {
        arc: jest.fn(),
        beginPath: jest.fn(),
        createLinearGradient: jest.fn(() => gradient),
        drawImage,
        ellipse: jest.fn(),
        fill: jest.fn(),
        fillRect: jest.fn(),
        fillText: jest.fn(),
        lineTo: jest.fn(),
        moveTo: jest.fn(),
        restore: jest.fn(),
        rotate: jest.fn(),
        save: jest.fn(),
        scale: jest.fn(),
        stroke: jest.fn(),
        strokeRect: jest.fn(),
        translate: jest.fn(),
      } as unknown as CanvasRenderingContext2D;
      const random = jest.fn().mockReturnValueOnce(0.8).mockReturnValueOnce(0);
      const state = createGameState(0, random);

      drawGame(context, state, 0, {
        title: 'Kuadrant Clash',
        playerName: 'Gatekeeper',
        cpuName: 'Limit Breaker',
        timeUp: 'Time!',
        knockout: 'K.O.!',
        playerWins: 'Gatekeeper wins',
        cpuWins: 'Limit Breaker wins',
        draw: 'Draw game',
        rematch: 'Press R for a rematch',
      });

      expect(imageInstances).toHaveLength(5);
      expect(drawImage).toHaveBeenNthCalledWith(1, imageInstances[4], -40, -176, 80, 80);
      expect(drawImage).toHaveBeenNthCalledWith(2, imageInstances[0], -40, -176, 80, 80);
    } finally {
      Object.defineProperty(global, 'Image', { configurable: true, value: originalImage });
    }
  });
});
