import { LocalError, classifyDbError } from '../errors'
import { MIGRATIONS } from './schema'
import type { Migration, RunResult, SqlDriver } from './types'

const MIGRATION_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`

/**
 * 本地数据库门面：统一封装错误分类、事务与迁移。
 *
 * 上层（Repository）只依赖这个类，不直接接触驱动，也不直接执行 BEGIN/COMMIT。
 */
export class Database {
  private txDepth = 0
  private closed = false

  constructor(readonly driver: SqlDriver) {}

  get isOpen(): boolean {
    return !this.closed && this.driver.isOpen()
  }

  /** 连通性探测：用于启动自检与「数据库关闭后重开」验证。 */
  async ping(): Promise<boolean> {
    const rows = await this.all<{ ok: number }>('SELECT 1 AS ok')
    return rows.length === 1 && rows[0]?.ok === 1
  }

  async exec(sql: string): Promise<void> {
    this.assertOpen()
    try {
      await this.driver.exec(sql)
    } catch (err) {
      throw classifyDbError(err)
    }
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<RunResult> {
    this.assertOpen()
    try {
      return await this.driver.run(sql, params)
    } catch (err) {
      throw classifyDbError(err)
    }
  }

  async all<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    this.assertOpen()
    try {
      return await this.driver.all<T>(sql, params)
    } catch (err) {
      throw classifyDbError(err)
    }
  }

  async get<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
    const rows = await this.all<T>(sql, params)
    return rows[0] ?? null
  }

  /**
   * 事务。SQLite 不支持嵌套事务，嵌套调用直接抛错，
   * 避免出现「内层 COMMIT 把外层一起提交」的隐蔽 bug。
   */
  async transaction<T>(fn: (db: Database) => Promise<T>): Promise<T> {
    this.assertOpen()
    if (this.txDepth > 0) {
      throw new LocalError('TRANSACTION_NESTED', '不支持嵌套事务，请把写操作合并到同一事务内')
    }
    await this.driver.begin()
    this.txDepth += 1
    try {
      const result = await fn(this)
      await this.driver.commit()
      return result
    } catch (err) {
      try {
        await this.driver.rollback()
      } catch {
        // 回滚失败不应掩盖原始错误；连接已不可用时由上层关闭重开。
      }
      throw classifyDbError(err, 'TRANSACTION_FAILED')
    } finally {
      this.txDepth -= 1
    }
  }

  /**
   * 执行迁移。返回本次实际应用的迁移数量。
   *
   * 规则：
   * - 每个迁移独立事务，失败即回滚，版本号不前进。
   * - 已应用的版本跳过，保证幂等。
   * - 检测「代码里的迁移版本低于库中版本」的降级场景并拒绝，避免旧版 App 破坏新数据。
   */
  async migrate(migrations: readonly Migration[] = MIGRATIONS): Promise<number> {
    this.assertOpen()
    await this.exec(MIGRATION_TABLE)

    const sorted = [...migrations].sort((a, b) => a.version - b.version)
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i]!.version === sorted[i - 1]!.version) {
        throw new LocalError('MIGRATION_FAILED', `迁移版本重复: ${sorted[i]!.version}`)
      }
    }

    const appliedRows = await this.all<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version')
    const applied = new Set(appliedRows.map((r) => Number(r.version)))
    const currentMax = appliedRows.reduce((max, r) => Math.max(max, Number(r.version)), 0)
    const codeMax = sorted.reduce((max, m) => Math.max(max, m.version), 0)

    if (currentMax > codeMax) {
      throw new LocalError(
        'MIGRATION_FAILED',
        `本地数据库版本（v${currentMax}）高于当前 App 支持的版本（v${codeMax}），请升级 App 后再打开`,
      )
    }

    let count = 0
    for (const migration of sorted) {
      if (applied.has(migration.version)) continue
      await this.transaction(async (db) => {
        for (const statement of migration.up) {
          await db.exec(statement)
        }
        await db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
          migration.version,
          migration.name,
          new Date().toISOString(),
        ])
      })
      count += 1
    }

    if (count > 0) {
      // user_version 仅用于外部工具（sqlite3 CLI）快速识别，权威来源仍是 schema_migrations。
      await this.exec(`PRAGMA user_version = ${codeMax}`)
    }
    return count
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.driver.close()
  }

  private assertOpen(): void {
    if (this.closed || !this.driver.isOpen()) {
      throw new LocalError('DB_CLOSED', '本地数据库尚未初始化或已关闭')
    }
  }
}
