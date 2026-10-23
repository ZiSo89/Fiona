import { config } from './config.js';
import { createApp } from './app.js';
import { getFionaClient, startPolling } from './services/pollingService.js';
import { createProjectTrackerSync } from './services/projectTrackerSync.js';

const { app, projectTrackerRepository } = createApp();

app.listen(config.port, () => {
  console.log(`Fiona polling service listening on port ${config.port}`);
  startPolling();
  const trackerStores = config.fionaStores.filter((store) => store.configured);
  const trackerSync = createProjectTrackerSync({
    stores: trackerStores,
    clients: new Map(trackerStores.map((store) => [store.storeId, getFionaClient(store.storeId)])),
    repository: projectTrackerRepository,
    lookbackDays: config.projectTrackerLookbackDays,
    intervalMs: config.projectTrackerSyncIntervalMs,
  });
  trackerSync.start();
});
