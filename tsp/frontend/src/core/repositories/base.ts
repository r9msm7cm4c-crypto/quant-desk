import type { Database } from '../database/database'
import type { RunResult } from '../database/types'

/**
 * Repository 基类：把 SQL 收在一层，页面与组件不得直接持有 Database。
 *
 * 约定：
 * - 只暴露语义化方法，不暴露通用 SQL 执行入口给 UI。
 * - 时间字段一律用 `nowIso()`，避免各仓各自格式化。
 */
export abstract class BaseRepository {
  constructor(protected readonly db: Database) {}

  protected queryAll<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return this.db.all<T>(sql, params)
  }

  protected queryOne<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
    return this.db.get<T>(sql, params)
  }

  protected execute(sql: string, params: readonly unknown[] = []): Promise<RunResult> {
    return this.db.run(sql, params)
  }

  protected tx<T>(fn: (db: Database) => Promise<T>): Promise<T> {
    return this.db.transaction(fn)
  }

  protected nowIso(): string {
    return new Date().toISOString()
  }
}
