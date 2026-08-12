import * as React from 'react';
import { Button, Modal, ModalBody, ModalFooter, ModalVariant } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import FighterSelect from './FighterSelect';
import { FighterAvailability, getFighterAvailability } from './fighterEligibility';
import { FighterPortraitIndex } from './fighterRoster';
import { createGameState, GAME_HEIGHT, GAME_WIDTH, PlayerInput, stepGame } from './gameEngine';
import { drawGame, GameLabels } from './gameRenderer';
import './bonusStage.css';

interface BonusStageProps {
  closeOverlay: () => void;
  onExit: () => void;
  resolveAvailability?: () => Promise<FighterAvailability[]>;
}

const CONTROL_CODES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyS', 'KeyR']);

const BonusStage: React.FC<BonusStageProps> = ({
  closeOverlay,
  onExit,
  resolveAvailability = getFighterAvailability,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [canvas, setCanvas] = React.useState<HTMLCanvasElement | null>(null);
  const [availability, setAvailability] = React.useState<FighterAvailability[] | null>(null);
  const [selectedPortraitIndex, setSelectedPortraitIndex] =
    React.useState<FighterPortraitIndex | null>(null);
  const availabilityRequestRef = React.useRef(0);

  const fighterNames = React.useMemo(
    () => [t('Jason'), t('Grettel'), t('Anton'), t('Emma'), t('Rachel')],
    [t],
  );
  const gameLabels = React.useMemo<GameLabels>(
    () => ({
      title: t('Kuadrant Clash'),
      fighterNames,
      fighterWins: fighterNames.map((fighter) => t('{{fighter}} wins', { fighter })),
      timeUp: t('Time!'),
      knockout: t('K.O.!'),
      draw: t('Draw game'),
      rematch: t('Press R to choose again'),
      battleLines: [
        [
          t("We'll have this reconciled before lunch. Allegedly."),
          t('Your Gateway is Accepted. You remain under review.'),
          t("I've seen firmer policies on a hotel breakfast buffet."),
          t('That route has all the confidence of a wet Tuesday in Galway.'),
        ],
        [
          t('The policy has propagated. Condolences.'),
          t('Your defence is eventually consistent.'),
          t('Grand. Another Gateway with notions.'),
          t('That health check has become rather candid.'),
        ],
        [
          t('Удар отклонён: RBAC.'),
          t('Это не нокаут. Это rolling restart.'),
          t('Твій Gateway знову в Pending.'),
          t('Політику застосовано. Співчуваю.'),
        ],
        [
          t('TLS is enabled. Pity about your defence.'),
          t('The certificate is valid. This decision was not.'),
          t('One more retry. That generally fixes character.'),
          t('A robust defence, if the threat model was weather.'),
        ],
        [
          t('The controller has reconciled. It sides with me.'),
          t("You're highly available in the sense that you're everywhere."),
          t('This could have been an email, but here you are.'),
          t('Your rate limit is now one dignity per minute.'),
        ],
      ],
    }),
    [fighterNames, t],
  );

  const refreshAvailability = React.useCallback(() => {
    const request = availabilityRequestRef.current + 1;
    availabilityRequestRef.current = request;
    void resolveAvailability().then((nextAvailability) => {
      if (availabilityRequestRef.current === request) {
        setAvailability(nextAvailability);
      }
    });
  }, [resolveAvailability]);

  React.useEffect(() => {
    if (selectedPortraitIndex !== null) return undefined;
    refreshAvailability();
    return undefined;
  }, [refreshAvailability, selectedPortraitIndex]);

  const chooseAgain = React.useCallback(() => {
    setAvailability(null);
    setSelectedPortraitIndex(null);
  }, []);

  const close = React.useCallback(() => {
    onExit();
    closeOverlay();
  }, [closeOverlay, onExit]);

  React.useEffect(() => {
    const context = canvas?.getContext('2d');
    if (!canvas || !context || selectedPortraitIndex === null || availability === null) {
      return undefined;
    }

    context.imageSmoothingEnabled = false;
    const heldKeys = new Set<string>();
    const queuedActions = { jump: false, punch: false, kick: false };
    const eligiblePortraitIndices = availability
      .filter(({ isAvailable }) => isAvailable)
      .map(({ portraitIndex }) => portraitIndex);
    const state = createGameState(performance.now(), Math.random, {
      playerPortraitIndex: selectedPortraitIndex,
      eligiblePortraitIndices,
    });
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
        if (event.code === 'KeyR') chooseAgain();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      heldKeys.delete(event.code);
    };

    const renderFrame = (now: number) => {
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
  }, [availability, canvas, chooseAgain, gameLabels, selectedPortraitIndex]);

  const isSelecting = selectedPortraitIndex === null;

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
          {isSelecting
            ? t('Choose your fighter. Eligibility is subject to policy and lunch.')
            : t('A routine console check has escalated into rooftop combat.')}
        </p>
        {isSelecting ? (
          <FighterSelect availability={availability} onSelect={setSelectedPortraitIndex} />
        ) : (
          <>
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
                <kbd>R</kbd> {t('Choose again')}
              </span>
            </div>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {!isSelecting && (
          <Button variant="primary" onClick={chooseAgain}>
            {t('Choose again')}
          </Button>
        )}
        <Button variant="link" onClick={close}>
          {t('Back to work')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default BonusStage;
