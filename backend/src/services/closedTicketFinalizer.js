import { buildClosedTicketRecord, findOrderField } from './closedTicketSla.js';

const MAX_ATTEMPTS = 6;
const MAX_PER_RUN = 15;
const EMPTY_SNAPSHOTS_TO_CONFIRM = 2;
const BASE_RETRY_DELAY_MS = 60 * 1000;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1000;

function retryDelay(attempts) {
  return Math.min(BASE_RETRY_DELAY_MS * (2 ** Math.min(attempts, 10)), MAX_RETRY_DELAY_MS);
}

// Open tickets are remembered; once one leaves the open list it is looked up and stored if COMPLETED.
export function createClosedTicketFinalizer({ client, repository, now = () => new Date() }) {
  let running = false;
  let consecutiveEmptySnapshots = 0;

  async function finalizeVanished(openOrderIds) {
    const pending = repository.listDuePending(now()).filter((row) => !openOrderIds.has(row.order_id));
    const summary = { inserted: 0, retry: 0, dropped: 0 };

    for (const row of pending.slice(0, MAX_PER_RUN)) {
      const giveUp = () => {
        if (row.attempts + 1 >= MAX_ATTEMPTS) {
          repository.removePending(row.order_id);
          summary.dropped += 1;
        } else {
          repository.schedulePendingRetry(row.order_id, new Date(now().getTime() + retryDelay(row.attempts)));
          summary.retry += 1;
        }
      };

      try {
        const details = await client.orderDetails(row.order_id);
        const order = {
          orderId: row.order_id,
          serviceOrderId: row.service_order_id,
          teamName: findOrderField(details, 'teamName') ?? row.team_name,
        };
        const preliminaryRecord = buildClosedTicketRecord(order, details, {}, null, now());
        if (!preliminaryRecord) {
          giveUp();
          continue;
        }
        const serviceOrderId = preliminaryRecord.service_order_id || row.service_order_id || '';
        const workOrderData = await client.fetchWorkOrderSlaDetailsWithSession(serviceOrderId);
        const comment = await client.fetchLatestCommentWithSession(row.order_id);
        const record = buildClosedTicketRecord(order, details, workOrderData, comment, now());
        if (!record) {
          repository.removePending(row.order_id);
          continue;
        }

        const alreadyStored = repository.hasOrder(row.order_id);
        const saved = alreadyStored
          ? repository.updateExisting(record)
          : repository.insert(record);
        if (saved && !alreadyStored) summary.inserted += 1;

        if (!record.work_order_sla_date) {
          repository.schedulePendingRetry(row.order_id, new Date(now().getTime() + retryDelay(row.attempts)));
          summary.retry += 1;
        } else {
          repository.removePending(row.order_id);
        }
      } catch (error) {
        console.error(`Closing order ${row.order_id} failed:`, error?.message);
        repository.schedulePendingRetry(row.order_id, new Date(now().getTime() + retryDelay(row.attempts)));
        summary.retry += 1;
      }
    }
    return summary;
  }

  return {
    async process(tickets) {
      const openOrderIds = new Set();
      const rows = [];
      for (const ticket of tickets) {
        const orderId = String(ticket?.id ?? '').trim();
        if (!orderId) continue;
        openOrderIds.add(orderId);
        rows.push({
          store_id: ticket?.storeId || undefined,
          order_id: orderId,
          service_order_id: ticket?.serviceOrderId ? String(ticket.serviceOrderId) : null,
          team_name: ticket?.dispatch?.assignedTeam || null,
        });
      }
      if (running) return null;
      if (rows.length) consecutiveEmptySnapshots = 0;
      else {
        consecutiveEmptySnapshots += 1;
        if (consecutiveEmptySnapshots < EMPTY_SNAPSHOTS_TO_CONFIRM) return null;
      }

      running = true;
      try {
        repository.trackOpen(rows, now());
        repository.trackUnknownClosed(now());
        return await finalizeVanished(openOrderIds);
      } finally {
        running = false;
      }
    },
  };
}
