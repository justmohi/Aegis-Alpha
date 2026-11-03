import test from 'node:test';
import assert from 'node:assert/strict';
import { assessHistoricalCandleFreshness, runFreeHistoricalAnalysis } from './free-analysis.ts';
import { Candle } from './backtest-engine.ts';

function candlesFrom(nowMs: number, ageMinutes: number): Candle[] {
  return Array.from({ length: 40 }, (_, i) => {
    const close = 3900 + i * 0.7 + Math.sin(i) * 0.4;
    return {
      time: new Date(nowMs - ageMinutes * 60_000 - (39 - i) * 15 * 60_000).toISOString(),
      open: close - 0.2,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 100 + i,
    };
  });
}

test('fresh historical candles pass the M15 freshness gate', () => {
  const now = Date.now();
  const result = assessHistoricalCandleFreshness(candlesFrom(now, 5), 'M15', now);
  assert.equal(result.verified, true);
  assert.equal(result.stale, false);
});

test('stale historical candles are marked stale', () => {
  const now = Date.now();
  const result = assessHistoricalCandleFreshness(candlesFrom(now, 45), 'M15', now);
  assert.equal(result.verified, true);
  assert.equal(result.stale, true);
});

test('duplicate or unordered candle timestamps fail freshness verification', () => {
  const now = Date.now();
  const data = candlesFrom(now, 5);
  data[10].time = data[9].time;
  const result = assessHistoricalCandleFreshness(data, 'M15', now);
  assert.equal(result.verified, false);
  assert.equal(result.stale, true);
});

test('stale historical analysis always returns WAIT with no trade plan', () => {
  const now = Date.now();
  const result = runFreeHistoricalAnalysis({
    candles: candlesFrom(now, 60),
    symbol: 'XAUUSD',
    timeframe: 'M15',
    nowMs: now,
  });
  assert.equal(result.signal.decision, 'WAIT');
  assert.equal(result.signal.tradePlan, null);
  assert.equal(result.executionEligible, false);
});
