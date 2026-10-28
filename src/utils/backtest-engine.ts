import { INSTRUMENT_SPECS } from './trading-math.ts';

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestParams {
  symbol: string;
  strategyName: string;
  initialBalance: number;
  riskPercent: number; // e.g. 1%
  spreadPips: number; // e.g. 1.0 pips
  slippagePips: number; // e.g. 0.5 pips
  commissionPerLot: number; // e.g. $7 per standard lot roundturn
  minRiskReward: number; // e.g. 1.5
}

export interface SimulatedTrade {
  id: string;
  symbol: string;
  entryTime: string;
  exitTime: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  exitPrice: number;
  lotSize: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  returnR: number; // R-multiple return (e.g. +2.0R, -1.0R)
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  exitReason: 'TP1' | 'TP2' | 'STOP_LOSS' | 'TIME_EXIT';
}

export interface BacktestResult {
  symbol: string;
  strategyName: string;
  totalCandles: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number; // percentage (0 - 100)
  initialBalance: number;
  finalBalance: number;
  netProfit: number;
  netReturnPct: number;
  profitFactor: number;
  maxDrawdownUSD: number;
  maxDrawdownPct: number;
  averageRewardToRisk: number;
  expectancyUSD: number;
  expectancyR: number;
  trades: SimulatedTrade[];
  equityCurve: Array<{ time: string; balance: number; drawdownPct: number }>;
}

/**
 * Runs a deterministic, lookahead-free historical backtest simulation
 * on a candle series.
 */
export function runStrategyBacktest(
  candles: Candle[],
  params: BacktestParams
): BacktestResult {
  if (candles.length < 20) {
    return {
      symbol: params.symbol,
      strategyName: params.strategyName,
      totalCandles: candles.length,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      breakevenTrades: 0,
      winRate: 0,
      initialBalance: params.initialBalance,
      finalBalance: params.initialBalance,
      netProfit: 0,
      netReturnPct: 0,
      profitFactor: 0,
      maxDrawdownUSD: 0,
      maxDrawdownPct: 0,
      averageRewardToRisk: 0,
      expectancyUSD: 0,
      expectancyR: 0,
      trades: [],
      equityCurve: [{ time: candles[0]?.time || new Date().toISOString(), balance: params.initialBalance, drawdownPct: 0 }],
    };
  }

  let currentBalance = params.initialBalance;
  let peakBalance = params.initialBalance;
  let maxDrawdownUSD = 0;
  let maxDrawdownPct = 0;

  const trades: SimulatedTrade[] = [];
  const equityCurve: Array<{ time: string; balance: number; drawdownPct: number }> = [
    { time: candles[0].time, balance: currentBalance, drawdownPct: 0 },
  ];

  let grossProfits = 0;
  let grossLosses = 0;
  let inTrade: SimulatedTrade | null = null;

  // Simple Moving Averages for baseline trend & market structure (lookahead-free)
  const sma20: number[] = [];
  const sma50: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i >= 19) {
      const slice20 = candles.slice(i - 19, i + 1);
      sma20.push(slice20.reduce((acc, c) => acc + c.close, 0) / 20);
    } else {
      sma20.push(candles[i].close);
    }
    if (i >= 49) {
      const slice50 = candles.slice(i - 49, i + 1);
      sma50.push(slice50.reduce((acc, c) => acc + c.close, 0) / 50);
    } else {
      sma50.push(candles[i].close);
    }
  }

  // Iterate over candles sequentially (bar by bar)
  for (let i = 25; i < candles.length; i++) {
    const bar = candles[i];
    const prevBar = candles[i - 1];

    // If currently in a trade, evaluate against current bar's High/Low
    if (inTrade) {
      let closed = false;
      let exitPrice = inTrade.entryPrice;
      let exitReason: SimulatedTrade['exitReason'] = 'TIME_EXIT';
      let outcome: SimulatedTrade['outcome'] = 'BREAKEVEN';

      if (inTrade.direction === 'BUY') {
        // Check SL first for conservative risk evaluation
        if (bar.low <= inTrade.stopLoss) {
          exitPrice = inTrade.stopLoss - (params.slippagePips * 0.0001);
          exitReason = 'STOP_LOSS';
          outcome = 'LOSS';
          closed = true;
        } else if (bar.high >= inTrade.takeProfit2) {
          exitPrice = inTrade.takeProfit2;
          exitReason = 'TP2';
          outcome = 'WIN';
          closed = true;
        } else if (bar.high >= inTrade.takeProfit1 && i % 3 === 0) {
          exitPrice = inTrade.takeProfit1;
          exitReason = 'TP1';
          outcome = 'WIN';
          closed = true;
        }
      } else {
        // SELL
        if (bar.high >= inTrade.stopLoss) {
          exitPrice = inTrade.stopLoss + (params.slippagePips * 0.0001);
          exitReason = 'STOP_LOSS';
          outcome = 'LOSS';
          closed = true;
        } else if (bar.low <= inTrade.takeProfit2) {
          exitPrice = inTrade.takeProfit2;
          exitReason = 'TP2';
          outcome = 'WIN';
          closed = true;
        } else if (bar.low <= inTrade.takeProfit1 && i % 3 === 0) {
          exitPrice = inTrade.takeProfit1;
          exitReason = 'TP1';
          outcome = 'WIN';
        }
      }

      if (closed || i === candles.length - 1) {
        if (!closed) {
          exitPrice = bar.close;
          exitReason = 'TIME_EXIT';
          outcome = inTrade.direction === 'BUY' ? (exitPrice > inTrade.entryPrice ? 'WIN' : 'LOSS') : (exitPrice < inTrade.entryPrice ? 'WIN' : 'LOSS');
        }

        const priceDiff = inTrade.direction === 'BUY' ? (exitPrice - inTrade.entryPrice) : (inTrade.entryPrice - exitPrice);
        const riskDistance = inTrade.direction === 'BUY' ? (inTrade.entryPrice - inTrade.stopLoss) : (inTrade.stopLoss - inTrade.entryPrice);
        const rMultiple = Number((priceDiff / (riskDistance || 1)).toFixed(2));

        const spec = INSTRUMENT_SPECS[params.symbol] || INSTRUMENT_SPECS.EURUSD;
        const gross = priceDiff * spec.contractSize * inTrade.lotSize;
        const fees = params.commissionPerLot * inTrade.lotSize;
        const net = Number((gross - fees).toFixed(2));

        inTrade.exitTime = bar.time;
        inTrade.exitPrice = Number(exitPrice.toFixed(spec.precision));
        inTrade.grossPnl = Number(gross.toFixed(2));
        inTrade.fees = Number(fees.toFixed(2));
        inTrade.netPnl = net;
        inTrade.returnR = rMultiple;
        inTrade.outcome = net > 0 ? 'WIN' : net < 0 ? 'LOSS' : 'BREAKEVEN';
        inTrade.exitReason = exitReason;

        currentBalance += net;
        if (net > 0) grossProfits += net;
        else grossLosses += Math.abs(net);

        if (currentBalance > peakBalance) {
          peakBalance = currentBalance;
        }
        const ddUSD = peakBalance - currentBalance;
        const ddPct = (ddUSD / peakBalance) * 100;
        if (ddUSD > maxDrawdownUSD) maxDrawdownUSD = ddUSD;
        if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

        trades.push(inTrade);
        equityCurve.push({
          time: bar.time,
          balance: Number(currentBalance.toFixed(2)),
          drawdownPct: Number(ddPct.toFixed(2)),
        });

        inTrade = null;
      }
      continue;
    }

    // No open trade: Check for institutional entry conditions
    const isBullishTrend = prevBar.close > sma20[i - 1] && sma20[i - 1] > sma50[i - 1];
    const isBearishTrend = prevBar.close < sma20[i - 1] && sma20[i - 1] < sma50[i - 1];

    const recentHigh = Math.max(...candles.slice(i - 6, i - 1).map(c => c.high));
    const recentLow = Math.min(...candles.slice(i - 6, i - 1).map(c => c.low));

    const spec = INSTRUMENT_SPECS[params.symbol] || INSTRUMENT_SPECS.EURUSD;
    const spreadDiff = params.spreadPips * spec.pipSize;
    const slippageDiff = params.slippagePips * spec.pipSize;

    if (isBullishTrend && bar.close > recentHigh) {
      const entry = bar.close + spreadDiff;
      const sl = recentLow - slippageDiff;
      const risk = entry - sl;

      if (risk > spec.pipSize * 3) {
        const tp1 = entry + risk * 1.5;
        const tp2 = entry + risk * 2.5;
        const riskUSD = (currentBalance * params.riskPercent) / 100;
        const notionalRiskPerLot = risk * spec.contractSize;
        const lotSize = Math.max(0.01, Number((riskUSD / (notionalRiskPerLot || 1)).toFixed(2)));

        inTrade = {
          id: `T-${trades.length + 1}`,
          symbol: params.symbol,
          entryTime: bar.time,
          exitTime: '',
          direction: 'BUY',
          entryPrice: Number(entry.toFixed(spec.precision)),
          stopLoss: Number(sl.toFixed(spec.precision)),
          takeProfit1: Number(tp1.toFixed(spec.precision)),
          takeProfit2: Number(tp2.toFixed(spec.precision)),
          exitPrice: 0,
          lotSize,
          grossPnl: 0,
          fees: 0,
          netPnl: 0,
          returnR: 0,
          outcome: 'BREAKEVEN',
          exitReason: 'TIME_EXIT',
        };
      }
    } else if (isBearishTrend && bar.close < recentLow) {
      const entry = bar.close - spreadDiff;
      const sl = recentHigh + slippageDiff;
      const risk = sl - entry;

      if (risk > spec.pipSize * 3) {
        const tp1 = entry - risk * 1.5;
        const tp2 = entry - risk * 2.5;
        const riskUSD = (currentBalance * params.riskPercent) / 100;
        const notionalRiskPerLot = risk * spec.contractSize;
        const lotSize = Math.max(0.01, Number((riskUSD / (notionalRiskPerLot || 1)).toFixed(2)));

        inTrade = {
          id: `T-${trades.length + 1}`,
          symbol: params.symbol,
          entryTime: bar.time,
          exitTime: '',
          direction: 'SELL',
          entryPrice: Number(entry.toFixed(5)),
          stopLoss: Number(sl.toFixed(5)),
          takeProfit1: Number(tp1.toFixed(5)),
          takeProfit2: Number(tp2.toFixed(5)),
          exitPrice: 0,
          lotSize,
          grossPnl: 0,
          fees: 0,
          netPnl: 0,
          returnR: 0,
          outcome: 'BREAKEVEN',
          exitReason: 'TIME_EXIT',
        };
      }
    }
  }

  const winningTrades = trades.filter(t => t.outcome === 'WIN').length;
  const losingTrades = trades.filter(t => t.outcome === 'LOSS').length;
  const breakevenTrades = trades.filter(t => t.outcome === 'BREAKEVEN').length;
  const totalTrades = trades.length;

  const winRate = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;
  const profitFactor = grossLosses > 0 ? Number((grossProfits / grossLosses).toFixed(2)) : grossProfits > 0 ? 99.9 : 0;
  const netProfit = Number((currentBalance - params.initialBalance).toFixed(2));
  const netReturnPct = Number(((netProfit / params.initialBalance) * 100).toFixed(2));

  const totalR = trades.reduce((acc, t) => acc + t.returnR, 0);
  const expectancyR = totalTrades > 0 ? Number((totalR / totalTrades).toFixed(2)) : 0;
  const expectancyUSD = totalTrades > 0 ? Number((netProfit / totalTrades).toFixed(2)) : 0;

  const avgRR = totalTrades > 0
    ? Number((trades.reduce((acc, t) => acc + Math.abs((t.takeProfit1 - t.entryPrice) / ((t.entryPrice - t.stopLoss) || 1)), 0) / totalTrades).toFixed(2))
    : 0;

  return {
    symbol: params.symbol,
    strategyName: params.strategyName,
    totalCandles: candles.length,
    totalTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    winRate,
    initialBalance: params.initialBalance,
    finalBalance: Number(currentBalance.toFixed(2)),
    netProfit,
    netReturnPct,
    profitFactor,
    maxDrawdownUSD: Number(maxDrawdownUSD.toFixed(2)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    averageRewardToRisk: avgRR,
    expectancyUSD,
    expectancyR,
    trades,
    equityCurve,
  };
}
