import { Candle } from './backtest-engine.ts';
import { generateDeterministicSignal, DeterministicSignal } from './technical-analysis.ts';

const TIMEFRAME_MINUTES: Record<string, number> = {
  M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440,
};

export interface FreeAnalysisFreshness {
  verified: boolean;
  stale: boolean;
  ageMinutes: number | null;
  maxAgeMinutes: number;
  latestCandleTime: string | null;
  reason: string | null;
}

export interface FreeAnalysisResult {
  mode: 'FREE_HISTORICAL';
  provider: 'User Supplied Historical OHLCV';
  signal: DeterministicSignal;
  freshness: FreeAnalysisFreshness;
  executionEligible: false;
}

export function assessHistoricalCandleFreshness(
  candles: Candle[],
  timeframe: string,
  nowMs = Date.now(),
): FreeAnalysisFreshness {
  const interval = TIMEFRAME_MINUTES[timeframe.toUpperCase()];
  const maxAgeMinutes = interval ? interval * 2 + 2 : 0;
  if (!interval) return { verified: false, stale: true, ageMinutes: null, maxAgeMinutes: 0, latestCandleTime: null, reason: 'Unsupported timeframe; freshness cannot be verified.' };
  if (!Array.isArray(candles) || candles.length < 20) {
    return { verified: false, stale: true, ageMinutes: null, maxAgeMinutes, latestCandleTime: null, reason: 'At least 20 candles are required.' };
  }

  let previous = Number.NEGATIVE_INFINITY;
  for (const candle of candles) {
    const timestamp = new Date(candle.time).getTime();
    const values = [candle.open, candle.high, candle.low, candle.close, candle.volume];
    if (!Number.isFinite(timestamp) || timestamp > nowMs + 5 * 60_000) {
      return { verified: false, stale: true, ageMinutes: null, maxAgeMinutes, latestCandleTime: candle.time || null, reason: 'A candle timestamp is invalid or unexpectedly in the future.' };
    }
    if (timestamp <= previous) {
      return { verified: false, stale: true, ageMinutes: null, maxAgeMinutes, latestCandleTime: candle.time, reason: 'Candles must be strictly ordered from oldest to newest with no duplicate timestamps.' };
    }
    if (!values.every(Number.isFinite) || values.slice(0, 4).some((v) => v <= 0) || candle.volume < 0 ||
        candle.high < Math.max(candle.open, candle.close, candle.low) ||
        candle.low > Math.min(candle.open, candle.close)) {
      return { verified: false, stale: true, ageMinutes: null, maxAgeMinutes, latestCandleTime: candle.time, reason: 'Candle contains invalid OHLCV values.' };
    }
    previous = timestamp;
  }

  const latestCandleTime = candles[candles.length - 1].time;
  const ageMinutes = Math.max(0, (nowMs - previous) / 60_000);
  const stale = ageMinutes > maxAgeMinutes;
  return {
    verified: true,
    stale,
    ageMinutes: Number(ageMinutes.toFixed(1)),
    maxAgeMinutes,
    latestCandleTime,
    reason: stale ? `Latest candle is ${Math.round(ageMinutes)} minutes old; maximum allowed age for ${timeframe.toUpperCase()} is ${maxAgeMinutes} minutes.` : null,
  };
}

/** Calculates from user-provided candles only. Stale candles may inform indicators, never an actionable signal. */
export function runFreeHistoricalAnalysis(params: {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  riskRewardTarget?: number;
  nowMs?: number;
}): FreeAnalysisResult {
  const freshness = assessHistoricalCandleFreshness(params.candles, params.timeframe, params.nowMs);
  const signal = generateDeterministicSignal({
    primaryCandles: params.candles,
    symbol: params.symbol,
    timeframe: params.timeframe,
    riskRewardTarget: params.riskRewardTarget ?? 2,
  });

  if (!freshness.verified || freshness.stale) {
    signal.decision = 'WAIT';
    signal.tradePlan = null;
    signal.confidenceScore = Math.min(signal.confidenceScore, 44);
    signal.confidenceBreakdown.dataQuality = 0;
    signal.decisionRationale = [
      'Historical indicators and market structure are informational only.',
      freshness.reason || 'Data freshness could not be verified.',
      ...signal.decisionRationale,
    ];
    signal.limitations = [...signal.limitations, 'This historical-data analysis is not execution eligible. Freshness verification failed or data is stale.'];
  } else {
    signal.limitations = [...signal.limitations, 'Free historical analysis uses user-supplied candles; it is not a broker quote or a guarantee of real-time execution conditions.'];
  }

  return {
    mode: 'FREE_HISTORICAL',
    provider: 'User Supplied Historical OHLCV',
    signal,
    freshness,
    executionEligible: false,
  };
}
