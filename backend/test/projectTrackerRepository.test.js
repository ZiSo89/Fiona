import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectTrackerRepository } from '../src/repositories/projectTrackerRepository.js';

function withRepository(run) {
  const repository = createProjectTrackerRepository(':memory:');
  try {
    run(repository);
  } finally {
    repository.close();
  }
}

const job = (overrides = {}) => ({
  storeId: 'alexandroupoli',
  orderId: 'order-1',
  teamName: 'Team One',
  closedAt: '2026-10-01T10:00:00.000Z',
  sourceLabel: 'FTTH Installation',
  sourceCategoryId: 'category-1',
  categoryId: 'ftth_installation',
  importedAt: '2026-10-18T10:00:00.000Z',
  ...overrides,
});

test('cutover timestamp is stable and jobs are idempotent by store and Fiona order', () => {
  withRepository((repository) => {
    assert.equal(repository.ensureCutoverAt(new Date('2026-10-18T10:00:00.000Z')), '2026-10-18T10:00:00.000Z');
    assert.equal(repository.ensureCutoverAt(new Date('2026-10-19T10:00:00.000Z')), '2026-10-18T10:00:00.000Z');
    assert.equal(repository.insertJob(job()), true);
    assert.equal(repository.insertJob(job({ teamName: 'Other Team' })), false);
    assert.equal(repository.insertJob(job({ storeId: 'komotini' })), true);
    assert.equal(repository.getProfiles({ alexandroupoli: 'Alexandroupoli', komotini: 'Komotini' }).length, 2);
  });
});

test('month and day queries use Athens calendar dates and return no customer fields', () => {
  withRepository((repository) => {
    repository.insertJob(job({ orderId: 'late-september-utc', closedAt: '2026-09-30T22:30:00.000Z' }));
    repository.insertJob(job({ orderId: 'late-october-utc', closedAt: '2026-10-31T22:30:00.000Z' }));
    const october = repository.getMonthJobs('2026-10', 'alexandroupoli', 'Team One');
    assert.deepEqual(october.map((entry) => entry.orderId), ['late-september-utc']);
    assert.equal(october[0].points, 50);
    assert.equal('customerName' in october[0], false);
    assert.deepEqual(repository.getDayJobs('2026-10-01', 'alexandroupoli', 'Team One').map((entry) => entry.orderId), ['late-september-utc']);
  });
});

test('unmapped jobs remain unscored and corrections are audited', () => {
  withRepository((repository) => {
    repository.insertJob(job({ categoryId: null, sourceLabel: 'Unrecognized Fiona service' }));
    const unmapped = repository.getJob('alexandroupoli', 'order-1');
    assert.equal(unmapped.mapped, false);
    assert.equal(unmapped.points, 0);

    const corrected = repository.correctJob({
      storeId: 'alexandroupoli',
      orderId: 'order-1',
      teamName: 'Team One',
      categoryId: 'dth_tv_impairment',
      pointsOverride: 21,
      changedAt: '2026-10-18T11:00:00.000Z',
    });
    assert.equal(corrected.categoryName, 'DTH TV Impairment');
    assert.equal(corrected.points, 21);
    assert.equal(repository.getAudit('alexandroupoli', 'order-1').length, 1);
    assert.equal(repository.correctJob({
      storeId: 'alexandroupoli',
      orderId: 'order-1',
      teamName: 'Other Team',
      categoryId: 'ftth_installation',
      pointsOverride: null,
      changedAt: '2026-10-18T12:00:00.000Z',
    }), null);
  });
});

test('changing a manually corrected category clears its previous score override', () => {
  withRepository((repository) => {
    repository.insertJob(job({ pointsOverride: 15 }));
    const corrected = repository.correctJob({
      storeId: 'alexandroupoli',
      orderId: 'order-1',
      teamName: 'Team One',
      categoryId: 'dth_tv_impairment',
      changedAt: '2026-10-18T11:00:00.000Z',
    });
    assert.equal(corrected.points, 18);
    assert.equal(corrected.pointsOverride, null);
  });
});

test('monthly payment lock prevents team corrections but permits admin corrections', () => {
  withRepository((repository) => {
    repository.insertJob(job());
    const lock = repository.setMonthLock({
      storeId: 'alexandroupoli',
      teamName: 'Team One',
      month: '2026-10',
      locked: true,
      changedAt: '2026-10-18T12:00:00.000Z',
    });
    assert.deepEqual(lock, { locked: true, changedAt: '2026-10-18T12:00:00.000Z' });
    assert.equal(repository.getMonthLock('alexandroupoli', 'Team One', '2026-11').locked, false);
    assert.equal(repository.getMonthLock('alexandroupoli', 'Other Team', '2026-10').locked, false);

    assert.throws(() => repository.correctJob({
      storeId: 'alexandroupoli',
      orderId: 'order-1',
      teamName: 'Team One',
      categoryId: 'dth_tv_impairment',
      changedAt: '2026-10-18T13:00:00.000Z',
    }), { code: 'PROJECT_TRACKER_MONTH_LOCKED' });

    const corrected = repository.correctJob({
      storeId: 'alexandroupoli',
      orderId: 'order-1',
      teamName: 'Team One',
      categoryId: 'dth_tv_impairment',
      allowLocked: true,
      changedAt: '2026-10-18T14:00:00.000Z',
    });
    assert.equal(corrected.points, 18);
    assert.equal(repository.setMonthLock({
      storeId: 'alexandroupoli',
      teamName: 'Team One',
      month: '2026-10',
      locked: false,
      changedAt: '2026-10-18T15:00:00.000Z',
    }).locked, false);
  });
});

test('system scoring updates preserve manual category assignments and are audited', () => {
  withRepository((repository) => {
    repository.insertJob(job({ categoryId: 'dth_tv_impairment', pointsOverride: 21 }));
    assert.equal(repository.updateJobScoring(
      'alexandroupoli',
      'order-1',
      15,
      '2026-10-18T12:00:00.000Z',
      'PaSPort|5.8.5',
      1,
    ), true);
    const corrected = repository.getJob('alexandroupoli', 'order-1');
    assert.equal(corrected.categoryId, 'dth_tv_impairment');
    assert.equal(corrected.points, 15);
    assert.equal(repository.getAudit('alexandroupoli', 'order-1')[0].editorTeam, 'SYSTEM:SCORING_RULE');
    assert.equal(corrected.sourceCategoryId, 'PaSPort|5.8.5');
  });
});

test('exact category-map tokens remap existing pending jobs once and record a system audit', () => {
  withRepository((repository) => {
    repository.insertJob(job({
      categoryId: null,
      sourceLabel: 'Installations',
      sourceCategoryId: 'PaSPort|INSTALLATION|NGA Activation|Syzefxis N|Appointment',
    }));
    const changedAt = '2026-10-19T08:00:00.000Z';
    const map = { 'NGA Activation': 'ftth_installation' };
    assert.equal(repository.applyCategoryMap(map, changedAt), 1);
    assert.equal(repository.getJob('alexandroupoli', 'order-1').points, 50);
    assert.equal(repository.applyCategoryMap(map, changedAt), 0);
    assert.deepEqual(repository.getAudit('alexandroupoli', 'order-1'), [{
      editorTeam: 'SYSTEM:CATEGORY_MAP',
      previousCategoryId: null,
      nextCategoryId: 'ftth_installation',
      previousPointsOverride: null,
      nextPointsOverride: null,
      changedAt,
    }]);
  });
});