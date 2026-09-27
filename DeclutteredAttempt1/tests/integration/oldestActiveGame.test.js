/**
 * utils.getOldestActiveGameId against a real schema: every command that takes
 * an optional game id falls back to it, so which game it answers is which game
 * a player's command lands on.
 */
const { freshDb, closeDb, utils } = require('./helpers/testDb.js');
const { seedGame, seedLayer, seedPlayer } = require('./helpers/seed.js');
const { GAMESTATES } = require('../../enums.js');

beforeEach(freshDb);
afterAll(closeDb);

/** a game with a fixed id, in the given state, with a board to stand on */
async function game(id, state) {
  const row = await seedGame({ Game_ID: id, GAME_STATE: state });
  const layer = await seedLayer(row.Game_ID);
  return { game: row, layer };
}

describe('getOldestActiveGameId', () => {
  // the lowest id, whatever the ids are - not the lowest id below the number of
  // games found
  it('answers the lowest Game_ID being played', async () => {
    await game(7, GAMESTATES.ACTIVE);
    await game(5, GAMESTATES.ACTIVE);
    expect(await utils.getOldestActiveGameId()).toBe(5);
  });

  it('ignores games that are not being played', async () => {
    await game(1, GAMESTATES.OVER);
    await game(2, GAMESTATES.REGISTRATION);
    await game(3, GAMESTATES.DEV_PAUSED);
    await game(9, GAMESTATES.ACTIVE);
    expect(await utils.getOldestActiveGameId()).toBe(9);
  });

  it('answers null when no game is being played', async () => {
    await game(4, GAMESTATES.OVER);
    expect(await utils.getOldestActiveGameId()).toBeNull();
  });

  it('keeps to the games the player is registered in', async () => {
    const older = await game(5, GAMESTATES.ACTIVE);
    const theirs = await game(8, GAMESTATES.ACTIVE);
    await seedPlayer(older.game.Game_ID, { discordId: 'someone-else', x: 1, y: 1, layerId: older.layer.Layer_ID });
    await seedPlayer(theirs.game.Game_ID, { discordId: 'them', x: 1, y: 1, layerId: theirs.layer.Layer_ID });
    expect(await utils.getOldestActiveGameId('them')).toBe(8);
  });

  it('answers null for a player registered in no game being played', async () => {
    const over = await game(3, GAMESTATES.OVER);
    await game(6, GAMESTATES.ACTIVE);
    await seedPlayer(over.game.Game_ID, { discordId: 'them', x: 1, y: 1, layerId: over.layer.Layer_ID });
    expect(await utils.getOldestActiveGameId('them')).toBeNull();
  });
});
