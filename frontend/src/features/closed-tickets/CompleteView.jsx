import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { normalizeSearchText } from '../../shared/searchUtils.js';

const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const WEEKDAYS = { Mon: 'Δευ', Tue: 'Τρί', Wed: 'Τετ', Thu: 'Πέμ', Fri: 'Παρ', Sat: 'Σάβ', Sun: 'Κυρ' };
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
const formatDuration = (hours) => {
  if (hours === null || hours === undefined) return '—';
  if (hours < 24) return `${hours.toLocaleString('el-GR', { maximumFractionDigits: 1 })} ώρ.`;
  const days = Math.floor(hours / 24);
  const remainder = Math.round(hours % 24);
  return remainder ? `${days} ημ. ${remainder} ώρ.` : `${days} ημ.`;
};
const countChange = (value, previous) => value === previous ? 'Ίδιος αριθμός με τον προηγ. μήνα' : `${value > previous ? '+' : ''}${value - previous} έναντι προηγ. μήνα`;
const percentChange = (value, previous) => value === null || previous === null
  ? 'Δεν υπάρχουν επαρκή δεδομένα σύγκρισης'
  : `${value === previous ? 'Ίδιο' : `${value > previous ? '+' : ''}${value - previous}`} μ.π. έναντι προηγ. μήνα`;

const formatClosed = (value) => new Date(value).toLocaleString('el-GR', {
  timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

const closedDatePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit',
});
const closedDateLabelFormatter = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const closedDateTimeFormatter = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function closedDateKey(value) {
  const parts = Object.fromEntries(closedDatePartsFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function closedDateLabel(value) {
  return closedDateLabelFormatter.format(new Date(value));
}

function shiftDateKey(key, offset) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

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
  const statusLabel = kind === 'good'
    ? 'Εντός ορίου'
    : kind === 'bad' && Number.isFinite(ticket.hoursLate)
      ? `Εκπρόθεσμη ${formatLate(ticket.hoursLate)}`
      : kind === 'bad' ? 'Εκπρόθεσμη' : 'Χωρίς προθεσμία';
  const closedDateTime = closedDateTimeFormatter.format(new Date(ticket.closedAt));

  return (
    <div className="done-item">
      <button type="button" className={`done-card done-${kind}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="done-card-main">
          <span className="done-card-heading">
            <strong>{ticket.customer || `#${ticket.serviceOrderId}`}</strong>
            <span className={`done-status done-status-${kind}`}>{statusLabel}</span>
          </span>
          <span className="done-service"><Icon name="briefcase" size={14} />{ticket.service || 'Υπηρεσία χωρίς όνομα'}</span>
          <span className="done-id-row">
            <span className="done-order-id">#{ticket.serviceOrderId}</span>
            <span className="done-time"><Icon name="clock" size={14} />{closedDateTime}</span>
            <span className="done-chevron" aria-hidden="true">{open ? '⌃' : '⌄'}</span>
          </span>
          <span className="done-card-meta">
            <span><Icon name="user" size={14} />{ticket.team || 'Δεν έχει οριστεί'}</span>
            <span><Icon name="store" size={14} />{storeName}</span>
          </span>
          <span className="done-card-meta done-card-secondary">
            {ticket.address && <span><Icon name="pin" size={14} />{ticket.address}</span>}
          </span>
        </span>
      </button>
      {open && <TicketDetails orderId={ticket.orderId} storeId={ticket.storeId} />}
    </div>
  );
}

function ClosedList({ tickets, stores, query }) {
  const [visibleLimit, setVisibleLimit] = useState(20);
  useEffect(() => setVisibleLimit(20), [query, tickets]);

  const needle = normalizeSearchText(query.trim());
  const matches = needle
    ? tickets.filter((ticket) => [ticket.serviceOrderId, ticket.customer, ticket.address, ticket.service, ticket.team]
      .some((value) => normalizeSearchText(value).includes(needle)))
    : tickets;
  const visible = matches.slice(0, visibleLimit);
  const todayKey = closedDateKey(new Date());
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const groups = new Map();
  for (const ticket of visible) {
    const key = closedDateKey(ticket.closedAt);
    let group = groups.get(key);
    if (!group) {
      const relativeLabel = key === todayKey ? 'Σήμερα' : key === yesterdayKey ? 'Χθες' : '';
      group = { key, label: closedDateLabel(ticket.closedAt), relativeLabel, tickets: [] };
      groups.set(key, group);
    }
    group.tickets.push(ticket);
  }

  return (
    <section className="closed-list">
      {matches.length === 0 && <p className="empty-state">Δεν βρέθηκαν εργασίες.</p>}
      {[...groups.values()].map((group) => (
        <section className="closed-day-group" key={group.key}>
          <h3>
            <span>{group.relativeLabel && <strong>{group.relativeLabel} — </strong>}{group.label}</span>
            <small>{group.tickets.length} {group.tickets.length === 1 ? 'εργασία' : 'εργασίες'}</small>
          </h3>
          <div className="closed-day-items">
            {group.tickets.map((ticket) => <ClosedItem
              key={`${ticket.storeId}:${ticket.orderId}`}
              ticket={ticket}
              storeName={stores.find((store) => store.storeId === ticket.storeId)?.storeName || ticket.storeId}
            />)}
          </div>
        </section>
      ))}
      {visible.length < matches.length && (
        <button type="button" className="load-older" onClick={() => setVisibleLimit((limit) => limit + 20)}>
          Φόρτωση παλαιότερων
        </button>
      )}
    </section>
  );
}

function ActivityChart({ activity }) {
  const dailyMax = Math.max(1, ...activity.daily.map((item) => item.total));
  const weekdayMax = Math.max(1, ...activity.weekdays.map((item) => item.total));
  const hourlyMax = Math.max(1, ...activity.hours.map((item) => item.total));
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <>
      <section className="stats-section">
        <h3>Ρυθμός ολοκλήρωσης ανά ημέρα</h3>
        {activity.daily.length > 0
          ? <div className="daily-chart" role="img" aria-label="Ολοκληρωμένες εργασίες ανά ημέρα του μήνα">
            {activity.daily.map((item) => (
              <div className="daily-bar-wrap" key={item.date} title={`${item.day}: ${item.total} εργασίες`}>
                <span className="daily-bar-value">{item.total}</span>
                <span className="daily-bar" style={{ height: `${item.total ? Math.max(4, (item.total / dailyMax) * 100) : 0}%` }} />
                <small>{item.day}</small>
              </div>
            ))}
          </div>
          : <p className="chart-empty">Δεν υπάρχουν δεδομένα για αυτόν τον μήνα.</p>}
      </section>

      <section className="stats-section">
        <h3>Κατανομή φόρτου ανά ημέρα εβδομάδας</h3>
        <div className="pattern-list">
          {weekdays.map((weekday) => {
            const total = activity.weekdays.find((item) => item.weekday === weekday)?.total || 0;
            return <div className="pattern-row" key={weekday}>
              <span>{WEEKDAYS[weekday]}</span>
              <div className="distribution-track"><i style={{ width: `${(total / weekdayMax) * 100}%` }} /></div>
              <strong>{total}</strong>
            </div>;
          })}
        </div>
      </section>

      <section className="stats-section">
        <h3>Ώρα ολοκλήρωσης</h3>
        <div className="hour-chart" role="img" aria-label="Ολοκληρωμένες εργασίες ανά ώρα Ελλάδας">
          {activity.hours.map((item) => (
            <div className="hour-bar-wrap" key={item.hour} title={`${String(item.hour).padStart(2, '0')}:00 · ${item.total} εργασίες`}>
              <i style={{ height: `${item.total ? Math.max(5, (item.total / hourlyMax) * 100) : 0}%` }} />
              {item.hour % 3 === 0 && <small>{String(item.hour).padStart(2, '0')}</small>}
            </div>
          ))}
        </div>
        <small className="chart-caption">Ώρα Ελλάδας · οι μηδενικές ώρες εμφανίζονται χωρίς στήλη</small>
      </section>
    </>
  );
}

function DistributionSection({ title, items, labelFor }) {
  const max = Math.max(1, ...items.map((item) => item.total));
  return (
    <section className="stats-section">
      <h3>{title}</h3>
      {items.length === 0 && <p className="chart-empty">Δεν υπάρχουν διαθέσιμα στοιχεία.</p>}
      {items.map((item, index) => (
        <div className="distribution-row" key={`${labelFor(item)}:${index}`}>
          <div className="distribution-head"><strong>{labelFor(item)}</strong><span>{item.total} · {item.sharePercent}%</span></div>
          <div className="distribution-track" role="img" aria-label={`${labelFor(item)}: ${item.total} εργασίες, ${item.sharePercent}%`}>
            <i style={{ width: `${(item.total / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </section>
  );
}

function StatsSections({ stats, stores }) {
  const workPercent = stats.totals.onTimePercent;
  const callPercent = stats.firstCall.onTimePercent;
  const callJudged = stats.firstCall.onTime + stats.firstCall.late;
  const previous = stats.comparison.previous;

  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Ολοκληρώθηκαν" value={stats.totals.total} note={countChange(stats.totals.total, previous.total)} tone="none" />
        <Kpi label="Εντός προθεσμίας" value={workPercent === null ? '—' : `${workPercent}%`} note={`${stats.totals.onTime} από ${stats.totals.onTime + stats.totals.late} · ${percentChange(workPercent, previous.onTimePercent)}`} tone={tone(workPercent)} />
        <Kpi label="Ολοκλήρωση εκτός ορίου" value={stats.totals.late} note={`${stats.totals.unknown ? `${stats.totals.unknown} χωρίς προθεσμία · ` : ''}${countChange(stats.totals.late, previous.late)}`} tone={stats.totals.late ? 'bad' : 'good'} />
        <Kpi label="1η κλήση εντός 4ώρου" value={callPercent === null ? '—' : `${callPercent}%`} note={callJudged ? `${stats.firstCall.onTime} από ${callJudged} · ${percentChange(callPercent, previous.firstCallPercent)}` : 'Συγκεντρώνονται δεδομένα'} tone={tone(callPercent)} />
        <Kpi label="Μέσος χρόνος ολοκλήρωσης" value={formatDuration(stats.duration.meanHours)} note={`Προηγ. μήνας: ${formatDuration(previous.meanDurationHours)}`} tone="none" />
        <Kpi label="Διάμεσος χρόνος ολοκλήρωσης" value={formatDuration(stats.duration.medianHours)} note={`Προηγ. μήνας: ${formatDuration(previous.medianDurationHours)}`} tone="none" />
      </div>

      <section className="comparison-note">
        <strong>Σύγκριση με {monthLabel(stats.comparison.previousMonth)}</strong>
        <span>Ολοκληρώθηκαν: {stats.totals.total} τώρα · {previous.total} προηγουμένως</span>
        <span>Εντός προθεσμίας: {workPercent === null ? '—' : `${workPercent}%`} τώρα · {previous.onTimePercent === null ? '—' : `${previous.onTimePercent}%`} προηγουμένως</span>
        <span>Μέσος χρόνος: {formatDuration(stats.duration.meanHours)} τώρα · {formatDuration(previous.meanDurationHours)} προηγουμένως</span>
      </section>

      <ActivityChart activity={stats.activity} />

      <section className="stats-section">
        <h3>Χρόνος από δημιουργία έως ολοκλήρωση</h3>
        <div className="duration-summary">
          <span>Μέσος χρόνος<strong>{formatDuration(stats.duration.meanHours)}</strong></span>
          <span>Διάμεσος χρόνος<strong>{formatDuration(stats.duration.medianHours)}</strong></span>
          <span>Μετρήσιμες<strong>{stats.duration.total} / {stats.totals.total}</strong></span>
        </div>
        {stats.duration.missing > 0 && <small className="chart-caption">{stats.duration.missing} εργασίες δεν έχουν έγκυρες ημερομηνίες δημιουργίας και ολοκλήρωσης.</small>}
      </section>

      <DistributionSection title="Κατανομή ανά υπηρεσία" items={stats.services} labelFor={(item) => item.service} />
      <DistributionSection
        title="Κατανομή ανά κατάστημα"
        items={stats.stores}
        labelFor={(item) => stores.find((store) => store.storeId === item.storeId)?.storeName || item.store}
      />

      <section className="stats-section">
        <h3>Κατανομή ανά συνεργείο</h3>
        {stats.teams.map((team) => (
          <div key={`${team.storeId}:${team.team}`} className="team-row">
            <div className="team-row-head"><strong>{team.team} · {stores.find((store) => store.storeId === team.storeId)?.storeName || team.storeId}</strong><span>{team.total} εργασίες · {team.sharePercent}%</span></div>
            <div className="stack-bar" role="img" aria-label={`${team.onTime} εντός, ${team.late} εκτός, ${team.unknown} άγνωστα`}>
              <span className="seg-good" style={{ flexGrow: team.onTime }} />
              <span className="seg-bad" style={{ flexGrow: team.late }} />
              <span className="seg-none" style={{ flexGrow: team.unknown }} />
            </div>
            <small>Προθεσμία: {team.onTimePercent === null ? 'χωρίς επαρκή δεδομένα' : `${team.onTimePercent}% εντός`} · {team.late} εκπρόθεσμες</small>
          </div>
        ))}
      </section>

      <section className="stats-section">
        <h3>Εκπρόθεσμες εργασίες με τη μεγαλύτερη καθυστέρηση</h3>
        {stats.lateTickets.length === 0 && <p className="chart-empty">Δεν υπάρχουν εργασίες με καταγεγραμμένη καθυστέρηση.</p>}
        {stats.lateTickets.map((ticket) => (
          <div className="late-card" key={`${ticket.storeId}:${ticket.orderId}`}>
            <div>
              <strong>{ticket.customer || `#${ticket.serviceOrderId}`}</strong>
              <span>{ticket.service} · {ticket.team} · {stores.find((store) => store.storeId === ticket.storeId)?.storeName || ticket.storeId}</span>
              {ticket.address && <small>{ticket.address}</small>}
              <small>Ολοκληρώθηκε {formatClosed(ticket.closedAt)}</small>
            </div>
            <b>{formatLate(ticket.hoursLate)}</b>
          </div>
        ))}
      </section>

    </>
  );
}

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
