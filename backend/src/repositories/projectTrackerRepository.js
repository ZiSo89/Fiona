import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { athensMonthOf } from '../services/closedTicketStats.js';
import {
  getProjectTrackerCategory,
  mapProjectTrackerCategory,
  projectTrackerJobFromRow,
} from '../services/projectTrackerCatalog.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Athens',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function athensDayOf(value) {
  const parts = Object.fromEntries(dayFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function validateDate(value) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.exec(String(value));
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === value;
}

function addUtcDays(value, amount) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString();
}

function filterForScope(rows, storeId, teamName) {
  return rows.filter((row) => (!storeId || row.store_id === storeId)
    && (!teamName || row.team_name === teamName));
}

export function createProjectTrackerRepository(dbPath = config.closedTicketsDbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_tracker_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_tracker_jobs (
      store_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      team_name TEXT NOT NULL,
      closed_at TEXT NOT NULL,
      source_label TEXT,
      source_category_id TEXT,
      category_id TEXT,
      points_override INTEGER,
      imported_at TEXT NOT NULL,
      corrected_at TEXT,
      PRIMARY KEY (store_id, order_id)
    );
    CREATE INDEX IF NOT EXISTS project_tracker_jobs_month_idx
      ON project_tracker_jobs (store_id, team_name, closed_at);
    CREATE TABLE IF NOT EXISTS project_tracker_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      editor_team TEXT NOT NULL,
      previous_category_id TEXT,
      next_category_id TEXT,
      previous_points_override INTEGER,
      next_points_override INTEGER,
      changed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_tracker_editor_details (
      store_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      problem_description TEXT,
      comment_text TEXT,
      comment_at TEXT,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (store_id, order_id)
    );
  `);

  const insertJob = database.prepare(`
    INSERT OR IGNORE INTO project_tracker_jobs (
      store_id, order_id, team_name, closed_at, source_label, source_category_id,
      category_id, points_override, imported_at
    ) VALUES (
      @storeId, @orderId, @teamName, @closedAt, @sourceLabel, @sourceCategoryId,
      @categoryId, NULL, @importedAt
    )
  `);
  const jobById = database.prepare('SELECT * FROM project_tracker_jobs WHERE store_id = ? AND order_id = ?');
  const listScopedJobs = database.prepare(`
    SELECT * FROM project_tracker_jobs
    WHERE closed_at >= ? AND closed_at < ?
    ORDER BY closed_at, order_id
  `);
  const updateJob = database.prepare(`
    UPDATE project_tracker_jobs
    SET category_id = ?, points_override = ?, corrected_at = ?
    WHERE store_id = ? AND order_id = ?
  `);
  const insertAudit = database.prepare(`
    INSERT INTO project_tracker_audit (
      store_id, order_id, editor_team, previous_category_id, next_category_id,
      previous_points_override, next_points_override, changed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getEditorDetailsCache = database.prepare(`
    SELECT problem_description AS problemDescription, comment_text AS commentText,
      comment_at AS commentAt, fetched_at AS fetchedAt
    FROM project_tracker_editor_details WHERE store_id = ? AND order_id = ?
  `);
  const upsertEditorDetailsCache = database.prepare(`
    INSERT INTO project_tracker_editor_details (
      store_id, order_id, problem_description, comment_text, comment_at, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(store_id, order_id) DO UPDATE SET
      problem_description = excluded.problem_description,
      comment_text = excluded.comment_text,
      comment_at = excluded.comment_at,
      fetched_at = excluded.fetched_at
  `);
  const unmappedJobs = database.prepare(`
    SELECT * FROM project_tracker_jobs WHERE category_id IS NULL ORDER BY closed_at, order_id
  `);
  const correctJobTransaction = database.transaction((job, correction) => {
    const previous = jobById.get(correction.storeId, correction.orderId);
    if (!previous || previous.team_name !== correction.teamName) return null;
    if (previous.category_id === correction.categoryId
      && previous.points_override === correction.pointsOverride) return projectTrackerJobFromRow(previous);

    updateJob.run(
      correction.categoryId,
      correction.pointsOverride,
      correction.changedAt,
      correction.storeId,
      correction.orderId,
    );
    insertAudit.run(
      correction.storeId,
      correction.orderId,
      correction.teamName,
      previous.category_id,
      correction.categoryId,
      previous.points_override,
      correction.pointsOverride,
      correction.changedAt,
    );
    return projectTrackerJobFromRow(jobById.get(correction.storeId, correction.orderId));
  });
  const applyCategoryMapTransaction = database.transaction((categoryMap, changedAt) => {
    let remapped = 0;
    for (const row of unmappedJobs.all()) {
      const categoryTokens = String(row.source_category_id ?? '').split('|').map((token) => token.trim()).filter(Boolean);
      const category = mapProjectTrackerCategory(categoryMap, row.source_label, ...categoryTokens);
      if (!category) continue;
      updateJob.run(category.id, row.points_override, changedAt, row.store_id, row.order_id);
      insertAudit.run(
        row.store_id,
        row.order_id,
        'SYSTEM:CATEGORY_MAP',
        row.category_id,
        category.id,
        row.points_override,
        row.points_override,
        changedAt,
      );
      remapped += 1;
    }
    return remapped;
  });

  return {
    ensureCutoverAt(now = new Date()) {
      const value = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
      database.prepare(`
        INSERT OR IGNORE INTO project_tracker_settings (setting_key, setting_value)
        VALUES ('activated_at', ?)
      `).run(value);
      return database.prepare('SELECT setting_value FROM project_tracker_settings WHERE setting_key = ?')
        .get('activated_at').setting_value;
    },
    getCutoverAt() {
      return database.prepare('SELECT setting_value FROM project_tracker_settings WHERE setting_key = ?')
        .get('activated_at')?.setting_value ?? null;
    },
    hasJob(storeId, orderId) {
      return Boolean(jobById.get(storeId, orderId));
    },
    insertJob(job) {
      if (!job.storeId || !job.orderId || !job.teamName || !job.closedAt || !job.importedAt) return false;
      if (job.categoryId && !getProjectTrackerCategory(job.categoryId)) throw new Error('Unknown project tracker category');
      return insertJob.run(job).changes > 0;
    },
    applyCategoryMap(categoryMap, changedAt = new Date().toISOString()) {
      return applyCategoryMapTransaction(categoryMap, changedAt);
    },
    getJob(storeId, orderId) {
      const row = jobById.get(storeId, orderId);
      return row ? projectTrackerJobFromRow(row) : null;
    },
    getEditorDetailsCache(storeId, orderId) {
      return getEditorDetailsCache.get(storeId, orderId) ?? null;
    },
    saveEditorDetailsCache(storeId, orderId, details) {
      upsertEditorDetailsCache.run(
        storeId,
        orderId,
        details.problemDescription,
        details.commentText,
        details.commentAt,
        details.fetchedAt,
      );
    },
    getProfiles(storeNames = {}) {
      return database.prepare(`
        SELECT store_id, team_name, COUNT(*) AS job_count,
          SUM(CASE WHEN category_id IS NULL THEN 1 ELSE 0 END) AS unmapped_count
        FROM project_tracker_jobs
        GROUP BY store_id, team_name
        ORDER BY store_id, team_name
      `).all().map((row) => ({
        storeId: row.store_id,
        storeName: storeNames[row.store_id] || row.store_id,
        teamName: row.team_name,
        jobCount: row.job_count,
        unmappedCount: row.unmapped_count,
      }));
    },
    getMonthJobs(month, storeId = null, teamName = null) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) throw new Error('month must use YYYY-MM');
      const [year, monthNumber] = month.split('-').map(Number);
      const firstDay = `${month}-01`;
      const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
      const rows = listScopedJobs.all(addUtcDays(firstDay, -1), addUtcDays(nextMonth, 1));
      return filterForScope(rows, storeId, teamName)
        .filter((row) => athensMonthOf(row.closed_at) === month)
        .map(projectTrackerJobFromRow);
    },
    getDayJobs(day, storeId = null, teamName = null) {
      if (!validateDate(day)) throw new Error('date must use YYYY-MM-DD');
      const rows = listScopedJobs.all(addUtcDays(day, -1), addUtcDays(day, 2));
      return filterForScope(rows, storeId, teamName)
        .filter((row) => athensDayOf(row.closed_at) === day)
        .map(projectTrackerJobFromRow);
    },
    correctJob(correction) {
      if (correction.categoryId !== null && !getProjectTrackerCategory(correction.categoryId)) {
        throw new Error('Unknown project tracker category');
      }
      if (correction.pointsOverride !== null
        && (!Number.isInteger(correction.pointsOverride) || correction.pointsOverride < 0 || correction.pointsOverride > 1000)) {
        throw new Error('pointsOverride must be an integer from 0 to 1000');
      }
      return correctJobTransaction(null, correction);
    },
    getAudit(storeId, orderId) {
      return database.prepare(`
        SELECT editor_team AS editorTeam, previous_category_id AS previousCategoryId,
          next_category_id AS nextCategoryId, previous_points_override AS previousPointsOverride,
          next_points_override AS nextPointsOverride, changed_at AS changedAt
        FROM project_tracker_audit WHERE store_id = ? AND order_id = ? ORDER BY id
      `).all(storeId, orderId);
    },
    close() {
      database.close();
    },
  };
}