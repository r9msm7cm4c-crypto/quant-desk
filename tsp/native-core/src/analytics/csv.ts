import type { OHLCVBar } from '../types.ts';

function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      fields.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  if (quoted) throw new SyntaxError('CSV contains an unclosed quoted field');
  fields.push(value.trim());
  return fields;
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_\-()（）]/g, '');
}

function parseNumber(value: string, row: number, field: string): number {
  const normalized = value.replace(/,/g, '').replace(/\s/g, '');
  const parsed = Number(normalized);
  if (!normalized || !Number.isFinite(parsed)) {
    throw new TypeError(`CSV row ${row}: ${field} must be a finite number`);
  }
  return parsed;
}

/** Parse common Chinese/English OHLCV CSV exports without relying on browser APIs. */
export function parseOHLCVCsv(input: string): OHLCVBar[] {
  const lines = input.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) throw new RangeError('CSV must contain a header and at least one data row');
  const headerLine = lines[0]!;
  const candidates = [',', '\t', ';'];
  const delimiter = candidates
    .map(char => ({ char, count: splitCsvLine(headerLine, char).length }))
    .sort((a, b) => b.count - a.count)[0]!.char;
  const headers = splitCsvLine(headerLine, delimiter).map(normalizeHeader);
  const aliases: Record<string, string[]> = {
    date: ['date', '日期', '交易日期', 'tradedate', 'datetime', '时间'],
    open: ['open', '开盘', '开盘价'],
    high: ['high', '最高', '最高价'],
    low: ['low', '最低', '最低价'],
    close: ['close', '收盘', '收盘价', '最新价'],
    volume: ['volume', 'vol', '成交量', '交易量'],
    amount: ['amount', '成交额', '交易额'],
  };
  const index: Record<string, number> = {};
  for (const [field, names] of Object.entries(aliases)) {
    const found = headers.findIndex(header => names.includes(header));
    if (found >= 0) index[field] = found;
  }
  for (const required of ['date', 'open', 'high', 'low', 'close', 'volume']) {
    if (index[required] === undefined) throw new Error(`CSV missing required column: ${required}`);
  }

  const bars: OHLCVBar[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = splitCsvLine(lines[lineIndex]!, delimiter);
    const rowNo = lineIndex + 1;
    if (cells.length !== headers.length) {
      throw new RangeError(`CSV row ${rowNo}: expected ${headers.length} columns, received ${cells.length}`);
    }
    const date = cells[index.date!] ?? '';
    if (!date) throw new TypeError(`CSV row ${rowNo}: date is empty`);
    const bar: OHLCVBar = {
      date,
      open: parseNumber(cells[index.open!] ?? '', rowNo, 'open'),
      high: parseNumber(cells[index.high!] ?? '', rowNo, 'high'),
      low: parseNumber(cells[index.low!] ?? '', rowNo, 'low'),
      close: parseNumber(cells[index.close!] ?? '', rowNo, 'close'),
      volume: parseNumber(cells[index.volume!] ?? '', rowNo, 'volume'),
      ...(index.amount === undefined ? {} : { amount: parseNumber(cells[index.amount] ?? '', rowNo, 'amount') }),
    };
    if (bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0) {
      throw new RangeError(`CSV row ${rowNo}: OHLC prices must be > 0`);
    }
    if (bar.high < bar.low || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) {
      throw new RangeError(`CSV row ${rowNo}: inconsistent OHLC values`);
    }
    if (bar.volume < 0) throw new RangeError(`CSV row ${rowNo}: volume must be >= 0`);
    if (bars.length > 0 && date <= bars[bars.length - 1]!.date) {
      throw new RangeError(`CSV row ${rowNo}: dates must be strictly ascending with no duplicates`);
    }
    bars.push(bar);
  }
  if (bars.length === 0) throw new RangeError('CSV contains no data rows');
  return bars;
}
