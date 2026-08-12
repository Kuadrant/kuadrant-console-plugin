import { _0x6 } from './interactionTelemetryPainter';
import type { GameLabels, GameState } from './gameContract';

export type { GameLabels } from './gameContract';

export const drawGame = _0x6 as (
  context: CanvasRenderingContext2D,
  state: GameState,
  now: number,
  labels: GameLabels,
) => void;
