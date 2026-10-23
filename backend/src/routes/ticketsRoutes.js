import express from 'express';
import { listOpenTickets, listTickets } from '../controllers/ticketsController.js';

export function createTicketsRoutes() {
  const router = express.Router();
  router.get('/', listTickets);
  router.get('/open', listOpenTickets);
  return router;
}
