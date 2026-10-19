import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectTrackerMonth } from '../src/services/projectTrackerStats.js';

test('monthly totals group completed jobs by category and Athens calendar day', () => {
  const summary = buildProjectTrackerMonth('2026-10', [
    { closedAt: '2026-09-30T22:30:00.000Z', categoryId: 'ftth_installation', points: 50 },
    { closedAt: '2026-10-01T10:00:00.000Z', categoryId: 'dth_tv_impairment', points: 18 },
    { closedAt: '2026-10-31T22:30:00.000Z', categoryId: 'ftth_installation', points: 50 },
    { closedAt: '2026-10-01T11:00:00.000Z', categoryId: null, points: 0 },
  ]);

  assert.equal(summary.totalJobs, 3);
  assert.equal(summary.totalPoints, 68);
  assert.deepEqual(summary.days, [
    { date: '2026-10-01', jobCount: 3, points: 68 },
  ]);
  assert.deepEqual(summary.categories.map(({ categoryId, jobCount, points }) => ({ categoryId, jobCount, points })), [
    { categoryId: 'ftth_installation', jobCount: 1, points: 50 },
    { categoryId: 'dth_tv_impairment', jobCount: 1, points: 18 },
    { categoryId: null, jobCount: 1, points: 0 },
  ]);
});