import Icon from '../../components/Icon.jsx';
import {
  formatActionCountdown,
  formatDateTime,
  formatSiteNumber,
  formatTimer,
} from './ticketFormatters.js';
import { getSlaState } from './ticketModel.js';
import { greekServiceType } from './serviceTypes.js';

export default function TicketCard({ ticket, now, showStore }) {
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
  return <article className={`ticket-card ${critical ? 'is-critical' : warning ? 'is-warning' : ''}`}>
    <div className="ticket-header"><div className="ticket-ident"><p className="ticket-id">{ticket.serviceOrderId}</p>{ticket.priority && <span className={`priority-badge priority-${ticket.priorityLevel}`}>{ticket.priority}</span>}{showStore && <span className="store-badge">{ticket.storeName}</span>}</div><span className={`status-badge status-${ticket.status.toLowerCase().replaceAll(' ', '-')}`}>{ticket.status}</span></div>
    <h3 className="service-title">{ticket.title}</h3>
    {greekServiceType(ticket.title) && <p className="service-type-gr">{greekServiceType(ticket.title)}</p>}
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
}
