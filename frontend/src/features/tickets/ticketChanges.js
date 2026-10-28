export const TICKET_CHANGES_KEY_PREFIX = 'fiona-ticket-changes-v1';
export const RECENT_CHANGE_MS = 30 * 60 * 1000;

const storageKey = (storeId) => `${TICKET_CHANGES_KEY_PREFIX}:${storeId}`;
const ticketKey = (ticket) => `${ticket.storeId}:${ticket.id}`;

function readState(storage, storeId) {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(storeId)) || 'null');
    return parsed && typeof parsed.items === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Remembers when each ticket first appeared or last changed status, so the list can mark it as new or changed.
// The first sync on a device only records the baseline; nothing is marked until a later sync differs.
export function trackTicketChanges(storeId, tickets, now = Date.now(), storage = window.localStorage) {
  const previous = readState(storage, storeId);
  const items = {};
  for (const ticket of tickets) {
    const key = ticketKey(ticket);
    const before = previous?.items[key];
    if (!before) items[key] = { status: ticket.status, firstSeenAt: previous ? now : 0, changedAt: 0 };
    else if (before.status !== ticket.status) items[key] = { ...before, status: ticket.status, changedAt: now };
    else items[key] = before;
  }
  try {
    storage.setItem(storageKey(storeId), JSON.stringify({ savedAt: now, items }));
  } catch {
    // Storage may be full or disabled; markers are a convenience only.
  }
  return items;
}

export function readTicketChanges(storeId, storage = window.localStorage) {
  return readState(storage, storeId)?.items || {};
}

export function changeMarker(items, ticket, now = Date.now()) {
  const item = items[ticketKey(ticket)];
  if (!item) return null;
  if (item.firstSeenAt && now - item.firstSeenAt < RECENT_CHANGE_MS) return 'new';
  if (item.changedAt && now - item.changedAt < RECENT_CHANGE_MS) return 'changed';
  return null;
}
