import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectTrackerRepository } from '../src/repositories/projectTrackerRepository.js';
import { mapProjectTrackerCategory } from '../src/services/projectTrackerCatalog.js';
import { syncProjectTracker } from '../src/services/projectTrackerSync.js';

async function withRepository(run) {
  const repository = await createProjectTrackerRepository(':memory:');
  try {
    return await run(repository);
  } finally {
    await repository.close();
  }
}

const store = {
  storeId: 'alexandroupoli',
  closedServiceGroups: ['395'],
  closedServiceGroupMatch: 'ALEXANDROUPOL',
};

test('imports only Fiona-completed jobs after cutover and deduplicates repeat syncs', async () => {
  await withRepository(async (repository) => {
    await repository.ensureCutoverAt(new Date('2026-10-18T09:00:00.000Z'));
    const calls = [];
    const client = {
      async dailyWorkorders(date, groups) {
        calls.push(['daily', date, groups]);
        return [{
          orderId: 'fiona-1',
          teamName: 'Install Team',
          teamGroupName: 'NEW TECHNOLOGIES LTD KOMOTINI',
          orderType: 'FTTH Installation',
        }];
      },
      async orderDetails(orderId) {
        calls.push(['details', orderId]);
        return {
          orderId,
          orderStatus: 'COMPLETED',
          workOrderFinishedOnPremiseTime: '2026-10-18T10:00:00.000Z',
          serviceGroup: 'ALEXANDROUPOLI 395',
          teamName: 'NEW TECHNOLOGIES LTD KOMOTINI',
          orderType: 'FTTH Installation',
          categoryId06: '5.10 Visit OK, Delivery OK',
        };
      },
    };
    const options = {
      stores: [store],
      clients: new Map([['alexandroupoli', client]]),
      repository,
      lookbackDays: 1,
      minDelayMs: 0,
      maxDelayMs: 0,
      wait: async () => {},
      now: () => new Date('2026-10-18T12:00:00.000Z'),
    };

    const first = await syncProjectTracker(options);
    const second = await syncProjectTracker(options);
    assert.equal(first.inserted, 1);
    assert.equal(second.alreadyPresent, 1);
    assert.equal((await repository.getMonthJobs('2026-10'))[0].teamName, 'Install Team');
    assert.equal((await repository.getMonthJobs('2026-10'))[0].points, 50);
    assert.deepEqual(calls[0], ['daily', '18.10.2026', ['395']]);
    assert.equal(calls.filter(([kind]) => kind === 'details').length, 1);
  });
});

test('corrects a previously imported group name to the assigned team name', async () => {
  await withRepository(async (repository) => {
    await repository.ensureCutoverAt(new Date('2026-10-18T09:00:00.000Z'));
    await repository.insertJob({
      storeId: 'alexandroupoli',
      orderId: 'fiona-grouped',
      teamName: 'NEW TECHNOLOGIES LTD KOMOTINI',
      closedAt: '2026-10-18T10:00:00.000Z',
      sourceLabel: 'FTTH Installation',
      sourceCategoryId: null,
      categoryId: 'ftth_installation',
      pointsOverride: null,
      scoringVersion: 1,
      importedAt: '2026-10-18T11:00:00.000Z',
    });
    const client = {
      async dailyWorkorders() {
        return [{
          orderId: 'fiona-grouped',
          teamName: 'Assigned Crew',
          teamGroupName: 'NEW TECHNOLOGIES LTD KOMOTINI',
        }];
      },
      async orderDetails() {
        return {
          orderStatus: 'COMPLETED',
          workOrderFinishedOnPremiseTime: '2026-10-18T10:00:00.000Z',
          serviceGroup: 'ALEXANDROUPOLI 395',
          teamName: 'NEW TECHNOLOGIES LTD KOMOTINI',
        };
      },
    };

    const summary = await syncProjectTracker({
      stores: [store],
      clients: new Map([['alexandroupoli', client]]),
      repository,
      lookbackDays: 1,
      minDelayMs: 0,
      maxDelayMs: 0,
      wait: async () => {},
      now: () => new Date('2026-10-18T12:00:00.000Z'),
    });

    assert.equal(summary.teamUpdated, 1);
    assert.equal((await repository.getJob('alexandroupoli', 'fiona-grouped')).teamName, 'Assigned Crew');
  });
});

test('does not import pre-cutover, incomplete, unassigned, or other-store work', async () => {
  await withRepository(async (repository) => {
    await repository.ensureCutoverAt(new Date('2026-10-18T12:00:00.000Z'));
    const orders = [
      { orderId: 'old', teamName: 'Team One' },
      { orderId: 'open', teamName: 'Team One' },
      { orderId: 'no-team' },
      { orderId: 'other', teamName: 'Team One' },
    ];
    const details = {
      old: { orderStatus: 'COMPLETED', workOrderFinishedOnPremiseTime: '2026-10-18T09:00:00.000Z', serviceGroup: 'ALEXANDROUPOLI' },
      open: { orderStatus: 'OPEN', workOrderFinishedOnPremiseTime: '2026-10-18T13:00:00.000Z', serviceGroup: 'ALEXANDROUPOLI' },
      'no-team': { orderStatus: 'COMPLETED', workOrderFinishedOnPremiseTime: '2026-10-18T13:00:00.000Z', serviceGroup: 'ALEXANDROUPOLI' },
      other: { orderStatus: 'COMPLETED', workOrderFinishedOnPremiseTime: '2026-10-18T13:00:00.000Z', serviceGroup: 'KOMOTINI' },
    };
    const client = {
      async dailyWorkorders() { return orders; },
      async orderDetails(orderId) { return { ...details[orderId], orderType: 'Unmapped service' }; },
    };
    const summary = await syncProjectTracker({
      stores: [store],
      clients: new Map([['alexandroupoli', client]]),
      repository,
      lookbackDays: 1,
      minDelayMs: 0,
      maxDelayMs: 0,
      wait: async () => {},
      now: () => new Date('2026-10-18T12:00:00.000Z'),
    });
    assert.equal(summary.beforeCutover, 1);
    assert.equal(summary.notCompleted, 1);
    assert.equal(summary.missingTeam, 1);
    assert.equal(summary.otherStore, 1);
    assert.equal((await repository.getMonthJobs('2026-10')).length, 0);
  });
});

test('maps verified Fiona category values exactly and leaves unknown values unmapped', async () => {
  await withRepository(async (repository) => {
    await repository.ensureCutoverAt(new Date('2026-10-18T09:00:00.000Z'));
    const client = {
      async dailyWorkorders() {
        return [
          { orderId: 'mapped', teamName: 'Team One', orderType: 'FIBER FIELD JOB' },
          { orderId: 'unmapped', teamName: 'Team One', orderType: 'Unknown service' },
        ];
      },
      async orderDetails(orderId) {
        return {
          orderId,
          orderStatus: 'COMPLETED',
          workOrderFinishedOnPremiseTime: '2026-10-18T10:00:00.000Z',
          serviceGroup: 'ALEXANDROUPOLI 395',
        };
      },
    };
    await syncProjectTracker({
      stores: [store],
      clients: new Map([['alexandroupoli', client]]),
      repository,
      categoryMap: { 'FIBER FIELD JOB': 'ftth_installation' },
      lookbackDays: 1,
      minDelayMs: 0,
      maxDelayMs: 0,
      wait: async () => {},
      now: () => new Date('2026-10-18T12:00:00.000Z'),
    });

    assert.equal((await repository.getJob('alexandroupoli', 'mapped')).categoryId, 'ftth_installation');
    assert.equal((await repository.getJob('alexandroupoli', 'unmapped')).mapped, false);
  });
});

test('maps copper and combined work separately and keeps double-team manual-only', () => {
  assert.equal(mapProjectTrackerCategory({}, 'NGA Activation')?.id, 'copper_installation');
  assert.equal(mapProjectTrackerCategory({}, 'CO Visit')?.id, 'copper_impairment');
  assert.equal(mapProjectTrackerCategory({}, 'Combined Wind-AP')?.id, 'combined_work');
  assert.equal(mapProjectTrackerCategory({}, 'FTTH Additional Cabling'), null);
  assert.equal(mapProjectTrackerCategory({}, 'Double Team'), null);
  assert.equal(mapProjectTrackerCategory({ 'FTTH Additional Cabling': 'double_team' }, 'FTTH Additional Cabling'), null);
});

test('scores cabling at 50 only when the latest comment confirms installation or routing', async () => {
  await withRepository(async (repository) => {
    await repository.ensureCutoverAt(new Date('2026-10-18T09:00:00.000Z'));
    const comments = {
      installed: 'Έγινε εγκατάσταση.',
      routed: 'Έγινε όδευση.',
      incomplete: 'Η εργασία ολοκληρώθηκε.',
      'routing-only': 'Έγινε όδευση στο σημείο.',
      'standalone-routing': 'Η όδευση.',
      'reverse-order': 'η όδευση έγινε σύμφωνα με το πελάτη σωστό όρο και διεύθυνση υπηρεσίες οκ',
      'reverse-installation': 'Η εγκατάσταση έγινε.',
      'standalone-installation': 'Η εγκατάσταση.',
    };
    const client = {
      async dailyWorkorders() {
        return Object.keys(comments).map((orderId) => ({
          orderId,
          teamName: 'Team One',
          orderType: 'Cabling repair and maintenance',
        }));
      },
      async orderDetails(orderId) {
        return {
          orderId,
          orderStatus: 'COMPLETED',
          workOrderFinishedOnPremiseTime: '2026-10-18T10:00:00.000Z',
          serviceGroup: 'ALEXANDROUPOLI 395',
        };
      },
      async fetchLatestCommentWithSession(orderId) {
        return { text: comments[orderId] };
      },
    };

    await syncProjectTracker({
      stores: [store],
      clients: new Map([['alexandroupoli', client]]),
      repository,
      lookbackDays: 1,
      minDelayMs: 0,
      maxDelayMs: 0,
      wait: async () => {},
      now: () => new Date('2026-10-18T12:00:00.000Z'),
    });

    assert.equal((await repository.getJob('alexandroupoli', 'installed')).points, 50);
    assert.equal((await repository.getJob('alexandroupoli', 'routed')).points, 50);
    assert.equal((await repository.getJob('alexandroupoli', 'incomplete')).points, 15);
    assert.equal((await repository.getJob('alexandroupoli', 'routing-only')).points, 50);
    assert.equal((await repository.getJob('alexandroupoli', 'standalone-routing')).points, 15);
    assert.equal((await repository.getJob('alexandroupoli', 'reverse-order')).points, 50);
    assert.equal((await repository.getJob('alexandroupoli', 'reverse-installation')).points, 50);
    assert.equal((await repository.getJob('alexandroupoli', 'standalone-installation')).points, 15);
  });
});

test('sync applies new exact mappings to existing pending rows before polling', async () => {
  await withRepository(async (repository) => {
    await repository.ensureCutoverAt(new Date('2026-10-18T09:00:00.000Z'));
    await repository.insertJob({
      storeId: 'alexandroupoli',
      orderId: 'existing-nga',
      teamName: 'Team One',
      closedAt: '2026-10-18T10:00:00.000Z',
      sourceLabel: 'Installations',
      sourceCategoryId: 'PaSPort|INSTALLATION|NGA Activation|Syzefxis N|Appointment',
      categoryId: null,
      importedAt: '2026-10-18T11:00:00.000Z',
    });
    const summary = await syncProjectTracker({
      stores: [],
      clients: new Map(),
      repository,
      categoryMap: { 'NGA Activation': 'ftth_installation' },
      lookbackDays: 1,
      now: () => new Date('2026-10-19T12:00:00.000Z'),
    });
    assert.equal(summary.remappedExisting, 1);
    assert.equal((await repository.getJob('alexandroupoli', 'existing-nga')).points, 50);
  });
});

test('applies the 5.8.5 score rule to existing jobs while preserving manual category corrections', async () => {
  await withRepository(async (repository) => {
    await repository.ensureCutoverAt(new Date('2026-10-18T09:00:00.000Z'));
    await repository.insertJob({
      storeId: 'alexandroupoli',
      orderId: 'existing-corrected',
      teamName: 'Team One',
      closedAt: '2026-05-18T10:00:00.000Z',
      sourceLabel: 'FTTH Installation',
      categoryId: 'ftth_installation',
      pointsOverride: 15,
      sourceCategoryId: 'PaSPort|INSTALLATION|NGA Activation|5.8.5',
      importedAt: '2026-10-18T11:00:00.000Z',
    });
    await repository.correctJob({
      storeId: 'alexandroupoli',
      orderId: 'existing-corrected',
      teamName: 'Team One',
      categoryId: 'ftth_installation',
      changedAt: '2026-10-18T11:30:00.000Z',
    });
    const client = {
      async dailyWorkorders() { return []; },
      async orderDetails() {
        return { categoryId06: '5.8.5' };
      },
      async fetchLatestCommentWithSession() {
        return { text: 'Η ΟΔΕΥΣΗ ΕΓΙΝΕ.' };
      },
    };
    const summary = await syncProjectTracker({
      stores: [store],
      clients: new Map([['alexandroupoli', client]]),
      repository,
      lookbackDays: 1,
      minDelayMs: 0,
      maxDelayMs: 0,
      wait: async () => {},
      now: () => new Date('2026-10-18T12:00:00.000Z'),
    });

    assert.equal(summary.updatedExisting, 1);
    assert.equal((await repository.getJob('alexandroupoli', 'existing-corrected')).points, 50);
    assert.equal((await repository.getJob('alexandroupoli', 'existing-corrected')).categoryId, 'ftth_installation');
  });
});

test('5.8.5 scores 15 without either routing phrase; 5.10 stays at 50', async () => {
  await withRepository(async (repository) => {
    await repository.ensureCutoverAt(new Date('2026-10-18T09:00:00.000Z'));
    await repository.insertJob({
      storeId: 'alexandroupoli',
      orderId: 'existing-visit-ok',
      teamName: 'Team One',
      closedAt: '2026-10-18T10:00:00.000Z',
      sourceLabel: 'FTTH Installation',
      sourceCategoryId: 'PaSPort|INSTALLATION|NGA Activation|5.10 Visit OK, Delivery OK',
      categoryId: 'ftth_installation',
      pointsOverride: 15,
      importedAt: '2026-10-18T11:00:00.000Z',
    });
    const imported = [];
    const comments = {
      'no-routing': 'Δεν ολοκληρώθηκε η εργασία.',
      'reverse-routing': 'ΕΓΙΝΕ όδευση.',
      'installation-only': 'Έγινε εγκατάσταση.',
    };
    const client = {
      async dailyWorkorders() {
        return [
          { orderId: 'existing-visit-ok', Categorization: { categoryId06: '5.10 Visit OK, Delivery OK' } },
          { orderId: 'no-routing', teamName: 'Team One', orderType: 'FTTH Installation' },
          { orderId: 'reverse-routing', teamName: 'Team One', orderType: 'FTTH Installation' },
          { orderId: 'installation-only', teamName: 'Team One', orderType: 'FTTH Installation' },
          { orderId: 'visit-ok', teamName: 'Team One', orderType: 'FTTH Installation' },
        ];
      },
      async orderDetails(orderId) {
        return {
          orderId,
          orderStatus: 'COMPLETED',
          workOrderFinishedOnPremiseTime: '2026-10-18T10:00:00.000Z',
          serviceGroup: 'ALEXANDROUPOLI 395',
          orderType: 'FTTH Installation',
          categoryId06: ['existing-visit-ok', 'visit-ok'].includes(orderId)
            ? '5.10 Visit OK, Delivery OK'
            : orderId === 'installation-only' ? '5.3 Wrong customer data' : '5.8.5',
        };
      },
      async fetchLatestCommentWithSession(orderId) {
        imported.push(orderId);
        return { text: comments[orderId] };
      },
    };
    await syncProjectTracker({
      stores: [store],
      clients: new Map([['alexandroupoli', client]]),
      repository,
      lookbackDays: 1,
      minDelayMs: 0,
      maxDelayMs: 0,
      wait: async () => {},
      now: () => new Date('2026-10-18T12:00:00.000Z'),
    });

    assert.equal((await repository.getJob('alexandroupoli', 'no-routing')).points, 15);
    assert.equal((await repository.getJob('alexandroupoli', 'reverse-routing')).points, 50);
    assert.equal((await repository.getJob('alexandroupoli', 'installation-only')).points, 15);
    assert.equal((await repository.getJob('alexandroupoli', 'visit-ok')).points, 50);
    assert.equal((await repository.getJob('alexandroupoli', 'existing-visit-ok')).points, 50);
    assert.deepEqual(imported, ['no-routing', 'reverse-routing', 'installation-only']);
  });
});
test('does not request details again for recently skipped orders until their skip expires', async () => {
  await withRepository(async (repository) => {
    await repository.ensureCutoverAt(new Date('2026-10-18T12:00:00.000Z'));
    const detailCalls = [];
    const details = {
      open: { orderStatus: 'OPEN', serviceGroup: 'ALEXANDROUPOLI' },
      other: { orderStatus: 'COMPLETED', workOrderFinishedOnPremiseTime: '2026-10-18T13:00:00.000Z', serviceGroup: 'KOMOTINI' },
    };
    const client = {
      async dailyWorkorders() { return [{ orderId: 'open', teamName: 'Team One' }, { orderId: 'other', teamName: 'Team One' }]; },
      async orderDetails(orderId) {
        detailCalls.push(orderId);
        return details[orderId];
      },
    };
    let currentTime = new Date('2026-10-18T14:00:00.000Z');
    const skipCache = new Map();
    const options = {
      stores: [store],
      clients: new Map([['alexandroupoli', client]]),
      repository,
      lookbackDays: 1,
      minDelayMs: 0,
      maxDelayMs: 0,
      wait: async () => {},
      now: () => currentTime,
      skipCache,
    };

    await syncProjectTracker(options);
    const cached = await syncProjectTracker(options);
    assert.equal(cached.skippedRecently, 2);
    assert.deepEqual(detailCalls, ['open', 'other']);

    currentTime = new Date('2026-10-18T15:30:00.000Z');
    await syncProjectTracker(options);
    assert.deepEqual(detailCalls, ['open', 'other', 'open']);
  });
});