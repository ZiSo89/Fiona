import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { getLatestSnapshot, refreshTickets, startPolling } from './services/pollingService.js';
import { createClosedTicketRepository } from './services/closedTicketRepository.js';
import { createTicketObservationRepository } from './services/ticketObservationRepository.js';
import { athensMonthOf, buildMonthlyStats, getClosedTicketDetails } from './services/closedTicketStats.js';
import { createAuth } from './auth.js';

const app = express();
app.set('trust proxy', 'loopback');
app.use(cors());
app.use(express.json());

const auth = createAuth(config.appPassword);
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

app.get('/api/tickets', async (req, res) => {
  try {
    let snapshot = getLatestSnapshot();
    if (snapshot.status === 'idle' || snapshot.status === 'polling') {
      snapshot = await refreshTickets();
    }

    res.json({
      success: snapshot.status === 'live',
      status: snapshot.status,
      data: snapshot,
      lastUpdatedAt: snapshot.lastUpdatedAt,
      error: snapshot.error,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/tickets/open', async (req, res) => {
  try {
    const snapshot = getLatestSnapshot();
    res.json({
      success: true,
      total: snapshot.totalTickets,
      tickets: snapshot.tickets,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

let statsRepositories;
const getStatsRepositories = () => {
  statsRepositories ??= {
    closed: createClosedTicketRepository(),
    observations: createTicketObservationRepository(),
  };
  return statsRepositories;
};

app.get('/api/closed-tickets/stats', (req, res) => {
  try {
    const { closed, observations } = getStatsRepositories();
    const month = String(req.query.month || athensMonthOf(new Date()));
    res.json({ success: true, ...buildMonthlyStats(month, closed, observations) });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

app.get('/api/closed-tickets/:orderId', (req, res) => {
  try {
    if (!/^[\w-]{1,40}$/.test(req.params.orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }
    const ticket = getClosedTicketDetails(req.params.orderId, getStatsRepositories().closed);
    if (!ticket) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, ticket });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

const frontendDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
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
});
