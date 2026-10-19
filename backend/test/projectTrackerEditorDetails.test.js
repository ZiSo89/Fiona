import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectTrackerEditorDetails } from '../src/services/projectTrackerEditorDetails.js';

test('loads safe address and latest comment for an editor without requesting problem details', async () => {
  const calls = [];
  const getEditorDetails = createProjectTrackerEditorDetails({
    getClient: (storeId) => {
      assert.equal(storeId, 'komotini');
      return {
        async orderDetails(orderId) {
          calls.push(['orderDetails', orderId]);
          return {
            firstName: 'ΙΩΑΝΝΟΥ',
            street: 'ΚΑΜΑΡΙΩΤΟΥΣΑ',
            houseNumber: '0',
            postalCode: '68002',
            city: '68002',
            phone: 'private-phone',
            externalData: { problemDescription: 'ignored nested container' },
          };
        },
        async fetchWorkOrderSlaDetailsWithSession() { throw new Error('problem details must not be requested'); },
        async fetchLatestCommentWithSession(orderId) {
          calls.push(['comment', orderId]);
          return { text: 'δεν απαντά', insertTime: '15/10/2026 20:40' };
        },
      };
    },
    getStoredDetails: (storeId, orderId) => {
      assert.equal(storeId, 'komotini');
      assert.equal(orderId, 'order-42');
      return {
        service_order_id: 'service-42',
        customer_name: 'ΙΩΑΝΝΟΥ',
        street: 'ΚΑΜΑΡΙΩΤΟΥΣΑ',
        house_number: '0',
        service_description: 'On-Site Support DTH TV',
        city: '68002',
        phone: 'private-phone',
        account_afm: 'private-afm',
        comment_text: 'older comment',
        comment_at: '2026-10-14T10:00:00.000Z',
      };
    },
  });

  const details = await getEditorDetails({ storeId: 'komotini', teamName: 'Team One', orderId: 'order-42' });
  assert.deepEqual(details, {
    serviceOrderId: 'service-42',
    serviceDescription: 'On-Site Support DTH TV',
    customerName: 'ΙΩΑΝΝΟΥ',
    address: 'ΚΑΜΑΡΙΩΤΟΥΣΑ 0, 68002',
    latestComment: { text: 'δεν απαντά', at: '15/10/2026 20:40' },
  });
  assert.deepEqual(calls, [
    ['orderDetails', 'order-42'],
    ['comment', 'order-42'],
  ]);
  assert.equal(JSON.stringify(details).includes('private-phone'), false);
  assert.equal(JSON.stringify(details).includes('private-afm'), false);
});

test('falls back to stored address and last comment when Fiona detail requests fail', async () => {
  const getEditorDetails = createProjectTrackerEditorDetails({
    getClient: () => ({
      async orderDetails() { throw new Error('unavailable'); },
      async fetchWorkOrderSlaDetailsWithSession() { throw new Error('must not be called'); },
      async fetchLatestCommentWithSession() { throw new Error('unavailable'); },
    }),
    getStoredDetails: () => ({
      customer_name: 'Stored Customer',
      street: 'Stored Street',
      house_number: '4',
      service_description: 'FTTH Activation',
      city: 'Stored City',
      comment_text: 'Stored comment',
      comment_at: '2026-10-15T17:40:00.000Z',
    }),
  });

  assert.deepEqual(await getEditorDetails({ storeId: 'alexandroupoli', orderId: 'order-9' }), {
    serviceOrderId: 'order-9',
    serviceDescription: 'FTTH Activation',
    customerName: 'Stored Customer',
    address: 'Stored Street 4, Stored City',
    latestComment: { text: 'Stored comment', at: '2026-10-15T17:40:00.000Z' },
  });
});