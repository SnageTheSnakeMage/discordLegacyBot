/**
 * playerDeathLogic + ChaosEventDeathCheck - the highest-risk functions in
 * the codebase (twin bodies, pharaoh revive HP, killer-class branches).
 *
 * utils reads its own module-level models, so the database seam here is
 * jest.spyOn over utils.models.* (instance patching - restoreMocks cleans
 * up). That is NOT the banned jest.mock module replacement: every line of
 * utils logic still runs for real.
 */
const utils = require('../utils.js');
const { createFakePlayer, createFakeClass, createFakeTile, createFakeGame } = require('./helpers/mockModels.js');

/** classes by id: 1 = killer's class, 2 = victim's class */
// Death now vacates the tile as well as nulling Tile_ID, so every branch
// reads the victim's tile row. Tests that care about the slot still stub
// their own tile; this is the default so the rest need not.
beforeEach(() => {
  jest.spyOn(utils.models.Tiles, 'findByPk').mockResolvedValue(
    createFakeTile({ Tile_ID: 7, Layer_ID: 1, X_Position: 3, Y_Position: 3 }),
  );
  jest.spyOn(utils.models.Tiles, 'findOne').mockResolvedValue(
    createFakeTile({ Tile_ID: 7, Layer_ID: 1, X_Position: 3, Y_Position: 3 }),
  );
});

function stubClasses({ killerClass = 'Average', victimClass = 'Average' } = {}) {
  jest.spyOn(utils.models.Classes, 'findByPk').mockImplementation(async (id) => (
    id === 1 ? createFakeClass({ Class_ID: 1, Class_Name: killerClass })
      : createFakeClass({ Class_ID: 2, Class_Name: victimClass })
  ));
}

function stubBoringGame() {
  jest.spyOn(utils.models.Games, 'findByPk').mockResolvedValue(createFakeGame({ CURR_CC_EVENT: 'BOOOORRRINNNG' }));
}

function killer(overrides = {}) {
  return createFakePlayer({ Player_ID: 10, Class_ID: 1, Kills: 2, Action_Points: 5, MAX_AP: 10, ...overrides });
}

function victim(overrides = {}) {
  return createFakePlayer({ Player_ID: 20, Class_ID: 2, Health_Points: 0, Pharoh_HP: 0, Tile_ID: 7, ...overrides });
}

describe('playerDeathLogic - normal kill', () => {
  it('marks the victim dead, frees the tile, credits the kill', async () => {
    stubClasses();
    stubBoringGame();
    const tile = createFakeTile({ Tile_ID: 7, Layer_ID: 1, X_Position: 3, Y_Position: 3, Player1: 20 });
    jest.spyOn(utils.models.Tiles, 'findByPk').mockResolvedValue(tile);
    jest.spyOn(utils.models.Tiles, 'findOne').mockResolvedValue(tile);
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);

    await utils.playerDeathLogic(killer(), victim());

    expect(update).toHaveBeenCalledWith({ Tile_ID: null, Dead: true }, { where: { Player_ID: 20 } });
    expect(update).toHaveBeenCalledWith({ Kills: 3 }, { where: { Player_ID: 10 } });
    // removePlayerFromTile cleared the slot and saved the tile
    expect(tile.Player1).toBeNull();
    expect(tile.save).toHaveBeenCalled();
  });

  it('does nothing to a victim who is still alive', async () => {
    stubClasses();
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({ Health_Points: 4 }));
    expect(update).not.toHaveBeenCalled();
  });

  // Environment kills (fire tiles) pass killer = null; the guard order
  // dereferences killerClass.Class_Name before checking killer != null.
  // The killer null-check used to be the LAST clause of the guard chain, so
  // killerClass.Class_Name was dereferenced first and a fire-tile death threw.
  // Nothing could die before utils.damagePlayer, so this never surfaced in
  // play; the integration death suite caught it immediately.
  it('an environment kill (killer = null) processes the death instead of throwing', async () => {
    stubClasses();
    stubBoringGame();
    jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(null, victim());
  });
});

describe('playerDeathLogic - pharaoh revive', () => {
  it('respawns with revive HP instead of dying, and still credits the kill', async () => {
    stubClasses();
    stubBoringGame();
    const spawnTile = createFakeTile({ Tile_ID: 99 });
    jest.spyOn(utils, 'getSpawnpointTile').mockResolvedValue(spawnTile);
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);

    await utils.playerDeathLogic(killer(), victim({ Pharoh_HP: 3 }));

    expect(update).toHaveBeenCalledWith(
      { Tile_ID: 99, Health_Points: 3, Pharoh_HP: 0 },
      { where: { Player_ID: 20 } },
    );
    expect(update).toHaveBeenCalledWith({ Kills: 3 }, { where: { Player_ID: 10 } });
    // and never marked dead
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ Dead: true }), expect.anything());
  });
});

describe('playerDeathLogic - twin bodies', () => {
  it('both bodies down and no revive HP: the player dies and both tiles clear', async () => {
    stubClasses({ victimClass: 'Twin' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({ Health_Points: 0, Health_Points2: 0, Tile_ID2: 8 }));
    expect(update).toHaveBeenCalledWith({ Dead: true }, { where: { Player_ID: 20 } });
    expect(update).toHaveBeenCalledWith({ Tile_ID: null }, { where: { Player_ID: 20 } });
    expect(update).toHaveBeenCalledWith({ Tile_ID2: null }, { where: { Player_ID: 20 } });
  });

  it('one body down: a body clears but the player is not dead (current behaviour clears the OTHER body - see failing test below)', async () => {
    stubClasses({ victimClass: 'Twin' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({ Health_Points: 0, Health_Points2: 5, Tile_ID2: 8 }));
    expect(update).not.toHaveBeenCalledWith({ Dead: true }, expect.anything());
  });

  // Health_Points/Tile_ID and Health_Points2/Tile_ID2 are paired columns,
  // but the branch for 'body 1 dead, body 2 alive' nulls Tile_ID2 - the
  // LIVING body's tile. Flagged on PR #92 as a suspected body swap; this
  // stays failing until the game rule is decided (issue #63 territory).
  test.failing('the body that died is the one whose tile clears', async () => {
    stubClasses({ victimClass: 'Twin' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({ Health_Points: 0, Health_Points2: 5, Tile_ID2: 8 }));
    expect(update).toHaveBeenCalledWith({ Tile_ID: null }, { where: { Player_ID: 20 } });
    expect(update).not.toHaveBeenCalledWith({ Tile_ID2: null }, expect.anything());
  });
});

describe('playerDeathLogic - killer classes', () => {
  it('a Hitman killing their marked target gets 4 bonus AP with the kill', async () => {
    stubClasses({ killerClass: 'Hitman' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer({ Hitman_Target: 20 }), victim());
    expect(update).toHaveBeenCalledWith(
      { Kills: 3, Action_Points: 9 },
      { where: { Player_ID: 10 } },
    );
  });

  it('a Hitman killing someone else gets only the kill', async () => {
    stubClasses({ killerClass: 'Hitman' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer({ Hitman_Target: 999 }), victim());
    expect(update).toHaveBeenCalledWith({ Kills: 3 }, { where: { Player_ID: 10 } });
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ Action_Points: expect.anything() }), expect.anything());
  });

  it('a Cannibal eating a full-AP victim gets 6 AP; otherwise 1', async () => {
    stubClasses({ killerClass: 'Cannibal' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({ Action_Points: 10, MAX_AP: 10 }));
    expect(update).toHaveBeenCalledWith({ Kills: 3, Action_Points: 11 }, { where: { Player_ID: 10 } });

    update.mockClear();
    await utils.playerDeathLogic(killer(), victim({ Action_Points: 2, MAX_AP: 10 }));
    expect(update).toHaveBeenCalledWith({ Kills: 3, Action_Points: 6 }, { where: { Player_ID: 10 } });
  });

  it("killing a Minesweeper clears every mine they planted", async () => {
    stubClasses({ killerClass: 'Minesweeper' });
    stubBoringGame();
    const pUpdate = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    const tUpdate = jest.spyOn(utils.models.Tiles, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim());
    expect(tUpdate).toHaveBeenCalledWith(
      { trapped: false, trapper: null },
      { where: { trapper: 20 } },
    );
    expect(pUpdate).toHaveBeenCalledWith({ Kills: 3 }, { where: { Player_ID: 10 } });
  });
});

describe('ChaosEventDeathCheck', () => {
  it('Leftovers gives the killer the victim missed AP, capped at MAX_AP', async () => {
    jest.spyOn(utils.models.Games, 'findByPk').mockResolvedValue(createFakeGame({ CURR_CC_EVENT: 'Leftovers' }));
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.ChaosEventDeathCheck(1, killer({ Action_Points: 8, MAX_AP: 10 }), victim({ MISSED_AP: 5 }));
    expect(update).toHaveBeenCalledWith({ Action_Points: 10 }, { where: { Player_ID: 10 } });
  });

  it('Corpse Explosion damages every neighbour except the victim and runs their death logic', async () => {
    jest.spyOn(utils.models.Games, 'findByPk').mockResolvedValue(createFakeGame({ CURR_CC_EVENT: 'Corpse Explosion' }));
    const bystander = createFakePlayer({ Player_ID: 30, Health_Points: 4, Class_ID: 2, Tile_ID: 8 });
    jest.spyOn(utils, 'getSurroundingTiles').mockResolvedValue([
      createFakeTile({ Tile_ID: 7, Player1: 20 }),
      createFakeTile({ Tile_ID: 8, Player1: 30 }),
      null, // off-board neighbour
    ]);
    jest.spyOn(utils, 'getAllPlayersOnTile')
      .mockImplementation(async (_id, tile) => (tile.Tile_ID === 7 ? [victim()] : [bystander]));
    const death = jest.spyOn(utils, 'playerDeathLogic').mockResolvedValue(undefined);
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);

    await utils.ChaosEventDeathCheck(1, killer(), victim());

    expect(update).toHaveBeenCalledWith({ Health_Points: 3 }, { where: { Player_ID: 30 } });
    expect(update).not.toHaveBeenCalledWith(expect.anything(), { where: { Player_ID: 20 } });
    expect(death).toHaveBeenCalledTimes(1);
  });

  it('a boring event does nothing', async () => {
    jest.spyOn(utils.models.Games, 'findByPk').mockResolvedValue(createFakeGame({ CURR_CC_EVENT: 'BOOOORRRINNNG' }));
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.ChaosEventDeathCheck(1, killer(), victim());
    expect(update).not.toHaveBeenCalled();
  });
});
