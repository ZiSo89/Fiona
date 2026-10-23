import { useEffect, useState } from 'react';
import { normalizeSearchText } from '../../shared/searchUtils.js';

const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const COMPLETE_SECTION_KEY = 'fiona-complete-section';
const COMPLETE_MONTH_KEY = 'fiona-complete-month';

const currentMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' }).slice(0, 7);

function readCompleteSection() {
  const savedSection = window.sessionStorage.getItem(COMPLETE_SECTION_KEY);
  return savedSection === 'list' || savedSection === 'stats' ? savedSection : 'stats';
}

function readCompleteMonth() {
  const savedMonth = window.sessionStorage.getItem(COMPLETE_MONTH_KEY);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(savedMonth || '') ? savedMonth : currentMonth();
}

function shiftMonth(month, offset) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

const monthLabel = (month) => {
  const [year, number] = month.split('-').map(Number);
  return `${MONTHS[number - 1]} ${year}`;
};

const tone = (percent) => (percent === null ? 'none' : percent >= 90 ? 'good' : percent >= 75 ? 'warn' : 'bad');

const formatLate = (hours) => (hours >= 48 ? `+${Math.round(hours / 24)} ημ.` : `+${Math.round(hours)} ώρ.`);

const formatClosed = (value) => new Date(value).toLocaleString('el-GR', {
  timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function Kpi({ label, value, note, tone: kind }) {
  return <div className={`kpi kpi-${kind}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

const DASH = '-';
const COPY_ALL_DELAY_MS = 350;

const text = (value) => (value === null || value === undefined || String(value).trim() === '' ? DASH : String(value));

function splitDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return [DASH, DASH];
  const zone = { timeZone: 'Europe/Athens' };
  return [
    date.toLocaleDateString('el-GR', { ...zone, day: '2-digit', month: '2-digit', year: 'numeric' }),
    date.toLocaleTimeString('el-GR', { ...zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  ];
}

// Plain HTTP on a phone has no navigator.clipboard, so fall back to execCommand.
async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

function TicketDetails({ orderId, storeId }) {
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(false);
  const [note, setNote] = useState('');
  const [copiedLabel, setCopiedLabel] = useState(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/closed-tickets/${encodeURIComponent(orderId)}?store=${encodeURIComponent(storeId)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.status))))
      .then((result) => setTicket(result.ticket))
      .catch((reason) => { if (reason.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [orderId, storeId]);

  if (error) return <p className="empty-state">Δεν φορτώθηκαν τα στοιχεία.</p>;
  if (!ticket) return <div className="detail-panel" aria-busy="true"><div className="skeleton-kpi detail-skeleton" /></div>;

  const [createdDate, createdTime] = splitDateTime(ticket.createdAt);
  const [scheduledDate, scheduledTime] = splitDateTime(ticket.scheduledAt);
  const [closedDate, closedTime] = splitDateTime(ticket.closedAt);

  const customerRows = [
    ['Πελάτης', text(ticket.customer)],
    ['Τηλέφωνο', text(ticket.phone)],
    ['Σταθερό τηλέφωνο', text(ticket.landline)],
    ['Πόλη', text(ticket.city)],
    ['Διεύθυνση', text(ticket.street)],
    ['Αριθμός', text(ticket.houseNumber)],
    ['Α.Φ.Μ', text(ticket.afm)],
  ];
  const workRows = [
    ['Συνεργείο', text(ticket.team)],
    ['Υπηρεσία', text(ticket.service)],
    ['ID', text(String(ticket.serviceOrderId ?? '').split('-')[0])],
    ['Δημιουργία - ημερομηνία', createdDate],
    ['Δημιουργία - ώρα', createdTime],
    ['Αρχή - ημερομηνία', scheduledDate],
    ['Αρχή - ώρα', scheduledTime],
    ['Ολοκλήρωση - ημερομηνία', closedDate],
    ['Ολοκλήρωση - ώρα', closedTime],
    ['Τελευταίο σχόλιο', text(ticket.lastComment)],
  ];

  const copyOne = async (label, value) => {
    await copyText(value);
    setCopiedLabel(label);
    setNote('Η τιμή αντιγράφηκε');
    window.setTimeout(() => setCopiedLabel(null), 1200);
  };

  // One value at a time, so a clipboard-history tool collects each of them.
  const copyAll = async () => {
    setCopying(true);
    for (const [index, [, value]] of customerRows.entries()) {
      await copyText(value);
      setNote(`Αντιγράφηκε ${index + 1}/${customerRows.length}`);
      if (index < customerRows.length - 1) await new Promise((resolve) => { window.setTimeout(resolve, COPY_ALL_DELAY_MS); });
    }
    setNote(`${customerRows.length} στοιχεία πελάτη αντιγράφηκαν`);
    setCopying(false);
  };

  const renderRow = ([label, value]) => (
    <div key={label} className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
      <button type="button" className="copy-btn" aria-label={`Αντιγραφή: ${label}`} title="Αντιγραφή" onClick={() => copyOne(label, value)}>{copiedLabel === label ? '✓' : '⧉'}</button>
    </div>
  );

  return (
    <div className="detail-panel">
      <div className="detail-head">
        <span className="detail-title">Δεδομένα πελάτη</span>
        <button type="button" className="copy-all" disabled={copying} onClick={copyAll}>Copy all</button>
      </div>
      {customerRows.map(renderRow)}
      <div className="detail-rule" />
      <span className="detail-title">Δεδομένα εργασίας</span>
      {workRows.map(renderRow)}
      <span className="detail-note" role="status">{note}</span>
    </div>
  );
}

function ClosedItem({ ticket, storeName }) {
  const [open, setOpen] = useState(false);
  const kind = ticket.outcome === 'on_time' ? 'good' : ticket.outcome === 'late' ? 'bad' : 'none';

  return (
    <div className="done-item">
      <button type="button" className={`done-card done-${kind}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <div>
          <strong>{ticket.customer || `#${ticket.serviceOrderId}`}</strong>
          <span className="closed-store-label">{storeName}</span>
          {ticket.address && <span>{ticket.address}</span>}
          <span>#{ticket.serviceOrderId} • {ticket.service} • {ticket.team}</span>
          <small>Έκλεισε {formatClosed(ticket.closedAt)}</small>
        </div>
        <b>{kind === 'good' ? 'Εντός ορίου' : kind === 'bad' ? formatLate(ticket.hoursLate) : 'Χωρίς προθεσμία'}</b>
      </button>
      {open && <TicketDetails orderId={ticket.orderId} storeId={ticket.storeId} />}
    </div>
  );
}

function ClosedList({ tickets, stores, query, onQueryChange, showSearch }) {
  const needle = normalizeSearchText(query.trim());
  const visible = needle
    ? tickets.filter((ticket) => [ticket.serviceOrderId, ticket.customer, ticket.address, ticket.service, ticket.team]
      .some((value) => normalizeSearchText(value).includes(needle)))
    : tickets;

  return (
    <section className="stats-section">
      {!showSearch && <input className="list-search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Αναζήτηση πελάτη, διεύθυνσης ή εισιτηρίου" aria-label="Αναζήτηση ολοκληρωμένων" list="closed-ticket-suggestions" />}
      {visible.length === 0 && <p className="empty-state">Δεν βρέθηκαν εργασίες.</p>}
      {visible.map((ticket) => <ClosedItem
        key={`${ticket.storeId}:${ticket.orderId}`}
        ticket={ticket}
        storeName={stores.find((store) => store.storeId === ticket.storeId)?.storeName || ticket.storeId}
      />)}
    </section>
  );
}

function StatsSections({ stats, stores }) {
  const workPercent = stats.totals.onTimePercent;
  const callPercent = stats.firstCall.onTimePercent;
  const callJudged = stats.firstCall.onTime + stats.firstCall.late;

  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Ολοκληρώθηκαν" value={stats.totals.total} tone="none" />
        <Kpi label="Ολοκλήρωση εντός ορίου" value={workPercent === null ? '—' : `${workPercent}%`} note={`${stats.totals.onTime} από ${stats.totals.onTime + stats.totals.late}`} tone={tone(workPercent)} />
        <Kpi label="Ολοκλήρωση εκτός ορίου" value={stats.totals.late} note={stats.totals.unknown ? `${stats.totals.unknown} χωρίς προθεσμία` : null} tone={stats.totals.late ? 'bad' : 'good'} />
        <Kpi label="1η κλήση εντός 4ώρου" value={callPercent === null ? '—' : `${callPercent}%`} note={callJudged ? `${stats.firstCall.onTime} από ${callJudged}` : 'Συγκεντρώνονται δεδομένα'} tone={tone(callPercent)} />
      </div>

      <section className="stats-section">
        <h3>Ανά συνεργείο</h3>
        {stats.teams.map((team) => (
          <div key={`${team.storeId}:${team.team}`} className="team-row">
            <div className="team-row-head"><strong>{team.team} · {stores.find((store) => store.storeId === team.storeId)?.storeName || team.storeId}</strong><span className={`pct pct-${tone(team.onTimePercent)}`}>{team.onTimePercent === null ? '—' : `${team.onTimePercent}%`}</span></div>
            <div className="stack-bar" role="img" aria-label={`${team.onTime} εντός, ${team.late} εκτός, ${team.unknown} άγνωστα`}>
              <span className="seg-good" style={{ flexGrow: team.onTime }} />
              <span className="seg-bad" style={{ flexGrow: team.late }} />
              <span className="seg-none" style={{ flexGrow: team.unknown }} />
            </div>
            <small>{team.total} εργασίες • {team.late} εκτός</small>
          </div>
        ))}
      </section>

    </>
  );
}

export default function CompleteView({ storeId, stores, searchQuery, onSearchChange, showSearch }) {
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
        <h2>{monthLabel(month)}</h2>
        <button type="button" aria-label="Επόμενος μήνας" disabled={isCurrent} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>

      <label className="view-select-wrap">
        <span>Προβολή</span>
        <select aria-label="Προβολή ολοκληρωμένων" value={section} onChange={(event) => setSection(event.target.value)}>
          <option value="list">Ολοκληρωμένα</option>
          <option value="stats">Στατιστικά</option>
        </select>
      </label>

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
        ? <ClosedList tickets={stats.closedTickets} stores={stores} query={searchQuery} onQueryChange={onSearchChange} showSearch={showSearch} />
        : <StatsSections stats={stats} stores={stores} />)}
    </main>
  );
}
