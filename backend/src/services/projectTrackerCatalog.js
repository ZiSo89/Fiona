const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export const PROJECT_TRACKER_CATEGORIES = [
  { id: 'ftth_installation', name: 'FTTH Installation', points: 50 },
  { id: 'soho_installation_impairment', name: 'SOHO Installation / Impairment', points: 20 },
  { id: 'fwa_installation', name: 'FWA Installation', points: 35 },
  { id: 'dth_tv_impairment', name: 'DTH TV Impairment', points: 18 },
  { id: 'dth_tv_installation', name: 'DTH TV Installation', points: 25 },
  { id: 'all_impairments', name: 'All Impairments', points: 15 },
  { id: 'copper_installation', name: 'Copper Installation', points: 15 },
  { id: 'canceled_eon_installation', name: 'Canceled / EON Installation', points: 5 },
];

const categoriesById = new Map(PROJECT_TRACKER_CATEGORIES.map((category) => [category.id, category]));
const categoriesByName = new Map(PROJECT_TRACKER_CATEGORIES.map((category) => [normalize(category.name), category]));

export function getProjectTrackerCategory(categoryId) {
  return categoriesById.get(categoryId) ?? null;
}

function sourceCategoryLabel(row) {
  const tokens = String(row.source_category_id ?? '').split('|').map((token) => token.trim()).filter(Boolean);
  const specific = tokens.find((token) => /^(On-Site Support|FTTH Activation|NGA Activation|CPE Installation|DTH TV|FWA Installation)/i.test(token));
  return specific || String(row.source_label ?? '').trim() || null;
}

export function matchProjectTrackerCategory(...values) {
  for (const value of values) {
    const category = categoriesByName.get(normalize(value));
    if (category) return category;
  }
  return null;
}

export function mapProjectTrackerCategory(sourceMap = {}, ...values) {
  const normalizedMap = new Map(Object.entries(sourceMap).map(([sourceValue, categoryId]) => (
    [normalize(sourceValue), getProjectTrackerCategory(categoryId)?.id ?? null]
  )));
  for (const value of values) {
    const categoryId = normalizedMap.get(normalize(value));
    if (categoryId) return getProjectTrackerCategory(categoryId);
  }
  return matchProjectTrackerCategory(...values);
}

export function projectTrackerJobFromRow(row) {
  const category = getProjectTrackerCategory(row.category_id);
  return {
    storeId: row.store_id,
    orderId: row.order_id,
    teamName: row.team_name,
    closedAt: row.closed_at,
    sourceLabel: row.source_label,
    fionaCategory: sourceCategoryLabel(row),
    sourceCategoryId: row.source_category_id,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    pointsOverride: row.points_override,
    points: row.points_override ?? category?.points ?? 0,
    mapped: Boolean(category),
    importedAt: row.imported_at,
    correctedAt: row.corrected_at,
  };
}