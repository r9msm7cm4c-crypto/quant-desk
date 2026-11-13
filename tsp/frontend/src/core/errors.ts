/**
 * Local-first 基础层的统一错误类型。
 *
 * 原则：错误只描述「哪一层、什么类别、可不可以重试」，不携带 SQL 原文与用户数据，
 * 避免错误提示或日志泄露持仓、密钥等内容。
 */

export type LocalErrorCode =
  | 'DB_NOT_AVAILABLE'
  | 'DB_OPEN_FAILED'
  | 'DB_CLOSED'
  | 'MIGRATION_FAILED'
  | 'QUERY_FAILED'
  | 'CONSTRAINT_VIOLATION'
  | 'TRANSACTION_NESTED'
  | 'TRANSACTION_FAILED'
  | 'NOT_FOUND'
  | 'INVALID_ARGUMENT'

export class LocalError extends Error {
  readonly code: LocalErrorCode
  /** 底层原因（保留用于开发者排查，不直接展示给用户） */
  readonly cause?: unknown
  /** 是否值得重试（连接类错误通常可重试，约束冲突不可） */
  readonly retryable: boolean

  constructor(code: LocalErrorCode, message: string, options?: { cause?: unknown; retryable?: boolean }) {
    super(message)
    this.name = 'LocalError'
    this.code = code
    this.cause = options?.cause
    this.retryable = options?.retryable ?? false
  }
}

/** 把驱动抛出的原始错误归类，避免上层各处重复判断字符串。 */
export function classifyDbError(err: unknown, fallback: LocalErrorCode = 'QUERY_FAILED'): LocalError {
  if (err instanceof LocalError) return err
  const text = err instanceof Error ? err.message : String(err ?? '')
  const lower = text.toLowerCase()

  if (lower.includes('unique constraint') || lower.includes('constraint failed') || lower.includes('foreign key')) {
    return new LocalError('CONSTRAINT_VIOLATION', '数据违反唯一性或关联约束', { cause: err })
  }
  if (lower.includes('database is closed') || lower.includes('connection is not open')) {
    return new LocalError('DB_CLOSED', '本地数据库连接已关闭', { cause: err })
  }
  if (lower.includes('database is locked') || lower.includes('busy')) {
    return new LocalError('DB_OPEN_FAILED', '本地数据库被占用，请稍后重试', { cause: err, retryable: true })
  }
  if (lower.includes('no such table') || lower.includes('no such column')) {
    return new LocalError('MIGRATION_FAILED', '数据库结构未就绪（可能迁移未执行）', { cause: err })
  }
  if (lower.includes('malformed') || lower.includes('not a database')) {
    return new LocalError('DB_OPEN_FAILED', '本地数据库文件已损坏', { cause: err })
  }
  return new LocalError(fallback, '本地数据操作失败', { cause: err })
}
