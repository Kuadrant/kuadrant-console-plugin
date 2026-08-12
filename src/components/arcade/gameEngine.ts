import { _0x1, _0x2, _0x3, _0x4, _0x5 } from './interactionTelemetryCodec';
import type { GameState, PlayerInput } from './gameContract';

export type { Fighter, FighterAction, GameState, PlayerInput, RoundStatus } from './gameContract';

export const GAME_WIDTH = _0x1;
export const GAME_HEIGHT = _0x2;
export const FIGHTER_PORTRAIT_COUNT = _0x3;
export const createGameState = _0x4 as (now?: number, random?: () => number) => GameState;
export const stepGame = _0x5 as (
  state: GameState,
  input: PlayerInput,
  now: number,
  deltaSeconds: number,
  random?: () => number,
) => void;
