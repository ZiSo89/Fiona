import { config } from '../config.js';
import { createClosedTicketRepository } from './closedTicketRepository.js';
import { createTicketObservationRepository } from './ticketObservationRepository.js';

const statsRepositories = new Map();

export async function getStatsRepositories(storeId) {
  if (!statsRepositories.has(storeId)) {
    const pending = (async () => {
      const closed = await createClosedTicketRepository(config.closedTicketsDbPath, storeId);
      try {
        return { closed, observations: await createTicketObservationRepository(config.closedTicketsDbPath, storeId) };
      } catch (error) {
        await closed.close();
        throw error;
      }
    })();
    statsRepositories.set(storeId, pending);
    pending.catch(() => statsRepositories.delete(storeId));
  }
  return statsRepositories.get(storeId);
}
