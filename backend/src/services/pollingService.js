import { fionaClient } from './fionaClient.js';
import { normalizeOrders } from './orderNormalizer.js';
import { config } from '../config.js';
import { createTicketObservationRepository } from './ticketObservationRepository.js';
import { createClosedTicketRepository } from './closedTicketRepository.js';
import { createClosedTicketFinalizer } from './closedTicketFinalizer.js';

export function createPollingService(client, pollIntervalMs, onTickets = () => {}) {
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

        state.tickets = normalized.tickets;
        state.lastUpdatedAt = new Date().toISOString();
        state.error = null;
        state.status = 'live';

        try {
          const pending = onTickets(normalized.tickets, new Date());
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

let observations;
let finalizer;
const recordObservations = (tickets, observedAt) => {
  observations ??= createTicketObservationRepository();
  observations.record(tickets, observedAt);
  finalizer ??= createClosedTicketFinalizer({ client: fionaClient, repository: createClosedTicketRepository() });
  return finalizer.process(tickets);
};

const pollingService = createPollingService(fionaClient, config.pollIntervalMs, recordObservations);

export const getLatestSnapshot = () => pollingService.getLatestSnapshot();
export const refreshTickets = () => pollingService.refreshTickets();
export const startPolling = () => pollingService.startPolling();
export const stopPolling = () => pollingService.stopPolling();
