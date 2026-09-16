/**
 * toDiscord is the one boundary every reply passes through, which makes it the
 * only place a length cap can be enforced once rather than in 44 present()
 * functions. Discord rejects content over 2000 characters, and that rejection
 * surfaces to the player as the central handler's "There was an error while
 * executing this command!" - the same generic text an actual bug produces.
 *
 * These tests use the real discord.js AttachmentBuilder, so they also pin that
 * the descriptor -> reply shape still works with files and embeds alongside a
 * capped string.
 */
const { toDiscord } = require('../commands/_adapter.js');
const { MAX_CONTENT } = require('../commands/_messages.js');

describe('toDiscord content cap', () => {
  it('passes content under the limit through byte-identically', () => {
    const content = 'a'.repeat(MAX_CONTENT - 1);
    expect(toDiscord({ content }).content).toBe(content);
  });

  it('passes content exactly at the limit through untouched (boundary: exact)', () => {
    const content = 'a'.repeat(MAX_CONTENT);
    const out = toDiscord({ content }).content;
    expect(out).toBe(content);
    expect(out).toHaveLength(MAX_CONTENT);
  });

  it('truncates one character over the limit (boundary: one beyond)', () => {
    const content = 'a'.repeat(MAX_CONTENT + 1);
    const out = toDiscord({ content }).content;
    expect(out.length).toBeLessThanOrEqual(MAX_CONTENT);
    expect(out).not.toBe(content);
  });

  it('keeps a very long reply within the limit and says it was cut', () => {
    const out = toDiscord({ content: 'x'.repeat(50000) }).content;
    expect(out.length).toBeLessThanOrEqual(MAX_CONTENT);
    expect(out).toContain('truncated');
    // the start of the message survives - the cut is at the tail
    expect(out.startsWith('xxxx')).toBe(true);
  });

  it('leaves an empty string alone rather than inventing content', () => {
    // toDiscord is not the place to fix an empty reply: a command that has
    // nothing to say should say so itself (see NOTICES in _messages.js), and
    // silently substituting text here would hide that bug instead
    expect(toDiscord({ content: '' }).content).toBe('');
  });

  it('omits content entirely when the descriptor has none', () => {
    expect(toDiscord({ embeds: [{ title: 'x' }] })).not.toHaveProperty('content');
  });

  it('does not coerce a non-string content, so a bug stays visible', () => {
    expect(toDiscord({ content: 42 }).content).toBe(42);
  });

  it('still carries embeds and files alongside capped content', () => {
    const out = toDiscord({
      content: 'y'.repeat(MAX_CONTENT + 500),
      embeds: [{ title: 'still here' }],
      files: [{ buffer: Buffer.from('png'), name: 'grid.png' }],
    });
    expect(out.content.length).toBeLessThanOrEqual(MAX_CONTENT);
    expect(out.embeds).toEqual([{ title: 'still here' }]);
    expect(out.files).toHaveLength(1);
    expect(out.files[0].name).toBe('grid.png');
  });
});
