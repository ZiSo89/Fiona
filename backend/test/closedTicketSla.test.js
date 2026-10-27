import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClosedTicketRecord,
  calculateSlaOutcome,
} from '../src/services/closedTicketSla.js';

test('calculates SLA outcomes against their own deadlines', () => {
  assert.equal(calculateSlaOutcome('2026-10-14 10:00:00', '2026-10-14 11:00:00'), 'on_time');
  assert.equal(calculateSlaOutcome('2026-10-14 12:00:00', '2026-10-14 11:00:00'), 'late');
  assert.equal(calculateSlaOutcome('2026-10-14 12:00:00', null), 'unknown');
});

test('builds a minimal completed-ticket record with customer AFM and independent SLA values', () => {
  const record = buildClosedTicketRecord(
    {
      orderId: '123',
      teamName: 'Team A',
      lastName: 'Customer',
      planServiceDescription: 'FTTH Activation',
    },
    {
      orderData: {
        orderStatus: 'COMPLETED',
        accountAFM: '123456789',
        customerId: 'C-1',
        firstName: 'Test',
        deadline: '2026-10-14 10:00:00',
        workOrderFinishedOnPremiseTime: '2026-10-14 10:30:00',
        creationTime: '2026-10-13 10:00:00',
      },
    },
    { workOrderSlaDate: '2026-10-14 11:00:00', slaSurpassed: 'N' },
    { text: 'Completed', insertTime: '2026-10-14 10:30:00', author: 'Technician' },
    new Date('2026-10-14T12:00:00.000Z'),
  );

  assert.equal(record.account_afm, '123456789');
  assert.equal(record.order_sla_flag, null);
  assert.equal(record.call_deadline, '2026-10-14T07:00:00.000Z');
  assert.equal(record.work_order_sla_outcome, 'on_time');
  assert.equal('sla_reconciliation' in record, false);
  assert.equal(record.closed_at, '2026-10-14T07:30:00.000Z');
  assert.equal(record.comment_text, 'Completed');
  assert.equal('raw_json' in record, false);
});

test('prefers the assigned daily workorder team over a generic details group name', () => {
  const record = buildClosedTicketRecord(
    { orderId: 'team-1', teamName: 'Nikolaos Katinas' },
    {
      orderStatus: 'COMPLETED',
      teamName: 'NEW TECHNOLOGIES AT ORESTIADA',
      workOrderFinishedOnPremiseTime: '2026-10-14 10:00:00',
    },
    { workOrderSlaDate: '2026-10-14 11:00:00' },
    null,
  );

  assert.equal(record.team_name, 'Nikolaos Katinas');
});

test('falls back to the team name in order details when the daily workorder has none', () => {
  const record = buildClosedTicketRecord(
    { orderId: 'team-2' },
    {
      orderStatus: 'COMPLETED',
      teamName: 'Nikolaos Katinas',
      workOrderFinishedOnPremiseTime: '2026-10-14 10:00:00',
    },
    {},
    null,
  );

  assert.equal(record.team_name, 'Nikolaos Katinas');
});

test('does not build a record for non-completed or untimestamped orders', () => {
  assert.equal(buildClosedTicketRecord({ orderId: '1', orderStatus: 'POSTPONED' }, {}, {}, null), null);
  assert.equal(buildClosedTicketRecord({ orderId: '2', orderStatus: 'COMPLETED' }, {}, {}, null), null);
});

test('keeps inherited reissue deadlines and weekend deadlines as absolute Fiona targets', () => {
  const reissued = buildClosedTicketRecord(
    { orderId: 'reissue-2', serviceOrderId: 'PS-1-2' },
    {
      orderStatus: 'COMPLETED',
      creationTime: '2026-08-07 14:28:42',
      deadline: '2026-08-06 18:19:01',
      workOrderFinishedOnPremiseTime: '2026-08-08 12:00:00',
    },
    {},
    null,
    new Date('2026-08-08T12:00:00.000Z'),
  );

  assert.equal(reissued.work_order_sla_outcome, 'unknown');
  assert.equal(calculateSlaOutcome('2026-10-18 12:00:00', '10/17/2026 12:00:00'), 'late');
});

test('reads the order SLA flag from Fiona SLA when orderSlaFlag is absent', () => {
  const record = buildClosedTicketRecord(
    { orderId: 'flag-1' },
    {
      orderStatus: 'COMPLETED',
      workOrderFinishedOnPremiseTime: '2026-10-14 10:00:00',
      SLA: 'FALSE',
    },
    {},
    null,
  );
  assert.equal(record.order_sla_flag, 'FALSE');
});

test('prefers workOrderDeadline and falls back to deadline like the exporter', () => {
  const fromWorkOrderDeadline = buildClosedTicketRecord(
    { orderId: 'deadline-1' },
    {
      orderStatus: 'COMPLETED',
      workOrderFinishedOnPremiseTime: '2026-10-14 10:00:00',
      workOrderDeadline: '2026-10-14 09:00:00',
      deadline: '2026-10-14 11:00:00',
    },
    {},
    null,
  );
  const fromDeadline = buildClosedTicketRecord(
    { orderId: 'deadline-2' },
    {
      orderStatus: 'COMPLETED',
      workOrderFinishedOnPremiseTime: '2026-10-14 10:00:00',
      deadline: '2026-10-14 11:00:00',
    },
    {},
    null,
  );

  assert.equal(fromWorkOrderDeadline.call_deadline, '2026-10-14T06:00:00.000Z');
  assert.equal(fromDeadline.call_deadline, '2026-10-14T08:00:00.000Z');
});