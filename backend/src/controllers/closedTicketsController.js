import { getStatsRepositories } from '../repositories/storeRepositories.js';
import { getConfiguredStores } from '../services/pollingService.js';
import { athensMonthOf, buildMonthlyStats, getClosedTicketDetails } from '../services/closedTicketStats.js';

export async function getStats(req, res) {
  try {
    const storeId = String(req.query.store || 'alexandroupoli');
    if (storeId !== 'all' && !getConfiguredStores().some((store) => store.storeId === storeId)) {
      return res.status(404).json({ success: false, message: `Unknown Fiona store: ${storeId}` });
    }
    const scope = storeId === 'all' ? null : storeId;
    const { closed, observations } = await getStatsRepositories(scope);
    const month = String(req.query.month || athensMonthOf(new Date()));
    return res.json({ success: true, storeId, ...await buildMonthlyStats(month, closed, observations) });
  } catch (error) {
    if (error.isDatabaseError) {
      console.error('Closed ticket statistics failed:', error.code || error.name);
      return res.status(500).json({ success: false, message: 'Unable to access application data' });
    }
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

export async function getDetails(req, res) {
  try {
    if (!/^[\w-]{1,40}$/.test(req.params.orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }
    const storeId = String(req.query.store || 'alexandroupoli');
    if (!getConfiguredStores().some((store) => store.storeId === storeId)) {
      return res.status(400).json({ success: false, message: 'A configured store is required' });
    }
    const ticket = await getClosedTicketDetails(req.params.orderId, (await getStatsRepositories(storeId)).closed, storeId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, ticket });
  } catch (error) {
    if (error.isDatabaseError) {
      console.error('Closed ticket details failed:', error.code || error.name);
      return res.status(500).json({ success: false, message: 'Unable to access application data' });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
}
