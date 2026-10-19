import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFionaStores } from '../src/config.js';

test('builds three store configs with separate usernames and shared password', () => {
  const stores = buildFionaStores({
    FIONA_USERNAME: 'alex@example.test',
    FIONA_KOMOTINI_USERNAME: 'komotini@example.test',
    FIONA_ORESTIADA_USERNAME: 'orestiada@example.test',
    FIONA_PASSWORD: 'shared-password',
    FIONA_BASIC_AUTH: 'shared-basic',
    FIONA_ORESTIADA_BASIC_AUTH: 'orestiada-basic',
  });

  assert.deepEqual(stores.map(({ storeId, storeName, username, password, basicAuth, configured }) => ({
    storeId, storeName, username, password, basicAuth, configured,
  })), [
    {
      storeId: 'alexandroupoli', storeName: 'Αλεξανδρούπολη', username: 'alex@example.test',
      password: 'shared-password', basicAuth: 'shared-basic', configured: true,
    },
    {
      storeId: 'komotini', storeName: 'Κομοτηνή', username: 'komotini@example.test',
      password: 'shared-password', basicAuth: 'shared-basic', configured: true,
    },
    {
      storeId: 'orestiada', storeName: 'Ορεστιάδα', username: 'orestiada@example.test',
      password: 'shared-password', basicAuth: 'orestiada-basic', configured: true,
    },
  ]);
  assert.equal('fionaStores' in stores[0], false);
});

test('keeps existing username configuration and marks missing stores unconfigured', () => {
  const stores = buildFionaStores({ FIONA_USERNAME: 'legacy@example.test', FIONA_PASSWORD: 'shared-password' });
  assert.equal(stores[0].username, 'legacy@example.test');
  assert.equal(stores[0].configured, true);
  assert.equal(stores[1].configured, false);
  assert.equal(stores[2].configured, false);
});