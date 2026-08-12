export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const FIGHTER_PORTRAIT_COUNT = 5;

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

export interface GameSetup {
  playerPortraitIndex?: number;
  eligiblePortraitIndices?: readonly number[];
}

const FIGHTER_HALF_WIDTH = 30;
const WALK_SPEED = 230;
const JUMP_SPEED = 620;
const GRAVITY = 1550;
const ROUND_LENGTH_MS = 60_000;
const ALL_PORTRAIT_INDICES = Array.from({ length: FIGHTER_PORTRAIT_COUNT }, (_, index) => index);

const createFighter = (
  x: number,
  facing: -1 | 1,
  groundY: number,
  portraitIndex: number,
): Fighter => ({
  x,
  y: groundY,
  velocityX: 0,
  velocityY: 0,
  facing,
  health: 100,
  action: 'idle',
  actionStartedAt: 0,
  actionEndsAt: 0,
  attackConnected: false,
  portraitIndex,
});

const randomIndex = (count: number, random: () => number): number =>
  Math.min(count - 1, Math.floor(Math.max(0, random()) * count));

const normaliseEligiblePortraits = (indices?: readonly number[]): number[] => {
  const eligible = [...new Set(indices ?? ALL_PORTRAIT_INDICES)].filter(
    (index) => Number.isInteger(index) && index >= 0 && index < FIGHTER_PORTRAIT_COUNT,
  );
  return eligible.length >= 2 ? eligible : ALL_PORTRAIT_INDICES;
};

export const createGameState = (
  now = 0,
  random: () => number = Math.random,
  setup: GameSetup = {},
): GameState => {
  const groundY = 446;
  const eligiblePortraits = normaliseEligiblePortraits(setup.eligiblePortraitIndices);
  const requestedPlayer = setup.playerPortraitIndex;
  const playerPortraitIndex =
    requestedPlayer !== undefined && eligiblePortraits.includes(requestedPlayer)
      ? requestedPlayer
      : eligiblePortraits[randomIndex(eligiblePortraits.length, random)];
  const cpuPortraits = eligiblePortraits.filter((index) => index !== playerPortraitIndex);
  const cpuPortraitIndex = cpuPortraits[randomIndex(cpuPortraits.length, random)];

  return {
    player: createFighter(250, 1, groundY, playerPortraitIndex),
    cpu: createFighter(710, -1, groundY, cpuPortraitIndex),
    groundY,
    remainingMs: ROUND_LENGTH_MS,
    status: 'fighting',
    nextCpuDecisionAt: now + 450,
    cpuMove: 0,
    impact: null,
  };
};

const canAct = (fighter: Fighter): boolean =>
  fighter.action !== 'punch' &&
  fighter.action !== 'kick' &&
  fighter.action !== 'hit' &&
  fighter.action !== 'ko';

const beginAction = (
  fighter: Fighter,
  action: Extract<FighterAction, 'punch' | 'kick'>,
  now: number,
) => {
  if (!canAct(fighter)) return;

  fighter.action = action;
  fighter.actionStartedAt = now;
  fighter.actionEndsAt = now + (action === 'punch' ? 300 : 470);
  fighter.attackConnected = false;
  fighter.velocityX = 0;
};

const beginJump = (fighter: Fighter, now: number, groundY: number) => {
  if (!canAct(fighter) || fighter.y < groundY) return;
  fighter.action = 'jump';
  fighter.actionStartedAt = now;
  fighter.actionEndsAt = Number.POSITIVE_INFINITY;
  fighter.velocityY = -JUMP_SPEED;
};

const recoverAction = (fighter: Fighter, now: number) => {
  if (
    fighter.action !== 'jump' &&
    fighter.action !== 'ko' &&
    fighter.actionEndsAt > 0 &&
    now >= fighter.actionEndsAt
  ) {
    fighter.action = 'idle';
    fighter.actionStartedAt = now;
    fighter.actionEndsAt = 0;
    fighter.attackConnected = false;
  }
};

const applyMovement = (
  fighter: Fighter,
  direction: -1 | 0 | 1,
  groundY: number,
  deltaSeconds: number,
) => {
  const isAirborne = fighter.y < groundY || fighter.action === 'jump';
  const canWalk = canAct(fighter);

  fighter.velocityX = canWalk
    ? direction * WALK_SPEED * (isAirborne ? 0.72 : 1)
    : fighter.velocityX;

  if (canWalk && !isAirborne) {
    fighter.action = direction === 0 ? 'idle' : 'walk';
  }

  if (isAirborne) {
    fighter.velocityY += GRAVITY * deltaSeconds;
  }

  fighter.x += fighter.velocityX * deltaSeconds;
  fighter.y += fighter.velocityY * deltaSeconds;

  if (fighter.y >= groundY) {
    fighter.y = groundY;
    fighter.velocityY = 0;
    if (fighter.action === 'jump') {
      fighter.action = direction === 0 ? 'idle' : 'walk';
    }
  }

  fighter.x = Math.max(
    FIGHTER_HALF_WIDTH + 18,
    Math.min(GAME_WIDTH - FIGHTER_HALF_WIDTH - 18, fighter.x),
  );
};

const activeAttack = (fighter: Fighter, now: number) => {
  if (fighter.attackConnected) return null;

  const elapsed = now - fighter.actionStartedAt;
  if (fighter.action === 'punch' && elapsed >= 85 && elapsed <= 205) {
    return { reach: 88, damage: 8, knockback: 175 };
  }
  if (fighter.action === 'kick' && elapsed >= 145 && elapsed <= 330) {
    return { reach: 112, damage: 13, knockback: 245 };
  }
  return null;
};

const resolveAttack = (state: GameState, attacker: Fighter, defender: Fighter, now: number) => {
  const attack = activeAttack(attacker, now);
  if (!attack) return;

  const horizontalDistance = Math.abs(defender.x - attacker.x);
  const verticalDistance = Math.abs(defender.y - attacker.y);
  const isFacingDefender = Math.sign(defender.x - attacker.x) === attacker.facing;
  if (!isFacingDefender || horizontalDistance > attack.reach || verticalDistance > 86) return;

  attacker.attackConnected = true;
  defender.health = Math.max(0, defender.health - attack.damage);
  defender.velocityX = attacker.facing * attack.knockback;
  defender.actionStartedAt = now;
  defender.attackConnected = false;

  if (defender.health === 0) {
    defender.action = 'ko';
    defender.actionEndsAt = Number.POSITIVE_INFINITY;
    defender.velocityY = -180;
  } else {
    defender.action = 'hit';
    defender.actionEndsAt = now + 260;
  }

  state.impact = {
    x: defender.x - attacker.facing * 25,
    y: defender.y - 88,
    at: now,
  };
};

const updateFacing = (left: Fighter, right: Fighter) => {
  if (left.action !== 'ko') left.facing = left.x <= right.x ? 1 : -1;
  if (right.action !== 'ko') right.facing = right.x >= left.x ? -1 : 1;
};

const separateFighters = (left: Fighter, right: Fighter) => {
  const gap = Math.abs(right.x - left.x);
  const minimumGap = FIGHTER_HALF_WIDTH * 1.7;
  if (gap >= minimumGap) return;

  const correction = (minimumGap - gap) / 2;
  const direction = left.x <= right.x ? 1 : -1;
  left.x -= correction * direction;
  right.x += correction * direction;
};

const chooseCpuAction = (state: GameState, now: number, random: () => number) => {
  if (now < state.nextCpuDecisionAt || !canAct(state.cpu)) return;

  const distance = Math.abs(state.player.x - state.cpu.x);
  if (distance > 120) {
    state.cpuMove = state.player.x < state.cpu.x ? -1 : 1;
  } else if (distance < 62) {
    state.cpuMove = state.player.x < state.cpu.x ? 1 : -1;
  } else {
    state.cpuMove = 0;
    beginAction(state.cpu, random() > 0.48 ? 'kick' : 'punch', now);
  }

  if (distance > 150 && distance < 280 && random() > 0.87) {
    beginJump(state.cpu, now, state.groundY);
  }

  state.nextCpuDecisionAt = now + 210 + random() * 340;
};

const finishRound = (state: GameState) => {
  if (state.player.health === 0) {
    state.status = 'cpu-won';
  } else if (state.cpu.health === 0) {
    state.status = 'player-won';
  } else if (state.remainingMs === 0) {
    state.status =
      state.player.health === state.cpu.health
        ? 'draw'
        : state.player.health > state.cpu.health
        ? 'player-won'
        : 'cpu-won';
  }

  if (state.status !== 'fighting') {
    state.cpuMove = 0;
  }
};

export const stepGame = (
  state: GameState,
  input: PlayerInput,
  now: number,
  deltaSeconds: number,
  random: () => number = Math.random,
) => {
  if (state.status !== 'fighting') return;

  const boundedDelta = Math.max(0, Math.min(deltaSeconds, 0.05));
  state.remainingMs = Math.max(0, state.remainingMs - boundedDelta * 1000);

  recoverAction(state.player, now);
  recoverAction(state.cpu, now);

  if (input.jump) beginJump(state.player, now, state.groundY);
  if (input.punch) beginAction(state.player, 'punch', now);
  if (input.kick) beginAction(state.player, 'kick', now);

  chooseCpuAction(state, now, random);

  const playerDirection: -1 | 0 | 1 = input.left === input.right ? 0 : input.left ? -1 : 1;
  applyMovement(state.player, playerDirection, state.groundY, boundedDelta);
  applyMovement(state.cpu, state.cpuMove, state.groundY, boundedDelta);

  updateFacing(state.player, state.cpu);
  separateFighters(state.player, state.cpu);
  resolveAttack(state, state.player, state.cpu, now);
  resolveAttack(state, state.cpu, state.player, now);
  finishRound(state);
};
