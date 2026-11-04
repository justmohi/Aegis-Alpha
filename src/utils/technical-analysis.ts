import { Candle } from './backtest-engine.ts';
import { INSTRUMENT_SPECS, calculatePips, calculateRiskReward } from './trading-math.ts';

export interface SwingPoint {
  index: number;
  price: number;
  time: string;
  type: 'HIGH' | 'LOW';
  swept: boolean;
}

export interface MarketStructureResult {
  trend: 'Bullish' | 'Bearish' | 'Neutral / Range' | 'Strong Bullish' | 'Strong Bearish';
  structureType: 'HH_HL' | 'LH_LL' | 'CONSOLIDATION';
  points: Array<{ type: 'HH' | 'HL' | 'LH' | 'LL'; price: number; index: number; time: string }>;
  lastBOS: { type: 'BULLISH' | 'BEARISH'; level: number; time: string } | null;
  lastCHOCH: { type: 'BULLISH' | 'BEARISH'; level: number; time: string } | null;
  summary: string;
}

export interface LiquiditySweep {
  type: 'BSL_SWEEP' | 'SSL_SWEEP';
  level: number;
  sweepPrice: number;
  sweepCandleTime: string;
  closedBackInside: boolean;
  notes: string;
}

export interface OrderBlock {
  type: 'Bullish' | 'Bearish';
  top: number;
  bottom: number;
  candleTime: string;
  mitigated: boolean;
  notes: string;
}

export interface FairValueGap {
  type: 'Bullish' | 'Bearish';
  top: number;
  bottom: number;
  status: 'Unmitigated' | 'Partially Filled' | 'Mitigated';
  notes: string;
}

export interface TechnicalIndicatorsSnapshot {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  atr14: number | null;
}

export interface DeterministicSignal {
  decision: 'BUY' | 'SELL' | 'WAIT';
  confidenceScore: number;
  confidenceBreakdown: {
    trendAlignment: number; // max 20
    marketStructure: number; // max 20
    liquidityConfirmation: number; // max 20
    entryTrigger: number; // max 15
    riskReward: number; // max 15
    dataQuality: number; // max 10
  };
  setupStatus: 'Early setup' | 'Pending confirmation' | 'Confirmed setup' | 'Invalidated setup';
  symbol: string;
  timeframe: string;
  referencePrice: number;
  referenceTime: string;
  indicators: TechnicalIndicatorsSnapshot;
  marketStructure: MarketStructureResult;
  liquiditySweeps: LiquiditySweep[];
  orderBlocks: OrderBlock[];
  fairValueGaps: FairValueGap[];
  supportResistance: Array<{ level: number; type: 'Support' | 'Resistance'; strength: 'Major' | 'Minor'; notes: string }>;
  tradePlan: {
    entryZone: { min: number; max: number; optimal: number };
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
    riskRewardRatioTP1: number;
    riskRewardRatioTP2: number;
    stopDistancePips: number;
    atrBufferPips: number;
  } | null;
  entryConfirmations: string[];
  invalidationConditions: string[];
  decisionRationale: string[];
  limitations: string[];
  multiTimeframeAlignment?: {
    h4Trend?: string;
    h1Trend?: string;
    m15Setup?: string;
    concordant: boolean;
  };
}

// -------------------------------------------------------------
// PURE MATHEMATICAL INDICATOR CALCULATIONS
// -------------------------------------------------------------

export function calculateEMA(closes: number[], period: number): number[] {
  if (closes.length === 0 || period <= 0) return [];
  const emas: number[] = new Array(closes.length).fill(0);
  if (closes.length < period) return emas;

  // First EMA value is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
  }
  emas[period - 1] = sum / period;

  const multiplier = 2 / (period + 1);
  for (let i = period; i < closes.length; i++) {
    emas[i] = (closes[i] - emas[i - 1]) * multiplier + emas[i - 1];
  }
  return emas;
}

export function calculateRSI(closes: number[], period = 14): number[] {
  if (closes.length <= period) return new Array(closes.length).fill(50);
  const rsi: number[] = new Array(closes.length).fill(50);

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = Number((100 - 100 / (1 + rs)).toFixed(2));
    }
  }

  return rsi;
}

export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macd: number[]; signal: number[]; hist: number[] } {
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);

  const macdLine: number[] = new Array(closes.length).fill(0);
  for (let i = 0; i < closes.length; i++) {
    if (i >= slowPeriod - 1) {
      macdLine[i] = fastEMA[i] - slowEMA[i];
    }
  }

  // Signal line is EMA of MACD line starting from slowPeriod
  const validMacdSlice = macdLine.slice(slowPeriod - 1);
  const signalSlice = calculateEMA(validMacdSlice, signalPeriod);

  const signalLine: number[] = new Array(closes.length).fill(0);
  const hist: number[] = new Array(closes.length).fill(0);

  for (let i = 0; i < closes.length; i++) {
    const sliceIdx = i - (slowPeriod - 1);
    if (sliceIdx >= signalPeriod - 1) {
      signalLine[i] = signalSlice[sliceIdx];
      hist[i] = macdLine[i] - signalLine[i];
    }
  }

  return { macd: macdLine, signal: signalLine, hist };
}

export function calculateATR(candles: Candle[], period = 14): number[] {
  if (candles.length < 2) return new Array(candles.length).fill(0);
  const tr: number[] = [candles[0].high - candles[0].low];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const trueRange = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    tr.push(trueRange);
  }

  const atr: number[] = new Array(candles.length).fill(0);
  if (candles.length <= period) return atr;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += tr[i];
  }
  atr[period - 1] = sum / period;

  for (let i = period; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }

  return atr;
}

// -------------------------------------------------------------
// SWING POINTS & SMART MONEY CONCEPTS (SMC) DETECTORS
// -------------------------------------------------------------

export function identifySwingPoints(candles: Candle[], lookback = 2): {
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
} {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= current.high || candles[i + j].high >= current.high) {
        isHigh = false;
      }
      if (candles[i - j].low <= current.low || candles[i + j].low <= current.low) {
        isLow = false;
      }
    }

    if (isHigh) {
      swingHighs.push({
        index: i,
        price: current.high,
        time: current.time,
        type: 'HIGH',
        swept: false,
      });
    }

    if (isLow) {
      swingLows.push({
        index: i,
        price: current.low,
        time: current.time,
        type: 'LOW',
        swept: false,
      });
    }
  }

  return { swingHighs, swingLows };
}

export function detectMarketStructure(
  candles: Candle[],
  swings: { swingHighs: SwingPoint[]; swingLows: SwingPoint[] }
): MarketStructureResult {
  const { swingHighs, swingLows } = swings;

  const points: MarketStructureResult['points'] = [];
  let lastBOS: MarketStructureResult['lastBOS'] = null;
  let lastCHOCH: MarketStructureResult['lastCHOCH'] = null;

  // Interleave all swings chronologically to correctly detect BOS and CHOCH
  const allSwings = [
    ...swingHighs.map((h) => ({ ...h, isHigh: true })),
    ...swingLows.map((l) => ({ ...l, isHigh: false })),
  ].sort((a, b) => a.index - b.index);

  let lastHigh: SwingPoint | null = null;
  let lastLow: SwingPoint | null = null;

  for (const s of allSwings) {
    if (s.isHigh) {
      if (!lastHigh) {
        points.push({ type: 'HH', price: s.price, index: s.index, time: s.time });
      } else if (s.price > lastHigh.price) {
        points.push({ type: 'HH', price: s.price, index: s.index, time: s.time });
        lastBOS = { type: 'BULLISH', level: lastHigh.price, time: s.time };
      } else {
        points.push({ type: 'LH', price: s.price, index: s.index, time: s.time });
        if (lastLow && s.price < lastLow.price) {
          lastCHOCH = { type: 'BEARISH', level: lastLow.price, time: s.time };
        }
      }
      lastHigh = s;
    } else {
      if (!lastLow) {
        points.push({ type: 'HL', price: s.price, index: s.index, time: s.time });
      } else if (s.price > lastLow.price) {
        points.push({ type: 'HL', price: s.price, index: s.index, time: s.time });
      } else {
        points.push({ type: 'LL', price: s.price, index: s.index, time: s.time });
        lastBOS = { type: 'BEARISH', level: lastLow.price, time: s.time };
        if (lastHigh && s.price > lastHigh.price) {
          lastCHOCH = { type: 'BULLISH', level: lastHigh.price, time: s.time };
        }
      }
      lastLow = s;
    }
  }

  // Count recent structural points (last 4 points)
  points.sort((a, b) => a.index - b.index);
  const recentPoints = points.slice(-4);
  const hhCount = recentPoints.filter((p) => p.type === 'HH').length;
  const hlCount = recentPoints.filter((p) => p.type === 'HL').length;
  const lhCount = recentPoints.filter((p) => p.type === 'LH').length;
  const llCount = recentPoints.filter((p) => p.type === 'LL').length;

  let trend: MarketStructureResult['trend'] = 'Neutral / Range';
  let structureType: MarketStructureResult['structureType'] = 'CONSOLIDATION';

  const totalHH = points.filter((p) => p.type === 'HH').length;
  const totalHL = points.filter((p) => p.type === 'HL').length;
  const totalLH = points.filter((p) => p.type === 'LH').length;
  const totalLL = points.filter((p) => p.type === 'LL').length;

  if (hhCount >= 1 && hlCount >= 1 && llCount === 0) {
    trend = hhCount > 1 ? 'Strong Bullish' : 'Bullish';
    structureType = 'HH_HL';
  } else if (llCount >= 1 && lhCount >= 1 && hhCount === 0) {
    trend = llCount > 1 ? 'Strong Bearish' : 'Bearish';
    structureType = 'LH_LL';
  } else if ((hhCount + hlCount) > (lhCount + llCount) || (totalHH + totalHL > totalLH + totalLL && totalHH > 0)) {
    trend = 'Bullish';
    structureType = 'HH_HL';
  } else if ((lhCount + llCount) > (hhCount + hlCount) || (totalLH + totalLL > totalHH + totalHL && totalLL > 0)) {
    trend = 'Bearish';
    structureType = 'LH_LL';
  }

  const summary =
    structureType === 'HH_HL'
      ? 'Clean bullish order flow: Higher Highs and Higher Lows respected with confirmed upside displacement.'
      : structureType === 'LH_LL'
      ? 'Clean bearish order flow: Lower Highs and Lower Lows respected with downside displacement.'
      : 'Consolidation / Mixed structure: Equal swings or conflicting highs/lows inside intermediate range.';

  return { trend, structureType, points, lastBOS, lastCHOCH, summary };
}

export function detectLiquiditySweeps(
  candles: Candle[],
  swings: { swingHighs: SwingPoint[]; swingLows: SwingPoint[] }
): LiquiditySweep[] {
  const sweeps: LiquiditySweep[] = [];
  const { swingHighs, swingLows } = swings;

  // Check if any recent candles (last 10) pierced a previous swing high but closed below it (BSL sweep)
  const recentStartIndex = Math.max(0, candles.length - 12);

  for (let i = recentStartIndex; i < candles.length; i++) {
    const c = candles[i];

    // Check BSL sweeps: Candle high > prior swing high, but candle close < prior swing high
    for (const sh of swingHighs) {
      if (sh.index < i - 1 && i - sh.index < 35) {
        if (c.high > sh.price && c.close <= sh.price) {
          sh.swept = true;
          sweeps.push({
            type: 'BSL_SWEEP',
            level: sh.price,
            sweepPrice: c.high,
            sweepCandleTime: c.time,
            closedBackInside: true,
            notes: `Buy-Side Liquidity (BSL) swept above ${sh.price.toFixed(4)} by ${((c.high - sh.price) * 10000).toFixed(1)} pips before closing inside.`,
          });
        }
      }
    }

    // Check SSL sweeps: Candle low < prior swing low, but candle close > prior swing low
    for (const sl of swingLows) {
      if (sl.index < i - 1 && i - sl.index < 35) {
        if (c.low < sl.price && c.close >= sl.price) {
          sl.swept = true;
          sweeps.push({
            type: 'SSL_SWEEP',
            level: sl.price,
            sweepPrice: c.low,
            sweepCandleTime: c.time,
            closedBackInside: true,
            notes: `Sell-Side Liquidity (SSL) swept below ${sl.price.toFixed(4)} by ${((sl.price - c.low) * 10000).toFixed(1)} pips before closing inside.`,
          });
        }
      }
    }
  }

  return sweeps;
}

export function detectOrderBlocks(candles: Candle[]): OrderBlock[] {
  const obs: OrderBlock[] = [];
  if (candles.length < 5) return obs;

  // Search backward for the last 20 candles
  for (let i = candles.length - 3; i >= Math.max(1, candles.length - 25); i--) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];

    // Bullish OB: Bearish candle followed by strong bullish displacement breaking prior high
    const isBearishCandle = curr.close < curr.open;
    const isBullishImpulse = next.close > curr.high && (next.close - next.open) > (curr.open - curr.close) * 1.5;

    if (isBearishCandle && isBullishImpulse) {
      obs.push({
        type: 'Bullish',
        top: curr.high,
        bottom: curr.low,
        candleTime: curr.time,
        mitigated: candles.slice(i + 2).some((c) => c.low <= curr.high && c.close >= curr.low),
        notes: `Bullish Order Block at ${curr.low.toFixed(4)} - ${curr.high.toFixed(4)}: Origin of strong upside displacement.`,
      });
      if (obs.length >= 2) break;
    }

    // Bearish OB: Bullish candle followed by strong bearish displacement breaking prior low
    const isBullishCandle = curr.close > curr.open;
    const isBearishImpulse = next.close < curr.low && (next.open - next.close) > (curr.close - curr.open) * 1.5;

    if (isBullishCandle && isBearishImpulse) {
      obs.push({
        type: 'Bearish',
        top: curr.high,
        bottom: curr.low,
        candleTime: curr.time,
        mitigated: candles.slice(i + 2).some((c) => c.high >= curr.low && c.close <= curr.high),
        notes: `Bearish Supply Order Block at ${curr.low.toFixed(4)} - ${curr.high.toFixed(4)}: Origin of downside distribution.`,
      });
      if (obs.length >= 2) break;
    }
  }

  return obs;
}

export function detectFairValueGaps(candles: Candle[]): FairValueGap[] {
  const fvgs: FairValueGap[] = [];
  if (candles.length < 4) return fvgs;

  // 3-candle imbalance detection across recent candles
  for (let i = candles.length - 2; i >= Math.max(2, candles.length - 20); i--) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];

    // Bullish FVG: Low of c3 > High of c1
    if (c3.low > c1.high) {
      const top = c3.low;
      const bottom = c1.high;
      const subsequentCandles = candles.slice(i + 1);
      const isMitigated = subsequentCandles.some((c) => c.low <= bottom);
      const isPartiallyFilled = subsequentCandles.some((c) => c.low < top && c.low > bottom);

      fvgs.push({
        type: 'Bullish',
        top,
        bottom,
        status: isMitigated ? 'Mitigated' : isPartiallyFilled ? 'Partially Filled' : 'Unmitigated',
        notes: `Bullish Imbalance FVG (${bottom.toFixed(4)} - ${top.toFixed(4)}): High probability re-entry zone.`,
      });
      if (fvgs.length >= 2) break;
    }

    // Bearish FVG: High of c3 < Low of c1
    if (c3.high < c1.low) {
      const top = c1.low;
      const bottom = c3.high;
      const subsequentCandles = candles.slice(i + 1);
      const isMitigated = subsequentCandles.some((c) => c.high >= top);
      const isPartiallyFilled = subsequentCandles.some((c) => c.high > bottom && c.high < top);

      fvgs.push({
        type: 'Bearish',
        top,
        bottom,
        status: isMitigated ? 'Mitigated' : isPartiallyFilled ? 'Partially Filled' : 'Unmitigated',
        notes: `Bearish Imbalance FVG (${bottom.toFixed(4)} - ${top.toFixed(4)}): High probability supply mitigation zone.`,
      });
      if (fvgs.length >= 2) break;
    }
  }

  return fvgs;
}

// -------------------------------------------------------------
// DETERMINISTIC SIGNAL ENGINE
// -------------------------------------------------------------

export function generateDeterministicSignal(params: {
  primaryCandles: Candle[];
  h1Candles?: Candle[];
  h4Candles?: Candle[];
  symbol: string;
  timeframe: string;
  riskRewardTarget?: number;
  options?: { useM5Refinement?: boolean };
}): DeterministicSignal {
  const { primaryCandles, h1Candles, h4Candles, symbol, timeframe, riskRewardTarget = 2.0 } = params;

  const spec = INSTRUMENT_SPECS[symbol] || {
    symbol,
    precision: symbol.includes('JPY') ? 3 : symbol.includes('USD') && !['BTCUSD', 'ETHUSD', 'XAUUSD', 'XAGUSD', 'US30'].includes(symbol) ? 5 : 2,
    pipSize: symbol.includes('JPY') ? 0.01 : 0.0001,
    contractSize: 100000,
    pipFactor: 10000,
  };

  if (!primaryCandles || primaryCandles.length < 20) {
    return createInsufficientDataSignal(symbol, timeframe, 'Insufficient candle series (minimum 20 closed candles required).');
  }

  const closes = primaryCandles.map((c) => c.close);
  const lastCandle = primaryCandles[primaryCandles.length - 1];
  const currentPrice = lastCandle.close;

  // 1. Indicators
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const rsi = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);
  const atr = calculateATR(primaryCandles, 14);

  const curEMA20 = ema20[ema20.length - 1] || null;
  const curEMA50 = ema50.length >= 50 ? ema50[ema50.length - 1] : null;
  const curEMA200 = ema200.length >= 200 ? ema200[ema200.length - 1] : null;
  const curRSI = rsi[rsi.length - 1] || 50;
  const curMACD = macd.hist[macd.hist.length - 1] !== undefined ? {
    macd: Number(macd.macd[macd.macd.length - 1].toFixed(5)),
    signal: Number(macd.signal[macd.signal.length - 1].toFixed(5)),
    histogram: Number(macd.hist[macd.hist.length - 1].toFixed(5)),
  } : null;
  const curATR = atr[atr.length - 1] || (lastCandle.high - lastCandle.low);

  const indicatorsSnapshot: TechnicalIndicatorsSnapshot = {
    ema20: curEMA20 ? Number(curEMA20.toFixed(spec.precision)) : null,
    ema50: curEMA50 ? Number(curEMA50.toFixed(spec.precision)) : null,
    ema200: curEMA200 ? Number(curEMA200.toFixed(spec.precision)) : null,
    rsi14: curRSI,
    macd: curMACD,
    atr14: Number(curATR.toFixed(spec.precision)),
  };

  // 2. Swings & Market Structure
  const swings = identifySwingPoints(primaryCandles, 2);
  const structure = detectMarketStructure(primaryCandles, swings);
  const liquiditySweeps = detectLiquiditySweeps(primaryCandles, swings);
  const orderBlocks = detectOrderBlocks(primaryCandles);
  const fvgs = detectFairValueGaps(primaryCandles);

  // 3. Multi-timeframe trend context if available
  let h1Trend: string | undefined;
  let h4Trend: string | undefined;
  let isHTFBullish = true;
  let isHTFBearish = true;

  if (h1Candles && h1Candles.length >= 20) {
    const h1Closes = h1Candles.map((c) => c.close);
    const h1EMA20 = calculateEMA(h1Closes, 20);
    const h1Last = h1Candles[h1Candles.length - 1].close;
    const h1EMA = h1EMA20[h1EMA20.length - 1];
    h1Trend = h1Last > h1EMA ? 'Bullish' : 'Bearish';
    if (h1Trend === 'Bearish') isHTFBullish = false;
    if (h1Trend === 'Bullish') isHTFBearish = false;
  }

  if (h4Candles && h4Candles.length >= 20) {
    const h4Closes = h4Candles.map((c) => c.close);
    const h4EMA20 = calculateEMA(h4Closes, 20);
    const h4Last = h4Candles[h4Candles.length - 1].close;
    const h4EMA = h4EMA20[h4EMA20.length - 1];
    h4Trend = h4Last > h4EMA ? 'Bullish' : 'Bearish';
    if (h4Trend === 'Bearish') isHTFBullish = false;
    if (h4Trend === 'Bullish') isHTFBearish = false;
  }

  // 4. Confluence Scoring & Decision Logic
  let trendScore = 10;
  let structScore = 10;
  let liqScore = 8;
  let triggerScore = 8;
  let rrScore = 10;
  let dataScore = 10;

  const hasRecentSSLSweep = liquiditySweeps.some((s) => s.type === 'SSL_SWEEP');
  const hasRecentBSLSweep = liquiditySweeps.some((s) => s.type === 'BSL_SWEEP');
  const hasBullishOB = orderBlocks.some((ob) => ob.type === 'Bullish' && !ob.mitigated);
  const hasBearishOB = orderBlocks.some((ob) => ob.type === 'Bearish' && !ob.mitigated);
  const isAboveEMA = curEMA20 ? currentPrice > curEMA20 : true;
  const isBelowEMA = curEMA20 ? currentPrice < curEMA20 : true;

  // Evaluate BUY confluence
  const isBullishStructure = structure.trend.includes('Bullish');
  const isBearishStructure = structure.trend.includes('Bearish');

  let decision: 'BUY' | 'SELL' | 'WAIT' = 'WAIT';
  let setupStatus: DeterministicSignal['setupStatus'] = 'Pending confirmation';

  const entryConfirmations: string[] = [];
  const invalidationConditions: string[] = [];
  const decisionRationale: string[] = [];
  const limitations: string[] = [];

  // ATR Buffer: 1.2x ATR for realistic volatility breathing room
  const atrBuffer = curATR * 1.2;
  const atrBufferPips = calculatePips(symbol, atrBuffer);

  // BUY CONDITIONS:
  // 1. Structure is Bullish OR (Bearish structure with confirmed SSL sweep + Bullish CHOCH)
  // 2. Price is supported by EMA20 or Bullish OB
  // 3. RSI not severely overbought (< 75)
  // 4. HTF alignment if available
  const canBuy =
    (isBullishStructure || (hasRecentSSLSweep && structure.lastCHOCH?.type === 'BULLISH')) &&
    isHTFBullish &&
    curRSI < 75 &&
    (isAboveEMA || hasBullishOB || hasRecentSSLSweep);

  // SELL CONDITIONS:
  // 1. Structure is Bearish OR (Bullish structure with confirmed BSL sweep + Bearish CHOCH)
  // 2. Price rejected by EMA20 or Bearish OB
  // 3. RSI not severely oversold (> 25)
  // 4. HTF alignment if available
  const canSell =
    (isBearishStructure || (hasRecentBSLSweep && structure.lastCHOCH?.type === 'BEARISH')) &&
    isHTFBearish &&
    curRSI > 25 &&
    (isBelowEMA || hasBearishOB || hasRecentBSLSweep);

  let tradePlan: DeterministicSignal['tradePlan'] = null;

  if (canBuy && !canSell) {
    decision = 'BUY';
    setupStatus = hasRecentSSLSweep ? 'Confirmed setup' : 'Early setup';

    // Find structural invalidation (recent swing low or OB bottom)
    const recentLows = swings.swingLows.filter((l) => l.price < currentPrice);
    const structuralLow = recentLows.length > 0 ? recentLows[recentLows.length - 1].price : currentPrice - atrBuffer;
    const stopLoss = Number((structuralLow - atrBuffer * 0.3).toFixed(spec.precision));

    const riskDistance = currentPrice - stopLoss;
    if (riskDistance > spec.pipSize * 2) {
      const tp1 = Number((currentPrice + riskDistance * 1.5).toFixed(spec.precision));
      const tp2 = Number((currentPrice + riskDistance * riskRewardTarget).toFixed(spec.precision));
      const stopPips = calculatePips(symbol, riskDistance);

      tradePlan = {
        entryZone: {
          min: Number((currentPrice - atrBuffer * 0.2).toFixed(spec.precision)),
          max: Number((currentPrice + atrBuffer * 0.1).toFixed(spec.precision)),
          optimal: Number(currentPrice.toFixed(spec.precision)),
        },
        stopLoss,
        takeProfit1: tp1,
        takeProfit2: tp2,
        riskRewardRatioTP1: 1.5,
        riskRewardRatioTP2: Number(riskRewardTarget.toFixed(1)),
        stopDistancePips: stopPips,
        atrBufferPips,
      };

      trendScore = isHTFBullish && isBullishStructure ? 18 : 14;
      structScore = structure.structureType === 'HH_HL' ? 19 : 14;
      liqScore = hasRecentSSLSweep ? 19 : 12;
      triggerScore = 13;
      rrScore = 14;

      decisionRationale.push('Bullish market structure confirmed with Higher Highs and protected Higher Lows.');
      if (hasRecentSSLSweep) decisionRationale.push('Sell-Side Liquidity (SSL) swept below swing lows with rapid bullish absorption.');
      if (curEMA20) decisionRationale.push(`Price holding above dynamic 20-period EMA (${curEMA20.toFixed(spec.precision)}).`);
      decisionRationale.push(`Calculated 1:${riskRewardTarget} R:R with structural Stop Loss set below swing invalidation.`);

      entryConfirmations.push(`Confirmation candle close holding above ${tradePlan.entryZone.min}`);
      entryConfirmations.push('Bullish momentum sustained without immediate high-volume rejection');
      invalidationConditions.push(`Candle close below structural stop loss at ${stopLoss}`);
      invalidationConditions.push('Shift to lower-timeframe bearish CHOCH prior to entry trigger');
    } else {
      decision = 'WAIT';
    }
  } else if (canSell && !canBuy) {
    decision = 'SELL';
    setupStatus = hasRecentBSLSweep ? 'Confirmed setup' : 'Early setup';

    // Find structural invalidation (recent swing high or OB top)
    const recentHighs = swings.swingHighs.filter((h) => h.price > currentPrice);
    const structuralHigh = recentHighs.length > 0 ? recentHighs[recentHighs.length - 1].price : currentPrice + atrBuffer;
    const stopLoss = Number((structuralHigh + atrBuffer * 0.3).toFixed(spec.precision));

    const riskDistance = stopLoss - currentPrice;
    if (riskDistance > spec.pipSize * 2) {
      const tp1 = Number((currentPrice - riskDistance * 1.5).toFixed(spec.precision));
      const tp2 = Number((currentPrice - riskDistance * riskRewardTarget).toFixed(spec.precision));
      const stopPips = calculatePips(symbol, riskDistance);

      tradePlan = {
        entryZone: {
          min: Number((currentPrice - atrBuffer * 0.1).toFixed(spec.precision)),
          max: Number((currentPrice + atrBuffer * 0.2).toFixed(spec.precision)),
          optimal: Number(currentPrice.toFixed(spec.precision)),
        },
        stopLoss,
        takeProfit1: tp1,
        takeProfit2: tp2,
        riskRewardRatioTP1: 1.5,
        riskRewardRatioTP2: Number(riskRewardTarget.toFixed(1)),
        stopDistancePips: stopPips,
        atrBufferPips,
      };

      trendScore = isHTFBearish && isBearishStructure ? 18 : 14;
      structScore = structure.structureType === 'LH_LL' ? 19 : 14;
      liqScore = hasRecentBSLSweep ? 19 : 12;
      triggerScore = 13;
      rrScore = 14;

      decisionRationale.push('Bearish market structure confirmed with Lower Highs and Lower Lows expansion.');
      if (hasRecentBSLSweep) decisionRationale.push('Buy-Side Liquidity (BSL) swept above swing highs with rapid bearish displacement.');
      if (curEMA20) decisionRationale.push(`Price capped below dynamic 20-period EMA (${curEMA20.toFixed(spec.precision)}).`);
      decisionRationale.push(`Calculated 1:${riskRewardTarget} R:R with structural Stop Loss set above swing invalidation.`);

      entryConfirmations.push(`Confirmation candle close holding below ${tradePlan.entryZone.max}`);
      entryConfirmations.push('Bearish momentum sustained without immediate high-volume absorption');
      invalidationConditions.push(`Candle close above structural stop loss at ${stopLoss}`);
      invalidationConditions.push('Shift to lower-timeframe bullish CHOCH prior to entry trigger');
    } else {
      decision = 'WAIT';
    }
  } else {
    // WAIT: Evidence conflicting or choppy range
    decision = 'WAIT';
    setupStatus = 'Pending confirmation';
    trendScore = 8;
    structScore = 9;
    liqScore = 7;
    triggerScore = 5;
    rrScore = 8;

    decisionRationale.push('Market structure is currently consolidating or displaying conflicting momentum signals.');
    if (!isHTFBullish && !isHTFBearish) {
      decisionRationale.push('Higher-timeframe (H1/H4) trend does not align with lower-timeframe price action.');
    }
    decisionRationale.push('No high-probability institutional liquidity sweep or clean order block mitigation detected.');
    invalidationConditions.push('Capital preservation policy: Avoid taking market exposure during structural indecision.');
  }

  limitations.push('Deterministic technical analysis based on closed OHLC candle geometry and verified price points.');
  limitations.push('High-impact central bank announcements and breaking news may cause unexpected spread widening.');

  const confidenceScore = Math.min(100, Math.round(trendScore + structScore + liqScore + triggerScore + rrScore + dataScore));

  // Build Support/Resistance array
  const supportResistance: Array<{ level: number; type: 'Support' | 'Resistance'; strength: 'Major' | 'Minor'; notes: string }> = [
    ...swings.swingLows.slice(-3).map((l) => ({
      level: Number(l.price.toFixed(spec.precision)),
      type: 'Support' as const,
      strength: l.swept ? ('Minor' as const) : ('Major' as const),
      notes: `Structural swing low hold at ${l.price.toFixed(spec.precision)}`,
    })),
    ...swings.swingHighs.slice(-3).map((h) => ({
      level: Number(h.price.toFixed(spec.precision)),
      type: 'Resistance' as const,
      strength: h.swept ? ('Minor' as const) : ('Major' as const),
      notes: `Structural swing high ceiling at ${h.price.toFixed(spec.precision)}`,
    })),
  ].sort((a, b) => b.level - a.level);

  return {
    decision,
    confidenceScore,
    confidenceBreakdown: {
      trendAlignment: trendScore,
      marketStructure: structScore,
      liquidityConfirmation: liqScore,
      entryTrigger: triggerScore,
      riskReward: rrScore,
      dataQuality: dataScore,
    },
    setupStatus,
    symbol,
    timeframe,
    referencePrice: currentPrice,
    referenceTime: lastCandle.time,
    indicators: indicatorsSnapshot,
    marketStructure: structure,
    liquiditySweeps,
    orderBlocks,
    fairValueGaps: fvgs,
    supportResistance,
    tradePlan,
    entryConfirmations,
    invalidationConditions,
    decisionRationale,
    limitations,
    multiTimeframeAlignment: {
      h4Trend,
      h1Trend,
      m15Setup: structure.trend,
      concordant: (decision === 'BUY' && isHTFBullish) || (decision === 'SELL' && isHTFBearish),
    },
  };
}

function createInsufficientDataSignal(symbol: string, timeframe: string, reason: string): DeterministicSignal {
  return {
    decision: 'WAIT',
    confidenceScore: 20,
    confidenceBreakdown: {
      trendAlignment: 5,
      marketStructure: 5,
      liquidityConfirmation: 0,
      entryTrigger: 0,
      riskReward: 0,
      dataQuality: 10,
    },
    setupStatus: 'Pending confirmation',
    symbol,
    timeframe,
    referencePrice: 0,
    referenceTime: new Date().toISOString(),
    indicators: {
      ema20: null,
      ema50: null,
      ema200: null,
      rsi14: null,
      macd: null,
      atr14: null,
    },
    marketStructure: {
      trend: 'Neutral / Range',
      structureType: 'CONSOLIDATION',
      points: [],
      lastBOS: null,
      lastCHOCH: null,
      summary: reason,
    },
    liquiditySweeps: [],
    orderBlocks: [],
    fairValueGaps: [],
    supportResistance: [],
    tradePlan: null,
    entryConfirmations: [],
    invalidationConditions: [reason],
    decisionRationale: [reason],
    limitations: ['Insufficient data returned by market data provider.'],
  };
}
