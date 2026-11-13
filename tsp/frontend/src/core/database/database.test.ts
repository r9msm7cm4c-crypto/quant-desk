import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Database } from './database'
import { NodeSqliteDriver } from './testing/nodeSqliteDriver'
import { MIGRATIONS } from './schema'
import type { Migration } from './types'
import { LocalError } from '../errors'

let dir: string
let file: string
let driver: NodeSqliteDriver
let db: Database

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'qd-db-'))
  file = join(dir, `test-${randomUUID()}.db`)
  driver = new NodeSqliteDriver(file)
  await driver.open()
  db = new Database(driver)
})

afterEach(async () => {
  await db.close().catch(() => undefined)
  rmSync(dir, { recursive: true, force: true })
})

describe('Database 迁移', () => {
  it('首次迁移建表并写入版本记录', async () => {
    const applied = await db.migrate()
    expect(applied).toBe(1)

    const rows = await db.all<{ version: number; name: string }>(
      'SELECT version, name FROM schema_migrations ORDER BY version',
    )
    expect(rows).toEqual([{ version: 1, name: 'init_core_tables' }])

    const tables = await db.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    )
    const names = tables.map((t) => t.name)
    for (const t of [
      'preferences',
      'watchlist_entries',
      'watchlist_groups',
      'lots',
      'research_notes',
      'datasets',
      'kv',
      'schema_migrations',
    ]) {
      expect(names).toContain(t)
    }
  })

  it('重复迁移是幂等的', async () => {
    expect(await db.migrate()).toBe(1)
    expect(await db.migrate()).toBe(0)
    const rows = await db.all('SELECT version FROM schema_migrations')
    expect(rows).toHaveLength(1)
  })

  it('迁移失败整体回滚，版本不前进', async () => {
    const broken: Migration[] = [
      ...MIGRATIONS,
      {
        version: 2,
        name: 'broken',
        up: ['CREATE TABLE should_vanish (id TEXT)', 'THIS IS NOT SQL'],
      },
    ]
    await expect(db.migrate(broken)).rejects.toBeInstanceOf(LocalError)

    const versions = await db.all<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version')
    expect(versions.map((v) => v.version)).toEqual([1])

    const leftover = await db.all(`SELECT name FROM sqlite_master WHERE name = 'should_vanish'`)
    expect(leftover).toHaveLength(0)
  })

  it('拒绝低于库中版本的代码（防止旧 App 破坏新数据）', async () => {
    await db.migrate()
    await db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
      5,
      'future',
      new Date().toISOString(),
    ])
    await expect(db.migrate()).rejects.toThrow(/高于当前 App 支持的版本/)
  })
})

describe('Database 事务', () => {
  beforeEach(async () => {
    await db.migrate()
  })

  it('事务内抛错时全部回滚', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.run('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)', ['a', '1', new Date().toISOString()])
        throw new Error('boom')
      }),
    ).rejects.toBeTruthy()

    const rows = await db.all('SELECT * FROM kv')
    expect(rows).toHaveLength(0)
  })

  it('嵌套事务被拒绝而不是静默合并', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.transaction(async () => undefined)
      }),
    ).rejects.toMatchObject({ code: 'TRANSACTION_NESTED' })
  })

  it('事务提交后数据可见', async () => {
    await db.transaction(async (tx) => {
      await tx.run('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)', ['k', 'v', new Date().toISOString()])
    })
    const row = await db.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', ['k'])
    expect(row?.value).toBe('v')
  })
})

describe('Database 约束与持久化', () => {
  beforeEach(async () => {
    await db.migrate()
  })

  it('外键约束生效：引用不存在的分组会被拒绝', async () => {
    await expect(
      db.run(
        'INSERT INTO watchlist_entries (symbol, name, note, group_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['000001.SZ', '平安银行', '', 'no-such-group', 0, new Date().toISOString()],
      ),
    ).rejects.toMatchObject({ code: 'CONSTRAINT_VIOLATION' })
  })

  it('唯一约束冲突被归类为约束错误', async () => {
    const now = new Date().toISOString()
    await db.run('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)', ['dup', '1', now])
    await expect(
      db.run('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)', ['dup', '2', now]),
    ).rejects.toMatchObject({ code: 'CONSTRAINT_VIOLATION' })
  })

  it('关闭后重新打开，数据仍在（真实文件持久化）', async () => {
    await db.run('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)', ['persist', 'yes', new Date().toISOString()])
    await db.close()

    const again = new NodeSqliteDriver(file)
    await again.open()
    const reopened = new Database(again)
    const applied = await reopened.migrate()

    expect(applied).toBe(0) // 迁移已存在，不重复执行
    const row = await reopened.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', ['persist'])
    expect(row?.value).toBe('yes')

    await reopened.close()
  })

  it('关闭后继续操作会得到明确的 DB_CLOSED', async () => {
    await db.close()
    await expect(db.all('SELECT 1')).rejects.toMatchObject({ code: 'DB_CLOSED' })
  })
})
