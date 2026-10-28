import {
  getAllLatestSnapshots,
  getLatestSnapshot,
  refreshAllTickets,
  refreshTickets,
} from '../services/pollingService.js';

const FIRST_LOAD_WAIT_MS = 10 * 1000;
const hasNoResult = (snapshot) => snapshot.status === 'idle' || snapshot.status === 'polling';

// Only the very first poll is awaited, and never longer than the timeout; later polls run in the background.
async function waitForFirstResult(refresh, waitMs = FIRST_LOAD_WAIT_MS) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, waitMs); });
  try {
    await Promise.race([refresh().catch(() => {}), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function listTickets(req, res) {
  try {
    const storeId = String(req.query.store || 'alexandroupoli');
    let snapshots;
    if (storeId === 'all') {
      snapshots = getAllLatestSnapshots();
      if (snapshots.some(hasNoResult)) {
        await waitForFirstResult(refreshAllTickets);
        snapshots = getAllLatestSnapshots();
      }
    } else {
      let snapshot = getLatestSnapshot(storeId);
      if (hasNoResult(snapshot)) {
        await waitForFirstResult(() => refreshTickets(storeId));
        snapshot = getLatestSnapshot(storeId);
      }
      snapshots = [snapshot];
    }

    const tickets = snapshots.flatMap((snapshot) => snapshot.tickets);
    const allLive = snapshots.every((snapshot) => snapshot.status === 'live');
    const hasTickets = snapshots.some((snapshot) => snapshot.tickets.length > 0);
    const status = allLive ? 'live' : hasTickets ? 'stale' : 'error';
    const lastUpdatedAt = snapshots
      .map((snapshot) => snapshot.lastUpdatedAt)
      .filter(Boolean)
      .sort()
      .at(-1) || null;
    const data = storeId === 'all'
      ? {
        storeId: 'all',
        storeName: 'Όλα τα καταστήματα',
        status,
        lastUpdatedAt,
        totalTickets: tickets.length,
        possiblyTruncated: snapshots.some((snapshot) => snapshot.possiblyTruncated),
        tickets,
        stores: snapshots,
        error: snapshots.filter((snapshot) => snapshot.error).map(({ storeId: id, storeName, error }) => ({ storeId: id, storeName, error })),
      }
      : snapshots[0];

    res.json({
      success: status === 'live',
      status,
      data,
      lastUpdatedAt,
      error: status === 'error' ? snapshots.map((snapshot) => snapshot.error).filter(Boolean).join('; ') : null,
    });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

export function listOpenTickets(req, res) {
  try {
    const storeId = String(req.query.store || 'alexandroupoli');
    const snapshots = storeId === 'all' ? getAllLatestSnapshots() : [getLatestSnapshot(storeId)];
    const tickets = snapshots.flatMap((snapshot) => snapshot.tickets);
    res.json({
      success: true,
      total: tickets.length,
      tickets,
    });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}
