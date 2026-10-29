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

export async function closeStatsRepositories() {
  const pending = [...statsRepositories.values()];
  statsRepositories.clear();
  await Promise.all(pending.map(async (entry) => {
    const repositories = await entry.catch(() => null);
    if (repositories) await Promise.all([repositories.closed.close(), repositories.observations.close()]);
  }));
}
