import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT || 4000),
  fionaAuthUrl: process.env.FIONA_AUTH_URL || 'https://fiona.nova.gr/gateway/FionaAuthAPI/1.0/fiona/GR/auth/login',
  fionaOrdersUrl: process.env.FIONA_ORDERS_URL || 'https://fiona.nova.gr/gateway/FionaWebAPI/1.0/fionaWeb/orders/filter',
  fionaWorkordersUrl: process.env.FIONA_WORKORDERS_URL || 'https://fiona.nova.gr/gateway/FionaWebAPI/1.0/fionaWeb/GR/workorders',
  fionaExternalDataUrl: process.env.FIONA_EXTERNAL_DATA_URL || 'https://fiona.nova.gr/gateway/FionaWebAPI/1.0/fionaWeb/GR/external_data',
  fionaOrdersBaseUrl: process.env.FIONA_ORDERS_BASE_URL || 'https://fiona.nova.gr/gateway/FionaWebAPI/1.0/fionaWeb/GR/orders',
  username: process.env.FIONA_USERNAME || '',
  password: process.env.FIONA_PASSWORD || '',
  appPassword: process.env.APP_PASSWORD || process.env.FIONA_PASSWORD || '',
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
