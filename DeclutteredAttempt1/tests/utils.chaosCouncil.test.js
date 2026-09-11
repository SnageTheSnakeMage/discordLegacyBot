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
const { createFakePlayer, createFakeGame } = require('./helpers/mockModels.js');

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

  it('a poll nobody eligible voted in leaves the event unchanged', async () => {
    jest.spyOn(utils.models.Players, 'findAll').mockResolvedValue([]);
    const poll = fakePoll([{ text: 'Blockade', voters: [ALIVE] }]);
    expect(await utils.pollToResults(poll, createFakeGame({ Game_ID: 1, overrider: null })))
      .toBeNull();
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
