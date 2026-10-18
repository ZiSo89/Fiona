import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrders } from '../src/services/orderNormalizer.js';

const sample = {
  status: 'OK',
  totalOrders: '34',
  FilteredOrders: [
    {
      id: '22431781',
      firstName: null,
      lastName: 'ΠΑΠΑΓΙΑΝΝΑΚΗΣ',
      city: 'Δ. ΑΛΕΞΑΝΔΡΟΥΠΟΛΗΣ',
      region: '68131',
      street: 'ΑΓΙΟΥ ΔΗΜΗΤΡΙΟΥ (ΠΡΧ ΜΑΝΑ ΤΟΥ ΝΕΡΟΥ)',
      houseNumber: '32Α',
      tel1: '6972440310',
      tel2: '6972440310,      NONE',
      orderType: 'Installations',
      orderStatus: 'CALL LATER',
      noOfCalls: '1',
      callLaterTime: '2026-10-01 11:50:00',
      lastInteractionTime: '2026-09-30 20:01:40.51777',
      priority: '2',
      SLA: 'FALSE',
      deadline: '2026-09-30 12:00:00',
      serviceGroup: 'NEW TECHNOLOGIES LTD ALEXANDROUPOLIS',
      planServiceDescription: 'FTTH Activation',
      orderOwner: 'novaaxd@alphait.gr',
      Categorization: {
        categoryId01: 'PaSPort',
        categoryId02: 'INSTALLATION',
        categoryId03: 'FTTH Activation'
      }
    }
  ]
};

test('normalizeOrders creates the technician-facing structure', () => {
  const result = normalizeOrders(sample);

  assert.equal(result.totalOrders, 34);
  assert.equal(result.tickets.length, 1);
  assert.equal(result.tickets[0].customer.name, 'ΠΑΠΑΓΙΑΝΝΑΚΗΣ');
  assert.equal(result.tickets[0].customer.phonePrimary, '6972440310');
  assert.equal(result.tickets[0].order.status, 'CALL LATER');
  assert.equal(result.tickets[0].priority.normalized, '2-Medium');
  assert.equal(result.tickets[0].sla.overdue, true);
  assert.equal(result.tickets[0].meta.isOpen, true);
  assert.equal(result.tickets[0].customer.fullAddress.includes('ΑΓΙΟΥ ΔΗΜΗΤΡΙΟΥ'), true);
});

test('uses the work-order SLA separately from the activity deadline', () => {
  const result = normalizeOrders({
    FilteredOrders: [{
      id: '22458821',
      serviceOrderId: 'PS12654600',
      orderStatus: 'CALL LATER',
      creationTime: '2026-10-12 19:20:34',
      workOrderSlaDate: '10/14/2026 19:20:34',
      deadline: '2026-10-13 12:00:00',
      activities: [{ activityType: 'Call Outbound', activitySlaDueDate: '10/13/2026 12:00:00' }],
      Categorization: { categoryId05: 'Call Outbound' },
    }],
  });

  const ticket = result.tickets[0];
  const workOrderSla = new Date(ticket.sla.deadline);
  const activityDeadline = new Date(ticket.sla.activityDueDate);

  assert.equal(workOrderSla.toISOString(), '2026-10-14T16:20:34.000Z');
  assert.equal(activityDeadline.toISOString(), '2026-10-13T09:00:00.000Z');
  assert.equal(result.tickets[0].timeline.creationTime, '2026-10-12T16:20:34.000Z');
  assert.equal(result.tickets[0].timeline.statusTime, null);
});

test('preserves order status time separately from creation time', () => {
  const result = normalizeOrders({
    FilteredOrders: [{
      id: '22433532',
      serviceOrderId: 'PS12415450',
      creationTime: '2026-09-30 15:13:46',
      statusTime: '2026-10-09 20:54:20.563332',
      orderStatus: 'APPOINTMENT',
    }],
  });

  assert.equal(result.tickets[0].timeline.creationTime, '2026-09-30T12:13:46.000Z');
  assert.equal(result.tickets[0].timeline.statusTime, '2026-10-09T17:54:20.563Z');
});

test('flags an SLA date that predates work-order creation', () => {
  const result = normalizeOrders({
    FilteredOrders: [{
      id: '22457630',
      serviceOrderId: 'PS12649548',
      creationTime: '2026-10-12 17:05:04',
      workOrderSlaDate: '10/10/2026 19:30:50',
      slaSurpassed: 'N',
      orderStatus: 'APPOINTMENT',
    }],
  });

  assert.equal(result.tickets[0].sla.dateInvalid, true);
  assert.equal(result.tickets[0].sla.overdue, false);
  assert.equal(result.tickets[0].sla.hoursRemaining, null);
});

test('treats an SLA before creation on a re-issued order as inherited, not invalid', () => {
  const result = normalizeOrders({
    FilteredOrders: [{
      id: '22337572',
      serviceOrderId: 'PS12418579-2',
      creationTime: '2026-08-07 14:28:42',
      workOrderSlaDate: '08/06/2026 18:19:01',
      orderStatus: 'APPOINTMENT',
    }],
  });

  const { sla } = result.tickets[0];
  assert.equal(sla.inherited, true);
  assert.equal(sla.dateInvalid, false);
  assert.equal(sla.overdue, false);
  assert.equal(sla.status, 'inherited');
});

test('shows Same Day and Standard priority as sent and hides a missing one', () => {
  const result = normalizeOrders({
    FilteredOrders: [
      { id: '1', serviceOrderId: 'A', priority: 'Same Day' },
      { id: '2', serviceOrderId: 'B', priority: 'Standard' },
      { id: '3', serviceOrderId: 'C', priority: null },
    ],
  });

  const byId = (id) => result.tickets.find((ticket) => ticket.serviceOrderId === id).priority;

  assert.equal(byId('A').normalized, 'Same Day');
  assert.equal(byId('A').level, 1);
  assert.equal(byId('B').normalized, 'Standard');
  assert.equal(byId('C').normalized, null);
  assert.deepEqual(result.tickets.map((ticket) => ticket.serviceOrderId), ['A', 'B', 'C']);
});

test('reads coordinates in any order and builds a map link', () => {
  const tickets = normalizeOrders({
    FilteredOrders: [
      { id: '1', street: '25.875348:40.851182', city: 'X' },
      { id: '2', street: '40.851524,25.827632' },
      { id: '3', street: '40.890508 25.918035' },
      { id: '4', street: 'ΑΛΚΙΒΙΑΔΟΥ', houseNumber: '7', city: 'Y' },
    ],
  }).tickets;

  assert.deepEqual([tickets[0].location.lat, tickets[0].location.lon], [40.851182, 25.875348]);
  assert.deepEqual([tickets[1].location.lat, tickets[1].location.lon], [40.851524, 25.827632]);
  assert.deepEqual([tickets[2].location.lat, tickets[2].location.lon], [40.890508, 25.918035]);
  assert.equal(tickets[0].customer.fullAddress.startsWith('Συντεταγμένες 40.851182, 25.875348'), true);
  assert.equal(tickets[3].location.lat, null);
  assert.equal(tickets[3].location.mapsUrl.includes('query='), true);
});

test('carries site info, duration, next action and the latest comment', () => {
  const ticket = normalizeOrders({
    FilteredOrders: [{
      id: '22433532',
      orderTypeDuration: '30',
      nextActionDate: '2026-10-14 09:00:00',
      externalData: { escalateLimit: 'FB(+00).1 - 02', floor: '01', buildingId: null, apartment: '1' },
      latestComment: { text: 'να καλέσουμε από Παρασκευή', insertTime: '2026-09-30 20:09:45.616019', author: 'Stavros Venetis' },
    }],
  }).tickets[0];

  assert.equal(ticket.order.durationMinutes, 30);
  assert.equal(ticket.site.escalateLimit, 'FB(+00).1 - 02');
  assert.equal(ticket.site.floor, '01');
  assert.equal(ticket.timeline.nextActionDate, '2026-10-14T06:00:00.000Z');
  assert.equal(ticket.latestComment.text, 'να καλέσουμε από Παρασκευή');
  assert.equal(ticket.latestComment.insertTime, '2026-09-30T17:09:45.616Z');
});

test('preserves CLI number, optional problem description and equipment description', () => {
  const ticket = normalizeOrders({
    FilteredOrders: [{
      id: '22433532',
      externalData: {
        cliNumber: '2100000000',
        problemDescription: 'Loss of connectivity',
      },
      equipmentDescription: 'Nokia G-1426G-A ONT I-Op',
      hasEquipmentSerialNumber: true,
    }],
  }).tickets[0];

  assert.equal(ticket.order.cliNumber, '2100000000');
  assert.equal(ticket.order.problemDescription, 'Loss of connectivity');
  assert.equal(ticket.order.equipmentDescription, 'Nokia G-1426G-A ONT I-Op');
  assert.equal(ticket.order.hasEquipmentSerialNumber, true);

  const withoutProblemDescription = normalizeOrders({ FilteredOrders: [{ id: '22433533' }] }).tickets[0];
  assert.equal(withoutProblemDescription.order.problemDescription, null);
});

test('normalizeOrders flattens Fiona daily team workorders', () => {
  const result = normalizeOrders({
    UserTeams: [
      {
        teamName: 'Field Team North',
        TeamWorkOrders: [
          {
            orderId: 'WO-42',
            lastName: 'ΠΑΠΑΔΟΠΟΥΛΟΣ',
            city: 'Αθήνα',
            street: 'Πατησίων',
            houseNumber: '10',
            telNumber1: '6900000000',
            orderStatus: 'APPOINTMENT',
            workOrderScheduledTimeFrom: '2026-10-12 11:00:00',
            planServiceDescription: 'Επισκευή',
          },
        ],
      },
    ],
  });

  assert.equal(result.tickets.length, 1);
  assert.equal(result.tickets[0].id, 'WO-42');
  assert.equal(result.tickets[0].customer.name, 'ΠΑΠΑΔΟΠΟΥΛΟΣ');
  assert.equal(result.tickets[0].customer.phonePrimary, '6900000000');
  assert.equal(result.tickets[0].order.serviceGroup, 'Field Team North');
});
