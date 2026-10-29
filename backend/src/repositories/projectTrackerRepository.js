import { openDatabase } from './database.js';
import { config } from '../config.js';
import { athensMonthOf } from '../services/closedTicketStats.js';
import {
  getProjectTrackerCategory,
  matchProjectTrackerCategory,
  mapProjectTrackerCategory,
  projectTrackerJobFromRow,
} from '../services/projectTrackerCatalog.js';

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

export async function createProjectTrackerRepository(dbPath = config.closedTicketsDbPath, client = config.dbClient) {
  const database = await openDatabase(dbPath, client);
  try {
    if (database.dialect === 'sqlite') {
      await database.pragma('journal_mode = WAL');
      await database.pragma('busy_timeout = 5000');
      await database.exec(`
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
      points_override_manual INTEGER NOT NULL DEFAULT 0,
      scoring_version INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      corrected_at TEXT,
      PRIMARY KEY (store_id, order_id)
    );
    CREATE INDEX IF NOT EXISTS project_tracker_jobs_month_idx
      ON project_tracker_jobs (store_id, team_name, closed_at);
    CREATE TABLE IF NOT EXISTS project_tracker_month_locks (
      store_id TEXT NOT NULL,
      team_name TEXT NOT NULL,
      month TEXT NOT NULL,
      locked INTEGER NOT NULL,
      changed_at TEXT NOT NULL,
      PRIMARY KEY (store_id, team_name, month)
    );
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

      const jobColumns = new Set((await database.prepare('PRAGMA table_info(project_tracker_jobs)').all()).map((column) => column.name));
      if (!jobColumns.has('scoring_version')) {
        await database.exec('ALTER TABLE project_tracker_jobs ADD COLUMN scoring_version INTEGER NOT NULL DEFAULT 0');
      }
      if (!jobColumns.has('points_override_manual')) {
        await database.exec('ALTER TABLE project_tracker_jobs ADD COLUMN points_override_manual INTEGER NOT NULL DEFAULT 0');
      }

      }
    const insertJob = database.prepare(`
    INSERT OR IGNORE INTO project_tracker_jobs (
      store_id, order_id, team_name, closed_at, source_label, source_category_id,
      category_id, points_override, scoring_version, imported_at
    ) VALUES (
      @storeId, @orderId, @teamName, @closedAt, @sourceLabel, @sourceCategoryId,
      @categoryId, @pointsOverride, @scoringVersion, @importedAt
    )
  `);
    const jobById = database.prepare('SELECT * FROM project_tracker_jobs WHERE store_id = ? AND order_id = ?');
    const monthLockById = database.prepare(`
    SELECT locked, changed_at AS changedAt FROM project_tracker_month_locks
    WHERE store_id = ? AND team_name = ? AND month = ?
  `);
    const upsertMonthLock = database.prepare(`
    INSERT INTO project_tracker_month_locks (store_id, team_name, month, locked, changed_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(store_id, team_name, month) DO UPDATE SET
      locked = excluded.locked, changed_at = excluded.changed_at
  `);
    const listScopedJobs = database.prepare(`
    SELECT * FROM project_tracker_jobs
    WHERE closed_at >= ? AND closed_at < ?
    ORDER BY closed_at, order_id
  `);
    const updateJob = database.prepare(`
    UPDATE project_tracker_jobs
    SET category_id = ?, points_override = ?, points_override_manual = ?, corrected_at = ?, scoring_version = ?
    WHERE store_id = ? AND order_id = ?
  `);
    const updateJobScoring = database.prepare(`
    UPDATE project_tracker_jobs
    SET points_override = ?, source_category_id = COALESCE(?, source_category_id), scoring_version = ?
    WHERE store_id = ? AND order_id = ?
  `);
    const updateJobTeamName = database.prepare(`
    UPDATE project_tracker_jobs
    SET team_name = ?
    WHERE store_id = ? AND order_id = ? AND team_name != ?
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
    const correctJobTransaction = database.transaction(async (job, correction) => {
      const previous = await jobById.get(correction.storeId, correction.orderId);
      if (!previous || previous.team_name !== correction.teamName) return null;
      if (!correction.allowLocked && (await monthLockById.get(
        correction.storeId,
        correction.teamName,
        athensMonthOf(previous.closed_at),
      ))?.locked) {
        const error = new Error('Ο μήνας έχει εγκριθεί για πληρωμή και δεν αλλάζει.');
        error.code = 'PROJECT_TRACKER_MONTH_LOCKED';
        throw error;
      }
      const pointsOverride = correction.pointsOverride === undefined
        ? (previous.category_id === correction.categoryId ? previous.points_override : null)
        : correction.pointsOverride;
      const pointsOverrideManual = correction.pointsOverride === undefined
        ? (previous.category_id === correction.categoryId ? previous.points_override_manual : 0)
        : Number(correction.pointsOverride !== null);
      if (previous.category_id === correction.categoryId
        && previous.points_override === pointsOverride
        && previous.points_override_manual === pointsOverrideManual) return projectTrackerJobFromRow(previous);

      await updateJob.run(
        correction.categoryId,
        pointsOverride,
        pointsOverrideManual,
        correction.changedAt,
        previous.category_id === correction.categoryId ? previous.scoring_version : 0,
        correction.storeId,
        correction.orderId,
      );
      await insertAudit.run(
        correction.storeId,
        correction.orderId,
        correction.teamName,
        previous.category_id,
        correction.categoryId,
        previous.points_override,
        pointsOverride,
        correction.changedAt,
      );
      return projectTrackerJobFromRow(await jobById.get(correction.storeId, correction.orderId));
    });
    const updateJobScoringTransaction = database.transaction(async (storeId, orderId, pointsOverride, sourceCategoryId, changedAt, scoringVersion) => {
      const previous = await jobById.get(storeId, orderId);
      if (!previous) return false;

      const pointsChanged = !previous.points_override_manual && previous.points_override !== pointsOverride;
      const sourceCategoryChanged = sourceCategoryId && previous.source_category_id !== sourceCategoryId;
      const versionChanged = previous.scoring_version !== scoringVersion;
      if (!pointsChanged && !sourceCategoryChanged && !versionChanged) return false;

      await updateJobScoring.run(
        previous.points_override_manual ? previous.points_override : pointsOverride,
        sourceCategoryId,
        scoringVersion,
        storeId,
        orderId,
      );
      if (pointsChanged) {
        await insertAudit.run(
          storeId,
          orderId,
          'SYSTEM:SCORING_RULE',
          previous.category_id,
          previous.category_id,
          previous.points_override,
          pointsOverride,
          changedAt,
        );
      }
      return pointsChanged;
    });
    const applyCategoryMapTransaction = database.transaction(async (categoryMap, changedAt) => {
      let remapped = 0;
      for (const row of await unmappedJobs.all()) {
        const categoryTokens = String(row.source_category_id ?? '').split('|').map((token) => token.trim()).filter(Boolean);
        const category = mapProjectTrackerCategory(categoryMap, row.source_label, ...categoryTokens);
        if (!category) continue;
        await updateJob.run(category.id, row.points_override, 0, changedAt, 0, row.store_id, row.order_id);
        await insertAudit.run(
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
    // Re-derives categories of uncorrected jobs from their stored Fiona category tokens using the built-in catalog.
    // Jobs in months locked for payment are left untouched.
    const migrateCategoryCatalogTransaction = database.transaction(async (changedAt) => {
      let migrated = 0;
      for (const row of await database.prepare('SELECT * FROM project_tracker_jobs').all()) {
        const category = matchProjectTrackerCategory(
          ...String(row.source_category_id ?? '').split('|').map((token) => token.trim()).filter(Boolean),
        );
        if (!category || category.id === row.category_id) continue;
        if ((await monthLockById.get(row.store_id, row.team_name, athensMonthOf(row.closed_at)))?.locked) continue;
        await updateJob.run(category.id, null, 0, null, 0, row.store_id, row.order_id);
        await insertAudit.run(
          row.store_id,
          row.order_id,
          'SYSTEM:CATEGORY_MIGRATION',
          row.category_id,
          category.id,
          row.points_override,
          null,
          changedAt,
        );
        migrated += 1;
      }
      return migrated;
    });
    await migrateCategoryCatalogTransaction(new Date().toISOString());

    return {
      async getJobsWithObsoleteCategory() {
        return (await database.prepare('SELECT * FROM project_tracker_jobs WHERE category_id IS NOT NULL ORDER BY closed_at, order_id')
          .all())
          .filter((row) => !getProjectTrackerCategory(row.category_id))
          .map((row) => ({ storeId: row.store_id, orderId: row.order_id, sourceCategoryId: row.source_category_id }));
      },
      // Moves a job off a removed category; the audit row lets the change be reviewed later.
      async remapObsoleteJob(storeId, orderId, categoryId, sourceCategoryId, changedAt = new Date().toISOString()) {
        return await database.transaction(async () => {
          const previous = await jobById.get(storeId, orderId);
          if (!previous || !getProjectTrackerCategory(categoryId)) return false;
          if ((await monthLockById.get(storeId, previous.team_name, athensMonthOf(previous.closed_at)))?.locked) return false;
          await updateJob.run(categoryId, null, 0, null, 0, storeId, orderId);
          if (sourceCategoryId) await updateJobScoring.run(null, sourceCategoryId, 0, storeId, orderId);
          await insertAudit.run(storeId, orderId, 'SYSTEM:CATEGORY_MIGRATION', previous.category_id, categoryId, previous.points_override, null, changedAt);
          return true;
        })();
      },
      async migrateCategoryCatalog(changedAt = new Date().toISOString()) {
        return await migrateCategoryCatalogTransaction(changedAt);
      },
      async ensureCutoverAt(now = new Date()) {
        const value = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
        await database.prepare(`
        INSERT OR IGNORE INTO project_tracker_settings (setting_key, setting_value)
        VALUES ('activated_at', ?)
      `).run(value);
        return (await database.prepare('SELECT setting_value FROM project_tracker_settings WHERE setting_key = ?')
          .get('activated_at')).setting_value;
      },
      async getCutoverAt() {
        return (await database.prepare('SELECT setting_value FROM project_tracker_settings WHERE setting_key = ?')
          .get('activated_at'))?.setting_value ?? null;
      },
      async hasJob(storeId, orderId) {
        return Boolean(await jobById.get(storeId, orderId));
      },
      async insertJob(job) {
        if (!job.storeId || !job.orderId || !job.teamName || !job.closedAt || !job.importedAt) return false;
        if (job.categoryId && !getProjectTrackerCategory(job.categoryId)) throw new Error('Unknown project tracker category');
        return (await insertJob.run({ pointsOverride: null, scoringVersion: 0, ...job })).changes > 0;
      },
      async applyCategoryMap(categoryMap, changedAt = new Date().toISOString()) {
        return await applyCategoryMapTransaction(categoryMap, changedAt);
      },
      async getJobsNeedingScoring(scoringVersion) {
        return (await database.prepare(`
        SELECT * FROM project_tracker_jobs
        WHERE category_id IN ('ftth_installation', 'cabling_repair')
          AND scoring_version < ? AND points_override_manual = 0
        ORDER BY closed_at, order_id
      `).all(scoringVersion)).map((row) => ({
          ...projectTrackerJobFromRow(row),
          scoringVersion: row.scoring_version,
        }));
      },
      async updateJobScoring(storeId, orderId, pointsOverride, changedAt, sourceCategoryId, scoringVersion) {
        if (pointsOverride !== null
          && (!Number.isInteger(pointsOverride) || pointsOverride < 0 || pointsOverride > 1000)) {
          throw new Error('pointsOverride must be an integer from 0 to 1000');
        }
        return await updateJobScoringTransaction(
          storeId,
          orderId,
          pointsOverride,
          sourceCategoryId,
          changedAt,
          scoringVersion,
        );
      },
      async updateJobTeamName(storeId, orderId, teamName) {
        if (!teamName) return false;
        return (await updateJobTeamName.run(teamName, storeId, orderId, teamName)).changes > 0;
      },
      async getJob(storeId, orderId) {
        const row = await jobById.get(storeId, orderId);
        return row ? projectTrackerJobFromRow(row) : null;
      },
      async getMonthLock(storeId, teamName, month) {
        const lock = await monthLockById.get(storeId, teamName, month);
        return { locked: Boolean(lock?.locked), changedAt: lock?.changedAt ?? null };
      },
      async setMonthLock({ storeId, teamName, month, locked, changedAt }) {
        if (!storeId || !teamName || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) {
          throw new Error('Invalid month lock scope');
        }
        if (typeof locked !== 'boolean') throw new Error('Month lock state must be boolean');
        return database.transaction(async () => {
          await upsertMonthLock.run(storeId, teamName, month, locked ? 1 : 0, changedAt);
          const lock = await monthLockById.get(storeId, teamName, month);
          return { locked: Boolean(lock?.locked), changedAt: lock?.changedAt ?? null };
        })();
      },
      async getEditorDetailsCache(storeId, orderId) {
        return (await getEditorDetailsCache.get(storeId, orderId)) ?? null;
      },
      async saveEditorDetailsCache(storeId, orderId, details) {
        await upsertEditorDetailsCache.run(
          storeId,
          orderId,
          details.problemDescription,
          details.commentText,
          details.commentAt,
          details.fetchedAt,
        );
      },
      async getProfiles(storeNames = {}) {
        return (await database.prepare(`
        SELECT store_id, team_name, COUNT(*) AS job_count,
          SUM(CASE WHEN category_id IS NULL THEN 1 ELSE 0 END) AS unmapped_count
        FROM project_tracker_jobs
        GROUP BY store_id, team_name
        ORDER BY store_id, team_name
      `).all()).map((row) => ({
          storeId: row.store_id,
          storeName: storeNames[row.store_id] || row.store_id,
          teamName: row.team_name,
          jobCount: Number(row.job_count),
          unmappedCount: Number(row.unmapped_count),
        }));
      },
      async getMonthJobs(month, storeId = null, teamName = null) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) throw new Error('month must use YYYY-MM');
        const [year, monthNumber] = month.split('-').map(Number);
        const firstDay = `${month}-01`;
        const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
        const rows = await listScopedJobs.all(addUtcDays(firstDay, -1), addUtcDays(nextMonth, 1));
        return filterForScope(rows, storeId, teamName)
          .filter((row) => athensMonthOf(row.closed_at) === month)
          .map(projectTrackerJobFromRow);
      },
      async getDayJobs(day, storeId = null, teamName = null) {
        if (!validateDate(day)) throw new Error('date must use YYYY-MM-DD');
        const rows = await listScopedJobs.all(addUtcDays(day, -1), addUtcDays(day, 2));
        return filterForScope(rows, storeId, teamName)
          .filter((row) => athensDayOf(row.closed_at) === day)
          .map(projectTrackerJobFromRow);
      },
      async correctJob(correction) {
        if (correction.categoryId !== null && !getProjectTrackerCategory(correction.categoryId)) {
          throw new Error('Unknown project tracker category');
        }
        if (correction.pointsOverride !== undefined && correction.pointsOverride !== null
          && (!Number.isInteger(correction.pointsOverride) || correction.pointsOverride < 0 || correction.pointsOverride > 1000)) {
          throw new Error('pointsOverride must be an integer from 0 to 1000');
        }
        return await correctJobTransaction(null, correction);
      },
      async getAudit(storeId, orderId) {
        return await database.prepare(`
        SELECT editor_team AS editorTeam, previous_category_id AS previousCategoryId,
          next_category_id AS nextCategoryId, previous_points_override AS previousPointsOverride,
          next_points_override AS nextPointsOverride, changed_at AS changedAt
        FROM project_tracker_audit WHERE store_id = ? AND order_id = ? ORDER BY id
      `).all(storeId, orderId);
      },
      async close() {
        await database.close();
      },
    };
    } catch (error) {
    await database.close();
    throw error;
  }
}