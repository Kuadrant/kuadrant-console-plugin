import { createGameState, PlayerInput, stepGame } from './gameEngine';

const noInput: PlayerInput = {
  left: false,
  right: false,
  jump: false,
  punch: false,
  kick: false,
};

describe('arcade game engine', () => {
  it('assigns two different random portraits to each round', () => {
    const random = jest.fn().mockReturnValueOnce(0.8).mockReturnValueOnce(0);

    const state = createGameState(0, random);

    expect(state.player.portraitIndex).toBe(4);
    expect(state.cpu.portraitIndex).toBe(0);
    expect(state.player.portraitIndex).not.toBe(state.cpu.portraitIndex);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('lands a punch when the opponent is in range', () => {
    const now = 1000;
    const state = createGameState(now);
    state.player.x = 400;
    state.cpu.x = 475;

    stepGame(state, { ...noInput, punch: true }, now, 0, () => 0);
    stepGame(state, noInput, now + 100, 0.1, () => 0);

    expect(state.cpu.health).toBe(92);
    expect(state.cpu.action).toBe('hit');
    expect(state.impact).not.toBeNull();
  });

  it('does not land an attack outside its reach', () => {
    const now = 1000;
    const state = createGameState(now);

    stepGame(state, { ...noInput, kick: true }, now, 0, () => 0);
    stepGame(state, noInput, now + 180, 0.05, () => 0);

    expect(state.cpu.health).toBe(100);
    expect(state.impact).toBeNull();
  });

  it('ends the round when a fighter is knocked out', () => {
    const now = 1000;
    const state = createGameState(now);
    state.player.x = 400;
    state.cpu.x = 490;
    state.cpu.health = 10;

    stepGame(state, { ...noInput, kick: true }, now, 0, () => 0);
    stepGame(state, noInput, now + 180, 0.05, () => 0);

    expect(state.cpu.health).toBe(0);
    expect(state.cpu.action).toBe('ko');
    expect(state.status).toBe('player-won');
  });

  it('decides a tied round when time expires at equal health', () => {
    const state = createGameState(0);
    state.remainingMs = 10;

    stepGame(state, noInput, 100, 0.05, () => 0);

    expect(state.remainingMs).toBe(0);
    expect(state.status).toBe('draw');
  });
});
