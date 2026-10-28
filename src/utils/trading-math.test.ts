import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRiskReward,
  calculatePips,
  calculatePositionSize,
  aggregateConfidenceScore,
  INSTRUMENT_SPECS,
} from './trading-math.ts';
import { runStrategyBacktest, Candle } from './backtest-engine.ts';

test('calculateRiskReward validates BUY setup accurately', () => {
  const result = calculateRiskReward('BUY', 1.0850, 1.0825, 1.0900);
  assert.equal(result.valid, true);
  assert.equal(result.riskRewardRatio, 2.0);
  assert.equal(Number(result.stopDistance.toFixed(4)), 0.0025);
  assert.equal(Number(result.targetDistance.toFixed(4)), 0.0050);
});

test('calculateRiskReward rejects invalid BUY setup where SL >= Entry', () => {
  const result = calculateRiskReward('BUY', 1.0850, 1.0860, 1.0900);
  assert.equal(result.valid, false);
  assert.match(result.error || '', /Stop Loss must be strictly below Entry/);
});

test('calculateRiskReward validates SELL setup accurately', () => {
  const result = calculateRiskReward('SELL', 153.50, 154.00, 152.00);
  assert.equal(result.valid, true);
  assert.equal(result.riskRewardRatio, 3.0);
  assert.equal(Number(result.stopDistance.toFixed(2)), 0.50);
  assert.equal(Number(result.targetDistance.toFixed(2)), 1.50);
});

test('calculateRiskReward rejects invalid SELL setup where SL <= Entry', () => {
  const result = calculateRiskReward('SELL', 153.50, 153.00, 152.00);
  assert.equal(result.valid, false);
  assert.match(result.error || '', /Stop Loss must be strictly above Entry/);
});

test('calculatePips respects pip factors across Forex, JPY, and Gold', () => {
  // EURUSD 25 pips = 0.0025
  assert.equal(calculatePips('EURUSD', 0.0025), 25);
  // USDJPY 50 pips = 0.50
  assert.equal(calculatePips('USDJPY', 0.50), 50);
  // Gold $10 move = 100 pips
  assert.equal(calculatePips('XAUUSD', 10.0), 100);
});

test('calculatePositionSize accurately sizes Forex and Gold lots', () => {
  // $100,000 equity, 1% risk ($1,000), EURUSD 20 pips stop ($10/pip/lot -> 1000 / 200 = 5.0 lots)
  const eurPos = calculatePositionSize({
    accountEquity: 100000,
    riskPercentage: 1,
    symbol: 'EURUSD',
    entryPrice: 1.0850,
    stopLossPrice: 1.0830,
  });
  assert.equal(eurPos.riskAmountUSD, 1000);
  assert.equal(eurPos.stopDistancePips, 20);
  assert.equal(eurPos.lotSize, 5.0);

  // Gold position size: $50,000 equity, 2% risk ($1,000), Gold entry 2740, SL 2730 ($10 move = 100 pips, pipValue = $10/lot -> 1000 / 1000 = 1.0 lot)
  const goldPos = calculatePositionSize({
    accountEquity: 50000,
    riskPercentage: 2,
    symbol: 'XAUUSD',
    entryPrice: 2740.0,
    stopLossPrice: 2730.0,
  });
  assert.equal(goldPos.riskAmountUSD, 1000);
  assert.equal(goldPos.lotSize, 1.0);
});

test('aggregateConfidenceScore computes weighted scores and quality grades', () => {
  const highQuality = aggregateConfidenceScore({
    trendAlignment: 18,
    marketStructure: 19,
    liquidityConfirmation: 18,
    entryTrigger: 14,
    riskReward: 14,
    dataQuality: 8,
  });
  assert.equal(highQuality.totalScore, 91);
  assert.equal(highQuality.qualityGrade, 'A+');

  const weakQuality = aggregateConfidenceScore({
    trendAlignment: 8,
    marketStructure: 6,
    liquidityConfirmation: 5,
    entryTrigger: 4,
    riskReward: 6,
    dataQuality: 5,
  });
  assert.equal(weakQuality.totalScore, 34);
  assert.equal(weakQuality.qualityGrade, 'Unqualified');
});

test('runStrategyBacktest executes deterministic historical bar-by-bar simulation without lookahead', () => {
  // Create 60 trending candles
  const candles: Candle[] = [];
  const baseTime = Date.now();
  let price = 1.0800;

  for (let i = 0; i < 60; i++) {
    // Uptrend with pullback bars
    const trend = i % 5 === 0 ? -0.0008 : 0.0006;
    const open = price;
    const close = price + trend;
    const high = Math.max(open, close) + 0.0004;
    const low = Math.min(open, close) - 0.0004;
    candles.push({
      time: new Date(baseTime + i * 900000).toISOString(),
      open,
      high,
      low,
      close,
      volume: 2500,
    });
    price = close;
  }

  const result = runStrategyBacktest(candles, {
    symbol: 'EURUSD',
    strategyName: 'SMC Order Block & Breakout',
    initialBalance: 10000,
    riskPercent: 1,
    spreadPips: 0.8,
    slippagePips: 0.2,
    commissionPerLot: 7,
    minRiskReward: 1.5,
  });

  assert.equal(result.symbol, 'EURUSD');
  assert.equal(result.totalCandles, 60);
  assert.ok(typeof result.winRate === 'number');
  assert.ok(result.equityCurve.length >= 1);
  assert.ok(typeof result.profitFactor === 'number');
});
