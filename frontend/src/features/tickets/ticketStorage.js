import { normalizeTicketForUi } from './ticketModel.js';
import { TICKET_CHANGES_KEY_PREFIX } from './ticketChanges.js';

export const FILTERS = ['ALL', 'OPEN', 'TO CALL', 'CALL LATER', 'APPOINTMENT', 'COMPLETE'];
export const ACTIVE_FILTER_KEY = 'fiona-active-filter';
export const SCROLL_POSITION_KEY = 'fiona-scroll-position';
export const ACTIVE_STORE_KEY = 'fiona-active-store';

export function readActiveFilter() {
  const savedFilter = window.sessionStorage.getItem(ACTIVE_FILTER_KEY);
  return FILTERS.includes(savedFilter) ? savedFilter : 'ALL';
}

export function saveScrollPosition() {
  window.sessionStorage.setItem(SCROLL_POSITION_KEY, String(window.scrollY));
}
export const CACHE_KEY_PREFIX = 'fiona-fieldops-tickets-v2';
export const TICKET_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LEGACY_CACHE_KEY = 'fiona-fieldops-tickets-v1';

export function readSelectedStore() {
  return window.localStorage.getItem(ACTIVE_STORE_KEY) || 'alexandroupoli';
}

export const storeCacheKey = (storeId) => `${CACHE_KEY_PREFIX}:${storeId}`;

function isValidCache(serialized, now) {
  try {
    const cached = JSON.parse(serialized);
    return Array.isArray(cached?.tickets)
      && Number.isFinite(cached.savedAt)
      && cached.savedAt <= now
      && now - cached.savedAt < TICKET_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function pruneCachedTickets(now = Date.now()) {
  const storage = window.localStorage;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key === LEGACY_CACHE_KEY) {
      storage.removeItem(key);
    } else if (key?.startsWith(`${CACHE_KEY_PREFIX}:`)
      && !isValidCache(storage.getItem(key), now)) {
      storage.removeItem(key);
    }
  }
}

export function writeCachedTickets(storeId, tickets, now = Date.now()) {
  pruneCachedTickets(now);
  window.localStorage.setItem(storeCacheKey(storeId), JSON.stringify({ savedAt: now, tickets }));
}

export function clearCachedTickets() {
  const storage = window.localStorage;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(`${CACHE_KEY_PREFIX}:`) || key?.startsWith(`${TICKET_CHANGES_KEY_PREFIX}:`) || key === LEGACY_CACHE_KEY) {
      storage.removeItem(key);
    }
  }
}

export function readCachedTickets(storeId, now = Date.now()) {
  try {
    const storage = window.localStorage;
    const key = storeCacheKey(storeId);
    const serialized = storage.getItem(key);
    pruneCachedTickets(now);
    if (!serialized) return null;
    if (!isValidCache(serialized, now)) return null;
    const cached = JSON.parse(serialized);
    return cached.tickets.map(normalizeTicketForUi);
  } catch {
    return null;
  }
}
