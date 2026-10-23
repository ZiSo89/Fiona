import { FionaClient } from './fionaClient.js';
import { normalizeOrders } from './orderNormalizer.js';
import { config } from '../config.js';
import { createTicketObservationRepository } from '../repositories/ticketObservationRepository.js';
import { createClosedTicketRepository } from '../repositories/closedTicketRepository.js';
import { createClosedTicketFinalizer } from './closedTicketFinalizer.js';

export function createPollingService(client, pollIntervalMs, onTickets = () => {}, store = client.config || {}) {
  const storeId = store.storeId || 'alexandroupoli';
  const storeName = store.storeName || 'Αλεξανδρούπολη';
  const state = {
    tickets: [],
    lastUpdatedAt: null,
    lastAttemptAt: null,
    pollingInterval: null,
    refreshPromise: null,
    error: null,
    status: 'idle',
  };

  function getLatestSnapshot() {
    return {
      storeId,
      storeName,
      status: state.status,
      lastUpdatedAt: state.lastUpdatedAt,
      lastAttemptAt: state.lastAttemptAt,
      totalTickets: state.tickets.length,
      tickets: state.tickets,
      error: state.error,
    };
  }

  function refreshTickets() {
    if (state.refreshPromise) return state.refreshPromise;

    state.status = 'polling';
    state.lastAttemptAt = new Date().toISOString();
    state.refreshPromise = (async () => {
      try {
        const payload = await client.fetchOrders();
        const normalized = normalizeOrders(payload);
        const tickets = normalized.tickets.map((ticket) => ({ ...ticket, storeId, storeName }));

        state.tickets = tickets;
        state.lastUpdatedAt = new Date().toISOString();
        state.error = null;
        state.status = 'live';

        try {
          const pending = onTickets(tickets, new Date());
          Promise.resolve(pending).catch((observationError) => {
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

  return { getLatestSnapshot, refreshTickets, startPolling, stopPolling };
}

const fionaClients = new Map();

function createStorePollingService(store) {
  const client = new FionaClient(store);
  fionaClients.set(store.storeId, client);
  const observations = createTicketObservationRepository(config.closedTicketsDbPath, store.storeId);
  const repository = createClosedTicketRepository(config.closedTicketsDbPath, store.storeId);
  const finalizer = createClosedTicketFinalizer({ client, repository });
  const recordObservations = (tickets, observedAt) => {
    observations.record(tickets, observedAt);
    return finalizer.process(tickets);
  };
  return createPollingService(client, config.pollIntervalMs, recordObservations, store);
}

const configuredStores = config.fionaStores.filter((store) => store.configured);
const pollingServices = new Map(configuredStores.map((store) => [store.storeId, createStorePollingService(store)]));
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
