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

export function getClosedTicketDetails(orderId, closedRepository) {
  const row = closedRepository.getByOrderId(orderId);
  if (!row) return null;
  return {
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
  };
}

export function buildMonthlyStats(month, closedRepository, observationRepository) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(month));
  if (!match) {
    const error = new Error('month must use YYYY-MM');
    error.status = 400;
    throw error;
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const dayMs = 24 * 60 * 60 * 1000;
  // Pad by a day so the Athens-local month boundary is exact after filtering.
  const from = new Date(Date.UTC(year, monthIndex, 1) - dayMs).toISOString();
  const to = new Date(Date.UTC(year, monthIndex + 1, 1) + dayMs).toISOString();

  const rows = closedRepository.listClosedBetween(from, to)
    .filter((row) => athensMonthOf(row.closed_at) === month);

  const totals = { total: rows.length, onTime: 0, late: 0, unknown: 0 };
  const teams = new Map();
  const firstCall = { onTime: 0, late: 0, unknown: 0 };
  const lateTickets = [];
  const closedTickets = [];

  for (const row of rows) {
    const outcome = row.work_order_sla_outcome;
    const key = outcome === 'on_time' ? 'onTime' : outcome === 'late' ? 'late' : 'unknown';
    totals[key] += 1;

    const teamName = row.team_name || 'Χωρίς συνεργείο';
    const team = teams.get(teamName) ?? { team: teamName, total: 0, onTime: 0, late: 0, unknown: 0 };
    team.total += 1;
    team[key] += 1;
    teams.set(teamName, team);

    const call = observationRepository.firstCall(row.order_id);
    firstCall[call.outcome === 'on_time' ? 'onTime' : call.outcome === 'late' ? 'late' : 'unknown'] += 1;

    closedTickets.push({
      orderId: row.order_id,
      serviceOrderId: row.service_order_id,
      customer: row.customer_name,
      address: [row.street, row.house_number, row.city].filter(Boolean).join(' '),
      team: teamName,
      service: row.service_description,
      closedAt: row.closed_at,
      outcome,
      hoursLate: outcome === 'late' && row.work_order_sla_date
        ? Number(((new Date(row.closed_at) - new Date(row.work_order_sla_date)) / 3600000).toFixed(1))
        : null,
    });

    if (outcome === 'late' && row.work_order_sla_date) {
      lateTickets.push({
        orderId: row.order_id,
        serviceOrderId: row.service_order_id,
        team: teamName,
        service: row.service_description,
        closedAt: row.closed_at,
        dueAt: row.work_order_sla_date,
        hoursLate: Number(((new Date(row.closed_at) - new Date(row.work_order_sla_date)) / 3600000).toFixed(1)),
      });
    }
  }

  const judgedWork = totals.onTime + totals.late;
  const judgedCalls = firstCall.onTime + firstCall.late;
  return {
    month,
    totals: { ...totals, onTimePercent: percent(totals.onTime, judgedWork) },
    firstCall: { ...firstCall, onTimePercent: percent(firstCall.onTime, judgedCalls) },
    teams: [...teams.values()]
      .map((team) => ({ ...team, onTimePercent: percent(team.onTime, team.onTime + team.late) }))
      .sort((a, b) => b.total - a.total),
    lateTickets: lateTickets.sort((a, b) => b.hoursLate - a.hoursLate).slice(0, 20),
    closedTickets: closedTickets.sort((a, b) => b.closedAt.localeCompare(a.closedAt)).slice(0, 500),
  };
}
