import { useEffect, useMemo, useState } from 'react';
import Icon from './components/Icon.jsx';
import CompleteView from './features/closed-tickets/CompleteView.jsx';
import TicketCard from './features/tickets/TicketCard.jsx';
import { formatDataAge } from './features/tickets/ticketFormatters.js';
import { fallbackTickets } from './features/tickets/fallbackTickets.js';
import { compareTickets, normalizeTicketForUi } from './features/tickets/ticketModel.js';
import {
  ACTIVE_FILTER_KEY,
  ACTIVE_STORE_KEY,
  FILTERS,
  SCROLL_POSITION_KEY,
  clearCachedTickets,
  readActiveFilter,
  readCachedTickets,
  readSelectedStore,
  saveScrollPosition,
  writeCachedTickets,
} from './features/tickets/ticketStorage.js';
import { normalizeSearchText } from './shared/searchUtils.js';

// Demo tickets look real (phones, addresses), so they are only shown while developing locally.
const demoTickets = (storeId) => (import.meta.env.DEV && storeId === 'alexandroupoli'
  ? fallbackTickets.map(normalizeTicketForUi)
  : []);

function App() {
  const [storeId, setStoreId] = useState(readSelectedStore);
  const [stores, setStores] = useState([
    { storeId: 'alexandroupoli', storeName: 'Αλεξανδρούπολη', configured: true },
    { storeId: 'komotini', storeName: 'Κομοτηνή', configured: false },
    { storeId: 'orestiada', storeName: 'Ορεστιάδα', configured: false },
  ]);
  const [tickets, setTickets] = useState(() => readCachedTickets(readSelectedStore())
    || demoTickets(readSelectedStore()));
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [possiblyTruncated, setPossiblyTruncated] = useState(false);
  const [activeFilter, setActiveFilter] = useState(readActiveFilter);
  const [sourceMode, setSourceMode] = useState(() => readCachedTickets(readSelectedStore()) ? 'cached' : demoTickets(readSelectedStore()).length ? 'fallback' : 'empty');
  const [showSearch, setShowSearch] = useState(false);
  const [teamFilter, setTeamFilter] = useState(() => localStorage.getItem('fiona-team-filter') || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    // Countdowns show seconds, so tick every second, but only while the page is visible.
    let clock = null;
    const sync = () => {
      window.clearInterval(clock);
      clock = null;
      if (document.visibilityState === 'hidden') return;
      setNow(Date.now());
      clock = window.setInterval(() => setNow(Date.now()), 1000);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(clock);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(ACTIVE_FILTER_KEY, activeFilter);
  }, [activeFilter]);

  useEffect(() => {
    fetch('/api/stores')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.status))))
      .then((result) => {
        if (Array.isArray(result.stores) && result.stores.length) {
          setStores(result.stores);
          if (storeId !== 'all' && !result.stores.some((store) => store.storeId === storeId && store.configured)) {
            const fallbackStore = result.stores.find((store) => store.storeId === 'alexandroupoli' && store.configured);
            if (fallbackStore) changeStore(fallbackStore.storeId);
          }
        }
      })
      .catch((error) => console.warn('Store list unavailable:', error.message));
  }, []);

  useEffect(() => {
    let saveTimeout;
    const saveAfterScroll = () => {
      window.clearTimeout(saveTimeout);
      saveTimeout = window.setTimeout(saveScrollPosition, 100);
    };
    window.addEventListener('scroll', saveAfterScroll, { passive: true });
    window.addEventListener('pagehide', saveScrollPosition);
    return () => {
      window.clearTimeout(saveTimeout);
      window.removeEventListener('scroll', saveAfterScroll);
      window.removeEventListener('pagehide', saveScrollPosition);
    };
  }, []);

  useEffect(() => {
    if (loading) return undefined;
    const savedPosition = window.sessionStorage.getItem(SCROLL_POSITION_KEY);
    if (savedPosition === null) return undefined;
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, Number(savedPosition)));
    return () => window.cancelAnimationFrame(frame);
  }, [loading]);

  useEffect(() => {
    let current = true;
    const loadTickets = async () => {
      try {
        const response = await fetch(`/api/tickets?store=${encodeURIComponent(storeId)}`);
        if (!response.ok) throw new Error(`Ticket API returned ${response.status}`);
        const result = await response.json();

        const snapshot = result?.data ?? {};
        const list = Array.isArray(snapshot.tickets) ? snapshot.tickets : [];
        const nextTickets = list.map(normalizeTicketForUi);

        if (!current) return;
        if (result?.status === 'error' && nextTickets.length === 0) {
          const cached = readCachedTickets(storeId);
          setTickets(cached || demoTickets(storeId));
          setSourceMode(cached ? 'cached' : demoTickets(storeId).length ? 'fallback' : 'empty');
          setLastUpdated(snapshot?.lastUpdatedAt ?? null);
          return;
        }
        setTickets(nextTickets);
        setSourceMode(result?.status === 'live' ? 'live' : nextTickets.length ? 'stale' : 'empty');

        if (result?.status === 'live') {
          writeCachedTickets(storeId, nextTickets.map((ticket) => ({
            ...ticket.raw,
            storeId: ticket.storeId,
            storeName: ticket.storeName,
          })));
        }
        setLastUpdated(snapshot?.lastUpdatedAt ?? null);
        setPossiblyTruncated(Boolean(snapshot?.possiblyTruncated));
      } catch (error) {
        if (!current) return;
        const cached = readCachedTickets(storeId);
        setSourceMode(cached ? 'cached' : demoTickets(storeId).length ? 'fallback' : 'empty');
        setTickets(cached || demoTickets(storeId));
        console.warn('Using fallback dataset because the backend is unavailable:', error.message);
      } finally {
        if (current) setLoading(false);
      }
    };

    setLoading(true);
    loadTickets();
    const interval = window.setInterval(loadTickets, 60000);
    return () => {
      current = false;
      window.clearInterval(interval);
    };
  }, [storeId, syncTrigger]);

  const filteredTickets = useMemo(() => {
    const query = normalizeSearchText(searchQuery.trim());
    return tickets.filter((ticket) => {
      const matchesStatus = activeFilter === 'ALL' || ticket.status === activeFilter;
      const matchesQuery = !query || [ticket.serviceOrderId, ticket.title, ticket.customerName, ticket.address]
        .some((value) => normalizeSearchText(value).includes(query));
      const matchesTeam = activeFilter !== 'APPOINTMENT' || !teamFilter || ticket.teamName === teamFilter;
      return matchesStatus && matchesQuery && matchesTeam && ticket.status !== 'COMPLETED';
    }).sort(compareTickets);
  }, [activeFilter, searchQuery, teamFilter, tickets]);

  const searchSuggestions = useMemo(() => [...new Set(tickets.flatMap((ticket) => [
    ticket.serviceOrderId,
    ticket.title,
    ticket.customerName,
    ticket.address,
  ].filter(Boolean).map(String)))], [tickets]);

  const teamNames = useMemo(() => [...new Set(tickets.filter((ticket) => ticket.status === 'APPOINTMENT' && ticket.teamName).map((ticket) => ticket.teamName))].sort(), [tickets]);
  const changeTeam = (value) => {
    setTeamFilter(value);
    localStorage.setItem('fiona-team-filter', value);
  };
  const changeStore = (value) => {
    setStoreId(value);
    window.localStorage.setItem(ACTIVE_STORE_KEY, value);
    const cached = readCachedTickets(value);
    setTickets(cached || demoTickets(value));
    setSourceMode(cached ? 'cached' : demoTickets(value).length ? 'fallback' : 'empty');
    setLastUpdated(null);
    setPossiblyTruncated(false);
    setLoading(true);
  };
  const logout = async () => {
    setLoggingOut(true);
    try {
      const response = await fetch('/api/logout', { method: 'POST' });
      if (!response.ok) console.warn(`Logout request returned ${response.status}`);
    } catch (error) {
      console.warn('Unable to end the server session:', error.message);
    } finally {
      clearCachedTickets();
      window.dispatchEvent(new Event('fiona-logged-out'));
      setLoggingOut(false);
    }
  };

  const statusCounts = useMemo(() => Object.fromEntries(
    FILTERS.map((status) => [status, status === 'ALL' ? tickets.filter((ticket) => ticket.status !== 'COMPLETED').length : tickets.filter((ticket) => ticket.status === status).length])
  ), [tickets]);
  const visibleFilters = FILTERS.filter((filter) => filter !== 'TO CALL' || statusCounts[filter] > 0);
  const isComplete = activeFilter === 'COMPLETE';

  return (
    <div className="app-shell">
      <header className="field-header">
        <div className="brand-row">
          <div className="brand-lockup"><img className="brand-mark" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" /><div><h1>Alpha Πληροφορική</h1><p>Fiona Field Service</p></div></div>
          <div className="header-actions">
            <button className={`icon-button ${loading ? 'is-loading' : ''}`} type="button" aria-label={loading ? 'Γίνεται συγχρονισμός' : 'Συγχρονισμός εισιτηρίων'} title={loading ? 'Γίνεται συγχρονισμός' : 'Συγχρονισμός εισιτηρίων'} aria-busy={loading} disabled={loading} onClick={() => { saveScrollPosition(); setLoading(true); setSyncTrigger((value) => value + 1); }}><Icon name="sync" /></button>
            <button className="icon-button" type="button" aria-label="Αναζήτηση" title="Search" onClick={() => setShowSearch((value) => !value)}><Icon name="search" /></button>
            <button className="icon-button" type="button" aria-label="Αποσύνδεση" title="Αποσύνδεση" disabled={loggingOut} onClick={logout}><Icon name="logout" /></button>
          </div>
        </div>
        {showSearch && <label className="search-wrap"><Icon name="search" /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={isComplete ? 'Αναζήτηση πελάτη, διεύθυνσης ή εισιτηρίου' : 'Αναζήτηση εισιτηρίου ή πελάτη'} list={isComplete ? 'closed-ticket-suggestions' : 'ticket-search-suggestions'} /></label>}
        {!isComplete && <datalist id="ticket-search-suggestions">{searchSuggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist>}
        {!isComplete && <div className={`status-line ${sourceMode}`}><span className="status-dot" /><span>{loading ? 'Συγχρονισμός…' : sourceMode === 'live' ? 'Live' : sourceMode === 'stale' || sourceMode === 'cached' ? 'Stale / Cached' : 'Offline'} • {tickets.length} εισιτήρια{lastUpdated ? ` • ${new Date(lastUpdated).toLocaleTimeString('el-GR', { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })}` : ''}{lastUpdated && formatDataAge(lastUpdated, now) ? ` (${formatDataAge(lastUpdated, now)})` : ''}</span><span className="auto-label">auto 60s</span></div>}
        {!isComplete && possiblyTruncated && <p className="truncation-warning" role="status">Η Fiona επέστρεψε το μέγιστο πλήθος εισιτηρίων· ορισμένα μπορεί να λείπουν.</p>}
        <div className="scope-filters">
          <label className="scope-filter">
            <span>Κατάστημα</span>
            <select className="store-select" value={storeId} onChange={(event) => changeStore(event.target.value)}>
              <option value="all">Όλα τα καταστήματα</option>
              {stores.map((store) => <option key={store.storeId} value={store.storeId} disabled={!store.configured}>{store.storeName}{store.configured ? '' : ' · μη ρυθμισμένο'}</option>)}
            </select>
          </label>
          {!isComplete && activeFilter === 'APPOINTMENT' && teamNames.length > 0 && (
            <label className="scope-filter">
              <span>Συνεργείο</span>
              <select className="team-select" value={teamFilter} onChange={(event) => changeTeam(event.target.value)}>
                <option value="">Όλα τα συνεργεία</option>
                {teamNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="filter-row" role="tablist" aria-label="Φίλτρο κατάστασης">
          {visibleFilters.map((filter) => <button key={filter} type="button" role="tab" aria-selected={activeFilter === filter} className={`filter-chip ${activeFilter === filter ? 'active' : ''}`} onClick={() => setActiveFilter(filter)}>{filter === 'ALL' ? 'Όλα' : filter}{filter !== 'COMPLETE' && <span>{statusCounts[filter]}</span>}</button>)}
        </div>
      </header>

      {isComplete ? <CompleteView storeId={storeId} stores={stores} searchQuery={searchQuery} onSearchChange={setSearchQuery} /> : <main className="queue-main">
        <div className="queue-heading"><div><h2>{activeFilter === 'ALL' ? 'Εργασίες πεδίου' : activeFilter}</h2></div><span>{filteredTickets.length} εισιτήρια</span></div>
        <div className="ticket-list">
          {filteredTickets.length === 0 && <p className="empty-state">{sourceMode === 'live' ? 'Δεν υπάρχουν εισιτήρια για αυτό το φίλτρο.' : 'Δεν βρέθηκαν εισιτήρια.'}</p>}
          {filteredTickets.map((ticket) => <TicketCard key={`${ticket.storeId}:${ticket.id}`} ticket={ticket} now={now} showStore={storeId === 'all'} />)}
        </div>
      </main>}

    </div>
  );
}

export default App;
