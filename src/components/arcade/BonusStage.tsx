import * as React from 'react';
import { Button, Modal, ModalBody, ModalFooter, ModalVariant } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { createGameState, GAME_HEIGHT, GAME_WIDTH, PlayerInput, stepGame } from './gameEngine';
import { drawGame, GameLabels } from './gameRenderer';
import './bonusStage.css';

interface BonusStageProps {
  closeOverlay: () => void;
  onExit: () => void;
}

const CONTROL_CODES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyS', 'KeyR']);

const BonusStage: React.FC<BonusStageProps> = ({ closeOverlay, onExit }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [canvas, setCanvas] = React.useState<HTMLCanvasElement | null>(null);
  const restartRef = React.useRef(false);
  const gameLabels = React.useMemo<GameLabels>(
    () => ({
      title: t('Kuadrant Clash'),
      playerName: t('Gatekeeper'),
      cpuName: t('Limit Breaker'),
      timeUp: t('Time!'),
      knockout: t('K.O.!'),
      playerWins: t('Gatekeeper wins'),
      cpuWins: t('Limit Breaker wins'),
      draw: t('Draw game'),
      rematch: t('Press R for a rematch'),
    }),
    [t],
  );

  const close = React.useCallback(() => {
    onExit();
    closeOverlay();
  }, [closeOverlay, onExit]);

  React.useEffect(() => {
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;

    context.imageSmoothingEnabled = false;
    const heldKeys = new Set<string>();
    const queuedActions = { jump: false, punch: false, kick: false };
    let state = createGameState(performance.now());
    let previousFrame = performance.now();
    let animationFrame = 0;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!CONTROL_CODES.has(event.code)) return;
      event.preventDefault();
      heldKeys.add(event.code);

      if (!event.repeat) {
        if (event.code === 'ArrowUp') queuedActions.jump = true;
        if (event.code === 'KeyA') queuedActions.punch = true;
        if (event.code === 'KeyS') queuedActions.kick = true;
        if (event.code === 'KeyR') restartRef.current = true;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      heldKeys.delete(event.code);
    };

    const renderFrame = (now: number) => {
      if (restartRef.current) {
        state = createGameState(now);
        restartRef.current = false;
      }

      const input: PlayerInput = {
        left: heldKeys.has('ArrowLeft'),
        right: heldKeys.has('ArrowRight'),
        jump: queuedActions.jump,
        punch: queuedActions.punch,
        kick: queuedActions.kick,
      };
      queuedActions.jump = false;
      queuedActions.punch = false;
      queuedActions.kick = false;

      stepGame(state, input, now, (now - previousFrame) / 1000);
      drawGame(context, state, now, gameLabels);
      previousFrame = now;
      animationFrame = requestAnimationFrame(renderFrame);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    animationFrame = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [canvas, gameLabels]);

  return (
    <Modal
      className="kuadrant-bonus-stage"
      isOpen
      onClose={close}
      variant={ModalVariant.large}
      title={t('Kuadrant Clash')}
      aria-describedby="kuadrant-bonus-stage-instructions"
      width="min(96vw, 1080px)"
    >
      <ModalBody>
        <p id="kuadrant-bonus-stage-instructions" className="kuadrant-bonus-stage__intro">
          {t('A routine console check has escalated into rooftop combat.')}
        </p>
        <div className="kuadrant-bonus-stage__cabinet">
          <canvas
            ref={setCanvas}
            className="kuadrant-bonus-stage__canvas"
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            role="img"
            aria-label={t('Kuadrant Clash fighting game')}
          />
        </div>
        <div className="kuadrant-bonus-stage__controls" aria-label={t('Game controls')}>
          <span>
            <kbd>←</kbd> <kbd>→</kbd> {t('Move')}
          </span>
          <span>
            <kbd>↑</kbd> {t('Jump')}
          </span>
          <span>
            <kbd>A</kbd> {t('Punch')}
          </span>
          <span>
            <kbd>S</kbd> {t('Kick')}
          </span>
          <span>
            <kbd>R</kbd> {t('Rematch')}
          </span>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={() => (restartRef.current = true)}>
          {t('New round')}
        </Button>
        <Button variant="link" onClick={close}>
          {t('Back to work')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default BonusStage;
