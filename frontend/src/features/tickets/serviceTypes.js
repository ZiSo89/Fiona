const GREEK_SERVICE_TYPES = {
  'ftth activation': 'Εγκατάσταση οπτικής (FTTH)',
  'on-site support ftth': 'Βλάβη οπτικής (FTTH)',
  'cpe installation fwa': 'Εγκατάσταση 5G (FWA)',
  'on-site support fwa': 'Βλάβη 5G (FWA)',
  'nga activation': 'Σύνδεση χαλκού',
  'on-site support nga': 'Βλάβη χαλκού',
  'on-site support llu': 'Βλάβη χαλκού',
  'si bridging': 'Βλάβη χαλκού',
  'cpe installation nga': 'Εγκατάσταση router',
  'cpe installation llu': 'Εγκατάσταση router',
  'cpe installation': 'Εγκατάσταση EON',
  'cpe installation dth tv': 'Δορυφορική: εγκατάσταση',
  'on-site support dth tv': 'Δορυφορική: βλάβη',
  'combined wind-ap': 'Συνδυαστικό',
  'combined visit ote-wind': 'Συνδυαστικό',
  'combined llu visit ote-wind': 'Συνδυαστικό',
  'co visit': 'Καμπίνα (CO Visit)',
  'cabling repair and maintenance': 'Νέα εγκατάσταση / επισκευή καλωδίωσης',
};

export function greekServiceType(title) {
  return GREEK_SERVICE_TYPES[String(title ?? '').trim().replace(/\s+/g, ' ').toLowerCase()] ?? null;
}
