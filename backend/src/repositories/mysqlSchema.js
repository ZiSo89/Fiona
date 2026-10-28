// ISO timestamps stay as text to preserve the SQLite ordering and Athens calendar rules.
export const mysqlTables = {
  closed_tickets: {
    columns: {
      store_id: "VARCHAR(64) NOT NULL DEFAULT 'alexandroupoli'",
      order_id: 'VARCHAR(191) NOT NULL',
      service_order_id: 'VARCHAR(191)',
      customer_id: 'TEXT', account_afm: 'TEXT', customer_name: 'TEXT', team_name: 'VARCHAR(255)',
      city: 'TEXT', street: 'TEXT', house_number: 'TEXT', phone: 'TEXT', service_description: 'TEXT',
      scheduled_at: 'VARCHAR(40)', created_at: 'VARCHAR(40)', closed_at: 'VARCHAR(40) NOT NULL',
      call_deadline: 'VARCHAR(40)', order_sla_flag: 'TEXT', work_order_sla_date: 'VARCHAR(40)',
      work_order_sla_outcome: "ENUM('on_time','late','unknown') NOT NULL",
      work_order_status: 'TEXT', comment_text: 'LONGTEXT', comment_at: 'VARCHAR(40)',
      comment_author: 'TEXT', imported_at: 'VARCHAR(40) NOT NULL',
    },
    primary: ['store_id', 'order_id'],
    indexes: ['closed_at', 'service_order_id', 'team_name'],
  },
  pending_closures: {
    columns: {
      store_id: "VARCHAR(64) NOT NULL DEFAULT 'alexandroupoli'", order_id: 'VARCHAR(191) NOT NULL',
      service_order_id: 'VARCHAR(191)', team_name: 'VARCHAR(255)', first_seen_at: 'VARCHAR(40) NOT NULL',
      attempts: 'INT NOT NULL DEFAULT 0', next_attempt_at: "VARCHAR(40) NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'",
    },
    primary: ['store_id', 'order_id'],
  },
  ticket_status_observations: {
    columns: {
      store_id: "VARCHAR(64) NOT NULL DEFAULT 'alexandroupoli'", order_id: 'VARCHAR(191) NOT NULL',
      status: 'VARCHAR(64) NOT NULL', status_time: 'VARCHAR(40) NOT NULL',
      service_order_id: 'VARCHAR(191)', call_due_at: 'VARCHAR(40)', no_of_calls: 'INT',
      observed_at: 'VARCHAR(40) NOT NULL',
    },
    primary: ['store_id', 'order_id', 'status', 'status_time'],
  },
  call_later_update_observations: {
    columns: {
      id: 'INT NOT NULL AUTO_INCREMENT', store_id: 'VARCHAR(64) NOT NULL', order_id: 'VARCHAR(191) NOT NULL',
      service_order_id: 'VARCHAR(191)', status_time: 'VARCHAR(40)', call_later_at: 'VARCHAR(40)',
      last_interaction_at: 'VARCHAR(40)', call_due_at: 'VARCHAR(40)', no_of_calls: 'INT',
      observed_at: 'VARCHAR(40) NOT NULL',
    },
    primary: ['id'],
    indexes: ['store_id, order_id, observed_at'],
  },
  call_later_monitoring: {
    columns: { id: 'INT NOT NULL CHECK (id = 1)', expires_at: 'VARCHAR(40) NOT NULL' },
    primary: ['id'],
  },
  project_tracker_settings: {
    columns: { setting_key: 'VARCHAR(191) NOT NULL', setting_value: 'LONGTEXT NOT NULL' },
    primary: ['setting_key'],
  },
  project_tracker_jobs: {
    columns: {
      store_id: 'VARCHAR(64) NOT NULL', order_id: 'VARCHAR(191) NOT NULL', team_name: 'VARCHAR(255) NOT NULL',
      closed_at: 'VARCHAR(40) NOT NULL', source_label: 'TEXT', source_category_id: 'TEXT',
      category_id: 'VARCHAR(191)', points_override: 'INT', points_override_manual: 'INT NOT NULL DEFAULT 0',
      scoring_version: 'INT NOT NULL DEFAULT 0', imported_at: 'VARCHAR(40) NOT NULL', corrected_at: 'VARCHAR(40)',
    },
    primary: ['store_id', 'order_id'],
    indexes: ['store_id, team_name, closed_at'],
  },
  project_tracker_month_locks: {
    columns: {
      store_id: 'VARCHAR(64) NOT NULL', team_name: 'VARCHAR(255) NOT NULL', month: 'VARCHAR(7) NOT NULL',
      locked: 'INT NOT NULL', changed_at: 'VARCHAR(40) NOT NULL',
    },
    primary: ['store_id', 'team_name', 'month'],
  },
  project_tracker_audit: {
    columns: {
      id: 'INT NOT NULL AUTO_INCREMENT', store_id: 'VARCHAR(64) NOT NULL', order_id: 'VARCHAR(191) NOT NULL',
      editor_team: 'VARCHAR(255) NOT NULL', previous_category_id: 'VARCHAR(191)', next_category_id: 'VARCHAR(191)',
      previous_points_override: 'INT', next_points_override: 'INT', changed_at: 'VARCHAR(40) NOT NULL',
    },
    primary: ['id'],
  },
  project_tracker_editor_details: {
    columns: {
      store_id: 'VARCHAR(64) NOT NULL', order_id: 'VARCHAR(191) NOT NULL',
      problem_description: 'LONGTEXT', comment_text: 'LONGTEXT',
      comment_at: 'VARCHAR(40)', fetched_at: 'VARCHAR(40) NOT NULL',
    },
    primary: ['store_id', 'order_id'],
  },
};

export async function initializeMysql(connection) {
  const [locks] = await connection.query("SELECT GET_LOCK(CONCAT('fiona_schema_', LEFT(SHA2(DATABASE(), 256), 40)), 30) AS acquired");
  if (Number(locks[0].acquired) !== 1) throw new Error('Unable to acquire Fiona schema migration lock');
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS fiona_schema_version (
      id INT PRIMARY KEY, version INT NOT NULL
    ) ENGINE=InnoDB`);
    const [versions] = await connection.query('SELECT version FROM fiona_schema_version WHERE id = 1');
    if (versions.length && versions[0].version !== 1) throw new Error('Unsupported Fiona database schema version');
    for (const [table, definition] of Object.entries(mysqlTables)) {
      const fields = Object.entries(definition.columns).map(([name, type]) => `\`${name}\` ${type}`);
      fields.push(`PRIMARY KEY (${definition.primary.map((name) => `\`${name}\``).join(', ')})`);
      for (const [index, columns] of (definition.indexes || []).entries()) {
        fields.push(`INDEX idx_${index} (${columns})`);
      }
      await connection.query(`CREATE TABLE IF NOT EXISTS \`${table}\` (${fields.join(', ')})
        ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    }
    await connection.query('CREATE TABLE IF NOT EXISTS fiona_transaction_lock (id INT PRIMARY KEY) ENGINE=InnoDB');
    await connection.query('INSERT INTO fiona_transaction_lock (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id');
    await connection.query('INSERT INTO fiona_schema_version (id, version) VALUES (1, 1) ON DUPLICATE KEY UPDATE version = version');
  } finally {
    await connection.query("SELECT RELEASE_LOCK(CONCAT('fiona_schema_', LEFT(SHA2(DATABASE(), 256), 40)))");
  }
}
