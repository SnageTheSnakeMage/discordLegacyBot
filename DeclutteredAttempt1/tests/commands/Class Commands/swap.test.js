/**
 * /swap - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real.
 */
const logic = require('../../../commands/Class Commands/swap.logic.js');
const swap = require('../../../commands/Class Commands/swap.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile,
} = require('../../helpers/mockModels.js');

const ACTOR = '123';
const VICTIM = '456';

const INPUT = {
  victimDiscordId: VICTIM,
  victimUsername: 'victim',
  gameId: 1,
  discordId: ACTOR,
  username: 'snage',
};

/**
 * Happy-path deps: a Switchmate on tile 1 at (1,1), a victim on tile 2 at
 * (5,4). /swap has no range and no AP gate, so distance never matters.
 */
function happyDeps(over = {}) {
  const player = over.player || createFakePlayer({
    Player_ID: 1, Class_ID: 5, Discord_ID: ACTOR, Tile_ID: 1,
  });
  const victim = 'victim' in over ? over.victim : createFakePlayer({
    Player_ID: 2, Class_ID: 7, Discord_ID: VICTIM, Tile_ID: 2,
  });
  const game = over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE });
  const playerClass = 'playerClass' in over ? over.playerClass
    : createFakeClass({ Class_ID: 5, Class_Name: 'Switchmate' });
  const playerTile = 'playerTile' in over ? over.playerTile
    : createFakeTile({ Tile_ID: 1, X_Position: 1, Y_Position: 1, Layer_ID: 1 });
  const victimTile = 'victimTile' in over ? over.victimTile
    : createFakeTile({ Tile_ID: 2, X_Position: 5, Y_Position: 4, Layer_ID: 1 });

  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async ({ where }) => (
          where.Discord_ID === ACTOR ? player : where.Discord_ID === VICTIM ? victim : null
        ),
      },
      Classes: { findByPk: async () => playerClass },
      Tiles: { findByPk: async (id) => (id === 1 ? playerTile : id === 2 ? victimTile : null) },
    },
  });
  return { deps, player, victim, game, playerTile, victimTile };
}

describe('swap.parse', () => {
  it('maps raw options onto the input', () => {
    const input = logic.parse(
      { victim: VICTIM, victimUsername: 'victim', game: 2 },
      { discordId: ACTOR, username: 'snage' },
    );
    expect(input).toEqual({
      victimDiscordId: VICTIM,
      victimUsername: 'victim',
      gameId: 2,
      discordId: ACTOR,
      username: 'snage',
    });
  });

  it('defaults an absent game and an absent victim username to null', () => {
    const input = logic.parse(
      { victim: VICTIM, victimUsername: null, game: null },
      { discordId: ACTOR, username: 'snage' },
    );
    expect(input.gameId).toBeNull();
    expect(input.victimUsername).toBeNull();
  });
});

describe('swap.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects an actor who is not in the game and writes nothing', async () => {
    const { deps, victim } = happyDeps();
    deps.models.Players.findOne = jest.fn(async ({ where }) => (where.Discord_ID === VICTIM ? victim : null));
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.NOT_IN_GAME,
      data: { message: 'You are not in this game!' },
    });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects an actor who is not a Switchmate and writes nothing', async () => {
    const { deps } = happyDeps({ playerClass: createFakeClass({ Class_ID: 5, Class_Name: 'Average' }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Switchmate' } });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects when the actor has no class row and writes nothing', async () => {
    const { deps } = happyDeps({ playerClass: null });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_CLASS);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a victim who is not in the game and writes nothing', async () => {
    const { deps } = happyDeps({ victim: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.TARGET_NOT_IN_GAME,
      data: { message: 'The victim is not in this game!' },
    });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects when the actor has no tile row and writes nothing', async () => {
    const { deps } = happyDeps({ playerTile: null });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_TILE);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects when the victim has no tile row and writes nothing', async () => {
    const { deps } = happyDeps({ victimTile: null });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_TILE);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a victim standing on the actor\'s own tile and writes nothing', async () => {
    const { deps } = happyDeps({
      victimTile: createFakeTile({ Tile_ID: 2, X_Position: 1, Y_Position: 1, Layer_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.SAME_TILE });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('allows identical coordinates on a different layer (all three parts must match)', async () => {
    const { deps } = happyDeps({
      victimTile: createFakeTile({ Tile_ID: 2, X_Position: 1, Y_Position: 1, Layer_ID: 2 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  // No AP or range boundary cases: /swap checks neither. The 4 AP its
  // description advertises is never required or spent (pinned below), and the
  // victim may stand anywhere in the game, on any layer.
});

describe('swap.run gamestate gate', () => {
  // every gamestate has a decided outcome; adding a state without deciding
  // its gate fails the coverage test below
  const OUTCOMES = {
    [GAMESTATES.ACTIVE]: null,
    [GAMESTATES.REGISTRATION]: null,
    [GAMESTATES.INACTIVE]: null,
    [GAMESTATES.SANDBOX]: null,
    [GAMESTATES.FINALE]: null,
    [GAMESTATES.OVER]: REJECTIONS.GAME_OVER,
    [GAMESTATES.DEV_PAUSED]: REJECTIONS.GAME_PAUSED,
    [GAMESTATES.TIMESTOPPED]: REJECTIONS.TIME_STOPPED,
  };

  it('decides an outcome for all 8 gamestates', () => {
    expect(Object.keys(OUTCOMES).sort()).toEqual(Object.values(GAMESTATES).sort());
  });

  it.each(Object.values(GAMESTATES).map((state) => [state, OUTCOMES[state]]))(
    'gamestate %s -> %s', async (state, reason) => {
      const { deps } = happyDeps({ game: createFakeGame({ GAME_STATE: state }) });
      const result = await logic.run(INPUT, deps);
      if (reason === null) {
        expect(result.ok).toBe(true);
      } else {
        expect(result).toMatchObject({ ok: false, reason });
        expect(deps.models.Players.update).not.toHaveBeenCalled();
      }
    },
  );

  // PRESERVED QUIRK: the gate is called with isClockwatcher = false, so a
  // Clockwatcher gets no exemption here
  it('blocks a timestop before it ever looks at the actor\'s class', async () => {
    const { deps } = happyDeps({
      game: createFakeGame({ GAME_STATE: GAMESTATES.TIMESTOPPED }),
      playerClass: createFakeClass({ Class_ID: 5, Class_Name: 'Clockwatcher' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.TIME_STOPPED);
  });
});

describe('swap.run success', () => {
  it('trades the two Tile_IDs with exact write payloads', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: true,
      kind: 'swapped',
      data: { victimUsername: 'victim', victimDiscordId: VICTIM, gameId: 1 },
    });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Tile_ID: 2 }, { where: { Game_ID: 1, Player_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Tile_ID: 1 }, { where: { Game_ID: 1, Player_ID: 2 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(2);
  });

  // PRESERVED QUIRK: the command advertises 4 AP and charges nothing
  it('never checks or deducts AP', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Class_ID: 5, Discord_ID: ACTOR, Tile_ID: 1, Action_Points: 0 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    for (const call of deps.models.Players.update.mock.calls) {
      expect(call[0]).not.toHaveProperty('Action_Points');
    }
  });

  // PRESERVED QUIRK: only Players.Tile_ID moves - the tiles' own PlayerN
  // occupancy slots are never rewritten
  it('leaves the tiles themselves untouched', async () => {
    const { deps, playerTile, victimTile } = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.models.Tiles.update).not.toHaveBeenCalled();
    expect(playerTile.update).not.toHaveBeenCalled();
    expect(victimTile.update).not.toHaveBeenCalled();
    expect(playerTile.save).not.toHaveBeenCalled();
    expect(victimTile.save).not.toHaveBeenCalled();
  });

  // PRESERVED QUIRK: there is no Dead gate on this command
  it('lets a dead Switchmate swap', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Class_ID: 5, Discord_ID: ACTOR, Tile_ID: 1, Dead: true }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it('resolves the default game via getOldestGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(ACTOR);
  });
});

describe('swap.present', () => {
  it.each([
    [REJECTIONS.WRONG_CLASS, { className: 'Switchmate' }, 'You are not a Switchmate!'],
    [REJECTIONS.TARGET_NOT_IN_GAME, { message: 'The victim is not in this game!' }, 'The victim is not in this game!'],
    [REJECTIONS.NOT_IN_GAME, { message: 'You are not in this game!' }, 'You are not in this game!'],
    [REJECTIONS.SAME_TILE, undefined, 'The player and victim are on the same tile!'],
  ])('renders %s with the legacy wording', (reason, data, content) => {
    expect(logic.present({ ok: false, reason, data })).toEqual({ content });
  });

  it('renders the crash-fix rejections as non-empty text', () => {
    for (const reason of [REJECTIONS.NO_SUCH_GAME, REJECTIONS.NO_SUCH_TILE]) {
      const out = logic.present({ ok: false, reason, data: {} });
      expect(typeof out.content).toBe('string');
      expect(out.content.length).toBeGreaterThan(0);
    }
  });

  it('renders success with the victim\'s username', () => {
    const out = logic.present({
      ok: true,
      kind: 'swapped',
      data: { victimUsername: 'victim', victimDiscordId: VICTIM, gameId: 1 },
    });
    expect(out).toEqual({ content: 'You have swapped places with victim' });
  });
});

describe('swap adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(swap.data.toJSON().name).toBe('swap');
    expect(typeof swap.execute).toBe('function');
  });
});
