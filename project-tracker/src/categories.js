import {
  Cable,
  Copy,
  Package,
  Router,
  Satellite,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react';

export const categoryGroups = [
  { id: 'installation', label: 'Εγκαταστάσεις' },
  { id: 'impairment', label: 'Βλάβες' },
  { id: 'other', label: 'Άλλες εργασίες' },
];

// selectable: false keeps the category displayable for existing jobs without offering it in the picker.
export const categories = [
  { id: 'ftth_installation', label: 'Εγκατάσταση Οπτικής', source: 'FTTH Activation', points: 50, group: 'installation', Icon: Zap },
  { id: 'fwa_installation', label: 'Εγκατάσταση 5G', source: 'CPE Installation FWA', points: 35, group: 'installation', Icon: Wifi },
  { id: 'dth_tv_installation', label: 'Εγκατάσταση Δορυφορικής', source: 'CPE Installation DTH TV', points: 25, group: 'installation', Icon: Satellite },
  { id: 'canceled_eon_installation', label: 'Εγκατάσταση EON', source: 'CPE Installation', points: 5, group: 'installation', Icon: Router },
  { id: 'ftth_impairment', label: 'Βλάβη Οπτικής', source: 'On-Site Support FTTH', points: 15, group: 'impairment', Icon: Wrench },
  { id: 'fwa_impairment', label: 'Βλάβη 5G', source: 'On-Site Support FWA', points: 15, group: 'impairment', Icon: Wrench },
  { id: 'dth_tv_impairment', label: 'Βλάβη Δορυφορικής', source: 'On-Site Support DTH TV', points: 18, group: 'impairment', Icon: Wrench },
  { id: 'copper_installation', label: 'Εγκατάσταση χαλκού', source: 'NGA Activation, CPE Installation NGA / LLU', points: 15, group: 'installation', Icon: Router },
  { id: 'copper_impairment', label: 'Βλάβη χαλκού', source: 'On-Site Support NGA / LLU, SI Bridging, CO Visit', points: 15, group: 'impairment', Icon: Wrench },
  { id: 'combined_work', label: 'Συνδιαστικό', source: 'Combined Wind-AP / OTE-WIND', points: 15, group: 'other', Icon: Package },
  { id: 'other_works', label: 'Άλλες εργασίες', source: 'Λοιπές εργασίες', points: 5, group: 'other', Icon: Package },
  { id: 'cabling_repair', label: 'Καλωδίωση / νέα εγκατάσταση', source: 'Cabling repair and maintenance', points: 15, group: 'other', Icon: Cable },
  { id: 'double_team', label: 'Διπλό Συνεργείο', source: 'Μόνο χειροκίνητη επιλογή', points: 100, group: 'other', Icon: Copy },
  { id: 'soho_installation_impairment', label: 'SOHO', source: 'SOHO Installation / Impairment', points: 20, group: 'other', Icon: Package, selectable: false },
];

export function categoryLabel(categoryId, fallback) {
  return categories.find((category) => category.id === categoryId)?.label || fallback || 'Χωρίς αντιστοίχιση';
}

// Explains why a job's points differ from its category's base points.
export function pointsNote(job) {
  const base = categories.find((category) => category.id === job.categoryId)?.points;
  if (!job.mapped || base === undefined || job.points === base) return '';
  if (job.correctedAt) return `Πόντοι προσαρμοσμένοι χειροκίνητα (βασικοί ${base})`;
  if (job.categoryId === 'cabling_repair' && job.points === 50) return 'Ολοκληρώθηκε εγκατάσταση ή όδευση';
  return `${job.points} από ${base} πόντους, δεν έγινε η όδευση`;
}
