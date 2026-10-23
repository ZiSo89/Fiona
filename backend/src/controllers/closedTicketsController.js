import { getStatsRepositories } from '../repositories/storeRepositories.js';
import { getConfiguredStores } from '../services/pollingService.js';
import { athensMonthOf, buildMonthlyStats, getClosedTicketDetails } from '../services/closedTicketStats.js';

export function getStats(req, res) {
  try {
    const storeId = String(req.query.store || 'alexandroupoli');
    if (storeId !== 'all' && !getConfiguredStores().some((store) => store.storeId === storeId)) {
      return res.status(404).json({ success: false, message: `Unknown Fiona store: ${storeId}` });
    }
    const scope = storeId === 'all' ? null : storeId;
    const { closed, observations } = getStatsRepositories(scope);
    const month = String(req.query.month || athensMonthOf(new Date()));
    return res.json({ success: true, storeId, ...buildMonthlyStats(month, closed, observations) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

export function getDetails(req, res) {
  try {
    if (!/^[\w-]{1,40}$/.test(req.params.orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }
    const storeId = String(req.query.store || 'alexandroupoli');
    if (!getConfiguredStores().some((store) => store.storeId === storeId)) {
      return res.status(400).json({ success: false, message: 'A configured store is required' });
    }
    const ticket = getClosedTicketDetails(req.params.orderId, getStatsRepositories(storeId).closed, storeId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, ticket });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
