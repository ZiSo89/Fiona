import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './components/Icon.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';
import CompleteView from './features/closed-tickets/CompleteView.jsx';
import { closedDateLabel, shiftDateKey } from './features/closed-tickets/closedTicketFormat.js';
import TicketCard from './features/tickets/TicketCard.jsx';
import { athensDay, formatDataAge } from './features/tickets/ticketFormatters.js';
import { fallbackTickets } from './features/tickets/fallbackTickets.js';
import { compareTickets, groupAppointmentsByDay, normalizeTicketForUi } from './features/tickets/ticketModel.js';
import { filterLabel } from './features/tickets/statusLabels.js';
import { changeMarker, readTicketChanges, trackTicketChanges } from './features/tickets/ticketChanges.js';
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
import { effectiveTheme, toggleTheme } from './shared/theme.js';
import usePullToRefresh from './shared/usePullToRefresh.js';

// Demo tickets look real (phones, addresses), so they are only shown while developing locally.
const demoTickets = (storeId) => (import.meta.env.DEV && storeId === 'alexandroupoli'
  ? fallbackTickets.map(normalizeTicketForUi)
  : []);

const OPEN_FILTERS = FILTERS.filter((filter) => filter !== 'COMPLETE');
const LAST_OPEN_FILTER_KEY = 'fiona-last-open-filter';
const formatClock = (value) => new Date(value).toLocaleTimeString('el-GR', { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
const serviceFilterKey = (title) => String(title || 'Εισιτήριο').trim().replace(/\s+/g, ' ').toLowerCase();

const LOAD_ERRORS = {
  offline: 'Δεν υπάρχει σύνδεση στο internet.',
  server: 'Δεν υπάρχει σύνδεση με τον server της εφαρμογής.',
  fiona: 'Η Fiona δεν απαντά αυτή τη στιγμή.',
  stale: 'Η Fiona δεν απάντησε στην τελευταία ανανέωση.',
};

function App() {
  const [storeId, setStoreId] = useState(readSelectedStore);
  const [stores, setStores] = useState([
    { storeId: 'alexandroupoli', storeName: 'Αλεξανδρούπολη', configured: true },
  ]);
  const [tickets, setTickets] = useState(() => readCachedTickets(readSelectedStore())
    || demoTickets(readSelectedStore()));
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [possiblyTruncated, setPossiblyTruncated] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [activeFilter, setActiveFilter] = useState(readActiveFilter);
  const [sourceMode, setSourceMode] = useState(() => readCachedTickets(readSelectedStore()) ? 'cached' : demoTickets(readSelectedStore()).length ? 'fallback' : 'empty');
  const [showSearch, setShowSearch] = useState(false);
  const [teamFilter, setTeamFilter] = useState(() => localStorage.getItem('fiona-team-filter') || '');
  const [serviceFilter, setServiceFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [changeItems, setChangeItems] = useState(() => readTicketChanges(readSelectedStore()));
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [loggingOut, setLoggingOut] = useState(false);
  const [theme, setTheme] = useState(effectiveTheme);

  useEffect(() => {
    // Countdowns show seconds in the last hour, so tick every second, but only while the page is visible.
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
    if (activeFilter !== 'COMPLETE') window.sessionStorage.setItem(LAST_OPEN_FILTER_KEY, activeFilter);
  }, [activeFilter]);

  const refresh = useCallback(() => {
    saveScrollPosition();
    setLoading(true);
    setSyncTrigger((value) => value + 1);
  }, []);

  useEffect(() => {
    const onOnline = () => refresh();
    const onOffline = () => setLoadError('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh]);

  useEffect(() => {
    fetch('/api/stores')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.status))))
      .then((result) => {
        if (Array.isArray(result.stores) && result.stores.length) {
          setStores(result.stores);
          if (storeId !== 'all' && !result.stores.some((store) => store.storeId === storeId && store.configured)) {
            const fallbackStore = result.stores.find((store) => store.configured);
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
    const showCachedTickets = () => {
      const cached = readCachedTickets(storeId);
      setTickets(cached || demoTickets(storeId));
      setSourceMode(cached ? 'cached' : demoTickets(storeId).length ? 'fallback' : 'empty');
    };
    const loadTickets = async () => {
      try {
        const response = await fetch(`/api/tickets?store=${encodeURIComponent(storeId)}`);
        if (!response.ok) throw new Error(`Ticket API returned ${response.status}`);
        const result = await response.json();

        const snapshot = result?.data ?? {};
        const list = Array.isArray(snapshot.tickets) ? snapshot.tickets : [];
        const nextTickets = list.map(normalizeTicketForUi);

        if (!current) return;
        setLastUpdated(snapshot?.lastUpdatedAt ?? null);
        if (result?.status === 'error' && nextTickets.length === 0) {
          showCachedTickets();
          setLoadError('fiona');
          return;
        }
        setTickets(nextTickets);
        setSourceMode(result?.status === 'live' ? 'live' : nextTickets.length ? 'stale' : 'empty');
        setLoadError(result?.status === 'live' ? null : 'stale');
        setPossiblyTruncated(Boolean(snapshot?.possiblyTruncated));

        if (result?.status === 'live') {
          writeCachedTickets(storeId, nextTickets.map((ticket) => ({
            ...ticket.raw,
            storeId: ticket.storeId,
            storeName: ticket.storeName,
          })));
          setChangeItems(trackTicketChanges(storeId, nextTickets));
        }
      } catch (error) {
        if (!current) return;
        showCachedTickets();
        setLoadError(navigator.onLine === false ? 'offline' : 'server');
        console.warn('Using cached tickets because the backend is unavailable:', error.message);
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

  const pull = usePullToRefresh(refresh, loading);

  const openTickets = useMemo(() => tickets.filter((ticket) => ticket.status !== 'COMPLETED'), [tickets]);
  const serviceTickets = useMemo(() => openTickets.filter((ticket) => {
    const matchesStatus = activeFilter === 'ALL' || ticket.status === activeFilter;
    const matchesTeam = activeFilter !== 'APPOINTMENT' || !teamFilter || ticket.teamName === teamFilter;
    return matchesStatus && matchesTeam;
  }), [activeFilter, teamFilter, openTickets]);
  const serviceFilters = useMemo(() => {
    const options = new Map();
    serviceTickets.forEach((ticket) => {
      const label = String(ticket.title || '').trim() || 'Εισιτήριο';
      const key = serviceFilterKey(label);
      const option = options.get(key);
      if (option) option.count += 1;
      else options.set(key, { key, label, count: 1 });
    });
    return [{ key: '', label: 'Όλες', count: serviceTickets.length }, ...options.values()];
  }, [serviceTickets]);

  const filteredTickets = useMemo(() => {
    const query = normalizeSearchText(searchQuery.trim());
    return serviceTickets.filter((ticket) => {
      const matchesQuery = !query || [ticket.serviceOrderId, ticket.title, ticket.customerName, ticket.address]
        .some((value) => normalizeSearchText(value).includes(query));
      const matchesService = !serviceFilter || serviceFilterKey(ticket.title) === serviceFilter;
      return matchesQuery && matchesService;
    }).sort(compareTickets);
  }, [searchQuery, serviceFilter, serviceTickets]);

  const appointmentGroups = useMemo(() => activeFilter === 'APPOINTMENT'
    ? groupAppointmentsByDay(filteredTickets)
    : [], [activeFilter, filteredTickets]);
  const todayKey = athensDay(now);
  const yesterdayKey = shiftDateKey(todayKey, -1);

  const searchSuggestions = useMemo(() => [...new Set(tickets.flatMap((ticket) => [
    ticket.serviceOrderId,
    ticket.title,
    ticket.customerName,
    ticket.address,
  ].filter(Boolean).map(String)))], [tickets]);

  const teamNames = useMemo(() => [...new Set(tickets.filter((ticket) => ticket.status === 'APPOINTMENT' && ticket.teamName).map((ticket) => ticket.teamName))].sort(), [tickets]);
  const changeTeam = (value) => {
    setTeamFilter(value);
    setServiceFilter('');
    localStorage.setItem('fiona-team-filter', value);
  };
  function changeStore(value) {
    setStoreId(value);
    window.localStorage.setItem(ACTIVE_STORE_KEY, value);
    const cached = readCachedTickets(value);
    setTickets(cached || demoTickets(value));
    setSourceMode(cached ? 'cached' : demoTickets(value).length ? 'fallback' : 'empty');
    setChangeItems(readTicketChanges(value));
    setLastUpdated(null);
    setPossiblyTruncated(false);
    setLoadError(null);
    setSearchQuery('');
    setServiceFilter('');
    setLoading(true);
  }
  const logout = async () => {
    if (!window.confirm('Αποσύνδεση; Τα εισιτήρια που είναι αποθηκευμένα σε αυτή τη συσκευή θα διαγραφούν.')) return;
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
  const showOpen = () => {
    setServiceFilter('');
    setActiveFilter(window.sessionStorage.getItem(LAST_OPEN_FILTER_KEY) || 'ALL');
  };
  const changeStatusFilter = (value) => {
    setServiceFilter('');
    setActiveFilter(value);
  };

  const statusCounts = useMemo(() => Object.fromEntries(
    OPEN_FILTERS.map((status) => [status, status === 'ALL' ? openTickets.length : openTickets.filter((ticket) => ticket.status === status).length])
  ), [openTickets]);
  const visibleFilters = OPEN_FILTERS.filter((filter) => filter !== 'TO CALL' || statusCounts[filter] > 0);
  const isComplete = activeFilter === 'COMPLETE';
  const configuredStores = stores.filter((store) => store.configured);
  const statusText = loading ? 'Συγχρονισμός…' : sourceMode === 'live' ? 'Ενημερωμένο' : sourceMode === 'stale' || sourceMode === 'cached' ? 'Παλιά δεδομένα' : 'Χωρίς δεδομένα';
  const dataAge = lastUpdated ? formatDataAge(lastUpdated, now) : null;
  return (
    <div className="app-shell">
      <UpdateBanner />
      {pull.distance > 0 && (
        <div className={`pull-indicator${pull.ready ? ' ready' : ''}`} style={{ height: pull.distance }} aria-hidden="true">
          <Icon name="sync" size={18} /><span>{pull.ready ? 'Άφησε για ανανέωση' : 'Τράβηξε για ανανέωση'}</span>
        </div>
      )}
      <header className="field-header">
        <div className="brand-row">
          <div className="brand-lockup"><img className="brand-mark" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" /><div><h1>Alpha Πληροφορική</h1><p>Εισιτήρια πεδίου Fiona</p></div></div>
          <div className="header-actions">
            <button className={`icon-button ${loading ? 'is-loading' : ''}`} type="button" aria-label={loading ? 'Γίνεται συγχρονισμός' : 'Συγχρονισμός εισιτηρίων'} title={loading ? 'Γίνεται συγχρονισμός' : 'Συγχρονισμός εισιτηρίων'} aria-busy={loading} disabled={loading} onClick={refresh}><Icon name="sync" /></button>
            <button className={`icon-button ${showSearch ? 'is-active' : ''}`} type="button" aria-label="Αναζήτηση" aria-pressed={showSearch} title="Αναζήτηση" onClick={() => setShowSearch((value) => !value)}><Icon name="search" /></button>
            <button className="icon-button" type="button" aria-label={theme === 'dark' ? 'Φωτεινό θέμα' : 'Σκοτεινό θέμα'} title="Αλλαγή θέματος" onClick={() => setTheme(toggleTheme())}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
            <button className="icon-button" type="button" aria-label="Αποσύνδεση" title="Αποσύνδεση" disabled={loggingOut} onClick={logout}><Icon name="logout" /></button>
          </div>
        </div>
        {showSearch && <label className="search-wrap"><Icon name="search" /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={isComplete ? 'Αναζήτηση πελάτη, διεύθυνσης ή εισιτηρίου' : 'Αναζήτηση εισιτηρίου ή πελάτη'} aria-label="Αναζήτηση" list={isComplete ? 'closed-ticket-suggestions' : 'ticket-search-suggestions'} />{searchQuery && <button type="button" className="search-clear" aria-label="Καθαρισμός αναζήτησης" onClick={() => setSearchQuery('')}><Icon name="close" size={16} /></button>}</label>}
        {!showSearch && searchQuery && <button type="button" className="active-search-chip" onClick={() => setSearchQuery('')} aria-label={`Καθαρισμός αναζήτησης «${searchQuery}»`}><Icon name="search" size={14} /><span>Αναζήτηση: <strong>{searchQuery}</strong></span><Icon name="close" size={14} /></button>}
        {!isComplete && <datalist id="ticket-search-suggestions">{searchSuggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist>}
        {!isComplete && <div className={`status-line ${sourceMode}`}><span className="status-dot" aria-hidden="true" /><span>{statusText} • {openTickets.length} εισιτήρια{lastUpdated ? ` • ${formatClock(lastUpdated)}` : ''}{dataAge ? ` (${dataAge})` : ''}</span><span className="auto-label">ανανέωση κάθε 1 λεπτό</span></div>}
        {!isComplete && loadError && !loading && (
          <div className="load-error" role="alert">
            <Icon name="alert" size={18} />
            <p>
              <strong>{LOAD_ERRORS[loadError]}</strong>
              <span>
                {lastUpdated ? `Βλέπεις δεδομένα από ${formatClock(lastUpdated)}. ` : sourceMode === 'cached' ? 'Βλέπεις τα τελευταία αποθηκευμένα δεδομένα. ' : 'Δεν υπάρχουν αποθηκευμένα δεδομένα. '}
                Επιβεβαίωσε στη Fiona πριν ενεργήσεις.
              </span>
            </p>
            <button type="button" onClick={refresh}>Δοκίμασε ξανά</button>
          </div>
        )}
        {!isComplete && possiblyTruncated && <p className="truncation-warning" role="status">Η Fiona επέστρεψε το μέγιστο πλήθος εισιτηρίων· ορισμένα μπορεί να λείπουν.</p>}
        <div className="scope-filters">
          <label className="scope-filter">
            <span>Κατάστημα</span>
            <select className="store-select" value={storeId} onChange={(event) => changeStore(event.target.value)}>
              {(configuredStores.length > 1 || storeId === 'all') && <option value="all">Όλα τα καταστήματα</option>}
              {configuredStores.map((store) => <option key={store.storeId} value={store.storeId}>{store.storeName}</option>)}
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
        {!isComplete && <div className="filter-row" role="tablist" aria-label="Φίλτρο κατάστασης">
          {visibleFilters.map((filter) => <button key={filter} type="button" role="tab" aria-selected={activeFilter === filter} className={`filter-chip ${activeFilter === filter ? 'active' : ''}`} onClick={() => changeStatusFilter(filter)}>{filterLabel(filter)}<span>{statusCounts[filter]}</span></button>)}
        </div>}
      </header>

      {isComplete ? <CompleteView storeId={storeId} stores={stores} searchQuery={searchQuery} onSearchChange={setSearchQuery} /> : <main className="queue-main">
        <div className="service-filter-row" role="group" aria-label="Φίλτρο είδους εργασίας">
          {serviceFilters.map((filter) => <button
            key={filter.key || 'all'}
            type="button"
            className={`service-filter-chip${serviceFilter === filter.key ? ' active' : ''}`}
            aria-pressed={serviceFilter === filter.key}
            onClick={() => setServiceFilter(filter.key)}
          >{filter.label} ({filter.count})</button>)}
        </div>
        <div className="queue-heading"><div><h2>{activeFilter === 'ALL' ? 'Εργασίες πεδίου' : filterLabel(activeFilter)}</h2></div><span>{filteredTickets.length} εισιτήρια</span></div>
        <div className="ticket-list">
          {filteredTickets.length === 0 && <p className="empty-state">{
            sourceMode === 'live' ? (searchQuery ? 'Κανένα εισιτήριο δεν ταιριάζει με την αναζήτηση ή τα φίλτρα.' : 'Δεν υπάρχουν εισιτήρια για αυτό το φίλτρο.')
              : loading ? 'Φόρτωση εισιτηρίων…' : 'Δεν υπάρχουν διαθέσιμα δεδομένα. Δοκίμασε ξανά όταν υπάρξει σύνδεση.'
          }</p>}
          {activeFilter === 'APPOINTMENT' ? appointmentGroups.map((group) => (
            <section className="closed-day-group appointment-day-group" key={group.key || 'undated'}>
              <h3>
                <span>
                  {group.key === todayKey && <strong>Σήμερα — </strong>}
                  {group.key === yesterdayKey && <strong>Χθες — </strong>}
                  {group.key ? closedDateLabel(`${group.key}T12:00:00Z`) : 'Χωρίς ημερομηνία ραντεβού'}
                </span>
                <small>{group.tickets.length} {group.tickets.length === 1 ? 'εργασία' : 'εργασίες'}</small>
              </h3>
              <div className="ticket-list">
                {group.tickets.map((ticket) => <TicketCard key={`${ticket.storeId}:${ticket.id}`} ticket={ticket} now={now} showStore={storeId === 'all'} marker={changeMarker(changeItems, ticket, now)} />)}
              </div>
            </section>
          )) : filteredTickets.map((ticket) => <TicketCard key={`${ticket.storeId}:${ticket.id}`} ticket={ticket} now={now} showStore={storeId === 'all'} marker={changeMarker(changeItems, ticket, now)} />)}
        </div>
      </main>}

      <nav className="bottom-nav" aria-label="Κύρια πλοήγηση">
        <button type="button" className={!isComplete ? 'active' : ''} aria-current={!isComplete ? 'page' : undefined} onClick={showOpen}><Icon name="ticket" size={20} /><span>Ανοιχτά</span>{openTickets.length > 0 && <b>{openTickets.length}</b>}</button>
        <button type="button" className={isComplete ? 'active' : ''} aria-current={isComplete ? 'page' : undefined} onClick={() => changeStatusFilter('COMPLETE')}><Icon name="done" size={20} /><span>Ολοκληρωμένα</span></button>
        <a href="/tracker/"><Icon name="trophy" size={20} /><span>Πόντοι</span></a>
      </nav>
    </div>
  );
}

export default App;
