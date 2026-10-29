import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectTrackerRepository } from '../src/repositories/projectTrackerRepository.js';

async function withRepository(run) {
  const repository = await createProjectTrackerRepository(':memory:');
  try {
    await run(repository);
  } finally {
    await repository.close();
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

test('cutover timestamp is stable and jobs are idempotent by store and Fiona order', async () => {
  await withRepository(async (repository) => {
    assert.equal(await repository.ensureCutoverAt(new Date('2026-10-18T10:00:00.000Z')), '2026-10-18T10:00:00.000Z');
    assert.equal(await repository.ensureCutoverAt(new Date('2026-10-19T10:00:00.000Z')), '2026-10-18T10:00:00.000Z');
    assert.equal(await repository.insertJob(job()), true);
    assert.equal(await repository.insertJob(job({ teamName: 'Other Team' })), false);
    assert.equal(await repository.insertJob(job({ storeId: 'komotini' })), true);
    assert.equal((await repository.getProfiles({ alexandroupoli: 'Alexandroupoli', komotini: 'Komotini' })).length, 2);
  });
});

test('month and day queries use Athens calendar dates and return no customer fields', async () => {
  await withRepository(async (repository) => {
    await repository.insertJob(job({ orderId: 'late-september-utc', closedAt: '2026-09-30T22:30:00.000Z' }));
    await repository.insertJob(job({ orderId: 'late-october-utc', closedAt: '2026-10-31T22:30:00.000Z' }));
    const october = await repository.getMonthJobs('2026-10', 'alexandroupoli', 'Team One');
    assert.deepEqual(october.map((entry) => entry.orderId), ['late-september-utc']);
    assert.equal(october[0].points, 50);
    assert.equal('customerName' in october[0], false);
    assert.deepEqual((await repository.getDayJobs('2026-10-01', 'alexandroupoli', 'Team One')).map((entry) => entry.orderId), ['late-september-utc']);
  });
});

test('catalog migration re-maps legacy and corrected jobs but keeps locked months', async () => {
  await withRepository(async (repository) => {
    const legacy = { sourceCategoryId: 'Fixed|On-Site Support NGA', categoryId: 'soho_installation_impairment' };
    await repository.insertJob(job({ orderId: 'legacy', ...legacy, pointsOverride: 15 }));
    await repository.insertJob(job({ orderId: 'nga-activation', sourceCategoryId: 'NGA Activation', categoryId: 'ftth_installation' }));
    await repository.insertJob(job({ orderId: 'corrected', ...legacy }));
    await repository.correctJob({
      storeId: 'alexandroupoli',
      orderId: 'corrected',
      teamName: 'Team One',
      categoryId: 'soho_installation_impairment',
      pointsOverride: 99,
      changedAt: '2026-10-18T11:00:00.000Z',
    });
    await repository.insertJob(job({ orderId: 'locked', ...legacy, teamName: 'Locked Team', closedAt: '2026-09-10T10:00:00.000Z' }));
    await repository.setMonthLock({
      storeId: 'alexandroupoli', teamName: 'Locked Team', month: '2026-09', locked: true, changedAt: '2026-10-01T00:00:00.000Z',
    });

    assert.equal(await repository.migrateCategoryCatalog('2026-10-20T10:00:00.000Z'), 3);
    assert.equal((await repository.getJob('alexandroupoli', 'legacy')).categoryId, 'copper_impairment');
    assert.equal((await repository.getJob('alexandroupoli', 'legacy')).points, 15);
    assert.equal((await repository.getJob('alexandroupoli', 'nga-activation')).categoryId, 'copper_installation');
    assert.equal((await repository.getJob('alexandroupoli', 'corrected')).categoryId, 'copper_impairment');
    assert.equal((await repository.getJob('alexandroupoli', 'corrected')).points, 15);
    assert.equal((await repository.getJob('alexandroupoli', 'locked')).categoryId, 'soho_installation_impairment');
    assert.equal((await repository.getAudit('alexandroupoli', 'legacy'))[0].editorTeam, 'SYSTEM:CATEGORY_MIGRATION');
    assert.equal(await repository.migrateCategoryCatalog(), 0);
  });
});

test('unmapped jobs remain unscored and corrections are audited', async () => {
  await withRepository(async (repository) => {
    await repository.insertJob(job({ categoryId: null, sourceLabel: 'Unrecognized Fiona service' }));
    const unmapped = await repository.getJob('alexandroupoli', 'order-1');
    assert.equal(unmapped.mapped, false);
    assert.equal(unmapped.points, 0);

    const corrected = await repository.correctJob({
      storeId: 'alexandroupoli',
      orderId: 'order-1',
      teamName: 'Team One',
      categoryId: 'dth_tv_impairment',
      pointsOverride: 21,
      changedAt: '2026-10-18T11:00:00.000Z',
    });

    assert.equal(corrected.categoryName, 'DTH TV Impairment');
    assert.equal(corrected.points, 21);
    assert.equal((await repository.getAudit('alexandroupoli', 'order-1')).length, 1);
    assert.equal(await repository.correctJob({
      storeId: 'alexandroupoli',
      orderId: 'order-1',
      teamName: 'Other Team',
      categoryId: 'ftth_installation',
      pointsOverride: null,
      changedAt: '2026-10-18T12:00:00.000Z',
    }), null);
  });
});

test('manually selecting cabling saves the 15-point score over its automatic score', async () => {
  await withRepository(async (repository) => {
    await repository.insertJob(job({
      categoryId: 'cabling_repair',
      pointsOverride: 50,
      sourceLabel: 'Cabling Repair and Maintenance',
    }));

    const corrected = await repository.correctJob({
      storeId: 'alexandroupoli',
      orderId: 'order-1',
      teamName: 'Team One',
      categoryId: 'cabling_repair',
      pointsOverride: 15,
      changedAt: '2026-10-18T11:00:00.000Z',
    });

    assert.equal(corrected.pointsOverride, 15);
    assert.equal(corrected.points, 15);
  });
});

test('manual installation and cabling scores survive automatic scoring updates', async () => {
  await withRepository(async (repository) => {
    await repository.insertJob(job({ categoryId: 'ftth_installation' }));
    await repository.insertJob(job({ orderId: 'order-2', categoryId: 'cabling_repair' }));
    await repository.correctJob({
      storeId: 'alexandroupoli',
      orderId: 'order-1',
      teamName: 'Team One',
      categoryId: 'ftth_installation',
      pointsOverride: 15,
      changedAt: '2026-10-18T11:00:00.000Z',
    });
    await repository.correctJob({
      storeId: 'alexandroupoli',
      orderId: 'order-2',
      teamName: 'Team One',
      categoryId: 'cabling_repair',
      pointsOverride: 50,
      changedAt: '2026-10-18T11:00:00.000Z',
    });

    assert.equal(await repository.updateJobScoring(
      'alexandroupoli',
      'order-1',
      50,
      '2026-10-18T12:00:00.000Z',
      'FTTH|activation',
      1,
    ), false);
    assert.equal(await repository.updateJobScoring(
      'alexandroupoli',
      'order-2',
      15,
      '2026-10-18T12:00:00.000Z',
      'Cabling|repair',
      1,
    ), false);
    const updated = await repository.getJob('alexandroupoli', 'order-1');
    const updatedCabling = await repository.getJob('alexandroupoli', 'order-2');
    assert.equal(updated.pointsOverride, 15);
    assert.equal(updated.pointsOverrideManual, true);
    assert.equal(updated.points, 15);
    assert.equal(updatedCabling.pointsOverride, 50);
    assert.equal(updatedCabling.pointsOverrideManual, true);
    assert.equal(updatedCabling.points, 50);
  });
});

test('changing a manually corrected category clears its previous score override', async () => {
  await withRepository(async (repository) => {
    await repository.insertJob(job({ pointsOverride: 15 }));
    const corrected = await repository.correctJob({
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

test('monthly payment lock prevents team corrections but permits admin corrections', async () => {
  await withRepository(async (repository) => {
    await repository.insertJob(job());
    const lock = await repository.setMonthLock({
      storeId: 'alexandroupoli',
      teamName: 'Team One',
      month: '2026-10',
      locked: true,
      changedAt: '2026-10-18T12:00:00.000Z',
    });
    assert.deepEqual(lock, { locked: true, changedAt: '2026-10-18T12:00:00.000Z' });
    assert.equal((await repository.getMonthLock('alexandroupoli', 'Team One', '2026-11')).locked, false);
    assert.equal((await repository.getMonthLock('alexandroupoli', 'Other Team', '2026-10')).locked, false);

    await assert.rejects(async () => await repository.correctJob({
      storeId: 'alexandroupoli',
      orderId: 'order-1',
      teamName: 'Team One',
      categoryId: 'dth_tv_impairment',
      changedAt: '2026-10-18T13:00:00.000Z',
    }), { code: 'PROJECT_TRACKER_MONTH_LOCKED' });

    const corrected = await repository.correctJob({
      storeId: 'alexandroupoli',
      orderId: 'order-1',
      teamName: 'Team One',
      categoryId: 'dth_tv_impairment',
      allowLocked: true,
      changedAt: '2026-10-18T14:00:00.000Z',
    });
    assert.equal(corrected.points, 18);
    assert.equal((await repository.setMonthLock({
      storeId: 'alexandroupoli',
      teamName: 'Team One',
      month: '2026-10',
      locked: false,
      changedAt: '2026-10-18T15:00:00.000Z',
    })).locked, false);
  });
});

test('system scoring updates preserve manual category assignments and are audited', async () => {
  await withRepository(async (repository) => {
    await repository.insertJob(job({ categoryId: 'dth_tv_impairment', pointsOverride: 21 }));
    assert.equal(await repository.updateJobScoring(
      'alexandroupoli',
      'order-1',
      15,
      '2026-10-18T12:00:00.000Z',
      'PaSPort|5.8.5',
      1,
    ), true);
    const corrected = await repository.getJob('alexandroupoli', 'order-1');
    assert.equal(corrected.categoryId, 'dth_tv_impairment');
    assert.equal(corrected.points, 15);
    assert.equal((await repository.getAudit('alexandroupoli', 'order-1'))[0].editorTeam, 'SYSTEM:SCORING_RULE');
    assert.equal(corrected.sourceCategoryId, 'PaSPort|5.8.5');
  });
});

test('exact category-map tokens remap existing pending jobs once and record a system audit', async () => {
  await withRepository(async (repository) => {
    await repository.insertJob(job({
      categoryId: null,
      sourceLabel: 'Installations',
      sourceCategoryId: 'PaSPort|INSTALLATION|NGA Activation|Syzefxis N|Appointment',
    }));
    const changedAt = '2026-10-19T08:00:00.000Z';
    const map = { 'NGA Activation': 'ftth_installation' };
    assert.equal(await repository.applyCategoryMap(map, changedAt), 1);
    assert.equal((await repository.getJob('alexandroupoli', 'order-1')).points, 50);
    assert.equal(await repository.applyCategoryMap(map, changedAt), 0);
    assert.deepEqual(await repository.getAudit('alexandroupoli', 'order-1'), [{
      editorTeam: 'SYSTEM:CATEGORY_MAP',
      previousCategoryId: null,
      nextCategoryId: 'ftth_installation',
      previousPointsOverride: null,
      nextPointsOverride: null,
      changedAt,
    }]);
  });
});