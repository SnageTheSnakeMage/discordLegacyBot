/**
 * /gift - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real.
 */
const logic = require('../../../commands/Player Commands/gift.logic.js');
const gift = require('../../../commands/Player Commands/gift.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile,
} = require('../../helpers/mockModels.js');

const GIVER = '123';
const RECEIVER = '456';

/** deps for the happy path; override per test */
function happyDeps(over = {}) {
  const giver = over.giver || createFakePlayer({ Player_ID: 1, Discord_ID: GIVER, Action_Points: 5, Range_: 3, Tile_ID: 1 });
  const receiver = over.receiver || createFakePlayer({ Player_ID: 2, Discord_ID: RECEIVER, Action_Points: 2, MAX_AP: 10, Tile_ID: 2 });
  const game = over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE });
  const giverTile = over.giverTile || createFakeTile({ Tile_ID: 1, X_Position: 1, Y_Position: 1, Layer_ID: 1 });
  const receiverTile = over.receiverTile || createFakeTile({ Tile_ID: 2, X_Position: 2, Y_Position: 1, Layer_ID: 1 });
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async ({ where }) => (where.Discord_ID === GIVER ? giver : where.Discord_ID === RECEIVER ? receiver : null),
      },
      Classes: { findByPk: async () => over.giverClass || createFakeClass({ Class_Name: 'Average' }) },
      Tiles: { findByPk: async (id) => (id === 1 ? giverTile : receiverTile) },
    },
  });
  return { deps, giver, receiver, game };
}

const INPUT = { amount: 3, targetDiscordId: RECEIVER, gameId: 1, discordId: GIVER, username: 'snage' };

describe('gift.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse({ amount: 3, player: RECEIVER, game: null }, { discordId: GIVER, username: 'snage' });
    expect(input).toEqual({ amount: 3, targetDiscordId: RECEIVER, gameId: null, discordId: GIVER, username: 'snage' });
  });
});

describe('gift.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_GAME);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a receiver who is not in the game', async () => {
    const { deps, giver } = happyDeps();
    deps.models.Players.findOne = jest.fn(async ({ where }) => (where.Discord_ID === GIVER ? giver : null));
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.TARGET_NOT_IN_GAME);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a giver who is not in the game', async () => {
    const { deps, receiver } = happyDeps();
    deps.models.Players.findOne = jest.fn(async ({ where }) => (where.Discord_ID === RECEIVER ? receiver : null));
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a dead giver', async () => {
    const { deps } = happyDeps({ giver: createFakePlayer({ Discord_ID: GIVER, Dead: true }) });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.PLAYER_DEAD);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  // the gamestate table: every state has a defined outcome; adding a state
  // without deciding its gate breaks this test
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

  it('lets a Clockwatcher gift during a timestop', async () => {
    const { deps } = happyDeps({
      game: createFakeGame({ GAME_STATE: GAMESTATES.TIMESTOPPED }),
      giverClass: createFakeClass({ Class_Name: 'Clockwatcher' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects when the giver has less AP than the requested amount (boundary: one short)', async () => {
    const { deps } = happyDeps({ giver: createFakePlayer({ Discord_ID: GIVER, Action_Points: 2, Range_: 3, Tile_ID: 1 }) });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_ENOUGH_AP);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('accepts when the giver has exactly the requested amount (boundary: exact)', async () => {
    const { deps } = happyDeps({ giver: createFakePlayer({ Discord_ID: GIVER, Action_Points: 3, Range_: 3, Tile_ID: 1 }) });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects a receiver out of range', async () => {
    const { deps } = happyDeps({
      receiverTile: createFakeTile({ Tile_ID: 2, X_Position: 9, Y_Position: 1, Layer_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.OUT_OF_RANGE);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a receiver on another layer even when close', async () => {
    const { deps } = happyDeps({
      receiverTile: createFakeTile({ Tile_ID: 2, X_Position: 2, Y_Position: 1, Layer_ID: 2 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.OUT_OF_RANGE);
  });
});

describe('gift.run success', () => {
  it('transfers the AP with exact write payloads', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: true, kind: 'gifted', data: { amount: 3, receiverDiscordId: RECEIVER } });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 5 }, // receiver: 2 + 3
      { where: { Game_ID: 1, Discord_ID: RECEIVER } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 2 }, // giver: 5 - 3
      { where: { Game_ID: 1, Discord_ID: GIVER } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(2);
  });

  it('clamps the gift to the space the receiver has left, and the giver pays only the clamped amount', async () => {
    const { deps } = happyDeps({
      receiver: createFakePlayer({ Player_ID: 2, Discord_ID: RECEIVER, Action_Points: 9, MAX_AP: 10, Tile_ID: 2 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.data.amount).toBe(1);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 10 },
      { where: { Game_ID: 1, Discord_ID: RECEIVER } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 4 }, // giver pays 1, not 3
      { where: { Game_ID: 1, Discord_ID: GIVER } },
    );
  });

  it('resolves the default game via getOldestActiveGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestActiveGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestActiveGameId).toHaveBeenCalledWith(GIVER);
  });
});

describe('gift.present', () => {
  it('renders a rejection as its player-facing message', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.PLAYER_DEAD });
    expect(out).toEqual({ content: "Dead players can't use this command." });
  });

  it('renders success with amount and mention', () => {
    const out = logic.present({ ok: true, kind: 'gifted', data: { amount: 2, receiverDiscordId: RECEIVER, username: 'snage' } });
    expect(out).toEqual({ content: `snage gave 2 AP to <@${RECEIVER}>` });
  });
});

describe('gift adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(gift.data.toJSON().name).toBe('gift');
    expect(typeof gift.execute).toBe('function');
  });
});
