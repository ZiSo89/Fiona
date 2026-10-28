const GREEK_SERVICE_TYPES = {
  'ftth activation': 'Εγκατάσταση Οπτικής',
  'on-site support ftth': 'Βλάβη Οπτικής',
  'cpe installation fwa': 'Εγκατάσταση 5G',
  'on-site support fwa': 'Βλάβη 5G',
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
  'co visit': 'Βλάβη χαλκού',
  'cabling repair and maintenance': 'Καλωδίωση / νέα εγκατάσταση',
  'ftth additional cabling': 'Διπλό Συνεργείο',
};

export function greekServiceType(title) {
  return GREEK_SERVICE_TYPES[String(title ?? '').trim().replace(/\s+/g, ' ').toLowerCase()] ?? null;
}
