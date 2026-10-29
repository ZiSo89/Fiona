import express from 'express';
import { getDetails, getStats } from '../controllers/closedTicketsController.js';

export function createClosedTicketsRoutes() {
  const router = express.Router();
  router.get('/stats', getStats);
  router.get('/:orderId', getDetails);
  return router;
}
