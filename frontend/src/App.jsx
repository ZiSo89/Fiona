import { useEffect, useMemo, useState } from 'react';
import CompleteView from './CompleteView.jsx';
import { normalizeSearchText } from './searchUtils.js';

const fallbackTickets = [
  {
    id: 'T-1042',
    serviceOrderId: 'PS12617498',
    title: 'UPS Battery Failure',
    customerName: 'Alpha DC',
    status: 'CALL LATER',
    priority: {
      normalized: '2-Medium',
      level: 2,
      color: '#f2994a',
      label: 'Medium',
    },
    communication: {
      phone: '6948787475',
      noOfCalls: 1,
    },
    customer: {
      name: 'Alpha DC',
      lastName: 'Alpha DC',
      phonePrimary: '6948787475',
      fullAddress: '12 Megalo Dromio, Athens, 10445',
      city: 'Athens',
    },
    order: {
      status: 'CALL LATER',
      planServiceDescription: 'UPS Battery Failure',
      type: 'Installations',
    },
    sla: {
      deadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      dueDate: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      overdue: false,
      hoursRemaining: 4,
      status: 'normal',
    },
    meta: {
      isUrgent: false,
      urgencyScore: 44,
    },
  },
  {
    id: 'T-2077',
    serviceOrderId: 'PS12606903',
    title: 'Network switch overheating',
    customerName: 'Metro Telecom',
    status: 'APPOINTMENT',
    priority: {
      normalized: '1-High',
      level: 1,
      color: '#d93025',
      label: 'High',
    },
    communication: {
      phone: '6931122334',
      noOfCalls: 3,
    },
    customer: {
      name: 'Metro Telecom',
      lastName: 'Metro Telecom',
      phonePrimary: '6931122334',
      fullAddress: '8 Piraeus Ave, Athens',
      city: 'Athens',
    },
    order: {
      status: 'APPOINTMENT',
      planServiceDescription: 'Network switch overheating',
      type: 'Installations',
    },
    sla: {
      deadline: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      dueDate: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      overdue: true,
      hoursRemaining: 0,
      status: 'critical',
    },
    meta: {
      isUrgent: true,
      urgencyScore: 90,
    },
  },
  {
    id: 'T-3301',
    serviceOrderId: 'PS12469497',
    title: 'Monitoring alert',
    customerName: 'Northwind Offices',
    status: 'CALL LATER',
    priority: {
      normalized: '3-Low',
      level: 3,
      color: '#34a853',
      label: 'Low',
    },
    communication: {
      phone: '2105558899',
      noOfCalls: 1,
    },
    customer: {
      name: 'Northwind Offices',
      lastName: 'Northwind Offices',
      phonePrimary: '2105558899',
      fullAddress: '21 Vasilissis Sofias, Athens',
      city: 'Athens',
    },
    order: {
      status: 'CALL LATER',
      planServiceDescription: 'Monitoring alert',
      type: 'Support',
    },
    sla: {
      deadline: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      dueDate: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      overdue: false,
      hoursRemaining: 8,
      status: 'normal',
    },
    meta: {
      isUrgent: false,
      urgencyScore: 18,
    },
  },
];

const FILTERS = ['ALL', 'OPEN', 'TO CALL', 'CALL LATER', 'APPOINTMENT', 'COMPLETE'];
const ACTIVE_FILTER_KEY = 'fiona-active-filter';
const SCROLL_POSITION_KEY = 'fiona-scroll-position';
const ACTIVE_STORE_KEY = 'fiona-active-store';

function readActiveFilter() {
  const savedFilter = window.sessionStorage.getItem(ACTIVE_FILTER_KEY);
  return FILTERS.includes(savedFilter) ? savedFilter : 'ALL';
}

function saveScrollPosition() {
  window.sessionStorage.setItem(SCROLL_POSITION_KEY, String(window.scrollY));
}
const CACHE_KEY_PREFIX = 'fiona-fieldops-tickets-v2';

function readSelectedStore() {
  return window.localStorage.getItem(ACTIVE_STORE_KEY) || 'alexandroupoli';
}

const storeCacheKey = (storeId) => `${CACHE_KEY_PREFIX}:${storeId}`;

const formatDateTime = (dateValue) => {
  if (!dateValue) return null;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString('el-GR', {
    timeZone: 'Europe/Athens',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatSiteNumber = (value) => {
  const raw = String(value ?? '').trim();
  return /^\+?\d+$/.test(raw)
    ? raw.replace(/^\+/, '').replace(/^0+(?=\d)/, '')
    : raw;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const athensDay = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });

const formatTimer = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const pad = (value) => String(value).padStart(2, '0');
  return `${days ? `${days}d ` : ''}${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

const formatActionCountdown = (dateValue, now) => {
  if (!dateValue) return null;

  const remainingMs = new Date(dateValue).getTime() - now;
  if (Number.isNaN(remainingMs)) return null;
  return remainingMs > 0
    ? `σε ${formatTimer(remainingMs)}`
    : `εκπρόθεσμο κατά ${formatTimer(Math.abs(remainingMs))}`;
};

// Derived on the client so the state flips the moment a target passes, not at the next poll.
function getSlaState(ticket, now) {
  if (ticket.slaDateInvalid) return { kind: 'invalid', remainingMs: null };
  if (ticket.slaStatus === 'inherited') return { kind: 'inherited', remainingMs: null };

  const target = ticket.slaDeadline ? new Date(ticket.slaDeadline).getTime() : Number.NaN;
  if (Number.isNaN(target)) return { kind: 'none', remainingMs: null };

  const remainingMs = target - now;
  if (remainingMs <= 0) return { kind: 'overdue', remainingMs };
  return { kind: remainingMs <= MS_PER_DAY ? 'warning' : 'ok', remainingMs };
}

// Appointments first by time; the rest by SLA target (earliest first), then undated ones.
function compareTickets(a, b) {
  const time = (value) => (value ? new Date(value).getTime() : Number.POSITIVE_INFINITY);
  const aAppointment = a.status === 'APPOINTMENT';
  const bAppointment = b.status === 'APPOINTMENT';

  if (aAppointment !== bAppointment) return aAppointment ? -1 : 1;
  if (aAppointment) return time(a.scheduledFrom) - time(b.scheduledFrom);

  const aSla = a.slaDateInvalid || a.slaInherited ? Number.POSITIVE_INFINITY : time(a.slaDeadline);
  const bSla = b.slaDateInvalid || b.slaInherited ? Number.POSITIVE_INFINITY : time(b.slaDeadline);
  if (aSla === bSla) return time(a.createdAt) - time(b.createdAt);
  return aSla < bSla ? -1 : 1;
}

function normalizeTicketForUi(ticket) {
  const priority = ticket?.priority ?? { normalized: null, level: null, color: null, label: null };

  const slaDate = ticket?.sla?.deadline || ticket?.sla?.dueDate || ticket?.slaDate || null;
  const overDue = Boolean(ticket?.sla?.overdue || ticket?.isPastDue || false);
  const status = ticket?.order?.status || ticket?.status || 'OPEN';
  const address = ticket?.customer?.fullAddress || ticket?.address || 'Address unavailable';
  const customerName = ticket?.customer?.name
    || ticket?.customer?.lastName
    || ticket?.customerName
    || 'Customer';
  const severity = String(ticket?.sla?.status || '').toLowerCase();
  const orderOwner = ticket?.raw?.OrderOwner || ticket?.OrderOwner;
  const ownerName = [orderOwner?.firstName, orderOwner?.lastName].filter(Boolean).join(' ');
  const equipmentDescription = ticket?.order?.equipmentDescription || ticket?.equipmentDescription || '';
  const equipmentName = [...new Set(String(equipmentDescription).split(',')
    .map((equipment) => {
      const name = equipment.trim().split(/[_\s]/, 1)[0];
      return ['huawei', 'nokia'].includes(name.toLowerCase())
        ? `${name[0].toUpperCase()}${name.slice(1).toLowerCase()}`
        : name;
    })
    .filter(Boolean))].join(', ');

  return {
    storeId: ticket?.storeId || ticket?.raw?.storeId || 'alexandroupoli',
    storeName: ticket?.storeName || ticket?.raw?.storeName || 'Αλεξανδρούπολη',
    id: String(ticket?.id || ticket?.serviceOrderId || 'unknown'),
    serviceOrderId: String(ticket?.serviceOrderId || ticket?.id || 'unknown'),
    title: ticket?.order?.planServiceDescription || ticket?.title || 'Service ticket',
    customerName,
    customerLastName: ticket?.customer?.lastName || customerName,
    city: ticket?.customer?.city || '',
    cliNumber: ticket?.order?.cliNumber || ticket?.cliNumber || '',
    problemDescription: ticket?.order?.problemDescription || ticket?.problemDescription || '',
    equipmentName,
    hasEquipmentSerialNumber: Boolean(ticket?.order?.hasEquipmentSerialNumber ?? ticket?.hasEquipmentSerialNumber),
    teamName: ticket?.teamName || ticket?.raw?.teamName || ticket?.order?.teamName || ticket?.dispatch?.teamName || ownerName,
    createdAt: ticket?.timeline?.creationTime || ticket?.raw?.creationTime || ticket?.creationTime || null,
    updatedAt: ticket?.timeline?.statusTime || ticket?.raw?.statusTime || ticket?.statusTime || null,
    status,
    priority: priority.normalized || '',
    priorityColor: priority.color || null,
    priorityLevel: priority.level || 0,
    latestComment: ticket?.latestComment || null,
    site: ticket?.site || {},
    mapsUrl: ticket?.location?.mapsUrl || null,
    durationMinutes: ticket?.order?.durationMinutes || null,
    nextActionDate: ticket?.timeline?.nextActionDate || null,
    callLaterTime: ticket?.timeline?.callLaterTime || null,
    contactPhone: ticket?.customer?.phonePrimary || ticket?.communication?.phone || ticket?.contactPhone || '',
    address,
    slaDate,
    slaDateInvalid: Boolean(ticket?.sla?.dateInvalid || ticket?.slaDateInvalid),
    slaInherited: Boolean(ticket?.sla?.inherited),
    scheduledFrom: ticket?.timeline?.scheduledFrom || ticket?.raw?.workOrderScheduledTimeFrom || null,
    activityDueDate: ticket?.sla?.activityDueDate || ticket?.raw?.activitySlaDueDate || ticket?.raw?.deadline || ticket?.deadline || null,
    showCallDeadline: ['OPEN', 'CALL LATER'].includes(String(status).trim().toUpperCase()),
    isPastDue: overDue,
    slaStatus: severity || (overDue ? 'critical' : 'normal'),
    slaDeadline: ticket?.sla?.deadline || slaDate,
    hoursRemaining: ticket?.sla?.hoursRemaining ?? ticket?.hoursRemaining ?? null,
    serviceType: ticket?.order?.type || 'Service',
    calls: ticket?.communication?.noOfCalls ?? ticket?.noOfCalls ?? 0,
    urgencyScore: ticket?.meta?.urgencyScore ?? 0,
    lastAction: ticket?.communication?.lastAction || '',
    raw: ticket,
  };
}

function Icon({ name, size = 20 }) {
  const paths = {
    check: <><path d="m5 12 4 4L19 6" /></>,
    alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    sync: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
    phone: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 11.2 19a19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.7L7.2 10a16 16 0 0 0 6 6l1.6-1.8a2 2 0 0 1 1.7-.6l3 .5a2 2 0 0 1 1.5 2.8Z" /></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>,
    note: <><path d="M4 5h16v11H9l-5 4V5Z" /></>,
  };

  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function readCachedTickets(storeId) {
  try {
    const legacyAlexandroupoliCache = storeId === 'alexandroupoli'
      ? window.localStorage.getItem('fiona-fieldops-tickets-v1')
      : null;
    const cached = JSON.parse(window.localStorage.getItem(storeCacheKey(storeId)) || legacyAlexandroupoliCache || 'null');
    return Array.isArray(cached) ? cached.map(normalizeTicketForUi) : null;
  } catch {
    return null;
  }
}

function App() {
  const [storeId, setStoreId] = useState(readSelectedStore);
  const [stores, setStores] = useState([
    { storeId: 'alexandroupoli', storeName: 'Αλεξανδρούπολη', configured: true },
    { storeId: 'komotini', storeName: 'Κομοτηνή', configured: false },
    { storeId: 'orestiada', storeName: 'Ορεστιάδα', configured: false },
  ]);
  const [tickets, setTickets] = useState(() => readCachedTickets(readSelectedStore())
    || (readSelectedStore() === 'alexandroupoli' ? fallbackTickets.map(normalizeTicketForUi) : []));
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeFilter, setActiveFilter] = useState(readActiveFilter);
  const [sourceMode, setSourceMode] = useState(() => readCachedTickets(readSelectedStore()) ? 'cached' : 'fallback');
  const [showSearch, setShowSearch] = useState(false);
  const [teamFilter, setTeamFilter] = useState(() => localStorage.getItem('fiona-team-filter') || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
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
          setTickets(cached || (storeId === 'alexandroupoli' ? fallbackTickets.map(normalizeTicketForUi) : []));
          setSourceMode(cached ? 'cached' : storeId === 'alexandroupoli' ? 'fallback' : 'empty');
          setLastUpdated(snapshot?.lastUpdatedAt ?? null);
          return;
        }
        setTickets(nextTickets);
        setSourceMode(result?.status === 'live' ? 'live' : nextTickets.length ? 'stale' : 'empty');

        window.localStorage.setItem(storeCacheKey(storeId), JSON.stringify(nextTickets.map((ticket) => ({
          ...ticket.raw,
          storeId: ticket.storeId,
          storeName: ticket.storeName,
        }))));
        setLastUpdated(snapshot?.lastUpdatedAt ?? null);
      } catch (error) {
        if (!current) return;
        const cached = readCachedTickets(storeId);
        setSourceMode(cached ? 'cached' : storeId === 'alexandroupoli' ? 'fallback' : 'empty');
        setTickets(cached || (storeId === 'alexandroupoli' ? fallbackTickets.map(normalizeTicketForUi) : []));
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
    setTickets(cached || (value === 'alexandroupoli' ? fallbackTickets.map(normalizeTicketForUi) : []));
    setSourceMode(cached ? 'cached' : value === 'alexandroupoli' ? 'fallback' : 'empty');
    setLastUpdated(null);
    setLoading(true);
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
          </div>
        </div>
        {showSearch && <label className="search-wrap"><Icon name="search" /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Αναζήτηση εισιτηρίου ή πελάτη" list={isComplete ? 'closed-ticket-suggestions' : 'ticket-search-suggestions'} /></label>}
        {!isComplete && <datalist id="ticket-search-suggestions">{searchSuggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist>}
        {!isComplete && <div className={`status-line ${sourceMode}`}><span className="status-dot" /><span>{loading ? 'Συγχρονισμός…' : sourceMode === 'live' ? 'Live' : sourceMode === 'stale' || sourceMode === 'cached' ? 'Stale / Cached' : 'Offline'} • {tickets.length} εισιτήρια{lastUpdated ? ` • ${new Date(lastUpdated).toLocaleTimeString('el-GR', { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })}` : ''}</span><span className="auto-label">auto 60s</span></div>}
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

      {isComplete ? <CompleteView storeId={storeId} stores={stores} searchQuery={searchQuery} onSearchChange={setSearchQuery} showSearch={showSearch} /> : <main className="queue-main">
        <div className="queue-heading"><div><h2>{activeFilter === 'ALL' ? 'Εργασίες πεδίου' : activeFilter}</h2></div><span>{filteredTickets.length} εισιτήρια</span></div>
        <div className="ticket-list">
          {filteredTickets.length === 0 && <p className="empty-state">{sourceMode === 'live' ? 'Δεν υπάρχουν εισιτήρια για αυτό το φίλτρο.' : 'Δεν βρέθηκαν εισιτήρια.'}</p>}
          {filteredTickets.map((ticket) => {
            const sla = getSlaState(ticket, now);
            const critical = sla.kind === 'overdue';
            const warning = sla.kind === 'warning' || sla.kind === 'invalid';
            const callRemainingMs = ticket.activityDueDate ? new Date(ticket.activityDueDate).getTime() - now : null;
            const deadline = formatDateTime(ticket.slaDeadline);
            const activityDeadline = formatDateTime(ticket.activityDueDate);
            const createdAt = formatDateTime(ticket.createdAt);
            const updatedAt = formatDateTime(ticket.updatedAt);
            const commentAt = formatDateTime(ticket.latestComment?.insertTime);
            const nextActionAt = formatDateTime(ticket.nextActionDate);
            const callLaterAt = ticket.status === 'CALL LATER' ? formatDateTime(ticket.callLaterTime) : null;
            const nextActionCountdown = formatActionCountdown(ticket.nextActionDate, now);
            const callLaterCountdown = ticket.status === 'CALL LATER' ? formatActionCountdown(ticket.callLaterTime, now) : null;
            const limitMatch = String(ticket.site.escalateLimit || '').match(/^\s*FB\(([^)]*)\)\s*\.\s*(\S+)\s*-\s*(\S+)\s*$/i);
            const siteInfo = [
              limitMatch ? `Όροφος: ${formatSiteNumber(limitMatch[1])}` : ticket.site.floor && `Όροφος: ${formatSiteNumber(ticket.site.floor)}`,
              limitMatch && `FB: ${formatSiteNumber(limitMatch[2])}`,
              limitMatch ? `Όριο: ${formatSiteNumber(limitMatch[3])}` : ticket.site.escalateLimit && `Όριο: ${formatSiteNumber(ticket.site.escalateLimit)}`,
              ticket.site.buildingId && `Κτίριο: ${ticket.site.buildingId}`,
              ticket.equipmentName && !ticket.hasEquipmentSerialNumber && `Εξοπλισμός: ${ticket.equipmentName}`,
            ].filter(Boolean);
            const appointmentAt = String(ticket.status).trim().toUpperCase() === 'APPOINTMENT' ? formatDateTime(ticket.scheduledFrom) : null;
            const slaSummary = {
              invalid: 'Ολοκλήρωση: έλεγχος ημερομηνίας',
              inherited: 'Ολοκλήρωση: κληρονομημένη προθεσμία',
              overdue: 'Ολοκλήρωση: εκτός ορίου',
              warning: 'Ολοκλήρωση: πλησιάζει το όριο',
              ok: 'Ολοκλήρωση: εντός ορίου',
              none: 'Ολοκλήρωση: χωρίς προθεσμία',
            }[sla.kind];
            const callRemaining = ticket.showCallDeadline ? callRemainingMs : null;
            const callLine = callRemaining === null || Number.isNaN(callRemaining) ? null : {
              remainingMs: callRemaining,
              kind: callRemaining <= 0 ? 'critical' : callRemaining <= 3600000 ? 'warning' : 'normal',
              label: callRemaining <= 0 ? 'Κλήση: εκτός ορίου' : 'Κλήση: εντός ορίου',
            };
            return <article key={`${ticket.storeId}:${ticket.id}`} className={`ticket-card ${critical ? 'is-critical' : warning ? 'is-warning' : ''}`}>
              <div className="ticket-header"><div className="ticket-ident"><p className="ticket-id">{ticket.serviceOrderId}</p>{ticket.priority && <span className={`priority-badge priority-${ticket.priorityLevel}`}>{ticket.priority}</span>}{storeId === 'all' && <span className="store-badge">{ticket.storeName}</span>}</div><span className={`status-badge status-${ticket.status.toLowerCase().replaceAll(' ', '-')}`}>{ticket.status}</span></div>
              <h3 className="service-title">{ticket.title}</h3>
              <p className="customer-line"><Icon name="pin" size={15} /><span><strong>{ticket.customerLastName}</strong> · {ticket.address}{ticket.city && !ticket.address.toLowerCase().includes(ticket.city.toLowerCase()) ? `, ${ticket.city}` : ''}</span></p>
              {appointmentAt && <div className="appointment-row"><Icon name="clock" size={16} /><span>Ραντεβού: <strong>{appointmentAt}</strong>{ticket.durationMinutes ? ` • ${ticket.durationMinutes}'` : ''}</span></div>}
              {appointmentAt && ticket.teamName && <div className="team-assignment"><Icon name="user" size={15} /><span>Συνεργείο: <strong>{ticket.teamName}</strong></span></div>}
              {siteInfo.length > 0 && <ul className="site-chips">{siteInfo.map((info) => <li key={info}>{info}</li>)}</ul>}
              {ticket.problemDescription && <div className="ticket-context"><p><strong>Περιγραφή προβλήματος:</strong> {ticket.problemDescription}</p></div>}
              {ticket.latestComment?.text && <div className="latest-comment"><Icon name="note" size={15} /><span>{ticket.latestComment.text}{commentAt && <small>{commentAt}</small>}</span></div>}
              {(nextActionAt || callLaterAt) && <p className="next-action">{callLaterAt && <span>Να καλέσεις: <strong>{callLaterAt}</strong>{callLaterCountdown && <> · <span className="countdown">{callLaterCountdown}</span></>}</span>}{nextActionAt && <span>Επόμενη ενέργεια: <strong>{nextActionAt}</strong>{nextActionCountdown && <> · <span className="countdown">{nextActionCountdown}</span></>}</span>}</p>}
              {ticket.cliNumber && <div className="cli-row"><span><small>CLI:</small> <strong>{ticket.cliNumber}</strong></span><a className="cli-call-button" href="tel:2105100153" aria-label="Κλήση στο 153" title="Κλήση στο 153"><Icon name="phone" size={15} /><span>153</span></a></div>}
              {callLine && <div className={`sla-strip ${callLine.kind}`}><span className="sla-main"><Icon name={callLine.kind === 'normal' ? 'phone' : 'alert'} size={15} /><strong>{callLine.label}</strong><span className="countdown">{callLine.remainingMs <= 0 ? '-' : ''}{formatTimer(Math.abs(callLine.remainingMs))}</span></span></div>}
              <div className={`sla-strip ${critical ? 'critical' : warning ? 'warning' : 'normal'}`}><span className="sla-main"><Icon name={critical || warning || ticket.slaDateInvalid ? 'alert' : 'check'} size={15} /><strong>{slaSummary}</strong>{sla.remainingMs !== null && <span className="countdown">{sla.remainingMs <= 0 ? '-' : ''}{formatTimer(Math.abs(sla.remainingMs))}</span>}</span><b>{ticket.slaDateInvalid ? 'CHECK' : critical ? 'CRITICAL' : warning ? 'WARNING' : 'NORMAL'}</b></div>
              <div className="card-actions">
                {ticket.contactPhone ? <a className="card-action" href={`tel:${ticket.contactPhone}`} aria-label={`Κλήση ${ticket.contactPhone}`}><Icon name="phone" size={16} />Κλήση<small>{ticket.contactPhone}</small></a> : <span className="card-action disabled"><Icon name="phone" size={16} />Χωρίς τηλέφωνο</span>}
                {ticket.mapsUrl ? <a className="card-action" href={ticket.mapsUrl} target="_blank" rel="noreferrer"><Icon name="pin" size={16} />Χάρτης</a> : <a className="card-action" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ticket.address)}`} target="_blank" rel="noreferrer"><Icon name="pin" size={16} />Χάρτης</a>}
              </div>
              <details className="ticket-details">
                <summary>Λεπτομέρειες εισιτηρίου</summary>
                {updatedAt && <p className="meta-line meta-updated"><span>Τελευταία ενημέρωση:</span><strong>{updatedAt}</strong></p>}
                {createdAt && <p className="meta-line meta-created"><span>Δημιουργήθηκε:</span><strong>{createdAt}</strong></p>}
                {deadline && <p className="meta-line meta-sla"><span>Προθεσμία ολοκλήρωσης:</span><strong>{deadline}</strong></p>}
                {ticket.showCallDeadline && activityDeadline && <p className="meta-line">Προθεσμία κλήσης: {activityDeadline}{callRemainingMs > 0 ? <> • <span className="countdown">{formatTimer(callRemainingMs)}</span></> : ' • έληξε'}</p>}
              </details>
              <div className="ticket-footer"><span className="service-type"><Icon name="briefcase" size={14} />{ticket.serviceType}</span><span className="calls-count">{ticket.calls} κλήσεις</span></div>
            </article>;
          })}
        </div>
      </main>}

    </div>
  );
}

export default App;
