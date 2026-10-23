import { config } from '../config.js';
import { getLatestSnapshot, getStores } from '../services/pollingService.js';

export function health(req, res) {
  try {
    const snapshot = getLatestSnapshot();
    res.json({
      ok: true,
      service: 'Fiona polling agent',
      port: config.port,
      status: snapshot.status,
      lastUpdatedAt: snapshot.lastUpdatedAt,
      totalTickets: snapshot.totalTickets,
      error: snapshot.error,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

export function listStores(req, res) {
  res.json({ success: true, stores: getStores() });
}
