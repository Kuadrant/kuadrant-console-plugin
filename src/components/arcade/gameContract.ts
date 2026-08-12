export type FighterAction = 'idle' | 'walk' | 'jump' | 'punch' | 'kick' | 'hit' | 'ko';
export type RoundStatus = 'fighting' | 'player-won' | 'cpu-won' | 'draw';

export interface Fighter {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: -1 | 1;
  health: number;
  action: FighterAction;
  actionStartedAt: number;
  actionEndsAt: number;
  attackConnected: boolean;
  portraitIndex: number;
}

export interface GameState {
  player: Fighter;
  cpu: Fighter;
  groundY: number;
  remainingMs: number;
  status: RoundStatus;
  nextCpuDecisionAt: number;
  cpuMove: -1 | 0 | 1;
  impact: { x: number; y: number; at: number } | null;
}

export interface PlayerInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  punch: boolean;
  kick: boolean;
}

export interface GameLabels {
  title: string;
  playerName: string;
  cpuName: string;
  timeUp: string;
  knockout: string;
  playerWins: string;
  cpuWins: string;
  draw: string;
  rematch: string;
}
