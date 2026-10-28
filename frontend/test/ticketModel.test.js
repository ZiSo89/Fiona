import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTickets, getSlaState, normalizeTicketForUi } from '../src/features/tickets/ticketModel.js';
import { formatDataAge } from '../src/features/tickets/ticketFormatters.js';

const now = Date.parse('2026-10-18T10:00:00.000Z');
const hours = (value) => new Date(now + value * 60 * 60 * 1000).toISOString();

test('derives the SLA state from the deadline at the given moment', () => {
  assert.equal(getSlaState({ slaDeadline: hours(48) }, now).kind, 'ok');
  assert.equal(getSlaState({ slaDeadline: hours(24) }, now).kind, 'warning');
  assert.equal(getSlaState({ slaDeadline: hours(1) }, now).kind, 'warning');
  assert.equal(getSlaState({ slaDeadline: hours(0) }, now).kind, 'overdue');
  assert.equal(getSlaState({ slaDeadline: hours(-1) }, now).remainingMs, -60 * 60 * 1000);
  assert.equal(getSlaState({}, now).kind, 'none');
  assert.equal(getSlaState({ slaDeadline: 'not a date' }, now).kind, 'none');
  assert.equal(getSlaState({ slaDateInvalid: true, slaDeadline: hours(1) }, now).kind, 'invalid');
  assert.equal(getSlaState({ slaStatus: 'inherited', slaDeadline: hours(1) }, now).kind, 'inherited');
});

test('sorts appointments by time first, then other tickets by SLA and creation time', () => {
  const tickets = [
    { id: 'no-sla', status: 'OPEN', createdAt: hours(-5) },
    { id: 'late-sla', status: 'OPEN', slaDeadline: hours(10) },
    { id: 'appointment-late', status: 'APPOINTMENT', scheduledFrom: hours(3) },
    { id: 'invalid-sla', status: 'OPEN', slaDeadline: hours(1), slaDateInvalid: true, createdAt: hours(-9) },
    { id: 'early-sla', status: 'CALL LATER', slaDeadline: hours(2) },
    { id: 'appointment-early', status: 'APPOINTMENT', scheduledFrom: hours(1) },
  ];

  assert.deepEqual(tickets.sort(compareTickets).map((ticket) => ticket.id), [
    'appointment-early',
    'appointment-late',
    'early-sla',
    'late-sla',
    'invalid-sla',
    'no-sla',
  ]);
});

test('normalizes backend tickets with store identity and sensible defaults', () => {
  const ticket = normalizeTicketForUi({
    id: 'SO-1',
    storeId: 'komotini',
    storeName: 'Κομοτηνή',
    order: { status: 'CALL LATER', planServiceDescription: 'FTTH Activation', equipmentDescription: 'HUAWEI_HG8145, nokia ont' },
    customer: { name: 'Πελάτης', phonePrimary: '2100000000', fullAddress: 'Οδός 1' },
    sla: { deadline: hours(5) },
  });

  assert.equal(ticket.storeId, 'komotini');
  assert.equal(ticket.status, 'CALL LATER');
  assert.equal(ticket.title, 'FTTH Activation');
  assert.equal(ticket.contactPhone, '2100000000');
  assert.equal(ticket.equipmentName, 'Huawei, Nokia');
  assert.equal(ticket.showCallDeadline, true);
  assert.equal(ticket.slaDeadline, hours(5));

  const empty = normalizeTicketForUi({});
  assert.equal(empty.status, 'OPEN');
  assert.equal(empty.storeId, 'alexandroupoli');
  assert.equal(empty.address, '');
  assert.equal(empty.customerName, 'Πελάτης');
});

test('labels the age of data only once it is at least two minutes old', () => {
  assert.equal(formatDataAge(null, now), null);
  assert.equal(formatDataAge(new Date(now - 90 * 1000).toISOString(), now), null);
  assert.equal(formatDataAge(new Date(now - 5 * 60 * 1000).toISOString(), now), 'πριν 5 λεπ.');
  assert.equal(formatDataAge(new Date(now - 3 * 60 * 60 * 1000).toISOString(), now), 'πριν 3 ώρ.');
});

test('urgent tickets are listed before appointments and the countdown drops seconds above one hour', async () => {
  const { compareTicketsByUrgency, getTicketUrgency } = await import('../src/features/tickets/ticketModel.js');
  const { formatTimer } = await import('../src/features/tickets/ticketFormatters.js');
  const overdue = { id: 'overdue', status: 'OPEN', slaDeadline: hours(-1) };
  const callSoon = { id: 'call-soon', status: 'OPEN', showCallDeadline: true, activityDueDate: hours(0.5), slaDeadline: hours(30) };
  const appointment = { id: 'appointment', status: 'APPOINTMENT', scheduledFrom: hours(1), slaDeadline: hours(30) };
  const calm = { id: 'calm', status: 'OPEN', slaDeadline: hours(30) };

  assert.deepEqual(getTicketUrgency(callSoon, now), { slaOverdue: false, callOverdue: false, callSoon: true, urgent: true });
  assert.deepEqual([calm, appointment, callSoon, overdue].sort(compareTicketsByUrgency(now)).map((ticket) => ticket.id),
    ['overdue', 'call-soon', 'appointment', 'calm']);

  assert.equal(formatTimer(59 * 60 * 1000 + 5000), '59:05');
  assert.equal(formatTimer(2 * 60 * 60 * 1000 + 5 * 60 * 1000), '2 ώρ. 5 λεπ.');
  assert.equal(formatTimer(26 * 60 * 60 * 1000), '1 ημ. 2 ώρ.');
});