import { parseFionaDate } from './orderNormalizer.js';

function toIsoDate(value) {
  return parseFionaDate(value)?.toISOString() || null;
}

export function calculateSlaOutcome(closedAt, dueAt) {
  const closedDate = parseFionaDate(closedAt);
  const dueDate = parseFionaDate(dueAt);
  if (!closedDate || !dueDate) return 'unknown';
  return closedDate <= dueDate ? 'on_time' : 'late';
}

export function findOrderField(payload, field) {
  const seen = new Set();
  const find = (value) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return undefined;
    seen.add(value);
    if (!Array.isArray(value) && value[field] !== null && value[field] !== undefined) {
      return value[field];
    }
    const values = Array.isArray(value) ? value : Object.values(value);
    for (const nested of values) {
      const found = find(nested);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return find(payload);
}

export function buildClosedTicketRecord(order, details, workOrderData, comment, importedAt = new Date()) {
  const lookup = (field) => findOrderField(details, field) ?? order?.[field] ?? null;

  const orderId = String(order?.orderId ?? order?.id ?? lookup('orderId') ?? '').trim();
  const status = String(lookup('orderStatus') ?? '').trim().toUpperCase();
  const closedAt = toIsoDate(lookup('workOrderFinishedOnPremiseTime'));
  if (!orderId || status !== 'COMPLETED' || !closedAt) return null;

  const callDeadline = toIsoDate(lookup('workOrderDeadline') ?? lookup('deadline'));
  const workOrderSlaDate = toIsoDate(
    workOrderData?.workOrderSlaDate ?? lookup('workOrderSlaDate'),
  );
  const workOrderSlaOutcome = calculateSlaOutcome(closedAt, workOrderSlaDate);
  const name = [lookup('firstName'), lookup('lastName')]
    .filter((part) => String(part ?? '').trim())
    .map((part) => String(part).trim())
    .join(' ') || null;

  return {
    order_id: orderId,
    service_order_id: String(lookup('serviceOrderId') ?? order?.serviceOrderId ?? '') || null,
    customer_id: String(lookup('customerId') ?? '') || null,
    account_afm: String(lookup('accountAFM') ?? '') || null,
    customer_name: name,
    team_name: String(lookup('teamName') ?? order?.teamName ?? '') || null,
    city: String(lookup('city') ?? '') || null,
    street: String(lookup('street') ?? '') || null,
    house_number: String(lookup('houseNumber') ?? '') || null,
    phone: String(lookup('telNumber1') ?? '') || null,
    service_description: String(lookup('planServiceDescription') ?? '') || null,
    scheduled_at: toIsoDate(lookup('workOrderScheduledTimeFrom')),
    created_at: toIsoDate(lookup('creationTime')),
    closed_at: closedAt,
    call_deadline: callDeadline,
    order_sla_flag: String(lookup('orderSlaFlag') ?? lookup('SLA') ?? '') || null,
    work_order_sla_date: workOrderSlaDate,
    work_order_sla_outcome: workOrderSlaOutcome,
    work_order_status: String(workOrderData?.workOrderStatus ?? lookup('workOrderStatus') ?? '') || null,
    comment_text: String(comment?.text ?? '') || null,
    comment_at: toIsoDate(comment?.insertTime),
    comment_author: String(comment?.author ?? '') || null,
    imported_at: importedAt.toISOString(),
  };
}