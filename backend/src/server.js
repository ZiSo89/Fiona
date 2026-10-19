import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import {
  getAllLatestSnapshots,
  getConfiguredStores,
  getFionaClient,
  getLatestSnapshot,
  getStores,
  refreshAllTickets,
  refreshTickets,
  startPolling,
} from './services/pollingService.js';
import { createClosedTicketRepository } from './services/closedTicketRepository.js';
import { createTicketObservationRepository } from './services/ticketObservationRepository.js';
import { athensMonthOf, buildMonthlyStats, getClosedTicketDetails } from './services/closedTicketStats.js';
import { createAuth } from './auth.js';
import { createProjectTrackerAuth } from './projectTrackerAuth.js';
import { createProjectTrackerApi } from './services/projectTrackerApi.js';
import { createProjectTrackerRepository } from './services/projectTrackerRepository.js';
import { createProjectTrackerSync } from './services/projectTrackerSync.js';
import { createProjectTrackerEditorDetails } from './services/projectTrackerEditorDetails.js';

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
app.use('/api/tracker', createProjectTrackerApi({
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
app.post('/api/login', auth.login);
app.post('/api/logout', auth.logout);
app.get('/api/session', auth.session);

app.get('/api/health', async (req, res) => {
  try {
    const snapshot = getLatestSnapshot();
    res.json({
      ok: true,
      service: 'Fiona polling agent',
      port: config.port,
      status: snapshot.status,
      lastUpdatedAt: snapshot.lastUpdatedAt,
      totalTickets: snapshot.totalTickets,
      error: snapshot.error,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/stores', (req, res) => {
  res.json({ success: true, stores: getStores() });
});

app.get('/api/tickets', async (req, res) => {
  try {
    const storeId = String(req.query.store || 'alexandroupoli');
    let snapshots;
    if (storeId === 'all') {
      snapshots = getAllLatestSnapshots();
      if (snapshots.some((snapshot) => snapshot.status === 'idle' || snapshot.status === 'polling')) {
        await refreshAllTickets();
        snapshots = getAllLatestSnapshots();
      }
    } else {
      let snapshot = getLatestSnapshot(storeId);
      if (snapshot.status === 'idle' || snapshot.status === 'polling') snapshot = await refreshTickets(storeId);
      snapshots = [snapshot];
    }

    const tickets = snapshots.flatMap((snapshot) => snapshot.tickets);
    const allLive = snapshots.every((snapshot) => snapshot.status === 'live');
    const hasTickets = snapshots.some((snapshot) => snapshot.tickets.length > 0);
    const status = allLive ? 'live' : hasTickets ? 'stale' : 'error';
    const lastUpdatedAt = snapshots
      .map((snapshot) => snapshot.lastUpdatedAt)
      .filter(Boolean)
      .sort()
      .at(-1) || null;
    const data = storeId === 'all'
      ? {
        storeId: 'all',
        storeName: 'Όλα τα καταστήματα',
        status,
        lastUpdatedAt,
        totalTickets: tickets.length,
        tickets,
        stores: snapshots,
        error: snapshots.filter((snapshot) => snapshot.error).map(({ storeId: id, storeName, error }) => ({ storeId: id, storeName, error })),
      }
      : snapshots[0];

    res.json({
      success: status === 'live',
      status,
      data,
      lastUpdatedAt,
      error: status === 'error' ? snapshots.map((snapshot) => snapshot.error).filter(Boolean).join('; ') : null,
    });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

app.get('/api/tickets/open', async (req, res) => {
  try {
    const storeId = String(req.query.store || 'alexandroupoli');
    const snapshots = storeId === 'all' ? getAllLatestSnapshots() : [getLatestSnapshot(storeId)];
    const tickets = snapshots.flatMap((snapshot) => snapshot.tickets);
    res.json({
      success: true,
      total: tickets.length,
      tickets,
    });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

const statsRepositories = new Map();
const getStatsRepositories = (storeId) => {
  if (!statsRepositories.has(storeId)) {
    statsRepositories.set(storeId, {
      closed: createClosedTicketRepository(config.closedTicketsDbPath, storeId),
      observations: createTicketObservationRepository(config.closedTicketsDbPath, storeId),
    });
  }
  return statsRepositories.get(storeId);
};

app.get('/api/closed-tickets/stats', (req, res) => {
  try {
    const storeId = String(req.query.store || 'alexandroupoli');
    if (storeId !== 'all' && !getConfiguredStores().some((store) => store.storeId === storeId)) {
      return res.status(404).json({ success: false, message: `Unknown Fiona store: ${storeId}` });
    }
    const scope = storeId === 'all' ? null : storeId;
    const { closed, observations } = getStatsRepositories(scope);
    const month = String(req.query.month || athensMonthOf(new Date()));
    return res.json({ success: true, storeId, ...buildMonthlyStats(month, closed, observations) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

app.get('/api/closed-tickets/:orderId', (req, res) => {
  try {
    if (!/^[\w-]{1,40}$/.test(req.params.orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }
    const storeId = String(req.query.store || 'alexandroupoli');
    if (!getConfiguredStores().some((store) => store.storeId === storeId)) {
      return res.status(400).json({ success: false, message: 'A configured store is required' });
    }
    const ticket = getClosedTicketDetails(req.params.orderId, getStatsRepositories(storeId).closed, storeId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, ticket });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

const frontendDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
const projectTrackerDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../project-tracker/dist');
if (fs.existsSync(path.join(projectTrackerDist, 'index.html'))) {
  app.use('/tracker', express.static(projectTrackerDist, { index: false }));
  app.get(['/tracker', '/tracker/', '/tracker/*'], (req, res) => res.sendFile(path.join(projectTrackerDist, 'index.html')));
} else {
  app.get(['/tracker', '/tracker/', '/tracker/*'], (req, res) => res.status(503).send('Project Tracker build is not available.'));
}
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

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
