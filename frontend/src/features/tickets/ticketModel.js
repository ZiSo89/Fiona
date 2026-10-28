import { MS_PER_DAY } from './ticketFormatters.js';

// Derived on the client so the state flips the moment a target passes, not at the next poll.
export function getSlaState(ticket, now) {
  if (ticket.slaDateInvalid) return { kind: 'invalid', remainingMs: null };
  if (ticket.slaStatus === 'inherited') return { kind: 'inherited', remainingMs: null };

  const target = ticket.slaDeadline ? new Date(ticket.slaDeadline).getTime() : Number.NaN;
  if (Number.isNaN(target)) return { kind: 'none', remainingMs: null };

  const remainingMs = target - now;
  if (remainingMs <= 0) return { kind: 'overdue', remainingMs };
  return { kind: remainingMs <= MS_PER_DAY ? 'warning' : 'ok', remainingMs };
}

// Appointments first by time; the rest by SLA target (earliest first), then undated ones.
export function compareTickets(a, b) {
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

const HOUR_MS = 60 * 60 * 1000;

// Overdue completion or call deadlines need action now; a call deadline within the hour needs it soon.
export function getTicketUrgency(ticket, now) {
  const slaOverdue = getSlaState(ticket, now).kind === 'overdue';
  const callRemainingMs = ticket.showCallDeadline && ticket.activityDueDate
    ? new Date(ticket.activityDueDate).getTime() - now
    : Number.NaN;
  const callOverdue = !Number.isNaN(callRemainingMs) && callRemainingMs <= 0;
  const callSoon = !Number.isNaN(callRemainingMs) && callRemainingMs > 0 && callRemainingMs <= HOUR_MS;
  return { slaOverdue, callOverdue, callSoon, urgent: slaOverdue || callOverdue || callSoon };
}

// Urgent tickets first, then the usual appointment/SLA order.
export function compareTicketsByUrgency(now) {
  return (a, b) => {
    const urgentA = getTicketUrgency(a, now).urgent;
    const urgentB = getTicketUrgency(b, now).urgent;
    if (urgentA !== urgentB) return urgentA ? -1 : 1;
    return compareTickets(a, b);
  };
}

export function normalizeTicketForUi(ticket) {
  const priority = ticket?.priority ?? { normalized: null, level: null, color: null, label: null };

  const slaDate = ticket?.sla?.deadline || ticket?.sla?.dueDate || ticket?.slaDate || null;
  const overDue = Boolean(ticket?.sla?.overdue || ticket?.isPastDue || false);
  const status = ticket?.order?.status || ticket?.status || 'OPEN';
  const address = ticket?.customer?.fullAddress || ticket?.address || '';
  const customerName = ticket?.customer?.name
    || ticket?.customer?.lastName
    || ticket?.customerName
    || 'Πελάτης';
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
    title: ticket?.order?.planServiceDescription || ticket?.title || 'Εισιτήριο',
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
