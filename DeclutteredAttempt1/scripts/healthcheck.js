/**
 * Container healthcheck: healthy only if the heartbeat file was refreshed
 * recently. events/ready.js refreshes it exclusively while the Discord
 * client reports Ready, so process-alive-but-disconnected goes unhealthy.
 */
const fs = require('fs');
const path = require('path');

const HEARTBEAT = process.env.LEGACY_HEARTBEAT_FILE
  || path.join(__dirname, '..', 'Logs', 'heartbeat');
const MAX_AGE_MS = 90 * 1000;

try {
  const age = Date.now() - fs.statSync(HEARTBEAT).mtimeMs;
  if (age > MAX_AGE_MS) {
    console.error(`heartbeat is ${Math.round(age / 1000)}s old`);
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error(`no heartbeat: ${err.message}`);
  process.exit(1);
}
