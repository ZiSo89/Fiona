import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CACHE_KEY_PREFIX,
  clearCachedTickets,
  pruneCachedTickets,
  readCachedTickets,
  storeCacheKey,
  TICKET_CACHE_TTL_MS,
  writeCachedTickets,
} from '../src/features/tickets/ticketStorage.js';

class MemoryStorage {
  values = new Map();

  get length() {
    return this.values.size;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const originalWindow = globalThis.window;
const storage = new MemoryStorage();
globalThis.window = { localStorage: storage };

test.after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

test('cached tickets expire 24 hours after the last successful write', () => {
  const now = 1_800_000_000_000;
  writeCachedTickets('alexandroupoli', [], now);

  assert.deepEqual(readCachedTickets('alexandroupoli', now + TICKET_CACHE_TTL_MS - 1), []);
  assert.equal(readCachedTickets('alexandroupoli', now + TICKET_CACHE_TTL_MS), null);
  assert.equal(storage.getItem(storeCacheKey('alexandroupoli')), null);
});

test('legacy and invalid timestamp caches are discarded', () => {
  storage.setItem('fiona-fieldops-tickets-v1', JSON.stringify([]));
  storage.setItem(storeCacheKey('alexandroupoli'), JSON.stringify({ savedAt: Date.now(), tickets: [] }));
  assert.deepEqual(readCachedTickets('alexandroupoli'), []);
  assert.equal(storage.getItem('fiona-fieldops-tickets-v1'), null);

  storage.setItem(storeCacheKey('komotini'), JSON.stringify({ savedAt: 'invalid', tickets: [] }));
  assert.equal(readCachedTickets('komotini'), null);
  assert.equal(storage.getItem(storeCacheKey('komotini')), null);

  storage.setItem(storeCacheKey('orestiada'), '{invalid json');
  assert.equal(readCachedTickets('orestiada'), null);
  assert.equal(storage.getItem(storeCacheKey('orestiada')), null);
});

test('logout cleanup removes all ticket caches but preserves unrelated preferences', () => {
  storage.setItem(storeCacheKey('alexandroupoli'), JSON.stringify({ savedAt: Date.now(), tickets: [] }));
  storage.setItem(storeCacheKey('orestiada'), JSON.stringify({ savedAt: Date.now(), tickets: [] }));
  storage.setItem('fiona-active-store', 'alexandroupoli');

  clearCachedTickets();

  assert.equal(storage.getItem(storeCacheKey('alexandroupoli')), null);
  assert.equal(storage.getItem(storeCacheKey('orestiada')), null);
  assert.equal(storage.getItem('fiona-active-store'), 'alexandroupoli');
  assert.equal([...storage.values.keys()].some((key) => key.startsWith(`${CACHE_KEY_PREFIX}:`)), false);
});

test('expired caches for other stores are pruned when the app starts', () => {
  const now = 1_800_000_000_000;
  storage.setItem(storeCacheKey('komotini'), JSON.stringify({
    savedAt: now - TICKET_CACHE_TTL_MS,
    tickets: [],
  }));
  storage.setItem(storeCacheKey('orestiada'), JSON.stringify({ savedAt: now, tickets: [] }));

  pruneCachedTickets(now);

  assert.equal(storage.getItem(storeCacheKey('komotini')), null);
  assert.notEqual(storage.getItem(storeCacheKey('orestiada')), null);
});
