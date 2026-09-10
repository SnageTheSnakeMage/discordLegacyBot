/**
 * /swap against the real schema. The point of these is the #78 invariant:
 * a mock happily accepts a Players.Tile_ID write that leaves the tiles'
 * own PlayerN slots pointing at whoever was there before, so only a real
 * database can prove the two sides still agree after a swap.
 */
const { freshDb, closeDb, models, utils } = require('./helpers/testDb.js');
const {
  seedGame, seedLayer, seedPlayer, assertBoardConsistent,
} = require('./helpers/seed.js');
const swapLogic = require('../../commands/Class Commands/swap.logic.js');

const DEPS = () => ({ models, utils, now: () => 1700000000000, random: () => 0 });

describe('swap', () => {
  beforeEach(freshDb);
  afterAll(closeDb);

  async function board() {
    const game = await seedGame();
    const layer = await seedLayer(game.Game_ID, { width: 5, height: 5 });
    return { game, layer };
  }

  async function slotsOf(tileId) {
    const t = await models.Tiles.findByPk(tileId);
    return ['Player1', 'Player2', 'Player3', 'Player4'].map((s) => t[s]).filter((v) => v != null);
  }

  it('exchanges the two players and keeps both sides of the invariant', async () => {
    const { game, layer } = await board();
    const mate = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, className: 'Switchmate',
    });
    const victim = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 4, y: 3, layerId: layer.Layer_ID,
    });
    const mateStart = mate.Tile_ID;
    const victimStart = victim.Tile_ID;

    const result = await swapLogic.run(
      { gameId: game.Game_ID, layer: 1, x: 4, y: 3, discordId: '1', victimDiscordId: '2', victimUsername: 'v' },
      DEPS(),
    );

    expect(result.ok).toBe(true);
    expect((await models.Players.findByPk(mate.Player_ID)).Tile_ID).toBe(victimStart);
    expect((await models.Players.findByPk(victim.Player_ID)).Tile_ID).toBe(mateStart);
    // and the tiles themselves now name the right occupants
    expect(await slotsOf(victimStart)).toEqual([mate.Player_ID]);
    expect(await slotsOf(mateStart)).toEqual([victim.Player_ID]);
    await assertBoardConsistent(game.Game_ID);
  });

  it('swaps onto a tile that is already at capacity', async () => {
    // the destination holds 4 players including the victim, so a
    // place-then-vacate order would throw "tile is full". The swap frees
    // the slot it needs, so vacating first has to come first.
    const { game, layer } = await board();
    const mate = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, className: 'Switchmate',
    });
    const victim = await seedPlayer(game.Game_ID, { discordId: '2', x: 4, y: 3, layerId: layer.Layer_ID });
    for (const id of ['3', '4', '5']) {
      await seedPlayer(game.Game_ID, { discordId: id, x: 4, y: 3, layerId: layer.Layer_ID });
    }
    expect(await slotsOf(victim.Tile_ID)).toHaveLength(4);

    const result = await swapLogic.run(
      { gameId: game.Game_ID, layer: 1, x: 4, y: 3, discordId: '1', victimDiscordId: '2', victimUsername: 'v' },
      DEPS(),
    );

    expect(result.ok).toBe(true);
    // mate.Tile_ID / victim.Tile_ID are the PRE-swap rows: the mate now
    // holds the slot the victim vacated on the full tile, and the victim
    // holds the mate's old one.
    expect(await slotsOf(victim.Tile_ID)).toContain(mate.Player_ID);
    expect(await slotsOf(mate.Tile_ID)).toEqual([victim.Player_ID]);
    await assertBoardConsistent(game.Game_ID);
  });
});
