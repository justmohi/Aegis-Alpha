export interface InstrumentSpec {
  symbol: string;
  name: string;
  assetClass: 'Forex' | 'Metals' | 'Crypto' | 'Indices';
  pipFactor: number; // multiplier to convert price difference to pips
  pipSize: number; // value of 1 pip in price (e.g. 0.0001 for EURUSD, 0.01 for USDJPY, 0.1 for Gold)
  contractSize: number; // standard lot contract size (e.g. 100,000 for Forex, 100 for Gold, 1 for Crypto)
  precision: number;
  typicalSpreadPips: number;
}

export const INSTRUMENT_SPECS: Record<string, InstrumentSpec> = {
  EURUSD: {
    symbol: 'EURUSD',
    name: 'Euro / US Dollar',
    assetClass: 'Forex',
    pipFactor: 10000,
    pipSize: 0.0001,
    contractSize: 100000,
    precision: 5,
    typicalSpreadPips: 0.8,
  },
  GBPUSD: {
    symbol: 'GBPUSD',
    name: 'British Pound / US Dollar',
    assetClass: 'Forex',
    pipFactor: 10000,
    pipSize: 0.0001,
    contractSize: 100000,
    precision: 5,
    typicalSpreadPips: 1.1,
  },
  USDJPY: {
    symbol: 'USDJPY',
    name: 'US Dollar / Japanese Yen',
    assetClass: 'Forex',
    pipFactor: 100,
    pipSize: 0.01,
    contractSize: 100000,
    precision: 3,
    typicalSpreadPips: 1.0,
  },
  AUDUSD: {
    symbol: 'AUDUSD',
    name: 'Australian Dollar / US Dollar',
    assetClass: 'Forex',
    pipFactor: 10000,
    pipSize: 0.0001,
    contractSize: 100000,
    precision: 5,
    typicalSpreadPips: 1.2,
  },
  USDCAD: {
    symbol: 'USDCAD',
    name: 'US Dollar / Canadian Dollar',
    assetClass: 'Forex',
    pipFactor: 10000,
    pipSize: 0.0001,
    contractSize: 100000,
    precision: 5,
    typicalSpreadPips: 1.3,
  },
  USDCHF: {
    symbol: 'USDCHF',
    name: 'US Dollar / Swiss Franc',
    assetClass: 'Forex',
    pipFactor: 10000,
    pipSize: 0.0001,
    contractSize: 100000,
    precision: 5,
    typicalSpreadPips: 1.4,
  },
  XAUUSD: {
    symbol: 'XAUUSD',
    name: 'Gold / US Dollar',
    assetClass: 'Metals',
    pipFactor: 10, // 0.10 move = 1 pip
    pipSize: 0.1,
    contractSize: 100, // 100 troy oz per lot
    precision: 2,
    typicalSpreadPips: 2.0,
  },
  XAGUSD: {
    symbol: 'XAGUSD',
    name: 'Silver / US Dollar',
    assetClass: 'Metals',
    pipFactor: 100,
    pipSize: 0.01,
    contractSize: 5000, // 5,000 troy oz per lot
    precision: 2,
    typicalSpreadPips: 3.5,
  },
  BTCUSD: {
    symbol: 'BTCUSD',
    name: 'Bitcoin / US Dollar',
    assetClass: 'Crypto',
    pipFactor: 1, // $1 move = 1 point
    pipSize: 1.0,
    contractSize: 1, // 1 BTC
    precision: 2,
    typicalSpreadPips: 15.0,
  },
  ETHUSD: {
    symbol: 'ETHUSD',
    name: 'Ethereum / US Dollar',
    assetClass: 'Crypto',
    pipFactor: 1,
    pipSize: 1.0,
    contractSize: 1, // 1 ETH
    precision: 2,
    typicalSpreadPips: 1.5,
  },
  SOLUSD: {
    symbol: 'SOLUSD',
    name: 'Solana / US Dollar',
    assetClass: 'Crypto',
    pipFactor: 10,
    pipSize: 0.1,
    contractSize: 1,
    precision: 2,
    typicalSpreadPips: 0.4,
  },
  US30: {
    symbol: 'US30',
    name: 'Dow Jones Industrial Average',
    assetClass: 'Indices',
    pipFactor: 1,
    pipSize: 1.0,
    contractSize: 1,
    precision: 1,
    typicalSpreadPips: 2.5,
  },
  NAS100: {
    symbol: 'NAS100',
    name: 'Nasdaq 100',
    assetClass: 'Indices',
    pipFactor: 1,
    pipSize: 1.0,
    contractSize: 1,
    precision: 1,
    typicalSpreadPips: 1.8,
  },
  SPX500: {
    symbol: 'SPX500',
    name: 'S&P 500 Index',
    assetClass: 'Indices',
    pipFactor: 10,
    pipSize: 0.1,
    contractSize: 10,
    precision: 1,
    typicalSpreadPips: 0.6,
  },
};

/**
 * Calculates Risk to Reward ratio given entry, stop loss, and target price.
 * Returns null if the price direction is invalid (e.g. SL >= Entry for BUY).
 */
export function calculateRiskReward(
  direction: 'BUY' | 'SELL',
  entry: number,
  stopLoss: number,
  takeProfit: number
): { valid: boolean; riskRewardRatio: number; stopDistance: number; targetDistance: number; error?: string } {
  if (entry <= 0 || stopLoss <= 0 || takeProfit <= 0) {
    return { valid: false, riskRewardRatio: 0, stopDistance: 0, targetDistance: 0, error: 'Prices must be greater than zero.' };
  }

  if (direction === 'BUY') {
    if (stopLoss >= entry) {
      return { valid: false, riskRewardRatio: 0, stopDistance: 0, targetDistance: 0, error: 'For a BUY setup, Stop Loss must be strictly below Entry price.' };
    }
    if (takeProfit <= entry) {
      return { valid: false, riskRewardRatio: 0, stopDistance: 0, targetDistance: 0, error: 'For a BUY setup, Take Profit must be strictly above Entry price.' };
    }
    const risk = entry - stopLoss;
    const reward = takeProfit - entry;
    const rr = Number((reward / risk).toFixed(2));
    return { valid: true, riskRewardRatio: rr, stopDistance: risk, targetDistance: reward };
  } else {
    if (stopLoss <= entry) {
      return { valid: false, riskRewardRatio: 0, stopDistance: 0, targetDistance: 0, error: 'For a SELL setup, Stop Loss must be strictly above Entry price.' };
    }
    if (takeProfit >= entry) {
      return { valid: false, riskRewardRatio: 0, stopDistance: 0, targetDistance: 0, error: 'For a SELL setup, Take Profit must be strictly below Entry price.' };
    }
    const risk = stopLoss - entry;
    const reward = entry - takeProfit;
    const rr = Number((reward / risk).toFixed(2));
    return { valid: true, riskRewardRatio: rr, stopDistance: risk, targetDistance: reward };
  }
}

/**
 * Calculate Stop Distance in pips based on instrument specification
 */
export function calculatePips(symbol: string, distancePrice: number): number {
  const spec = INSTRUMENT_SPECS[symbol] || { pipFactor: 10000 };
  return Number((Math.abs(distancePrice) * spec.pipFactor).toFixed(1));
}

/**
 * Institutional Position Size & Risk Calculator
 */
export interface PositionSizeResult {
  riskAmountUSD: number;
  stopDistancePips: number;
  lotSize: number;
  pipValueUSD: number;
  positionNotionalUSD: number;
  maxDrawdownLimitHit: boolean;
}

export function calculatePositionSize(params: {
  accountEquity: number;
  riskPercentage: number;
  symbol: string;
  entryPrice: number;
  stopLossPrice: number;
  maxRiskLimitUSD?: number;
}): PositionSizeResult {
  const { accountEquity, riskPercentage, symbol, entryPrice, stopLossPrice, maxRiskLimitUSD } = params;
  const spec = INSTRUMENT_SPECS[symbol] || INSTRUMENT_SPECS.EURUSD;

  let riskAmount = (accountEquity * riskPercentage) / 100;
  let maxDrawdownLimitHit = false;

  if (maxRiskLimitUSD && riskAmount > maxRiskLimitUSD) {
    riskAmount = maxRiskLimitUSD;
    maxDrawdownLimitHit = true;
  }

  const priceDiff = Math.abs(entryPrice - stopLossPrice);
  const stopPips = calculatePips(symbol, priceDiff);

  if (stopPips <= 0 || priceDiff <= 0) {
    return {
      riskAmountUSD: riskAmount,
      stopDistancePips: 0,
      lotSize: 0,
      pipValueUSD: 0,
      positionNotionalUSD: 0,
      maxDrawdownLimitHit,
    };
  }

  // Pip value per 1.0 standard lot
  // Forex: 1 lot = 100,000 units. For XXX/USD, 1 pip = 0.0001 * 100,000 = $10.00.
  // Gold (XAUUSD): 1 lot = 100 oz. 1 pip = 0.10 * 100 = $10.00.
  // Crypto (BTCUSD): 1 lot = 1 BTC. 1 point = $1.00.
  let pipValuePerLot = spec.pipSize * spec.contractSize;
  if (symbol === 'USDJPY') {
    // For USDJPY, pip value in USD = (0.01 / USDJPY price) * 100,000
    pipValuePerLot = (spec.pipSize / entryPrice) * spec.contractSize;
  }

  const rawLotSize = riskAmount / (stopPips * pipValuePerLot);
  // Round to standard 2 decimal places (micro-lots 0.01)
  const lotSize = Math.max(0.01, Number(rawLotSize.toFixed(2)));
  const totalPipValue = Number((lotSize * pipValuePerLot).toFixed(2));
  const positionNotional = Number((lotSize * spec.contractSize * entryPrice).toFixed(2));

  return {
    riskAmountUSD: Number(riskAmount.toFixed(2)),
    stopDistancePips: stopPips,
    lotSize,
    pipValueUSD: totalPipValue,
    positionNotionalUSD: positionNotional,
    maxDrawdownLimitHit,
  };
}

/**
 * Validates and aggregates Confidence Score factors into a normalized 0-100 score.
 */
export function aggregateConfidenceScore(breakdown: {
  trendAlignment: number; // max 20
  marketStructure: number; // max 20
  liquidityConfirmation: number; // max 20
  entryTrigger: number; // max 15
  riskReward: number; // max 15
  dataQuality: number; // max 10
}): { totalScore: number; qualityGrade: 'A+' | 'A' | 'B' | 'C' | 'Unqualified' } {
  const trend = Math.min(20, Math.max(0, breakdown.trendAlignment || 0));
  const structure = Math.min(20, Math.max(0, breakdown.marketStructure || 0));
  const liquidity = Math.min(20, Math.max(0, breakdown.liquidityConfirmation || 0));
  const trigger = Math.min(15, Math.max(0, breakdown.entryTrigger || 0));
  const rr = Math.min(15, Math.max(0, breakdown.riskReward || 0));
  const data = Math.min(10, Math.max(0, breakdown.dataQuality || 0));

  const total = Math.round(trend + structure + liquidity + trigger + rr + data);

  let qualityGrade: 'A+' | 'A' | 'B' | 'C' | 'Unqualified' = 'Unqualified';
  if (total >= 85) qualityGrade = 'A+';
  else if (total >= 75) qualityGrade = 'A';
  else if (total >= 60) qualityGrade = 'B';
  else if (total >= 45) qualityGrade = 'C';

  return { totalScore: total, qualityGrade };
}
