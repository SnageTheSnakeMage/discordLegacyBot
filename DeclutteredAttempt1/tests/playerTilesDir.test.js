/**
 * Where a player's uploaded icon lives.
 *
 * Everything else under tiles/ is artwork baked into the image. A player
 * icon arrives at registration, so it is STATE: written into the image, it
 * survived exactly as long as the container, and every deploy wiped every
 * icon uploaded since the previous one. LEGACY_PLAYER_TILES_DIR points the
 * writer at the /data volume instead, beside the database.
 *
 * The reader therefore has two directories to look in, and these pin which
 * wins. The alternative - mounting the volume over ./tiles/players - is what
 * these tests exist to rule out: it would hide the baked default.png behind
 * an empty volume, and freeze the committed icons at whatever the first
 * deploy happened to seed.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const utils = require('../utils.js');

const BAKED = './tiles/players';

/**
 * A throwaway writable dir, as LEGACY_PLAYER_TILES_DIR would point at.
 *
 * `await run(dir)`, not `return run(dir)`: with an async callback the second
 * runs `finally` the moment the promise is CREATED, so the variable was put
 * back before the body that needed it ever ran. The first version of this
 * helper did exactly that and the test failed with the default path.
 */
async function withWritableDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'player-tiles-'));
  const saved = process.env.LEGACY_PLAYER_TILES_DIR;
  process.env.LEGACY_PLAYER_TILES_DIR = dir;
  try {
    return await run(dir);
  } finally {
    if (saved === undefined) delete process.env.LEGACY_PLAYER_TILES_DIR;
    else process.env.LEGACY_PLAYER_TILES_DIR = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('playerTilesDir', () => {
  it('is the baked directory when nothing overrides it, so local runs are unchanged', () => {
    const saved = process.env.LEGACY_PLAYER_TILES_DIR;
    delete process.env.LEGACY_PLAYER_TILES_DIR;
    try {
      expect(utils.playerTilesDir()).toBe(BAKED);
      expect(utils.tileSearchDirs('players')).toEqual([BAKED]);
    } finally {
      if (saved !== undefined) process.env.LEGACY_PLAYER_TILES_DIR = saved;
    }
  });

  it('searches the writable directory first, then the image', async () => {
    await withWritableDir((dir) => {
      expect(utils.tileSearchDirs('players')).toEqual([dir, BAKED]);
    });
  });

  it('leaves every other layer alone', async () => {
    await withWritableDir(() => {
      expect(utils.tileSearchDirs('environment')).toEqual(['./tiles/environment']);
    });
  });
});

describe('resolveTileTexturePath across both player directories', () => {
  it('finds an icon that only exists in the volume', async () => {
    await withWritableDir((dir) => {
      fs.writeFileSync(path.join(dir, '999_1.png'), 'not really a png');
      expect(utils.resolveTileTexturePath('players', '999_1')).toBe(`${dir}/999_1.png`);
    });
  });

  // the icons committed to the repo, and default.png, stay in the image and
  // keep being found - a volume mounted over them would have hidden all of it
  it('still finds the baked default when the volume holds nothing', async () => {
    await withWritableDir(() => {
      expect(utils.resolveTileTexturePath('players', 'nobody_7')).toBe(`${BAKED}/default.png`);
    });
  });

  it('prefers the uploaded icon over one of the same name in the image', async () => {
    await withWritableDir((dir) => {
      const baked = fs.readdirSync(BAKED).find((f) => f.endsWith('.png') && f !== 'default.png');
      fs.writeFileSync(path.join(dir, baked), 'newer upload');
      expect(utils.resolveTileTexturePath('players', baked.replace('.png', '')))
        .toBe(`${dir}/${baked}`);
    });
  });
});

describe('registerPlayer writes where the icons persist', () => {
  it('downloads into the writable directory, creating it if it is not there yet', async () => {
    await withWritableDir(async (dir) => {
      const nested = path.join(dir, 'made', 'on', 'demand');
      process.env.LEGACY_PLAYER_TILES_DIR = nested;
      const spawn = jest.spyOn(utils, 'spawnPlayer').mockResolvedValue(undefined);
      const download = jest.spyOn(utils, 'downloadImageWithFetch').mockResolvedValue(undefined);
      try {
        await utils.registerPlayer(4, '123', { url: 'https://example.invalid/icon.png' });
        expect(download).toHaveBeenCalledWith('https://example.invalid/icon.png', `${nested}/123_4.png`);
        expect(fs.existsSync(nested)).toBe(true);
      } finally {
        spawn.mockRestore();
        download.mockRestore();
      }
    });
  });
});
