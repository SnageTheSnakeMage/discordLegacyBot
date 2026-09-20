/**
 * /stats - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real.
 *
 * AP/range boundary cases do not apply: /stats is read-only and spends
 * nothing, so there is no cost or range check to put a boundary on.
 */
const logic = require('../../../commands/Player Commands/stats.logic.js');
const stats = require('../../../commands/Player Commands/stats.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile, createFakeLayer,
} = require('../../helpers/mockModels.js');

const ACTOR = '123';
const TARGET = '456';
const NOW = 1700000000000;
const NOW_ISO = new Date(NOW).toISOString();

function happyDeps(over = {}) {
  const player = over.player || createFakePlayer({ Discord_ID: ACTOR, Tile_ID: 1, Tile_ID2: 2 });
  const game = over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE });
  const playerClass = over.playerClass || createFakeClass({ Class_Name: 'Average' });
  const tile1 = over.tile1 || createFakeTile({ Tile_ID: 1, Layer_ID: 11, Tile_Type: 'Blank1', X_Position: 3, Y_Position: 4 });
  const tile2 = over.tile2 || createFakeTile({ Tile_ID: 2, Layer_ID: 22, Tile_Type: 'Blank2', X_Position: 7, Y_Position: 8 });
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: { findOne: async () => player },
      Classes: { findByPk: async () => playerClass },
      Tiles: { findByPk: async (id) => (id === 1 ? tile1 : tile2) },
      Layers: { findAll: async () => [createFakeLayer({ Layer_ID: 11 }), createFakeLayer({ Layer_ID: 22 })] },
    },
  });
  return deps;
}

const INPUT = {
  gameId: 1,
  targetDiscordId: null,
  targetUsername: null,
  avatarURL: 'https://cdn.example/avatar.png',
  discordId: ACTOR,
  username: 'snage',
};

function assertNoWrites(deps) {
  for (const model of Object.values(deps.models)) {
    expect(model.update).not.toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
  }
}

describe('stats.parse', () => {
  it('maps raw options and the actor', () => {
    const input = logic.parse(
      { visible: true, game: 2, player: TARGET, playerUsername: 'other', playerAvatarURL: 'url' },
      { discordId: ACTOR, username: 'snage' },
    );
    expect(input).toEqual({
      gameId: 2,
      targetDiscordId: TARGET,
      targetUsername: 'other',
      avatarURL: 'url',
      discordId: ACTOR,
      username: 'snage',
    });
  });

  it('turns absent options into nulls', () => {
    const input = logic.parse(
      { visible: false, game: null, player: null, playerUsername: null, playerAvatarURL: null },
      { discordId: ACTOR, username: 'snage' },
    );
    expect(input).toEqual({
      gameId: null,
      targetDiscordId: null,
      targetUsername: null,
      avatarURL: null,
      discordId: ACTOR,
      username: 'snage',
    });
  });
});

describe('stats.run rejections', () => {
  it('rejects a target not in the game with the exact legacy message (was a throw)', async () => {
    const deps = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.NOT_IN_GAME,
      data: { message: 'Player not found in game! Please register for the game you wish to move in.' },
    });
    assertNoWrites(deps);
  });

  it('rejects an unknown game (the old code crashed on game.GAME_STATE)', async () => {
    const deps = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    assertNoWrites(deps);
  });

  // The state -> verdict table belongs to utils.checkGameState, and
  // tests/utils.pure.test.js walks every state in the enum - including a
  // newly added one. What is this command's own is only that run() asks the
  // gate and returns its verdict without writing, so one state that passes,
  // one that blocks, and the timestop (whose answer depends on the
  // isClockwatcher argument this command passes) cover it here.
  it.each([
    [GAMESTATES.ACTIVE, null],
    [GAMESTATES.OVER, REJECTIONS.GAME_OVER],
    [GAMESTATES.TIMESTOPPED, REJECTIONS.TIME_STOPPED],
  ])('gamestate %s -> %s', async (state, reason) => {
    const deps = happyDeps({ game: createFakeGame({ GAME_STATE: state }) });
    const result = await logic.run(INPUT, deps);
    if (reason === null) {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toMatchObject({ ok: false, reason });
      assertNoWrites(deps);
    }
  });

  it('does not block a Clockwatcher during a timestop', async () => {
    const deps = happyDeps({
      game: createFakeGame({ GAME_STATE: GAMESTATES.TIMESTOPPED }),
      playerClass: createFakeClass({ Class_Name: 'Clockwatcher' }),
    });
    const result = await logic.run(INPUT, deps);
    // the gate now consults the actor's class, so a timestop does not
    // stop a Clockwatcher
    expect(result.reason).not.toBe(REJECTIONS.TIME_STOPPED);
  });
});

describe('stats.run success', () => {
  it('returns the actor stats as plain data, and writes nothing', async () => {
    const deps = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'stats',
      data: {
        username: 'snage',
        avatarURL: 'https://cdn.example/avatar.png',
        className: 'Average',
        classDescription: 'Basic class',
        roleColor: 'ffffff',
        healthPoints: 10,
        maxHp: 10,
        missedHp: 0,
        actionPoints: 5,
        maxAp: 10,
        missedAp: 0,
        damage: 1,
        dmgBuff: 0,
        maxDamage: 3,
        range: 3,
        maxRange: 5,
        onBoard: true,
        dead: false,
        tileType: 'Blank1',
        xPosition: 3,
        yPosition: 4,
        commonLayerId: '1',
        kills: 0,
        pharohHp: 0,
        meals: 0,
        gameId: 1,
        discordId: ACTOR,
        secondBody: null,
        timestamp: NOW_ISO,
        // the fake player has no icon file, so this is the default.png
        // fallback resolveTileTexturePath exists to provide
        iconPath: './tiles/players/default.png',
        tileThumbnailPath: './tiles/environment/Blank1.png',
      },
    });
    expect(deps.models.Players.findOne).toHaveBeenCalledWith({
      where: { Game_ID: 1, Discord_ID: ACTOR },
    });
    assertNoWrites(deps);
  });

  // A dead player has Tile_ID null (playerDeathLogic writes it). Their final
  // stats are exactly what someone wants to look up afterwards, so this is
  // not a rejection - only the board-position fields go.
  it('still returns stats for a dead player, minus the position fields', async () => {
    const deps = happyDeps({
      player: createFakePlayer({ Discord_ID: ACTOR, Tile_ID: null, Tile_ID2: null, Dead: true, Kills: 4 }),
    });
    deps.models.Tiles.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      onBoard: false,
      dead: true,
      tileType: null,
      xPosition: null,
      yPosition: null,
      commonLayerId: null,
      tileThumbnailPath: null,
      // the stats that do not depend on a tile survive
      kills: 4,
      className: 'Average',
    });
    assertNoWrites(deps);
  });

  it('does not ask for a tile texture it has no tile type for', async () => {
    const deps = happyDeps({
      player: createFakePlayer({ Discord_ID: ACTOR, Tile_ID: null, Dead: true }),
    });
    deps.models.Tiles.findByPk = jest.fn(async () => null);
    deps.utils = { ...deps.utils, resolveTileTexturePath: jest.fn(() => './tiles/environment/default.png') };
    const result = await logic.run(INPUT, deps);

    expect(result.data.tileThumbnailPath).toBeNull();
    // the player icon is still resolved - that does not depend on a tile
    const layers = deps.utils.resolveTileTexturePath.mock.calls.map(([layer]) => layer);
    expect(layers).toContain('players');
    expect(layers).not.toContain('environment');
  });

  it('reports a Twin body that is off the board without losing the other', async () => {
    const deps = happyDeps({
      playerClass: createFakeClass({ Class_Name: 'Twin' }),
      player: createFakePlayer({ Discord_ID: ACTOR, Tile_ID: 1, Tile_ID2: null }),
    });
    const tile1 = createFakeTile({ Tile_ID: 1, Layer_ID: 11, Tile_Type: 'Blank1', X_Position: 3, Y_Position: 4 });
    deps.models.Tiles.findByPk = jest.fn(async (id) => (id === 1 ? tile1 : null));
    const result = await logic.run(INPUT, deps);

    expect(result.ok).toBe(true);
    expect(result.data.onBoard).toBe(true);
    expect(result.data.secondBody).toBeNull();
  });

  it('looks up an explicit target and uses their username', async () => {
    const deps = happyDeps({
      player: createFakePlayer({ Discord_ID: TARGET, Tile_ID: 1 }),
    });
    const result = await logic.run(
      { ...INPUT, targetDiscordId: TARGET, targetUsername: 'other' }, deps,
    );
    expect(result.ok).toBe(true);
    expect(result.data.username).toBe('other');
    expect(deps.models.Players.findOne).toHaveBeenCalledWith({
      where: { Game_ID: 1, Discord_ID: TARGET },
    });
  });

  it('resolves the default game via getOldestActiveGameId, not the any-state variant', async () => {
    const deps = happyDeps();
    deps.utils = {
      ...deps.utils,
      getOldestActiveGameId: jest.fn(async () => 1),
      getOldestGameId: jest.fn(async () => 1),
    };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestActiveGameId).toHaveBeenCalledWith(ACTOR);
    expect(deps.utils.getOldestGameId).not.toHaveBeenCalled();
  });

  it('maps the tile Layer_ID to the 1-based common layer number as a string', async () => {
    const deps = happyDeps({
      player: createFakePlayer({ Discord_ID: ACTOR, Tile_ID: 2 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.data.commonLayerId).toBe('2');
    expect(result.data.tileType).toBe('Blank2');
  });

  it('renders a Layer_ID missing from the game layers as "0" (indexOf + 1, as before)', async () => {
    const deps = happyDeps({
      tile1: createFakeTile({ Tile_ID: 1, Layer_ID: 99, X_Position: 3, Y_Position: 4 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.data.commonLayerId).toBe('0');
  });

  it('fetches the second body for a Twin via Tile_ID2', async () => {
    const deps = happyDeps({
      playerClass: createFakeClass({ Class_Name: 'Twin' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.data.secondBody).toEqual({
      commonLayerId: '2',
      xPosition: 7,
      yPosition: 8,
    });
  });
});

describe('stats.present', () => {
  const data = {
    username: 'snage',
    avatarURL: 'https://cdn.example/avatar.png',
    className: 'Average',
    classDescription: 'Basic class',
    roleColor: '00ff00',
    healthPoints: 9,
    maxHp: 10,
    missedHp: 1,
    actionPoints: 5,
    maxAp: 10,
    missedAp: 2,
    damage: 2,
    dmgBuff: 1,
    maxDamage: 3,
    range: 3,
    maxRange: 5,
    onBoard: true,
    dead: false,
    tileType: 'Blank1',
    xPosition: 3,
    yPosition: 4,
    commonLayerId: '1',
    kills: 6,
    pharohHp: 0,
    meals: 0,
    gameId: 1,
    discordId: ACTOR,
    secondBody: null,
    timestamp: NOW_ISO,
    // run() resolves these through utils.resolveTileTexturePath, so by the
    // time present() sees them they are paths that exist on disk
    iconPath: `./tiles/players/${ACTOR}_1.png`,
    tileThumbnailPath: './tiles/environment/Blank1.png',
  };
  const ok = (over = {}) => ({ ok: true, kind: 'stats', data: { ...data, ...over } });
  const fieldNames = (out) => out.embeds[0].fields.map((f) => f.name);

  it('renders a rejection as its player-facing message', () => {
    const out = logic.present({
      ok: false,
      reason: REJECTIONS.NOT_IN_GAME,
      data: { message: 'Player not found in game! Please register for the game you wish to move in.' },
    });
    expect(out).toEqual({ content: 'Player not found in game! Please register for the game you wish to move in.' });
  });

  it('builds the full embed and attachments as plain objects', () => {
    const out = logic.present(ok());
    expect(out.embeds).toHaveLength(1);
    const embed = out.embeds[0];
    expect(embed.constructor).toBe(Object);
    expect(embed.color).toBe(0x00ff00);
    expect(embed.title).toBe('snage');
    expect(embed.description).toBe('Stats for snage');
    expect(embed.author).toEqual({ name: 'snage', icon_url: 'https://cdn.example/avatar.png' });
    expect(embed.thumbnail).toEqual({ url: 'attachment://tileThumbnail.png' });
    expect(embed.image).toEqual({ url: 'attachment://icon.png' });
    expect(embed.timestamp).toBe(NOW_ISO);
    expect(embed.footer).toEqual({ text: 'Game ID: 1' });
    expect(embed.fields).toEqual([
      { name: 'Class', value: 'Average', inline: true },
      { name: 'Class Description', value: 'Basic class' },
      { name: '\u200B', value: '\u200B' },
      { name: 'Current/Max/Missed...', value: 'Health: 9/10/1\nAction Points: 5/10/2', inline: true },
      // current damage is Damage * (DMG_BUFF + 1): 2 * 2 = 4
      { name: 'Current/Max...', value: 'Damage: 4/3\nRange: 3/5' },
      { name: '\u200B', value: '\u200B' },
      { name: 'Kills', value: '6', inline: true },
      { name: 'Current Tile', value: 'Blank1', inline: true },
      { name: 'X Position', value: '3', inline: true },
      { name: 'Y Position', value: '4', inline: true },
      { name: 'Layer', value: '1', inline: true },
    ]);
    // legacy attachment order: icon first, then thumbnail; plain objects only
    expect(out.files).toEqual([
      { path: `./tiles/players/${ACTOR}_1.png`, name: 'icon.png' },
      { path: './tiles/environment/Blank1.png', name: 'tileThumbnail.png' },
    ]);
    expect(out.files[0].constructor).toBe(Object);
  });

  // An AttachmentBuilder does not read its path until the message is sent, so
  // a path that is not on disk used to fail at send time as an unhandled
  // error - the player was told "There was an error while executing this
  // command!" because their icon was missing. present() now only ever
  // attaches a path run() resolved, and drops the embed reference with it.
  it('drops the image rather than attaching an icon path that does not exist', () => {
    const out = logic.present(ok({ iconPath: null }));
    expect(out.files).toEqual([{ path: './tiles/environment/Blank1.png', name: 'tileThumbnail.png' }]);
    expect(out.embeds[0].image).toBeUndefined();
    // the thumbnail is unaffected
    expect(out.embeds[0].thumbnail).toEqual({ url: 'attachment://tileThumbnail.png' });
  });

  it('drops the thumbnail rather than attaching a tile path that does not exist', () => {
    const out = logic.present(ok({ tileThumbnailPath: null }));
    expect(out.files).toEqual([{ path: `./tiles/players/${ACTOR}_1.png`, name: 'icon.png' }]);
    expect(out.embeds[0].thumbnail).toBeUndefined();
    expect(out.embeds[0].image).toEqual({ url: 'attachment://icon.png' });
  });

  it('never references an attachment it did not attach', () => {
    const out = logic.present(ok({ iconPath: null, tileThumbnailPath: null }));
    expect(out.files).toEqual([]);
    expect(out.embeds[0].image).toBeUndefined();
    expect(out.embeds[0].thumbnail).toBeUndefined();
  });

  // the point of showing a dead player's stats at all: everything that does
  // not describe a position on the board is still there
  it('renders a dead player without the position fields, and says why', () => {
    const out = logic.present(ok({
      onBoard: false, dead: true, tileType: null, xPosition: null,
      yPosition: null, commonLayerId: null, tileThumbnailPath: null,
    }));
    const names = fieldNames(out);
    expect(names).not.toContain('X Position');
    expect(names).not.toContain('Y Position');
    expect(names).not.toContain('Layer');
    // the stats worth looking up after a death are all still rendered
    expect(names).toEqual(expect.arrayContaining([
      'Class', 'Current/Max/Missed...', 'Current/Max...', 'Kills',
    ]));
    // and the absence is stated rather than left as a gap
    const tileField = out.embeds[0].fields.find((f) => f.name === 'Current Tile');
    expect(tileField.value).toBe('Dead - off the board');
    // no thumbnail is attached or referenced
    expect(out.embeds[0].thumbnail).toBeUndefined();
    expect(out.files.map((f) => f.name)).not.toContain('tileThumbnail.png');
  });

  it('distinguishes off-the-board-but-alive from dead', () => {
    const out = logic.present(ok({
      onBoard: false, dead: false, tileType: null, tileThumbnailPath: null,
    }));
    const tileField = out.embeds[0].fields.find((f) => f.name === 'Current Tile');
    expect(tileField.value).toBe('Not on the board');
  });

  it('renders a Twin whose second body is gone without crashing on it', () => {
    const out = logic.present(ok({ className: 'Twin', secondBody: null }));
    const names = fieldNames(out);
    expect(names).toContain('Second Body');
    expect(names).not.toContain("Second Body's X Position");
    const field = out.embeds[0].fields.find((f) => f.name === 'Second Body');
    expect(field.value).toBe('Off the board');
  });

  it('omits the author icon when there is no avatar URL', () => {
    const out = logic.present(ok({ avatarURL: null }));
    expect(out.embeds[0].author).toEqual({ name: 'snage' });
  });

  it('hides X/Y/Layer for a Spy', () => {
    const names = fieldNames(logic.present(ok({ className: 'Spy' })));
    expect(names).not.toContain('X Position');
    expect(names).not.toContain('Y Position');
    expect(names).not.toContain('Layer');
  });

  it('shows the second body instead of X/Y/Layer for a Twin', () => {
    const out = logic.present(ok({
      className: 'Twin',
      secondBody: { commonLayerId: '2', xPosition: 7, yPosition: 8 },
    }));
    const names = fieldNames(out);
    expect(names).not.toContain('X Position');
    expect(out.embeds[0].fields.slice(-3)).toEqual([
      { name: "Second Body's Layer", value: '2', inline: true },
      { name: "Second Body's X Position", value: '7', inline: true },
      { name: "Second Body's Y Position", value: '8', inline: true },
    ]);
  });

  it('adds Pharoh HP for a Pharoh', () => {
    const out = logic.present(ok({ className: 'Pharoh', pharohHp: 4 }));
    expect(out.embeds[0].fields).toContainEqual({ name: 'Pharoh HP', value: '4', inline: true });
  });

  it('adds Meals for a Chef', () => {
    const out = logic.present(ok({ className: 'Chef', meals: 2 }));
    expect(out.embeds[0].fields).toContainEqual({ name: 'Meals', value: '2', inline: true });
  });

  it('shows overflow Pharoh HP for a default class as a string (legacy passed a crashing number)', () => {
    const out = logic.present(ok({ pharohHp: 3 }));
    expect(out.embeds[0].fields.slice(-2)).toEqual([
      { name: '\u200B', value: '\u200B' },
      { name: 'Pharoh HP', value: '3' },
    ]);
  });

  it('shows overflow Pharoh HP for a Spy too (legacy default switch branch)', () => {
    const out = logic.present(ok({ className: 'Spy', pharohHp: 3 }));
    expect(fieldNames(out)).toContain('Pharoh HP');
  });

  it('hides overflow Pharoh HP at zero', () => {
    const out = logic.present(ok({ pharohHp: 0 }));
    expect(fieldNames(out)).not.toContain('Pharoh HP');
  });
});

describe('stats adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(stats.data.toJSON().name).toBe('stats');
    expect(typeof stats.execute).toBe('function');
  });
});
