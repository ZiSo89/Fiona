import test from 'node:test';
import assert from 'node:assert/strict';
import { greekServiceType } from '../src/features/tickets/serviceTypes.js';

test('maps Fiona work types to the tracker categories', () => {
  const mappings = {
    'FTTH Activation': 'Εγκατάσταση Οπτικής',
    'On-Site Support FTTH': 'Βλάβη Οπτικής',
    'Cabling repair and maintenance': 'Καλωδίωση / νέα εγκατάσταση',
    'FTTH Additional Cabling': 'Διπλό Συνεργείο',
    'CPE Installation FWA': 'Εγκατάσταση 5G',
    'On-Site Support FWA': 'Βλάβη 5G',
    'NGA Activation': 'Εγκατάσταση χαλκού',
    'CPE Installation NGA': 'Εγκατάσταση χαλκού',
    'CPE Installation LLU': 'Εγκατάσταση χαλκού',
    'On-Site Support NGA': 'Βλάβη χαλκού',
    'On-Site Support LLU': 'Βλάβη χαλκού',
    'SI Bridging': 'Βλάβη χαλκού',
    'CO Visit': 'Βλάβη χαλκού',
    'CPE Installation DTH TV': 'Εγκατάσταση Δορυφορικής',
    'On-Site Support DTH TV': 'Βλάβη Δορυφορικής',
    'CPE Installation': 'Εγκατάσταση EON',
    'Combined Wind-AP': 'Συνδυαστικό',
    'Combined Visit OTE-WIND': 'Συνδυαστικό',
    'Combined LLU Visit OTE-WIND': 'Συνδυαστικό',
  };

  for (const [source, category] of Object.entries(mappings)) {
    assert.equal(greekServiceType(source), category, source);
  }
});

test('keeps unknown Fiona work types untranslated', () => {
  assert.equal(greekServiceType('Unknown service'), null);
});
