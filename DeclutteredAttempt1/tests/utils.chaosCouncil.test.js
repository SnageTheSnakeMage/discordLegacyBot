/**
 * The chaos council's vote counting.
 *
 * tallyChaosVotes is pure on purpose: fetching votes is discord's business,
 * counting them is the game's, and only the counting has rules worth
 * pinning. pollToResults is the thin layer that feeds it, tested against a
 * fake poll object rather than a real one.
 *
 * The old pollToResults could not work at all: `for (answer in poll.answers)`
 * iterates keys, `answer` was an undeclared implicit global, and the
 * accumulator started as the number 0 so `.text` came back undefined. It
 * also counted votes from anyone at all - living players, spectators, and
 * players of other games sharing the channel.
 */
const utils = require('../utils.js');
const { createFakePlayer, createFakeGame, createFakeClass } = require('./helpers/mockModels.js');

const DEAD_A = '111111111111111111';
const DEAD_B = '222222222222222222';
const ALIVE = '333333333333333333';
const STRANGER = '444444444444444444';

const votes = (...pairs) => pairs.map(([text, voterDiscordIds]) => ({ text, voterDiscordIds }));

describe('tallyChaosVotes', () => {
  const eligible = new Set([DEAD_A, DEAD_B]);

  it('returns the answer with the most eligible votes', () => {
    const result = utils.tallyChaosVotes(
      votes(['previous', []], ['Blockade', [DEAD_A, DEAD_B]], ['Leftovers', []]),
      eligible, null,
    );
    expect(result).toBe('Blockade');
  });

  it('ignores votes from players who are not dead in this game', () => {
    // the whole point of gripe 7: a living player and a stranger cannot
    // swing the council
    const result = utils.tallyChaosVotes(
      votes(['previous', [DEAD_A]], ['Blockade', [ALIVE, STRANGER, ALIVE]]),
      eligible, null,
    );
    expect(result).toBe('previous');
  });

  it('returns null when nobody eligible voted', () => {
    expect(utils.tallyChaosVotes(
      votes(['previous', [ALIVE]], ['Blockade', [STRANGER]]), eligible, null,
    )).toBeNull();
  });

  it('breaks a tie towards the first answer, which is the previous event', () => {
    expect(utils.tallyChaosVotes(
      votes(['previous', [DEAD_A]], ['Blockade', [DEAD_B]]), eligible, null,
    )).toBe('previous');
  });

  it("an overrider's answer wins outright, however few votes it has", () => {
    // DEAD_B alone picks Leftovers and holds the override; DEAD_A's answer
    // has more votes and still loses
    const result = utils.tallyChaosVotes(
      votes(['previous', []], ['Blockade', [DEAD_A]], ['Leftovers', [DEAD_B]]),
      eligible, DEAD_B,
    );
    expect(result).toBe('Leftovers');
  });

  it('an overrider who did not vote changes nothing', () => {
    const result = utils.tallyChaosVotes(
      votes(['previous', []], ['Blockade', [DEAD_B]]), eligible, DEAD_A,
    );
    expect(result).toBe('Blockade');
  });

  it('an overrider who is not eligible cannot swing it either', () => {
    expect(utils.tallyChaosVotes(
      votes(['previous', []], ['Blockade', [STRANGER]]), eligible, STRANGER,
    )).toBeNull();
  });

  it('handles an empty poll without throwing', () => {
    expect(utils.tallyChaosVotes([], eligible, null)).toBeNull();
    expect(utils.tallyChaosVotes(null, eligible, null)).toBeNull();
  });
});

describe('pollToResults', () => {
  // pollToResults looks the Medium class up by name so mediums can vote
  // alongside the dead. Unit tests never touch the database, so the lookup is
  // stubbed here; without it every case below hits real sqlite and dies with
  // "no such table: Classes".
  beforeEach(() => {
    jest.spyOn(utils.models.Classes, 'findOne')
      .mockResolvedValue(createFakeClass({ Class_ID: 9, Class_Name: 'Medium' }));
  });

  /** a stand-in for discord's poll object: answers is a Collection */
  function fakePoll(answers) {
    return {
      answers: new Map(answers.map((a, i) => [i, {
        text: a.text,
        fetchVoters: a.fetchVoters
          || (async () => new Map((a.voters || []).map((id) => [id, { id }]))),
      }])),
    };
  }

  it('counts only the dead players of this game', async () => {
    jest.spyOn(utils.models.Players, 'findAll').mockResolvedValue([
      createFakePlayer({ Discord_ID: DEAD_A }),
      createFakePlayer({ Discord_ID: DEAD_B }),
    ]);
    const poll = fakePoll([
      { text: 'previous', voters: [ALIVE] },
      { text: 'Blockade', voters: [DEAD_A, STRANGER] },
    ]);

    const result = await utils.pollToResults(poll, createFakeGame({ Game_ID: 1, overrider: null }));

    expect(result).toBe('Blockade');
    expect(utils.models.Players.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { Game_ID: 1, Dead: true } }),
    );
  });

  it('resolves the overrider Player_ID to their discord id', async () => {
    jest.spyOn(utils.models.Players, 'findAll').mockResolvedValue([
      createFakePlayer({ Discord_ID: DEAD_A }),
      createFakePlayer({ Discord_ID: DEAD_B }),
    ]);
    jest.spyOn(utils.models.Players, 'findByPk').mockResolvedValue(
      createFakePlayer({ Player_ID: 7, Discord_ID: DEAD_B }),
    );
    const poll = fakePoll([
      { text: 'previous', voters: [DEAD_A] },
      { text: 'Leftovers', voters: [DEAD_B] },
    ]);

    const result = await utils.pollToResults(poll, createFakeGame({ Game_ID: 1, overrider: 7 }));

    expect(utils.models.Players.findByPk).toHaveBeenCalledWith(7);
    expect(result).toBe('Leftovers');
  });

  it('one unreadable answer does not lose the whole council', async () => {
    jest.spyOn(utils.models.Players, 'findAll').mockResolvedValue([
      createFakePlayer({ Discord_ID: DEAD_A }),
    ]);
    const poll = fakePoll([
      { text: 'previous', fetchVoters: async () => { throw new Error('missing access'); } },
      { text: 'Blockade', voters: [DEAD_A] },
    ]);

    expect(await utils.pollToResults(poll, createFakeGame({ Game_ID: 1, overrider: null })))
      .toBe('Blockade');
  });

  it('counts the dead alone when the Medium class row is missing', async () => {
    // a fresh or half-seeded database must cost the council its mediums,
    // not throw and lose the whole vote
    utils.models.Classes.findOne.mockResolvedValue(null);
    jest.spyOn(utils.models.Players, 'findAll').mockResolvedValue([
      createFakePlayer({ Discord_ID: DEAD_A }),
    ]);
    const poll = fakePoll([
      { text: 'previous', voters: [ALIVE] },
      { text: 'Blockade', voters: [DEAD_A] },
    ]);

    const result = await utils.pollToResults(poll, createFakeGame({ Game_ID: 1, overrider: null }));

    expect(result).toBe('Blockade');
    // only the dead lookup ran: no Class_ID to query mediums by
    expect(utils.models.Players.findAll).toHaveBeenCalledTimes(1);
  });

  it('a poll nobody eligible voted in leaves the event unchanged', async () => {
    jest.spyOn(utils.models.Players, 'findAll').mockResolvedValue([]);
    const poll = fakePoll([{ text: 'Blockade', voters: [ALIVE] }]);
    expect(await utils.pollToResults(poll, createFakeGame({ Game_ID: 1, overrider: null })))
      .toBeNull();
  });
});

describe('buildChaosCouncilDescriptions', () => {
  const { ChaosEvents } = require('../enums.js');

  it('describes every answer the poll offers', () => {
    const poll = utils.buildChaosCouncilPoll('Blockade', createFakeGame({ Game_ID: 1, AP_INTERVAL_MIN: 720 }));
    const body = utils.buildChaosCouncilDescriptions(poll);

    for (const answer of poll.answers) {
      expect(body).toContain(answer.text);
    }
    // three answers, so three descriptions and no "no description" fallbacks
    expect(body).not.toContain('No description available.');
  });

  it('strips the "previous event: " label so the standing event is described too', () => {
    const poll = utils.buildChaosCouncilPoll('Blockade', createFakeGame({ Game_ID: 1, AP_INTERVAL_MIN: 720 }));
    const body = utils.buildChaosCouncilDescriptions(poll);
    expect(body).toContain('previous event: Blockade');
    expect(body).toContain(ChaosEvents.Blockade);
  });

  it('an event missing from the enum costs its line, not the whole message', () => {
    const body = utils.buildChaosCouncilDescriptions({
      answers: [{ text: 'Blockade' }, { text: 'Not A Real Event' }],
    });
    expect(body).toContain(ChaosEvents.Blockade);
    expect(body).toContain('No description available.');
  });

  it('stays inside discord\'s message limit', () => {
    // every real event at once is far more than a poll ever offers, and still
    // has to come back sendable
    const body = utils.buildChaosCouncilDescriptions({
      answers: Object.keys(ChaosEvents).map((text) => ({ text })),
    });
    expect(body.length).toBeLessThanOrEqual(2000);
  });

  it('returns null for a poll with no answers, so nothing is posted', () => {
    expect(utils.buildChaosCouncilDescriptions({ answers: [] })).toBeNull();
    expect(utils.buildChaosCouncilDescriptions(null)).toBeNull();
  });
});

describe('postChaosCouncilPoll', () => {
  function fakeClient(channel) {
    return { channels: { fetch: jest.fn(async () => channel) } };
  }

  it('posts the descriptions in a second message replying to the poll', async () => {
    jest.spyOn(utils.models.Games, 'update').mockResolvedValue([1]);
    const send = jest.fn(async () => ({ id: '999' }));
    const game = createFakeGame({ Game_ID: 1, deadChatChannelId: '77', CURR_CC_EVENT: 'Blockade', AP_INTERVAL_MIN: 720 });

    const id = await utils.postChaosCouncilPoll(game, fakeClient({ send }));

    expect(id).toBe('999');
    expect(send).toHaveBeenCalledTimes(2);
    // the poll first, on its own: a poll message carries no body text
    expect(send.mock.calls[0][0]).toHaveProperty('poll');
    const followUp = send.mock.calls[1][0];
    expect(followUp.content).toContain('previous event: Blockade');
    expect(followUp.reply).toEqual({ messageReference: '999', failIfNotExists: false });
  });

  it('keeps the poll when the descriptions cannot be sent', async () => {
    jest.spyOn(utils.models.Games, 'update').mockResolvedValue([1]);
    const send = jest.fn()
      .mockResolvedValueOnce({ id: '999' })
      .mockRejectedValueOnce(new Error('missing permissions'));
    const game = createFakeGame({ Game_ID: 1, deadChatChannelId: '77', CURR_CC_EVENT: 'Blockade', AP_INTERVAL_MIN: 720 });

    // the poll is open and recorded; the descriptions failing is not its problem
    await expect(utils.postChaosCouncilPoll(game, fakeClient({ send }))).resolves.toBe('999');
    expect(utils.models.Games.update).toHaveBeenCalledWith(
      { currentChaosPollMsgId: '999' }, { where: { Game_ID: 1 } },
    );
  });
});

describe('buildChaosCouncilPoll', () => {
  it('names the game in the question, so concurrent councils are tellable apart', () => {
    const poll = utils.buildChaosCouncilPoll('BOOOORRRINNNG', createFakeGame({ Game_ID: 4, AP_INTERVAL_MIN: 720 }));
    expect(poll.question.text).toContain('Game 4');
  });

  it('offers the previous event first, then two distinct new ones', () => {
    const poll = utils.buildChaosCouncilPoll('Blockade', createFakeGame({ Game_ID: 1, AP_INTERVAL_MIN: 720 }));
    expect(poll.answers).toHaveLength(3);
    expect(poll.answers[0].text).toBe('previous event: Blockade');
    expect(poll.answers[1].text).not.toBe(poll.answers[2].text);
  });

  it('never asks discord for a zero-hour poll', () => {
    // duration is in HOURS; any interval under 30 minutes used to round to 0,
    // which discord rejects
    const poll = utils.buildChaosCouncilPoll('x', createFakeGame({ Game_ID: 1, AP_INTERVAL_MIN: 10 }));
    expect(poll.duration).toBeGreaterThanOrEqual(1);
  });
});
