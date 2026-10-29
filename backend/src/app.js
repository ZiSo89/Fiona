import express from 'express';
import helmet from 'helmet';
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

export async function createApp() {
  const app = express();
  app.set('trust proxy', 'loopback');
  // Both PWAs and the API share one origin, so no CORS headers are sent.
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'upgrade-insecure-requests': null,
      },
    },
  }));
  app.use(express.json());

  const auth = createAuth(config.appPassword);
  const projectTrackerRepository = await createProjectTrackerRepository(config.closedTicketsDbPath);
  const projectTrackerAuth = createProjectTrackerAuth({
    teamPasswords: config.projectTrackerTeamPasswords,
    adminPassword: config.projectTrackerAdminPassword,
    sessionSecret: config.projectTrackerSessionSecret,
  });

  app.use('/api/tracker', createProjectTrackerRoutes({
    repository: projectTrackerRepository,
    auth: projectTrackerAuth,
    stores: config.fionaStores,
    getEditorDetails: createProjectTrackerEditorDetails({
      getClient: getFionaClient,
      getStoredDetails: async (storeId, orderId) => await (await getStatsRepositories(storeId)).closed.getTrackerEditorDetails(orderId, storeId),
      getCachedDetails: projectTrackerRepository.getEditorDetailsCache,
      saveCachedDetails: projectTrackerRepository.saveEditorDetailsCache,
    }),
  }));

  app.use('/api', auth.requireAuth);
  app.use('/api', createSystemRoutes(auth));
  app.use('/api/tickets', createTicketsRoutes());
  app.use('/api/closed-tickets', createClosedTicketsRoutes());

  mountStaticApps(app);
  app.use((error, req, res, next) => {
    console.error('Request failed:', error.code || error.name);
    if (res.headersSent) return next(error);
    return res.status(500).json({ success: false, message: 'Δεν ήταν δυνατή η πρόσβαση στα δεδομένα. Δοκίμασε ξανά.' });
  });

  return { app, projectTrackerRepository };
}
