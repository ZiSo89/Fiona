import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { createAuth } from './middleware/auth.js';
import { createProjectTrackerAuth } from './middleware/projectTrackerAuth.js';
import { createProjectTrackerRepository } from './repositories/projectTrackerRepository.js';
import { getStatsRepositories } from './repositories/storeRepositories.js';
import { getFionaClient } from './services/pollingService.js';
import { createProjectTrackerEditorDetails } from './services/projectTrackerEditorDetails.js';
import { createProjectTrackerRoutes } from './routes/projectTrackerRoutes.js';
import { createSystemRoutes } from './routes/systemRoutes.js';
import { createTicketsRoutes } from './routes/ticketsRoutes.js';
import { createClosedTicketsRoutes } from './routes/closedTicketsRoutes.js';
import { mountStaticApps } from './routes/staticRoutes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(cors());
  app.use(express.json());

  const auth = createAuth(config.appPassword);
  const projectTrackerRepository = createProjectTrackerRepository(config.closedTicketsDbPath);
  const projectTrackerAuth = createProjectTrackerAuth({
    teamPasswords: config.projectTrackerTeamPasswords,
    sessionSecret: config.projectTrackerSessionSecret,
  });

  app.use('/api/tracker', createProjectTrackerRoutes({
    repository: projectTrackerRepository,
    auth: projectTrackerAuth,
    stores: config.fionaStores,
    getEditorDetails: createProjectTrackerEditorDetails({
      getClient: getFionaClient,
      getStoredDetails: (storeId, orderId) => getStatsRepositories(storeId).closed.getTrackerEditorDetails(orderId, storeId),
      getCachedDetails: projectTrackerRepository.getEditorDetailsCache,
      saveCachedDetails: projectTrackerRepository.saveEditorDetailsCache,
    }),
  }));

  app.use('/api', auth.requireAuth);
  app.use('/api', createSystemRoutes(auth));
  app.use('/api/tickets', createTicketsRoutes());
  app.use('/api/closed-tickets', createClosedTicketsRoutes());

  mountStaticApps(app);

  return { app, projectTrackerRepository };
}
