/**
 * Database initialisation — uses sqlite3 (async) with a thin promise wrapper.
 * The wrapper exposes the same synchronous-looking interface used by the rest
 * of the codebase: db.prepare(sql).run(...) / .get(...) / .all(...).
 *
 * Because sqlite3 is callback-based we promisify the relevant methods and then
 * wrap them in a statement-like object so the call sites are identical to what
 * they would be with better-sqlite3.
 */

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const config  = require('../config');
const logger  = require('../utils/logger');

let _db = null;

// ── Thin promise shim ─────────────────────────────────────────────────────────

function promisifyDb(db) {
  return {
    /** run: INSERT / UPDATE / DELETE – resolves with { lastInsertRowid, changes } */
    run(sql, ...params) {
      return new Promise((resolve, reject) => {
        db.run(sql, params.flat(), function (err) {
          if (err) return reject(err);
          resolve({ lastInsertRowid: this.lastID, changes: this.changes });
        });
      });
    },
    /** get: SELECT first row */
    get(sql, ...params) {
      return new Promise((resolve, reject) => {
        db.get(sql, params.flat(), (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });
    },
    /** all: SELECT all rows */
    all(sql, ...params) {
      return new Promise((resolve, reject) => {
        db.all(sql, params.flat(), (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
    },
    /** exec: raw DDL / multi-statement (no params) */
    exec(sql) {
      return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    },
    /** prepare shim – returns an object with { run, get, all } bound to this sql */
    prepare(sql) {
      const self = this;
      return {
        run:  (...p) => self.run(sql, ...p),
        get:  (...p) => self.get(sql, ...p),
        all:  (...p) => self.all(sql, ...p),
      };
    },
    /** transaction: run a list of {sql, params} atomically */
    async transaction(fn) {
      await this.run('BEGIN');
      try {
        const result = await fn();
        await this.run('COMMIT');
        return result;
      } catch (e) {
        await this.run('ROLLBACK');
        throw e;
      }
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

function getDb() {
  if (!_db) throw new Error('Database not initialised. Call initDb() first.');
  return _db;
}

async function initDb() {
  const dbPath = config.dbPath;
  logger.info(`Initialising SQLite database at ${dbPath}`);

  const raw = new sqlite3.Database(dbPath);
  _db = promisifyDb(raw);

  await _db.exec('PRAGMA journal_mode = WAL;');
  await _db.exec('PRAGMA foreign_keys = ON;');

  // ── Schema ────────────────────────────────────────────────────────────────
  await _db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id              TEXT PRIMARY KEY,
      card_bin        TEXT NOT NULL,
      card_type       TEXT NOT NULL,
      amount          REAL NOT NULL,
      currency        TEXT NOT NULL DEFAULT 'TRY',
      acquirer_id     TEXT,
      status          TEXT NOT NULL,
      error_code      TEXT,
      response_time_ms INTEGER,
      retry_count     INTEGER NOT NULL DEFAULT 0,
      retry_history   TEXT,
      ml_scores       TEXT,
      source          TEXT NOT NULL DEFAULT 'real',
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS error_logs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id  TEXT,
      acquirer_id     TEXT,
      error_code      TEXT,
      error_message   TEXT,
      retry_attempted INTEGER NOT NULL DEFAULT 0,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS acquirer_status (
      acquirer_id             TEXT PRIMARY KEY,
      name                    TEXT NOT NULL,
      is_active               INTEGER NOT NULL DEFAULT 1,
      routing_weight          REAL NOT NULL DEFAULT 1.0,
      base_success_rate       REAL NOT NULL DEFAULT 0.92,
      current_success_rate    REAL NOT NULL DEFAULT 0.92,
      avg_response_time       REAL NOT NULL DEFAULT 250,
      anomaly_mode            INTEGER NOT NULL DEFAULT 0,
      total_transactions      INTEGER NOT NULL DEFAULT 0,
      successful_transactions INTEGER NOT NULL DEFAULT 0,
      failed_transactions     INTEGER NOT NULL DEFAULT 0,
      isolated_at             DATETIME,
      isolation_reason        TEXT,
      updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL,
      severity        TEXT NOT NULL DEFAULT 'medium',
      acquirer_id     TEXT,
      root_cause      TEXT,
      actions_taken   TEXT,
      recommendations TEXT,
      reasoning_chain TEXT,
      status          TEXT NOT NULL DEFAULT 'open',
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at     DATETIME
    );

    CREATE TABLE IF NOT EXISTS agent_actions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER,
      action_type TEXT NOT NULL,
      details     TEXT,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS escalations (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id       INTEGER,
      title             TEXT NOT NULL,
      severity          TEXT NOT NULL DEFAULT 'high',
      description       TEXT NOT NULL,
      attempted_actions TEXT,
      recommendation    TEXT,
      acknowledged      INTEGER NOT NULL DEFAULT 0,
      acknowledged_at   DATETIME,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS metric_snapshots (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      acquirer_id       TEXT NOT NULL,
      success_rate      REAL NOT NULL,
      avg_response_time REAL NOT NULL,
      transaction_count INTEGER NOT NULL DEFAULT 0,
      error_count       INTEGER NOT NULL DEFAULT 0,
      period_start      DATETIME NOT NULL,
      period_end        DATETIME NOT NULL,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS system_metrics (
      id INTEGER PRIMARY KEY,
      total_savings REAL NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tx_created    ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_tx_acquirer   ON transactions(acquirer_id);
    CREATE INDEX IF NOT EXISTS idx_tx_status     ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_errlogs_tx    ON error_logs(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_errlogs_acq   ON error_logs(acquirer_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_acq ON metric_snapshots(acquirer_id, created_at);
  `);

  // ── Seed acquirers ────────────────────────────────────────────────────────
  const acquirers = [
    ['acquirer_garanti',    'Garanti Sanal POS',          0.97, 0.97, 230, 1.0],
    ['acquirer_yapikredi',  'Yapı Kredi Sanal POS',       0.96, 0.96, 310, 1.0],
    ['acquirer_isbank',     'İş Bankası Sanal POS',       0.95, 0.95, 280, 1.0],
    ['acquirer_akbank',     'Akbank Sanal POS',           0.96, 0.96, 250, 1.0],
    ['acquirer_qnb',        'QNB Finansbank Sanal POS',   0.93, 0.93, 290, 1.0],
    ['acquirer_denizbank',  'DenizBank Sanal POS',        0.94, 0.94, 270, 1.0],
  ];

  for (const [id, name, base, current, rt, weight] of acquirers) {
    await _db.run(
      `INSERT OR IGNORE INTO acquirer_status
         (acquirer_id, name, base_success_rate, current_success_rate, avg_response_time, routing_weight)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id, name, base, current, rt, weight
    );
  }

  // ── Seed system metrics ───────────────────────────────────────────────────
  await _db.run(`INSERT OR IGNORE INTO system_metrics (id, total_savings) VALUES (1, 0)`);

  logger.info('Database initialised successfully');
  return _db;
}

module.exports = { initDb, getDb };
