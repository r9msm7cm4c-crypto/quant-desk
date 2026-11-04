#!/usr/bin/env python
"""生成一份离线演示数据，用于在没有数据源凭据时浏览各页面。

⚠️ 合成数据，不是真实行情，只用于验证界面与流程，不能用于任何真实研究结论。

用法（在 backend 目录下）：
    .venv/bin/python ../scripts/seed_demo_data.py
然后重算 enriched 表：
    curl -X POST http://localhost:3018/api/kline/rebuild_enriched

脚本在 data/kline_daily 已有数据时默认拒绝执行，避免覆盖真实数据；
确需重建演示数据可加 --force。
"""
from __future__ import annotations

import argparse
import math
import random
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import polars as pl  # noqa: E402

SYMBOLS = [
    ("600519.SH", "贵州茅台", "SSE", 1500.0, 0.0100, 1.05),
    ("000858.SZ", "五粮液", "SZSE", 160.0, 0.0125, 1.00),
    ("600036.SH", "招商银行", "SSE", 34.0, 0.0090, 0.85),
    ("601318.SH", "中国平安", "SSE", 46.0, 0.0105, 0.95),
    ("300750.SZ", "宁德时代", "SZSE", 210.0, 0.0165, 1.25),
    ("002594.SZ", "比亚迪", "SZSE", 240.0, 0.0150, 1.20),
    ("600276.SH", "恒瑞医药", "SSE", 46.0, 0.0140, 0.90),
    ("000333.SZ", "美的集团", "SZSE", 66.0, 0.0120, 0.95),
]
DAYS = 620


def trading_days(n: int) -> list[date]:
    out: list[date] = []
    d = date.today()
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d -= timedelta(days=1)
    return sorted(out)


def build(days: list[date]) -> tuple[pl.DataFrame, pl.DataFrame]:
    rng = random.Random(42)
    dates, rows = [], []
    mkt = [0.00016 + (rng.random() - 0.5) * 0.016 for _ in days]
    for symbol, name, exchange, start, vol, beta in SYMBOLS:
        px, score = start, (rng.random() - 0.5) * 2
        series = []
        for i, d in enumerate(days):
            score = 0.992 * score + (rng.random() - 0.5) * 0.5
            r = 0.00030 + 0.0018 * score + beta * 0.9 * mkt[i] + (rng.random() - 0.5) * 2 * vol
            px = max(2.0, px * (1 + r))
            close = round(px, 2)
            open_ = round(close * (1 + (rng.random() - 0.5) * 0.012), 2)
            high = round(max(open_, close) * (1 + rng.random() * 0.012), 2)
            low = round(min(open_, close) * (1 - rng.random() * 0.012), 2)
            volume = round((2e4 + 8e4 * rng.random()) * (1 + abs(r) * 12)) * 100
            series.append((d, open_, high, low, close, volume))
        # 末值对齐到给定价位，避免合成漂移把价格推到不真实的量级
        k = start / series[-1][4]
        for d, open_, high, low, close, volume in series:
            dates.append({
                "symbol": symbol, "date": d,
                "open": round(open_ * k, 2), "high": round(high * k, 2),
                "low": round(low * k, 2), "close": round(close * k, 2),
                "volume": float(volume), "amount": round(volume * close * k, 2),
                "quote_ts": 0,
            })
        rows.extend(dates)
        dates = []

    daily = pl.DataFrame(rows).with_columns(pl.col("date").cast(pl.Date))
    inst = pl.DataFrame([{
        "symbol": s, "name": n, "code": s.split(".")[0], "exchange": ex,
        "region": "CN", "type": "stock", "listing_date": "2010-01-04",
        "total_shares": 1.0e9, "float_shares": 8.0e8, "tick_size": 0.01,
        "limit_up": None, "limit_down": None, "as_of": date.today(),
    } for s, n, ex, *_ in SYMBOLS])
    return daily, inst


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    from app.config import settings  # noqa: E402

    data_dir = Path(args.data_dir) if args.data_dir else Path(settings.data_dir)
    daily_dir = data_dir / "kline_daily"
    if daily_dir.exists() and any(daily_dir.rglob("*.parquet")) and not args.force:
        print(f"{daily_dir} 已有行情数据，拒绝覆盖（确需重建请加 --force）")
        return 1

    days = trading_days(DAYS)
    daily, inst = build(days)

    # 上游约定按日期分区: kline_daily/date=YYYY-MM-DD/part.parquet（数据状态页据此统计）
    for (day,), frame in daily.group_by(["date"], maintain_order=True):
        out = daily_dir / f"date={day.isoformat()}" / "part.parquet"
        out.parent.mkdir(parents=True, exist_ok=True)
        frame.sort("symbol").write_parquet(out)

    (data_dir / "instruments").mkdir(parents=True, exist_ok=True)
    inst.write_parquet(data_dir / "instruments" / "instruments.parquet")

    print(f"已写入 {len(SYMBOLS)} 只标的 × {DAYS} 个交易日 → {data_dir}")
    print("下一步：curl -X POST http://localhost:3018/api/kline/rebuild_enriched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
