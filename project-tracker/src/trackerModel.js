import { categories, categoryLabel } from './categories.js';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Athens',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const monthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Athens',
  year: 'numeric',
  month: '2-digit',
});
const visibleDateFormatter = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens',
  day: 'numeric',
  month: 'long',
  weekday: 'long',
});
const commentTimeFormatter = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function profileKey(profile) {
  return `${profile.storeId}::${profile.teamName}`;
}

export function jobKey(job) {
  return `${job.storeId}::${job.orderId}`;
}

export function applyJobDraft(job, draft) {
  if (!draft) return job;
  const categoryId = draft.categoryId || null;
  const category = categories.find((entry) => entry.id === categoryId);
  const pointsOverride = draft.pointsOverride === undefined ? job.pointsOverride : draft.pointsOverride;
  return {
    ...job,
    categoryId,
    categoryName: category?.label ?? null,
    pointsOverride,
    points: pointsOverride ?? category?.points ?? 0,
    mapped: Boolean(category),
  };
}

export function updateMonthJob(monthData, previousJob, nextJob) {
  if (!monthData || !previousJob || !nextJob) return monthData;
  const previousCategoryId = previousJob.categoryId || null;
  const nextCategoryId = nextJob.categoryId || null;
  const categoriesById = new Map(monthData.categories.map((entry) => [entry.categoryId || 'unmapped', { ...entry }]));
  const previousKey = previousCategoryId || 'unmapped';
  const nextKey = nextCategoryId || 'unmapped';
  if (previousKey === nextKey) {
    const entry = categoriesById.get(previousKey);
    if (entry) entry.points += nextJob.points - previousJob.points;
  } else {
    const previousEntry = categoriesById.get(previousKey);
    if (previousEntry) {
      previousEntry.jobCount -= 1;
      previousEntry.points -= previousJob.points;
      if (previousEntry.jobCount === 0) categoriesById.delete(previousKey);
    }
    const category = categories.find((entry) => entry.id === nextCategoryId);
    const nextEntry = categoriesById.get(nextKey) || {
      categoryId: nextCategoryId,
      categoryName: category?.label ?? 'Χωρίς αντιστοίχιση',
      jobCount: 0,
      points: 0,
      mapped: Boolean(category),
    };
    nextEntry.jobCount += 1;
    nextEntry.points += nextJob.points;
    categoriesById.set(nextKey, nextEntry);
  }
  const categoryOrder = new Map(categories.map((entry, index) => [entry.id, index]));
  return {
    ...monthData,
    totalPoints: monthData.totalPoints + nextJob.points - previousJob.points,
    categories: [...categoriesById.values()].sort((left, right) => (
      (categoryOrder.get(left.categoryId) ?? Number.MAX_SAFE_INTEGER)
      - (categoryOrder.get(right.categoryId) ?? Number.MAX_SAFE_INTEGER)
    )),
    days: monthData.days.map((day) => day.date === dayFormatter.format(new Date(previousJob.closedAt))
      ? { ...day, points: day.points + nextJob.points - previousJob.points }
      : day),
  };
}

// Keeps the card in view after the picker collapses and the page height shrinks.
export function scrollToJob(key) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const card = [...document.querySelectorAll('[data-job-key]')].find((node) => node.dataset.jobKey === key);
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }));
}

export function readTrackerView() {
  try {
    const saved = JSON.parse(localStorage.getItem('project-tracker-view') || '{}');
    return {
      profileKey: typeof saved.profileKey === 'string' ? saved.profileKey : '',
      month: /^\d{4}-\d{2}$/.test(saved.month) ? saved.month : '',
      date: /^\d{4}-\d{2}-\d{2}$/.test(saved.date) ? saved.date : '',
    };
  } catch {
    return { profileKey: '', month: '', date: '' };
  }
}

export function currentAthensDate() {
  const parts = Object.fromEntries(dayFormatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function currentAthensMonth() {
  return monthFormatter.format(new Date());
}

export function getMonthTitle(month) {
  const formatted = new Intl.DateTimeFormat('el-GR', {
    timeZone: 'Europe/Athens',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T12:00:00.000Z`));
  return `${formatted.charAt(0).toLocaleUpperCase('el-GR')}${formatted.slice(1)}`;
}

export function shiftMonth(month, amount) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + amount, 1)).toISOString().slice(0, 7);
}

// Greek calendars start the week on Monday.
export const WEEKDAY_LABELS = ['ΔΕΥ', 'ΤΡΙ', 'ΤΕΤ', 'ΠΕΜ', 'ΠΑΡ', 'ΣΑΒ', 'ΚΥΡ'];

export function calendarCells(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const total = Math.ceil((firstDay + dayCount) / 7) * 7;
  return Array.from({ length: total }, (_, index) => {
    const day = index - firstDay + 1;
    return day < 1 || day > dayCount ? null : `${month}-${String(day).padStart(2, '0')}`;
  });
}

export function formatDate(value) {
  return visibleDateFormatter.format(new Date(`${value}T12:00:00.000Z`));
}

const greekServiceTypes = {
  'ftth activation': 'Εγκατάσταση Οπτικής (FTTH)',
  'on-site support ftth': 'Βλάβη Οπτικής (FTTH)',
  'cpe installation fwa': 'Εγκατάσταση 5G (FWA)',
  'on-site support fwa': 'Βλάβη 5G (FWA)',
  'nga activation': 'Εγκατάσταση χαλκού',
  'on-site support nga': 'Βλάβη χαλκού',
  'on-site support llu': 'Βλάβη χαλκού',
  'si bridging': 'Βλάβη χαλκού',
  'cpe installation nga': 'Εγκατάσταση χαλκού',
  'cpe installation llu': 'Εγκατάσταση χαλκού',
  'cpe installation': 'Εγκατάσταση EON',
  'cpe installation dth tv': 'Εγκατάσταση Δορυφορικής',
  'on-site support dth tv': 'Βλάβη Δορυφορικής',
  'combined wind-ap': 'Συνδυαστικό',
  'combined visit ote-wind': 'Συνδυαστικό',
  'combined llu visit ote-wind': 'Συνδυαστικό',
  'co visit': 'Βλάβη χαλκού (CO Visit)',
  'cabling repair and maintenance': 'Νέα εγκατάσταση / επισκευή καλωδίωσης',
};

export function jobLabel(job) {
  return job.fionaCategory || job.sourceLabel || job.categoryName || 'Αντιστοίχιση κατηγορίας';
}

export function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : commentTimeFormatter.format(date);
}

export async function trackerRequest(path, options = {}) {
  const response = await fetch(`/api/tracker${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Το αίτημα απέτυχε (${response.status}). Δοκίμασε ξανά.`);
  return data;
}

export function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

// Plain HTTP on a phone has no navigator.clipboard, so fall back to execCommand.
export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    if (!copied) throw new Error('copy failed');
  }
}

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

// Semicolons and a BOM let Greek Excel open the file with the right columns and characters.
export function overviewCsv(month, teams) {
  const header = ['Μήνας', 'Κατάστημα', 'Συνεργείο', 'Εργασίες', 'Πόντοι', 'Εκκρεμή', 'Εγκεκριμένο'];
  const rows = teams.map((team) => [
    month,
    team.storeName,
    team.teamName,
    team.jobCount,
    team.points,
    team.pendingCount,
    team.paymentLock?.locked ? 'Ναι' : 'Όχι',
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

export function jobGreekLabel(job) {
  const english = String(jobLabel(job)).trim().replace(/\s+/g, ' ').toLowerCase();
  return greekServiceTypes[english] || (job.categoryId ? categoryLabel(job.categoryId) : '');
}
