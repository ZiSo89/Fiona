import express from 'express';
import { listOpenTickets, listTickets } from '../controllers/ticketsController.js';
import { getCallLaterMonitoring } from '../controllers/ticketMonitoringController.js';

export function createTicketsRoutes() {
  const router = express.Router();
  router.get('/', listTickets);
  router.get('/open', listOpenTickets);
  router.get('/call-later-history', getCallLaterMonitoring);
  return router;
}
