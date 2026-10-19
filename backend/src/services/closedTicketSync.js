import { config } from '../config.js';
import { buildClosedTicketRecord, findOrderField } from './closedTicketSla.js';

export function parseDateRangeValue(value) {
  const match = String(value ?? '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) throw new Error('Dates must use DD.MM.YYYY');
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return parsed;
}

function formatFionaDate(value) {
  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${value.getUTCFullYear()}`;
}

export function listDateRange(start, end) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())
    || !(end instanceof Date) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid date range');
  }
  if (start > end) throw new Error('--from-date cannot be after --to-date');

  const dates = [];
  for (let current = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    current <= end.getTime(); current += 24 * 60 * 60 * 1000) {
    dates.push(formatFionaDate(new Date(current)));
  }
  return dates;
}

function randomDelay(minimum, maximum) {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

export async function syncClosedTickets({
  client,
  repository,
  fromDate,
  toDate,
  refreshExisting = false,
  serviceGroupMatch = null,
  serviceGroups = config.closedTicketServiceGroups,
  minDelayMs = config.fionaRequestMinDelayMs,
  maxDelayMs = config.fionaRequestMaxDelayMs,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = () => new Date(),
  onProgress = () => {},
}) {
  const dates = listDateRange(fromDate, toDate);
  const summary = {
    days: dates.length,
    ordersSeen: 0,
    inserted: 0,
    refreshed: 0,
    alreadyPresent: 0,
    duplicateInRange: 0,
    notCompleted: 0,
    otherStore: 0,
    missingCompletionTime: 0,
    failed: 0,
    failures: [],
  };
  const visitedOrderIds = new Set();
  const pause = () => wait(randomDelay(minDelayMs, maxDelayMs));

  for (const [dateIndex, workDate] of dates.entries()) {
    const dateProgress = `[${dateIndex + 1}/${dates.length}] ${workDate}`;
    onProgress(`${dateProgress}: fetching workorders...`);
    let dailyOrders;
    try {
      await pause();
      dailyOrders = await client.dailyWorkorders(workDate, serviceGroups);
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({ workDate, stage: 'daily_workorders', status: error?.status ?? null });
      onProgress(`${dateProgress}: failed to fetch workorders${error?.status ? ` (HTTP ${error.status})` : ''}.`);
      continue;
    }
    onProgress(`${dateProgress}: found ${dailyOrders.length} workorders.`);

    for (const order of dailyOrders) {
      summary.ordersSeen += 1;
      const rawOrderId = order?.orderId ?? order?.id;
      if (rawOrderId === null || rawOrderId === undefined || String(rawOrderId).trim() === '') {
        summary.failed += 1;
        summary.failures.push({ workDate, stage: 'missing_order_id', status: null });
        onProgress(`${dateProgress}: skipped a workorder with no order ID.`);
        continue;
      }
      const orderId = String(rawOrderId);
      if (visitedOrderIds.has(orderId)) {
        summary.duplicateInRange += 1;
        onProgress(`${dateProgress}: order ${orderId} already appeared in this range; skipped duplicate.`);
        continue;
      }
      visitedOrderIds.add(orderId);

      const alreadyStored = repository.hasOrder(orderId);
      if (alreadyStored && !refreshExisting) {
        summary.alreadyPresent += 1;
        onProgress(`${dateProgress}: order ${orderId} is already in the database; skipped.`);
        continue;
      }

      let details;
      try {
        onProgress(`${dateProgress}: fetching details for order ${orderId}...`);
        await pause();
        details = await client.orderDetails(orderId);
      } catch (error) {
        summary.failed += 1;
        summary.failures.push({ orderId, stage: 'order_details', status: error?.status ?? null });
        onProgress(`${dateProgress}: order ${orderId} details failed${error?.status ? ` (HTTP ${error.status})` : ''}.`);
        continue;
      }

      // All stores share one Fiona service group ID; only the group name in the order details identifies the store.
      if (serviceGroupMatch) {
        const orderGroup = String(findOrderField(details, 'serviceGroup') ?? order?.serviceGroup ?? '').toUpperCase();
        if (!orderGroup.includes(String(serviceGroupMatch).toUpperCase())) {
          summary.otherStore += 1;
          onProgress(`${dateProgress}: order ${orderId} belongs to another store; skipped.`);
          continue;
        }
      }

      const preliminaryRecord = buildClosedTicketRecord(order, details, {}, null, now());
      if (!preliminaryRecord) {
        const detailsStatus = String(findOrderField(details, 'orderStatus') ?? '').trim().toUpperCase();
        const orderStatus = String(order?.orderStatus ?? '').trim().toUpperCase();
        if (detailsStatus !== 'COMPLETED' && orderStatus !== 'COMPLETED') {
          summary.notCompleted += 1;
          onProgress(`${dateProgress}: order ${orderId} is not COMPLETED; skipped.`);
        } else {
          summary.missingCompletionTime += 1;
          onProgress(`${dateProgress}: order ${orderId} has no valid completion time; skipped.`);
        }
        continue;
      }

      const serviceOrderId = preliminaryRecord.service_order_id || orderId;
      let workOrderData;
      let comment;
      try {
        onProgress(`${dateProgress}: fetching SLA details for order ${orderId}...`);
        await pause();
        workOrderData = await client.fetchWorkOrderSlaDetailsWithSession(serviceOrderId);
        onProgress(`${dateProgress}: fetching latest comment for order ${orderId}...`);
        await pause();
        comment = await client.fetchLatestCommentWithSession(orderId);
      } catch (error) {
        summary.failed += 1;
        summary.failures.push({
          orderId,
          stage: error?.operation === 'comments' ? 'comments' : 'external_data',
          status: error?.status ?? null,
        });
        const stage = error?.operation === 'comments' ? 'latest comment' : 'SLA details';
        onProgress(`${dateProgress}: order ${orderId} ${stage} failed${error?.status ? ` (HTTP ${error.status})` : ''}; not saved.`);
        continue;
      }

      const record = buildClosedTicketRecord(order, details, workOrderData, comment, now());
      if (!record) {
        summary.missingCompletionTime += 1;
        onProgress(`${dateProgress}: order ${orderId} no longer qualifies as completed; skipped.`);
        continue;
      }
      if (alreadyStored && refreshExisting && repository.updateExisting(record)) {
        summary.refreshed += 1;
        onProgress(`${dateProgress}: refreshed order ${orderId}.`);
      } else if (!alreadyStored && repository.insert(record)) {
        summary.inserted += 1;
        onProgress(`${dateProgress}: saved order ${orderId}.`);
      } else if (alreadyStored && refreshExisting) {
        summary.failed += 1;
        summary.failures.push({ orderId, stage: 'update_existing', status: null });
        onProgress(`${dateProgress}: order ${orderId} could not be refreshed; existing data was kept.`);
      } else {
        summary.alreadyPresent += 1;
        onProgress(`${dateProgress}: order ${orderId} was saved by another run; skipped.`);
      }
    }
  }

  return summary;
}