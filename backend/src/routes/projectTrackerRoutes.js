import express from 'express';
import { athensMonthOf } from '../services/closedTicketStats.js';
import { getProjectTrackerCategory } from '../services/projectTrackerCatalog.js';
import { buildProjectTrackerMonth } from '../services/projectTrackerStats.js';

function scopeFromQuery(req, res) {
  const storeId = String(req.query.storeId ?? '').trim() || null;
  const teamName = String(req.query.teamName ?? '').trim() || null;
  if (teamName && !storeId) {
    res.status(400).json({ success: false, message: 'Λείπει το κατάστημα του συνεργείου.' });
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

  router.get('/profiles', async (req, res, next) => {
    try {
      const syncStatus = req.app.locals.trackerSync?.getStatus?.() ?? null;
      return res.json({
        success: true,
        profiles: await repository.getProfiles(storeNames),
        lastSyncAt: syncStatus?.lastCompletedAt ?? null,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/login', auth.login);
  router.post('/logout', auth.logout);
  router.get('/session', auth.session);

  router.get('/month', async (req, res, next) => {
    try {
      const scope = scopeFromQuery(req, res);
      if (!scope) return undefined;
      const month = String(req.query.month ?? athensMonthOf(new Date()));
      const jobs = await repository.getMonthJobs(month, scope.storeId, scope.teamName);
      const paymentLock = scope.storeId && scope.teamName
        ? await repository.getMonthLock(scope.storeId, scope.teamName, month)
        : { locked: false, changedAt: null };
      return res.json({ success: true, ...buildProjectTrackerMonth(month, jobs), paymentLock });
    } catch (error) {
      if (error.isDatabaseError) return next(error);
      return res.status(400).json({ success: false, message: error.message });
    }
  });

  router.get('/day', async (req, res, next) => {
    try {
      const scope = scopeFromQuery(req, res);
      if (!scope) return undefined;
      const date = String(req.query.date ?? '');
      return res.json({
        success: true,
        date,
        jobs: await repository.getDayJobs(date, scope.storeId, scope.teamName),
      });
    } catch (error) {
      if (error.isDatabaseError) return next(error);
      return res.status(400).json({ success: false, message: error.message });
    }
  });

  router.get('/jobs/:orderId/details', auth.requireAuth, async (req, res, next) => {
    const orderId = String(req.params.orderId ?? '');
    const storeId = String(req.query.storeId ?? '').trim();
    const teamName = String(req.query.teamName ?? '').trim();
    if (!/^[\w-]{1,40}$/.test(orderId)) {
      return res.status(400).json({ success: false, message: 'Μη έγκυρος κωδικός εργασίας.' });
    }
    if (!canAccessTeam(req.trackerEditor, storeId, teamName)) {
      return res.status(403).json({ success: false, message: 'Δεν έχεις δικαίωμα για αυτό το συνεργείο.' });
    }
    try {
      const job = await repository.getJob(storeId, orderId);
      if (!job || job.teamName !== teamName) {
        return res.status(404).json({ success: false, message: 'Η εργασία δεν βρέθηκε για αυτό το συνεργείο.' });
      }
      const details = await getEditorDetails({ storeId, teamName, orderId });
      if (!details) return res.status(404).json({ success: false, message: 'Δεν βρέθηκαν στοιχεία.' });
      return res.json({ success: true, details });
    } catch (error) {
      if (error.isDatabaseError) return next(error);
      return res.status(502).json({ success: false, message: 'Δεν ήταν δυνατή η φόρτωση στοιχείων από τη Fiona.' });
    }
  });

  router.put('/jobs/:orderId', auth.requireAuth, async (req, res, next) => {
    const { storeId, teamName, categoryId, pointsOverride } = req.body ?? {};
    const orderId = String(req.params.orderId ?? '');
    if (!/^[\w-]{1,40}$/.test(orderId)) {
      return res.status(400).json({ success: false, message: 'Μη έγκυρος κωδικός εργασίας.' });
    }
    if (typeof storeId !== 'string' || typeof teamName !== 'string'
      || (categoryId !== null && !getProjectTrackerCategory(categoryId))
      || (pointsOverride !== undefined && pointsOverride !== null
        && (!Number.isInteger(pointsOverride) || pointsOverride < 0 || pointsOverride > 1000))) {
      return res.status(400).json({ success: false, message: 'Μη έγκυρη διόρθωση.' });
    }
    if (!canAccessTeam(req.trackerEditor, storeId, teamName)) {
      return res.status(403).json({ success: false, message: 'Δεν έχεις δικαίωμα για αυτό το συνεργείο.' });
    }

    try {
      const job = await repository.correctJob({
        storeId,
        orderId,
        teamName,
        categoryId,
        pointsOverride,
        allowLocked: req.trackerEditor.role === 'admin',
        changedAt: new Date().toISOString(),
      });
      if (!job) return res.status(404).json({ success: false, message: 'Η εργασία δεν βρέθηκε για αυτό το συνεργείο.' });
      return res.json({ success: true, job });
    } catch (error) {
      if (error.isDatabaseError) return next(error);
      const status = error.code === 'PROJECT_TRACKER_MONTH_LOCKED' ? 409 : 400;
      return res.status(status).json({ success: false, message: error.message });
    }
  });

  router.get('/admin/overview', auth.requireAuth, async (req, res, next) => {
    if (req.trackerEditor.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Απαιτείται σύνδεση διαχειριστή.' });
    }
    const month = String(req.query.month ?? athensMonthOf(new Date()));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ success: false, message: 'Μη έγκυρος μήνας.' });
    }
    try {
      const teams = new Map();
      for (const job of await repository.getMonthJobs(month)) {
        const key = `${job.storeId}|${job.teamName}`;
        const team = teams.get(key) ?? {
          storeId: job.storeId,
          storeName: storeNames[job.storeId] || job.storeId,
          teamName: job.teamName,
          jobCount: 0,
          points: 0,
          pendingCount: 0,
        };
        team.jobCount += 1;
        team.points += job.points;
        if (!job.mapped) team.pendingCount += 1;
        teams.set(key, team);
      }
      const rows = await Promise.all([...teams.values()].map(async (team) => ({
        ...team,
        paymentLock: await repository.getMonthLock(team.storeId, team.teamName, month),
      })));
      rows.sort((a, b) => a.storeName.localeCompare(b.storeName, 'el') || a.teamName.localeCompare(b.teamName, 'el'));
      return res.json({ success: true, month, teams: rows });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/month-lock', auth.requireAuth, async (req, res, next) => {
    if (req.trackerEditor.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Απαιτείται σύνδεση διαχειριστή.' });
    }
    const { storeId, teamName, month, locked } = req.body ?? {};
    if (typeof storeId !== 'string' || !storeId.trim()
      || typeof teamName !== 'string' || !teamName.trim()
      || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))
      || typeof locked !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Μη έγκυρο αίτημα κλειδώματος μήνα.' });
    }
    try {
      const paymentLock = await repository.setMonthLock({
        storeId: storeId.trim(),
        teamName: teamName.trim(),
        month,
        locked,
        changedAt: new Date().toISOString(),
      });
      return res.json({ success: true, paymentLock });
    } catch (error) {
      if (error.isDatabaseError) return next(error);
      return res.status(400).json({ success: false, message: error.message });
    }
  });

  return router;
}