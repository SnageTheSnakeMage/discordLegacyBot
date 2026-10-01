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
  // placePlayerOnBoard claims the tile's PlayerN slot through Tiles.update,
  // so a revive writes here too - without this stub it reaches real SQLite
  jest.spyOn(utils.models.Tiles, 'update').mockResolvedValue([1]);
});

function stubClasses({ killerClass = 'Average', victimClass = 'Average' } = {}) {
  jest.spyOn(utils.models.Classes, 'findByPk').mockImplementation(async (id) => (
    id === 1 ? createFakeClass({ Class_ID: 1, Class_Name: killerClass })
      : createFakeClass({ Class_ID: 2, Class_Name: victimClass })
  ));
}

function stubBoringGame() {
  jest.spyOn(utils.models.Games, 'findByPk').mockResolvedValue(createFakeGame({ CURR_CC_EVENT: 'BOOOORRRINNNG', maxIncreaseOnKill: 2 }));
}

function killer(overrides = {}) {
  return createFakePlayer({
    Player_ID: 10, Class_ID: 1, Kills: 2, Action_Points: 5,
    MAX_AP: 10, MAX_HP: 10, MAX_DAMAGE: 3, MAX_RANGE: 5,
    ...overrides,
  });
}

// what a kill credits the killer above: one more kill, and every maximum
// raised by the game's maxIncreaseOnKill
const KILL_CREDIT = { Kills: 3, MAX_AP: 12, MAX_HP: 12, MAX_DAMAGE: 5, MAX_RANGE: 7 };

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
    expect(update).toHaveBeenCalledWith(KILL_CREDIT, { where: { Player_ID: 10 } });
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

  // Environment kills (fire tiles) pass killer = null, so every guard that
  // reads the killer's class has to check killer != null first.
  it('an environment kill (killer = null) processes the death instead of throwing', async () => {
    stubClasses();
    stubBoringGame();
    jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(null, victim());
  });
});

describe('playerDeathLogic - pharaoh revive', () => {
  /** the spawn tile a revive lands on, plus the corpse's tile it leaves. */
  function stubRevivePlacement() {
    const spawnTile = createFakeTile({ Tile_ID: 99 });
    const fallenTile = createFakeTile({ Tile_ID: 7, Layer_ID: 1, X_Position: 3, Y_Position: 3, Player1: 20 });
    jest.spyOn(utils, 'getSpawnpointTile').mockResolvedValue(spawnTile);
    jest.spyOn(utils.models.Tiles, 'findByPk').mockResolvedValue(fallenTile);
    jest.spyOn(utils.models.Tiles, 'findOne').mockResolvedValue(fallenTile);
    return { spawnTile, fallenTile };
  }

  it('respawns with revive HP instead of dying, and still credits the kill', async () => {
    stubClasses();
    stubBoringGame();
    stubRevivePlacement();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);

    await utils.playerDeathLogic(killer(), victim({ Pharoh_HP: 3 }));

    expect(update).toHaveBeenCalledWith({ Tile_ID: 99, Dead: 0 }, { where: { Player_ID: 20 } });
    expect(update).toHaveBeenCalledWith(
      { Health_Points: 3, Pharoh_HP: 0 },
      { where: { Player_ID: 20 } },
    );
    expect(update).toHaveBeenCalledWith(KILL_CREDIT, { where: { Player_ID: 10 } });
    // and never marked dead
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ Dead: true }), expect.anything());
  });

  // A revive is a MOVE, and both halves of the position invariant have to
  // move with it: the tile the victim fell on stops naming them, and the
  // spawn tile names them.
  it('vacates the tile the victim fell on and claims the spawn tile', async () => {
    stubClasses();
    stubBoringGame();
    const { fallenTile } = stubRevivePlacement();
    jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    const tileUpdate = jest.spyOn(utils.models.Tiles, 'update').mockResolvedValue([1]);

    await utils.playerDeathLogic(killer(), victim({ Pharoh_HP: 3 }));

    expect(fallenTile.Player1).toBeNull();
    expect(fallenTile.save).toHaveBeenCalled();
    expect(tileUpdate).toHaveBeenCalledWith({ Player1: 20 }, { where: { Tile_ID: 99 } });
  });

  // Fire tiles and mines kill with no killer to credit. This read
  // killer.Kills unguarded, so a player with revive HP stepping onto fire
  // took the whole command into the central error handler.
  it('an environment kill (killer = null) revives without crediting anyone', async () => {
    stubClasses();
    stubBoringGame();
    stubRevivePlacement();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);

    await utils.playerDeathLogic(null, victim({ Pharoh_HP: 3 }));

    expect(update).toHaveBeenCalledWith(
      { Health_Points: 3, Pharoh_HP: 0 },
      { where: { Player_ID: 20 } },
    );
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ Kills: expect.anything() }),
      expect.anything(),
    );
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

  it('one body down: a body clears but the player is not dead', async () => {
    stubClasses({ victimClass: 'Twin' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({ Health_Points: 0, Health_Points2: 5, Tile_ID2: 8 }));
    expect(update).not.toHaveBeenCalledWith({ Dead: true }, expect.anything());
  });

  // Health_Points/Tile_ID and Health_Points2/Tile_ID2 are paired columns, so
  // when body 1 dies it is Tile_ID that clears, never the living body's tile.
  it('the body that died is the one whose tile clears', async () => {
    stubClasses({ victimClass: 'Twin' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({ Health_Points: 0, Health_Points2: 5, Tile_ID2: 8 }));
    expect(update).toHaveBeenCalledWith({ Tile_ID: null }, { where: { Player_ID: 20 } });
  });

  // The rule: whichever body is lost, the survivor ends up in body 1 and the
  // body-2 columns are nulled. hotPotatoSwap's Twin case takes Tile_ID2 /
  // Health_Points2 / Damage2 / Range2 wholesale, so a survivor left in body 2
  // would have the wrong body taken off it.
  it('body 1 lost: the surviving body moves into body 1 and body 2 is nulled', async () => {
    stubClasses({ victimClass: 'Twin' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({
      Health_Points: 0, Health_Points2: 5, Tile_ID2: 8, Damage2: 3, Range2: 4, Free_Move2: 1,
    }));

    expect(update).toHaveBeenCalledWith({
      Tile_ID: 8, Health_Points: 5, Damage: 3, Range_: 4, Free_Move: 1,
      Tile_ID2: null, Health_Points2: 0, Damage2: 0, Range2: 0, Free_Move2: 0,
    }, { where: { Player_ID: 20 } });
    expect(update).not.toHaveBeenCalledWith({ Dead: true }, expect.anything());
  });

  it('body 2 lost: body 1 stays put and only body 2 is nulled', async () => {
    stubClasses({ victimClass: 'Twin' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({ Health_Points: 5, Health_Points2: 0, Tile_ID2: 8 }));

    expect(update).toHaveBeenCalledWith(
      { Tile_ID2: null, Health_Points2: 0, Damage2: 0, Range2: 0, Free_Move2: 0 },
      { where: { Player_ID: 20 } },
    );
    // the surviving body must NOT be taken off the board: Tile_ID is body 1,
    // the one still alive
    expect(update).not.toHaveBeenCalledWith({ Tile_ID: null }, expect.anything());
    expect(update).not.toHaveBeenCalledWith({ Dead: true }, expect.anything());
  });

  // a Twin that already lost body 2 has Tile_ID2 null, so it is a one-bodied
  // player: losing that body is a real death, not another consolidation
  it('a one-bodied Twin that loses its last body dies', async () => {
    stubClasses({ victimClass: 'Twin' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({ Health_Points: 0, Health_Points2: 0, Tile_ID2: null }));
    expect(update).toHaveBeenCalledWith({ Dead: true }, { where: { Player_ID: 20 } });
  });

  // playerDeathLogic runs after every point of damage, so a one-bodied Twin
  // who is merely hurt must not keep re-nulling a body that is already gone
  it('does not rewrite body 2 for a one-bodied Twin that survived the hit', async () => {
    stubClasses({ victimClass: 'Twin' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({ Health_Points: 5, Health_Points2: 0, Tile_ID2: null }));
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ Tile_ID2: null }), expect.anything(),
    );
    expect(update).not.toHaveBeenCalledWith({ Dead: true }, expect.anything());
  });
});

describe('playerDeathLogic - twin revive HP', () => {
  const spawn = () => {
    const spawnTile = createFakeTile({ Tile_ID: 99 });
    jest.spyOn(utils, 'getSpawnpointTile').mockResolvedValue(spawnTile);
    return spawnTile;
  };

  // Weird death case #0 tests `Health_Points <= 0 && Pharoh_HP > 0` with no
  // Twin exclusion and RETURNS, so every Twin revive where body 1 is the one
  // that went down is handled there, not here - and that is the right place
  // for it. Whichever body a Twin loses, the survivor is consolidated into
  // body 1, so a Twin with body 1 at zero has no second body left to weigh:
  // reviving body 1 revives the last body. This pins the shadowing, which is
  // why the twin block has no branch for the case.
  it('body 1 down with revive HP never reaches the twin block - case #0 takes it', async () => {
    stubClasses({ victimClass: 'Twin' });
    stubBoringGame();
    spawn();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({
      Health_Points: 0, Health_Points2: 5, Tile_ID2: 8, Pharoh_HP: 3,
    }));

    // case #0's writes: body 1 onto a spawnpoint, revive hp spent
    expect(update).toHaveBeenCalledWith({ Tile_ID: 99, Dead: 0 }, { where: { Player_ID: 20 } });
    expect(update).toHaveBeenCalledWith(
      { Health_Points: 3, Pharoh_HP: 0 }, { where: { Player_ID: 20 } },
    );
    // and nothing from the twin block: body 2 is neither consolidated nor nulled
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ Tile_ID2: null }), expect.anything(),
    );
  });

  it('body 2 died: revive HP brings body 2 back, not the living body 1', async () => {
    stubClasses({ victimClass: 'Twin' });
    stubBoringGame();
    spawn();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({
      Health_Points: 5, Health_Points2: 0, Tile_ID2: 8, Pharoh_HP: 3,
    }));

    expect(update).toHaveBeenCalledWith({ Health_Points2: 3, Pharoh_HP: 0 }, { where: { Player_ID: 20 } });
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ Health_Points: 3 }), expect.anything(),
    );
  });

  // Every branch reads the same victim row, so the Twin branches are an
  // else-if chain: exactly one outcome happens per death, and a clear branch
  // below a revive never sees the pre-revive hp and fires.
  it('a revive is not immediately undone by a clear branch below it', async () => {
    stubClasses({ victimClass: 'Twin' });
    stubBoringGame();
    spawn();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({
      Health_Points: 5, Health_Points2: 0, Tile_ID2: 8, Pharoh_HP: 3,
    }));

    // Vacating the old tile does null Tile_ID2 - that is the clear half of
    // clear-then-place. What must not happen is the reverse order - a revive
    // written and then undone - so assert on the LAST write to Tile_ID2.
    const tileWrites = update.mock.calls
      .map(([payload]) => payload)
      .filter((p) => Object.prototype.hasOwnProperty.call(p, 'Tile_ID2'));
    expect(tileWrites.at(-1)).toMatchObject({ Tile_ID2: 99 });
  });
});

describe('playerDeathLogic - killer classes', () => {
  it('a Hitman killing their marked target gets 4 bonus AP with the kill', async () => {
    stubClasses({ killerClass: 'Hitman' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer({ Hitman_Target: 20 }), victim());
    expect(update).toHaveBeenCalledWith(KILL_CREDIT, { where: { Player_ID: 10 } });
    expect(update).toHaveBeenCalledWith({ Action_Points: 9 }, { where: { Player_ID: 10 } });
  });

  it('a Hitman killing someone else gets only the kill', async () => {
    stubClasses({ killerClass: 'Hitman' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer({ Hitman_Target: 999 }), victim());
    expect(update).toHaveBeenCalledWith(KILL_CREDIT, { where: { Player_ID: 10 } });
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ Action_Points: expect.anything() }), expect.anything());
  });

  it('a Cannibal eating a full-AP victim gets 6 AP; otherwise 1', async () => {
    stubClasses({ killerClass: 'Cannibal' });
    stubBoringGame();
    const update = jest.spyOn(utils.models.Players, 'update').mockResolvedValue([1]);
    await utils.playerDeathLogic(killer(), victim({ Action_Points: 10, MAX_AP: 10 }));
    expect(update).toHaveBeenCalledWith(KILL_CREDIT, { where: { Player_ID: 10 } });
    expect(update).toHaveBeenCalledWith({ Action_Points: 11 }, { where: { Player_ID: 10 } });

    update.mockClear();
    await utils.playerDeathLogic(killer(), victim({ Action_Points: 2, MAX_AP: 10 }));
    expect(update).toHaveBeenCalledWith(KILL_CREDIT, { where: { Player_ID: 10 } });
    expect(update).toHaveBeenCalledWith({ Action_Points: 6 }, { where: { Player_ID: 10 } });
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
    expect(pUpdate).toHaveBeenCalledWith(KILL_CREDIT, { where: { Player_ID: 10 } });
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
