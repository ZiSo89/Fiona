import test from 'node:test';
import assert from 'node:assert/strict';
import { changeMarker, RECENT_CHANGE_MS, trackTicketChanges } from '../src/features/tickets/ticketChanges.js';
import { filterLabel, statusLabel } from '../src/features/tickets/statusLabels.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

const ticket = (id, status) => ({ storeId: 'komotini', id, status });

test('marks tickets that appeared or changed status after the first sync on the device', () => {
  const storage = memoryStorage();
  const start = Date.parse('2026-10-18T10:00:00.000Z');

  const baseline = trackTicketChanges('komotini', [ticket('A', 'OPEN'), ticket('B', 'OPEN')], start, storage);
  assert.equal(changeMarker(baseline, ticket('A', 'OPEN'), start), null);

  const later = start + 60 * 1000;
  const items = trackTicketChanges('komotini', [ticket('A', 'CALL LATER'), ticket('C', 'OPEN')], later, storage);
  assert.equal(changeMarker(items, ticket('A'), later), 'changed');
  assert.equal(changeMarker(items, ticket('C'), later), 'new');
  assert.equal(items['komotini:B'], undefined);

  assert.equal(changeMarker(items, ticket('C'), later + RECENT_CHANGE_MS), null);
});

test('translates Fiona statuses and filters to Greek and keeps unknown values', () => {
  assert.equal(statusLabel('CALL LATER'), 'Κλήση αργότερα');
  assert.equal(statusLabel(' appointment '), 'Ραντεβού');
  assert.equal(filterLabel('OPEN'), 'Ανοιχτά');
  assert.equal(filterLabel('ALL'), 'Όλα');
  assert.equal(statusLabel('ON HOLD'), 'ON HOLD');
});
