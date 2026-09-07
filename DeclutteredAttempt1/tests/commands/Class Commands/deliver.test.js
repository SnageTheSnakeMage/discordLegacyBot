/**
 * /deliver - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real.
 */
const logic = require('../../../commands/Class Commands/deliver.logic.js');
const deliver = require('../../../commands/Class Commands/deliver.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass,
} = require('../../helpers/mockModels.js');

const MAILMAN = '123';
const RECEIVER = '456';

/** deps for the happy path; override per test */
function happyDeps(over = {}) {
  const player = over.player || createFakePlayer({ Player_ID: 1, Discord_ID: MAILMAN, Action_Points: 5 });
  const receiver = 'receiver' in over ? over.receiver : createFakePlayer({ Player_ID: 2, Discord_ID: RECEIVER, Action_Points: 2, MAX_AP: 10 });
  const game = over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE });
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async ({ where }) => (where.Discord_ID === MAILMAN ? player : where.Discord_ID === RECEIVER ? receiver : null),
      },
      Classes: { findByPk: async () => over.playerClass || createFakeClass({ Class_Name: 'Mailman' }) },
    },
  });
  return { deps, player, receiver, game };
}

const INPUT = { targetDiscordId: RECEIVER, receiverUsername: 'postbox', amount: 3, gameId: 1, discordId: MAILMAN };

describe('deliver.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse(
      { receiver: RECEIVER, receiverUsername: 'postbox', amount: 3, game: null },
      { discordId: MAILMAN, username: 'snage' },
    );
    expect(input).toEqual({ targetDiscordId: RECEIVER, receiverUsername: 'postbox', amount: 3, gameId: null, discordId: MAILMAN });
  });

  it('keeps an explicit game id', () => {
    const input = logic.parse(
      { receiver: RECEIVER, receiverUsername: 'postbox', amount: 1, game: 7 },
      { discordId: MAILMAN, username: 'snage' },
    );
    expect(input.gameId).toBe(7);
  });
});

describe('deliver.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects an actor who is not in the game', async () => {
    const { deps, receiver } = happyDeps();
    deps.models.Players.findOne = jest.fn(async ({ where }) => (where.Discord_ID === RECEIVER ? receiver : null));
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  // the gamestate table: every state has a defined outcome; adding a state
  // without deciding its gate breaks this test. isClockwatcher is hardcoded
  // false in deliver, so TIMESTOPPED always blocks.
  it.each([
    [GAMESTATES.ACTIVE, null],
    [GAMESTATES.REGISTRATION, null],
    [GAMESTATES.INACTIVE, null],
    [GAMESTATES.SANDBOX, null],
    [GAMESTATES.FINALE, null],
    [GAMESTATES.OVER, REJECTIONS.GAME_OVER],
    [GAMESTATES.DEV_PAUSED, REJECTIONS.GAME_PAUSED],
    [GAMESTATES.TIMESTOPPED, REJECTIONS.TIME_STOPPED],
  ])('gamestate %s -> %s', async (state, reason) => {
    const { deps } = happyDeps({ game: createFakeGame({ GAME_STATE: state }) });
    const result = await logic.run(INPUT, deps);
    if (reason === null) {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toMatchObject({ ok: false, reason });
      expect(deps.models.Players.update).not.toHaveBeenCalled();
    }
  });

  it('rejects a non-Mailman', async () => {
    const { deps } = happyDeps({ playerClass: createFakeClass({ Class_Name: 'Average' }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Mailman' } });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a receiver who is not in the game', async () => {
    const { deps } = happyDeps({ receiver: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME, data: { role: 'receiver' } });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects when the mailman has less AP than the amount (boundary: one short)', async () => {
    const { deps } = happyDeps({ player: createFakePlayer({ Player_ID: 1, Discord_ID: MAILMAN, Action_Points: 2 }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'deliver' } });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('accepts when the mailman has exactly the amount (boundary: exact, delivers all AP)', async () => {
    const { deps } = happyDeps({ player: createFakePlayer({ Player_ID: 1, Discord_ID: MAILMAN, Action_Points: 3 }) });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 0 }, // mailman: 3 - 3
      { where: { Player_ID: 1 } },
    );
  });
});

describe('deliver.run success', () => {
  it('transfers the AP with exact write payloads', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: true, kind: 'delivered', data: { amount: 3, receiverUsername: 'postbox' } });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 5 }, // receiver: 2 + 3
      { where: { Player_ID: 2 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 2 }, // mailman: 5 - 3
      { where: { Player_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(2);
  });

  it('delivers the 1-AP minimum', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, amount: 1 }, deps);
    expect(result.data.amount).toBe(1);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 3 }, // receiver: 2 + 1
      { where: { Player_ID: 2 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 4 }, // mailman: 5 - 1
      { where: { Player_ID: 1 } },
    );
  });

  // quirk: unlike gift there is no range or layer check - a Mailman can
  // deliver to anyone anywhere on the board (no tile is ever read)
  it('never reads tiles: no range or layer restriction', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Tiles.findByPk).not.toHaveBeenCalled();
    expect(deps.models.Tiles.findOne).not.toHaveBeenCalled();
  });

  // quirk: no MAX_AP clamp - the receiver can be pushed over their cap
  it('clamps the receiver at MAX_AP instead of overfilling them', async () => {
    const { deps } = happyDeps({
      receiver: createFakePlayer({ Player_ID: 2, Discord_ID: RECEIVER, Action_Points: 9, MAX_AP: 10 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 10 }, // 9 + 3 clamped to MAX_AP 10
      { where: { Player_ID: 2 } },
    );
  });

  // quirk: no dead check on either side - a dead Mailman still delivers
  it('lets a dead Mailman deliver', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: MAILMAN, Action_Points: 5, Dead: true }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  // quirk: self-delivery issues both writes against the same row, so the
  // second (deduct) write wins and the mailman nets a LOSS of the amount
  it('self-delivery loses the amount (last write wins on the same row)', async () => {
    const { deps, player } = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => player);
    const result = await logic.run({ ...INPUT, targetDiscordId: MAILMAN }, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenNthCalledWith(1,
      { Action_Points: 8 }, // 5 + 3
      { where: { Player_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenNthCalledWith(2,
      { Action_Points: 2 }, // 5 - 3 overwrites the credit
      { where: { Player_ID: 1 } },
    );
  });

  it('resolves the default game via getOldestGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(MAILMAN);
  });
});

describe('deliver.present', () => {
  it.each([
    [REJECTIONS.WRONG_CLASS, { className: 'Mailman' }, 'You are not a Mailman!'],
    [REJECTIONS.TARGET_NOT_IN_GAME, { role: 'receiver' }, 'The receiver is not in the game!'],
    [REJECTIONS.NOT_ENOUGH_AP, { action: 'deliver' }, 'You dont have enough AP to deliver!'],
  ])('renders %s byte-identical to the legacy reply', (reason, data, expected) => {
    expect(logic.present({ ok: false, reason, data })).toEqual({ content: expected });
  });

  // quirk pinned: no space between the amount and "AP", exactly as before
  it('renders success with the legacy no-space wording', () => {
    const out = logic.present({ ok: true, kind: 'delivered', data: { amount: 3, receiverUsername: 'postbox' } });
    expect(out).toEqual({ content: 'You have delivered 3AP to postbox!' });
  });
});

describe('deliver adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(deliver.data.toJSON().name).toBe('deliver');
    expect(typeof deliver.execute).toBe('function');
  });
});
