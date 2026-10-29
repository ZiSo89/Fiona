const PRIORITY_LABELS = {
  1: 'High',
  2: 'Medium',
  3: 'Low',
};

const PRIORITY_COLORS = {
  1: '#d93025',
  2: '#f2994a',
  3: '#34a853',
};

const athensDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Athens',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function getAthensOffset(date) {
  const parts = Object.fromEntries(athensDateFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  const localTimeAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return localTimeAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function createAthensDate(year, month, day, hour, minute, second, millisecond = 0) {
  const wallTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let timestamp = wallTimeAsUtc - getAthensOffset(new Date(wallTimeAsUtc));
  timestamp = wallTimeAsUtc - getAthensOffset(new Date(timestamp));
  return new Date(timestamp);
}

function toIsoDate(value) {
  return parseFionaDate(value)?.toISOString() || null;
}

// Fiona sends the literal string "null" for unassigned teams.
export function cleanTeamName(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return !text || /^(?:null|undefined|none)$/i.test(text) ? null : text;
}

export function parseFionaDate(value) {
  if (!value) return null;

  const cleaned = String(value).trim();
  if (!cleaned) return null;

  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(cleaned)) {
    const zonedDate = new Date(cleaned);
    return Number.isNaN(zonedDate.getTime()) ? null : zonedDate;
  }

  const novaDate = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (novaDate) {
    const [, month, day, year, hour, minute, second = '0'] = novaDate;
    return createAthensDate(Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(second));
  }

  const isoLocalDate = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?$/);
  if (isoLocalDate) {
    const [, year, month, day, hour = '0', minute = '0', second = '0', fraction = '0'] = isoLocalDate;
    const millisecond = Number(fraction.slice(0, 3).padEnd(3, '0'));
    return createAthensDate(Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(second), millisecond);
  }

  const candidate = cleaned.replace(' ', 'T').replace(/\.(\d{3,})$/, '');
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function normalizePriority(rawPriority) {
  if (rawPriority === null || rawPriority === undefined || rawPriority === '') {
    return { raw: null, normalized: null, level: null, label: null, color: null };
  }

  const value = String(rawPriority).trim();

  if (value.toLowerCase() === 'same day') {
    return { raw: rawPriority, normalized: 'Same Day', level: 1, label: 'Same Day', color: PRIORITY_COLORS[1] };
  }

  if (value.toLowerCase() === 'standard') {
    return { raw: rawPriority, normalized: 'Standard', level: 3, label: 'Standard', color: PRIORITY_COLORS[3] };
  }

  if (value.includes('-')) {
    const [levelText, labelText] = value.split('-');
    const level = Number.parseInt(levelText, 10) || 3;
    const label = labelText || PRIORITY_LABELS[level] || 'Low';
    return {
      raw: rawPriority,
      normalized: `${level}-${label}`,
      level,
      label,
      color: PRIORITY_COLORS[level] || PRIORITY_COLORS[3],
    };
  }

  if (value.toLowerCase() === 'high' || value === '1') {
    return {
      raw: rawPriority,
      normalized: '1-High',
      level: 1,
      label: 'High',
      color: PRIORITY_COLORS[1],
    };
  }

  if (value.toLowerCase() === 'medium' || value === '2') {
    return {
      raw: rawPriority,
      normalized: '2-Medium',
      level: 2,
      label: 'Medium',
      color: PRIORITY_COLORS[2],
    };
  }

  const level = Number.parseInt(value, 10) || 3;
  const label = PRIORITY_LABELS[level] || 'Low';

  return {
    raw: rawPriority,
    normalized: `${level}-${label}`,
    level,
    label,
    color: PRIORITY_COLORS[level] || PRIORITY_COLORS[3],
  };
}

function getPhoneNumber(order) {
  const candidates = [
    order?.tel1,
    order?.tel2,
    order?.telNumber1,
    order?.telNumber2,
    order?.phone,
    order?.contactPhone,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const values = String(candidate).split(',');
    for (const value of values) {
      const cleaned = value.trim().replace(/\s+/g, '');
      if (cleaned && cleaned !== 'NONE' && cleaned !== 'null') {
        return cleaned;
      }
    }
  }

  return '';
}

function getCustomerName(order) {
  const firstName = order?.firstName?.trim();
  const lastName = order?.lastName?.trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  if (fullName) return fullName;
  return order?.customerName || order?.customer || 'Customer';
}

function buildAddress(order) {
  const coordinates = parseCoordinates(order?.street);
  const street = coordinates
    ? `Συντεταγμένες ${coordinates.lat.toFixed(6)}, ${coordinates.lon.toFixed(6)}`
    : order?.street || '';
  const houseNumber = order?.houseNumber || '';
  const city = order?.city || '';
  const region = order?.region || '';

  const streetWithNumber = [cleanAddressPart(street), cleanAddressPart(houseNumber)].filter(Boolean).join(' ');
  const addressParts = [streetWithNumber, cleanAddressPart(city), cleanAddressPart(region)].filter(Boolean);
  return addressParts.join(', ');
}

function cleanAddressPart(value) {
  return String(value ?? '')
    .replace(/\(?\s*ΠΡΧ\s+ΚΕΝΤΡΟ\s+ΑΛΕΞΑΝΔΡΟΥΠΟΛΗΣ\s*\)?/gi, '')
    .replace(/(?:Δ\.|Δ\s+|ΔΗΜΟΣ\s+)\s*(?:ΑΛΕΞΑΝΔΡΟΥΠΟΛΗΣ|ΚΟΜΟΤΗΝΗΣ|ΟΡΕΣΤΙΑΔΟΣ)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fiona writes coordinates in mixed order (lon:lat, lat lon, lat,lon); Greece's ranges disambiguate.
function parseCoordinates(value) {
  const match = String(value ?? '').match(/^\s*(-?\d{1,3}\.\d+)\s*[:,; ]\s*(-?\d{1,3}\.\d+)\s*$/);
  if (!match) return null;

  const first = Number(match[1]);
  const second = Number(match[2]);
  const isLat = (number) => number >= 34 && number <= 42;
  const isLon = (number) => number >= 19 && number <= 30;

  if (isLat(first) && isLon(second)) return { lat: first, lon: second };
  if (isLat(second) && isLon(first)) return { lat: second, lon: first };
  return null;
}

function buildLocation(order, fullAddress) {
  const coordinates = parseCoordinates(order?.street) || parseCoordinates(order?.externalData?.googleMapsData);
  const query = coordinates ? `${coordinates.lat},${coordinates.lon}` : fullAddress;

  return {
    lat: coordinates?.lat ?? null,
    lon: coordinates?.lon ?? null,
    mapsUrl: query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null,
  };
}

function getSlaDueDate(order) {
  return (
    parseFionaDate(order?.workOrderSlaDate) ||
    parseFionaDate(order?.slaDate) ||
    parseFionaDate(order?.workOrderDeadline) ||
    parseFionaDate(order?.deadline) ||
    parseFionaDate(order?.callLaterTime) ||
    parseFionaDate(order?.workOrderScheduledTimeFrom) ||
    parseFionaDate(order?.workOrderAgreedTime) ||
    null
  );
}

function isCompletedStatus(statusValue) {
  if (!statusValue) return false;
  const value = String(statusValue).trim().toUpperCase();
  return ['COMPLETED', 'DONE', 'CLOSED', 'FINISHED'].includes(value);
}

function normalizeTicket(order) {
  const priority = normalizePriority(order?.priority);
  const dueDate = getSlaDueDate(order);
  const creationDate = parseFionaDate(order?.creationTime || order?.insertTime);
  // Re-issued orders (-2, -3...) inherit the SLA of the first service order.
  const slaInherited = /-(?:[2-9]|[1-9]\d+)$/.test(String(order?.serviceOrderId || ''));
  const slaPredatesCreation = Boolean(dueDate && creationDate && dueDate < creationDate);
  const slaDateInvalid = slaPredatesCreation && !slaInherited;
  const now = new Date();
  const hoursRemaining = dueDate && !slaPredatesCreation ? (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60) : null;
  const overdue = Boolean(dueDate && !slaPredatesCreation && hoursRemaining <= 0);

  const customerName = getCustomerName(order);
  const phonePrimary = getPhoneNumber(order);
  const serviceType = order?.planServiceDescription || order?.orderType || 'Service';
  const status = order?.orderStatus || 'OPEN';
  const fullAddress = buildAddress(order);

  const ticket = {
    id: String(order?.id ?? order?.orderId ?? order?.serviceOrderId ?? 'unknown'),
    serviceOrderId: order?.serviceOrderId || order?.orderId || order?.id || 'unknown',
    customer: {
      id: order?.customerId ?? null,
      name: customerName,
      firstName: order?.firstName ?? null,
      lastName: order?.lastName ?? null,
      phonePrimary,
      phoneSecondary: order?.tel2 || null,
      city: cleanAddressPart(order?.city) || null,
      region: order?.region ?? null,
      street: order?.street ?? null,
      houseNumber: order?.houseNumber ?? null,
      fullAddress,
    },
    order: {
      type: order?.orderType || order?.workOrderType || null,
      typeCode: order?.orderTypeCode || null,
      category: {
        main: order?.Categorization?.categoryId01 || null,
        sub: order?.Categorization?.categoryId02 || null,
        service: order?.Categorization?.categoryId03 || null,
        group: order?.Categorization?.categoryId05 || null,
      },
      status,
      serviceGroup: order?.serviceGroup || order?.teamName || null,
      planServiceId: order?.planServiceId || null,
      planServiceDescription: order?.planServiceDescription || serviceType,
      cliNumber: order?.externalData?.cliNumber || order?.cliNumber || null,
      problemDescription: order?.externalData?.problemDescription || order?.problemDescription || null,
      equipmentDescription: order?.equipmentDescription || null,
      hasEquipmentSerialNumber: Boolean(order?.hasEquipmentSerialNumber),
      residenceType: order?.residenceType || null,
      durationMinutes: Number(order?.workDuration || order?.orderTypeDuration) || null,
    },
    site: {
      escalateLimit: order?.externalData?.escalateLimit || null,
      floor: order?.externalData?.floor || order?.floor || null,
      buildingId: order?.externalData?.buildingId || null,
      apartment: order?.externalData?.apartment || null,
    },
    location: buildLocation(order, fullAddress),
    latestComment: order?.latestComment
      ? { ...order.latestComment, insertTime: toIsoDate(order.latestComment.insertTime) }
      : null,
    timeline: {
      insertTime: toIsoDate(order?.insertTime),
      statusTime: toIsoDate(order?.statusTime),
      lastInteractionTime: toIsoDate(order?.lastInteractionTime),
      creationTime: toIsoDate(order?.creationTime),
      callLaterTime: toIsoDate(order?.callLaterTime),
      scheduledFrom: toIsoDate(order?.workOrderScheduledTimeFrom),
      agreedTime: toIsoDate(order?.workOrderAgreedTime),
      nextActionDate: toIsoDate(order?.nextActionDate || order?.externalData?.nextActionDate),
    },
    sla: {
      isEnabled: String(order?.SLA ?? 'FALSE').toUpperCase() === 'TRUE',
      raw: order?.SLA ?? null,
      dueDate: dueDate ? dueDate.toISOString() : null,
      deadline: dueDate ? dueDate.toISOString() : null,
      dateInvalid: slaDateInvalid,
      inherited: slaInherited,
      activityDueDate: parseFionaDate(
        order?.activities?.find((activity) => activity?.activitySlaDueDate)?.activitySlaDueDate
          || order?.activitySlaDueDate
          || order?.deadline
      )?.toISOString() || null,
      overdue,
      hoursRemaining: hoursRemaining !== null ? Number(hoursRemaining.toFixed(2)) : null,
      status: slaInherited && slaPredatesCreation
        ? 'inherited'
        : overdue ? 'overdue' : hoursRemaining !== null && hoursRemaining <= 24 ? 'warning' : 'healthy',
    },
    communication: {
      noOfCalls: Number(order?.noOfCalls || 0),
      lastAction: status,
      phone: phonePrimary,
    },
    priority,
    dispatch: {
      teamId: order?.teamId || null,
      orderOwner: order?.orderOwner || order?.OrderOwner?.username || null,
      crewName: cleanTeamName(order?.teamName),
      assignedTeam: cleanTeamName(order?.teamName) || order?.serviceGroup || null,
      routeTarget: 'Google Maps',
    },
    meta: {
      source: 'Fiona',
      isCompleted: isCompletedStatus(status),
      isOpen: !isCompletedStatus(status),
    },
    raw: order,
  };

  return ticket;
}

export function normalizeOrders(payload) {
  const orders = Array.isArray(payload?.FilteredOrders)
    ? payload.FilteredOrders
    : Array.isArray(payload?.filteredOrders)
      ? payload.filteredOrders
      : Array.isArray(payload?.UserTeams)
        ? payload.UserTeams.flatMap((team) =>
          (Array.isArray(team?.TeamWorkOrders) ? team.TeamWorkOrders : []).map((workorder) => ({
            ...workorder,
            id: workorder?.id ?? workorder?.orderId,
            serviceGroup: workorder?.serviceGroup || team?.teamName,
          }))
        )
      : Array.isArray(payload)
        ? payload
        : [];

  const tickets = orders
    .map(normalizeTicket)
    .filter((ticket) => !ticket.meta.isCompleted)
    .sort((a, b) => {
      const aLevel = a.priority.level ?? 4;
      const bLevel = b.priority.level ?? 4;
      if (aLevel !== bLevel) {
        return aLevel - bLevel;
      }

      const aHours = a.sla.hoursRemaining ?? Number.MAX_SAFE_INTEGER;
      const bHours = b.sla.hoursRemaining ?? Number.MAX_SAFE_INTEGER;
      return aHours - bHours;
    });

  return {
    status: payload?.status || 'OK',
    totalOrders: Number(payload?.totalOrders ?? tickets.length),
    totalOrdersForScheduling: Number(payload?.totalOrdersForScheduling ?? tickets.length),
    tickets,
  };
}
