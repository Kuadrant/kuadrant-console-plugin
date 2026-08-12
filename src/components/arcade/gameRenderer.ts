import { createBattleChatter } from './battleChatter';
import { Fighter, GameState, GAME_HEIGHT, GAME_WIDTH } from './gameEngine';
import { FIGHTER_PORTRAIT_URLS } from './fighterPortraits';
import { createHeadPanic } from './headPanic';

export interface GameLabels {
  title: string;
  fighterNames: readonly string[];
  fighterWins: readonly string[];
  timeUp: string;
  knockout: string;
  draw: string;
  rematch: string;
  battleLines: readonly (readonly string[])[];
}

const palette = {
  ink: '#0b1020',
  skyTop: '#161331',
  skyBottom: '#65407a',
  sunset: '#f29f67',
  city: '#171b35',
  cityLight: '#55d6be',
  floor: '#242849',
  floorLine: '#6970a5',
  white: '#f8f5e4',
  playerPrimary: '#3dd6c6',
  playerSecondary: '#ec4c78',
  cpuPrimary: '#a78bfa',
  cpuSecondary: '#f6ad55',
  skin: '#d99b72',
  health: '#51cf66',
  danger: '#ff5c5c',
  impact: '#ffe66d',
};

const portraitImages = FIGHTER_PORTRAIT_URLS.map((source) => {
  const image = new Image();
  image.src = source;
  return image;
});

const drawBattleChatter = createBattleChatter();
const getHeadPanic = createHeadPanic();

const block = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) => {
  context.fillStyle = color;
  context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
};

const drawBackdrop = (context: CanvasRenderingContext2D, now: number, labels: GameLabels) => {
  const sky = context.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(0.72, palette.skyBottom);
  sky.addColorStop(1, palette.sunset);
  context.fillStyle = sky;
  context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  context.fillStyle = palette.sunset;
  context.beginPath();
  context.arc(760, 188, 64, 0, Math.PI * 2);
  context.fill();

  const stars = [
    [70, 68],
    [145, 112],
    [236, 55],
    [350, 92],
    [445, 48],
    [550, 118],
    [640, 72],
    [868, 85],
  ];
  stars.forEach(([x, y], index) => {
    const pulse = 2 + Math.round((Math.sin(now / 420 + index) + 1) * 0.75);
    block(context, x, y, pulse, pulse, palette.white);
  });

  const buildings = [
    [0, 285, 115, 126],
    [98, 245, 102, 166],
    [185, 305, 88, 106],
    [258, 218, 126, 193],
    [372, 276, 92, 135],
    [450, 238, 112, 173],
    [548, 300, 105, 111],
    [640, 245, 82, 166],
    [712, 286, 128, 125],
    [826, 225, 134, 186],
  ];
  buildings.forEach(([x, y, width, height], buildingIndex) => {
    block(context, x, y, width, height, palette.city);
    for (let windowY = y + 18; windowY < y + height - 12; windowY += 26) {
      for (let windowX = x + 16; windowX < x + width - 12; windowX += 24) {
        if ((windowX + windowY + buildingIndex) % 3 !== 0) {
          block(context, windowX, windowY, 7, 9, palette.cityLight);
        }
      }
    }
  });

  block(context, 300, 250, 360, 82, palette.ink);
  context.strokeStyle = palette.cityLight;
  context.lineWidth = 4;
  context.strokeRect(306, 256, 348, 70);
  context.fillStyle = palette.cityLight;
  context.font = 'bold 32px monospace';
  context.textAlign = 'center';
  context.fillText(labels.title.toUpperCase(), GAME_WIDTH / 2, 302);

  block(context, 0, 405, GAME_WIDTH, 135, palette.floor);
  block(context, 0, 405, GAME_WIDTH, 8, palette.floorLine);
  context.strokeStyle = palette.floorLine;
  context.lineWidth = 2;
  for (let x = -260; x < GAME_WIDTH + 260; x += 80) {
    context.beginPath();
    context.moveTo(GAME_WIDTH / 2, 405);
    context.lineTo(x, GAME_HEIGHT);
    context.stroke();
  }
  for (let y = 438; y < GAME_HEIGHT; y += 30) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(GAME_WIDTH, y);
    context.stroke();
  }
};

const drawFighter = (
  context: CanvasRenderingContext2D,
  fighter: Fighter,
  primary: string,
  secondary: string,
  now: number,
) => {
  const actionProgress = Math.max(0, now - fighter.actionStartedAt);
  const walkCycle = fighter.action === 'walk' ? Math.sin(now / 85) * 9 : 0;
  const isHitFlash = fighter.action === 'hit' && Math.floor(actionProgress / 45) % 2 === 0;
  const mainColor = isHitFlash ? palette.white : primary;
  const accentColor = isHitFlash ? palette.impact : secondary;

  context.save();
  context.translate(Math.round(fighter.x), Math.round(fighter.y));
  context.scale(fighter.facing, 1);

  context.globalAlpha = 0.35;
  context.fillStyle = palette.ink;
  context.beginPath();
  context.ellipse(0, 4, 40, 9, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  if (fighter.action === 'ko') {
    context.rotate(-Math.PI / 2.25);
    context.translate(-50, 20);
  }

  const hipY = -52;
  if (fighter.action === 'kick') {
    block(context, -18, hipY, 25, 46, mainColor);
    block(context, -20, -14, 30, 14, accentColor);
    block(context, 4, hipY - 2, 64, 18, mainColor);
    block(context, 62, hipY - 4, 27, 22, accentColor);
  } else if (fighter.action === 'jump') {
    block(context, -30, hipY, 25, 34, mainColor);
    block(context, -34, -23, 32, 14, accentColor);
    block(context, 7, hipY, 25, 34, mainColor);
    block(context, 5, -23, 34, 14, accentColor);
  } else {
    block(context, -27 + walkCycle, hipY, 23, 48, mainColor);
    block(context, -31 + walkCycle, -8, 31, 12, accentColor);
    block(context, 6 - walkCycle, hipY, 23, 48, mainColor);
    block(context, 4 - walkCycle, -8, 31, 12, accentColor);
  }

  block(context, -31, -113, 62, 66, mainColor);
  block(context, -34, -92, 9, 31, accentColor);
  block(context, 25, -92, 9, 31, accentColor);
  block(context, -35, -55, 70, 10, accentColor);

  if (fighter.action === 'punch') {
    block(context, 25, -105, 58, 18, mainColor);
    block(context, 77, -109, 23, 25, palette.skin);
    block(context, -47, -102, 20, 52, mainColor);
  } else {
    block(context, -48, -104 + walkCycle / 2, 19, 53, mainColor);
    block(context, 29, -104 - walkCycle / 2, 19, 53, mainColor);
    block(context, -50, -57 + walkCycle / 2, 24, 20, palette.skin);
    block(context, 27, -57 - walkCycle / 2, 24, 20, palette.skin);
  }

  const panic = getHeadPanic(fighter, now);
  context.save();
  if (panic.isActive) {
    context.translate(panic.offsetX, -136 + panic.offsetY);
    context.rotate(panic.rotation);
    context.scale(panic.scaleX, panic.scaleY);
    context.translate(0, 136);
  }

  const portrait = portraitImages[fighter.portraitIndex];
  if (portrait?.complete && portrait.naturalWidth > 0) {
    context.imageSmoothingEnabled = false;
    context.drawImage(portrait, -40, -176, 80, 80);
  } else {
    block(context, -22, -146, 44, 38, palette.skin);
    block(context, -25, -153, 47, 13, accentColor);
    block(context, -28, -145, 11, 24, accentColor);
    block(context, 8, -134, 7, 5, palette.ink);
    block(context, 15, -117, 13, 5, palette.ink);
  }
  context.restore();

  context.restore();
};

const drawHealthBar = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  health: number,
  alignRight: boolean,
) => {
  block(context, x, y, width, 25, palette.ink);
  const innerWidth = Math.max(0, (width - 8) * (health / 100));
  const healthColor = health > 28 ? palette.health : palette.danger;
  block(
    context,
    alignRight ? x + width - 4 - innerWidth : x + 4,
    y + 4,
    innerWidth,
    17,
    healthColor,
  );
};

const drawHud = (context: CanvasRenderingContext2D, state: GameState, labels: GameLabels) => {
  context.textBaseline = 'top';
  context.font = 'bold 18px monospace';
  context.fillStyle = palette.white;
  context.textAlign = 'left';
  context.fillText(labels.fighterNames[state.player.portraitIndex].toUpperCase(), 42, 25);
  context.textAlign = 'right';
  context.fillText(labels.fighterNames[state.cpu.portraitIndex].toUpperCase(), GAME_WIDTH - 42, 25);

  drawHealthBar(context, 42, 50, 350, state.player.health, false);
  drawHealthBar(context, GAME_WIDTH - 392, 50, 350, state.cpu.health, true);

  block(context, GAME_WIDTH / 2 - 42, 29, 84, 58, palette.ink);
  context.fillStyle = palette.white;
  context.font = 'bold 34px monospace';
  context.textAlign = 'center';
  context.fillText(
    String(Math.ceil(state.remainingMs / 1000)).padStart(2, '0'),
    GAME_WIDTH / 2,
    39,
  );
};

const drawImpact = (context: CanvasRenderingContext2D, state: GameState, now: number) => {
  if (!state.impact || now - state.impact.at > 170) return;

  const age = (now - state.impact.at) / 170;
  context.save();
  context.translate(state.impact.x, state.impact.y);
  context.rotate(age * Math.PI * 0.5);
  context.fillStyle = palette.impact;
  for (let index = 0; index < 8; index += 1) {
    context.rotate(Math.PI / 4);
    block(context, 12 + age * 24, -3, 25 * (1 - age), 6, palette.impact);
  }
  context.restore();
};

const drawRoundResult = (
  context: CanvasRenderingContext2D,
  state: GameState,
  labels: GameLabels,
) => {
  if (state.status === 'fighting') return;

  context.fillStyle = 'rgba(11, 16, 32, 0.72)';
  context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  context.textAlign = 'center';
  context.fillStyle = palette.impact;
  context.font = 'bold 86px monospace';
  context.fillText(
    (state.remainingMs === 0 ? labels.timeUp : labels.knockout).toUpperCase(),
    GAME_WIDTH / 2,
    185,
  );
  context.fillStyle = palette.white;
  context.font = 'bold 34px monospace';
  const result =
    state.status === 'player-won'
      ? labels.fighterWins[state.player.portraitIndex]
      : state.status === 'cpu-won'
      ? labels.fighterWins[state.cpu.portraitIndex]
      : labels.draw;
  context.fillText(result.toUpperCase(), GAME_WIDTH / 2, 290);
  context.font = 'bold 20px monospace';
  context.fillText(labels.rematch.toUpperCase(), GAME_WIDTH / 2, 350);
};

export const drawGame = (
  context: CanvasRenderingContext2D,
  state: GameState,
  now: number,
  labels: GameLabels,
) => {
  context.save();
  if (state.impact && now - state.impact.at < 100) {
    const shake = Math.sin(now * 0.42) * 5;
    context.translate(shake, -shake / 2);
  }

  drawBackdrop(context, now, labels);
  drawFighter(context, state.player, palette.playerPrimary, palette.playerSecondary, now);
  drawFighter(context, state.cpu, palette.cpuPrimary, palette.cpuSecondary, now);
  drawImpact(context, state, now);
  drawHud(context, state, labels);
  drawRoundResult(context, state, labels);
  context.restore();

  drawBattleChatter(context, state, now, labels.battleLines);
};
