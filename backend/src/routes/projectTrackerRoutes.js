import express from 'express';
import { athensMonthOf } from '../services/closedTicketStats.js';
import { getProjectTrackerCategory } from '../services/projectTrackerCatalog.js';
import { buildProjectTrackerMonth } from '../services/projectTrackerStats.js';

function scopeFromQuery(req, res) {
  const storeId = String(req.query.storeId ?? '').trim() || null;
  const teamName = String(req.query.teamName ?? '').trim() || null;
  if (teamName && !storeId) {
    res.status(400).json({ success: false, message: 'storeId is required with teamName' });
    return null;
  }
  return { storeId, teamName };
}

export function createProjectTrackerRoutes({ repository, auth, stores = [], getEditorDetails = async () => null }) {
  const router = express.Router();
  const storeNames = Object.fromEntries(stores.map((store) => [store.storeId, store.storeName]));

  router.get('/profiles', (req, res) => {
    return res.json({ success: true, profiles: repository.getProfiles(storeNames) });
  });

  router.post('/login', auth.login);
  router.post('/logout', auth.logout);
  router.get('/session', auth.session);

  router.get('/month', (req, res) => {
    try {
      const scope = scopeFromQuery(req, res);
      if (!scope) return undefined;
      const month = String(req.query.month ?? athensMonthOf(new Date()));
      const jobs = repository.getMonthJobs(month, scope.storeId, scope.teamName);
      return res.json({ success: true, ...buildProjectTrackerMonth(month, jobs) });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  });

  router.get('/day', (req, res) => {
    try {
      const scope = scopeFromQuery(req, res);
      if (!scope) return undefined;
      const date = String(req.query.date ?? '');
      return res.json({
        success: true,
        date,
        jobs: repository.getDayJobs(date, scope.storeId, scope.teamName),
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  });

  router.get('/jobs/:orderId/details', auth.requireAuth, async (req, res) => {
    const orderId = String(req.params.orderId ?? '');
    const storeId = String(req.query.storeId ?? '').trim();
    const teamName = String(req.query.teamName ?? '').trim();
    if (!/^[\w-]{1,40}$/.test(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }
    if (req.trackerEditor.storeId !== storeId || req.trackerEditor.teamName !== teamName) {
      return res.status(403).json({ success: false, message: 'Editor is not authorized for this team' });
    }
    const job = repository.getJob(storeId, orderId);
    if (!job || job.teamName !== teamName) {
      return res.status(404).json({ success: false, message: 'Tracker job not found for this team' });
    }

    try {
      const details = await getEditorDetails({ storeId, teamName, orderId });
      if (!details) return res.status(404).json({ success: false, message: 'Details not found' });
      return res.json({ success: true, details });
    } catch {
      return res.status(502).json({ success: false, message: 'Unable to load Fiona details' });
    }
  });

  router.put('/jobs/:orderId', auth.requireAuth, (req, res) => {
    const { storeId, teamName, categoryId, pointsOverride } = req.body ?? {};
    const orderId = String(req.params.orderId ?? '');
    if (!/^[\w-]{1,40}$/.test(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }
    if (typeof storeId !== 'string' || typeof teamName !== 'string'
      || (categoryId !== null && !getProjectTrackerCategory(categoryId))
      || (pointsOverride !== null && !Number.isInteger(pointsOverride))) {
      return res.status(400).json({ success: false, message: 'Invalid tracker correction' });
    }
    if (req.trackerEditor.storeId !== storeId || req.trackerEditor.teamName !== teamName) {
      return res.status(403).json({ success: false, message: 'Editor is not authorized for this team' });
    }

    try {
      const job = repository.correctJob({
        storeId,
        orderId,
        teamName,
        categoryId,
        pointsOverride,
        changedAt: new Date().toISOString(),
      });
      if (!job) return res.status(404).json({ success: false, message: 'Tracker job not found for this team' });
      return res.json({ success: true, job });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  });

  return router;
}