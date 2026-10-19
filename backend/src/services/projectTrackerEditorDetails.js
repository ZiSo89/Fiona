import { findOrderField } from './closedTicketSla.js';

const textField = (source, field) => {
  const value = findOrderField(source, field);
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
};

function addressFrom(stored, order) {
  const street = stored?.street || textField(order, 'street');
  const houseNumber = stored?.house_number || textField(order, 'houseNumber');
  const postalCode = textField(order, 'postalCode') || textField(order, 'postCode')
    || textField(order, 'zipCode') || textField(order, 'postcode');
  const city = stored?.city || textField(order, 'city');
  const streetLine = [street, houseNumber].filter(Boolean).join(' ');
  const locality = [...new Set([postalCode, city].filter(Boolean))].join(' ');
  return [streetLine, locality].filter(Boolean).join(', ') || null;
}

export function createProjectTrackerEditorDetails({ getClient, getStoredDetails, getCachedDetails, saveCachedDetails }) {
  return async ({ storeId, orderId }) => {
    const stored = getStoredDetails(storeId, orderId);
    const cached = getCachedDetails?.(storeId, orderId) ?? null;
    const client = cached ? null : getClient(storeId);
    let order = null;
    let latestComment = cached?.commentText ? { text: cached.commentText, insertTime: cached.commentAt } : null;
    let commentLoaded = Boolean(cached);

    if (client) {
      try {
        order = await client.orderDetails(orderId);
      } catch {
        order = null;
      }

      try {
        latestComment = await client.fetchLatestCommentWithSession(orderId);
        commentLoaded = true;
      } catch {
        commentLoaded = false;
      }
      if (commentLoaded && saveCachedDetails) {
        saveCachedDetails(storeId, orderId, {
          problemDescription: null,
          commentText: latestComment?.text ?? null,
          commentAt: latestComment?.insertTime ?? null,
          fetchedAt: new Date().toISOString(),
        });
      }
    }

    const customerName = stored?.customer_name
      || [textField(order, 'firstName'), textField(order, 'lastName')].filter(Boolean).join(' ')
      || null;
    const commentText = latestComment?.text || stored?.comment_text || null;
    const commentAt = latestComment?.insertTime || stored?.comment_at || null;

    return {
      serviceOrderId: stored?.service_order_id || textField(order, 'serviceOrderId') || orderId,
      serviceDescription: stored?.service_description || textField(order, 'planServiceDescription') || null,
      customerName,
      address: addressFrom(stored, order),
      latestComment: commentText ? { text: commentText, at: commentAt } : null,
    };
  };
}