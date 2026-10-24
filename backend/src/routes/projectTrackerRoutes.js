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

function canAccessTeam(editor, storeId, teamName) {
  return editor.role === 'admin' || (editor.storeId === storeId && editor.teamName === teamName);
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
      const paymentLock = scope.storeId && scope.teamName
        ? repository.getMonthLock(scope.storeId, scope.teamName, month)
        : { locked: false, changedAt: null };
      return res.json({ success: true, ...buildProjectTrackerMonth(month, jobs), paymentLock });
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
    if (!canAccessTeam(req.trackerEditor, storeId, teamName)) {
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
    const { storeId, teamName, categoryId } = req.body ?? {};
    const orderId = String(req.params.orderId ?? '');
    if (!/^[\w-]{1,40}$/.test(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }
    if (typeof storeId !== 'string' || typeof teamName !== 'string'
      || (categoryId !== null && !getProjectTrackerCategory(categoryId))) {
      return res.status(400).json({ success: false, message: 'Invalid tracker correction' });
    }
    if (!canAccessTeam(req.trackerEditor, storeId, teamName)) {
      return res.status(403).json({ success: false, message: 'Editor is not authorized for this team' });
    }

    try {
      const job = repository.correctJob({
        storeId,
        orderId,
        teamName,
        categoryId,
        allowLocked: req.trackerEditor.role === 'admin',
        changedAt: new Date().toISOString(),
      });
      if (!job) return res.status(404).json({ success: false, message: 'Tracker job not found for this team' });
      return res.json({ success: true, job });
    } catch (error) {
      const status = error.code === 'PROJECT_TRACKER_MONTH_LOCKED' ? 409 : 400;
      return res.status(status).json({ success: false, message: error.message });
    }
  });

  router.put('/month-lock', auth.requireAuth, (req, res) => {
    if (req.trackerEditor.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const { storeId, teamName, month, locked } = req.body ?? {};
    if (typeof storeId !== 'string' || !storeId.trim()
      || typeof teamName !== 'string' || !teamName.trim()
      || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))
      || typeof locked !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Invalid month lock request' });
    }
    try {
      const paymentLock = repository.setMonthLock({
        storeId: storeId.trim(),
        teamName: teamName.trim(),
        month,
        locked,
        changedAt: new Date().toISOString(),
      });
      return res.json({ success: true, paymentLock });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  });

  return router;
}