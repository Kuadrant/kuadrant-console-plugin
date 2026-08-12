import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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
    render(
      <BonusStage
        closeOverlay={jest.fn()}
        onExit={jest.fn()}
        resolveAvailability={() =>
          Promise.resolve(
            [0, 1, 2, 3, 4].map((portraitIndex) => ({
              portraitIndex: portraitIndex as 0 | 1 | 2 | 3 | 4,
              isAvailable: true,
            })),
          )
        }
      />,
    );

    fireEvent.click(await screen.findByText('Jason'));

    await waitFor(() => expect(mockDrawGame).toHaveBeenCalled());

    expect(mockDrawGame.mock.calls[0][0]).toBeDefined();
    expect(mockDrawGame.mock.calls[0][1].status).toBe('fighting');
    expect(mockDrawGame.mock.calls[0][1].player.portraitIndex).toBe(0);
    expect(mockDrawGame.mock.calls[0][3].battleLines[2]).toContain('Удар отклонён: RBAC.');
  });

  it('rechecks eligibility when the player chooses again', async () => {
    const resolveAvailability = jest.fn(() =>
      Promise.resolve(
        [0, 1, 2, 3, 4].map((portraitIndex) => ({
          portraitIndex: portraitIndex as 0 | 1 | 2 | 3 | 4,
          isAvailable: true,
        })),
      ),
    );
    render(
      <BonusStage
        closeOverlay={jest.fn()}
        onExit={jest.fn()}
        resolveAvailability={resolveAvailability}
      />,
    );

    fireEvent.click(await screen.findByText('Emma'));
    await waitFor(() => expect(mockDrawGame).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Choose again' }));

    await waitFor(() => expect(resolveAvailability).toHaveBeenCalledTimes(2));
  });
});
