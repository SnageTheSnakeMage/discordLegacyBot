/**
 * deploy-commands.js is the one thing that talks to Discord's command
 * registration endpoint, and it only ever runs from the Deploy workflow's
 * register-commands job - where a missing secret is the likeliest failure and
 * the hardest to read, because the error comes from inside @discordjs/rest and
 * names nothing.
 *
 * These pin that the environment is checked up front, and that the message
 * names the variable rather than the symptom.
 */
const path = require('path');

const DEPLOY_COMMANDS = path.join(__dirname, '..', 'deploy-commands.js');
const REQUIRED = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'];

/** a full, valid environment for the registration script */
function validEnv() {
  return { DISCORD_TOKEN: 'token', CLIENT_ID: '123', GUILD_ID: '456' };
}

/**
 * Run deployCommands() with exactly `env` set for the required variables, and
 * return whatever it rejects with. dotenv would otherwise read a real .env off
 * disk, so the module is loaded fresh with the variables pinned.
 */
async function runWith(env) {
  const saved = {};
  for (const name of REQUIRED) {
    saved[name] = process.env[name];
    if (env[name] === undefined) delete process.env[name];
    else process.env[name] = env[name];
  }
  try {
    jest.resetModules();
    // dotenv must not repopulate what this test deliberately removed
    jest.doMock('dotenv', () => ({ config: () => ({ parsed: {} }) }));
    const deployCommands = require(DEPLOY_COMMANDS);
    return await deployCommands().then(() => null, (err) => err);
  } finally {
    for (const name of REQUIRED) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    jest.dontMock('dotenv');
    jest.resetModules();
  }
}

describe('deploy-commands environment preflight', () => {
  it('names every missing variable, one message, before touching Discord', async () => {
    const offenders = [];
    for (const name of REQUIRED) {
      const env = validEnv();
      delete env[name];
      const err = await runWith(env);
      if (!err) offenders.push(`${name}: missing, but deployCommands resolved`);
      else if (!err.message.includes(name)) offenders.push(`${name}: message does not name it - "${err.message}"`);
    }
    expect(offenders).toEqual([]);
  });

  it('reports all three together when the environment is empty', async () => {
    const err = await runWith({});
    expect(err).toBeInstanceOf(Error);
    for (const name of REQUIRED) expect(err.message).toContain(name);
  });

  it('fails before reading any command file, so a bad env is not a slow failure', async () => {
    const readdirSync = jest.spyOn(require('fs'), 'readdirSync');
    try {
      const err = await runWith({});
      expect(err).toBeInstanceOf(Error);
      expect(readdirSync).not.toHaveBeenCalled();
    } finally {
      readdirSync.mockRestore();
    }
  });
});
