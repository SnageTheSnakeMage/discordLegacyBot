/**
 * DB-touching utils helpers with jest.spyOn over utils.models - the same
 * instance-patching seam as utils.deathLogic.test.js. Real logic, fake rows.
 */
const utils = require('../utils.js');
const { createFakePlayer, createFakeClass, createFakeTile } = require('./helpers/mockModels.js');

describe('getAllPlayersOnTile', () => {
  it('returns the Players rows for the occupied slots only', async () => {
    const rows = [createFakePlayer({ Player_ID: 7 }), createFakePlayer({ Player_ID: 9 })];
    const findAll = jest.spyOn(utils.models.Players, 'findAll').mockResolvedValue(rows);
    const result = await utils.getAllPlayersOnTile(null, createFakeTile({ Player1: 7, Player3: 9 }));
    expect(result).toBe(rows);
    const where = findAll.mock.calls[0][0].where.Player_ID;
    expect(Object.getOwnPropertySymbols(where).map((s) => where[s])).toEqual([[7, 9]]);
  });

  it('returns [] for an empty tile without querying', async () => {
    const findAll = jest.spyOn(utils.models.Players, 'findAll').mockResolvedValue([]);
    expect(await utils.getAllPlayersOnTile(null, createFakeTile())).toEqual([]);
    expect(findAll).not.toHaveBeenCalled();
  });

  it('returns [] when the tile cannot be found, instead of throwing', async () => {
    jest.spyOn(utils.models.Tiles, 'findByPk').mockResolvedValue(null);
    expect(await utils.getAllPlayersOnTile(123, null)).toEqual([]);
  });

  it('resolves a tile id when given one', async () => {
    jest.spyOn(utils.models.Tiles, 'findByPk').mockResolvedValue(createFakeTile({ Player2: 5 }));
    const rows = [createFakePlayer({ Player_ID: 5 })];
    jest.spyOn(utils.models.Players, 'findAll').mockResolvedValue(rows);
    expect(await utils.getAllPlayersOnTile(42, null)).toBe(rows);
    expect(utils.models.Tiles.findByPk).toHaveBeenCalledWith(42);
  });
});

describe('removePlayerFromTile', () => {
  it('clears exactly the slot holding the player and saves before returning', async () => {
    let saved = false;
    const tile = createFakeTile({ Player1: 41, Player2: 42, Player4: 44 });
    tile.save = jest.fn(async () => { await new Promise((r) => setImmediate(r)); saved = true; });
    jest.spyOn(utils.models.Tiles, 'findOne').mockResolvedValue(tile);

    await utils.removePlayerFromTile(42, 1, 3, 3);

    expect(tile.Player2).toBeNull();
    expect(tile.Player1).toBe(41);
    expect(tile.Player4).toBe(44);
    expect(saved).toBe(true);
    expect(utils.models.Tiles.findOne).toHaveBeenCalledWith({ where: { Layer_ID: 1, X_Position: 3, Y_Position: 3 } });
  });
});

describe('getSurroundingTiles', () => {
  it('returns the tile plus its 8 neighbours, all looked up on the tile own layer', async () => {
    jest.spyOn(utils.models.Players, 'findByPk').mockResolvedValue(createFakePlayer({ Tile_ID: 100 }));
    jest.spyOn(utils.models.Tiles, 'findByPk').mockResolvedValue(createFakeTile({ Tile_ID: 100, Layer_ID: 55, X_Position: 3, Y_Position: 3 }));
    const layers = [];
    jest.spyOn(utils.models.Tiles, 'findOne').mockImplementation(async ({ where }) => {
      layers.push(where.Layer_ID);
      return createFakeTile({ Layer_ID: where.Layer_ID, X_Position: where.X_Position, Y_Position: where.Y_Position });
    });

    const around = await utils.getSurroundingTiles(1, 100);

    expect(around).toHaveLength(9);
    expect(layers).toHaveLength(8);
    expect(layers.every((l) => l === 55)).toBe(true);
  });
});

describe('getSpawnpointTile', () => {
  it('returns a candidate tile that has a free slot', async () => {
    jest.spyOn(utils.models.Layers, 'findAll').mockResolvedValue([{ Layer_ID: 1 }]);
    const free = createFakeTile({ Tile_ID: 5 });
    jest.spyOn(utils.models.Tiles, 'findAll').mockResolvedValue([free]);
    jest.spyOn(utils, 'getRandomInt').mockReturnValue(0);
    expect(await utils.getSpawnpointTile(1)).toBe(free);
  });

  it('rerolls past a full tile and returns the reroll result (was undefined before the async fixes)', async () => {
    jest.spyOn(utils.models.Layers, 'findAll').mockResolvedValue([{ Layer_ID: 1 }]);
    const full = createFakeTile({ Tile_ID: 5, Player1: 1, Player2: 2, Player3: 3, Player4: 4 });
    const free = createFakeTile({ Tile_ID: 6 });
    jest.spyOn(utils.models.Tiles, 'findAll')
      .mockResolvedValueOnce([full])
      .mockResolvedValueOnce([free]);
    jest.spyOn(utils, 'getRandomInt').mockReturnValue(0);
    expect(await utils.getSpawnpointTile(1)).toBe(free);
  });
});

describe('classRemoval', () => {
  function stubClassLookup(className) {
    jest.spyOn(utils.models.Classes, 'findByPk').mockResolvedValue(createFakeClass({ Class_ID: 2, Class_Name: className }));
    jest.spyOn(utils.models.Classes, 'findOne').mockResolvedValue(createFakeClass({ Class_ID: 1, Class_Name: 'Average' }));
  }

  it('a plain class is just set back to Average', async () => {
    stubClassLookup('Soldier');
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.classRemoval(createFakePlayer({ Player_ID: 20, Class_ID: 2 }), createFakePlayer({ Player_ID: 10 }));
    expect(update).toHaveBeenCalledWith({ Class_ID: 1 }, { where: { Player_ID: 20 } });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('removing Minesweeper clears their mines', async () => {
    stubClassLookup('Minesweeper');
    jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    const tUpdate = jest.spyOn(utils.models.Tiles, 'update').mockResolvedValue([1]);
    await utils.classRemoval(createFakePlayer({ Player_ID: 20, Class_ID: 2 }), createFakePlayer({ Player_ID: 10 }));
    expect(tUpdate).toHaveBeenCalledWith({ trapped: false, trapper: null }, { where: { trapper: 20 } });
  });

  it('removing a Twin zeroes the second body and credits the exorcist a kill', async () => {
    stubClassLookup('Twin');
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.classRemoval(
      createFakePlayer({ Player_ID: 20, Class_ID: 2 }),
      createFakePlayer({ Player_ID: 10, Kills: 1 }),
    );
    expect(update).toHaveBeenCalledWith(
      { Class_ID: 1, Health_Points2: 0, Damage2: 0, Tile_ID2: null, Free_Move2: 0, Range2: 0 },
      { where: { Player_ID: 20 } },
    );
    expect(update).toHaveBeenCalledWith({ Kills: 2 }, { where: { Player_ID: 10 } });
  });
});

describe('getRandomClass', () => {
  // getRandomInt is inclusive of max, so the old getRandomInt(count) could
  // roll 0; on a 1-based Classes table findByPk(0) is null and the next line
  // threw - a crash on roughly 1 registration in (count+1). It also assumed
  // contiguous ids. Now it picks from the ids that exist.
  it('never rolls an id that is not in the table, over many rolls', async () => {
    const ids = [3, 7, 11]; // deliberately non-contiguous, not 1-based
    jest.spyOn(utils.models.Classes, 'findAll').mockResolvedValue(ids.map((id) => ({ Class_ID: id })));
    const asked = [];
    jest.spyOn(utils.models.Classes, 'findByPk').mockImplementation(async (id) => {
      asked.push(id);
      return createFakeClass({ Class_ID: id, Class_Name: `C${id}` });
    });
    jest.spyOn(utils.models.Players, 'findAll').mockResolvedValue([]);

    for (let i = 0; i < 100; i++) {
      const rolled = await utils.getRandomClass({ Game_ID: 1, classDupelicateMax: 2, classBlacklist: '' });
      expect(ids).toContain(rolled.Class_ID);
    }
    expect(asked.every((id) => ids.includes(id))).toBe(true);
  });
});
