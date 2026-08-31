/**
 * /weaponize - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real.
 */
const logic = require('../../../commands/Class Commands/weaponize.logic.js');
const weaponize = require('../../../commands/Class Commands/weaponize.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile,
} = require('../../helpers/mockModels.js');

const SMITH = '123';
const TARGET = '456';

/** deps for the happy path; override per test */
function happyDeps(over = {}) {
  const player = over.player || createFakePlayer({
    Player_ID: 1, Class_ID: 5, Discord_ID: SMITH, Action_Points: 6, Range_: 3, Tile_ID: 1,
  });
  const targetPlayer = over.targetPlayer === null ? null : (over.targetPlayer || createFakePlayer({
    Player_ID: 2, Class_ID: 1, Discord_ID: TARGET, Tile_ID: 2, DMG_BUFF: 0,
  }));
  const game = over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE });
  const playersTile = over.playersTile || createFakeTile({ Tile_ID: 1, X_Position: 1, Y_Position: 1, Layer_ID: 1 });
  const targetTile = over.targetTile === null ? null : (over.targetTile || createFakeTile({
    Tile_ID: 2, X_Position: 2, Y_Position: 1, Layer_ID: 1,
  }));
  const playerClass = over.playerClass || createFakeClass({ Class_ID: 5, Class_Name: 'Blacksmith' });

  const deps = createDeps({
    models: {
      Games: { findByPk: async (id) => (id === null || id === undefined ? null : game) },
      Players: {
        findOne: async ({ where }) => (where.Discord_ID === SMITH ? player : where.Discord_ID === TARGET ? targetPlayer : null),
      },
      Classes: { findByPk: async () => playerClass },
      Tiles: {
        findOne: async ({ where }) => {
          if (where.Tile_ID !== undefined) {
            return where.Tile_ID === playersTile.Tile_ID ? playersTile : null;
          }
          if (!targetTile) return null;
          const match = where.Layer_ID === targetTile.Layer_ID
            && where.X_Position === targetTile.X_Position
            && where.Y_Position === targetTile.Y_Position;
          return match ? targetTile : null;
        },
      },
    },
  });
  return { deps, player, targetPlayer, game, playersTile, targetTile };
}

const INPUT = {
  targetDiscordId: TARGET,
  targetUsername: 'friend',
  x: 2,
  y: 1,
  gameId: 1,
  discordId: SMITH,
};

describe('weaponize.parse', () => {
  it('maps raw options', () => {
    const input = logic.parse(
      { player: TARGET, playerUsername: 'friend', x: 4, y: 5, game: 2 },
      { discordId: SMITH, username: 'snage' },
    );
    expect(input).toEqual({
      targetDiscordId: TARGET, targetUsername: 'friend', x: 4, y: 5, gameId: 2, discordId: SMITH,
    });
  });

  it('defaults an absent player option to the actor (the old code crashed here)', () => {
    const input = logic.parse(
      { player: null, playerUsername: null, x: null, y: null, game: null },
      { discordId: SMITH, username: 'snage' },
    );
    expect(input).toEqual({
      targetDiscordId: SMITH, targetUsername: 'snage', x: null, y: null, gameId: null, discordId: SMITH,
    });
  });
});

describe('weaponize.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_GAME);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  // quirk: there is no default-game lookup, so omitting the game option finds
  // nothing at all rather than the oldest active game the description promises
  it('rejects with no game option instead of resolving a default game', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_GAME);
    expect(deps.models.Games.findByPk).toHaveBeenCalledWith(null);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a Blacksmith who is not in the game', async () => {
    const { deps } = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
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

  // quirk: isClockwatcher is hardcoded false, so a timestop blocks everyone
  it('blocks during a timestop even when the actor is a Clockwatcher', async () => {
    const { deps } = happyDeps({
      game: createFakeGame({ GAME_STATE: GAMESTATES.TIMESTOPPED }),
      playerClass: createFakeClass({ Class_ID: 5, Class_Name: 'Clockwatcher' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.TIME_STOPPED);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects coordinates that are not a tile in the game', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, x: 9, y: 9 }, deps);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_TILE);
    expect(logic.present(result)).toEqual({ content: 'The tile provided is not in the game!' });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a target who is not in the game', async () => {
    const { deps } = happyDeps({ targetPlayer: null });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_TARGET);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a target standing on a different tile than the one provided', async () => {
    const { deps } = happyDeps({
      targetPlayer: createFakePlayer({ Player_ID: 2, Discord_ID: TARGET, Tile_ID: 7, DMG_BUFF: 0 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.TARGET_NOT_ON_TILE);
    expect(logic.present(result)).toEqual({ content: 'Your target is not on the tile provided!' });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a tile one step beyond range (boundary: one too far)', async () => {
    // line from (1,1) to (4,1) is 4 tiles long; Range_ is 3
    const { deps } = happyDeps({
      targetTile: createFakeTile({ Tile_ID: 2, X_Position: 4, Y_Position: 1, Layer_ID: 1 }),
    });
    const result = await logic.run({ ...INPUT, x: 4, y: 1 }, deps);
    expect(result.reason).toBe(REJECTIONS.OUT_OF_RANGE);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('accepts a tile at exactly max range (boundary: exact)', async () => {
    // line from (1,1) to (3,1) is 3 tiles long; Range_ is 3
    const { deps } = happyDeps({
      targetTile: createFakeTile({ Tile_ID: 2, X_Position: 3, Y_Position: 1, Layer_ID: 1 }),
    });
    const result = await logic.run({ ...INPUT, x: 3, y: 1 }, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects a player who is not a Blacksmith', async () => {
    const { deps } = happyDeps({ playerClass: createFakeClass({ Class_ID: 5, Class_Name: 'Doctor' }) });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_CLASS);
    expect(logic.present(result)).toEqual({ content: 'You are not a Blacksmith!' });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects when the class row is missing', async () => {
    const { deps } = happyDeps();
    deps.models.Classes.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_CLASS);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects one AP short of the cost (boundary: 5 of 6)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Class_ID: 5, Discord_ID: SMITH, Action_Points: 5, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_ENOUGH_AP);
    expect(logic.present(result)).toEqual({ content: 'You dont have enough AP to weaponize!' });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('accepts exactly the AP cost (boundary: 6 of 6)', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 0 },
      { where: { Game_ID: 1, Discord_ID: SMITH } },
    );
  });
});

describe('weaponize.run success', () => {
  it('buffs the target and takes the AP with exact write payloads', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Class_ID: 5, Discord_ID: SMITH, Action_Points: 10, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: true,
      kind: 'weaponized',
      data: { targetUsername: 'friend', targetDiscordId: TARGET, dmgBuff: 1 },
    });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { DMG_BUFF: 1 },
      { where: { Game_ID: 1, Discord_ID: TARGET } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 4 }, // 10 - 6
      { where: { Game_ID: 1, Discord_ID: SMITH } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(2);
  });

  // quirk: the buff is incremented, not set, so it stacks
  it('stacks the buff on a target who already has one', async () => {
    const { deps } = happyDeps({
      targetPlayer: createFakePlayer({ Player_ID: 2, Discord_ID: TARGET, Tile_ID: 2, DMG_BUFF: 2 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.data.dmgBuff).toBe(3);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { DMG_BUFF: 3 },
      { where: { Game_ID: 1, Discord_ID: TARGET } },
    );
  });

  it('defaults the coordinates to the Blacksmith\'s own tile', async () => {
    // the target shares the Blacksmith's tile; x and y are omitted
    const { deps } = happyDeps({
      targetTile: createFakeTile({ Tile_ID: 1, X_Position: 1, Y_Position: 1, Layer_ID: 1 }),
      targetPlayer: createFakePlayer({ Player_ID: 2, Discord_ID: TARGET, Tile_ID: 1, DMG_BUFF: 0 }),
    });
    const result = await logic.run({ ...INPUT, x: null, y: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Tiles.findOne).toHaveBeenCalledWith(
      { where: { Layer_ID: 1, X_Position: 1, Y_Position: 1 } },
    );
  });

  // quirk: nothing stops a Blacksmith buffing themselves
  it('lets a Blacksmith weaponize themselves', async () => {
    const smith = createFakePlayer({
      Player_ID: 1, Class_ID: 5, Discord_ID: SMITH, Action_Points: 6, Range_: 3, Tile_ID: 1, DMG_BUFF: 0,
    });
    const { deps } = happyDeps({
      player: smith,
      targetTile: createFakeTile({ Tile_ID: 1, X_Position: 1, Y_Position: 1, Layer_ID: 1 }),
    });
    deps.models.Players.findOne = jest.fn(async () => smith);
    const result = await logic.run(
      { ...INPUT, targetDiscordId: SMITH, targetUsername: 'snage', x: null, y: null },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { DMG_BUFF: 1 },
      { where: { Game_ID: 1, Discord_ID: SMITH } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 0 },
      { where: { Game_ID: 1, Discord_ID: SMITH } },
    );
  });
});

describe('weaponize.present', () => {
  it('renders success with the target username', () => {
    const out = logic.present({
      ok: true, kind: 'weaponized', data: { targetUsername: 'friend', targetDiscordId: TARGET, dmgBuff: 1 },
    });
    expect(out).toEqual({
      content: 'You have given friend a double damage buff! Their next attack(shoot, punish, or snipe) will do x2 damage!',
    });
  });

  it.each([
    [REJECTIONS.NO_SUCH_GAME, { gameId: 1 }, 'Could not find game #1!'],
    [REJECTIONS.NOT_IN_GAME, undefined, 'Player not found in game!, please register for the game you wish to play in.'],
    [REJECTIONS.NO_SUCH_TILE, { message: 'The tile provided is not in the game!' }, 'The tile provided is not in the game!'],
    [REJECTIONS.NO_TARGET, undefined, 'Could not find target player!'],
    [REJECTIONS.TARGET_NOT_ON_TILE, { message: 'Your target is not on the tile provided!' }, 'Your target is not on the tile provided!'],
    [REJECTIONS.OUT_OF_RANGE, undefined, 'Your target is not in range!'],
    [REJECTIONS.WRONG_CLASS, { className: 'Blacksmith' }, 'You are not a Blacksmith!'],
    [REJECTIONS.NOT_ENOUGH_AP, { action: 'weaponize' }, 'You dont have enough AP to weaponize!'],
    [REJECTIONS.GAME_OVER, undefined, 'Game is over! only the dev can use commands for this game at this time.\n Please register on a new game.'],
    [REJECTIONS.GAME_PAUSED, undefined, 'Game is paused! only the dev can use commands for this game at this time.'],
    [REJECTIONS.TIME_STOPPED, undefined, 'Time is stopped! only Clockwatchers can use commands at this time.'],
  ])('renders %s as its player-facing message', (reason, data, text) => {
    expect(logic.present({ ok: false, reason, data })).toEqual({ content: text });
  });
});

describe('weaponize adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(weaponize.data.toJSON().name).toBe('weaponize');
    expect(typeof weaponize.execute).toBe('function');
  });
});
