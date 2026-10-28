import { createClosedTicketRepository } from '../../src/repositories/closedTicketRepository.js';
import { createTicketObservationRepository } from '../../src/repositories/ticketObservationRepository.js';
import { createProjectTrackerRepository } from '../../src/repositories/projectTrackerRepository.js';
import { mysqlTables } from '../../src/repositories/mysqlSchema.js';
import { openDatabase } from '../../src/repositories/database.js';

export async function createMigrationFixture(filename) {
  const closed = await createClosedTicketRepository(filename, 'alexandroupoli', 'sqlite');
  const observations = await createTicketObservationRepository(filename, 'alexandroupoli', 'sqlite');
  const tracker = await createProjectTrackerRepository(filename, 'sqlite');
  const database = await openDatabase(filename, 'sqlite');
  try {
    const now = '2026-10-28T07:00:00.000Z';
    const record = Object.fromEntries(Object.keys(mysqlTables.closed_tickets.columns).map((column) => [column, null]));
    Object.assign(record, {
      store_id: 'alexandroupoli', order_id: 'order-1', team_name: 'Team One',
      customer_name: '\u0394\u03bf\u03ba\u03b9\u03bc\u03ae \u{1F600}', closed_at: now,
      imported_at: now, work_order_sla_outcome: 'on_time',
    });
    await closed.insert(record);
    await closed.insert({ ...record, store_id: 'komotini' });
    await closed.trackOpen([{ order_id: 'pending-1', service_order_id: null, team_name: 'Team One' }]);
    await observations.record([{
      id: 'order-1', order: { status: 'CALL LATER' },
      timeline: { statusTime: now, callLaterTime: now }, sla: { activityDueDate: now },
      communication: { noOfCalls: 1 },
    }]);
    await tracker.ensureCutoverAt(now);
    await tracker.insertJob({
      storeId: 'alexandroupoli', orderId: 'order-1', teamName: 'Team One',
      closedAt: now, importedAt: now, sourceLabel: 'FTTH', sourceCategoryId: null,
      categoryId: 'ftth_installation',
    });
    await tracker.correctJob({
      storeId: 'alexandroupoli', orderId: 'order-1', teamName: 'Team One',
      categoryId: 'ftth_installation', pointsOverride: 21, changedAt: now,
    });
    await tracker.setMonthLock({ storeId: 'alexandroupoli', teamName: 'Team One', month: '2026-10', locked: true, changedAt: now });
    await tracker.saveEditorDetailsCache('alexandroupoli', 'order-1', {
      problemDescription: null, commentText: 'Stored comment', commentAt: now, fetchedAt: now,
    });
    // Include a legacy category: the transfer must preserve it rather than running scoring migrations.
    await database.prepare('UPDATE project_tracker_jobs SET source_category_id = ? WHERE order_id = ?')
      .run('Fixed|On-Site Support NGA', 'order-1');
  } finally {
    await Promise.all([closed.close(), observations.close(), tracker.close(), database.close()]);
  }
}
