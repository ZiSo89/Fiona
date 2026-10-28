import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { normalizeSearchText } from '../../shared/searchUtils.js';
import { formatLate, closedDateTimeFormatter, closedDateKey, closedDateLabel, shiftDateKey, COPY_ALL_DELAY_MS, text, splitDateTime, copyText } from './closedTicketFormat.js';

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
      <button type="button" className="copy-btn" aria-label={`Αντιγραφή: ${label}`} title="Αντιγραφή" onClick={() => copyOne(label, value)}><Icon name={copiedLabel === label ? 'check' : 'copy'} size={16} /></button>
    </div>
  );

  return (
    <div className="detail-panel">
      <div className="detail-head">
        <span className="detail-title">Δεδομένα πελάτη</span>
        <button type="button" className="copy-all" disabled={copying} onClick={copyAll}><Icon name="copy" size={15} /> {copying ? 'Αντιγραφή…' : 'Αντιγραφή όλων'}</button>
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
            <span className="done-chevron" aria-hidden="true"><Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} /></span>
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

export function ClosedList({ tickets, stores, query }) {
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
