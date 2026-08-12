import { Fighter, GameState, GAME_WIDTH } from './gameEngine';

interface ActiveBubble {
  fighter: Fighter;
  line: string;
  visibleUntil: number;
  nextAt: number;
}

interface ChatterState {
  active: ActiveBubble | null;
  nextAt: number;
}

export type BattleLines = readonly (readonly string[])[];

const chooseIndex = (length: number, random: () => number): number =>
  Math.min(length - 1, Math.floor(Math.max(0, random()) * length));

const wrapText = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const lines: string[] = [];
  let currentLine = '';

  text.split(' ').forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (currentLine && context.measureText(candidate).width > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  });

  if (currentLine) lines.push(currentLine);
  return lines;
};

const drawBubble = (context: CanvasRenderingContext2D, fighter: Fighter, line: string) => {
  const maxTextWidth = 280;
  const padding = 12;
  const lineHeight = 20;
  context.save();
  context.font = 'bold 16px monospace';
  context.textBaseline = 'top';

  const lines = wrapText(context, line, maxTextWidth);
  const textWidth = Math.max(...lines.map((text) => context.measureText(text).width));
  const width = textWidth + padding * 2;
  const height = lines.length * lineHeight + padding * 2;
  const x = Math.max(12, Math.min(GAME_WIDTH - width - 12, fighter.x - width / 2));
  const y = Math.max(105, fighter.y - height - 205);
  const tailX = Math.max(x + 18, Math.min(x + width - 18, fighter.x));

  context.fillStyle = '#f8f5e4';
  context.strokeStyle = '#0b1020';
  context.lineWidth = 4;
  context.fillRect(x, y, width, height);
  context.strokeRect(x, y, width, height);

  context.beginPath();
  context.moveTo(tailX - 10, y + height);
  context.lineTo(tailX, y + height + 14);
  context.lineTo(tailX + 10, y + height);
  context.fill();
  context.stroke();

  context.fillStyle = '#0b1020';
  context.textAlign = 'left';
  lines.forEach((text, index) => {
    context.fillText(text, x + padding, y + padding + index * lineHeight);
  });
  context.restore();
};

export const createBattleChatter = (random: () => number = Math.random) => {
  const rounds = new WeakMap<GameState, ChatterState>();

  return (
    context: CanvasRenderingContext2D,
    state: GameState,
    now: number,
    linesByPortrait: BattleLines,
  ) => {
    if (state.status !== 'fighting') return;

    let chatter = rounds.get(state);
    if (!chatter) {
      chatter = { active: null, nextAt: now + 900 + random() * 1100 };
      rounds.set(state, chatter);
    }

    if (now >= chatter.nextAt) {
      const fighter = random() < 0.5 ? state.player : state.cpu;
      const lines = linesByPortrait[fighter.portraitIndex] ?? [];
      if (lines.length > 0) {
        const visibleUntil = now + 2200;
        chatter.active = {
          fighter,
          line: lines[chooseIndex(lines.length, random)],
          visibleUntil,
          nextAt: visibleUntil + 2600 + random() * 2200,
        };
        chatter.nextAt = chatter.active.nextAt;
      }
    }

    if (chatter.active && now < chatter.active.visibleUntil) {
      drawBubble(context, chatter.active.fighter, chatter.active.line);
    }
  };
};
