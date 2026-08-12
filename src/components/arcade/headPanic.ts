import { Fighter } from './gameEngine';

interface PanicSchedule {
  activeUntil: number;
  nextAt: number;
}

export interface HeadPanicMotion {
  isActive: boolean;
  offsetX: number;
  offsetY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

const STILL: HeadPanicMotion = {
  isActive: false,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
};

export const createHeadPanic = (random: () => number = Math.random) => {
  const schedules = new WeakMap<Fighter, PanicSchedule>();

  return (fighter: Fighter, now: number): HeadPanicMotion => {
    if (fighter.action === 'ko') return STILL;

    let schedule = schedules.get(fighter);
    if (!schedule) {
      schedule = {
        activeUntil: 0,
        nextAt: now + 1600 + random() * 3600,
      };
      schedules.set(fighter, schedule);
    }

    if (now >= schedule.nextAt) {
      schedule.activeUntil = now + 750 + random() * 600;
      schedule.nextAt = schedule.activeUntil + 2600 + random() * 4400;
    }

    if (now >= schedule.activeUntil) return STILL;

    const phase = now / 26;
    const squash = Math.sin(phase * 4.1) * 0.045;
    return {
      isActive: true,
      offsetX: Math.round(Math.sin(phase * 2.7) * 7),
      offsetY: Math.round(Math.cos(phase * 3.3) * 3),
      rotation: Math.sin(phase * 2.1) * 0.1,
      scaleX: 1 + squash,
      scaleY: 1 - squash,
    };
  };
};
