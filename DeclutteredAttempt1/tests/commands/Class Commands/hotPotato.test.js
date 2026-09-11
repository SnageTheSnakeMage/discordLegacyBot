/**
 * /hotpotato - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real
 * except hotPotatoSwap, which writes through utils' own module-level models
 * and so is stubbed where the swap is reached.
 */
const logic = require('../../../commands/Class Commands/hotPotato.logic.js');
const hotPotato = require('../../../commands/Class Commands/hotPotato.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile,
} = require('../../helpers/mockModels.js');

const ACTOR = '123';
const VICTIM = '456';

const INPUT = {
  victimDiscordId: VICTIM,
  victimUsername: 'victim',
  x: 3,
  y: 1,
  gameId: 1,
  discordId: ACTOR,
  username: 'snage',
};

/**
 * Happy-path deps: a Hot Potato at (1,1) with 12 AP and range 3, a victim at
 * (3,1) on the same layer - a line of exactly 3 tiles, so exactly in range.
 */
function happyDeps(over = {}) {
  const player = over.player || createFakePlayer({
    Player_ID: 1, Class_ID: 5, Discord_ID: ACTOR, Action_Points: 12, Range_: 3, Tile_ID: 1,
  });
  const victim = 'victim' in over ? over.victim : createFakePlayer({
    Player_ID: 2, Class_ID: 7, Discord_ID: VICTIM, Tile_ID: 2,
  });
  const game = over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE });
  const playerClass = over.playerClass || createFakeClass({ Class_ID: 5, Class_Name: 'Hot Potato' });
  const playerTile = 'playerTile' in over ? over.playerTile
    : createFakeTile({ Tile_ID: 1, X_Position: 1, Y_Position: 1, Layer_ID: 1 });
  const victimTile = 'victimTile' in over ? over.victimTile
    : createFakeTile({ Tile_ID: 2, X_Position: 3, Y_Position: 1, Layer_ID: 1 });

  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async ({ where }) => (
          where.Discord_ID === ACTOR ? player : where.Discord_ID === VICTIM ? victim : null
        ),
      },
      Classes: { findByPk: async () => playerClass },
      Tiles: {
        findByPk: async () => playerTile,
        findOne: async () => victimTile,
      },
    },
  });
  deps.utils = { ...deps.utils, hotPotatoSwap: jest.fn(async () => undefined) };
  return { deps, player, victim, game, playerTile, victimTile };
}

describe('hotPotato.parse', () => {
  it('maps raw options onto the input', () => {
    const input = logic.parse(
      { victim: VICTIM, victimUsername: 'victim', x: 3, y: 1, game: 2 },
      { discordId: ACTOR, username: 'snage' },
    );
    expect(input).toEqual({
      victimDiscordId: VICTIM,
      victimUsername: 'victim',
      x: 3,
      y: 1,
      gameId: 2,
      discordId: ACTOR,
      username: 'snage',
    });
  });

  it('defaults an absent game to null and an absent victim username to null', () => {
    const input = logic.parse(
      { victim: VICTIM, victimUsername: null, x: 0, y: 0, game: null },
      { discordId: ACTOR, username: 'snage' },
    );
    expect(input.gameId).toBeNull();
    expect(input.victimUsername).toBeNull();
    expect(input.x).toBe(0);
    expect(input.y).toBe(0);
  });
});

describe('hotPotato.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects an actor who is not in the game and writes nothing', async () => {
    const { deps, victim } = happyDeps();
    deps.models.Players.findOne = jest.fn(async ({ where }) => (where.Discord_ID === VICTIM ? victim : null));
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects an actor who is not a Hot Potato and writes nothing', async () => {
    const { deps } = happyDeps({ playerClass: createFakeClass({ Class_ID: 5, Class_Name: 'Average' }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Hot Potato' } });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects when the actor has no class row and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Classes.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_CLASS);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a victim who is not in the game and writes nothing', async () => {
    const { deps } = happyDeps({ victim: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME, data: { role: 'victim' } });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects when the actor has no tile and writes nothing', async () => {
    const { deps } = happyDeps({ playerTile: null });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_TILE);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects coordinates with no tile on the actor\'s layer and writes nothing', async () => {
    const { deps } = happyDeps({ victimTile: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.TARGET_NOT_ON_TILE, data: { role: 'victim' } });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a victim standing somewhere other than the given tile', async () => {
    const { deps } = happyDeps({
      victim: createFakePlayer({ Player_ID: 2, Class_ID: 7, Discord_ID: VICTIM, Tile_ID: 99 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.TARGET_NOT_ON_TILE);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a victim one tile beyond range and writes nothing (boundary: one beyond)', async () => {
    // range 3, victim at (4,1) -> a line of 4 tiles
    const { deps } = happyDeps({
      victimTile: createFakeTile({ Tile_ID: 2, X_Position: 4, Y_Position: 1, Layer_ID: 1 }),
    });
    const result = await logic.run({ ...INPUT, x: 4 }, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { role: 'victim' } });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('accepts a victim at exactly maximum range (boundary: exact)', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects one AP short of the 12 AP cost and writes nothing (boundary: one short)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Class_ID: 5, Discord_ID: ACTOR, Action_Points: 11, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'swap classes' } });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('accepts exactly 12 AP (boundary: exact)', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });
});

describe('hotPotato.run gamestate gate', () => {
  // every gamestate has a decided outcome; adding a state without deciding
  // its gate fails the coverage test below
  const OUTCOMES = {
    [GAMESTATES.ACTIVE]: null,
    [GAMESTATES.REGISTRATION]: null,
    [GAMESTATES.INACTIVE]: null,
    [GAMESTATES.SANDBOX]: null,
    [GAMESTATES.FINALE]: null,
    [GAMESTATES.OVER]: REJECTIONS.GAME_OVER,
    [GAMESTATES.DEV_PAUSED]: REJECTIONS.GAME_PAUSED,
    [GAMESTATES.TIMESTOPPED]: REJECTIONS.TIME_STOPPED,
  };

  it('decides an outcome for all 8 gamestates', () => {
    expect(Object.keys(OUTCOMES).sort()).toEqual(Object.values(GAMESTATES).sort());
  });

  it.each(Object.values(GAMESTATES).map((state) => [state, OUTCOMES[state]]))(
    'gamestate %s -> %s', async (state, reason) => {
      const { deps } = happyDeps({ game: createFakeGame({ GAME_STATE: state }) });
      const result = await logic.run(INPUT, deps);
      if (reason === null) {
        expect(result.ok).toBe(true);
      } else {
        expect(result).toMatchObject({ ok: false, reason });
        expect(deps.models.Players.update).not.toHaveBeenCalled();
      }
    },
  );

  it('blocks a timestop even though the actor is a Hot Potato (isClockwatcher is always false here)', async () => {
    const { deps } = happyDeps({ game: createFakeGame({ GAME_STATE: GAMESTATES.TIMESTOPPED }) });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.TIME_STOPPED);
  });
});

describe('hotPotato.run success', () => {
  it('swaps the two Class_IDs with exact write payloads', async () => {
    const { deps, player, victim } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: true,
      kind: 'classesSwapped',
      data: { victimUsername: 'victim', victimDiscordId: VICTIM },
    });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Class_ID: 7 }, { where: { Player_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Class_ID: 5 }, { where: { Player_ID: 2 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(2);
    expect(deps.utils.hotPotatoSwap).toHaveBeenCalledWith(player, victim, 'snage', 'victim');
  });

  // PRESERVED QUIRK: the 12 AP is required but never spent
  it('does not deduct the 12 AP it requires', async () => {
    const { deps } = happyDeps();
    await logic.run(INPUT, deps);
    for (const call of deps.models.Players.update.mock.calls) {
      expect(call[0]).not.toHaveProperty('Action_Points');
    }
  });

  it('carries the extra line hotPotatoSwap returns', async () => {
    const { deps } = happyDeps();
    deps.utils.hotPotatoSwap = jest.fn(async () => "snage took victim's twin body!");
    const result = await logic.run(INPUT, deps);
    expect(result.data.extraResponse).toBe("snage took victim's twin body!");
  });

  it('resolves the default game via getOldestGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils.getOldestGameId = jest.fn(async () => 1);
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(ACTOR);
  });
});

describe('hotPotato.present', () => {
  it.each([
    [REJECTIONS.WRONG_CLASS, { className: 'Hot Potato' }, 'You are not a Hot Potato!'],
    [REJECTIONS.TARGET_NOT_IN_GAME, { role: 'victim' }, 'The victim is not in the game!'],
    [REJECTIONS.TARGET_NOT_ON_TILE, { role: 'victim' }, 'The victim is not on the tile provided!'],
    [REJECTIONS.OUT_OF_RANGE, { role: 'victim' }, 'Your victim is not in range!'],
    [REJECTIONS.NOT_ENOUGH_AP, { action: 'swap classes' }, 'You dont have enough AP to swap classes!'],
  ])('renders %s with the legacy wording', (reason, data, content) => {
    expect(logic.present({ ok: false, reason, data })).toEqual({ content });
  });

  it('renders the crash-fix rejections as non-empty text', () => {
    for (const reason of [REJECTIONS.NO_SUCH_GAME, REJECTIONS.NOT_IN_GAME, REJECTIONS.NO_SUCH_TILE]) {
      const out = logic.present({ ok: false, reason, data: {} });
      expect(typeof out.content).toBe('string');
      expect(out.content.length).toBeGreaterThan(0);
    }
  });

  it('renders success with the swap line appended', () => {
    const out = logic.present({
      ok: true,
      kind: 'classesSwapped',
      data: { victimUsername: 'victim', victimDiscordId: VICTIM, extraResponse: "snage took victim's target!" },
    });
    expect(out).toEqual({ content: "You have swapped classes with victim!\nsnage took victim's target!" });
  });

  // PRESERVED QUIRK: classes with no special case return undefined from
  // hotPotatoSwap, and the legacy reply concatenated it verbatim
  it('appends the literal "undefined" when the swap has no extra line', () => {
    const out = logic.present({
      ok: true,
      kind: 'classesSwapped',
      data: { victimUsername: 'victim', victimDiscordId: VICTIM, extraResponse: undefined },
    });
    expect(out).toEqual({ content: 'You have swapped classes with victim!\nundefined' });
  });
});

describe('hotPotato adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(hotPotato.data.toJSON().name).toBe('hotpotato');
    expect(typeof hotPotato.execute).toBe('function');
  });
});
