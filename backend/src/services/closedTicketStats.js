const athensMonthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Athens',
  year: 'numeric',
  month: '2-digit',
});

export function athensMonthOf(value) {
  const parts = Object.fromEntries(athensMonthFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}`;
}

const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Athens',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const localHourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Athens',
  hour: '2-digit',
  hourCycle: 'h23',
});

const localWeekdayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Athens',
  weekday: 'short',
});

function localDateParts(value) {
  const parts = Object.fromEntries(localDateFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function incrementCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function rankedCounts(map, labelKey) {
  const total = [...map.values()].reduce((sum, item) => sum + item.total, 0);
  return [...map.values()]
    .map((item) => ({ ...item, sharePercent: percent(item.total, total) }))
    .sort((a, b) => b.total - a.total || a[labelKey].localeCompare(b[labelKey], 'el'));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return Number((sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2).toFixed(1));
}

function monthRows(month, closedRepository) {
  const [year, number] = month.split('-').map(Number);
  const monthIndex = number - 1;
  const dayMs = 24 * 60 * 60 * 1000;
  // Pad by a day so the Athens-local month boundary is exact after filtering.
  const from = new Date(Date.UTC(year, monthIndex, 1) - dayMs).toISOString();
  const to = new Date(Date.UTC(year, monthIndex + 1, 1) + dayMs).toISOString();
  return closedRepository.listClosedBetween(from, to)
    .filter((row) => athensMonthOf(row.closed_at) === month);
}

function summarizeRows(month, rows, observationRepository, includeTickets) {
  const totals = { total: rows.length, onTime: 0, late: 0, unknown: 0 };
  const teams = new Map();
  const services = new Map();
  const stores = new Map();
  const firstCall = { onTime: 0, late: 0, unknown: 0 };
  const lateTickets = [];
  const closedTickets = [];
  const daily = new Map();
  const weekdays = new Map();
  const hours = Array(24).fill(0);
  const durationsHours = [];

  for (const row of rows) {
    const outcome = row.work_order_sla_outcome;
    const key = outcome === 'on_time' ? 'onTime' : outcome === 'late' ? 'late' : 'unknown';
    totals[key] += 1;

    const teamName = row.team_name || 'Χωρίς συνεργείο';
    const storeName = row.store_id || 'Χωρίς κατάστημα';
    const serviceName = row.service_description || 'Χωρίς υπηρεσία';
    const teamKey = `${row.store_id}:${teamName}`;
    const team = teams.get(teamKey) ?? { storeId: row.store_id, team: teamName, total: 0, onTime: 0, late: 0, unknown: 0 };
    team.total += 1;
    team[key] += 1;
    teams.set(teamKey, team);

    for (const [map, mapKey, label] of [
      [services, serviceName, { service: serviceName }],
      [stores, storeName, { storeId: row.store_id, store: storeName }],
    ]) {
      const item = map.get(mapKey) ?? { ...label, total: 0 };
      item.total += 1;
      map.set(mapKey, item);
    }

    const call = observationRepository.firstCall(row.order_id, row.store_id);
    firstCall[call.outcome === 'on_time' ? 'onTime' : call.outcome === 'late' ? 'late' : 'unknown'] += 1;

    const date = localDateParts(row.closed_at);
    incrementCount(daily, date);
    incrementCount(weekdays, localWeekdayFormatter.format(new Date(row.closed_at)));
    hours[Number(localHourFormatter.format(new Date(row.closed_at)))] += 1;

    if (row.created_at) {
      const duration = (new Date(row.closed_at) - new Date(row.created_at)) / 3600000;
      if (Number.isFinite(duration) && duration >= 0) durationsHours.push(duration);
    }

    if (includeTickets) {
      closedTickets.push({
        storeId: row.store_id,
        orderId: row.order_id,
        serviceOrderId: row.service_order_id,
        customer: row.customer_name,
        address: [row.street, row.house_number, row.city].filter(Boolean).join(' '),
        team: teamName,
        service: serviceName,
        closedAt: row.closed_at,
        outcome,
        hoursLate: outcome === 'late' && row.work_order_sla_date
          ? Number(((new Date(row.closed_at) - new Date(row.work_order_sla_date)) / 3600000).toFixed(1))
          : null,
      });
    }

    if (outcome === 'late' && row.work_order_sla_date) {
      lateTickets.push({
        storeId: row.store_id,
        orderId: row.order_id,
        serviceOrderId: row.service_order_id,
        customer: row.customer_name,
        address: [row.street, row.house_number, row.city].filter(Boolean).join(' '),
        team: teamName,
        service: serviceName,
        closedAt: row.closed_at,
        dueAt: row.work_order_sla_date,
        hoursLate: Number(((new Date(row.closed_at) - new Date(row.work_order_sla_date)) / 3600000).toFixed(1)),
      });
    }
  }

  const judgedWork = totals.onTime + totals.late;
  const judgedCalls = firstCall.onTime + firstCall.late;
  const durationMean = durationsHours.length
    ? Number((durationsHours.reduce((sum, value) => sum + value, 0) / durationsHours.length).toFixed(1))
    : null;
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return {
    month,
    totals: { ...totals, onTimePercent: percent(totals.onTime, judgedWork) },
    firstCall: { ...firstCall, onTimePercent: percent(firstCall.onTime, judgedCalls) },
    teams: [...teams.values()]
      .map((team) => ({
        ...team,
        sharePercent: percent(team.total, totals.total),
        onTimePercent: percent(team.onTime, team.onTime + team.late),
      }))
      .sort((a, b) => b.total - a.total),
    services: rankedCounts(services, 'service'),
    stores: rankedCounts(stores, 'store'),
    activity: {
      daily: Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const date = `${month}-${String(day).padStart(2, '0')}`;
        return { date, day, total: daily.get(date) || 0 };
      }),
      weekdays: [...weekdays.entries()]
        .sort((a, b) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(a[0]) - ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(b[0]))
        .map(([weekday, total]) => ({ weekday, total })),
      hours: hours.map((total, hour) => ({ hour, total })),
    },
    duration: {
      total: durationsHours.length,
      missing: rows.length - durationsHours.length,
      meanHours: durationMean,
      medianHours: median(durationsHours),
    },
    lateTickets: lateTickets.sort((a, b) => b.hoursLate - a.hoursLate).slice(0, 20),
    ...(includeTickets ? { closedTickets: closedTickets.sort((a, b) => b.closedAt.localeCompare(a.closedAt)).slice(0, 500) } : {}),
  };
}

function comparisonSummary(stats) {
  return {
    total: stats.totals.total,
    onTimePercent: stats.totals.onTimePercent,
    late: stats.totals.late,
    firstCallPercent: stats.firstCall.onTimePercent,
    meanDurationHours: stats.duration.meanHours,
    medianDurationHours: stats.duration.medianHours,
    durationTotal: stats.duration.total,
  };
}

export function getClosedTicketDetails(orderId, closedRepository, storeId) {
  const row = closedRepository.getByOrderId(orderId, storeId);
  if (!row) return null;
  return {
    storeId: row.store_id,
    orderId: row.order_id,
    serviceOrderId: row.service_order_id,
    customer: row.customer_name,
    phone: row.phone,
    landline: row.customer_id,
    city: row.city,
    street: row.street,
    houseNumber: row.house_number,
    afm: row.account_afm,
    team: row.team_name,
    service: row.service_description,
    createdAt: row.created_at,
    scheduledAt: row.scheduled_at,
    closedAt: row.closed_at,
    lastComment: row.comment_text,
  };
}

export function buildMonthlyStats(month, closedRepository, observationRepository) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(month));
  if (!match) {
    const error = new Error('month must use YYYY-MM');
    error.status = 400;
    throw error;
  }
  const [year, number] = month.split('-').map(Number);
  const previousMonthDate = new Date(Date.UTC(year, number - 2, 1));
  const previousMonth = `${previousMonthDate.getUTCFullYear()}-${String(previousMonthDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const currentStats = summarizeRows(month, monthRows(month, closedRepository), observationRepository, true);
  const previousStats = summarizeRows(previousMonth, monthRows(previousMonth, closedRepository), observationRepository, false);
  return {
    ...currentStats,
    comparison: {
      previousMonth,
      previous: comparisonSummary(previousStats),
      current: comparisonSummary(currentStats),
    },
  };
}
