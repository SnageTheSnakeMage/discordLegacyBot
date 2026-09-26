/**
 * /sandbox - logic tests for the read-only subcommands.
 *
 * The gate is the part worth guarding hardest: these are debug powers, and
 * the only thing standing between them and a live game is the SANDBOX check.
 */
const fs = require('fs');
const logic = require('../../../commands/Player Commands/sandbox.logic.js');
const sandbox = require('../../../commands/Player Commands/sandbox.js');
const { GAMESTATES, REJECTIONS, ChaosEvents } = require('../../../enums.js');
const { createDeps, createFakeGame, createFakePlayer, createFakeTile, createFakeLayer, createFakeClass } = require('../../helpers/mockModels.js');

const PLAYER = '123';

function happyDeps(over = {}) {
  const game = over.game || createFakeGame({ Game_ID: 7, GAME_STATE: GAMESTATES.ACTIVE, sandbox: true, CURR_CC_EVENT: 'Blockade' });
  const layers = over.layers || [createFakeLayer({ Layer_ID: 11 }), createFakeLayer({ Layer_ID: 22 })];
  const tile = 'tile' in over ? over.tile : createFakeTile({ Tile_ID: 99, Layer_ID: 11, X_Position: 3, Y_Position: 4, Tile_Type: 'Blank1' });
  return createDeps({
    models: {
      Games: {
        findByPk: async () => game,
        findAll: async () => (game.sandbox ? [game] : []),
      },
      Players: {
        findAll: async () => (over.membership || [createFakePlayer({ Game_ID: 7, Discord_ID: PLAYER })]),
        findOne: async () => ('player' in over ? over.player : createFakePlayer({ Player_ID: 5, Game_ID: 7, Discord_ID: PLAYER, Tile_ID: 40, Tile_ID2: null, Health_Points: 8 })),
      },
      Layers: { findAll: async () => layers },
      Tiles: { findOne: async () => tile },
    },
  });
}

const input = (over = {}) => ({
  subcommand: 'get-tile-id', x: 3, y: 4, layer: 1, gameId: 7, discordId: PLAYER, ...over,
});

describe('sandbox.parse', () => {
  it('carries the subcommand and the options through', () => {
    expect(logic.parse({ subcommand: 'get-tile-id', x: 1, y: 2, layer: 3, game: 4 }, { discordId: PLAYER }))
      .toEqual({ subcommand: 'get-tile-id', x: 1, y: 2, layer: 3, gameId: 4, column: null, value: null, tileId: null, classId: null, minutes: null, times: null, event: null, discordId: PLAYER });
  });

  it('nulls every absent option rather than leaving it undefined', () => {
    expect(logic.parse({ subcommand: 'view-chaos' }, { discordId: PLAYER }))
      .toEqual({ subcommand: 'view-chaos', x: null, y: null, layer: null, gameId: null, column: null, value: null, tileId: null, classId: null, minutes: null, times: null, event: null, discordId: PLAYER });
  });

  it('folds set-stat\'s stat and set-meta\'s field into one column name', () => {
    expect(logic.parse({ subcommand: 'set-stat', stat: 'Health_Points', value: 4 }, { discordId: PLAYER }).column).toBe('Health_Points');
    expect(logic.parse({ subcommand: 'set-meta', field: 'Class_ID', value: 9 }, { discordId: PLAYER }).column).toBe('Class_ID');
  });
});

describe('the sandbox gate', () => {
  it('refuses a game that is not in SANDBOX, naming the state it is in', async () => {
    const deps = happyDeps({ game: createFakeGame({ Game_ID: 7, GAME_STATE: GAMESTATES.ACTIVE }) });
    const result = await logic.run(input(), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_SANDBOX, data: { gamestate: GAMESTATES.ACTIVE } });
    expect(logic.present(result).content).toContain('ACTIVE');
  });

  it('refuses a game id that does not exist', async () => {
    const deps = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    expect((await logic.run(input(), deps)).reason).toBe(REJECTIONS.NO_SUCH_GAME);
  });

  it('tells a player with no sandbox game so, instead of throwing', async () => {
    // utils.getOldestGamestateGameId would throw on an empty list here, which
    // is exactly why the gate resolves the game itself
    const deps = happyDeps({ membership: [] });
    deps.models.Games.findAll = jest.fn(async () => []);
    const result = await logic.run(input({ gameId: null }), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expect(logic.present(result).content).toContain('not in a sandbox game');
  });

  it('defaults to the oldest sandbox game the player is in', async () => {
    const older = createFakeGame({ Game_ID: 2, GAME_STATE: GAMESTATES.ACTIVE, sandbox: true });
    const newer = createFakeGame({ Game_ID: 9, GAME_STATE: GAMESTATES.ACTIVE, sandbox: true });
    const deps = happyDeps();
    deps.models.Games.findAll = jest.fn(async () => [newer, older]);
    const result = await logic.run(input({ gameId: null, subcommand: 'view-chaos' }), deps);
    expect(result.data.gameId).toBe(2);
  });

  it('never reads a game the caller did not ask for when they gave an id', async () => {
    const deps = happyDeps();
    await logic.run(input(), deps);
    expect(deps.models.Games.findByPk).toHaveBeenCalledWith(7);
  });
});

describe('sandbox get-tile-id', () => {
  it('returns the Tile_ID and what is on it', async () => {
    const result = await logic.run(input(), happyDeps());
    expect(result).toMatchObject({ ok: true, kind: 'tileId', data: { tileId: 99, layerId: 11, tileType: 'Blank1' } });
    expect(logic.present(result).content).toContain('Tile_ID **99**');
  });

  it('maps the 1-based layer option onto the game\'s Layer_IDs', async () => {
    const deps = happyDeps();
    await logic.run(input({ layer: 2 }), deps);
    expect(deps.models.Tiles.findOne).toHaveBeenCalledWith({ where: { Layer_ID: 22, X_Position: 3, Y_Position: 4 } });
  });

  it('rejects a layer the game does not have, saying how many it has', async () => {
    const result = await logic.run(input({ layer: 5 }), happyDeps());
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_LAYER });
    expect(logic.present(result).content).toContain('2 layer(s)');
  });

  it('rejects a position with no tile', async () => {
    const result = await logic.run(input(), happyDeps({ tile: null }));
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_TILE);
  });
});

describe('sandbox get-classes', () => {
  it('sends the csv that actually exists in the repo', async () => {
    const result = await logic.run(input({ subcommand: 'get-classes' }), happyDeps());
    expect(result).toMatchObject({ ok: true, kind: 'classes' });
    // a path that does not resolve would attach nothing and say nothing
    expect(fs.existsSync(result.data.filePath)).toBe(true);
    expect(fs.readFileSync(result.data.filePath, 'utf8').split('\n')[0]).toContain('id,class');
    expect(logic.present(result).files).toEqual([{ path: result.data.filePath, name: 'classes.csv' }]);
  });
});

describe('sandbox view-chaos', () => {
  it('lists every event set-chaos accepts, and the current one', async () => {
    const result = await logic.run(input({ subcommand: 'view-chaos' }), happyDeps());
    expect(result.data.events).toEqual(Object.keys(ChaosEvents));
    expect(result.data.current).toBe('Blockade');
    const { content } = logic.present(result);
    expect(content).toContain('- Blockade');
    expect(content).toContain('Currently set: **Blockade**');
  });

  it('stays inside Discord\'s 2000 character message limit', () => {
    // the descriptions together run well past it, which is why only the names
    // are listed
    const content = logic.present({
      ok: true,
      kind: 'chaosList',
      data: { events: Object.keys(ChaosEvents), current: null, gameId: 1 },
    }).content;
    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content).toContain('Currently set: **none**');
  });
});

describe('the read-only subcommands stay read-only', () => {
  it.each(['get-tile-id', 'get-classes', 'view-chaos'])('%s writes nothing', async (subcommand) => {
    const deps = happyDeps();
    await logic.run(input({ subcommand }), deps);
    for (const model of ['Games', 'Players', 'Tiles', 'Layers']) {
      expect(deps.models[model].update).not.toHaveBeenCalled();
      expect(deps.models[model].create).not.toHaveBeenCalled();
      expect(deps.models[model].destroy).not.toHaveBeenCalled();
    }
  });
});

describe('the writing subcommands require membership', () => {
  it.each(['reset', 'set-stat', 'set-meta'])('%s refuses a caller who is not in the game', async (subcommand) => {
    const deps = happyDeps({ player: null });
    const result = await logic.run(input({ subcommand, column: 'Health_Points', value: 1 }), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_IN_GAME });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
    expect(deps.models.Players.destroy).not.toHaveBeenCalled();
  });
});

describe('sandbox set-stat / set-meta', () => {
  it('writes the column and reports what it was before', async () => {
    const deps = happyDeps();
    const result = await logic.run(input({ subcommand: 'set-stat', column: 'Health_Points', value: 3 }), deps);
    expect(result).toMatchObject({ ok: true, kind: 'columnSet', data: { column: 'Health_Points', before: 8, after: 3 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Health_Points: 3 }, { where: { Player_ID: 5 } });
    expect(logic.present(result).content).toContain('**Health_Points** 8 -> **3**');
  });

  it('keys the write on Player_ID, so it can only ever hit the caller', async () => {
    const deps = happyDeps();
    await logic.run(input({ subcommand: 'set-meta', column: 'Class_ID', value: 10 }), deps);
    const [, where] = deps.models.Players.update.mock.calls[0];
    expect(where).toEqual({ where: { Player_ID: 5 } });
  });

  it.each([
    ['set-stat', 'Discord_ID'],
    ['set-stat', 'Game_ID'],
    ['set-stat', 'Player_ID'],
    ['set-stat', 'Class_ID'],
    ['set-meta', 'Health_Points'],
  ])('%s refuses to write %s', async (subcommand, column) => {
    // the identity columns are the ones that matter: a player must never be
    // able to rewrite whose row it is. Class_ID/Health_Points are here to pin
    // that the two allowlists really are separate.
    const deps = happyDeps();
    const result = await logic.run(input({ subcommand, column, value: 1 }), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.INVALID_AMOUNT });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('lists the legal columns when one is refused', async () => {
    const result = await logic.run(input({ subcommand: 'set-stat', column: 'nonsense', value: 1 }), happyDeps());
    expect(logic.present(result).content).toContain('Action_Points');
  });
});

describe('sandbox reset', () => {
  function resetDeps(over = {}) {
    const deps = happyDeps(over);
    const respawned = createFakePlayer({ Player_ID: 6, Game_ID: 7, Discord_ID: PLAYER, Tile_ID: 77 });
    let call = 0;
    deps.models.Players.findOne = jest.fn(async () => {
      call += 1;
      // first call is the membership check, second reads the respawned row
      if (call === 1) return 'player' in over ? over.player : createFakePlayer({ Player_ID: 5, Game_ID: 7, Discord_ID: PLAYER, Tile_ID: 40, Tile_ID2: over.tileId2 ?? null });
      return respawned;
    });
    deps.utils = {
      ...deps.utils,
      clearPlayerFromBoard: jest.fn(async () => undefined),
      spawnPlayer: jest.fn(async () => ({ Class_ID: 3, Class_Name: 'Hunter' })),
    };
    return deps;
  }

  it('clears the board, destroys the row, then respawns', async () => {
    const deps = resetDeps();
    const result = await logic.run(input({ subcommand: 'reset' }), deps);

    expect(deps.utils.clearPlayerFromBoard).toHaveBeenCalledWith(5, 40, 'Tile_ID');
    expect(deps.models.Players.destroy).toHaveBeenCalledWith({ where: { Player_ID: 5 } });
    expect(deps.utils.spawnPlayer).toHaveBeenCalledWith(7, PLAYER);
    expect(result).toMatchObject({ ok: true, kind: 'reset', data: { oldPlayerId: 5, newPlayerId: 6, className: 'Hunter' } });
  });

  it('clears a Twin\'s second body too', async () => {
    const deps = resetDeps({ tileId2: 41 });
    await logic.run(input({ subcommand: 'reset' }), deps);
    expect(deps.utils.clearPlayerFromBoard).toHaveBeenCalledWith(5, 41, 'Tile_ID2');
    expect(deps.utils.clearPlayerFromBoard).toHaveBeenCalledTimes(2);
  });

  it('leaves the second body alone when there is not one', async () => {
    const deps = resetDeps();
    await logic.run(input({ subcommand: 'reset' }), deps);
    expect(deps.utils.clearPlayerFromBoard).toHaveBeenCalledTimes(1);
  });

  it('never downloads an icon - a reset has no attachment to take one from', async () => {
    const deps = resetDeps();
    deps.utils.downloadImageWithFetch = jest.fn();
    deps.utils.registerPlayer = jest.fn();
    await logic.run(input({ subcommand: 'reset' }), deps);
    expect(deps.utils.downloadImageWithFetch).not.toHaveBeenCalled();
    expect(deps.utils.registerPlayer).not.toHaveBeenCalled();
  });

  it('says what it rolled and where it put you', async () => {
    const deps = resetDeps();
    const { content } = logic.present(await logic.run(input({ subcommand: 'reset' }), deps));
    expect(content).toContain('Rolled **Hunter**');
    expect(content).toContain('Tile_ID 77');
    expect(content).toContain('icon was left as it is');
  });
});

describe('sandbox ap-time', () => {
  it('writes AP_INTERVAL_MIN and reports the old value', async () => {
    const deps = happyDeps();
    const result = await logic.run(input({ subcommand: 'ap-time', minutes: 5 }), deps);
    expect(deps.models.Games.update).toHaveBeenCalledWith({ AP_INTERVAL_MIN: 5 }, { where: { Game_ID: 7 } });
    expect(result).toMatchObject({ ok: true, kind: 'apTime', data: { before: 720, after: 5 } });
  });
});

describe('sandbox set-chaos', () => {
  it('sets an event the enum knows', async () => {
    const deps = happyDeps();
    const result = await logic.run(input({ subcommand: 'set-chaos', event: 'Leftovers' }), deps);
    expect(deps.models.Games.update).toHaveBeenCalledWith({ CURR_CC_EVENT: 'Leftovers' }, { where: { Game_ID: 7 } });
    expect(result).toMatchObject({ ok: true, kind: 'chaosSet', data: { before: 'Blockade', after: 'Leftovers' } });
  });

  it('refuses an event the enum does not know, and says where the list is', async () => {
    const deps = happyDeps();
    const result = await logic.run(input({ subcommand: 'set-chaos', event: 'leftovers' }), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.INVALID_AMOUNT });
    expect(deps.models.Games.update).not.toHaveBeenCalled();
    // the names are case sensitive, which is the mistake worth naming
    expect(logic.present(result).content).toContain('view-chaos');
  });

  it('accepts every name view-chaos lists, so the two cannot disagree', async () => {
    for (const name of Object.keys(ChaosEvents)) {
      const deps = happyDeps();
      expect((await logic.run(input({ subcommand: 'set-chaos', event: name }), deps)).ok).toBe(true);
    }
  });
});

describe('sandbox ap-tick', () => {
  it('returns a plan and distributes nothing itself', async () => {
    // run() has no client, so the adapter does the distributing
    const deps = happyDeps();
    deps.utils = { ...deps.utils, distributeAP: jest.fn() };
    const result = await logic.run(input({ subcommand: 'ap-tick', times: 3 }), deps);
    expect(result).toMatchObject({ ok: true, kind: 'apTick', data: { gameId: 7, times: 3 } });
    expect(deps.utils.distributeAP).not.toHaveBeenCalled();
    expect(deps.models.Games.update).not.toHaveBeenCalled();
  });

  it('still needs the caller to be in the game', async () => {
    const deps = happyDeps({ player: null });
    expect((await logic.run(input({ subcommand: 'ap-tick', times: 1 }), deps)).reason).toBe(REJECTIONS.NOT_IN_GAME);
  });

  it('says that no poll was posted, so the silence is not a bug report', async () => {
    const { content } = logic.present(await logic.run(input({ subcommand: 'ap-tick', times: 2 }), happyDeps()));
    expect(content).toContain('Ran 2 AP distributions');
    expect(content).toContain('No chaos poll');
  });
});

describe('sandbox summon-dummy', () => {
  function dummyDeps(over = {}) {
    const deps = happyDeps(over);
    const tile = 'dummyTile' in over ? over.dummyTile
      : createFakeTile({ Tile_ID: 99, Layer_ID: 11, Player1: null, Player2: null, Player3: null, Player4: null });
    deps.models.Tiles.findByPk = jest.fn(async () => tile);
    deps.models.Layers.findByPk = jest.fn(async () => ('layer' in over ? over.layer : createFakeLayer({ Layer_ID: 11, Game_ID: 7 })));
    deps.models.Classes.findByPk = jest.fn(async () => ('dummyClass' in over ? over.dummyClass
      : createFakeClass({ Class_ID: 4, Class_Name: 'Average', Start_HP: 10, Start_AP: 4 })));
    deps.models.Players.findAll = jest.fn(async () => (over.existing || []));
    deps.models.Players.findOne = jest.fn(async ({ where }) => (
      String(where.Discord_ID).startsWith('dummy-')
        ? createFakePlayer({ Player_ID: 30, Discord_ID: where.Discord_ID, Game_ID: 7 })
        : createFakePlayer({ Player_ID: 5, Game_ID: 7, Discord_ID: PLAYER })
    ));
    return deps;
  }

  const summon = (over = {}) => input({ subcommand: 'summon-dummy', tileId: 99, classId: 4, ...over });

  it('creates the row with the class\'s starting stats and a synthetic id', async () => {
    const deps = dummyDeps();
    const result = await logic.run(summon(), deps);

    const [row] = deps.models.Players.create.mock.calls[0];
    expect(row).toMatchObject({ Class_ID: 4, Game_ID: 7, Tile_ID: 99, Health_Points: 10, Action_Points: 4 });
    // not a snowflake: real ids are all digits, so this can never collide
    expect(row.Discord_ID).toBe('dummy-7-1');
    expect(/^\d+$/.test(row.Discord_ID)).toBe(false);
    expect(result).toMatchObject({ ok: true, kind: 'dummy', data: { className: 'Average', tileId: 99 } });
  });

  it('numbers each dummy after the ones already in the game', async () => {
    const deps = dummyDeps({
      existing: [
        createFakePlayer({ Discord_ID: 'dummy-7-1' }),
        createFakePlayer({ Discord_ID: '123456789' }),
        createFakePlayer({ Discord_ID: 'dummy-7-2' }),
      ],
    });
    await logic.run(summon(), deps);
    expect(deps.models.Players.create.mock.calls[0][0].Discord_ID).toBe('dummy-7-3');
  });

  it('points the tile back at the dummy, not just the dummy at the tile', async () => {
    const deps = dummyDeps();
    await logic.run(summon(), deps);
    expect(deps.models.Tiles.update).toHaveBeenCalledWith({ Player1: 30 }, { where: { Tile_ID: 99 } });
  });

  it('uses the first free slot on a partly occupied tile', async () => {
    const deps = dummyDeps({
      dummyTile: createFakeTile({ Tile_ID: 99, Layer_ID: 11, Player1: 1, Player2: 2, Player3: null, Player4: null }),
    });
    await logic.run(summon(), deps);
    expect(deps.models.Tiles.update).toHaveBeenCalledWith({ Player3: 30 }, { where: { Tile_ID: 99 } });
  });

  it('refuses a full tile rather than letting claimTileSlot throw', async () => {
    const deps = dummyDeps({
      dummyTile: createFakeTile({ Tile_ID: 99, Layer_ID: 11, Player1: 1, Player2: 2, Player3: 3, Player4: 4 }),
    });
    const result = await logic.run(summon(), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.TILE_FULL });
    expect(deps.models.Players.create).not.toHaveBeenCalled();
  });

  it('refuses a tile that belongs to another game', async () => {
    const deps = dummyDeps({ layer: createFakeLayer({ Layer_ID: 11, Game_ID: 99 }) });
    const result = await logic.run(summon(), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_TILE });
    expect(logic.present(result).content).toContain("game 7's board");
    expect(deps.models.Players.create).not.toHaveBeenCalled();
  });

  it('refuses a tile that does not exist', async () => {
    const deps = dummyDeps();
    deps.models.Tiles.findByPk = jest.fn(async () => null);
    expect((await logic.run(summon(), deps)).reason).toBe(REJECTIONS.NO_SUCH_TILE);
  });

  it('refuses a Class_ID that does not exist, pointing at get-classes', async () => {
    const deps = dummyDeps({ dummyClass: null });
    const result = await logic.run(summon({ classId: 999 }), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.INVALID_AMOUNT });
    expect(logic.present(result).content).toContain('get-classes');
    expect(deps.models.Players.create).not.toHaveBeenCalled();
  });

  it('still needs the caller to be in the game', async () => {
    const deps = dummyDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    expect((await logic.run(summon(), deps)).reason).toBe(REJECTIONS.NOT_IN_GAME);
  });
});

describe('sandbox adapter', () => {
  it('registers as /sandbox with the three subcommands', () => {
    const json = sandbox.data.toJSON();
    expect(json.name).toBe('sandbox');
    expect(json.options.map((o) => o.name)).toEqual([
      'get-tile-id', 'get-classes', 'reset', 'set-stat', 'set-meta', 'ap-time', 'ap-tick', 'set-chaos',
      'summon-dummy', 'view-chaos',
    ]);
    expect(json.options.every((o) => o.type === 1)).toBe(true);
    expect(typeof sandbox.execute).toBe('function');
  });
});
