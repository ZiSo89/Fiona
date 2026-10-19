import { config } from '../config.js';
import { buildClosedTicketRecord, findOrderField } from './closedTicketSla.js';
import { mapProjectTrackerCategory } from './projectTrackerCatalog.js';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Athens',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function athensDayOf(value) {
  const parts = Object.fromEntries(dayFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function fionaDateRange(cutoverAt, now, lookbackDays) {
  const today = athensDayOf(now);
  const [year, month, day] = today.split('-').map(Number);
  const todayUtc = Date.UTC(year, month - 1, day);
  const earliestLookback = new Date(todayUtc - Math.max(0, lookbackDays - 1) * 24 * 60 * 60 * 1000);
  const cutoverDay = athensDayOf(cutoverAt);
  const [cutoverYear, cutoverMonth, cutoverDate] = cutoverDay.split('-').map(Number);
  const startUtc = Math.max(earliestLookback.getTime(), Date.UTC(cutoverYear, cutoverMonth - 1, cutoverDate));
  const dates = [];
  for (let current = startUtc; current <= todayUtc; current += 24 * 60 * 60 * 1000) {
    const date = new Date(current);
    dates.push(`${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${date.getUTCFullYear()}`);
  }
  return dates;
}

function fieldText(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return text ? text.slice(0, 120) : null;
}

function readCategoryFields(order, details, categoryMap) {
  const categoryIds = ['categoryId01', 'categoryId02', 'categoryId03', 'categoryId04', 'categoryId05']
    .map((field) => fieldText(findOrderField(details, field) ?? order?.Categorization?.[field]))
    .filter(Boolean);
  const candidateValues = [
    findOrderField(details, 'orderType'),
    findOrderField(details, 'workOrderType'),
    findOrderField(details, 'planServiceDescription'),
    order?.orderType,
    order?.workOrderType,
    order?.planServiceDescription,
    ...categoryIds,
  ].map(fieldText).filter(Boolean);
  const category = mapProjectTrackerCategory(categoryMap, ...candidateValues);
  const sourceLabel = category?.name
    || fieldText(findOrderField(details, 'orderType'))
    || fieldText(order?.orderType)
    || (categoryIds.length ? `Fiona category ${categoryIds.join(' / ')}` : 'Unmapped Fiona service');
  return { category, sourceLabel, sourceCategoryId: categoryIds.join('|') || null };
}

export async function syncProjectTracker({
  stores,
  clients,
  repository,
  lookbackDays = 14,
  categoryMap = config.projectTrackerCategoryMap,
  serviceGroups = config.closedTicketServiceGroups,
  minDelayMs = config.fionaRequestMinDelayMs,
  maxDelayMs = config.fionaRequestMaxDelayMs,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = () => new Date(),
}) {
  const currentTime = now();
  const cutoverAt = repository.ensureCutoverAt(currentTime);
  const remappedExisting = repository.applyCategoryMap(categoryMap, currentTime.toISOString());
  const workDates = fionaDateRange(cutoverAt, currentTime, lookbackDays);
  const summary = {
    stores: stores.length,
    days: workDates.length,
    seen: 0,
    inserted: 0,
    remappedExisting,
    alreadyPresent: 0,
    notCompleted: 0,
    beforeCutover: 0,
    otherStore: 0,
    missingTeam: 0,
    failed: 0,
  };
  const pause = () => wait(Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs);

  for (const store of stores) {
    const client = clients instanceof Map ? clients.get(store.storeId) : clients(store.storeId);
    if (!client) continue;
    const groups = store.closedServiceGroups?.length ? store.closedServiceGroups : serviceGroups;

    for (const workDate of workDates) {
      let orders;
      try {
        await pause();
        orders = await client.dailyWorkorders(workDate, groups);
      } catch {
        summary.failed += 1;
        continue;
      }

      for (const order of orders) {
        const rawOrderId = order?.orderId ?? order?.id;
        const orderId = rawOrderId === null || rawOrderId === undefined ? '' : String(rawOrderId).trim();
        if (!orderId) continue;
        summary.seen += 1;
        if (repository.hasJob(store.storeId, orderId)) {
          summary.alreadyPresent += 1;
          continue;
        }

        let details;
        try {
          await pause();
          details = await client.orderDetails(orderId);
        } catch {
          summary.failed += 1;
          continue;
        }

        const serviceGroupMatch = String(store.closedServiceGroupMatch ?? '').trim().toUpperCase();
        if (serviceGroupMatch) {
          const serviceGroup = String(findOrderField(details, 'serviceGroup') ?? order?.serviceGroup ?? '').toUpperCase();
          if (!serviceGroup.includes(serviceGroupMatch)) {
            summary.otherStore += 1;
            continue;
          }
        }

        const completed = buildClosedTicketRecord(order, details, {}, null, currentTime);
        if (!completed) {
          summary.notCompleted += 1;
          continue;
        }
        if (completed.closed_at < cutoverAt) {
          summary.beforeCutover += 1;
          continue;
        }

        const teamName = fieldText(order?.teamName)
          || fieldText(findOrderField(details, 'teamName'))
          || completed.team_name;
        if (!teamName) {
          summary.missingTeam += 1;
          continue;
        }
        const categoryFields = readCategoryFields(order, details, categoryMap);
        if (repository.insertJob({
          storeId: store.storeId,
          orderId,
          teamName,
          closedAt: completed.closed_at,
          sourceLabel: categoryFields.sourceLabel,
          sourceCategoryId: categoryFields.sourceCategoryId,
          categoryId: categoryFields.category?.id ?? null,
          importedAt: currentTime.toISOString(),
        })) summary.inserted += 1;
      }
    }
  }

  return summary;
}

export function createProjectTrackerSync(options) {
  let interval = null;
  let currentRun = null;
  const intervalMs = options.intervalMs ?? 15 * 60 * 1000;

  function syncOnce() {
    if (currentRun) return currentRun;
    currentRun = syncProjectTracker(options).finally(() => { currentRun = null; });
    return currentRun;
  }

  return {
    syncOnce,
    start() {
      if (interval) return;
      void syncOnce().then((summary) => {
        console.info('Project tracker sync completed:', summary);
      }).catch((error) => {
        console.error('Project tracker sync failed:', error?.message);
      });
      interval = setInterval(() => {
        void syncOnce().then((summary) => {
          console.info('Project tracker sync completed:', summary);
        }).catch((error) => {
          console.error('Project tracker sync failed:', error?.message);
        });
      }, intervalMs);
      interval.unref?.();
    },
    stop() {
      if (interval) clearInterval(interval);
      interval = null;
    },
  };
}