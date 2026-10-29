import test from 'node:test';
import assert from 'node:assert/strict';
import { createClosedTicketRepository } from '../src/repositories/closedTicketRepository.js';
import { createTicketObservationRepository } from '../src/repositories/ticketObservationRepository.js';
import { athensMonthOf, buildMonthlyStats, getClosedTicketDetails } from '../src/services/closedTicketStats.js';

const row = (orderId, team, closedAt, dueAt, outcome) => ({
  order_id: orderId, service_order_id: `PS-${orderId}`, customer_id: null, account_afm: null,
  customer_name: null, team_name: team, city: null, street: null, house_number: null, phone: null,
  service_description: 'FTTH Activation', scheduled_at: null, created_at: null, closed_at: closedAt,
  call_deadline: null, order_sla_flag: null, work_order_sla_date: dueAt, work_order_sla_outcome: outcome,
  work_order_status: null, comment_text: null, comment_at: null, comment_author: null,
  imported_at: '2026-10-14T00:00:00.000Z',
});

test('monthly stats group by Athens month, team and SLA outcome', async () => {
  const closed = await createClosedTicketRepository(':memory:');
  const observations = await createTicketObservationRepository(':memory:');
  try {
    await closed.insert(row('1', 'Team A', '2026-10-01T08:00:00.000Z', '2026-10-01T10:00:00.000Z', 'on_time'));
    await closed.insert(row('2', 'Team A', '2026-10-02T12:00:00.000Z', '2026-10-02T09:00:00.000Z', 'late'));
    await closed.insert(row('3', 'Team B', '2026-10-03T08:00:00.000Z', null, 'unknown'));
    // 21:30 UTC on 30.09 is already 1 October in Athens.
    await closed.insert(row('4', 'Team B', '2026-09-30T21:30:00.000Z', '2026-10-01T10:00:00.000Z', 'on_time'));
    await closed.insert(row('5', 'Team B', '2026-09-15T08:00:00.000Z', '2026-09-15T10:00:00.000Z', 'on_time'));
    await observations.record([{
      id: '1', order: { status: 'CALL LATER' }, timeline: { statusTime: '2026-10-01T05:00:00.000Z' },
      sla: { activityDueDate: '2026-10-01T06:00:00.000Z' }, communication: { noOfCalls: 1 },
    }]);

    const stats = await buildMonthlyStats('2026-10', closed, observations);

    assert.deepEqual(stats.totals, { total: 4, onTime: 2, late: 1, unknown: 1, onTimePercent: 67 });
    assert.deepEqual(stats.firstCall, { onTime: 1, late: 0, unknown: 3, onTimePercent: 100 });
    assert.equal(stats.teams.find((team) => team.team === 'Team A').late, 1);
    assert.deepEqual(stats.lateTickets.map((ticket) => [ticket.orderId, ticket.hoursLate]), [['2', 3]]);
    assert.deepEqual(stats.closedTickets.map((ticket) => ticket.orderId), ['3', '2', '1', '4']);
    assert.equal('customer' in stats.closedTickets[0] && 'address' in stats.closedTickets[0], true);
    assert.equal('account_afm' in stats.closedTickets[0] || 'phone' in stats.closedTickets[0], false);
  } finally {
    await closed.close();
    await observations.close();
  }
});

test('ticket details include the customer fields shown in the calendar panel', async () => {
  const closed = await createClosedTicketRepository(':memory:');
  try {
    await closed.insert({
      ...row('9', 'Team A', '2026-10-01T08:00:00.000Z', null, 'unknown'),
      customer_name: 'ΣΟΥΝΤΟΥΛΙΔΗΣ', phone: '6987116045', customer_id: '2551116843', account_afm: '133542447', street: 'ΑΛΚΙΒΙΑΔΟΥ', house_number: '7', city: 'ΑΛΕΞΑΝΔΡΟΥΠΟΛΗ',
      comment_text: 'Η εργασία ολοκληρώθηκε.',
    });

    const details = await getClosedTicketDetails('9', closed);

    assert.equal(details.customer, 'ΣΟΥΝΤΟΥΛΙΔΗΣ');
    assert.equal(details.phone, '6987116045');
    assert.equal(details.landline, '2551116843');
    assert.equal(details.afm, '133542447');
    assert.equal(details.lastComment, 'Η εργασία ολοκληρώθηκε.');
    assert.equal(await getClosedTicketDetails('missing', closed), null);
  } finally {
    await closed.close();
  }
});

test('combined monthly stats keep matching order IDs distinct by store', async () => {
  const closed = await createClosedTicketRepository(':memory:', null);
  const observations = await createTicketObservationRepository(':memory:', null);
  try {
    await closed.insert({ ...row('same-id', 'Team A', '2026-10-14T08:00:00.000Z', null, 'unknown'), store_id: 'alexandroupoli' });
    await closed.insert({ ...row('same-id', 'Team A', '2026-10-14T09:00:00.000Z', null, 'unknown'), store_id: 'komotini' });

    const stats = await buildMonthlyStats('2026-10', closed, observations);

    assert.equal(stats.totals.total, 2);
    assert.deepEqual(stats.closedTickets.map((ticket) => ticket.storeId).sort(), ['alexandroupoli', 'komotini']);
    assert.equal(stats.teams.length, 2);
  } finally {
    await closed.close();
    await observations.close();
  }
});

test('monthly analytics include activity, workload distributions, durations and previous-month comparison', async () => {
  const closed = await createClosedTicketRepository(':memory:', null);
  const observations = await createTicketObservationRepository(':memory:', null);
  try {
    await closed.insert({
      ...row('oct-1', 'Team A', '2026-10-02T09:00:00.000Z', '2026-10-02T10:00:00.000Z', 'on_time'),
      store_id: 'alexandroupoli',
      created_at: '2026-10-02T07:00:00.000Z',
      city: 'Αλεξανδρούπολη',
      service_description: 'Fiber',
    });
    await closed.insert({
      ...row('oct-2', 'Team A', '2026-10-02T10:00:00.000Z', '2026-10-02T11:00:00.000Z', 'on_time'),
      store_id: 'komotini',
      created_at: '2026-10-02T07:00:00.000Z',
      city: 'Κομοτηνή',
      service_description: 'TV',
    });
    await closed.insert({
      ...row('sep-1', 'Team B', '2026-09-14T08:00:00.000Z', '2026-09-14T10:00:00.000Z', 'on_time'),
      created_at: '2026-09-14T07:00:00.000Z',
      city: 'Αλεξανδρούπολη',
      service_description: 'Fiber',
    });

    const stats = await buildMonthlyStats('2026-10', closed, observations);

    assert.equal(stats.activity.daily.length, 31);
    assert.deepEqual(stats.activity.daily[1], { date: '2026-10-02', day: 2, total: 2 });
    assert.equal(stats.activity.daily[0].total, 0);
    assert.equal(stats.activity.weekdays.find((item) => item.weekday === 'Fri').total, 2);
    assert.equal(stats.activity.hours.find((item) => item.hour === 12).total, 1);
    assert.equal(stats.activity.hours.find((item) => item.hour === 13).total, 1);
    assert.deepEqual(stats.services.map(({ service, total, sharePercent }) => ({ service, total, sharePercent })), [
      { service: 'Fiber', total: 1, sharePercent: 50 },
      { service: 'TV', total: 1, sharePercent: 50 },
    ]);
    assert.equal(stats.stores.length, 2);
    assert.equal('cities' in stats, false);
    assert.deepEqual(stats.duration, { total: 2, missing: 0, meanHours: 2.5, medianHours: 2.5 });
    assert.deepEqual(stats.comparison, {
      previousMonth: '2026-09',
      previous: { total: 1, onTimePercent: 100, late: 0, firstCallPercent: null, meanDurationHours: 1, medianDurationHours: 1, durationTotal: 1 },
      current: { total: 2, onTimePercent: 100, late: 0, firstCallPercent: null, meanDurationHours: 2.5, medianDurationHours: 2.5, durationTotal: 2 },
    });
  } finally {
    await closed.close();
    await observations.close();
  }
});

test('monthly stats reject a malformed month and Athens month handles the boundary', async () => {
  await assert.rejects(() => buildMonthlyStats('2026-13', {}, {}), /YYYY-MM/);
  assert.equal(athensMonthOf('2026-09-30T21:30:00.000Z'), '2026-10');
});
