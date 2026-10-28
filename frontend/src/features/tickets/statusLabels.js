// Fiona statuses stay in English in the data; the interface shows them in Greek.
const STATUS_LABELS = {
  ALL: 'Όλα',
  OPEN: 'Ανοιχτό',
  'TO CALL': 'Προς κλήση',
  'CALL LATER': 'Κλήση αργότερα',
  APPOINTMENT: 'Ραντεβού',
  COMPLETED: 'Ολοκληρώθηκε',
  COMPLETE: 'Ολοκληρωμένα',
};

const FILTER_LABELS = {
  ALL: 'Όλα',
  OPEN: 'Ανοιχτά',
  'TO CALL': 'Προς κλήση',
  'CALL LATER': 'Κλήση αργότερα',
  APPOINTMENT: 'Ραντεβού',
  COMPLETE: 'Ολοκληρωμένα',
};

export const statusLabel = (status) => STATUS_LABELS[String(status ?? '').trim().toUpperCase()] || status;
export const filterLabel = (filter) => FILTER_LABELS[filter] || statusLabel(filter);
