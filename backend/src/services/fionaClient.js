import axios from 'axios';
import { config } from '../config.js';
import { cleanTeamName } from './orderNormalizer.js';

function createRequestError(operation, error) {
  const status = error?.response?.status;
  const statusLabel = status ? `HTTP ${status}` : 'network error';
  const hint = operation === 'login'
    ? 'check FIONA_USERNAME, FIONA_PASSWORD, FIONA_BASIC_AUTH, and the WEB_INIT login request'
    : 'check the Basic authorization value and orders/filter payload';
  const requestError = new Error(`Fiona ${operation} failed (${statusLabel}); ${hint}`);
  requestError.operation = operation;
  requestError.status = status;
  return requestError;
}

// Fiona answers an expired session token with 401 or 403, so both trigger one fresh login.
const isSessionRejection = (error, operation) => error?.operation === operation
  && (error.status === 401 || error.status === 403);

const COMMENT_CACHE_MS = 5 * 60 * 1000;
const SLA_CACHE_MS = 60 * 60 * 1000;

function pruneCache(cache, maxAgeMs, now) {
  for (const [key, entry] of cache) {
    if (now - entry.fetchedAt >= maxAgeMs) cache.delete(key);
  }
}

export class FionaClient {
  constructor(clientConfig = config, httpClient = null) {
    this.config = clientConfig;
    this.sessionToken = null;
    this.workOrderSlaCache = new Map();
    this.commentCache = new Map();
    this.client = httpClient || axios.create({
      timeout: 15000,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; FionaExporter/1.0)',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://fiona.nova.gr/',
      },
    });
  }

  async login() {
    if (!this.config.username || !this.config.password) {
      throw new Error('FIONA_USERNAME and FIONA_PASSWORD must be set in backend/.env');
    }

    let response;
    try {
      response = await this.client.post(this.config.fionaAuthUrl, {
        channel: 'WEB_INIT',
        username: this.config.username,
        password: this.config.password,
      }, {
        headers: this.getAuthorizationHeaders(),
      });
    } catch (error) {
      throw createRequestError('login', error);
    }
    const token = response?.data?.sessionToken;

    if (!token) throw new Error('Fiona login did not return a session token');

    this.sessionToken = token;
    return token;
  }

  async ensureValidToken() {
    if (!this.sessionToken) await this.login();
    return this.sessionToken;
  }

  getAuthorizationHeaders() {
    if (!this.config.basicAuth) return {};

    const authorization = this.config.basicAuth.startsWith('Basic ')
      ? this.config.basicAuth
      : `Basic ${this.config.basicAuth}`;
    return { Authorization: authorization };
  }

  async requestOrders(sessionToken) {
    if (!this.config.basicAuth) {
      throw new Error('FIONA_BASIC_AUTH must be set in backend/.env');
    }

    const payload = {
      countryCode: this.config.countryCode,
      limit: this.config.filterLimit,
      offset: this.config.filterOffset,
      sessionTokenID: sessionToken,
      statuses: this.config.filterStatuses,
    };

    for (let attempt = 0; attempt <= 3; attempt += 1) {
      try {
        const response = await this.client.post(
          this.config.fionaOrdersUrl,
          payload,
          {
            headers: this.getAuthorizationHeaders(),
          }
        );
        return response?.data ?? {};
      } catch (error) {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
          throw createRequestError('orders/filter', error);
        }
        if (status !== 429 || attempt === 3) {
          if (status) throw createRequestError('orders/filter', error);
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 60000));
      }
    }

    throw new Error('Fiona orders/filter request ended unexpectedly');
  }

  async requestWithSession(operation, request) {
    const requestWithRetry = async (sessionToken) => {
      for (let attempt = 0; attempt <= 3; attempt += 1) {
        try {
          const response = await request(sessionToken);
          if (response && typeof response === 'object' && Object.hasOwn(response, 'data')) {
            return response.data ?? {};
          }
          return response ?? {};
        } catch (error) {
          const status = error?.response?.status;
          if (status === 401 || status === 403) throw createRequestError(operation, error);
          if (status !== 429 || attempt === 3) {
            if (status) throw createRequestError(operation, error);
            throw error;
          }
          console.warn(`Fiona ${operation} rate limited; retry ${attempt + 1}/3 in 60 seconds.`);
          await new Promise((resolve) => setTimeout(resolve, 60000));
        }
      }
      throw new Error(`Fiona ${operation} retry loop ended unexpectedly`);
    };

    let sessionToken = await this.ensureValidToken();
    try {
      return await requestWithRetry(sessionToken);
    } catch (error) {
      if (!isSessionRejection(error, operation)) throw error;
      this.sessionToken = null;
      sessionToken = await this.login();
      return requestWithRetry(sessionToken);
    } 
  }

  async dailyWorkorders(workDate, serviceGroups) {
    if (!this.config.basicAuth) {
      throw new Error('FIONA_BASIC_AUTH must be set in backend/.env');
    }

    const payload = await this.requestWithSession('workorders', (sessionToken) => this.client.post(
      this.config.fionaWorkordersUrl,
      {
        sessionToken,
        workDate,
        teamUniqueId: '',
        teamSkill: '',
        serviceGroup: serviceGroups,
        sapTeamId: '',
      },
      { headers: this.getAuthorizationHeaders() },
    ));

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Unexpected Fiona workorders response shape');
    }
    return (Array.isArray(payload.UserTeams) ? payload.UserTeams : []).flatMap((team) => (
      (Array.isArray(team?.TeamWorkOrders) ? team.TeamWorkOrders : []).map((workorder) => ({
        ...workorder,
        teamName: cleanTeamName(workorder?.teamName) ?? cleanTeamName(team?.teamName),
        teamGroupName: cleanTeamName(workorder?.serviceGroupName),
      }))
    ));
  }

  async orderDetails(orderId) {
    if (!this.config.basicAuth) {
      throw new Error('FIONA_BASIC_AUTH must be set in backend/.env');
    }

    return this.requestWithSession('order details', (sessionToken) => this.client.get(
      `${this.config.fionaOrdersBaseUrl}/${encodeURIComponent(orderId)}`,
      {
        headers: this.getAuthorizationHeaders(),
        params: { sessionToken },
      },
    ));
  }

  async fetchWorkOrderSlaDetailsWithSession(serviceOrderId) {
    return this.requestWithSession('external data', (sessionToken) => (
      this.fetchWorkOrderSlaDetails(serviceOrderId, sessionToken)
    ));
  }

  async fetchLatestCommentWithSession(orderId) {
    return this.requestWithSession('comments', (sessionToken) => (
      this.fetchLatestComment(orderId, sessionToken)
    ));
  }

  getWorkOrders(payload) {
    if (Array.isArray(payload?.FilteredOrders)) return payload.FilteredOrders;
    if (Array.isArray(payload?.filteredOrders)) return payload.filteredOrders;
    if (Array.isArray(payload?.UserTeams)) {
      return payload.UserTeams.flatMap((team) => Array.isArray(team?.TeamWorkOrders) ? team.TeamWorkOrders : []);
    }
    return [];
  }

  async fetchWorkOrderSlaDetails(serviceOrderId, sessionToken) {
    const url = `${this.config.fionaExternalDataUrl}/${encodeURIComponent(serviceOrderId)}/external`;
    const response = await this.client.get(url, {
      headers: this.getAuthorizationHeaders(),
      params: { sessionToken },
    });
    const orderData = response?.data?.OrderData ?? {};
    const activities = Array.isArray(orderData.ActivityData) ? orderData.ActivityData : [];
    const equipmentData = Array.isArray(orderData.EquipmentData) ? orderData.EquipmentData : [];

    return {
      workOrderSlaDate: orderData.WorkOrderData?.slaDate || null,
      workOrderStatus: orderData.WorkOrderData?.status || null,
      slaSurpassed: orderData.WorkOrderData?.slaSurpassed || null,
      externalData: {
        escalateLimit: orderData.ExternalData?.escalateLimit || null,
        cliNumber: orderData.ExternalData?.cliNumber || null,
        problemDescription: orderData.ExternalData?.problemDescription || null,
        floor: orderData.ExternalData?.floor || null,
        buildingId: orderData.ExternalData?.buildingId || null,
        apartment: orderData.ExternalData?.crmAppartment || null,
        googleMapsData: orderData.AddressData?.googleMapsData || null,
        nextActionDate: activities.find((activity) => activity?.nextActionDate)?.nextActionDate || null,
      },
      equipmentDescription: equipmentData
        .map((equipment) => equipment?.equipmentDescription)
        .filter(Boolean)
        .join(', ') || null,
      hasEquipmentSerialNumber: equipmentData.some((equipment) => Boolean(String(equipment?.equipmentSerialNumber || '').trim())),
      activities: activities.map((activity) => ({
        activityType: activity?.activityType || null,
        activitySlaDueDate: activity?.activitySlaDueDate || null,
        activitySlaStartDate: activity?.activitySlaStartDate || null,
        activityClosureDate: activity?.activityClosureDate || null,
        activitySubStatus: activity?.activitySubStatus || null,
      })),
    };
  }

  applyExternalDetails(order, details) {
    if (!details) return;
    if (details.workOrderSlaDate) order.workOrderSlaDate = details.workOrderSlaDate;
    if (details.workOrderStatus) order.workOrderStatus = details.workOrderStatus;
    if (details.slaSurpassed) order.slaSurpassed = details.slaSurpassed;
    if (details.activities?.length) order.activities = details.activities;
    if (details.externalData) order.externalData = details.externalData;
    if (details.equipmentDescription) order.equipmentDescription = details.equipmentDescription;
    if (details.hasEquipmentSerialNumber !== undefined) {
      order.hasEquipmentSerialNumber = details.hasEquipmentSerialNumber;
    }
  }

  async runWithLimit(items, handler, limit = 4) {
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await handler(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  }

  async fetchLatestComment(orderId, sessionToken) {
    const url = `${this.config.fionaOrdersBaseUrl}/${encodeURIComponent(orderId)}/comments`;
    const response = await this.client.get(url, {
      headers: this.getAuthorizationHeaders(),
      params: { sessionToken },
    });
    const comments = Array.isArray(response?.data?.OrderComments) ? response.data.OrderComments : [];
    const newest = comments
      .filter((comment) => comment?.commentText)
      .sort((a, b) => String(b.dateSort || '').localeCompare(String(a.dateSort || ''))
        || String(b.insertTime || '').localeCompare(String(a.insertTime || '')))[0];

    if (!newest) return null;
    return {
      text: String(newest.commentText).trim(),
      insertTime: newest.insertTime || null,
      author: [newest.firstName, newest.lastName].filter(Boolean).join(' ') || null,
    };
  }

  async enrichLatestComments(payload, sessionToken) {
    const pending = [];
    const now = Date.now();
    pruneCache(this.commentCache, COMMENT_CACHE_MS, now);

    for (const order of this.getWorkOrders(payload)) {
      const orderId = order?.id ?? order?.orderId;
      if (!orderId) continue;

      const cached = this.commentCache.get(orderId);
      if (cached) {
        order.latestComment = cached.comment;
        continue;
      }
      pending.push({ order, orderId });
    }

    await this.runWithLimit(pending, async (item) => {
      try {
        const comment = await this.fetchLatestComment(item.orderId, sessionToken);
        this.commentCache.set(item.orderId, { comment, fetchedAt: Date.now() });
        item.order.latestComment = comment;
      } catch (error) {
        this.commentCache.set(item.orderId, { comment: null, fetchedAt: Date.now() });
        console.warn(`Could not load Fiona comments for ${item.orderId}: ${error.message}`);
      }
    });
    return payload;
  }

  async enrichOrders(payload, sessionToken) {
    await this.enrichWorkOrderSlaDates(payload, sessionToken);
    return this.enrichLatestComments(payload, sessionToken);
  }

  async enrichWorkOrderSlaDates(payload, sessionToken) {
    const orders = this.getWorkOrders(payload);
    const pending = [];
    const now = Date.now();
    pruneCache(this.workOrderSlaCache, SLA_CACHE_MS, now);

    for (const order of orders) {
      const serviceOrderId = order?.serviceOrderId || order?.orderId || order?.id;
      if (!serviceOrderId) continue;

      const cached = this.workOrderSlaCache.get(serviceOrderId);
      if (cached) {
        this.applyExternalDetails(order, cached.details);
        continue;
      }

      pending.push({ order, serviceOrderId });
    }

    await this.runWithLimit(pending, async (item) => {
      try {
        const details = await this.fetchWorkOrderSlaDetails(item.serviceOrderId, sessionToken);
        this.workOrderSlaCache.set(item.serviceOrderId, { details, fetchedAt: Date.now() });
        this.applyExternalDetails(item.order, details);
      } catch (error) {
        this.workOrderSlaCache.set(item.serviceOrderId, { details: null, fetchedAt: Date.now() });
        console.warn(`Could not load Fiona SLA date for ${item.serviceOrderId}: ${error.message}`);
      }
    });
    return payload;
  }

  async fetchOrders() {
    const sessionToken = await this.ensureValidToken();

    try {
      const payload = await this.requestOrders(sessionToken);
      return await this.enrichOrders(payload, sessionToken);
    } catch (error) {
      if (!isSessionRejection(error, 'orders/filter')) throw error;

      this.sessionToken = null;
      const refreshedToken = await this.login();
      const payload = await this.requestOrders(refreshedToken);
      return this.enrichOrders(payload, refreshedToken);
    }
  }
}
