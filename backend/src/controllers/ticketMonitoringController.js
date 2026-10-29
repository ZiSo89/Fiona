import { getStatsRepositories } from '../repositories/storeRepositories.js';
import { getConfiguredStores } from '../services/pollingService.js';

export async function getCallLaterMonitoring(req, res) {
  try {
    const storeId = String(req.query.store || 'all');
    if (storeId !== 'all' && !getConfiguredStores().some((store) => store.storeId === storeId)) {
      return res.status(404).json({ success: false, message: `Unknown Fiona store: ${storeId}` });
    }
    const limit = Number(req.query.limit ?? 100);
    const offset = Number(req.query.offset ?? 0);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500
      || !Number.isSafeInteger(offset) || offset < 0) {
      return res.status(400).json({ success: false, message: 'Το limit πρέπει να είναι ακέραιος 1-500 και το offset μη αρνητικός ακέραιος.' });
    }
    const scope = storeId === 'all' ? null : storeId;
    const { observations } = await getStatsRepositories(scope);
    res.set('Cache-Control', 'no-store');
    return res.json({
      success: true,
      storeId,
      ...await observations.callLaterMonitoringReport({ storeId: scope, limit, offset }),
    });
  } catch (error) {
    console.error('Call later monitoring failed:', error.code || error.name);
    return res.status(500).json({ success: false, message: 'Δεν ήταν δυνατή η πρόσβαση στα δεδομένα. Δοκίμασε ξανά.' });
  }
}
