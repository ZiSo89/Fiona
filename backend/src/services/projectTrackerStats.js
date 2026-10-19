import { athensMonthOf } from './closedTicketStats.js';
import { getProjectTrackerCategory, PROJECT_TRACKER_CATEGORIES } from './projectTrackerCatalog.js';

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

export function buildProjectTrackerMonth(month, jobs) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) throw new Error('month must use YYYY-MM');
  const monthJobs = jobs.filter((job) => athensMonthOf(job.closedAt) === month);
  const categoryTotals = new Map();
  const dayTotals = new Map();

  for (const job of monthJobs) {
    const category = getProjectTrackerCategory(job.categoryId);
    const categoryKey = category?.id ?? 'unmapped';
    const categoryTotal = categoryTotals.get(categoryKey) ?? {
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? 'Needs category mapping',
      jobCount: 0,
      points: 0,
      mapped: Boolean(category),
    };
    categoryTotal.jobCount += 1;
    categoryTotal.points += job.points;
    categoryTotals.set(categoryKey, categoryTotal);

    const day = athensDayOf(job.closedAt);
    const dayTotal = dayTotals.get(day) ?? { date: day, jobCount: 0, points: 0 };
    dayTotal.jobCount += 1;
    dayTotal.points += job.points;
    dayTotals.set(day, dayTotal);
  }

  const categoryOrder = new Map(PROJECT_TRACKER_CATEGORIES.map((category, index) => [category.id, index]));
  return {
    month,
    totalJobs: monthJobs.length,
    totalPoints: monthJobs.reduce((sum, job) => sum + job.points, 0),
    categories: [...categoryTotals.values()].sort((left, right) => (
      (categoryOrder.get(left.categoryId) ?? Number.MAX_SAFE_INTEGER)
      - (categoryOrder.get(right.categoryId) ?? Number.MAX_SAFE_INTEGER)
    )),
    days: [...dayTotals.values()].sort((left, right) => left.date.localeCompare(right.date)),
  };
}