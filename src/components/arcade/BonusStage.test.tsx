import * as React from 'react';
import { render, waitFor } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('./gameRenderer', () => ({
  drawGame: jest.fn(),
}));

import { drawGame } from './gameRenderer';
import BonusStage from './BonusStage';

describe('BonusStage', () => {
  const mockDrawGame = drawGame as jest.MockedFunction<typeof drawGame>;
  let animationFrameCount: number;

  beforeEach(() => {
    animationFrameCount = 0;
    mockDrawGame.mockClear();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ imageSmoothingEnabled: true } as CanvasRenderingContext2D);
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrameCount += 1;
      if (animationFrameCount === 1) callback(1000);
      return animationFrameCount;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts rendering after PatternFly mounts the modal canvas', async () => {
    render(<BonusStage closeOverlay={jest.fn()} onExit={jest.fn()} />);

    await waitFor(() => expect(mockDrawGame).toHaveBeenCalled());

    expect(mockDrawGame.mock.calls[0][0]).toBeDefined();
    expect(mockDrawGame.mock.calls[0][1].status).toBe('fighting');
  });
});
