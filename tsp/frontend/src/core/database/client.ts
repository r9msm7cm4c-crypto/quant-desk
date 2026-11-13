import { Capacitor } from '@capacitor/core'
import { LocalError } from '../errors'
import { Database } from './database'
import { CapacitorSqliteDriver } from './drivers/capacitor'
import { MIGRATIONS } from './schema'
import type { Migration, SqlDriver } from './types'

let instance: Database | null = null
let opening: Promise<Database> | null = null

export interface OpenOptions {
  /** 测试或特殊场景注入驱动；不传则按平台选择。 */
  driver?: SqlDriver
  migrations?: readonly Migration[]
}

/**
 * 打开本地数据库（幂等）。并发调用共享同一次初始化，避免创建两个连接。
 */
export async function openLocalDatabase(options: OpenOptions = {}): Promise<Database> {
  if (instance?.isOpen) return instance
  if (opening) return opening

  opening = (async () => {
    const driver = options.driver ?? createPlatformDriver()
    await driver.open()
    const db = new Database(driver)
    await db.migrate(options.migrations ?? MIGRATIONS)
    instance = db
    return db
  })()

  try {
    return await opening
  } finally {
    opening = null
  }
}

export async function getLocalDatabase(): Promise<Database> {
  if (instance?.isOpen) return instance
  return openLocalDatabase()
}

export async function closeLocalDatabase(): Promise<void> {
  if (!instance) return
  const db = instance
  instance = null
  await db.close()
}

/** 仅用于测试：重置单例，避免用例之间互相污染。 */
export function __resetLocalDatabaseForTest(): void {
  instance = null
  opening = null
}

function createPlatformDriver(): SqlDriver {
  const platform = Capacitor.getPlatform()
  if (platform === 'ios' || platform === 'android' || platform === 'web') {
    return new CapacitorSqliteDriver()
  }
  throw new LocalError('DB_NOT_AVAILABLE', `当前平台不支持本地数据库: ${platform}`)
}
