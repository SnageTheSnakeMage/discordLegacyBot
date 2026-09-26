/**
 * The central catch in events/interactionCreate.js.
 *
 * Without the thrown message, every unhandled fault reads as one line and a
 * player reporting it cannot say which one they hit - so the reply carries the
 * detail, and the tests below pin the shapes utils actually throws: bare
 * strings as well as Errors.
 */
const handler = require('../events/interactionCreate.js');

const COMMAND = 'board';

/** An interaction that has not answered yet; `answered` flips it to followUp. */
function fakeInteraction(execute, { answered = false } = {}) {
  const interaction = {
    isChatInputCommand: () => true,
    commandName: COMMAND,
    replied: answered,
    deferred: false,
    reply: jest.fn(async () => {}),
    followUp: jest.fn(async () => {}),
    client: { commands: new Map([[COMMAND, { execute }]]) },
  };
  return interaction;
}

describe('errorReplyContent', () => {
  it('appends a thrown string', () => {
    expect(handler.errorReplyContent('tile is full'))
      .toBe('There was an error while executing this command!\ntile is full');
  });

  it("appends an Error's message, not its stack", () => {
    const content = handler.errorReplyContent(new Error("Cannot read properties of null (reading 'Y_Bound')"));
    expect(content).toContain("Cannot read properties of null (reading 'Y_Bound')");
    expect(content).not.toContain('at Object.');
  });

  it('says only the prefix when there is nothing to add', () => {
    for (const nothing of [null, undefined, '']) {
      expect(handler.errorReplyContent(nothing))
        .toBe('There was an error while executing this command!');
    }
  });

  // Discord refuses a body over 2000 characters, which would turn one failure
  // into two - the command's, and the reply about it
  it('cuts a long message to what Discord accepts', () => {
    const content = handler.errorReplyContent('x'.repeat(5000));
    expect(content.length).toBe(2000);
    expect(content.endsWith('...')).toBe(true);
  });
});

describe('interactionCreate error reply', () => {
  it('replies with the detail when the command has not answered', async () => {
    const interaction = fakeInteraction(async () => { throw 'tile is full'; });
    await handler.execute(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('tile is full'),
    }));
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('follows up with the detail when it already answered', async () => {
    const interaction = fakeInteraction(
      async () => { throw new Error('no such column: Tiles.Game_ID'); },
      { answered: true },
    );
    await handler.execute(interaction);
    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('no such column: Tiles.Game_ID'),
    }));
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('leaves a command that does not throw alone', async () => {
    const interaction = fakeInteraction(async () => {});
    await handler.execute(interaction);
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.followUp).not.toHaveBeenCalled();
  });
});
