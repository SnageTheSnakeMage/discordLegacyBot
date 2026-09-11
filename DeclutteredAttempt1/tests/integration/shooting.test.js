/**
 * /shoot against the real schema. Unit tests prove the branching; these
 * prove the writes land in the right columns of a real database - which is
 * what the mine-vs-`trapped` column bug taught us a mock cannot do.
 */
const { freshDb, closeDb, models, utils } = require('./helpers/testDb.js');
const {
  seedGame, seedLayer, seedPlayer, assertBoardConsistent,
} = require('./helpers/seed.js');
const shootLogic = require('../../commands/Player Commands/shoot.logic.js');

const DEPS = () => ({ models, utils, now: () => 1700000000000, random: () => 1 });

describe('shooting', () => {
  beforeEach(freshDb);
  afterAll(closeDb);

  async function board() {
    const game = await seedGame({ shootCost: 2, fireDmg: 1, mineDmg: 1 });
    const layer = await seedLayer(game.Game_ID, { width: 6, height: 6 });
    return { game, layer };
  }

  const shoot = (game, over = {}) => shootLogic.run({
    gameId: game.Game_ID, x: 3, y: 1, amount: 1, body: 1,
    discordId: '1', targetDiscordId: '2', ...over,
  }, DEPS());

  it('damages the target and charges the shooter', async () => {
    const { game, layer } = await board();
    const shooter = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Action_Points: 6, Range_: 4, Damage: 2,
    });
    const target = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 3, y: 1, layerId: layer.Layer_ID, Health_Points: 10,
    });

    const result = await shoot(game);

    expect(result.ok).toBe(true);
    expect((await models.Players.findByPk(target.Player_ID)).Health_Points).toBe(8);
    expect((await models.Players.findByPk(shooter.Player_ID)).Action_Points).toBe(4);
    await assertBoardConsistent(game.Game_ID);
  });

  it('a lethal shot kills the target and credits the shooter', async () => {
    // the whole point of damagePlayer: the death check runs against the
    // re-read row, so the kill actually registers
    const { game, layer } = await board();
    const shooter = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Action_Points: 6, Range_: 4, Damage: 5, Kills: 0,
    });
    const target = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 3, y: 1, layerId: layer.Layer_ID, Health_Points: 3,
    });
    const targetTile = target.Tile_ID;

    const result = await shoot(game);

    expect(result.ok).toBe(true);
    const dead = await models.Players.findByPk(target.Player_ID);
    expect(dead.Health_Points).toBeLessThanOrEqual(0);
    expect(dead.Dead).toBeTruthy();
    expect(dead.Tile_ID).toBeNull();
    expect((await models.Players.findByPk(shooter.Player_ID)).Kills).toBe(1);
    // and the corpse is off the tile, not merely flagged
    const tile = await models.Tiles.findByPk(targetTile);
    expect([tile.Player1, tile.Player2, tile.Player3, tile.Player4]).not.toContain(target.Player_ID);
    await assertBoardConsistent(game.Game_ID);
  });

  it("hits a Twin's second body in its own HP column", async () => {
    const { game, layer } = await board();
    await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Action_Points: 6, Range_: 4, Damage: 2,
    });
    const twin = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 5, y: 5, layerId: layer.Layer_ID, className: 'Twin', Health_Points: 6, Health_Points2: 6,
    });
    // put the second body on the tile being shot at
    const bodyTwoTile = await models.Tiles.findOne({
      where: { Layer_ID: layer.Layer_ID, X_Position: 3, Y_Position: 1 },
    });
    await twin.update({ Tile_ID2: bodyTwoTile.Tile_ID });

    const result = await shoot(game);

    expect(result.ok).toBe(true);
    const after = await models.Players.findByPk(twin.Player_ID);
    expect(after.Health_Points2).toBe(4); // the hit body
    expect(after.Health_Points).toBe(6); // the other one is untouched
  });

  it('a rejected shot writes nothing', async () => {
    const { game, layer } = await board();
    const shooter = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Action_Points: 0, Range_: 4,
    });
    const target = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 3, y: 1, layerId: layer.Layer_ID, Health_Points: 10,
    });

    const result = await shoot(game);

    expect(result.ok).toBe(false);
    expect((await models.Players.findByPk(target.Player_ID)).Health_Points).toBe(10);
    expect((await models.Players.findByPk(shooter.Player_ID)).Action_Points).toBe(0);
    await assertBoardConsistent(game.Game_ID);
  });

  it('cannot shoot a player who is only in another game', async () => {
    const { game, layer } = await board();
    await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Action_Points: 6, Range_: 4,
    });
    const other = await seedGame();
    const otherLayer = await seedLayer(other.Game_ID, { width: 6, height: 6 });
    await seedPlayer(other.Game_ID, {
      discordId: '2', x: 3, y: 1, layerId: otherLayer.Layer_ID, Health_Points: 10,
    });

    const result = await shoot(game);

    expect(result.ok).toBe(false);
    await assertBoardConsistent(game.Game_ID);
  });
});
