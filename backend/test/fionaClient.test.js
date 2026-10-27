import test from 'node:test';
import assert from 'node:assert/strict';
import { FionaClient } from '../src/services/fionaClient.js';

const clientConfig = {
  fionaAuthUrl: 'https://example.test/auth/login',
  fionaOrdersUrl: 'https://example.test/orders/filter',
  fionaWorkordersUrl: 'https://example.test/workorders',
  fionaExternalDataUrl: 'https://example.test/external_data',
  fionaOrdersBaseUrl: 'https://example.test/orders',
  username: 'tech@example.test',
  password: 'test-password',
  basicAuth: 'test-basic-auth',
  countryCode: 'GR',
  filterLimit: '100',
  filterOffset: '-1',
  filterStatuses: ['OPEN', 'TO CALL', 'APPOINTMENT', 'CALL LATER'],
};

test('fetchOrders logs in and sends the observed orders/filter payload and Basic header', async () => {
  const requests = [];
  const httpClient = {
    post: async (url, payload, options) => {
      requests.push({ url, payload, options });
      if (url.endsWith('/auth/login')) {
        return { data: { status: 'OK', sessionToken: 'test-session-token' } };
      }
      return { data: { FilteredOrders: [] } };
    },
  };
  const client = new FionaClient(clientConfig, httpClient);

  const result = await client.fetchOrders();

  assert.deepEqual(result, { FilteredOrders: [] });
  assert.deepEqual(requests[0], {
    url: 'https://example.test/auth/login',
    payload: {
      channel: 'WEB_INIT',
      username: 'tech@example.test',
      password: 'test-password',
    },
    options: { headers: { Authorization: 'Basic test-basic-auth' } },
  });
  assert.equal(requests[1].url, 'https://example.test/orders/filter');
  assert.deepEqual(requests[1].payload, {
    countryCode: 'GR',
    limit: '100',
    offset: '-1',
    sessionTokenID: 'test-session-token',
    statuses: ['OPEN', 'TO CALL', 'APPOINTMENT', 'CALL LATER'],
  });
  assert.equal(requests[1].options.headers.Authorization, 'Basic test-basic-auth');
});

test('fetchOrders loads and caches a missing work-order SLA date', async () => {
  const detailRequests = [];
  const httpClient = {
    post: async (url) => url.endsWith('/auth/login')
      ? { data: { sessionToken: 'test-session-token' } }
      : { data: { FilteredOrders: [{ serviceOrderId: 'PS12654600', deadline: '2026-10-13 12:00:00' }] } },
    get: async (url, options) => {
      detailRequests.push({ url, options });
      return {
        data: {
          OrderData: {
            WorkOrderData: { slaDate: '10/14/2026 19:20:34', status: 'Open', slaSurpassed: 'N' },
            ActivityData: [{
              activityType: 'Call Outbound',
              activitySlaDueDate: '10/13/2026 12:00:00',
              activitySlaStartDate: '10/13/2026 08:00:00',
              activitySubStatus: '4.0 Pending, no contact yet',
            }],
          },
        },
      };
    },
  };
  const client = new FionaClient(clientConfig, httpClient);

  const firstResult = await client.fetchOrders();
  const secondResult = await client.fetchOrders();

  assert.equal(firstResult.FilteredOrders[0].workOrderSlaDate, '10/14/2026 19:20:34');
  assert.equal(secondResult.FilteredOrders[0].workOrderSlaDate, '10/14/2026 19:20:34');
  assert.equal(firstResult.FilteredOrders[0].activities[0].activitySlaDueDate, '10/13/2026 12:00:00');
  assert.equal(detailRequests.length, 1);
  assert.equal(detailRequests[0].url, 'https://example.test/external_data/PS12654600/external');
  assert.equal(detailRequests[0].options.headers.Authorization, 'Basic test-basic-auth');
  assert.deepEqual(detailRequests[0].options.params, { sessionToken: 'test-session-token' });
});

test('fetchOrders attaches the newest comment and external site details', async () => {
  const httpClient = {
    post: async (url) => url.endsWith('/auth/login')
      ? { data: { sessionToken: 'test-session-token' } }
      : { data: { FilteredOrders: [{ id: '22433532', serviceOrderId: 'PS12415450' }] } },
    get: async (url) => {
      if (url.endsWith('/comments')) {
        return {
          data: {
            OrderComments: [
              { commentText: 'older', insertTime: '2026-09-30 10:00:00', dateSort: '20260930100000' },
              { commentText: 'newest', insertTime: '2026-09-30 20:09:45', dateSort: '20260930200945', firstName: 'Stavros', lastName: 'Venetis' },
            ],
          },
        };
      }
      return {
        data: {
          OrderData: {
            WorkOrderData: { slaDate: '10/02/2026 15:13:46' },
            ExternalData: {
              escalateLimit: 'FB(+00).1 - 02',
              floor: '01',
              crmAppartment: '1',
              cliNumber: '2100000000',
              problemDescription: 'Loss of connectivity',
            },
            AddressData: { googleMapsData: '25.875348:40.851182' },
            ActivityData: [{ activityType: 'Call Outbound', activitySlaDueDate: '09/30/2026 20:00:00', nextActionDate: '10/14/2026 09:00:00' }],
            EquipmentData: [
              { equipmentDescription: 'Nokia G-1426G-A ONT I-Op' },
              { equipmentDescription: 'Wi-Fi extender' },
            ],
          },
        },
      };
    },
  };
  const client = new FionaClient({ ...clientConfig, fionaOrdersBaseUrl: 'https://example.test/orders' }, httpClient);

  const order = (await client.fetchOrders()).FilteredOrders[0];

  assert.deepEqual(order.latestComment, { text: 'newest', insertTime: '2026-09-30 20:09:45', author: 'Stavros Venetis' });
  assert.equal(order.externalData.escalateLimit, 'FB(+00).1 - 02');
  assert.equal(order.externalData.cliNumber, '2100000000');
  assert.equal(order.externalData.problemDescription, 'Loss of connectivity');
  assert.equal(order.equipmentDescription, 'Nokia G-1426G-A ONT I-Op, Wi-Fi extender');
  assert.equal(order.hasEquipmentSerialNumber, false);
  assert.equal(order.externalData.googleMapsData, '25.875348:40.851182');
  assert.equal(order.externalData.nextActionDate, '10/14/2026 09:00:00');
});

test('detects a serial number in Fiona equipment data', async () => {
  const client = new FionaClient(clientConfig, {
    get: async () => ({
      data: {
        OrderData: {
          EquipmentData: [{ equipmentCategory: 'Router', equipmentSerialNumber: 'SN-12345' }],
        },
      },
    }),
  });

  const details = await client.fetchWorkOrderSlaDetails('PS123', 'test-session-token');

  assert.equal(details.hasEquipmentSerialNumber, true);
});

test('fetchOrders logs in again after the filter endpoint returns 401', async () => {
  let loginCount = 0;
  const filterTokens = [];
  const httpClient = {
    post: async (url, payload) => {
      if (url.endsWith('/auth/login')) {
        loginCount += 1;
        return { data: { sessionToken: `session-${loginCount}` } };
      }

      filterTokens.push(payload.sessionTokenID);
      if (filterTokens.length === 1) {
        const error = new Error('Unauthorized');
        error.response = { status: 401 };
        throw error;
      }
      return { data: { FilteredOrders: [] } };
    },
  };
  const client = new FionaClient(clientConfig, httpClient);

  await client.fetchOrders();

  assert.equal(loginCount, 2);
  assert.deepEqual(filterTokens, ['session-1', 'session-2']);
});

test('fetchOrders identifies login rejection after the filter requests a fresh session', async () => {
  let loginCount = 0;
  const httpClient = {
    post: async (url) => {
      if (url.endsWith('/auth/login')) {
        loginCount += 1;
        if (loginCount === 2) {
          const error = new Error('Unauthorized');
          error.response = { status: 401 };
          throw error;
        }
        return { data: { sessionToken: 'initial-session' } };
      }

      const error = new Error('Unauthorized');
      error.response = { status: 401 };
      throw error;
    },
  };
  const client = new FionaClient(clientConfig, httpClient);

  await assert.rejects(client.fetchOrders(), /Fiona login failed \(HTTP 401\)/);
});

test('fetchOrders identifies orders/filter rejection after a successful re-login', async () => {
  let loginCount = 0;
  const httpClient = {
    post: async (url) => {
      if (url.endsWith('/auth/login')) {
        loginCount += 1;
        return { data: { sessionToken: `session-${loginCount}` } };
      }

      const error = new Error('Unauthorized');
      error.response = { status: 401 };
      throw error;
    },
  };
  const client = new FionaClient(clientConfig, httpClient);

  await assert.rejects(client.fetchOrders(), /Fiona orders\/filter failed \(HTTP 401\)/);
  assert.equal(loginCount, 2);
});

test('dailyWorkorders keeps the assigned team separate from its group name', async () => {
  const requests = [];
  const client = new FionaClient(clientConfig, {
    post: async (url, payload, options) => {
      requests.push({ url, payload, options });
      if (url.endsWith('/auth/login')) return { data: { sessionToken: 'daily-session' } };
      return {
        data: {
          UserTeams: [{
            teamName: 'Team Alpha',
            TeamWorkOrders: [
              { orderId: '123', orderStatus: 'COMPLETED', teamName: 'null', serviceGroupName: 'NEW TECHNOLOGIES LTD ALEXANDROUPOLIS' },
              { orderId: '124', orderStatus: 'COMPLETED', teamName: null, serviceGroupName: 'NEW TECHNOLOGIES LTD ALEXANDROUPOLIS' },
            ],
          }],
        },
      };
    },
  });

  const result = await client.dailyWorkorders('14.10.2026', ['395']);

  assert.deepEqual(result, [
    {
      orderId: '123',
      orderStatus: 'COMPLETED',
      teamName: 'Team Alpha',
      serviceGroupName: 'NEW TECHNOLOGIES LTD ALEXANDROUPOLIS',
      teamGroupName: 'NEW TECHNOLOGIES LTD ALEXANDROUPOLIS',
    },
    {
      orderId: '124',
      orderStatus: 'COMPLETED',
      teamName: 'Team Alpha',
      serviceGroupName: 'NEW TECHNOLOGIES LTD ALEXANDROUPOLIS',
      teamGroupName: 'NEW TECHNOLOGIES LTD ALEXANDROUPOLIS',
    },
  ]);
  assert.equal(requests[1].url, 'https://example.test/workorders');
  assert.deepEqual(requests[1].payload, {
    sessionToken: 'daily-session',
    workDate: '14.10.2026',
    teamUniqueId: '',
    teamSkill: '',
    serviceGroup: ['395'],
    sapTeamId: '',
  });
  assert.equal(requests[1].options.headers.Authorization, 'Basic test-basic-auth');
});

test('orderDetails requests an encoded order ID with the current session token', async () => {
  let request;
  const client = new FionaClient(clientConfig, {
    post: async () => ({ data: { sessionToken: 'details-session' } }),
    get: async (url, options) => {
      request = { url, options };
      return { data: { orderId: '123/4', orderStatus: 'COMPLETED' } };
    },
  });

  const result = await client.orderDetails('123/4');

  assert.deepEqual(result, { orderId: '123/4', orderStatus: 'COMPLETED' });
  assert.equal(request.url, 'https://example.test/orders/123%2F4');
  assert.deepEqual(request.options.params, { sessionToken: 'details-session' });
  assert.equal(request.options.headers.Authorization, 'Basic test-basic-auth');
});

test('session wrappers preserve parsed SLA details and comment results', async () => {
  const client = new FionaClient(clientConfig, {
    post: async () => ({ data: { sessionToken: 'enrichment-session' } }),
    get: async (url) => {
      if (url.endsWith('/comments')) {
        return {
          data: {
            OrderComments: [{
              commentText: 'Completed successfully',
              insertTime: '2026-10-14 10:00:00',
              dateSort: '20261014100000',
            }],
          },
        };
      }
      return {
        data: {
          OrderData: {
            WorkOrderData: {
              slaDate: '10/14/2026 12:00:00',
              status: 'Closed',
              slaSurpassed: 'N',
            },
          },
        },
      };
    },
  });

  const sla = await client.fetchWorkOrderSlaDetailsWithSession('PS-123');
  const comment = await client.fetchLatestCommentWithSession('123');

  assert.equal(sla.workOrderSlaDate, '10/14/2026 12:00:00');
  assert.equal(sla.slaSurpassed, 'N');
  assert.equal(sla.workOrderStatus, 'Closed');
  assert.equal(comment.text, 'Completed successfully');
});