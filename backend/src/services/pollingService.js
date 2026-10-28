import { FionaClient } from './fionaClient.js';
import { normalizeOrders } from './orderNormalizer.js';
import { config } from '../config.js';
import { createTicketObservationRepository } from '../repositories/ticketObservationRepository.js';
import { createClosedTicketRepository } from '../repositories/closedTicketRepository.js';
import { createClosedTicketFinalizer } from './closedTicketFinalizer.js';

export function createPollingService(client, pollIntervalMs, onTickets = () => {}, store = client.config || {}, now = () => Date.now()) {
  const storeId = store.storeId || 'alexandroupoli';
  const storeName = store.storeName || 'Αλεξανδρούπολη';
  // A live snapshot that missed two polls in a row is no longer trustworthy.
  const maxLiveAgeMs = 2 * pollIntervalMs + 60 * 1000;
  const state = {
    tickets: [],
    lastUpdatedAt: null,
    lastAttemptAt: null,
    pollingInterval: null,
    refreshPromise: null,
    observationPromise: null,
    error: null,
    status: 'idle',
    possiblyTruncated: false,
  };

  function getLatestSnapshot() {
    const expired = state.status === 'live' && state.lastUpdatedAt
      && now() - Date.parse(state.lastUpdatedAt) > maxLiveAgeMs;
    return {
      storeId,
      storeName,
      status: expired ? 'stale' : state.status,
      refreshing: Boolean(state.refreshPromise),
      lastUpdatedAt: state.lastUpdatedAt,
      lastAttemptAt: state.lastAttemptAt,
      totalTickets: state.tickets.length,
      possiblyTruncated: state.possiblyTruncated,
      tickets: state.tickets,
      error: state.error,
    };
  }

  function refreshTickets() {
    if (state.refreshPromise) return state.refreshPromise;

    // Keep the previous outcome visible while a refresh runs; only the first poll reports 'polling'.
    if (state.status === 'idle') state.status = 'polling';
    state.lastAttemptAt = new Date(now()).toISOString();
    state.refreshPromise = (async () => {
      try {
        const payload = await client.fetchOrders();
        const normalized = normalizeOrders(payload);
        const tickets = normalized.tickets.map((ticket) => ({ ...ticket, storeId, storeName }));
        const limit = Number(client.config?.filterLimit);
        const receivedOrders = typeof client.getWorkOrders === 'function'
          ? client.getWorkOrders(payload).length
          : tickets.length;

        state.tickets = tickets;
        state.lastUpdatedAt = new Date(now()).toISOString();
        state.error = null;
        state.status = 'live';
        state.possiblyTruncated = limit > 0 && receivedOrders >= limit;
        if (state.possiblyTruncated) {
          console.warn(`Fiona returned ${receivedOrders} open orders for ${storeId}, the FIONA_FILTER_LIMIT; some may be missing.`);
        }

        try {
          const pending = onTickets(tickets, new Date());
          state.observationPromise = Promise.resolve(pending).catch((observationError) => {
            console.error('Ticket observation failed:', observationError?.message);
          });
        } catch (observationError) {
          console.error('Ticket observation failed:', observationError?.message);
        }
      } catch (error) {
        state.error = error?.message || 'Unknown polling error';
        state.status = state.tickets.length > 0 ? 'stale' : 'error';
        console.error('Polling error:', state.error);
      } finally {
        state.refreshPromise = null;
      }

      return getLatestSnapshot();
    })();

    return state.refreshPromise;
  }

  function startPolling() {
    if (state.pollingInterval) return;

    void refreshTickets();
    state.pollingInterval = setInterval(() => {
      void refreshTickets();
    }, pollIntervalMs);
    state.pollingInterval.unref?.();
  }

  function stopPolling() {
    if (state.pollingInterval) clearInterval(state.pollingInterval);
    state.pollingInterval = null;
  }

  async function idle() {
    await state.refreshPromise;
    await state.observationPromise;
  }

  return { getLatestSnapshot, refreshTickets, startPolling, stopPolling, idle };
}

const fionaClients = new Map();
const storeRepositories = [];

async function createStorePollingService(store) {
  const client = new FionaClient(store);
  fionaClients.set(store.storeId, client);
  const observations = await createTicketObservationRepository(config.closedTicketsDbPath, store.storeId);
  const repository = await createClosedTicketRepository(config.closedTicketsDbPath, store.storeId);
  storeRepositories.push(observations, repository);
  const finalizer = createClosedTicketFinalizer({ client, repository });
  const recordObservations = async (tickets, observedAt) => {
    await observations.record(tickets, observedAt);
    return finalizer.process(tickets);
  };
  return createPollingService(client, config.pollIntervalMs, recordObservations, store);
}

const configuredStores = config.fionaStores.filter((store) => store.configured);
const pollingServices = new Map();
let initialization;
export function initializePolling() {
  if (!initialization) {
    initialization = (async () => {
      for (const store of configuredStores) {
        pollingServices.set(store.storeId, await createStorePollingService(store));
      }
    })();
  }
  return initialization;
}
const defaultStoreId = configuredStores.find((store) => store.storeId === 'alexandroupoli')?.storeId
  || configuredStores[0]?.storeId;

function getPollingService(storeId = defaultStoreId) {
  const service = pollingServices.get(storeId);
  if (!service) {
    const error = new Error(`Fiona store is not configured: ${storeId || 'none'}`);
    error.status = 404;
    throw error;
  }
  return service;
}

export const getConfiguredStores = () => configuredStores.map(({ storeId, storeName }) => ({ storeId, storeName }));
export const getStores = () => config.fionaStores.map(({ storeId, storeName, configured }) => ({ storeId, storeName, configured }));
export const getFionaClient = (storeId) => fionaClients.get(storeId) ?? null;
export const getLatestSnapshot = (storeId) => getPollingService(storeId).getLatestSnapshot();
export const refreshTickets = (storeId) => getPollingService(storeId).refreshTickets();
export const getAllLatestSnapshots = () => configuredStores.map((store) => getPollingService(store.storeId).getLatestSnapshot());
export const refreshAllTickets = async () => Promise.all(configuredStores.map((store) => refreshTickets(store.storeId)));
export const startPolling = () => pollingServices.forEach((service) => service.startPolling());
export const stopPolling = () => pollingServices.forEach((service) => service.stopPolling());
export const waitForPollingIdle = () => Promise.all([...pollingServices.values()].map((service) => service.idle()));
export const closePollingRepositories = () => Promise.all(storeRepositories.splice(0).map((repository) => repository.close()));
