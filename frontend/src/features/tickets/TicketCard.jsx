import Icon from '../../components/Icon.jsx';
import {
  formatDateTime,
  formatSiteNumber,
  formatTimer,
} from './ticketFormatters.js';
import { getSlaState } from './ticketModel.js';
import { greekServiceType } from './serviceTypes.js';
import { statusLabel } from './statusLabels.js';

const HOUR_MS = 60 * 60 * 1000;

const countdownText = (remainingMs) => (remainingMs > 0
  ? `σε ${formatTimer(remainingMs)}`
  : `καθυστέρηση ${formatTimer(Math.abs(remainingMs))}`);

// One clear instruction for the technician, picked by what has to happen first.
function nextStep(ticket, now) {
  const at = (value) => {
    const time = value ? new Date(value).getTime() : Number.NaN;
    return Number.isNaN(time) ? null : { time, label: formatDateTime(value), remainingMs: time - now };
  };
  const kindFor = (remainingMs) => (remainingMs <= 0 ? 'critical' : remainingMs <= HOUR_MS ? 'warning' : 'normal');
  const status = String(ticket.status).trim().toUpperCase();

  const callLater = status === 'CALL LATER' ? at(ticket.callLaterTime) : null;
  if (callLater) return { icon: 'phone', text: `Κάλεσε στις ${callLater.label}`, countdown: countdownText(callLater.remainingMs), kind: kindFor(callLater.remainingMs) };

  const callDeadline = ticket.showCallDeadline ? at(ticket.activityDueDate) : null;
  if (callDeadline) {
    return {
      icon: callDeadline.remainingMs <= 0 ? 'alert' : 'phone',
      text: callDeadline.remainingMs <= 0 ? `Η προθεσμία κλήσης έληξε (${callDeadline.label})` : `Κάλεσε τον πελάτη μέχρι ${callDeadline.label}`,
      countdown: countdownText(callDeadline.remainingMs),
      kind: kindFor(callDeadline.remainingMs),
    };
  }

  const appointment = status === 'APPOINTMENT' ? at(ticket.scheduledFrom) : null;
  if (appointment) return { icon: 'clock', text: `Ραντεβού ${appointment.label}`, countdown: appointment.remainingMs > 0 ? `σε ${formatTimer(appointment.remainingMs)}` : null, kind: 'normal' };

  const nextAction = at(ticket.nextActionDate);
  if (nextAction) return { icon: 'clock', text: `Επόμενη ενέργεια ${nextAction.label}`, countdown: countdownText(nextAction.remainingMs), kind: kindFor(nextAction.remainingMs) };
  return null;
}

export default function TicketCard({ ticket, now, showStore, marker = null }) {
  const sla = getSlaState(ticket, now);
  const critical = sla.kind === 'overdue';
  const warning = sla.kind === 'warning' || sla.kind === 'invalid';
  const deadline = formatDateTime(ticket.slaDeadline);
  const activityDeadline = formatDateTime(ticket.activityDueDate);
  const createdAt = formatDateTime(ticket.createdAt);
  const updatedAt = formatDateTime(ticket.updatedAt);
  const commentAt = formatDateTime(ticket.latestComment?.insertTime);
  const nextActionAt = formatDateTime(ticket.nextActionDate);
  const step = nextStep(ticket, now);
  const limitMatch = String(ticket.site.escalateLimit || '').match(/^\s*FB\(([^)]*)\)\s*\.\s*(\S+)\s*-\s*(\S+)\s*$/i);
  const siteInfo = [
    limitMatch ? `Όροφος: ${formatSiteNumber(limitMatch[1])}` : ticket.site.floor && `Όροφος: ${formatSiteNumber(ticket.site.floor)}`,
    limitMatch && `FB: ${formatSiteNumber(limitMatch[2])}`,
    limitMatch ? `Όριο: ${formatSiteNumber(limitMatch[3])}` : ticket.site.escalateLimit && `Όριο: ${formatSiteNumber(ticket.site.escalateLimit)}`,
    ticket.site.buildingId && `Κτίριο: ${ticket.site.buildingId}`,
    ticket.equipmentName && !ticket.hasEquipmentSerialNumber && `Εξοπλισμός: ${ticket.equipmentName}`,
  ].filter(Boolean);
  const isAppointment = String(ticket.status).trim().toUpperCase() === 'APPOINTMENT';
  const slaSummary = {
    invalid: 'Ολοκλήρωση: έλεγχος ημερομηνίας',
    inherited: 'Ολοκλήρωση: κληρονομημένη προθεσμία',
    overdue: 'Ολοκλήρωση: εκτός ορίου',
    warning: 'Ολοκλήρωση: λήγει σύντομα',
    ok: 'Ολοκλήρωση: εντός ορίου',
    none: 'Ολοκλήρωση: χωρίς προθεσμία',
  }[sla.kind];
  const slaBadge = ticket.slaDateInvalid ? 'ΕΛΕΓΧΟΣ' : critical ? 'ΕΚΤΟΣ' : warning ? 'ΠΡΟΣΟΧΗ' : 'ΟΚ';
  const customerAddress = ticket.address
    ? `${ticket.address}${ticket.city && !ticket.address.toLowerCase().includes(ticket.city.toLowerCase()) ? `, ${ticket.city}` : ''}`
    : '';
  const postalCodeMatch = customerAddress.match(/^(.*?)(,\s*|\s+)(\d{5})(?=\s*(?:,|$))(.*)$/);
  const mapsUrl = ticket.mapsUrl
    || (customerAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customerAddress)}` : null);
  const phoneDigits = ticket.contactPhone.replace(/\D/g, '');
  const phoneLabel = phoneDigits.length === 10 ? phoneDigits.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3') : ticket.contactPhone;
  const serviceTypeGreek = greekServiceType(ticket.title);

  return <article className={`ticket-card ${critical ? 'is-critical' : warning ? 'is-warning' : ''}`}>
    <div className="ticket-header">
      <div className="ticket-ident">
        <p className="ticket-id">{ticket.serviceOrderId}</p>
        {marker === 'new' && <span className="change-badge change-new">Νέο</span>}
        {marker === 'changed' && <span className="change-badge change-changed">Άλλαξε</span>}
        {ticket.priority && <span className={`priority-badge priority-${ticket.priorityLevel}`}>{ticket.priority}</span>}
        {showStore && <span className="store-badge">{ticket.storeName}</span>}
      </div>
      <span className={`status-badge status-${ticket.status.toLowerCase().replaceAll(' ', '-')}`}>{statusLabel(ticket.status)}</span>
    </div>
    <h3 className="service-title">{serviceTypeGreek || ticket.title}</h3>
    {serviceTypeGreek && <p className="service-type-gr">{ticket.title}</p>}
    <div className="customer-line">
      <strong className="customer-name">{ticket.customerLastName}</strong>
      <p className="customer-address-row"><Icon name="pin" size={15} /><span className="customer-address">{customerAddress ? (postalCodeMatch ? `${postalCodeMatch[1]}${postalCodeMatch[4]}` : customerAddress) : 'Χωρίς διεύθυνση'}</span></p>
    </div>
    {step && <div className={`next-step ${step.kind}`}><Icon name={step.icon} size={16} /><span><strong>{step.text}</strong>{step.countdown && <span className="countdown">{step.countdown}</span>}</span></div>}
    {isAppointment && ticket.teamName && <div className="team-assignment"><Icon name="user" size={15} /><span>Συνεργείο: <strong>{ticket.teamName}</strong></span></div>}
    {siteInfo.length > 0 && <ul className="site-chips">{siteInfo.map((info) => <li key={info}>{info}</li>)}</ul>}
    {ticket.problemDescription && <div className="ticket-context"><p><strong>Περιγραφή προβλήματος:</strong> {ticket.problemDescription}</p></div>}
    {ticket.latestComment?.text && <div className="latest-comment"><Icon name="note" size={15} /><span>{ticket.latestComment.text}{commentAt && <small>{commentAt}</small>}</span></div>}
    {ticket.cliNumber && <div className="cli-row"><span><small>CLI:</small> <strong>{ticket.cliNumber}</strong></span><a className="cli-call-button" href="tel:2105100153" aria-label="Κλήση στην τεχνική υποστήριξη 153" title="Τεχνική υποστήριξη 153"><Icon name="phone" size={15} /><span>Υποστήριξη 153</span></a></div>}
    <div className={`sla-strip ${critical ? 'critical' : warning ? 'warning' : 'normal'}`}><span className="sla-main"><Icon name={critical || warning || ticket.slaDateInvalid ? 'alert' : 'check'} size={15} /><strong>{slaSummary}</strong>{sla.remainingMs !== null && <span className="countdown">{countdownText(sla.remainingMs)}</span>}</span><b>{slaBadge}</b></div>
    <div className="card-actions">
      {ticket.contactPhone ? <a className="card-action card-action-call" href={`tel:${ticket.contactPhone}`} aria-label={`Κλήση πελάτη ${ticket.contactPhone}`}><Icon name="phone" size={16} /><span>{phoneLabel}</span></a> : <span className="card-action disabled"><Icon name="phone" size={16} />Χωρίς τηλέφωνο</span>}
      {mapsUrl ? <a className="card-action" href={mapsUrl} target="_blank" rel="noreferrer"><Icon name="pin" size={16} />Χάρτης</a> : <span className="card-action disabled"><Icon name="pin" size={16} />Χωρίς χάρτη</span>}
    </div>
    <details className="ticket-details">
      <summary>Λεπτομέρειες εισιτηρίου</summary>
      {updatedAt && <p className="meta-line meta-updated"><span>Τελευταία ενημέρωση:</span><strong>{updatedAt}</strong></p>}
      {createdAt && <p className="meta-line meta-created"><span>Δημιουργήθηκε:</span><strong>{createdAt}</strong></p>}
      {deadline && <p className="meta-line meta-sla"><span>Προθεσμία ολοκλήρωσης:</span><strong>{deadline}</strong></p>}
      {ticket.showCallDeadline && activityDeadline && <p className="meta-line"><span>Προθεσμία κλήσης:</span><strong>{activityDeadline}</strong></p>}
      {nextActionAt && <p className="meta-line"><span>Επόμενη ενέργεια στη Fiona:</span><strong>{nextActionAt}</strong></p>}
    </details>
    <div className="ticket-footer"><span className="service-type"><Icon name="briefcase" size={14} />{ticket.serviceType}</span><span className="calls-count">{ticket.calls} {ticket.calls === 1 ? 'κλήση' : 'κλήσεις'}</span></div>
  </article>;
}
