import { config } from '../config.js';
import { buildClosedTicketRecord, findOrderField } from './closedTicketSla.js';
import { cleanTeamName } from './orderNormalizer.js';

const MAX_ATTEMPTS = 6;
const MAX_PER_RUN = 15;
const EMPTY_SNAPSHOTS_TO_CONFIRM = 2;
const BASE_RETRY_DELAY_MS = 60 * 1000;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1000;

function retryDelay(attempts) {
  return Math.min(BASE_RETRY_DELAY_MS * (2 ** Math.min(attempts, 10)), MAX_RETRY_DELAY_MS);
}

const athensDayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Athens',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

// Fiona often reports the service group ("NEW TECHNOLOGIES LTD KOMOTINI") where the assigned crew belongs.
function createGroupFilter(client, details, extraGroups = []) {
  const storeMatch = cleanTeamName(client.config?.closedServiceGroupMatch)?.toUpperCase();
  const groups = new Set([
    ...extraGroups,
    findOrderField(details, 'serviceGroup'),
    findOrderField(details, 'serviceGroupName'),
  ].map((value) => cleanTeamName(value)?.toUpperCase()).filter(Boolean));
  return (value) => {
    const name = cleanTeamName(value);
    if (!name) return null;
    const upper = name.toUpperCase();
    return groups.has(upper) || (storeMatch && upper.includes(storeMatch)) ? null : name;
  };
}

// Order details do not reliably include the crew; the daily workorders list does.
async function findDailyTeamName(client, orderId, dates, details, dailyCache) {
  if (typeof client.dailyWorkorders !== 'function') return null;
  const groups = client.config?.closedServiceGroups?.length
    ? client.config.closedServiceGroups
    : config.closedTicketServiceGroups;
  // The order is listed under its scheduled day, which can differ from the completion day.
  const workDates = [...new Set(dates.filter(Boolean).map((value) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : athensDayFormatter.format(parsed).replaceAll('/', '.');
  }).filter(Boolean))];
  for (const workDate of workDates) {
    try {
      if (!dailyCache.has(workDate)) dailyCache.set(workDate, await client.dailyWorkorders(workDate, groups));
      const match = dailyCache.get(workDate).find((workorder) => String(workorder?.orderId ?? workorder?.id) === String(orderId));
      const teamName = createGroupFilter(client, details, [match?.teamGroupName, match?.serviceGroupName])(match?.teamName);
      if (teamName) return teamName;
    } catch {
      // Try the next candidate day.
    }
  }
  return null;
}

// Open tickets are remembered; once one leaves the open list it is looked up and stored if COMPLETED.
export function createClosedTicketFinalizer({ client, repository, now = () => new Date() }) {
  let running = false;
  let consecutiveEmptySnapshots = 0;

  async function finalizeVanished(openOrderIds) {
    const pending = repository.listDuePending(now()).filter((row) => !openOrderIds.has(row.order_id));
    const summary = { inserted: 0, retry: 0, dropped: 0 };
    const dailyCache = new Map();

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
        const order = { orderId: row.order_id, serviceOrderId: row.service_order_id };
        const preliminaryRecord = buildClosedTicketRecord(order, details, {}, null, now());
        if (!preliminaryRecord) {
          giveUp();
          continue;
        }
        const crewOnly = createGroupFilter(client, details);
        const teamName = await findDailyTeamName(
          client,
          row.order_id,
          [preliminaryRecord.scheduled_at, preliminaryRecord.closed_at],
          details,
          dailyCache,
        ) ?? crewOnly(findOrderField(details, 'teamName')) ?? crewOnly(row.team_name);
        order.teamName = teamName;
        const serviceOrderId = preliminaryRecord.service_order_id || row.service_order_id || '';
        const workOrderData = await client.fetchWorkOrderSlaDetailsWithSession(serviceOrderId);
        const comment = await client.fetchLatestCommentWithSession(row.order_id);
        const record = buildClosedTicketRecord(order, details, workOrderData, comment, now());
        if (!record) {
          repository.removePending(row.order_id);
          continue;
        }
        // The record builder falls back to the details' team, which can be the group name.
        record.team_name = teamName;

        // The crew can appear in Fiona's daily list later; wait instead of storing a ticket without one.
        if (!record.team_name && row.attempts + 1 < MAX_ATTEMPTS) {
          repository.schedulePendingRetry(row.order_id, new Date(now().getTime() + retryDelay(row.attempts)));
          summary.retry += 1;
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
          team_name: ticket?.dispatch?.crewName || null,
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
        // Re-resolve rows that were stored with a group name instead of the assigned crew.
        repository.trackGroupNamedClosed(cleanTeamName(client.config?.closedServiceGroupMatch), now());
        return await finalizeVanished(openOrderIds);
      } finally {
        running = false;
      }
    },
  };
}
