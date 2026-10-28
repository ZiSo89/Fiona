import { config } from '../config.js';
import { getAllLatestSnapshots, getStores } from '../services/pollingService.js';

export function health(req, res) {
  try {
    const stores = getAllLatestSnapshots().map((snapshot) => ({
      storeId: snapshot.storeId,
      status: snapshot.status,
      lastUpdatedAt: snapshot.lastUpdatedAt,
      totalTickets: snapshot.totalTickets,
      possiblyTruncated: snapshot.possiblyTruncated,
      error: snapshot.error,
    }));
    const trackerSync = req.app.locals.trackerSync?.getStatus() ?? null;
    const ok = stores.every((store) => store.status !== 'error');
    res.status(ok ? 200 : 503).json({
      ok,
      service: 'Fiona polling agent',
      port: config.port,
      stores,
      trackerSync: trackerSync && {
        running: trackerSync.running,
        lastStartedAt: trackerSync.lastStartedAt,
        lastCompletedAt: trackerSync.lastCompletedAt,
        lastFailedAt: trackerSync.lastFailedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

export function listStores(req, res) {
  res.json({ success: true, stores: getStores() });
}
