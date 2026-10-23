import { config } from '../config.js';
import { createClosedTicketRepository } from './closedTicketRepository.js';
import { createTicketObservationRepository } from './ticketObservationRepository.js';

const statsRepositories = new Map();

export function getStatsRepositories(storeId) {
  if (!statsRepositories.has(storeId)) {
    statsRepositories.set(storeId, {
      closed: createClosedTicketRepository(config.closedTicketsDbPath, storeId),
      observations: createTicketObservationRepository(config.closedTicketsDbPath, storeId),
    });
  }
  return statsRepositories.get(storeId);
}
