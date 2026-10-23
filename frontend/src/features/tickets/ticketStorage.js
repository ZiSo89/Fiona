import { normalizeTicketForUi } from './ticketModel.js';

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

export function readSelectedStore() {
  return window.localStorage.getItem(ACTIVE_STORE_KEY) || 'alexandroupoli';
}

export const storeCacheKey = (storeId) => `${CACHE_KEY_PREFIX}:${storeId}`;

export function readCachedTickets(storeId) {
  try {
    const legacyAlexandroupoliCache = storeId === 'alexandroupoli'
      ? window.localStorage.getItem('fiona-fieldops-tickets-v1')
      : null;
    const cached = JSON.parse(window.localStorage.getItem(storeCacheKey(storeId)) || legacyAlexandroupoliCache || 'null');
    return Array.isArray(cached) ? cached.map(normalizeTicketForUi) : null;
  } catch {
    return null;
  }
}
