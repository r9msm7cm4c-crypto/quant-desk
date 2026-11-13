import { BaseRepository } from './base'

interface PreferenceRow {
  key: string
  value: string
  updated_at: string
}

/**
 * 键值型偏好存储，替代 `/api/settings/preferences` 里与设备相关的那部分。
 *
 * 与后端 preferences 的关系：后端仍保存「跨设备」的完整偏好对象；
 * 本地表只保存本机需要的字段（列设置、刷新频率、布局等），
 * 迁移时按 key 逐条对齐，不做整对象覆盖，避免把服务端新旧字段写坏。
 */
export class PreferencesRepository extends BaseRepository {
  async get(key: string): Promise<string | null> {
    const row = await this.queryOne<PreferenceRow>('SELECT value FROM preferences WHERE key = ?', [key])
    return row?.value ?? null
  }

  async getJson<T>(key: string, fallback: T): Promise<T> {
    const raw = await this.get(key)
    if (raw === null) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      // 值损坏时返回兜底，不抛错阻断页面启动；损坏值留在库里供诊断。
      return fallback
    }
  }

  async set(key: string, value: string): Promise<void> {
    const now = this.nowIso()
    await this.execute(
      `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, now],
    )
  }

  async setJson(key: string, value: unknown): Promise<void> {
    await this.set(key, JSON.stringify(value))
  }

  /** 批量写入，整体成功或整体回滚。 */
  async setMany(entries: Record<string, string>): Promise<void> {
    const keys = Object.keys(entries)
    if (keys.length === 0) return
    const now = this.nowIso()
    await this.tx(async (db) => {
      for (const key of keys) {
        await db.run(
          `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [key, entries[key], now],
        )
      }
    })
  }

  async remove(key: string): Promise<boolean> {
    const res = await this.execute('DELETE FROM preferences WHERE key = ?', [key])
    return res.changes > 0
  }

  async keys(): Promise<string[]> {
    const rows = await this.queryAll<{ key: string }>('SELECT key FROM preferences ORDER BY key')
    return rows.map((r) => r.key)
  }

  async entries(): Promise<Record<string, string>> {
    const rows = await this.queryAll<PreferenceRow>('SELECT key, value FROM preferences')
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  }

  async updatedAt(key: string): Promise<string | null> {
    const row = await this.queryOne<PreferenceRow>('SELECT updated_at FROM preferences WHERE key = ?', [key])
    return row?.updated_at ?? null
  }

  async clear(): Promise<number> {
    const res = await this.execute('DELETE FROM preferences')
    return res.changes
  }
}
