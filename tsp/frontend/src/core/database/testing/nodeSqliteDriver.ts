import { DatabaseSync } from 'node:sqlite'
import { LocalError } from '../../errors'
import type { RunResult, SqlDriver } from '../types'

/**
 * 仅在 Node 测试环境使用的驱动（Node >= 22 内置 `node:sqlite`）。
 *
 * 目的：让迁移、事务、约束、持久化这些行为在 CI 里跑真实 SQLite，
 * 而不是用 Map 之类的假实现糊过去。生产构建不会引用本文件。
 */
export class NodeSqliteDriver implements SqlDriver {
  readonly kind = 'node' as const
  private db: DatabaseSync | null = null

  constructor(private readonly filename: string) {}

  async open(): Promise<void> {
    if (this.db) return
    try {
      this.db = new DatabaseSync(this.filename)
      this.db.exec('PRAGMA foreign_keys = ON')
    } catch (err) {
      throw new LocalError('DB_OPEN_FAILED', `无法打开测试数据库: ${this.filename}`, { cause: err })
    }
  }

  async exec(sql: string): Promise<void> {
    this.require().exec(sql)
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<RunResult> {
    const info = this.require().prepare(sql).run(...(params as never[]))
    const last = info.lastInsertRowid
    return {
      changes: Number(info.changes ?? 0),
      lastInsertRowid: typeof last === 'bigint' ? Number(last) : (last ?? null),
    }
  }

  async all<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    const rows = this.require().prepare(sql).all(...(params as never[]))
    return rows.map((row) => ({ ...(row as Record<string, unknown>) })) as T[]
  }

  async begin(): Promise<void> {
    this.require().exec('BEGIN')
  }

  async commit(): Promise<void> {
    this.require().exec('COMMIT')
  }

  async rollback(): Promise<void> {
    this.require().exec('ROLLBACK')
  }

  async close(): Promise<void> {
    if (!this.db) return
    this.db.close()
    this.db = null
  }

  isOpen(): boolean {
    return this.db !== null
  }

  private require(): DatabaseSync {
    if (!this.db) throw new LocalError('DB_CLOSED', '测试数据库未打开')
    return this.db
  }
}
