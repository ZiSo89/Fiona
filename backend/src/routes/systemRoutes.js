import express from 'express';
import { health, listStores } from '../controllers/systemController.js';

export function createSystemRoutes(auth) {
  const router = express.Router();
  router.post('/login', auth.login);
  router.post('/logout', auth.logout);
  router.get('/session', auth.session);
  router.get('/health', health);
  router.get('/stores', listStores);
  return router;
}
