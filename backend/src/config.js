import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const parseList = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

const parseObject = (value) => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export function buildFionaStores(environment = process.env) {
  const sharedPassword = environment.FIONA_PASSWORD || '';
  const sharedBasicAuth = environment.FIONA_BASIC_AUTH || '';
  const baseConfig = Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'fionaStores'));
  const stores = [
    {
      id: 'alexandroupoli',
      name: 'Αλεξανδρούπολη',
      username: environment.FIONA_ALEXANDROUPOLI_USERNAME || environment.FIONA_USERNAME || '',
      basicAuth: environment.FIONA_ALEXANDROUPOLI_BASIC_AUTH || sharedBasicAuth,
      closedServiceGroups: parseList(environment.FIONA_ALEXANDROUPOLI_CLOSED_SERVICE_GROUPS),
      closedServiceGroupMatch: environment.FIONA_ALEXANDROUPOLI_SERVICE_GROUP_MATCH || 'ALEXANDROUPOL',
    },
    {
      id: 'komotini',
      name: 'Κομοτηνή',
      username: environment.FIONA_KOMOTINI_USERNAME || '',
      basicAuth: environment.FIONA_KOMOTINI_BASIC_AUTH || sharedBasicAuth,
      closedServiceGroups: parseList(environment.FIONA_KOMOTINI_CLOSED_SERVICE_GROUPS),
      closedServiceGroupMatch: environment.FIONA_KOMOTINI_SERVICE_GROUP_MATCH || 'KOMOTINI',
    },
    {
      id: 'orestiada',
      name: 'Ορεστιάδα',
      username: environment.FIONA_ORESTIADA_USERNAME || '',
      basicAuth: environment.FIONA_ORESTIADA_BASIC_AUTH || sharedBasicAuth,
      closedServiceGroups: parseList(environment.FIONA_ORESTIADA_CLOSED_SERVICE_GROUPS),
      closedServiceGroupMatch: environment.FIONA_ORESTIADA_SERVICE_GROUP_MATCH || 'ORESTIADA',
    },
  ];

  return stores.map((store) => ({
    ...baseConfig,
    ...store,
    storeId: store.id,
    storeName: store.name,
    password: sharedPassword,
    configured: Boolean(store.username && sharedPassword),
  }));
}

export const config = {
  dbClient: process.env.DB_CLIENT || 'sqlite',
  port: Number(process.env.PORT || 4000),
  fionaAuthUrl: process.env.FIONA_AUTH_URL || 'https://fiona.nova.gr/gateway/FionaAuthAPI/1.0/fiona/GR/auth/login',
  fionaOrdersUrl: process.env.FIONA_ORDERS_URL || 'https://fiona.nova.gr/gateway/FionaWebAPI/1.0/fionaWeb/orders/filter',
  fionaWorkordersUrl: process.env.FIONA_WORKORDERS_URL || 'https://fiona.nova.gr/gateway/FionaWebAPI/1.0/fionaWeb/GR/workorders',
  fionaExternalDataUrl: process.env.FIONA_EXTERNAL_DATA_URL || 'https://fiona.nova.gr/gateway/FionaWebAPI/1.0/fionaWeb/GR/external_data',
  fionaOrdersBaseUrl: process.env.FIONA_ORDERS_BASE_URL || 'https://fiona.nova.gr/gateway/FionaWebAPI/1.0/fionaWeb/GR/orders',
  username: process.env.FIONA_USERNAME || '',
  password: process.env.FIONA_PASSWORD || '',
  appPassword: process.env.APP_PASSWORD || '',
  projectTrackerSessionSecret: process.env.PROJECT_TRACKER_SESSION_SECRET || process.env.APP_PASSWORD || '',
  projectTrackerTeamPasswords: parseObject(process.env.PROJECT_TRACKER_TEAM_PASSWORDS),
  projectTrackerAdminPassword: process.env.PROJECT_TRACKER_ADMIN_PASSWORD || '',
  projectTrackerCategoryMap: parseObject(process.env.PROJECT_TRACKER_CATEGORY_MAP),
  projectTrackerSyncIntervalMs: Number(process.env.PROJECT_TRACKER_SYNC_INTERVAL_MS || 900000),
  projectTrackerLookbackDays: Number(process.env.PROJECT_TRACKER_LOOKBACK_DAYS || 14),
  basicAuth: process.env.FIONA_BASIC_AUTH || '',
  countryCode: process.env.FIONA_COUNTRY_CODE || 'GR',
  filterLimit: process.env.FIONA_FILTER_LIMIT || '100',
  filterOffset: process.env.FIONA_FILTER_OFFSET || '-1',
  filterStatuses: (process.env.FIONA_FILTER_STATUSES || 'OPEN,TO CALL,APPOINTMENT,CALL LATER')
    .split(',')
    .map((status) => status.trim())
    .filter(Boolean),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 120000),
  closedTicketsDbPath: process.env.CLOSED_TICKETS_DB_PATH
    || path.join(backendDirectory, 'data', 'closed-tickets.sqlite'),
  closedTicketServiceGroups: (process.env.FIONA_CLOSED_SERVICE_GROUPS || '395')
    .split(',')
    .map((group) => group.trim())
    .filter(Boolean),
  fionaRequestMinDelayMs: Number(process.env.FIONA_REQUEST_MIN_DELAY_MS || 1000),
  fionaRequestMaxDelayMs: Number(process.env.FIONA_REQUEST_MAX_DELAY_MS || 2500),
};

config.fionaStores = buildFionaStores(process.env);
