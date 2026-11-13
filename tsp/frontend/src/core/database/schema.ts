import type { Migration } from './types'

/**
 * 本地数据库结构定义。
 *
 * 设计约束：
 * 1. 只建「用户态数据」——行情、财务等可再获取的数据不进 SQLite 主表（走独立缓存表与迁移）。
 * 2. 所有时间统一存 ISO 8601 字符串（UTC），避免 SQLite 无时区类型导致的歧义。
 * 3. 外键只在明确存在上下级关系时使用，且依赖 `PRAGMA foreign_keys = ON`。
 * 4. 每个迁移只增不改：已发布的迁移不再修改，结构变更一律新增版本。
 */

export const SCHEMA_VERSION = 1

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'init_core_tables',
    up: [
      `CREATE TABLE IF NOT EXISTS preferences (
         key        TEXT PRIMARY KEY,
         value      TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS watchlist_groups (
         id         TEXT PRIMARY KEY,
         name       TEXT NOT NULL,
         color      TEXT,
         sort_order INTEGER NOT NULL DEFAULT 0,
         created_at TEXT NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS watchlist_entries (
         symbol     TEXT PRIMARY KEY,
         name       TEXT,
         note       TEXT NOT NULL DEFAULT '',
         group_id   TEXT REFERENCES watchlist_groups(id) ON DELETE SET NULL,
         sort_order INTEGER NOT NULL DEFAULT 0,
         created_at TEXT NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_watchlist_entries_group
         ON watchlist_entries(group_id, sort_order)`,
      `CREATE TABLE IF NOT EXISTS lots (
         id         TEXT PRIMARY KEY,
         symbol     TEXT NOT NULL,
         quantity   REAL NOT NULL,
         cost       REAL NOT NULL,
         trade_date TEXT,
         note       TEXT NOT NULL DEFAULT '',
         created_at TEXT NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_lots_symbol ON lots(symbol)`,
      `CREATE TABLE IF NOT EXISTS research_notes (
         id         TEXT PRIMARY KEY,
         title      TEXT NOT NULL,
         body       TEXT NOT NULL DEFAULT '',
         tags       TEXT NOT NULL DEFAULT '',
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS datasets (
         id          TEXT PRIMARY KEY,
         name        TEXT NOT NULL,
         source      TEXT NOT NULL,
         row_count   INTEGER NOT NULL DEFAULT 0,
         meta        TEXT,
         imported_at TEXT NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS kv (
         key        TEXT PRIMARY KEY,
         value      TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
    ],
  },
]
