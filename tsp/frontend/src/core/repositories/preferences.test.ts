import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Database } from '../database/database'
import { NodeSqliteDriver } from '../database/testing/nodeSqliteDriver'
import { PreferencesRepository } from './preferences'

let dir: string
let db: Database
let repo: PreferencesRepository

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'qd-pref-'))
  const driver = new NodeSqliteDriver(join(dir, `p-${randomUUID()}.db`))
  await driver.open()
  db = new Database(driver)
  await db.migrate()
  repo = new PreferencesRepository(db)
})

afterEach(async () => {
  await db.close().catch(() => undefined)
  rmSync(dir, { recursive: true, force: true })
})

describe('PreferencesRepository', () => {
  it('写入后可以读回，并记录更新时间', async () => {
    await repo.set('theme', 'dark')
    expect(await repo.get('theme')).toBe('dark')

    const at = await repo.updatedAt('theme')
    expect(at).toBeTruthy()
    expect(Number.isNaN(Date.parse(at!))).toBe(false)
  })

  it('同 key 覆盖写入只保留一行', async () => {
    await repo.set('quote_interval', '3')
    await repo.set('quote_interval', '5')
    const rows = await db.all('SELECT * FROM preferences WHERE key = ?', ['quote_interval'])
    expect(rows).toHaveLength(1)
    expect(await repo.get('quote_interval')).toBe('5')
  })

  it('JSON 往返保持结构', async () => {
    const cols = [{ key: 'symbol', width: 120 }, { key: 'change', width: 80 }]
    await repo.setJson('watchlist_columns', cols)
    expect(await repo.getJson('watchlist_columns', [])).toEqual(cols)
  })

  it('缺失 key 返回兜底值，损坏 JSON 也返回兜底而不抛错', async () => {
    expect(await repo.getJson('missing', { a: 1 })).toEqual({ a: 1 })

    await repo.set('broken', '{not json')
    expect(await repo.getJson('broken', { fallback: true })).toEqual({ fallback: true })
  })

  it('批量写入成功时全部可见', async () => {
    await repo.setMany({ a: '1', b: '2', c: '3' })
    expect(await repo.entries()).toMatchObject({ a: '1', b: '2', c: '3' })
  })

  it('批量写入中途失败时整体回滚', async () => {
    await repo.setMany({ keep: 'yes' })

    // 用一个必失败的值触发错误：SQLite 的 TEXT 列拒绝 null 绑定
    const bad = { ok: '1' } as Record<string, string>
    Object.defineProperty(bad, 'boom', { enumerable: true, get: () => undefined as unknown as string })

    await expect(repo.setMany(bad)).rejects.toBeTruthy()
    const keys = await repo.keys()
    expect(keys).toEqual(['keep'])
  })

  it('删除返回是否命中，重复删除返回 false', async () => {
    await repo.set('temp', '1')
    expect(await repo.remove('temp')).toBe(true)
    expect(await repo.remove('temp')).toBe(false)
  })

  it('clear 清空全部并返回条数', async () => {
    await repo.setMany({ x: '1', y: '2' })
    expect(await repo.clear()).toBe(2)
    expect(await repo.keys()).toEqual([])
  })
})
