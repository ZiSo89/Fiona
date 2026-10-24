import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backend/src');
const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fiona-tracker-e2e-'));
const dbPath = path.join(dataDirectory, 'tracker.sqlite');

process.env.PORT = process.env.E2E_PORT || '4100';
process.env.CLOSED_TICKETS_DB_PATH = dbPath;
process.env.PROJECT_TRACKER_SESSION_SECRET = 'e2e-secret';
process.env.PROJECT_TRACKER_TEAM_PASSWORDS = JSON.stringify({ 'alexandroupoli|Team One': 'team-secret' });
process.env.PROJECT_TRACKER_ADMIN_PASSWORD = 'admin-secret';
process.env.FIONA_ALEXANDROUPOLI_USERNAME = '';
process.env.FIONA_KOMOTINI_USERNAME = '';
process.env.FIONA_ORESTIADA_USERNAME = '';
process.env.FIONA_USERNAME = '';
process.env.FIONA_PASSWORD = '';

const { createProjectTrackerRepository } = await import(pathToFileURL(path.join(backend, 'repositories/projectTrackerRepository.js')));
const repository = createProjectTrackerRepository(dbPath);
const at = (secondsAgo) => new Date(Date.now() - secondsAgo * 1000).toISOString();
const base = { importedAt: at(0), sourceCategoryId: null };
repository.insertJob({ ...base, storeId: 'alexandroupoli', orderId: 'order-1', teamName: 'Team One', closedAt: at(120), sourceLabel: 'Unknown service', categoryId: null });
repository.insertJob({ ...base, storeId: 'alexandroupoli', orderId: 'order-2', teamName: 'Team One', closedAt: at(60), sourceLabel: 'FTTH Installation', categoryId: 'ftth_installation' });
repository.insertJob({ ...base, storeId: 'komotini', orderId: 'order-1', teamName: 'Team Two', closedAt: at(30), sourceLabel: 'DTH TV Impairment', categoryId: 'dth_tv_impairment' });
repository.close();

process.on('exit', () => fs.rmSync(dataDirectory, { recursive: true, force: true }));
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

await import(pathToFileURL(path.join(backend, 'server.js')));
