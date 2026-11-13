/**
 * 本地自选 / 分组 / 偏好存储。
 *
 * 存储模型：整个自选状态是一份 JSON 文档，整体读、整体写。
 *
 * 为什么不做成关系表：自选项量级在几百条以内，整文档写入 < 20KB，
 * 换来的是「增删改排序」全部退化成纯数组操作，一份逻辑两端复用，
 * 不会出现「SQL 版和降级版行为不一致」这类难查的问题。
 *
 * 两个后端：
 *   - SQLite（iOS 原生，kv 表一行存文档）—— 默认
 *   - localStorage（浏览器预览 / SQLite 打开失败时的兜底）—— 保证任何环境下都可用
 *
 * 语义与后端 `/api/watchlist*` 严格对齐：每个写方法返回写入后的完整 `{ symbols }`。
 */

import { getLocalDatabase } from '../database/client'
import type { Database } from '../database/database'
import { normalizeSymbol } from './symbol'

export interface LocalWatchlistEntry {
  symbol: string
  added_at: string
  note: string
  name: string | null
  group_ids: string[]
  sort_order: number
}

export interface LocalWatchlistGroup {
  id: string
  name: string
  color: string
  sort_order: number
}

interface Doc {
  version: 2
  seq: number
  entries: LocalWatchlistEntry[]
  groups: LocalWatchlistGroup[]
}

const EMPTY: Doc = { version: 2, seq: 0, entries: [], groups: [] }
const DOC_KEY = 'local.watchlist.v2'
const LS_DOC_KEY = 'qd:local:watchlist.v2'
const LS_PREF_PREFIX = 'qd:local:pref:'

// ===== 后端选择 =====

type Backend = 'sqlite' | 'localstorage'

let _backend: Backend | null = null
let _db: Database | null = null
/** 文档缓存，避免每次操作都读一遍 */
let _doc: Doc | null = null
/** 串行队列：整文档读写必须串行，否则并发写会互相覆盖 */
let _queue: Promise<unknown> = Promise.resolve()

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

/**
 * 打开 SQLite 的超时。iOS 原生插件正常在 100ms 内完成；
 * 浏览器里的 jeep-sqlite 需要加载 wasm，资源缺失时会永久挂起（不是报错），
 * 不设超时就会让整个自选页停在"加载中"。
 */
const OPEN_TIMEOUT_MS = 2_500

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('本地数据库打开超时')), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

async function resolveBackend(): Promise<Backend> {
  if (_backend) return _backend
  try {
    const db = await withTimeout(getLocalDatabase(), OPEN_TIMEOUT_MS)
    _db = db
    _backend = 'sqlite'
    return 'sqlite'
  } catch {
    // 浏览器预览（wasm 资源缺失）或原生插件异常时降级，不让界面直接不可用
    _backend = 'localstorage'
    return 'localstorage'
  }
}

/** 设置页/诊断展示存储实际落点。 */
export function storageBackendLabel(): string {
  if (_backend === 'sqlite') return 'SQLite（本机数据库）'
  if (_backend === 'localstorage') return '浏览器本地存储（降级）'
  return '未初始化'
}

async function readRaw(): Promise<string | null> {
  const backend = await resolveBackend()
  if (backend === 'sqlite' && _db) {
    const row = await _db.get<{ value: string }>(`SELECT value FROM kv WHERE key = ?`, [DOC_KEY])
    return row?.value ?? null
  }
  return hasLocalStorage() ? localStorage.getItem(LS_DOC_KEY) : null
}

async function writeRaw(text: string): Promise<void> {
  const backend = await resolveBackend()
  if (backend === 'sqlite' && _db) {
    await _db.run(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [DOC_KEY, text, new Date().toISOString()],
    )
    return
  }
  if (hasLocalStorage()) localStorage.setItem(LS_DOC_KEY, text)
}

async function loadDoc(): Promise<Doc> {
  if (_doc) return _doc
  try {
    const raw = await readRaw()
    if (raw) {
      const parsed = JSON.parse(raw) as Doc
      if (parsed && Array.isArray(parsed.entries) && Array.isArray(parsed.groups)) {
        _doc = { ...EMPTY, ...parsed }
        return _doc
      }
    }
  } catch {
    // 文档损坏时重置，不阻断启动
  }
  _doc = { ...EMPTY }
  return _doc
}

async function saveDoc(doc: Doc): Promise<void> {
  _doc = doc
  await writeRaw(JSON.stringify(doc))
}

/** 所有写操作走同一把串行锁。 */
function mutate<T>(fn: (doc: Doc) => T | Promise<T>): Promise<T> {
  const run = _queue.then(async () => {
    const doc = await loadDoc()
    // 拷贝一份再改，异常时不污染内存状态
    const draft: Doc = {
      ...doc,
      entries: doc.entries.map((e) => ({ ...e, group_ids: [...e.group_ids] })),
      groups: doc.groups.map((g) => ({ ...g })),
    }
    const result = await fn(draft)
    await saveDoc(draft)
    return result
  })
  // 即使失败也要让队列继续
  _queue = run.catch(() => undefined)
  return run
}

function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}_${rand}`
}

function publicGroups(groups: LocalWatchlistGroup[]) {
  return [...groups]
    .sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : 1))
    .map((g) => ({ id: g.id, name: g.name, color: g.color as any }))
}

function publicEntries(doc: Doc): LocalWatchlistEntry[] {
  return [...doc.entries]
    .sort((a, b) => a.sort_order - b.sort_order || (a.added_at < b.added_at ? -1 : 1))
    .map((e) => ({ ...e, group_ids: [...e.group_ids] }))
}

// ===== 自选 =====

export async function listWatchlist(): Promise<LocalWatchlistEntry[]> {
  return publicEntries(await loadDoc())
}

export async function addWatchlist(
  symbol: string,
  note = '',
  groupId?: string | null,
  name?: string | null,
): Promise<LocalWatchlistEntry[]> {
  const sym = normalizeSymbol(symbol)
  if (!sym) throw new Error('标的代码为空')
  return mutate((doc) => {
    const existing = doc.entries.find((e) => e.symbol === sym)
    if (existing) {
      if (note) existing.note = note
      if (name && !existing.name) existing.name = name
      if (groupId && !existing.group_ids.includes(groupId)) existing.group_ids.push(groupId)
    } else {
      doc.entries.push({
        symbol: sym,
        added_at: new Date().toISOString(),
        note: note ?? '',
        name: name ?? null,
        group_ids: groupId ? [groupId] : [],
        sort_order: doc.seq++,
      })
    }
    return publicEntries(doc)
  })
}

export async function addWatchlistBatch(
  symbols: string[],
  note = '',
  groupId?: string | null,
  groupIds?: string[] | null,
): Promise<{ symbols: LocalWatchlistEntry[]; added: number }> {
  const targets = Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean)))
  return mutate((doc) => {
    let added = 0
    const now = new Date().toISOString()
    for (const sym of targets) {
      const existing = doc.entries.find((e) => e.symbol === sym)
      const groups = new Set<string>()
      if (groupId) groups.add(groupId)
      for (const g of groupIds ?? []) groups.add(g)
      if (!existing) {
        doc.entries.push({
          symbol: sym,
          added_at: now,
          note: note ?? '',
          name: null,
          group_ids: [...groups],
          sort_order: doc.seq++,
        })
        added++
      } else {
        for (const g of groups) if (!existing.group_ids.includes(g)) existing.group_ids.push(g)
      }
    }
    return { symbols: publicEntries(doc), added }
  })
}

export async function removeWatchlist(symbol: string): Promise<LocalWatchlistEntry[]> {
  const sym = normalizeSymbol(symbol)
  return mutate((doc) => {
    doc.entries = doc.entries.filter((e) => e.symbol !== sym)
    return publicEntries(doc)
  })
}

export async function clearWatchlist(): Promise<{ removed: number }> {
  return mutate((doc) => {
    const removed = doc.entries.length
    doc.entries = []
    return { removed }
  })
}

export async function moveWatchlistToTop(symbol: string): Promise<LocalWatchlistEntry[]> {
  const sym = normalizeSymbol(symbol)
  return mutate((doc) => {
    const min = doc.entries.reduce((m, e) => Math.min(m, e.sort_order), 0)
    const target = doc.entries.find((e) => e.symbol === sym)
    if (target) target.sort_order = min - 1
    return publicEntries(doc)
  })
}

export async function setWatchlistGroups(symbol: string, groupIds: string[]): Promise<LocalWatchlistEntry[]> {
  const sym = normalizeSymbol(symbol)
  return mutate((doc) => {
    const target = doc.entries.find((e) => e.symbol === sym)
    if (target) target.group_ids = Array.from(new Set(groupIds))
    return publicEntries(doc)
  })
}

// ===== 分组 =====

export async function listGroups(): Promise<{ groups: ReturnType<typeof publicGroups> }> {
  return { groups: publicGroups((await loadDoc()).groups) }
}

export async function createGroup(name: string, color: string) {
  return mutate((doc) => {
    const max = doc.groups.reduce((m, g) => Math.max(m, g.sort_order), 0)
    const id = newId('g')
    doc.groups.push({ id, name, color, sort_order: max + 1 })
    const groups = publicGroups(doc.groups)
    return { groups, group: groups.find((g) => g.id === id)! }
  })
}

export async function renameGroup(groupId: string, name: string, color: string) {
  return mutate((doc) => {
    const g = doc.groups.find((x) => x.id === groupId)
    if (g) {
      g.name = name
      g.color = color
    }
    return { groups: publicGroups(doc.groups) }
  })
}

export async function deleteGroup(groupId: string) {
  return mutate((doc) => {
    doc.groups = doc.groups.filter((g) => g.id !== groupId)
    for (const e of doc.entries) e.group_ids = e.group_ids.filter((g) => g !== groupId)
    return { groups: publicGroups(doc.groups), symbols: publicEntries(doc) }
  })
}

export async function clearGroup(groupId: string) {
  return mutate((doc) => {
    for (const e of doc.entries) e.group_ids = e.group_ids.filter((g) => g !== groupId)
    return { symbols: publicEntries(doc) }
  })
}

export async function reorderGroups(orderedIds: string[]) {
  return mutate((doc) => {
    orderedIds.forEach((id, i) => {
      const g = doc.groups.find((x) => x.id === id)
      if (g) g.sort_order = i
    })
    return { groups: publicGroups(doc.groups) }
  })
}

export async function addGroupMember(groupId: string, symbol: string) {
  const sym = normalizeSymbol(symbol)
  return mutate((doc) => {
    const target = doc.entries.find((e) => e.symbol === sym)
    if (target && !target.group_ids.includes(groupId)) target.group_ids.push(groupId)
    return { symbols: publicEntries(doc) }
  })
}

export async function removeGroupMember(groupId: string, symbol: string) {
  const sym = normalizeSymbol(symbol)
  return mutate((doc) => {
    const target = doc.entries.find((e) => e.symbol === sym)
    if (target) target.group_ids = target.group_ids.filter((g) => g !== groupId)
    return { symbols: publicEntries(doc) }
  })
}

/** 缓存标的名称（首次由行情源带回来后写入，避免每次重复请求）。 */
export async function rememberInstrumentNames(map: Record<string, string>): Promise<void> {
  const entries = Object.entries(map).filter(([s, n]) => s && n)
  if (entries.length === 0) return
  await mutate((doc) => {
    for (const [sym, name] of entries) {
      const target = doc.entries.find((e) => e.symbol === normalizeSymbol(sym))
      if (target && !target.name) target.name = name
    }
    return undefined
  })
}

export async function lookupNames(symbols: string[]): Promise<Record<string, string>> {
  if (symbols.length === 0) return {}
  const doc = await loadDoc()
  const out: Record<string, string> = {}
  for (const s of symbols) {
    const sym = normalizeSymbol(s)
    const hit = doc.entries.find((e) => e.symbol === sym)
    if (hit?.name) out[sym] = hit.name
  }
  return out
}

// ===== 首次使用预置 =====

/**
 * 首次启动预置一份示例自选。
 *
 * 不做这一步的话，新装 App 打开自选页是一片空白 + 一个搜索框，
 * 用户无法判断「是不是坏了」。预置 3 只标志性个股 + 2 个指数，
 * 让首屏立刻有行情、有 K 线、有指标，用户再自己增删。
 * 只执行一次（标记存偏好），用户清空后不会再被塞回来。
 */
const SEED_SYMBOLS = ['600519.SH', '000001.SZ', '300750.SZ', '000001.SH', '399006.SZ']

export async function seedDefaultWatchlist(): Promise<void> {
  if (await getPreference<boolean>('local.seeded', false)) return
  const doc = await loadDoc()
  if (doc.entries.length === 0) await addWatchlistBatch(SEED_SYMBOLS)
  await setPreference('local.seeded', true)
}

// ===== 偏好（键值） =====

export async function getPreference<T>(key: string, fallback: T): Promise<T> {
  const backend = await resolveBackend()
  try {
    if (backend === 'sqlite' && _db) {
      const row = await _db.get<{ value: string }>(`SELECT value FROM preferences WHERE key = ?`, [key])
      return row ? (JSON.parse(row.value) as T) : fallback
    }
    if (!hasLocalStorage()) return fallback
    const raw = localStorage.getItem(LS_PREF_PREFIX + key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export async function setPreference(key: string, value: unknown): Promise<void> {
  const backend = await resolveBackend()
  const text = JSON.stringify(value ?? null)
  if (backend === 'sqlite' && _db) {
    await _db.run(
      `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, text, new Date().toISOString()],
    )
    return
  }
  if (hasLocalStorage()) localStorage.setItem(LS_PREF_PREFIX + key, text)
}

export async function allPreferences(): Promise<Record<string, unknown>> {
  const backend = await resolveBackend()
  const out: Record<string, unknown> = {}
  if (backend === 'sqlite' && _db) {
    const rows = await _db.all<{ key: string; value: string }>(`SELECT key, value FROM preferences`)
    for (const r of rows) {
      try {
        out[r.key] = JSON.parse(r.value)
      } catch {
        out[r.key] = r.value
      }
    }
    return out
  }
  if (!hasLocalStorage()) return out
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k?.startsWith(LS_PREF_PREFIX)) continue
    const raw = localStorage.getItem(k)
    try {
      out[k.slice(LS_PREF_PREFIX.length)] = raw == null ? null : JSON.parse(raw)
    } catch {
      out[k.slice(LS_PREF_PREFIX.length)] = raw
    }
  }
  return out
}

/** 仅测试用：注入已迁移好的数据库实例，避免依赖平台驱动。 */
export function __setStoreDbForTest(database: Database | null): void {
  _db = database
  _backend = database ? 'sqlite' : null
  _doc = null
  _queue = Promise.resolve()
}

/** 测试用：清空内存态。 */
export function __resetStoreForTest(): void {
  _db = null
  _backend = null
  _doc = null
  _queue = Promise.resolve()
}
