import { useEffect, useState } from 'react';
import { COMPLETE_SECTION_KEY, COMPLETE_MONTH_KEY, currentMonth, readCompleteSection, readCompleteMonth, shiftMonth, monthLabel } from './closedTicketFormat.js';
import { ClosedList } from './ClosedTicketList.jsx';
import { StatsSections } from './ClosedTicketStats.jsx';

export default function CompleteView({ storeId, stores, searchQuery }) {
  const [month, setMonth] = useState(readCompleteMonth);
  const [section, setSection] = useState(readCompleteSection);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    window.sessionStorage.setItem(COMPLETE_SECTION_KEY, section);
  }, [section]);

  useEffect(() => {
    window.sessionStorage.setItem(COMPLETE_MONTH_KEY, month);
  }, [month]);

  useEffect(() => {
    if (searchQuery.trim()) setSection('list');
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();
    setStats(null);
    setError(false);
    fetch(`/api/closed-tickets/stats?month=${month}&store=${encodeURIComponent(storeId)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.status))))
      .then(setStats)
      .catch((reason) => { if (reason.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [month, storeId]);

  const isCurrent = month >= currentMonth();

  return (
    <main className="stats-main">
      <div className="month-nav">
        <button type="button" aria-label="Προηγούμενος μήνας" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <div className="month-nav-label">
          <h2>{monthLabel(month)}</h2>
          {stats && <span>{stats.totals.total} {stats.totals.total === 1 ? 'εργασία' : 'εργασίες'}</span>}
        </div>
        <button type="button" aria-label="Επόμενος μήνας" disabled={isCurrent} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>

      <div className="view-switch" role="tablist" aria-label="Προβολή ολοκληρωμένων">
        <button type="button" role="tab" aria-selected={section === 'list'} className={section === 'list' ? 'active' : ''} onClick={() => setSection('list')}>Ολοκληρωμένα</button>
        <button type="button" role="tab" aria-selected={section === 'stats'} className={section === 'stats' ? 'active' : ''} onClick={() => setSection('stats')}>Στατιστικά</button>
      </div>

      {error && <p className="empty-state">Δεν φορτώθηκαν τα δεδομένα. Ελέγξτε ότι το backend τρέχει.</p>}
      {!stats && !error && <div className="kpi-grid" aria-busy="true">{[0, 1, 2, 3].map((slot) => <div key={slot} className="kpi skeleton-kpi" />)}</div>}
      {stats && stats.totals.total === 0 && <p className="empty-state">Δεν υπάρχουν κλεισμένες εργασίες αυτόν τον μήνα.</p>}
      {stats && <datalist id="closed-ticket-suggestions">{[...new Set(stats.closedTickets.flatMap((ticket) => [
        ticket.serviceOrderId,
        ticket.customer,
        ticket.address,
        ticket.service,
        ticket.team,
      ].filter(Boolean).map(String)))].map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist>}
      {stats && stats.totals.total > 0 && (section === 'list'
        ? <ClosedList tickets={stats.closedTickets} stores={stores} query={searchQuery} />
        : <StatsSections stats={stats} stores={stores} />)}
    </main>
  );
}
