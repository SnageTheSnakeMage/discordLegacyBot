/**
 * The finale: what happens once the living count reaches the threshold.
 *
 * None of this had a test, and none of it could run. Every "tiles in this
 * game" query was written `where: {Game_ID}`, but tiles hang off Layer_ID and
 * there is no Tiles.Game_ID column - so the first thing finaleTransition did
 * was throw `SQLITE_ERROR: no such column: Tiles.Game_ID`, before a single
 * player had been paid. A game reaching four players simply stopped receiving
 * AP, in the state the whole game is building towards.
 *
 * These run the real distribution against the real schema, because that is
 * the only thing that would have caught it.
 */
const { freshDb, closeDb, models, utils } = require('./helpers/testDb.js');
const { seedGame, seedLayer, seedPlayer, assertBoardConsistent } = require('./helpers/seed.js');
const { GAMESTATES } = require('../../enums.js');

const CLIENT = { channels: { fetch: async () => null } };

describe('finale', () => {
  beforeEach(freshDb);
  afterAll(closeDb);

  /** a game one distribution away from the finale: threshold players alive */
  async function board({ game: gameOver = {}, players = 4, width = 5, height = 5 } = {}) {
    const game = await seedGame({ finaleThreshold: 4, APAmount: 4, ...gameOver });
    const layer = await seedLayer(game.Game_ID, { width, height });
    const seeded = [];
    for (let i = 0; i < players; i++) {
      seeded.push(await seedPlayer(game.Game_ID, {
        discordId: `${i + 1}`, x: 1 + (i % width), y: 1 + Math.floor(i / width),
        layerId: layer.Layer_ID, Action_Points: 0, Health_Points: 10,
      }));
    }
    return { game, layer, players: seeded };
  }
  const reload = (p) => models.Players.findByPk(p.Player_ID);
  const fresh = (g) => models.Games.findByPk(g.Game_ID);
  const gateways = (layer) => models.Tiles.count({
    where: { Layer_ID: layer.Layer_ID, Tile_Type: 'Gateway_Open' },
  });
  const fires = (layer) => models.Tiles.count({
    where: { Layer_ID: layer.Layer_ID, Tile_Type: 'Fire' },
  });
  const tileAt = (layer, x, y) => models.Tiles.findOne({
    where: { Layer_ID: layer.Layer_ID, X_Position: x, Y_Position: y },
  });

  /**
   * Takes a board through the transition and hands back a blank layer.
   *
   * The transition scatters four gateways at random, and a gateway does not
   * burn - so a fire lit before it runs has an unpredictable number of
   * neighbours left to spread into. Wiping the layer afterwards makes these
   * tests about the spreading rule rather than about where the dice fell.
   */
  async function inFinale(options) {
    const built = await board(options);
    await utils.distributeAP(built.game, 1, CLIENT);
    await models.Tiles.update(
      { Tile_Type: 'Blank1' },
      { where: { Layer_ID: built.layer.Layer_ID } },
    );
    return { ...built, game: await fresh(built.game) };
  }

  describe('entering it', () => {
    it('transitions at the threshold, opens four gateways, and pays double', async () => {
      const { game, layer, players } = await board();

      await utils.distributeAP(game, 1, CLIENT);

      expect((await fresh(game)).GAME_STATE).toBe(GAMESTATES.FINALE);
      expect(await gateways(layer)).toBe(4);
      // APAmount 4, doubled by the finale. The doubling is the return value of
      // finaleTransition, which both callers used to discard.
      expect((await reload(players[0])).Action_Points).toBe(8);
      await assertBoardConsistent(game.Game_ID);
    });

    it('stays ACTIVE while there are more players than the threshold', async () => {
      const { game, layer, players } = await board({ players: 5 });

      await utils.distributeAP(game, 1, CLIENT);

      expect((await fresh(game)).GAME_STATE).toBe(GAMESTATES.ACTIVE);
      expect(await gateways(layer)).toBe(0);
      expect((await reload(players[0])).Action_Points).toBe(4); // single rate
    });

    // the transition condition stays true for the rest of the game, so
    // without the ACTIVE check it re-ran every interval: four more gateways
    // per layer each time, and the fire spread twice in one distribution
    it('only transitions once, however many distributions follow', async () => {
      const { game, layer } = await board();

      await utils.distributeAP(game, 1, CLIENT);
      expect(await gateways(layer)).toBe(4);

      await utils.distributeAP(await fresh(game), 1, CLIENT);
      await utils.distributeAP(await fresh(game), 1, CLIENT);

      expect(await gateways(layer)).toBe(4);
    });

    // a timestop is the Clockwatcher's whole ability; overwriting the state
    // with FINALE loses the remaining turns AND the tick-down that ends it
    it('waits for a timestop to run out before starting', async () => {
      const { game } = await board({
        game: { GAME_STATE: GAMESTATES.TIMESTOPPED, timestopTurns: 1 },
      });

      await utils.distributeAP(game, 1, CLIENT);
      const afterTimestop = await fresh(game);
      expect(afterTimestop.timestopTurns).toBe(0);
      expect(afterTimestop.GAME_STATE).toBe(GAMESTATES.ACTIVE);

      await utils.distributeAP(afterTimestop, 1, CLIENT);
      expect((await fresh(game)).GAME_STATE).toBe(GAMESTATES.FINALE);
    });

    // Four independent draws from the same pool can return one tile four
    // times, which quietly gave a layer fewer gateways than it should have.
    // The randomness is pinned rather than relied on: four draws that all
    // land on index 0 are four DIFFERENT tiles when the pool shrinks, and one
    // tile four times when it does not - so this fails every run under the
    // old code, not the nine runs in ten a real dice roll would catch.
    it('gives four DISTINCT gateway tiles, not four draws that may collide', async () => {
      const { game, layer } = await board({ width: 5, height: 5 });
      jest.spyOn(utils, 'getRandomInt').mockReturnValue(0);

      await utils.distributeAP(game, 1, CLIENT);

      expect(await gateways(layer)).toBe(4);
    });
  });

  describe('the fire', () => {
    it('spreads one orthogonal ring per distribution, and no further', async () => {
      const { game, layer } = await inFinale({ width: 7, height: 7 });
      await (await tileAt(layer, 4, 4)).update({ Tile_Type: 'Fire' });

      await utils.distributeAP(game, 1, CLIENT);

      // the centre plus its four orthogonal neighbours - NOT the diagonals
      expect(await fires(layer)).toBe(5);
      expect((await tileAt(layer, 3, 3)).Tile_Type).not.toBe('Fire');

      await utils.distributeAP(await fresh(game), 1, CLIENT);
      // one more ring: 5 + the 8 tiles orthogonally adjacent to the first ring
      expect(await fires(layer)).toBe(13);
    });

    // every neighbour off the edge of the layer comes back null, and the
    // centre tile comes back as itself
    it('does not throw when the fire is against the edge of the board', async () => {
      const { game, layer } = await inFinale({ width: 5, height: 5 });
      await (await tileAt(layer, 1, 1)).update({ Tile_Type: 'Fire' });

      await expect(utils.distributeAP(game, 1, CLIENT)).resolves.not.toThrow();

      expect(await fires(layer)).toBe(3); // corner plus its two neighbours
    });

    it('will not burn a wall, a void, or a gateway', async () => {
      const { game, layer } = await inFinale({ width: 5, height: 5 });
      await (await tileAt(layer, 3, 3)).update({ Tile_Type: 'Fire' });
      await (await tileAt(layer, 3, 2)).update({ Tile_Type: 'Wall' });
      await (await tileAt(layer, 2, 3)).update({ Tile_Type: 'Void' });
      await (await tileAt(layer, 4, 3)).update({ Tile_Type: 'Gateway_Locked' });

      await utils.distributeAP(game, 1, CLIENT);

      expect((await tileAt(layer, 3, 2)).Tile_Type).toBe('Wall');
      expect((await tileAt(layer, 2, 3)).Tile_Type).toBe('Void');
      expect((await tileAt(layer, 4, 3)).Tile_Type).toBe('Gateway_Locked');
      expect((await tileAt(layer, 3, 4)).Tile_Type).toBe('Fire'); // the open side did burn
    });

    it('burns the player standing in it, every distribution', async () => {
      const { game, layer, players } = await inFinale({ width: 7, height: 7 });
      const victim = players[0];
      await (await tileAt(layer, 4, 4)).update({ Tile_Type: 'Fire' });
      await utils.clearPlayerFromBoard(victim.Player_ID, (await reload(victim)).Tile_ID, 'Tile_ID');
      await utils.placePlayerOnBoard(victim.Player_ID, await tileAt(layer, 4, 4));

      await utils.distributeAP(game, 1, CLIENT);
      expect((await reload(victim)).Health_Points).toBe(9); // fireDmg 1

      await utils.distributeAP(await fresh(game), 1, CLIENT);
      expect((await reload(victim)).Health_Points).toBe(8);
      await assertBoardConsistent(game.Game_ID);
    });

    // hpGain only BUILDS an update payload, so the original
    // `this.hpGain(player, -1)` computed a number and dropped it; going
    // through damagePlayer means the fire can actually finish someone off
    it('can kill, and the victim leaves the board', async () => {
      const { game, layer, players } = await inFinale({ width: 7, height: 7 });
      const victim = players[0];
      await models.Players.update({ Health_Points: 1 }, { where: { Player_ID: victim.Player_ID } });
      await (await tileAt(layer, 4, 4)).update({ Tile_Type: 'Fire' });
      await utils.clearPlayerFromBoard(victim.Player_ID, (await reload(victim)).Tile_ID, 'Tile_ID');
      await utils.placePlayerOnBoard(victim.Player_ID, await tileAt(layer, 4, 4));

      await utils.distributeAP(game, 1, CLIENT);

      const dead = await reload(victim);
      expect(dead.Dead).toBeTruthy();
      expect(dead.Tile_ID).toBeNull();
      await assertBoardConsistent(game.Game_ID);
    });
  });
});
