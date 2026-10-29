const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// `sources` are the Fiona work-order types that map automatically to the category.
// Categories with `selectable: false` still map and score, but are not offered in the editor picker.
export const PROJECT_TRACKER_CATEGORIES = [
  { id: 'ftth_installation', name: 'FTTH Installation', points: 50, sources: ['FTTH Activation'] },
  { id: 'fwa_installation', name: 'FWA Installation', points: 35, sources: ['CPE Installation FWA'] },
  { id: 'dth_tv_installation', name: 'DTH TV Installation', points: 25, sources: ['CPE Installation DTH TV'] },
  { id: 'canceled_eon_installation', name: 'EON Installation', points: 5, sources: ['CPE Installation'] },
  { id: 'ftth_impairment', name: 'FTTH Impairment', points: 15, sources: ['On-Site Support FTTH'] },
  { id: 'fwa_impairment', name: 'FWA Impairment', points: 15, sources: ['On-Site Support FWA'] },
  { id: 'dth_tv_impairment', name: 'DTH TV Impairment', points: 18, sources: ['On-Site Support DTH TV'] },
  {
    id: 'copper_installation',
    name: 'Copper Installation',
    points: 15,
    sources: ['NGA Activation', 'CPE Installation NGA', 'CPE Installation LLU'],
  },
  {
    id: 'copper_impairment',
    name: 'Copper Impairment',
    points: 15,
    sources: ['On-Site Support NGA', 'On-Site Support LLU', 'SI Bridging', 'CO Visit'],
  },
  {
    id: 'combined_work',
    name: 'Combined Work',
    points: 15,
    sources: ['Combined Wind-AP', 'Combined Visit OTE-WIND', 'Combined LLU Visit OTE-WIND'],
  },
  {
    id: 'other_works',
    name: 'Other Works',
    points: 5,
  },
  {
    id: 'cabling_repair',
    name: 'Cabling Repair and Maintenance',
    points: 15,
    sources: ['Cabling repair and maintenance'],
    selectable: false,
  },
  { id: 'double_team', name: 'Double Team', points: 100, manualOnly: true },
  { id: 'soho_installation_impairment', name: 'SOHO Installation / Impairment', points: 20, selectable: false },
];

const categoriesById = new Map(PROJECT_TRACKER_CATEGORIES.map((category) => [category.id, category]));
const categoriesByName = new Map();
for (const category of PROJECT_TRACKER_CATEGORIES) {
  if (category.manualOnly) continue;
  for (const label of [category.name, ...(category.sources ?? [])]) categoriesByName.set(normalize(label), category);
}

export function getProjectTrackerCategory(categoryId) {
  return categoriesById.get(categoryId) ?? null;
}

function sourceCategoryLabel(row) {
  const tokens = String(row.source_category_id ?? '').split('|').map((token) => token.trim()).filter(Boolean);
  const specific = tokens.find((token) => /^(On-Site Support|FTTH Activation|NGA Activation|CPE Installation|DTH TV|FWA Installation|Combined|CO Visit|SI Bridging|Cabling)/i.test(token));
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
  const normalizedMap = new Map(Object.entries(sourceMap).map(([sourceValue, categoryId]) => {
    const category = getProjectTrackerCategory(categoryId);
    return [normalize(sourceValue), category && !category.manualOnly ? category.id : null];
  }));
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
    pointsOverrideManual: Boolean(row.points_override_manual),
    points: row.points_override ?? category?.points ?? 0,
    mapped: Boolean(category),
    importedAt: row.imported_at,
    correctedAt: row.corrected_at,
  };
}