import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { LocalError, classifyDbError } from '../../errors'
import type { RunResult, SqlDriver } from '../types'

const DB_NAME = 'quantdesk'

/**
 * 生产驱动：iOS 走原生 SQLite，浏览器走 jeep-sqlite（WASM）。
 *
 * 两端使用同一个 SQL 方言与同一套 Repository，避免「开发期能跑、真机跑不通」。
 */
export class CapacitorSqliteDriver implements SqlDriver {
  readonly kind = 'capacitor' as const

  private sqlite: SQLiteConnection | null = null
  private conn: SQLiteDBConnection | null = null

  async open(): Promise<void> {
    if (this.conn) {
      const state = await this.conn.isDBOpen()
      if (state.result) return
    }
    try {
      if (!this.sqlite) {
        await this.prepareWebRuntimeIfNeeded()
        this.sqlite = new SQLiteConnection(CapacitorSQLite)
        if (Capacitor.getPlatform() === 'web') {
          await this.sqlite.initWebStore()
        }
      }

      const existing = await this.sqlite.isConnection(DB_NAME, false)
      this.conn = existing.result
        ? await this.sqlite.retrieveConnection(DB_NAME, false)
        : await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)

      const opened = await this.conn.isDBOpen()
      if (!opened.result) await this.conn.open()

      await this.conn.execute('PRAGMA foreign_keys = ON;')
      await this.conn.execute('PRAGMA journal_mode = WAL;')
    } catch (err) {
      throw new LocalError('DB_OPEN_FAILED', '无法打开本地数据库', { cause: err })
    }
  }

  async exec(sql: string): Promise<void> {
    const conn = this.requireConn()
    try {
      await conn.execute(sql)
    } catch (err) {
      throw classifyDbError(err)
    }
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<RunResult> {
    const conn = this.requireConn()
    try {
      const res = await conn.run(sql, params as unknown[])
      return {
        changes: res.changes?.changes ?? 0,
        lastInsertRowid: res.changes?.lastId ?? null,
      }
    } catch (err) {
      throw classifyDbError(err)
    }
  }

  async all<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    const conn = this.requireConn()
    try {
      const res = await conn.query(sql, params as unknown[])
      return (res.values ?? []) as T[]
    } catch (err) {
      throw classifyDbError(err)
    }
  }

  async begin(): Promise<void> {
    await this.requireConn().beginTransaction()
  }

  async commit(): Promise<void> {
    await this.requireConn().commitTransaction()
  }

  async rollback(): Promise<void> {
    await this.requireConn().rollbackTransaction()
  }

  async close(): Promise<void> {
    if (!this.sqlite || !this.conn) return
    try {
      await this.conn.close()
      await this.sqlite.closeConnection(DB_NAME, false)
    } catch {
      // 关闭失败不应阻断退出流程
    } finally {
      this.conn = null
    }
  }

  isOpen(): boolean {
    return this.conn !== null
  }

  private requireConn(): SQLiteDBConnection {
    if (!this.conn) throw new LocalError('DB_CLOSED', '本地数据库连接未打开')
    return this.conn
  }

  /** 浏览器端需要 jeep-sqlite 自定义元素与 wasm 资源，缺一不可。 */
  private async prepareWebRuntimeIfNeeded(): Promise<void> {
    if (Capacitor.getPlatform() !== 'web') return
    if (typeof document === 'undefined') {
      throw new LocalError('DB_NOT_AVAILABLE', '浏览器端缺少 document，无法初始化 SQLite')
    }
    if (!document.querySelector('jeep-sqlite')) {
      const { defineCustomElements } = await import('jeep-sqlite/loader')
      defineCustomElements(window)
      const el = document.createElement('jeep-sqlite')
      el.setAttribute('auto-save', 'true')
      document.body.appendChild(el)
    }
    await customElements.whenDefined('jeep-sqlite')
  }
}
