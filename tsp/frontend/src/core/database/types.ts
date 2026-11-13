/** 本地数据库驱动契约。所有平台实现必须满足 SQLite 方言与事务语义。 */

export interface RunResult {
  changes: number
  lastInsertRowid: number | null
}

export type DriverKind = 'capacitor' | 'node'

export interface SqlDriver {
  readonly kind: DriverKind
  /** 打开连接并设置 PRAGMA（foreign_keys / journal_mode）。重复调用必须幂等。 */
  open(): Promise<void>
  /** 执行一条或多条不含参数的语句（DDL、PRAGMA、事务控制）。 */
  exec(sql: string): Promise<void>
  /** 执行单条带参数语句。 */
  run(sql: string, params?: readonly unknown[]): Promise<RunResult>
  /** 查询多行。 */
  all<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>
  begin(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  close(): Promise<void>
  isOpen(): boolean
}

export interface Migration {
  version: number
  name: string
  /** 按顺序执行的语句。整个迁移在一个事务内，任一语句失败即回滚。 */
  up: readonly string[]
}
