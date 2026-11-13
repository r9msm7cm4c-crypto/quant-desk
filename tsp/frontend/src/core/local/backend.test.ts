import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Database } from '../database/database'
import { NodeSqliteDriver } from '../database/testing/nodeSqliteDriver'
import { __setStoreDbForTest, listGroups, listWatchlist } from './store'
import { handleLocalRequest, LocalApiError, isLocallySupported } from './backend'

let dir: string
let db: Database

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'qd-local-'))
  const driver = new NodeSqliteDriver(join(dir, `l-${randomUUID()}.db`))
  await driver.open()
  db = new Database(driver)
  await db.migrate()
  __setStoreDbForTest(db)
})

afterEach(async () => {
  __setStoreDbForTest(null)
  await db.close().catch(() => undefined)
  rmSync(dir, { recursive: true, force: true })
})

function req(path: string, method = 'GET', body?: unknown) {
  return handleLocalRequest(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('本地自选 CRUD', () => {
  it('新增后能读回，并做代码归一化', async () => {
    const res: any = await req('/api/watchlist', 'POST', { symbol: 'sh600519' })
    expect(res.symbols).toHaveLength(1)
    expect(res.symbols[0].symbol).toBe('600519.SH')

    const list: any = await req('/api/watchlist')
    expect(list.symbols.map((s: any) => s.symbol)).toEqual(['600519.SH'])
  })

  it('重复添加不产生重复行', async () => {
    await req('/api/watchlist', 'POST', { symbol: '600519' })
    const res: any = await req('/api/watchlist', 'POST', { symbol: '600519.SH' })
    expect(res.symbols).toHaveLength(1)
  })

  it('删除后为空', async () => {
    await req('/api/watchlist', 'POST', { symbol: '600519' })
    const res: any = await req('/api/watchlist/600519.SH', 'DELETE')
    expect(res.symbols).toHaveLength(0)
  })

  it('批量添加去重并返回新增数', async () => {
    const res: any = await req('/api/watchlist/batch', 'POST', { symbols: ['600519', '600519.SH', '000001'] })
    expect(res.added).toBe(2)
    expect(res.symbols).toHaveLength(2)
  })

  it('置顶把该行排到最前', async () => {
    await req('/api/watchlist/batch', 'POST', { symbols: ['600519', '000001', '300750'] })
    const res: any = await req('/api/watchlist/300750.SZ/top', 'POST')
    expect(res.symbols[0].symbol).toBe('300750.SZ')
  })

  it('清空返回删除条数', async () => {
    await req('/api/watchlist/batch', 'POST', { symbols: ['600519', '000001'] })
    const res: any = await req('/api/watchlist', 'DELETE')
    expect(res.removed).toBe(2)
    expect((await listWatchlist())).toHaveLength(0)
  })
})

describe('本地分组', () => {
  it('建组并加成员，group_ids 反映在多分组里', async () => {
    const g: any = await req('/api/watchlist/groups', 'POST', { name: '核心', color: 'rose' })
    const gid = g.group.id
    await req('/api/watchlist', 'POST', { symbol: '600519', group_id: gid })
    const list: any = await req('/api/watchlist')
    expect(list.symbols[0].group_ids).toEqual([gid])
  })

  it('一只票可属于多个分组', async () => {
    const a: any = await req('/api/watchlist/groups', 'POST', { name: 'A', color: 'sky' })
    const b: any = await req('/api/watchlist/groups', 'POST', { name: 'B', color: 'teal' })
    await req('/api/watchlist', 'POST', { symbol: '600519' })
    await req(`/api/watchlist/groups/${a.group.id}/members/600519.SH`, 'POST')
    await req(`/api/watchlist/groups/${b.group.id}/members/600519.SH`, 'POST')
    const list: any = await req('/api/watchlist')
    expect(list.symbols[0].group_ids.sort()).toEqual([a.group.id, b.group.id].sort())
  })

  it('删除分组会清掉成员关系但保留自选', async () => {
    const g: any = await req('/api/watchlist/groups', 'POST', { name: '临时', color: 'lime' })
    await req('/api/watchlist', 'POST', { symbol: '600519', group_id: g.group.id })
    const res: any = await req(`/api/watchlist/groups/${g.group.id}`, 'DELETE')
    expect(res.groups).toHaveLength(0)
    expect(res.symbols[0].symbol).toBe('600519.SH')
    expect(res.symbols[0].group_ids).toEqual([])
  })

  it('重排序按传入顺序落 sort_order', async () => {
    const a: any = await req('/api/watchlist/groups', 'POST', { name: 'A', color: 'sky' })
    const b: any = await req('/api/watchlist/groups', 'POST', { name: 'B', color: 'teal' })
    const res: any = await req('/api/watchlist/groups/reorder', 'PUT', { ordered_ids: [b.group.id, a.group.id] })
    expect(res.groups.map((g: any) => g.name)).toEqual(['B', 'A'])
  })

  it('/groups/reorder 不会被 /:id 吞掉', async () => {
    expect(isLocallySupported('PUT', '/api/watchlist/groups/reorder')).toBe(true)
    const groups = await listGroups()
    expect(groups.groups).toEqual([])
  })
})

describe('本地导入代码', () => {
  it('从任意文本抽出 6 位代码', async () => {
    const res: any = await req('/api/watchlist/import-codes', 'POST', {
      text: '600519 贵州茅台, 000001；300750',
    })
    expect(res.codes).toEqual(['600519', '000001', '300750'])
    expect(res.matched_count).toBe(3)
  })
})

describe('未实现能力明确报 501', () => {
  it('选股返回可读原因而不是空数组', async () => {
    await expect(req('/api/screener/run_preset', 'POST', {})).rejects.toBeInstanceOf(LocalApiError)
    try {
      await req('/api/screener/run_preset', 'POST', {})
    } catch (e: any) {
      expect(e.status).toBe(501)
      expect(e.message).toContain('本地模式暂不支持')
      expect(e.message).toContain('选股与策略')
    }
  })

  it('回测与 AI 也被识别', async () => {
    for (const p of ['/api/backtest/run', '/api/regime/states', '/api/financials/status']) {
      await expect(req(p)).rejects.toMatchObject({ status: 501 })
    }
  })

  it('未知路径不返回空对象', async () => {
    const spy = await req('/api/totally/unknown').catch((e) => e)
    expect(spy.status).toBe(501)
  })
})
