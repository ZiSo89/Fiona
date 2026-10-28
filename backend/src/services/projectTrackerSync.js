import { config } from '../config.js';
import { buildClosedTicketRecord, findOrderField } from './closedTicketSla.js';
import { mapProjectTrackerCategory } from './projectTrackerCatalog.js';
import { cleanTeamName } from './orderNormalizer.js';

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
  const categoryIds = ['categoryId01', 'categoryId02', 'categoryId03', 'categoryId04', 'categoryId05', 'categoryId06']
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
  // The plan service description holds the specific work type (e.g. "On-Site Support FTTH").
  const serviceType = fieldText(findOrderField(details, 'planServiceDescription') ?? order?.planServiceDescription);
  const sourceTokens = serviceType && !categoryIds.includes(serviceType) ? [...categoryIds, serviceType] : categoryIds;
  return { category, sourceLabel, sourceCategoryId: sourceTokens.join('|') || null };
}

const FTTH_PARTIAL_POINTS = 15;
const CABLING_COMPLETED_POINTS = 50;
const PROJECT_TRACKER_SCORING_RULE_VERSION = 4;
const HOUR_MS = 60 * 60 * 1000;
// How long a skipped order is not requested again: unfinished work can still complete, the rest cannot change.
const SKIP_TTL_MS = {
  notCompleted: HOUR_MS,
  otherStore: 24 * HOUR_MS,
  beforeCutover: 14 * 24 * HOUR_MS,
};

function readClosingCategory(order, details) {
  return fieldText(findOrderField(details, 'categoryId06') ?? order?.Categorization?.categoryId06);
}

// Every FTTH closing other than a successful visit (5.10) scores 15 unless the comment confirms the routing was done.
function needsRoutingComment(categoryId, closingCategory) {
  return categoryId === 'ftth_installation' && Boolean(closingCategory) && !/^5\.10(\D|$)/.test(closingCategory);
}

function needsCablingComment(categoryId) {
  return categoryId === 'cabling_repair';
}

function isSuccessfulVisit(categoryId, closingCategory) {
  return categoryId === 'ftth_installation' && /^5\.10(\D|$)/.test(closingCategory ?? '');
}

function commentMentionsRouting(text) {
  const normalized = String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /(^|[^\p{L}\p{N}_])(?:οδευση\s+εγινε|εγινε\s+οδευση)(?=$|[^\p{L}\p{N}_])/u.test(normalized);
}

function commentMentionsCompletedInstallationOrRouting(text) {
  const normalized = String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /(^|[^\p{L}\p{N}_])(?:εγινε\s+(?:οδευση|εγκατασταση)|(?:οδευση|εγκατασταση)\s+εγινε)(?=$|[^\p{L}\p{N}_])/u.test(normalized);
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
  skipCache = new Map(),
}) {
  const currentTime = now();
  const currentMs = currentTime.getTime();
  for (const [key, expiresAt] of skipCache) {
    if (expiresAt <= currentMs) skipCache.delete(key);
  }
  const skip = (storeId, orderId, reason) => {
    summary[reason] += 1;
    skipCache.set(`${storeId}|${orderId}`, currentMs + SKIP_TTL_MS[reason]);
  };
  const cutoverAt = await repository.ensureCutoverAt(currentTime);
  const remappedExisting = await repository.applyCategoryMap(categoryMap, currentTime.toISOString());
  const workDates = fionaDateRange(cutoverAt, currentTime, lookbackDays);
  const summary = {
    stores: stores.length,
    days: workDates.length,
    seen: 0,
    inserted: 0,
    remappedExisting,
    alreadyPresent: 0,
    updatedExisting: 0,
    teamUpdated: 0,
    notCompleted: 0,
    beforeCutover: 0,
    otherStore: 0,
    missingTeam: 0,
    skippedRecently: 0,
    failed: 0,
  };
  const pause = () => wait(Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs);
  const storesById = new Map(stores.map((store) => [store.storeId, store]));

  summary.remappedObsolete = 0;
  for (const job of await repository.getJobsWithObsoleteCategory()) {
    const store = storesById.get(job.storeId);
    const client = store && (clients instanceof Map ? clients.get(store.storeId) : clients(store.storeId));
    if (!client) continue;
    try {
      await pause();
      const details = await client.orderDetails(job.orderId);
      const fields = readCategoryFields({}, details, categoryMap);
      if (fields.category && (await repository.remapObsoleteJob(
        job.storeId,
        job.orderId,
        fields.category.id,
        fields.sourceCategoryId,
        currentTime.toISOString(),
      ))) summary.remappedObsolete += 1;
    } catch (error) {
      if (error.isDatabaseError) throw error;
      summary.failed += 1;
    }
  }
  for (const job of await repository.getJobsNeedingScoring(PROJECT_TRACKER_SCORING_RULE_VERSION)) {
    const store = storesById.get(job.storeId);
    if (!store) continue;
    const client = clients instanceof Map ? clients.get(store.storeId) : clients(store.storeId);
    if (!client) continue;

    let details;
    try {
      await pause();
      details = await client.orderDetails(job.orderId);
    } catch {
      summary.failed += 1;
      continue;
    }

    const closingCategory = readClosingCategory({}, details);
    let pointsOverride = job.pointsOverride;
    if (needsRoutingComment(job.categoryId, closingCategory) || needsCablingComment(job.categoryId)) {
      let comment;
      try {
        await pause();
        comment = await client.fetchLatestCommentWithSession(job.orderId);
      } catch {
        summary.failed += 1;
        continue;
      }
      pointsOverride = needsCablingComment(job.categoryId)
        ? (commentMentionsCompletedInstallationOrRouting(comment?.text) ? CABLING_COMPLETED_POINTS : null)
        : (commentMentionsRouting(comment?.text) ? null : FTTH_PARTIAL_POINTS);
    } else if (isSuccessfulVisit(job.categoryId, closingCategory)) {
      pointsOverride = null;
    }

    const sourceCategoryId = readCategoryFields({}, details, categoryMap).sourceCategoryId
      || job.sourceCategoryId;
    if (await repository.updateJobScoring(
      job.storeId,
      job.orderId,
      pointsOverride,
      currentTime.toISOString(),
      sourceCategoryId,
      PROJECT_TRACKER_SCORING_RULE_VERSION,
    )) summary.updatedExisting += 1;
  }

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
        const existingJob = await repository.getJob(store.storeId, orderId);
        if (existingJob) {
          summary.alreadyPresent += 1;
          const teamGroupName = fieldText(order?.teamGroupName);
          if (teamGroupName && existingJob.teamName === teamGroupName) {
            let details;
            try {
              await pause();
              details = await client.orderDetails(orderId);
            } catch {
              summary.failed += 1;
              continue;
            }
            const assignedTeamName = cleanTeamName(order?.teamName)
              || cleanTeamName(findOrderField(details, 'teamName'));
            if (assignedTeamName
              && (await repository.updateJobTeamName(store.storeId, orderId, assignedTeamName))) {
              summary.teamUpdated += 1;
            }
          }
          continue;
        }

        if (skipCache.has(`${store.storeId}|${orderId}`)) {
          summary.skippedRecently += 1;
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
            skip(store.storeId, orderId, 'otherStore');
            continue;
          }
        }

        const completed = buildClosedTicketRecord(order, details, {}, null, currentTime);
        if (!completed) {
          skip(store.storeId, orderId, 'notCompleted');
          continue;
        }
        if (completed.closed_at < cutoverAt) {
          skip(store.storeId, orderId, 'beforeCutover');
          continue;
        }

        const teamName = cleanTeamName(order?.teamName)
          || cleanTeamName(findOrderField(details, 'teamName'));
        if (!teamName) {
          summary.missingTeam += 1;
          continue;
        }
        const categoryFields = readCategoryFields(order, details, categoryMap);
        let pointsOverride = null;
        const closingCategory = readClosingCategory(order, details);
        if (needsRoutingComment(categoryFields.category?.id, closingCategory)
          || needsCablingComment(categoryFields.category?.id)) {
          let comment;
          try {
            await pause();
            comment = await client.fetchLatestCommentWithSession(orderId);
          } catch {
            summary.failed += 1;
            continue;
          }
          if (needsCablingComment(categoryFields.category?.id)) {
            if (commentMentionsCompletedInstallationOrRouting(comment?.text)) pointsOverride = CABLING_COMPLETED_POINTS;
          } else if (!commentMentionsRouting(comment?.text)) {
            pointsOverride = FTTH_PARTIAL_POINTS;
          }
        } else if (isSuccessfulVisit(categoryFields.category?.id, closingCategory)) {
          pointsOverride = null;
        }
        if (await repository.insertJob({
          pointsOverride,
          storeId: store.storeId,
          orderId,
          teamName,
          closedAt: completed.closed_at,
          sourceLabel: categoryFields.sourceLabel,
          sourceCategoryId: categoryFields.sourceCategoryId,
          categoryId: categoryFields.category?.id ?? null,
          scoringVersion: PROJECT_TRACKER_SCORING_RULE_VERSION,
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
  const skipCache = new Map();
  const status = { lastStartedAt: null, lastCompletedAt: null, lastFailedAt: null, lastSummary: null };

  function syncOnce() {
    if (currentRun) return currentRun;
    status.lastStartedAt = new Date().toISOString();
    currentRun = syncProjectTracker({ skipCache, ...options })
      .then((summary) => {
        status.lastCompletedAt = new Date().toISOString();
        status.lastSummary = summary;
        return summary;
      }, (error) => {
        status.lastFailedAt = new Date().toISOString();
        throw error;
      })
      .finally(() => { currentRun = null; });
    return currentRun;
  }

  const runAndLog = () => {
    void syncOnce().then((summary) => {
      console.info('Project tracker sync completed:', summary);
    }).catch((error) => {
      console.error('Project tracker sync failed:', error?.message);
    });
  };

  return {
    syncOnce,
    getStatus: () => ({ ...status, running: Boolean(currentRun) }),
    start() {
      if (interval) return;
      runAndLog();
      interval = setInterval(runAndLog, intervalMs);
      interval.unref?.();
    },
    stop() {
      if (interval) clearInterval(interval);
      interval = null;
    },
    // Resolves once any in-flight run settles, so shutdown does not close the database under it.
    async idle() {
      await currentRun?.catch(() => {});
    },
  };
}