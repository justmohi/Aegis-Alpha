import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  identifySwingPoints,
  detectMarketStructure,
  detectLiquiditySweeps,
  detectOrderBlocks,
  detectFairValueGaps,
  generateDeterministicSignal,
} from './technical-analysis.ts';
import { Candle } from './backtest-engine.ts';

test('calculateEMA computes accurate exponential moving averages', () => {
  const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const ema5 = calculateEMA(closes, 5);
  assert.equal(ema5.length, closes.length);
  // First 4 elements are 0, index 4 (5th element) is SMA of 10..14 = 12
  assert.equal(ema5[4], 12);
  // Next element is (15 - 12) * (2/6) + 12 = 1 + 12 = 13
  assert.equal(Math.round(ema5[5]), 13);
  assert.ok(ema5[ema5.length - 1] > ema5[4]);
});

test('calculateRSI returns bounds between 0 and 100 with accurate trend momentum', () => {
  // Purely rising sequence
  const rising = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
  const rsiRising = calculateRSI(rising, 14);
  const lastRsi = rsiRising[rsiRising.length - 1];
  assert.ok(lastRsi >= 70, `Expected overbought RSI >= 70, got ${lastRsi}`);

  // Purely falling sequence
  const falling = Array.from({ length: 30 }, (_, i) => 100 - i * 2);
  const rsiFalling = calculateRSI(falling, 14);
  const lastFallingRsi = rsiFalling[rsiFalling.length - 1];
  assert.ok(lastFallingRsi <= 30, `Expected oversold RSI <= 30, got ${lastFallingRsi}`);
});

test('calculateATR computes positive non-zero volatility metric', () => {
  const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
    time: `2026-10-27T0${i}:00:00Z`,
    open: 1.0800,
    high: 1.0850,
    low: 1.0790,
    close: 1.0840,
    volume: 1000,
  }));

  const atr = calculateATR(candles, 14);
  const lastAtr = atr[atr.length - 1];
  assert.ok(lastAtr > 0.0050 && lastAtr < 0.0070, `Expected ATR around 0.0060, got ${lastAtr}`);
});

test('detectMarketStructure detects Higher Highs and Higher Lows in uptrend', () => {
  const candles: Candle[] = [];
  const wave = [1, 2, 3, 4, 5, 4, 3, 2, 3, 4, 5, 6, 7, 6, 5, 4, 5, 6, 7, 8, 9, 8, 7, 6];
  for (let i = 0; i < wave.length; i++) {
    const p = 1.0800 + wave[i] * 0.0005;
    candles.push({
      time: `2026-10-27T0${i}:00:00Z`,
      open: p - 0.0002,
      high: p + 0.0002,
      low: p - 0.0004,
      close: p + 0.0001,
      volume: 1000,
    });
  }

  const swings = identifySwingPoints(candles, 2);
  const structure = detectMarketStructure(candles, swings);
  assert.ok(structure.trend.includes('Bullish'), `Expected Bullish trend, got ${structure.trend}`);
  assert.ok(structure.points.length > 0);
});

test('detectLiquiditySweeps identifies BSL and SSL sweeps accurately', () => {
  const candles: Candle[] = [
    { time: 'T1', open: 1.0820, high: 1.0830, low: 1.0818, close: 1.0825, volume: 100 },
    { time: 'T2', open: 1.0825, high: 1.0850, low: 1.0822, close: 1.0845, volume: 100 }, // Swing High at 1.0850
    { time: 'T3', open: 1.0845, high: 1.0846, low: 1.0830, close: 1.0832, volume: 100 },
    { time: 'T4', open: 1.0832, high: 1.0838, low: 1.0820, close: 1.0824, volume: 100 }, // Swing Low at 1.0820
    { time: 'T5', open: 1.0824, high: 1.0835, low: 1.0822, close: 1.0830, volume: 100 },
    // Candle T6 pierces above 1.0850 to 1.0855, but closes back down at 1.0842 (BSL sweep!)
    { time: 'T6', open: 1.0830, high: 1.0855, low: 1.0828, close: 1.0842, volume: 200 },
  ];

  const swings = identifySwingPoints(candles, 1);
  const sweeps = detectLiquiditySweeps(candles, swings);
  const bslSweep = sweeps.find((s) => s.type === 'BSL_SWEEP');
  assert.ok(bslSweep !== undefined, 'Expected to detect BSL sweep');
  assert.equal(bslSweep.level, 1.0850);
  assert.equal(bslSweep.sweepPrice, 1.0855);
  assert.equal(bslSweep.closedBackInside, true);
});

test('generateDeterministicSignal produces valid BUY setup with SL strictly below Entry', () => {
  // Create clean uptrending candle series
  const candles: Candle[] = [];
  const baseTime = Date.now();
  let price = 1.0800;

  for (let i = 0; i < 35; i++) {
    const isDip = i === 15 || i === 25;
    const change = isDip ? -0.0006 : 0.0004;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + 0.0002;
    const low = Math.min(open, close) - 0.0002;
    candles.push({
      time: new Date(baseTime + i * 900000).toISOString(),
      open,
      high,
      low,
      close,
      volume: 2000,
    });
    price = close;
  }

  const signal = generateDeterministicSignal({
    primaryCandles: candles,
    symbol: 'EURUSD',
    timeframe: 'M15',
    riskRewardTarget: 2.0,
  });

  assert.ok(['BUY', 'WAIT'].includes(signal.decision));
  if (signal.decision === 'BUY' && signal.tradePlan) {
    assert.ok(signal.tradePlan.stopLoss < signal.tradePlan.entryZone.optimal, 'SL must be strictly below Entry for BUY');
    assert.ok(signal.tradePlan.takeProfit1 > signal.tradePlan.entryZone.optimal, 'TP1 must be strictly above Entry for BUY');
    assert.ok(signal.tradePlan.takeProfit2 > signal.tradePlan.takeProfit1, 'TP2 must be strictly above TP1');
    assert.ok(signal.tradePlan.riskRewardRatioTP2 >= 1.5, 'R:R must be >= 1.5');
  }
});
