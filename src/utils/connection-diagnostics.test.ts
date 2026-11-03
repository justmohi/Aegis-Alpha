import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  mapIntervalToTwelveData,
  normalizeToTwelveDataSymbol,
  normalizeFromTwelveDataSymbol,
  isTwelveDataConfigured,
  getConnectionDiagnostics,
  probeTwelveDataConnection,
} from '../../server/twelve-data.ts';
import { generateDeterministicSignal } from './technical-analysis.ts';
import { Candle } from './backtest-engine.ts';

describe('Twelve Data Integration & Connection Diagnostics', () => {
  test('Symbol normalization formats Forex and Precious Metals accurately', () => {
    assert.strictEqual(normalizeToTwelveDataSymbol('XAUUSD'), 'XAU/USD');
    assert.strictEqual(normalizeToTwelveDataSymbol('xauusd'), 'XAU/USD');
    assert.strictEqual(normalizeToTwelveDataSymbol('XAU/USD'), 'XAU/USD');
    assert.strictEqual(normalizeToTwelveDataSymbol('XAGUSD'), 'XAG/USD');
    assert.strictEqual(normalizeToTwelveDataSymbol('EURUSD'), 'EUR/USD');
    assert.strictEqual(normalizeToTwelveDataSymbol('GBPUSD'), 'GBP/USD');
    assert.strictEqual(normalizeToTwelveDataSymbol('USDJPY'), 'USD/JPY');
    assert.strictEqual(normalizeToTwelveDataSymbol('BTCUSD'), 'BTC/USD');

    assert.strictEqual(normalizeFromTwelveDataSymbol('XAU/USD'), 'XAUUSD');
    assert.strictEqual(normalizeFromTwelveDataSymbol('EUR/USD'), 'EURUSD');
  });

  test('Interval mapping converts standard timeframe codes to Twelve Data interval format', () => {
    assert.strictEqual(mapIntervalToTwelveData('M1'), '1min');
    assert.strictEqual(mapIntervalToTwelveData('1m'), '1min');
    assert.strictEqual(mapIntervalToTwelveData('M5'), '5min');
    assert.strictEqual(mapIntervalToTwelveData('M15'), '15min');
    assert.strictEqual(mapIntervalToTwelveData('M30'), '30min');
    assert.strictEqual(mapIntervalToTwelveData('H1'), '1h');
    assert.strictEqual(mapIntervalToTwelveData('H4'), '4h');
    assert.strictEqual(mapIntervalToTwelveData('D1'), '1day');
  });

  test('Safe diagnostics panel structure: never leaks secret key and returns valid telemetry fields', () => {
    const diag = getConnectionDiagnostics();
    assert.strictEqual(diag.backendReachable, true);
    assert.strictEqual(typeof diag.apiKeyConfigured, 'boolean');
    assert.strictEqual(typeof diag.providerRequestStatus, 'string');
    assert.strictEqual(typeof diag.symbolRequested, 'string');
    assert.strictEqual(typeof diag.intervalRequested, 'string');
    assert.strictEqual(typeof diag.candleCount, 'number');
    assert.strictEqual(typeof diag.providerErrorCategory, 'string');

    // Crucial security invariant: No secret key property exists on diagnostic object
    assert.strictEqual((diag as any).apiKey, undefined);
    assert.strictEqual((diag as any).key, undefined);
    assert.strictEqual((diag as any).secret, undefined);
  });

  test('Probe connection returns MISSING_API_KEY when no key is configured in test runner', async () => {
    const originalKey = process.env.TWELVE_DATA_API_KEY;
    delete process.env.TWELVE_DATA_API_KEY;

    try {
      const diag = await probeTwelveDataConnection({ symbol: 'XAU/USD', interval: '15min' });
      assert.strictEqual(diag.backendReachable, true);
      assert.strictEqual(diag.apiKeyConfigured, false);
      assert.strictEqual(diag.providerErrorCategory, 'MISSING_API_KEY');
      assert.strictEqual(diag.symbolRequested, 'XAU/USD');
      assert.strictEqual(diag.intervalRequested, '15min');
      assert.strictEqual(diag.candleCount, 0);
    } finally {
      if (originalKey) {
        process.env.TWELVE_DATA_API_KEY = originalKey;
      }
    }
  });

  test('Multi-timeframe confirmation is unverified when HTF candle history is absent', () => {
    const basePrice = 2735.0;
    const now = Date.now();
    const candles: Candle[] = [];
    for (let i = 29; i >= 0; i--) {
      const t = new Date(now - i * 15 * 60 * 1000).toISOString();
      const p = basePrice + i * 0.2;
      candles.push({
        time: t,
        open: p,
        high: p + 0.5,
        low: p - 0.4,
        close: p + 0.1,
        volume: 1500,
      });
    }

    const signal = generateDeterministicSignal({
      primaryCandles: candles,
      h1Candles: undefined,
      h4Candles: undefined,
      symbol: 'XAU/USD',
      timeframe: 'M15',
    });

    assert.ok(signal);
    assert.strictEqual(typeof signal.confidenceScore, 'number');
    assert.strictEqual(typeof signal.confidenceBreakdown.trendAlignment, 'number');
    assert.strictEqual(typeof signal.confidenceBreakdown.dataQuality, 'number');
  });
});
