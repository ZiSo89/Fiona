import { config } from './config.js';
import { createApp } from './app.js';
import { closeStatsRepositories } from './repositories/storeRepositories.js';
import {
  closePollingRepositories,
  getFionaClient,
  initializePolling,
  startPolling,
  stopPolling,
  waitForPollingIdle,
} from './services/pollingService.js';
import { createProjectTrackerSync } from './services/projectTrackerSync.js';

const SHUTDOWN_TIMEOUT_MS = 10 * 1000;

if (!process.env.PROJECT_TRACKER_SESSION_SECRET) {
  console.warn(config.projectTrackerSessionSecret
    ? 'PROJECT_TRACKER_SESSION_SECRET is not set; tracker sessions fall back to APP_PASSWORD. Set a separate random secret.'
    : 'PROJECT_TRACKER_SESSION_SECRET is not set; tracker editor login is disabled.');
}

const { app, projectTrackerRepository } = await createApp();
await initializePolling();

const trackerStores = config.fionaStores.filter((store) => store.configured);
const trackerSync = createProjectTrackerSync({
  stores: trackerStores,
  clients: new Map(trackerStores.map((store) => [store.storeId, getFionaClient(store.storeId)])),
  repository: projectTrackerRepository,
  lookbackDays: config.projectTrackerLookbackDays,
  intervalMs: config.projectTrackerSyncIntervalMs,
});
app.locals.trackerSync = trackerSync;

const server = app.listen(config.port, () => {
  console.log(`Fiona polling service listening on port ${config.port}`);
  startPolling();
  trackerSync.start();
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; shutting down.`);
  stopPolling();
  trackerSync.stop();
  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out; exiting.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();
  try {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeIdleConnections?.();
    });
    await Promise.all([waitForPollingIdle(), trackerSync.idle()]);
    await Promise.all([projectTrackerRepository.close(), closePollingRepositories(), closeStatsRepositories()]);
  } catch (error) {
    console.error('Shutdown cleanup failed:', error?.message);
  }
  process.exit(0);
}

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
